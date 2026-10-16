// IndexedDB-Speicher der WEP-App (dünner Wrapper um `idb`).
//
// Alle WEPs liegen lokal im Browser, damit die Erfassung auch ohne Netz auf der
// Parzelle funktioniert. Die spätere Synchronisation (OneDrive) setzt darauf auf.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Wep } from '@/model'

const DB_NAME = 'wep-db'
const DB_VERSION = 1
const STORE = 'weps'

interface WepDB extends DBSchema {
  weps: {
    key: string
    value: Wep
  }
}

let dbPromise: Promise<IDBPDatabase<WepDB>> | undefined

/** Öffnet die Datenbank (einmalig) und legt den Object-Store an. */
function datenbank(): Promise<IDBPDatabase<WepDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WepDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
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

/** Speichert ein WEP (legt es an oder überschreibt es). */
export async function speichereWep(wep: Wep): Promise<void> {
  const db = await datenbank()
  await db.put(STORE, wep)
}

/** Lädt ein einzelnes WEP anhand seiner id. */
export async function ladeWep(id: string): Promise<Wep | undefined> {
  const db = await datenbank()
  return db.get(STORE, id)
}

/** Löscht ein WEP anhand seiner id. */
export async function loescheWep(id: string): Promise<void> {
  const db = await datenbank()
  await db.delete(STORE, id)
}
