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

const DB_NAME = 'wep-db'
const DB_VERSION = 2
const STORE = 'weps'
const META = 'syncMeta'

interface WepDB extends DBSchema {
  weps: {
    key: string
    value: Wep
  }
  syncMeta: {
    key: string
    value: SyncMeta
  }
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
