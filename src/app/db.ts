// IndexedDB-Speicher der WEP-App (dünner Wrapper um `idb`).
//
// Alle WEPs liegen lokal im Browser, damit die Erfassung auch ohne Netz auf der
// Parzelle funktioniert. Die Synchronisation mit OneDrive (src/sync) setzt darauf
// auf: Zu jedem WEP gibt es einen Eintrag im Store „syncMeta“, der festhält, wann
// es lokal geändert und wann es zuletzt abgeglichen wurde. Daraus ergibt sich die
// Offline-Warteschlange (alles, was seit dem letzten Abgleich geändert wurde).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Wep } from '@/model'
import type { LokaleAenderung, PapierkorbEintrag, SyncMeta } from '@/sync/types'
import type { ExportEintrag } from '@/sync/exporte'
import { metaMit, papierkorbMeta } from '@/sync/papierkorb'
import type { FotoDatei, FotoRecord } from '@/fotos/types'

const DB_NAME = 'wep-db'
const DB_VERSION = 5
const STORE = 'weps'
const META = 'syncMeta'
const EXPORTE = 'exporte'
const PAPIERKORB = 'papierkorb'
const FOTOS = 'fotos'
const FOTO_DATEN = 'fotoDaten'

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
  papierkorb: {
    key: string
    value: PapierkorbEintrag
  }
  fotos: {
    key: string
    value: FotoRecord
    indexes: { wepId: string }
  }
  fotoDaten: {
    key: string
    value: FotoDatei
  }
}

/**
 * Haken für die Android-App: Jede Speicherung reiht das WEP zusätzlich in die
 * Upload-Warteschlange des Hintergrunddienstes ein (src/android). Im Browser ungesetzt.
 */
export interface SpeicherHaken {
  nachSpeichern?(wep: Wep): Promise<void>
  /** Das WEP liegt jetzt im Papierkorb (hier gelöscht oder beim Abgleich von einem anderen Gerät). */
  nachLoeschen?(id: string, geloeschtAm: string): Promise<void>
  /** Das WEP wurde aus dem Papierkorb geholt und muss wieder hochgeladen werden. */
  nachWiederherstellen?(wep: Wep): Promise<void>
  /** Ein Foto wurde aufgenommen oder geladen und wartet auf den Upload (Android-Hintergrunddienst). */
  nachFotoSpeichern?(wepId: string, fotoId: string, blob: Blob): Promise<void>
  /** Ein Foto wurde gelöscht (oder ist hochgeladen): aus der Upload-Warteschlange nehmen. */
  nachFotoEntfernen?(wepId: string, fotoId: string): Promise<void>
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
      async upgrade(db, alteVersion, _neu, tx) {
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
        // Version 4: Papierkorb (gelöschte WEPs, 30 Tage). Die frühere Marke „auf diesem Gerät
        // gelöscht“ (Löschen wurde nicht abgeglichen) bekommt einen Löschzeitpunkt (jetzt); der
        // nächste Abgleich legt das WEP dann auch in OneDrive in den Papierkorb.
        if (!db.objectStoreNames.contains(PAPIERKORB)) {
          db.createObjectStore(PAPIERKORB, { keyPath: 'id' })
        }
        // Version 5: Fotos (Verwaltungseinträge mit Vorschau, getrennt davon die großen Dateien)
        if (!db.objectStoreNames.contains(FOTOS)) {
          db.createObjectStore(FOTOS, { keyPath: 'key' }).createIndex('wepId', 'wepId')
        }
        if (!db.objectStoreNames.contains(FOTO_DATEN)) {
          db.createObjectStore(FOTO_DATEN, { keyPath: 'key' })
        }
        if (alteVersion >= 2 && alteVersion < 4) {
          const jetzt = new Date().toISOString()
          let zeiger = await tx.objectStore(META).openCursor()
          while (zeiger) {
            if (zeiger.value.geloescht && !zeiger.value.geloeschtAm) {
              await zeiger.update({ ...zeiger.value, geloeschtAm: jetzt })
            }
            zeiger = await zeiger.continue()
          }
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
 * für den nächsten OneDrive-Abgleich vor. Liegt das WEP im Papierkorb, wird nichts
 * gespeichert (z. B. eine verzögerte Speicherung nach dem Löschen): Gelöschtes kommt nur
 * durch „Wiederherstellen“ zurück. Liefert false, wenn nicht gespeichert wurde.
 */
export async function speichereWep(wep: Wep, jetzt: string = new Date().toISOString()): Promise<boolean> {
  const db = await datenbank()
  const tx = db.transaction([STORE, META, PAPIERKORB], 'readwrite')
  if (await tx.objectStore(PAPIERKORB).get(wep.id)) {
    await tx.done
    return false
  }
  const alt = await tx.objectStore(META).get(wep.id)
  await tx.objectStore(STORE).put(wep)
  await tx.objectStore(META).put(
    metaMit(alt, wep.id, jetzt, {
      lokalGeaendertAm: jetzt,
      geloescht: false,
      geloeschtAm: undefined,
      endgueltig: undefined,
    }),
  )
  await tx.done
  // Die lokale Speicherung hat Vorrang: ein Fehler der Warteschlange wird nur gemeldet.
  await haken?.nachSpeichern?.(wep).catch((e) => console.warn('Warteschlange:', e))
  return true
}

/** Lädt ein einzelnes WEP anhand seiner id. */
export async function ladeWep(id: string): Promise<Wep | undefined> {
  const db = await datenbank()
  return db.get(STORE, id)
}

/** Alle WEPs im Papierkorb. */
export async function alleImPapierkorb(): Promise<PapierkorbEintrag[]> {
  const db = await datenbank()
  return db.getAll(PAPIERKORB)
}

/**
 * Verschiebt ein WEP in den Papierkorb (nur auf diesem Gerät; der Abgleich überträgt es nach
 * OneDrive). Das geschieht in einer Transaktion, damit keine Speicherung dazwischen verloren
 * geht. Die Regeln dazu stehen in src/sync/papierkorb.ts.
 */
export async function legeInPapierkorb(
  id: string,
  geloeschtAm: string,
  geloeschtVon: string,
): Promise<PapierkorbEintrag | undefined> {
  const db = await datenbank()
  const tx = db.transaction([STORE, META, PAPIERKORB], 'readwrite')
  const wep = await tx.objectStore(STORE).get(id)
  if (!wep) {
    await tx.done
    return undefined
  }
  const alt = await tx.objectStore(META).get(id)
  const eintrag: PapierkorbEintrag = { id, wep, geloeschtAm, geloeschtVon }
  await tx.objectStore(PAPIERKORB).put(eintrag)
  await tx.objectStore(STORE).delete(id)
  await tx.objectStore(META).put(papierkorbMeta(alt, id, geloeschtAm))
  await tx.done
  await haken?.nachLoeschen?.(id, geloeschtAm).catch((e) => console.warn('Warteschlange:', e))
  return eintrag
}

/** Schreibt zusammengehörige Änderungen (WEP, Papierkorb, Sync-Metadaten) in einer Transaktion. */
export async function schreibeLokal(a: LokaleAenderung): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([STORE, META, PAPIERKORB], 'readwrite')
  if (a.wep === null) await tx.objectStore(STORE).delete(a.id)
  else if (a.wep) await tx.objectStore(STORE).put(a.wep)
  if (a.papierkorb === null) await tx.objectStore(PAPIERKORB).delete(a.id)
  else if (a.papierkorb) await tx.objectStore(PAPIERKORB).put(a.papierkorb)
  if (a.meta === null) await tx.objectStore(META).delete(a.id)
  else if (a.meta) await tx.objectStore(META).put(a.meta)
  await tx.done
  const melde = (f: Promise<void> | undefined) => f?.catch((e) => console.warn('Warteschlange:', e))
  if (a.ereignis === 'geloescht') {
    await melde(haken?.nachLoeschen?.(a.id, a.papierkorb?.geloeschtAm ?? new Date().toISOString()))
  } else if (a.ereignis === 'wiederhergestellt' && a.wep) {
    await melde(haken?.nachWiederherstellen?.(a.wep))
  } else if (a.ereignis === 'geaendert' && a.wep) {
    await melde(haken?.nachSpeichern?.(a.wep))
  }
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

// --- Fotos --------------------------------------------------------------------

/** Alle Foto-Verwaltungseinträge (ohne die großen Dateien). */
export async function alleFotoRecords(): Promise<FotoRecord[]> {
  const db = await datenbank()
  return db.getAll(FOTOS)
}

/** Foto-Einträge eines WEP. */
export async function fotoRecordsVon(wepId: string): Promise<FotoRecord[]> {
  const db = await datenbank()
  return db.getAllFromIndex(FOTOS, 'wepId', wepId)
}

/** Die große Bilddatei auf diesem Gerät (undefined = noch nicht geladen). */
export async function ladeFotoDatei(wepId: string, fotoId: string): Promise<Blob | undefined> {
  const db = await datenbank()
  return (await db.get(FOTO_DATEN, `${wepId}/${fotoId}`))?.blob
}

/** Legt Eintrag und (falls gegeben) Datei an bzw. ersetzt sie in einer Transaktion. */
export async function speichereFoto(record: FotoRecord, blob?: Blob): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([FOTOS, FOTO_DATEN], 'readwrite')
  await tx.objectStore(FOTOS).put(record)
  if (blob) await tx.objectStore(FOTO_DATEN).put({ key: record.key, blob })
  await tx.done
  if (blob && record.hatDatei && !record.hochgeladen && !record.geloescht) {
    await haken?.nachFotoSpeichern?.(record.wepId, record.id, blob).catch((e) => console.warn('Foto-Warteschlange:', e))
  }
}

/** Ändert nur den Eintrag (z. B. „hochgeladen“). */
export async function setzeFotoRecord(record: FotoRecord): Promise<void> {
  const db = await datenbank()
  await db.put(FOTOS, record)
}

/** Entfernt Eintrag und Datei eines Fotos von diesem Gerät. */
export async function entferneFotoLokal(wepId: string, fotoId: string): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([FOTOS, FOTO_DATEN], 'readwrite')
  await tx.objectStore(FOTOS).delete(`${wepId}/${fotoId}`)
  await tx.objectStore(FOTO_DATEN).delete(`${wepId}/${fotoId}`)
  await tx.done
  await haken?.nachFotoEntfernen?.(wepId, fotoId).catch((e) => console.warn('Foto-Warteschlange:', e))
}

/** Entfernt alle Fotos eines WEP von diesem Gerät. */
export async function entferneFotosLokal(wepId: string): Promise<void> {
  for (const r of await fotoRecordsVon(wepId)) await entferneFotoLokal(wepId, r.id)
}

/** Kopiert alle Fotos eines WEP unter eine andere Nummer (Umnummerieren). Idempotent. */
export async function kopiereFotosLokal(vonId: string, nachId: string): Promise<void> {
  const db = await datenbank()
  for (const r of await fotoRecordsVon(vonId)) {
    const key = `${nachId}/${r.id}`
    if (await db.get(FOTOS, key)) continue
    const datei = await db.get(FOTO_DATEN, `${vonId}/${r.id}`)
    // In OneDrive liegt es unter der alten Nummer: unter der neuen muss es neu hochgeladen werden
    await speichereFoto({ ...r, key, wepId: nachId, hochgeladen: false }, datei?.blob)
  }
}

/**
 * Der Nutzer hat ein Foto gelöscht, das schon in OneDrive liegt: Datei und Vorschau verschwinden
 * von diesem Gerät, der Eintrag bleibt als Löschmarke, bis der Abgleich die Datei in OneDrive entfernt hat.
 */
export async function markiereFotoGeloescht(wepId: string, fotoId: string, zeit: string): Promise<void> {
  const db = await datenbank()
  const tx = db.transaction([FOTOS, FOTO_DATEN], 'readwrite')
  const alt = await tx.objectStore(FOTOS).get(`${wepId}/${fotoId}`)
  if (alt) {
    await tx.objectStore(FOTOS).put({ ...alt, geloescht: zeit, hatDatei: false, vorschau: undefined })
    await tx.objectStore(FOTO_DATEN).delete(alt.key)
  }
  await tx.done
  await haken?.nachFotoEntfernen?.(wepId, fotoId).catch((e) => console.warn('Foto-Warteschlange:', e))
}
