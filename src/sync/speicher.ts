// Anbindung der Sync-Logik an die IndexedDB der App (src/app/db.ts).
import {
  alleExporte,
  alleSyncMeta,
  alleWeps,
  entferneExport,
  legeExportAb,
  setzeSyncMeta,
  speichereWepAusSync,
} from '@/app/db'
import type { ExportSpeicher } from './exporte'
import type { LokalSpeicher } from './types'

export const syncSpeicher: LokalSpeicher = {
  alleWeps,
  alleMeta: alleSyncMeta,
  speichereAusSync: speichereWepAusSync,
  setzeMeta: setzeSyncMeta,
}

export const exportSpeicher: ExportSpeicher = {
  legeAb: legeExportAb,
  alle: alleExporte,
  entferne: entferneExport,
}
