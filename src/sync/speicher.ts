// Anbindung der Sync-Logik an die IndexedDB der App (src/app/db.ts).
import { alleSyncMeta, alleWeps, setzeSyncMeta, speichereWepAusSync } from '@/app/db'
import type { LokalSpeicher } from './types'

export const syncSpeicher: LokalSpeicher = {
  alleWeps,
  alleMeta: alleSyncMeta,
  speichereAusSync: speichereWepAusSync,
  setzeMeta: setzeSyncMeta,
}
