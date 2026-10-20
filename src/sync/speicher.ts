// Anbindung der Sync-Logik an die IndexedDB der App (src/app/db.ts).
import {
  alleExporte,
  alleImPapierkorb,
  alleSyncMeta,
  alleWeps,
  entferneExport,
  legeExportAb,
  legeInPapierkorb,
  schreibeLokal,
  setzeSyncMeta,
  speichereWep,
} from '@/app/db'
import type { ExportSpeicher } from './exporte'
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
