// v2-WEPs auf dem Server: Speichern mit Revision (optimistisch, Konflikt = 409 mit dem Stand des Servers), Papierkorb,
// Verlauf. Die Rechte stehen in src/server/rechte.ts (gemeinsam mit der App).
import { darfAnlegen, darfLesen, darfLoeschen, schreibrecht, type WepKopf, type Zustand } from '../../../src/server/rechte'
import { jetztIso, type Db } from './db'
import type { Konto } from './konten'

/** D1 erlaubt Zeilen bis 2 MB; Fotos und Bau-Excel liegen nicht im WEP. */
export const MAX_WEP_BYTES = 1_900_000

export interface WepZeile {
  id: string
  rev: number
  daten: string
  zustand: Zustand
  bau_konto: string | null
  gruen_konto: string | null
  vorgangs_nr: string
  anlage: string
  parzelle: string
  erstellt_am: string
  erstellt_von: string
  geaendert_am: string
  geaendert_von: string
  geloescht_am: string | null
}

/** Kopf eines WEP für Listen und Abgleich (ohne Inhalt). */
export interface ServerWepKopf {
  id: string
  rev: number
  zustand: Zustand
  bauKonto: string | null
  gruenKonto: string | null
  vorgangsNr: string
  anlage: string
  parzelle: string
  geaendertAm: string
  geaendertVon: string
  geloeschtAm?: string
}

export const kopfVon = (z: WepZeile): ServerWepKopf => ({
  id: z.id,
  rev: z.rev,
  zustand: z.zustand,
  bauKonto: z.bau_konto,
  gruenKonto: z.gruen_konto,
  vorgangsNr: z.vorgangs_nr,
  anlage: z.anlage,
  parzelle: z.parzelle,
  geaendertAm: z.geaendert_am,
  geaendertVon: z.geaendert_von,
  ...(z.geloescht_am ? { geloeschtAm: z.geloescht_am } : {}),
})

const rechteKopf = (z: WepZeile): WepKopf => ({ zustand: z.zustand, bauKonto: z.bau_konto, gruenKonto: z.gruen_konto, geloeschtAm: z.geloescht_am })

/** Ergebnis einer Server-Aktion: ok mit Daten oder ein HTTP-Fehler mit Begründung (und ggf. dem Serverstand). */
export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; status: number; fehler: string; stand?: { kopf: ServerWepKopf; wep: unknown } }

const fehler = (status: number, text: string, z?: WepZeile): Ergebnis<never> => ({
  ok: false,
  status,
  fehler: text,
  ...(z ? { stand: { kopf: kopfVon(z), wep: JSON.parse(z.daten) } } : {}),
})

export const ladeZeile = (db: Db, id: string) => db.prepare('SELECT * FROM weps WHERE id = ?').bind(id).first<WepZeile>()

/** Alle WEPs, die das Konto lesen darf (auch die eigenen im Papierkorb). */
export async function lesbareWeps(db: Db, konto: Konto): Promise<ServerWepKopf[]> {
  const bvSicht = konto.rollen.includes('bv') || konto.rollen.includes('admin')
  const { results } = await db
    .prepare(
      `SELECT * FROM weps WHERE bau_konto = ?1 OR gruen_konto = ?1 ${bvSicht ? "OR (geloescht_am IS NULL AND zustand IN ('beim_bv', 'rueckfrage', 'geprueft'))" : ''} ORDER BY geaendert_am DESC`,
    )
    .bind(konto.id)
    .all<WepZeile>()
  return results.filter((z) => darfLesen(rechteKopf(z), konto)).map(kopfVon)
}

export async function ladeWep(db: Db, konto: Konto, id: string): Promise<Ergebnis<{ kopf: ServerWepKopf; wep: unknown }>> {
  const z = await ladeZeile(db, id)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  return { ok: true, wert: { kopf: kopfVon(z), wep: JSON.parse(z.daten) } }
}

interface WepFormalien {
  id?: unknown
  formalien?: { vorgangsNr?: unknown; kleingartenanlage?: unknown; parzelle?: unknown }
}

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function verlauf(db: Db, eintrag: { wepId: string; kontoId: string; aktion: string; notiz?: string; vorher?: Zustand; nachher?: Zustand }, jetzt = Date.now()) {
  await db
    .prepare('INSERT INTO verlauf (wep_id, zeit, konto_id, aktion, notiz, zustand_vorher, zustand_nachher) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(eintrag.wepId, jetztIso(jetzt), eintrag.kontoId, eintrag.aktion, eintrag.notiz ?? null, eintrag.vorher ?? null, eintrag.nachher ?? null)
    .run()
}

/** „bearbeitet“ höchstens einmal je Person und Stunde, damit der Verlauf lesbar bleibt. */
async function merkeBearbeitung(db: Db, wepId: string, kontoId: string, jetzt: number) {
  const letzte = await db
    .prepare("SELECT zeit FROM verlauf WHERE wep_id = ? AND konto_id = ? AND aktion IN ('bearbeitet', 'angelegt') ORDER BY id DESC LIMIT 1")
    .bind(wepId, kontoId)
    .first<{ zeit: string }>()
  if (!letzte || Date.parse(letzte.zeit) < jetzt - 3600_000) await verlauf(db, { wepId, kontoId, aktion: 'bearbeitet' }, jetzt)
}

/**
 * Speichert ein WEP. Neu: nur mit Rolle Bau (wird Besitzer). Vorhanden: nur mit Schreibrecht und passender Revision
 * (`basisRev` = Revision, auf der die Änderung beruht); sonst 409 mit dem Stand des Servers.
 */
export async function speichereWep(db: Db, konto: Konto, id: string, eingabe: { wep?: unknown; basisRev?: unknown }, jetzt = Date.now()): Promise<Ergebnis<ServerWepKopf>> {
  const wep = eingabe.wep as WepFormalien | undefined
  if (!wep || typeof wep !== 'object' || wep.id !== id) return fehler(400, 'WEP fehlt oder passt nicht zur Adresse.')
  const daten = JSON.stringify(wep)
  if (new TextEncoder().encode(daten).length > MAX_WEP_BYTES) return fehler(413, 'Das WEP ist zu groß für den Server (Unterschriften oder Skizzen verkleinern).')
  const f = wep.formalien ?? {}
  const spalten = [text(f.vorgangsNr, 50), text(f.kleingartenanlage), text(f.parzelle, 50)]
  const zeit = jetztIso(jetzt)
  const z = await ladeZeile(db, id)

  if (!z) {
    if (!darfAnlegen(konto)) return fehler(403, 'Neue WEPs legt der Bau-Wertermittler an.')
    await db
      .prepare(
        "INSERT INTO weps (id, rev, daten, zustand, bau_konto, vorgangs_nr, anlage, parzelle, erstellt_am, erstellt_von, geaendert_am, geaendert_von) VALUES (?, 1, ?, 'bau_in_arbeit', ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, daten, konto.id, ...spalten, zeit, konto.id, zeit, konto.id)
      .run()
    await verlauf(db, { wepId: id, kontoId: konto.id, aktion: 'angelegt', nachher: 'bau_in_arbeit' }, jetzt)
    return { ok: true, wert: kopfVon((await ladeZeile(db, id))!) }
  }

  const kopf = rechteKopf(z)
  if (!darfLesen(kopf, konto)) return fehler(404, 'WEP nicht gefunden.')
  if (z.geloescht_am) return fehler(409, 'Das WEP liegt im Papierkorb.', z)
  const recht = schreibrecht(kopf, konto)
  if (!recht) return fehler(403, 'Das WEP ist für dich gerade gesperrt (nur lesen).', z)
  if (eingabe.basisRev !== z.rev) return fehler(409, 'Das WEP wurde inzwischen geändert.', z)
  const r = await db
    .prepare('UPDATE weps SET daten = ?, rev = rev + 1, vorgangs_nr = ?, anlage = ?, parzelle = ?, geaendert_am = ?, geaendert_von = ? WHERE id = ? AND rev = ?')
    .bind(daten, ...spalten, zeit, konto.id, id, z.rev)
    .run()
  // Zwischen Lesen und Schreiben hat jemand anderes gespeichert
  if (r.meta.changes !== 1) return fehler(409, 'Das WEP wurde inzwischen geändert.', (await ladeZeile(db, id)) ?? undefined)
  await merkeBearbeitung(db, id, konto.id, jetzt)
  return { ok: true, wert: kopfVon((await ladeZeile(db, id))!) }
}

/** In den Papierkorb (bleibt auf dem Server, nur nicht mehr in Bearbeitung) bzw. zurückholen. */
export async function setzePapierkorb(db: Db, konto: Konto, id: string, geloescht: boolean, basisRev: unknown, jetzt = Date.now()): Promise<Ergebnis<ServerWepKopf>> {
  const z = await ladeZeile(db, id)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  if (!darfLoeschen(rechteKopf(z), konto)) return fehler(403, 'Nur der Besitzer kann das WEP löschen, solange es bei ihm in Bearbeitung ist.', z)
  if (Boolean(z.geloescht_am) === geloescht) return { ok: true, wert: kopfVon(z) }
  if (geloescht && basisRev !== z.rev) return fehler(409, 'Das WEP wurde inzwischen geändert.', z)
  const zeit = jetztIso(jetzt)
  await db.prepare('UPDATE weps SET geloescht_am = ?, rev = rev + 1, geaendert_am = ?, geaendert_von = ? WHERE id = ?').bind(geloescht ? zeit : null, zeit, konto.id, id).run()
  await verlauf(db, { wepId: id, kontoId: konto.id, aktion: geloescht ? 'geloescht' : 'wiederhergestellt' }, jetzt)
  return { ok: true, wert: kopfVon((await ladeZeile(db, id))!) }
}

export interface VerlaufEintrag {
  zeit: string
  aktion: string
  notiz?: string
  zustandVorher?: Zustand
  zustandNachher?: Zustand
  /** Name der Person (oder „gelöschtes Konto“). */
  wer: string
}

export async function ladeVerlauf(db: Db, konto: Konto, id: string): Promise<Ergebnis<VerlaufEintrag[]>> {
  const z = await ladeZeile(db, id)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  const { results } = await db
    .prepare('SELECT v.*, k.name AS name, k.email AS email FROM verlauf v LEFT JOIN konten k ON k.id = v.konto_id WHERE v.wep_id = ? ORDER BY v.id')
    .bind(id)
    .all<{ zeit: string; aktion: string; notiz: string | null; zustand_vorher: Zustand | null; zustand_nachher: Zustand | null; name: string | null; email: string | null }>()
  return {
    ok: true,
    wert: results.map((v) => ({
      zeit: v.zeit,
      aktion: v.aktion,
      wer: v.name || v.email || 'gelöschtes Konto',
      ...(v.notiz ? { notiz: v.notiz } : {}),
      ...(v.zustand_vorher ? { zustandVorher: v.zustand_vorher } : {}),
      ...(v.zustand_nachher ? { zustandNachher: v.zustand_nachher } : {}),
    })),
  }
}
