// Speicher der BV-Kontrollseite: eine eigene IndexedDB im Browser des BV-Rechners („wep-bv“), getrennt von den WEPs der
// Wertermittler („wep-db“). Nichts geht an einen Server.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BvEingang, GelesenesWep } from './eingang'

interface BvDB extends DBSchema {
  eingaenge: { key: string; value: BvEingang }
  /** Fotos (`<Eingang>/fotos/<Foto>`) und Bau-Excel (`<Eingang>/bau.xlsx`). */
  dateien: { key: string; value: { schluessel: string; daten: Blob } }
}

const fotoSchluessel = (eingangId: string, fotoId: string) => `${eingangId}/fotos/${fotoId}`
const bauSchluessel = (eingangId: string) => `${eingangId}/bau.xlsx`

let db: Promise<IDBPDatabase<BvDB>> | undefined
function oeffne(): Promise<IDBPDatabase<BvDB>> {
  db ??= openDB<BvDB>('wep-bv', 1, {
    upgrade(d) {
      d.createObjectStore('eingaenge', { keyPath: 'id' })
      d.createObjectStore('dateien', { keyPath: 'schluessel' })
    },
  })
  return db
}

export async function alleEingaenge(): Promise<BvEingang[]> {
  return (await oeffne()).getAll('eingaenge')
}

/** Legt gelesene WEPs ab. Dieselbe Fassung noch einmal ändert nichts (Status und Notiz bleiben). */
export async function legeAb(weps: GelesenesWep[]): Promise<{ neu: BvEingang[]; schonDa: number }> {
  const d = await oeffne()
  const neu: BvEingang[] = []
  let schonDa = 0
  for (const g of weps) {
    if (await d.get('eingaenge', g.eingang.id)) {
      schonDa++
      continue
    }
    const tx = d.transaction(['eingaenge', 'dateien'], 'readwrite')
    await tx.objectStore('eingaenge').put(g.eingang)
    for (const f of g.fotos) await tx.objectStore('dateien').put({ schluessel: fotoSchluessel(g.eingang.id, f.id), daten: new Blob([f.daten as BlobPart], { type: 'image/jpeg' }) })
    if (g.bauExcel) await tx.objectStore('dateien').put({ schluessel: bauSchluessel(g.eingang.id), daten: new Blob([g.bauExcel as BlobPart]) })
    await tx.done
    neu.push(g.eingang)
  }
  return { neu, schonDa }
}

export async function aendereEingang(id: string, aenderung: Partial<Pick<BvEingang, 'status' | 'notiz' | 'gesamt'>>): Promise<BvEingang | undefined> {
  const d = await oeffne()
  const alt = await d.get('eingaenge', id)
  if (!alt) return undefined
  const neu = { ...alt, ...aenderung }
  await d.put('eingaenge', neu)
  return neu
}

export async function entferneEingang(e: BvEingang): Promise<void> {
  const d = await oeffne()
  const tx = d.transaction(['eingaenge', 'dateien'], 'readwrite')
  await tx.objectStore('eingaenge').delete(e.id)
  for (const f of e.fotoIds) await tx.objectStore('dateien').delete(fotoSchluessel(e.id, f))
  await tx.objectStore('dateien').delete(bauSchluessel(e.id))
  await tx.done
}

export async function ladeFoto(eingangId: string, fotoId: string): Promise<Blob | undefined> {
  return (await (await oeffne()).get('dateien', fotoSchluessel(eingangId, fotoId)))?.daten
}

export async function ladeBauExcel(eingangId: string): Promise<Blob | undefined> {
  return (await (await oeffne()).get('dateien', bauSchluessel(eingangId)))?.daten
}
