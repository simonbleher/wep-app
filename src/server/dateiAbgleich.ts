// Server-Modus (v2): Fotos und Bau-Excel mit dem Server (R2) abgleichen. Läuft nach dem Abgleich der WEPs.
// Reine Logik (Server und lokale Ablagen werden übergeben), getestet in dateiAbgleich.test.ts.
//
// Regeln (wie beim OneDrive-Abgleich, aber ohne Ordner-Umzüge – der Server behält die Dateien beim WEP):
// - Hochgeladen wird erst, wenn das WEP selbst auf dem Server ist, und nur, was im WEP steht.
// - „Nur WLAN“ gilt auch hier; sonst warten die Dateien und zählen in der Anzeige.
// - Ein gelöschtes Foto (bzw. eine entfernte Bau-Excel) wird auf dem Server erst entfernt, wenn das WEP ohne die
//   Datei dort angekommen ist und kein Konflikt offen ist. Steht es wieder im WEP (andere Fassung übernommen), bleibt es.
// - Gelöschte WEPs (Papierkorb) und „endgültig“ gelöschte: die Dateien bleiben auf dem Server beim WEP.
// - Darf ich das WEP nicht bearbeiten (gesperrt), wird nichts hochgeladen oder gelöscht.
import type { BauExcelSpeicher } from '@/bauexcel/types'
import type { FotoRecord } from '@/fotos/types'
import { wartetAufUpload } from '@/sync/engine'
import type { FotoSpeicher } from '@/sync/fotos'
import type { LokalSpeicher, SyncHinweis } from '@/sync/types'
import { AbgleichFehler } from './abgleich'

export const fotoName = (fotoId: string) => `foto-${fotoId}.jpg`
export const BAU_NAME = 'bau.xlsx'

export interface DateiZugriff {
  hochladen(wepId: string, name: string, datei: Blob): Promise<void>
  /** Entfernt die Datei; ist sie schon weg, passiert nichts. */
  loesche(wepId: string, name: string): Promise<void>
}

export interface DateiAbgleichErgebnis {
  hochgeladen: string[]
  geloescht: number
  aufgeschoben: number
  fehler: SyncHinweis[]
}

export async function serverDateienAbgleichen(opt: {
  server: DateiZugriff
  lokal: LokalSpeicher
  fotos: FotoSpeicher
  bau: BauExcelSpeicher
  uploadErlaubt: () => Promise<boolean>
}): Promise<DateiAbgleichErgebnis> {
  const erg: DateiAbgleichErgebnis = { hochgeladen: [], geloescht: 0, aufgeschoben: 0, fehler: [] }
  const [weps, metas, fotoRecs, bauRecs] = await Promise.all([opt.lokal.alleWeps(), opt.lokal.alleMeta(), opt.fotos.alleRecords(), opt.bau.alleRecords()])
  const metaVon = new Map(metas.map((m) => [m.id, m]))
  const fotosVon = new Map<string, FotoRecord[]>()
  for (const r of fotoRecs) fotosVon.set(r.wepId, [...(fotosVon.get(r.wepId) ?? []), r])
  const bauVon = new Map(bauRecs.map((r) => [r.wepId, r]))
  let erlaubt: boolean | undefined
  const darfHochladen = async () => (erlaubt ??= await opt.uploadErlaubt())

  for (const w of weps) {
    const m = metaVon.get(w.id)
    if (m?.serverRev === undefined) continue // WEP ist noch nicht auf dem Server
    const recs = fotosVon.get(w.id) ?? []
    const bauRec = bauVon.get(w.id)
    if (!recs.length && !bauRec) continue
    const imWep = new Set([...(w.fotos ?? []), ...(m.konflikt?.fassung?.fotos ?? [])].map((f) => f.id))
    const abgeglichen = !m.konflikt && !wartetAufUpload(m)
    try {
      // Fotos hochladen
      for (const r of recs) {
        if (!r.hatDatei || r.hochgeladen || r.geloescht || !imWep.has(r.id)) continue
        if (!(await darfHochladen())) {
          erg.aufgeschoben++
          continue
        }
        const blob = await opt.fotos.ladeDatei(w.id, r.id)
        if (!blob) {
          await opt.fotos.setzeRecord({ ...r, hatDatei: false })
          continue
        }
        await opt.server.hochladen(w.id, fotoName(r.id), blob)
        await opt.fotos.setzeRecord({ ...r, hochgeladen: true })
        erg.hochgeladen.push(`${w.id}/${r.id}`)
      }
      // Gelöschte Fotos entfernen
      for (const r of recs.filter((x) => x.geloescht)) {
        if (imWep.has(r.id)) {
          await opt.fotos.setzeRecord({ ...r, geloescht: undefined })
          continue
        }
        if (!abgeglichen) continue
        if (r.hochgeladen) {
          await opt.server.loesche(w.id, fotoName(r.id))
          erg.geloescht++
        }
        await opt.fotos.entferne(w.id, r.id)
      }
      // Bau-Excel
      if (bauRec) {
        if (bauRec.geloescht && !w.bauExcel) {
          if (abgeglichen) {
            if (bauRec.hochgeladen) {
              await opt.server.loesche(w.id, BAU_NAME)
              erg.geloescht++
            }
            await opt.bau.entferne(w.id)
          }
        } else if (bauRec.hatDatei && !bauRec.hochgeladen && !bauRec.geloescht && w.bauExcel?.version === bauRec.version) {
          if (!(await darfHochladen())) erg.aufgeschoben++
          else {
            const blob = await opt.bau.ladeDatei(w.id)
            if (!blob) await opt.bau.setzeRecord({ ...bauRec, hatDatei: false })
            else {
              await opt.server.hochladen(w.id, BAU_NAME, blob)
              await opt.bau.setzeRecord({ ...bauRec, hochgeladen: true })
              erg.hochgeladen.push(`${w.id}/${BAU_NAME}`)
            }
          }
        }
      }
    } catch (e) {
      const gesperrt = e instanceof AbgleichFehler && e.status === 403
      erg.fehler.push({ wepId: w.id, text: gesperrt ? 'Dateien: Das WEP ist gesperrt, Fotos werden nicht mehr hochgeladen.' : `Dateien: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  return erg
}
