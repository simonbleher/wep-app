// JS-Teil der Upload-Warteschlange (Android): Jede Speicherung legt die WEP-Datei in
// eine Warteschlange im App-Speicher; der native Worker (WorkManager) lädt sie nach
// OneDrive, auch bei geschlossener App. Hier liegt nur die Logik, die zur
// IndexedDB-Seite gehört:
// - einreihen: Dateiinhalt (wie ihn der Abgleich hochladen würde) + letzter bekannter eTag
// - Ergebnisse des Workers (neuer eTag) beim Start in syncMeta übernehmen
// - Einträge entfernen, die der Abgleich in der App schon erledigt hat
import type { Wep } from '@/model'
import { dateiName, verpacke, wartetAufUpload, wepIdAusName } from '@/sync/engine'
import type { SyncMeta } from '@/sync/types'
import type { WepNativePlugin } from './native'

type NativeTeil = Pick<WepNativePlugin, 'reiheEin' | 'entferne' | 'liste' | 'holeErgebnisse'>

export interface MetaSpeicher {
  alleMeta(): Promise<SyncMeta[]>
  setzeMeta(meta: SyncMeta): Promise<void>
}

export interface Warteschlange {
  /** Reiht die eben gespeicherte Fassung des WEP ein (ersetzt eine ältere Fassung). */
  einreihen(wep: Wep): Promise<void>
  /** Nimmt ein gelöschtes WEP aus der Warteschlange. */
  entfernen(wepId: string): Promise<void>
  /** Übernimmt die Upload-Ergebnisse des Workers in syncMeta; liefert die Anzahl. */
  uebernimmErgebnisse(): Promise<number>
  /** Entfernt Einträge, die nicht mehr auf Upload warten (z. B. nach einem Abgleich). */
  bereinige(): Promise<number>
}

export function erstelleWarteschlange(
  native: NativeTeil,
  meta: MetaSpeicher,
  geraet: () => string,
): Warteschlange {
  async function metaVon(id: string): Promise<SyncMeta | undefined> {
    return (await meta.alleMeta()).find((m) => m.id === id)
  }

  const q: Warteschlange = {
    async einreihen(wep) {
      // Erst Ergebnisse übernehmen, damit der eTag aktuell ist (sonst gäbe es ein 412).
      await q.uebernimmErgebnisse()
      const m = await metaVon(wep.id)
      const geaendertAm = m?.lokalGeaendertAm ?? new Date().toISOString()
      await native.reiheEin({
        name: dateiName(wep.id),
        inhalt: verpacke(wep, geaendertAm, geraet()),
        eTag: m?.remoteETag,
        geaendertAm,
      })
    },

    async entfernen(wepId) {
      await native.entferne({ name: dateiName(wepId) })
    },

    async uebernimmErgebnisse() {
      const { ergebnisse } = await native.holeErgebnisse()
      if (ergebnisse.length === 0) return 0
      const metas = new Map((await meta.alleMeta()).map((m) => [m.id, m]))
      // Älteste zuerst, damit der jüngste eTag gewinnt
      for (const e of [...ergebnisse].sort((a, b) => a.zeit.localeCompare(b.zeit))) {
        const id = wepIdAusName(e.name)
        const m = id ? metas.get(id) : undefined
        if (!id || !m || m.geloescht) continue
        // Hat die App danach selbst abgeglichen, ist deren Stand neuer.
        if (m.letzterSyncAm && m.letzterSyncAm > e.zeit) continue
        const neu: SyncMeta = {
          ...m,
          remoteETag: e.eTag,
          letzterSyncAm: m.letzterSyncAm && m.letzterSyncAm > e.geaendertAm ? m.letzterSyncAm : e.geaendertAm,
        }
        await meta.setzeMeta(neu)
        metas.set(id, neu)
      }
      return ergebnisse.length
    },

    async bereinige() {
      const { eintraege } = await native.liste()
      if (eintraege.length === 0) return 0
      const metas = new Map((await meta.alleMeta()).map((m) => [m.id, m]))
      let n = 0
      for (const e of eintraege) {
        const id = wepIdAusName(e.name)
        const m = id ? metas.get(id) : undefined
        if (!m || m.geloescht || !wartetAufUpload(m)) {
          await native.entferne({ name: e.name })
          n++
        }
      }
      return n
    },
  }
  return q
}
