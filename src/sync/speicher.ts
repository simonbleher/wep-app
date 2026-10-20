// Anbindung der Sync-Logik an die IndexedDB der App (src/app/db.ts).
import {
  alleExporte,
  alleImPapierkorb,
  alleSyncMeta,
  alleFotoRecords,
  alleWeps,
  entferneFotoLokal,
  ladeFotoDatei,
  setzeFotoRecord,
  entferneExport,
  legeExportAb,
  legeInPapierkorb,
  schreibeLokal,
  setzeSyncMeta,
  speichereWep,
} from '@/app/db'
import type { ExportSpeicher } from './exporte'
import type { AufraeumListe, FotoSpeicher } from './fotos'
import type { LokalSpeicher } from './types'

export const syncSpeicher: LokalSpeicher = {
  alleWeps,
  alleMeta: alleSyncMeta,
  setzeMeta: setzeSyncMeta,
  alleImPapierkorb,
  schreibe: schreibeLokal,
  legeInPapierkorb,
  speichereWep,
}

export const exportSpeicher: ExportSpeicher = {
  legeAb: legeExportAb,
  alle: alleExporte,
  entferne: entferneExport,
}

export const fotoSpeicher: FotoSpeicher = {
  alleRecords: alleFotoRecords,
  ladeDatei: ladeFotoDatei,
  setzeRecord: setzeFotoRecord,
  entferne: entferneFotoLokal,
}

const AUFRAEUMEN_KEY = 'wep-fotos-aufraeumen'

/** Merkliste für endgültig gelöschte WEPs (localStorage; fehlt der Speicher, bleibt sie leer). */
export const fotoAufraeumListe: AufraeumListe = {
  lade() {
    try {
      const roh = localStorage.getItem(AUFRAEUMEN_KEY)
      return roh ? (JSON.parse(roh) as string[]) : []
    } catch {
      return []
    }
  },
  speichere(ids) {
    try {
      if (ids.length) localStorage.setItem(AUFRAEUMEN_KEY, JSON.stringify(ids))
      else localStorage.removeItem(AUFRAEUMEN_KEY)
    } catch {
      /* nur Komfort: im schlimmsten Fall bleiben Fotos in OneDrive liegen */
    }
  },
}
