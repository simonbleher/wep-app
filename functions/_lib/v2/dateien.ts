// v2-Dateien eines WEP in R2 (Bindung WEP_DATEIEN, Jurisdiktion EU): Fotos und Bau-Excel. Abruf nur über die Functions
// mit derselben Rechteprüfung wie das WEP – öffentliche R2-Adressen gibt es nicht.
//   weps/<id>/fotos/<Foto-Id>.jpg   Foto (Name in der Schnittstelle: foto-<Foto-Id>.jpg)
//   weps/<id>/bau.xlsx              Bau-Excel (immer die aktuelle Fassung)
import { darfLesen, schreibrecht, type WepKopf } from '../../../src/server/rechte'
import type { Db } from './db'
import type { Konto } from './konten'
import { ladeZeile, type WepZeile } from './weps'

/** Teil der R2-Schnittstelle, den v2 nutzt (in Tests ein Speicher im Arbeitsspeicher). */
export interface R2Ablage {
  get(key: string): Promise<{ body: ReadableStream | null; size: number; httpMetadata?: { contentType?: string } } | null>
  put(key: string, wert: ArrayBuffer, opt?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  delete(key: string): Promise<void>
  list(opt: { prefix: string; cursor?: string }): Promise<{ objects: { key: string; size: number; uploaded: Date }[]; truncated: boolean; cursor?: string }>
}

export const FOTO_MAX_BYTES = 15 * 1024 * 1024
export const BAU_MAX_BYTES = 10 * 1024 * 1024
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface DateiArt {
  art: 'foto' | 'bau'
  key: string
  typ: string
  max: number
}

/** Erlaubte Dateinamen: foto-<Id>.jpg und bau.xlsx – sonst undefined (kein beliebiger Pfad in R2). */
export function dateiArt(wepId: string, name: string): DateiArt | undefined {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(wepId)) return undefined
  const foto = /^foto-([A-Za-z0-9_-]{1,64})\.jpg$/.exec(name)
  if (foto) return { art: 'foto', key: `weps/${wepId}/fotos/${foto[1]}.jpg`, typ: 'image/jpeg', max: FOTO_MAX_BYTES }
  if (name === 'bau.xlsx') return { art: 'bau', key: `weps/${wepId}/bau.xlsx`, typ: XLSX, max: BAU_MAX_BYTES }
  return undefined
}

const kopf = (z: WepZeile): WepKopf => ({ zustand: z.zustand, bauKonto: z.bau_konto, gruenKonto: z.gruen_konto, geloeschtAm: z.geloescht_am })

export type DateiErgebnis<T> = { ok: true; wert: T } | { ok: false; status: number; fehler: string }

/** Prüft Zugriff auf das WEP: lesen (für Abruf/Liste) oder schreiben (für Hochladen/Löschen). */
export async function pruefeZugriff(db: Db, konto: Konto, wepId: string, schreiben: false | DateiArt): Promise<DateiErgebnis<WepZeile>> {
  const z = await ladeZeile(db, wepId)
  if (!z || !darfLesen(kopf(z), konto)) return { ok: false, status: 404, fehler: 'WEP nicht gefunden.' }
  if (schreiben) {
    const recht = schreibrecht(kopf(z), konto)
    // Grün darf (ab Paket 3) nur Fotos zum Grün-Teil hochladen, die Bau-Excel gehört zum Bau-Teil
    if (!recht || (recht === 'gruen' && schreiben.art !== 'foto')) return { ok: false, status: 403, fehler: 'Das WEP ist für dich gerade gesperrt (nur lesen).' }
  }
  return { ok: true, wert: z }
}

/** Dateinamen eines WEP in der Schnittstelle (foto-<Id>.jpg, bau.xlsx). */
export async function listeDateien(r2: R2Ablage, wepId: string): Promise<{ name: string; groesse: number; geaendertAm: string }[]> {
  const praefix = `weps/${wepId}/`
  const namen: { name: string; groesse: number; geaendertAm: string }[] = []
  let cursor: string | undefined
  do {
    const seite = await r2.list({ prefix: praefix, cursor })
    for (const o of seite.objects) {
      const rest = o.key.slice(praefix.length)
      const name = rest === 'bau.xlsx' ? rest : /^fotos\/([A-Za-z0-9_-]{1,64})\.jpg$/.exec(rest)?.[1]
      if (name) namen.push({ name: name === 'bau.xlsx' ? name : `foto-${name}.jpg`, groesse: o.size, geaendertAm: o.uploaded.toISOString() })
    }
    cursor = seite.truncated ? seite.cursor : undefined
  } while (cursor)
  return namen
}
