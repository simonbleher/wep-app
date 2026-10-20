// Foto-Teil der Upload-Warteschlange (Android, Beta 3 Paket 4). Die Fotos selbst liegen im App-Speicher
// des nativen Teils (foto-queue/); der WorkManager-Worker lädt sie nach OneDrive, auch bei geschlossener
// App und nur im WLAN, wenn „nur WLAN“ gilt (dieselbe Netz-Bedingung wie für die WEP-Dateien).
//
// Regeln wie bei den WEP-Dateien (Paket 2):
// - Fotos eines WEP im Papierkorb werden nie nach daten/fotos/ hochgeladen (Sperre je WEP).
// - Gelöschte oder schon hochgeladene Fotos fliegen aus der Warteschlange.
// - Ein Foto wird erst eingereiht, wenn das WEP lebt und nicht gerade erst wiederhergestellt wurde.
import type { FotoSpeicher } from '@/sync/fotos'
import type { LokalSpeicher } from '@/sync/types'
import type { WepNativePlugin } from './native'

type NativeTeil = Pick<WepNativePlugin, 'reiheFotoEin' | 'entferneFoto' | 'sperreFotos' | 'listeFotos' | 'holeFotoErgebnisse'>

export interface FotoWarteschlange {
  /** Reiht ein eben gespeichertes Foto ein (wenn sein WEP lebt). */
  einreihen(wepId: string, fotoId: string, blob: Blob): Promise<void>
  entfernen(wepId: string, fotoId: string): Promise<void>
  /** Das WEP liegt im Papierkorb: Fotos nicht mehr hochladen. */
  sperren(wepId: string): Promise<void>
  /** Übernimmt die Upload-Ergebnisse des Workers („hochgeladen“); liefert die Anzahl. */
  uebernimmErgebnisse(): Promise<number>
  /** Gleicht die native Warteschlange mit dem lokalen Stand ab. */
  abstimmen(): Promise<{ eingereiht: number; entfernt: number; gesperrt: number }>
}

export async function blobZuBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

export function erstelleFotoWarteschlange(
  native: NativeTeil,
  fotos: FotoSpeicher,
  lokal: Pick<LokalSpeicher, 'alleWeps' | 'alleImPapierkorb' | 'alleMeta'>,
): FotoWarteschlange {
  /** WEPs, deren Fotos hochgeladen werden dürfen: lebend und nicht „gerade wiederhergestellt“. */
  async function erlaubteWeps(): Promise<Set<string>> {
    const [weps, metas] = await Promise.all([lokal.alleWeps(), lokal.alleMeta()])
    const sperre = new Set(metas.filter((m) => m.geloescht || m.endgueltig || m.wiederhergestellt).map((m) => m.id))
    return new Set(weps.filter((w) => !sperre.has(w.id)).map((w) => w.id))
  }

  const q: FotoWarteschlange = {
    async einreihen(wepId, fotoId, blob) {
      if (!(await erlaubteWeps()).has(wepId)) return
      await native.sperreFotos({ wepId, gesperrt: false })
      await native.reiheFotoEin({ wepId, fotoId, base64: await blobZuBase64(blob) })
    },

    async entfernen(wepId, fotoId) {
      await native.entferneFoto({ wepId, fotoId })
    },

    async sperren(wepId) {
      await native.sperreFotos({ wepId, gesperrt: true })
    },

    async uebernimmErgebnisse() {
      const { ergebnisse } = await native.holeFotoErgebnisse()
      if (ergebnisse.length === 0) return 0
      const records = new Map((await fotos.alleRecords()).map((r) => [r.key, r]))
      for (const e of ergebnisse) {
        const r = records.get(`${e.wepId}/${e.fotoId}`)
        if (r && !r.geloescht && !r.hochgeladen) await fotos.setzeRecord({ ...r, hochgeladen: true })
      }
      return ergebnisse.length
    },

    async abstimmen() {
      const erg = { eingereiht: 0, entfernt: 0, gesperrt: 0 }
      const [{ eintraege }, records, erlaubt, korb] = await Promise.all([
        native.listeFotos(),
        fotos.alleRecords(),
        erlaubteWeps(),
        lokal.alleImPapierkorb(),
      ])
      const nachKey = new Map(records.map((r) => [r.key, r]))
      const inQueue = new Set(eintraege.map((e) => `${e.wepId}/${e.fotoId}`))

      // Papierkorb: Fotos dieser WEPs nie hochladen
      for (const wepId of new Set(korb.map((e) => e.id))) {
        if (records.some((r) => r.wepId === wepId)) {
          await native.sperreFotos({ wepId, gesperrt: true })
          erg.gesperrt++
        }
      }
      // Erledigtes, Gelöschtes und Gesperrtes raus
      for (const e of eintraege) {
        const r = nachKey.get(`${e.wepId}/${e.fotoId}`)
        if (!r || r.hochgeladen || r.geloescht || !r.hatDatei || !erlaubt.has(e.wepId)) {
          await native.entferneFoto({ wepId: e.wepId, fotoId: e.fotoId })
          inQueue.delete(`${e.wepId}/${e.fotoId}`)
          erg.entfernt++
        }
      }
      // Offenes einreihen (z. B. nach einer Wiederherstellung oder wenn der Start unterbrochen wurde)
      const freigegeben = new Set<string>()
      for (const r of records) {
        if (!erlaubt.has(r.wepId) || !r.hatDatei || r.hochgeladen || r.geloescht || inQueue.has(r.key)) continue
        const blob = await fotos.ladeDatei(r.wepId, r.id)
        if (!blob) continue
        if (!freigegeben.has(r.wepId)) {
          await native.sperreFotos({ wepId: r.wepId, gesperrt: false })
          freigegeben.add(r.wepId)
        }
        await native.reiheFotoEin({ wepId: r.wepId, fotoId: r.id, base64: await blobZuBase64(blob) })
        erg.eingereiht++
      }
      return erg
    },
  }
  return q
}
