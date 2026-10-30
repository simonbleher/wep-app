// v2-Dateien eines WEP in R2 (Bindung WEP_DATEIEN, Jurisdiktion EU): Fotos und Bau-Excel. Abruf nur über die Functions
// mit derselben Rechteprüfung wie das WEP – öffentliche R2-Adressen gibt es nicht.
//   weps/<id>/fotos/<Foto-Id>.jpg   Foto (Name in der Schnittstelle: foto-<Foto-Id>.jpg)
//   weps/<id>/bau.xlsx              Bau-Excel (immer die aktuelle Fassung)
import type { Wep } from '../../../src/model/types'
import { darfLesen, schreibrecht } from '../../../src/server/rechte'
import { fotoTeil } from '../../../src/server/teile'
import type { Db } from './db'
import type { Konto } from './konten'
import { ladeZeile, rechteKopf, type WepZeile } from './weps'

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
  /** Foto-Id (nur bei Fotos). */
  fotoId?: string
  key: string
  typ: string
  max: number
}

/** Erlaubte Dateinamen: foto-<Id>.jpg und bau.xlsx – sonst undefined (kein beliebiger Pfad in R2). */
export function dateiArt(wepId: string, name: string): DateiArt | undefined {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(wepId)) return undefined
  const foto = /^foto-([A-Za-z0-9_-]{1,64})\.jpg$/.exec(name)
  if (foto) return { art: 'foto', fotoId: foto[1], key:`weps/${wepId}/fotos/${foto[1]}.jpg`, typ: 'image/jpeg', max: FOTO_MAX_BYTES }
  if (name === 'bau.xlsx') return { art: 'bau', key: `weps/${wepId}/bau.xlsx`, typ: XLSX, max: BAU_MAX_BYTES }
  return undefined
}

export type DateiErgebnis<T> = { ok: true; wert: T; nurNeu?: boolean } | { ok: false; status: number; fehler: string }

/** Prüft Zugriff auf das WEP: lesen (für Abruf/Liste) oder schreiben (für Hochladen/Löschen). */
export async function pruefeZugriff(db: Db, konto: Konto, wepId: string, schreiben: false | DateiArt): Promise<DateiErgebnis<WepZeile>> {
  const z = await ladeZeile(db, wepId)
  if (!z || !darfLesen(rechteKopf(z), konto)) return { ok: false, status: 404, fehler: 'WEP nicht gefunden.' }
  if (schreiben) {
    const recht = schreibrecht(rechteKopf(z), konto)
    // Grün darf (ab Paket 3) nur Fotos hochladen – auch im eigenen Grün-WEP; die Bau-Excel gehört zum Bau-Teil
    if (!recht || ((recht === 'gruen' || recht === 'ohne_bau') && schreiben.art !== 'foto')) return { ok: false, status: 403, fehler: 'Das WEP ist für dich gerade gesperrt (nur lesen).' }
    // Sind beide beteiligt, ändert jeder nur die Bilddateien seines Teils (wie beim Speichern des WEP): Grün kein Foto des
    // Bau-Teils, Bau kein Foto an einer Grün-Position. Für Fotos des anderen Teils darf nur eine noch fehlende Datei
    // hochgeladen werden (`nurNeu`) – z. B. ein neues Foto ohne Position, das Grün hinzugefügt hat und das mit dem
    // Speichern zum Bau-Teil zählt. Überschreiben und Löschen nicht.
    if ((recht === 'gruen' || recht === 'bau') && schreiben.fotoId) {
      const teil = fotoTeil(JSON.parse(z.daten) as Wep, schreiben.fotoId)
      if (teil && teil !== recht) return { ok: true, wert: z, nurNeu: true }
    }
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

/**
 * Kopiert Fotodateien von einem WEP zum anderen (Zusammenführen: eigenes Grün-WEP → Bau-WEP). Was beim Ziel schon liegt
 * oder beim Quell-WEP fehlt, wird übersprungen (die App lädt es dann selbst hoch). Liefert die Anzahl kopierter Dateien.
 */
export async function kopiereFotos(r2: R2Ablage, vonWep: string, nachWep: string, fotoIds: string[]): Promise<number> {
  let kopiert = 0
  for (const id of fotoIds) {
    const von = dateiArt(vonWep, `foto-${id}.jpg`)
    const nach = dateiArt(nachWep, `foto-${id}.jpg`)
    if (!von || !nach || (await r2.get(nach.key))) continue
    const quelle = await r2.get(von.key)
    if (!quelle?.body) continue
    await r2.put(nach.key, await new Response(quelle.body).arrayBuffer(), { httpMetadata: { contentType: nach.typ } })
    kopiert++
  }
  return kopiert
}

/** Alle Schlüssel in R2 unter `weps/<id>/`. */
async function schluesselVon(r2: R2Ablage, wepId: string): Promise<string[]> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(wepId)) return []
  const schluessel: string[] = []
  let cursor: string | undefined
  do {
    const seite = await r2.list({ prefix: `weps/${wepId}/`, cursor })
    schluessel.push(...seite.objects.map((o) => o.key))
    cursor = seite.truncated ? seite.cursor : undefined
  } while (cursor)
  return schluessel
}

/** Löscht alle Dateien eines WEP in R2. Liefert die Anzahl. */
export async function loescheAlleDateien(r2: R2Ablage, wepId: string): Promise<number> {
  const schluessel = await schluesselVon(r2, wepId)
  for (const k of schluessel) await r2.delete(k)
  return schluessel.length
}

/**
 * Löscht Dateien in R2, die im WEP nicht (mehr) stehen: Fotos ohne Eintrag in `fotos` (z. B. beim Zusammenführen
 * ersetzte oder nach „Rückgängig“ übrig gebliebene Kopien) und die Bau-Excel, wenn das WEP keine mehr hat.
 */
export async function loescheVerwaisteDateien(r2: R2Ablage, wep: { id: string; fotos?: { id: string }[]; bauExcel?: unknown }): Promise<number> {
  const fotos = new Set((wep.fotos ?? []).map((f) => f.id))
  let geloescht = 0
  for (const k of await schluesselVon(r2, wep.id)) {
    const rest = k.slice(`weps/${wep.id}/`.length)
    const foto = /^fotos\/([A-Za-z0-9_-]{1,64})\.jpg$/.exec(rest)?.[1]
    const verwaist = foto ? !fotos.has(foto) : rest === 'bau.xlsx' ? !wep.bauExcel : false
    if (!verwaist) continue
    await r2.delete(k)
    geloescht++
  }
  return geloescht
}
