// Lokale Foto-Ablage mit allem, was die Oberfläche braucht (IndexedDB oder, in Tests, im Speicher).
import {
  alleFotoRecords,
  entferneFotoLokal,
  fotoRecordsVon,
  ladeFotoDatei,
  markiereFotoGeloescht,
  setzeFotoRecord,
  speichereFoto,
} from '@/app/db'
import type { FotoSpeicher } from '@/sync/fotos'
import type { FotoRecord } from './types'

export interface FotoAblage extends FotoSpeicher {
  recordsVon(wepId: string): Promise<FotoRecord[]>
  /** Legt Eintrag (und Datei) an bzw. ersetzt sie. */
  speichere(record: FotoRecord, blob?: Blob): Promise<void>
  /** Löschmarke setzen, Datei und Vorschau von diesem Gerät entfernen. */
  markiereGeloescht(wepId: string, fotoId: string, zeit: string): Promise<void>
}

export const dbAblage: FotoAblage = {
  alleRecords: alleFotoRecords,
  recordsVon: fotoRecordsVon,
  ladeDatei: ladeFotoDatei,
  setzeRecord: setzeFotoRecord,
  entferne: entferneFotoLokal,
  speichere: speichereFoto,
  markiereGeloescht: markiereFotoGeloescht,
}
