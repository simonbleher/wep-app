// IndexedDB-Speicher der WEP-App (dünner Wrapper um `idb`).
//
// Alle WEPs liegen lokal im Browser, damit die Erfassung auch ohne Netz auf der
// Parzelle funktioniert. Die Synchronisation mit OneDrive (src/sync) setzt darauf
// auf: Zu jedem WEP gibt es einen Eintrag im Store „syncMeta“, der festhält, wann
// es lokal geändert und wann es zuletzt abgeglichen wurde. Daraus ergibt sich die
// Offline-Warteschlange (alles, was seit dem letzten Abgleich geändert wurde).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Wep } from '@/model'
import type { SyncMeta } from '@/sync/types'
import type { ExportEintrag } from '@/sync/exporte'

const DB_NAME = 'wep-db'
const DB_VERSION = 3
const STORE = 'weps'
const META = 'syncMeta'
const EXPORTE = 'exporte'

interface WepDB extends DBSchema {
  weps: {
    key: string
    value: Wep
  }
  syncMeta: {
    key: string
    value: SyncMeta
  }
  exporte: {
    key: string
    value: ExportEintrag
  }
}

/**
 * Haken für die Android-App: Jede Speicherung reiht das WEP zusätzlich in die
 * Upload-Warteschlange des Hintergrunddienstes ein (src/android). Im Browser ungesetzt.
 */
export interface SpeicherHaken {
  nachSpeichern?(wep: Wep): Promise<void>
  nachLoeschen?(id: string): Promise<void>
}
let haken: SpeicherHaken | undefined
export function setzeSpeicherHaken(h: SpeicherHaken | undefined): void {
  haken = h
}

let dbPromise: Promise<IDBPDatabase<WepDB>> | undefined

/** Öffnet die Datenbank (einmalig) und legt die Object-Stores an. */
function datenbank(): Promise<IDBPDatabase<WepDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WepDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
        // Version 2: Sync-Metadaten (OneDrive)
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'id' })
        }
        // Version 3: Excel-Exporte, die noch nach OneDrive hochgeladen werden müssen
        if (!db.objectStoreNames.contains(EXPORTE)) {
          db.createObjectStore(EXPORTE, { keyPath: 'name' })
        }
      },
    })
  }
  return dbPromise
}

/** Liefert alle gespeicherten WEPs. */
export async function alleWeps(): Promise<Wep[]> {
  const db = await datenbank()
  return db.getAll(STORE)
}

/**
 * Speichert ein WEP (legt es an oder überschreibt es) und merkt die Änderung
 * für den nächsten OneDrive-Abgleich vor.
 */
export async function speichereWep(wep: Wep): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([STORE, META], 'readwrite')
  const alt = await tx.objectStore(META).get(wep.id)
  await tx.objectStore(STORE).put(wep)
  await tx.objectStore(META).put({
    ...alt,
    id: wep.id,
    lokalGeaendertAm: new Date().toISOString(),
    geloescht: false,
  })
  await tx.done
  // Die lokale Speicherung hat Vorrang: ein Fehler der Warteschlange wird nur gemeldet.
  await haken?.nachSpeichern?.(wep).catch((e) => console.warn('Warteschlange:', e))
}

/** Lädt ein einzelnes WEP anhand seiner id. */
export async function ladeWep(id: string): Promise<Wep | undefined> {
  const db = await datenbank()
  return db.get(STORE, id)
}

/**
 * Löscht ein WEP anhand seiner id – nur auf diesem Gerät. Löschen wird in der
 * Beta nicht mit OneDrive abgeglichen: Die Datei dort bleibt erhalten, wird auf
 * diesem Gerät aber nicht wieder heruntergeladen (Marke „geloescht“).
 */
export async function loescheWep(id: string): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([STORE, META], 'readwrite')
  const alt = await tx.objectStore(META).get(id)
  await tx.objectStore(STORE).delete(id)
  await tx.objectStore(META).put({
    ...alt,
    id,
    lokalGeaendertAm: alt?.lokalGeaendertAm ?? new Date().toISOString(),
    geloescht: true,
  })
  await tx.done
  await haken?.nachLoeschen?.(id).catch((e) => console.warn('Warteschlange:', e))
}

// --- Schnittstelle für src/sync -------------------------------------------

/** Alle Sync-Metadaten. */
export async function alleSyncMeta(): Promise<SyncMeta[]> {
  const db = await datenbank()
  return db.getAll(META)
}

/** Setzt die Sync-Metadaten eines WEP. */
export async function setzeSyncMeta(meta: SyncMeta): Promise<void> {
  const db = await datenbank()
  await db.put(META, meta)
}

/** Speichert ein aus OneDrive geladenes WEP samt Metadaten (ohne neue Änderungsmarke). */
export async function speichereWepAusSync(wep: Wep, meta: SyncMeta): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([STORE, META], 'readwrite')
  await tx.objectStore(STORE).put(wep)
  await tx.objectStore(META).put(meta)
  await tx.done
}

// --- Warteschlange für Excel-Exporte ----------------------------------------

export async function legeExportAb(eintrag: ExportEintrag): Promise<void> {
  const db = await datenbank()
  await db.put(EXPORTE, eintrag)
}

export async function alleExporte(): Promise<ExportEintrag[]> {
  const db = await datenbank()
  return db.getAll(EXPORTE)
}

export async function entferneExport(name: string): Promise<void> {
  const db = await datenbank()
  await db.delete(EXPORTE, name)
}
