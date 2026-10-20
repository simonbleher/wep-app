// Anbindung der Sync-Logik an die IndexedDB der App (src/app/db.ts).
import {
  alleBauExcelRecords,
  alleExporte,
  alleImPapierkorb,
  alleSyncMeta,
  alleFotoRecords,
  alleWeps,
  entferneBauExcelLokal,
  entferneFotoLokal,
  ladeBauExcelDatei,
  ladeFotoDatei,
  markiereBauExcelGeloescht,
  setzeBauExcelRecord,
  setzeFotoRecord,
  speichereBauExcel,
  entferneExport,
  legeExportAb,
  legeInPapierkorb,
  schreibeLokal,
  setzeSyncMeta,
  speichereWep,
} from '@/app/db'
import type { BauExcelSpeicher } from '@/bauexcel/types'
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

export const bauSpeicher: BauExcelSpeicher = {
  alleRecords: alleBauExcelRecords,
  ladeDatei: ladeBauExcelDatei,
  setzeRecord: setzeBauExcelRecord,
  speichere: speichereBauExcel,
  entferne: entferneBauExcelLokal,
  markiereGeloescht: markiereBauExcelGeloescht,
}

/** Merkliste für endgültig gelöschte WEPs (localStorage; fehlt der Speicher, bleibt sie leer). */
function aufraeumListe(key: string): AufraeumListe {
  return {
    lade() {
      try {
        const roh = localStorage.getItem(key)
        return roh ? (JSON.parse(roh) as string[]) : []
      } catch {
        return []
      }
    },
    speichere(ids) {
      try {
        if (ids.length) localStorage.setItem(key, JSON.stringify(ids))
        else localStorage.removeItem(key)
      } catch {
        /* nur Komfort: im schlimmsten Fall bleiben Dateien in OneDrive liegen */
      }
    },
  }
}

export const fotoAufraeumListe = aufraeumListe('wep-fotos-aufraeumen')
export const bauAufraeumListe = aufraeumListe('wep-bau-aufraeumen')
