// v2-WEPs auf dem Server: Speichern mit Revision (optimistisch, Konflikt = 409 mit dem Stand des Servers), jeder nur in
// seinem Teil (Bau/Grün), Ablauf Bau → Grün → BV, Papierkorb, Verlauf. Rechte und Ablauf stehen in src/server/rechte.ts,
// das Zusammenführen der Teile in src/server/teile.ts (beides gemeinsam mit der App).
import type { Wep, WepAblauf } from '../../../src/model/types'
import {
  AKTION_TEXT,
  darfLesen,
  darfLoeschen,
  darfZusammenfuehrungZuruecknehmen,
  neuerKopf,
  pruefeZusammenfuehren,
  schreibrecht,
  wendeAn,
  type AblaufAktion,
  type WepKopf,
  type Zustand,
} from '../../../src/server/rechte'
import { BAU_FORMALIEN, mitEigenemTeil, ohneServerFelder, zusammenfuehrungAufServer } from '../../../src/server/teile'
import { wepFormFehler } from './form'
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
  rueckfrage_an: 'bau' | 'gruen' | 'beide' | null
  rueckfrage_bei: 'bau' | 'gruen' | null
  rueckfrage_notiz: string | null
  rueckfrage_am: string | null
  rueckfrage_von: string | null
  zusammengefuehrt_in: string | null
  zusammengefuehrt_aus: string | null
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
  /** Der Server hat beim Speichern nur den eigenen Teil übernommen – die App soll den Stand neu laden. */
  zusammengefuehrt?: boolean
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

export const rechteKopf = (z: WepZeile): WepKopf => ({
  zustand: z.zustand,
  bauKonto: z.bau_konto,
  gruenKonto: z.gruen_konto,
  geloeschtAm: z.geloescht_am,
  rueckfrageAn: z.rueckfrage_an,
  rueckfrageBei: z.rueckfrage_bei,
  zusammengefuehrtIn: z.zusammengefuehrt_in,
  zusammengefuehrtAus: z.zusammengefuehrt_aus,
})

/**
 * Tagesgrenzen je Konto (Fund M6): so viele neue WEPs bzw. Abgaben an den BV in 24 Stunden. Großzügig für die Arbeit
 * auf der Parzelle, aber kein Massen-Anlegen und keine Mail-Flut an alle BV-Konten.
 */
export const TAGESGRENZEN = { angelegt: 50, an_bv: 20 } as const

/** Wie oft hat das Konto diese Aktion in den letzten 24 Stunden im Verlauf? */
async function heuteSchon(db: Db, kontoId: string, aktion: keyof typeof TAGESGRENZEN, jetzt: number): Promise<number> {
  const z = await db
    .prepare('SELECT count(*) AS n FROM verlauf WHERE konto_id = ? AND aktion = ? AND zeit > ?')
    .bind(kontoId, aktion, jetztIso(jetzt - 86_400_000))
    .first<{ n: number }>()
  return z?.n ?? 0
}

/** Anzeige für ein Konto ohne Namen (statt der E-Mail-Adresse). */
export const OHNE_NAMEN = 'Konto ohne Namen'

async function namen(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const liste = [...new Set(ids.filter((i): i is string => Boolean(i)))]
  if (!liste.length) return new Map()
  const { results } = await db
    .prepare(`SELECT id, name FROM konten WHERE id IN (${liste.map(() => '?').join(',')})`)
    .bind(...liste)
    .all<{ id: string; name: string }>()
  // Nur der Name, nie die Adresse (Fund N11)
  return new Map(results.map((k) => [k.id, k.name || OHNE_NAMEN]))
}

/** Ablauf, wie ihn die App im WEP sieht (Zustand, Beteiligte mit Namen, offene Rückfrage). */
async function ablaufVon(db: Db, z: WepZeile): Promise<WepAblauf> {
  const n = await namen(db, [z.bau_konto, z.gruen_konto, z.rueckfrage_von])
  const person = (id: string | null) => (id ? { id, name: n.get(id) ?? 'gelöschtes Konto' } : undefined)
  const bau = person(z.bau_konto)
  const gruen = person(z.gruen_konto)
  const zf = z.zusammengefuehrt_aus
    ? await db
        .prepare('SELECT w.vorgangs_nr AS nr, f.am AS am FROM zusammenfuehrungen f LEFT JOIN weps w ON w.id = f.gruen_id WHERE f.bau_id = ?')
        .bind(z.id)
        .first<{ nr: string | null; am: string }>()
    : null
  return {
    zustand: z.zustand,
    ...(bau ? { bau } : {}),
    ...(gruen ? { gruen } : {}),
    ...(z.zusammengefuehrt_aus && zf ? { zusammengefuehrtAus: { id: z.zusammengefuehrt_aus, vorgangsNr: zf.nr ?? '', am: zf.am } } : {}),
    ...(z.zustand === 'rueckfrage' && z.rueckfrage_an && z.rueckfrage_bei
      ? { rueckfrage: { an: z.rueckfrage_an, bei: z.rueckfrage_bei, notiz: z.rueckfrage_notiz ?? '', am: z.rueckfrage_am ?? '', von: (z.rueckfrage_von && n.get(z.rueckfrage_von)) || 'BV' } }
      : {}),
  }
}

/** WEP für die App: Inhalt plus Ablauf vom Server. */
async function wepMitAblauf(db: Db, z: WepZeile): Promise<Wep> {
  return { ...(JSON.parse(z.daten) as Wep), ablauf: await ablaufVon(db, z) }
}

/** Ergebnis einer Server-Aktion: ok mit Daten oder ein HTTP-Fehler mit Begründung (und ggf. dem Serverstand). */
export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; status: number; fehler: string; stand?: { kopf: ServerWepKopf; wep: unknown } }

const fehler = (status: number, text: string): Ergebnis<never> => ({ ok: false, status, fehler: text })

/** Fehler mit dem Stand des Servers (die App übernimmt ihn bzw. zeigt den Konflikt). */
const fehlerMitStand = async (db: Db, status: number, text: string, z: WepZeile | null): Promise<Ergebnis<never>> =>
  z ? { ok: false, status, fehler: text, stand: { kopf: kopfVon(z), wep: await wepMitAblauf(db, z) } } : fehler(status, text)

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
  return { ok: true, wert: { kopf: kopfVon(z), wep: await wepMitAblauf(db, z) } }
}

interface WepFormalien {
  id?: unknown
  formalien?: { vorgangsNr?: unknown; kleingartenanlage?: unknown; parzelle?: unknown }
}

/** Erlaubte Kennung (auch Ordner in R2) und alte, erratbare Kennung aus v1 („2026-007“, wie `istAlteKennung`). */
const KENNUNG = /^[A-Za-z0-9_-]{1,64}$/
const ALTE_KENNUNG = /^\d{4}-\d+$/

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
 * Speichert ein WEP. Neu: mit Rolle Bau (Bau-WEP) oder Grün (eigenes Grün-WEP); wer anlegt, wird Besitzer. Vorhanden: nur mit Schreibrecht und passender Revision
 * (`basisRev` = Revision, auf der die Änderung beruht); sonst 409 mit dem Stand des Servers.
 */
export async function speichereWep(db: Db, konto: Konto, id: string, eingabe: { wep?: unknown; basisRev?: unknown }, jetzt = Date.now()): Promise<Ergebnis<ServerWepKopf>> {
  const roh = eingabe.wep as WepFormalien | undefined
  if (!roh || typeof roh !== 'object' || roh.id !== id) return fehler(400, 'WEP fehlt oder passt nicht zur Adresse.')
  const form = wepFormFehler(roh)
  if (form) return fehler(400, form)
  const appWep = ohneServerFelder(roh as unknown as Wep)
  const zeit = jetztIso(jetzt)
  const z = await ladeZeile(db, id)

  if (!z) {
    // Neue WEPs nur mit einer nicht erratbaren Kennung: alte Kennungen („2026-007“) könnte ein anderes Konto vorab belegen
    // (Fund N7). Die App vergibt solchen WEPs vor dem ersten Hochladen eine neue Kennung (src/server/abgleich.ts).
    if (!KENNUNG.test(id) || ALTE_KENNUNG.test(id)) return fehler(400, 'Neue WEPs brauchen eine neue Kennung (UUID) – bitte die App aktualisieren.')
    const daten = JSON.stringify(appWep)
    if (new TextEncoder().encode(daten).length > MAX_WEP_BYTES) return fehler(413, 'Das WEP ist zu groß für den Server (Unterschriften oder Skizzen verkleinern).')
    const spalten = spaltenVon(appWep)
    const neu = neuerKopf(konto)
    if (!neu) return fehler(403, 'Neue WEPs legen die Wertermittler Bau und Grün an.')
    if ((await heuteSchon(db, konto.id, 'angelegt', jetzt)) >= TAGESGRENZEN.angelegt) {
      return fehler(429, `Heute schon ${TAGESGRENZEN.angelegt} neue WEPs angelegt – mehr geht erst morgen wieder.`)
    }
    await db
      .prepare(
        'INSERT INTO weps (id, rev, daten, zustand, bau_konto, gruen_konto, vorgangs_nr, anlage, parzelle, erstellt_am, erstellt_von, geaendert_am, geaendert_von) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, daten, neu.zustand, neu.bauKonto ?? null, neu.gruenKonto ?? null, ...spalten, zeit, konto.id, zeit, konto.id)
      .run()
    await verlauf(db, { wepId: id, kontoId: konto.id, aktion: 'angelegt', nachher: neu.zustand }, jetzt)
    return { ok: true, wert: kopfVon((await ladeZeile(db, id))!) }
  }

  const kopf = rechteKopf(z)
  if (!darfLesen(kopf, konto)) return fehler(404, 'WEP nicht gefunden.')
  if (z.geloescht_am) return fehlerMitStand(db, 409, 'Das WEP liegt im Papierkorb.', z)
  const recht = schreibrecht(kopf, konto)
  if (!recht) return fehlerMitStand(db, 403, 'Das WEP ist für dich gerade gesperrt (nur lesen).', z)
  if (eingabe.basisRev !== z.rev) return fehlerMitStand(db, 409, 'Das WEP wurde inzwischen geändert.', z)
  // Nur den eigenen Teil übernehmen (Bau/Grün); was nur der Server setzt, nie aus der App
  const neu = mitEigenemTeil(JSON.parse(z.daten) as Wep, appWep, recht)
  const daten = JSON.stringify(neu)
  if (new TextEncoder().encode(daten).length > MAX_WEP_BYTES) return fehler(413, 'Das WEP ist zu groß für den Server (Unterschriften oder Skizzen verkleinern).')
  const zusammengefuehrt = daten !== JSON.stringify(appWep)
  const spalten = spaltenVon(neu)
  const r = await db
    .prepare('UPDATE weps SET daten = ?, rev = rev + 1, vorgangs_nr = ?, anlage = ?, parzelle = ?, geaendert_am = ?, geaendert_von = ? WHERE id = ? AND rev = ?')
    .bind(daten, ...spalten, zeit, konto.id, id, z.rev)
    .run()
  // Zwischen Lesen und Schreiben hat jemand anderes gespeichert
  if (r.meta.changes !== 1) return fehlerMitStand(db, 409, 'Das WEP wurde inzwischen geändert.', await ladeZeile(db, id))
  await merkeBearbeitung(db, id, konto.id, jetzt)
  return { ok: true, wert: { ...kopfVon((await ladeZeile(db, id))!), ...(zusammengefuehrt ? { zusammengefuehrt: true } : {}) } }
}

const spaltenVon = (w: Wep) => [text(w.formalien?.vorgangsNr, 50), text(w.formalien?.kleingartenanlage), text(w.formalien?.parzelle, 50)]

/** In den Papierkorb (bleibt auf dem Server, nur nicht mehr in Bearbeitung) bzw. zurückholen. */
export async function setzePapierkorb(db: Db, konto: Konto, id: string, geloescht: boolean, basisRev: unknown, jetzt = Date.now()): Promise<Ergebnis<ServerWepKopf>> {
  const z = await ladeZeile(db, id)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  if (!darfLoeschen(rechteKopf(z), konto)) return fehlerMitStand(db, 403, 'Nur der Besitzer kann das WEP löschen, solange es bei ihm in Bearbeitung ist.', z)
  if (Boolean(z.geloescht_am) === geloescht) return { ok: true, wert: kopfVon(z) }
  if (geloescht && basisRev !== z.rev) return fehlerMitStand(db, 409, 'Das WEP wurde inzwischen geändert.', z)
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
    .prepare('SELECT v.*, k.id AS konto, k.name AS name FROM verlauf v LEFT JOIN konten k ON k.id = v.konto_id WHERE v.wep_id = ? ORDER BY v.id')
    .bind(id)
    .all<{ zeit: string; aktion: string; notiz: string | null; zustand_vorher: Zustand | null; zustand_nachher: Zustand | null; konto: string | null; name: string | null }>()
  return {
    ok: true,
    wert: results.map((v) => ({
      zeit: v.zeit,
      aktion: v.aktion,
      wer: v.konto ? v.name || OHNE_NAMEN : 'gelöschtes Konto',
      ...(v.notiz ? { notiz: v.notiz } : {}),
      ...(v.zustand_vorher ? { zustandVorher: v.zustand_vorher } : {}),
      ...(v.zustand_nachher ? { zustandNachher: v.zustand_nachher } : {}),
    })),
  }
}

/** Freigegebene Grün-Wertermittler (Auswahl bei der Abgabe Bau → Grün): nur Name, keine Adresse (Fund N11). */
export async function gruenKonten(db: Db): Promise<{ id: string; name: string }[]> {
  const { results } = await db
    .prepare("SELECT id, name, rollen FROM konten WHERE status = 'freigegeben' ORDER BY name COLLATE NOCASE")
    .all<{ id: string; name: string; rollen: string }>()
  return results.filter((k) => k.rollen.split(',').includes('gruen')).map(({ id, name }) => ({ id, name: name || OHNE_NAMEN }))
}

/**
 * Ein Schritt im Ablauf (Abgabe, Rückfrage, geprüft, wieder öffnen). Nur auf dem aktuellen Stand (`basisRev`), damit
 * nur abgegeben wird, was beim Server angekommen ist. Steht mit Zustand vorher/nachher und Notiz im Verlauf.
 */
/** Was nach einem Schritt weitergegeben wird (Benachrichtigungen, Paket 5). */
export interface NachSchritt {
  aktion: AblaufAktion['aktion']
  wep: { id: string; vorgangsNr: string; anlage: string; parzelle: string; bauKonto: string | null; gruenKonto: string | null }
  rueckfrageAn: 'bau' | 'gruen' | 'beide' | null
}

export async function fuehreAktionAus(
  db: Db,
  konto: Konto,
  id: string,
  eingabe: { aktion?: unknown; basisRev?: unknown; [k: string]: unknown },
  jetzt = Date.now(),
  nachSchritt?: (n: NachSchritt) => Promise<void>,
): Promise<Ergebnis<ServerWepKopf>> {
  const z = await ladeZeile(db, id)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  if (eingabe.basisRev !== z.rev) return fehlerMitStand(db, 409, 'Das WEP auf dem Server ist neuer als hier – bitte erst abgleichen.', z)
  const aktion = eingabe as unknown as AblaufAktion
  if (!aktion || typeof aktion.aktion !== 'string' || !(aktion.aktion in AKTION_TEXT)) return fehler(400, 'Unbekannter Schritt.')
  const erg = wendeAn(rechteKopf(z), konto, aktion, aktion.aktion === 'an_gruen' ? (await gruenKonten(db)).map((k) => k.id) : [])
  if (!erg.ok) return erg.status === 403 ? fehlerMitStand(db, 403, erg.fehler, z) : fehler(erg.status, erg.fehler)
  if (aktion.aktion === 'an_bv' && (await heuteSchon(db, konto.id, 'an_bv', jetzt)) >= TAGESGRENZEN.an_bv) {
    return fehler(429, `Heute schon ${TAGESGRENZEN.an_bv} WEPs an den BV abgegeben – mehr geht erst morgen wieder.`)
  }
  const k = erg.kopf
  const zeit = jetztIso(jetzt)
  let daten = z.daten
  if (aktion.aktion === 'an_bv' && !z.bau_konto) {
    // Eigenes Grün-WEP ohne Bau: der Name des Grün-Wertermittlers steht in den Formalien (Zelle E13)
    const w = JSON.parse(z.daten) as Wep
    w.formalien = w.formalien ?? ({} as Wep['formalien'])
    if (typeof w.formalien.wertermittlerAussenAufwuchs !== 'string' || !w.formalien.wertermittlerAussenAufwuchs.trim()) {
      const n = await namen(db, [z.gruen_konto])
      w.formalien = { ...w.formalien, wertermittlerAussenAufwuchs: n.get(z.gruen_konto ?? '') ?? '' }
      daten = JSON.stringify(w)
    }
  }
  if (aktion.aktion === 'an_gruen' && !z.gruen_konto) {
    // Ab jetzt hat das WEP beide Teile; die Namen der Wertermittler stehen in den Formalien (Zellen E12/E13)
    const w = JSON.parse(z.daten) as Wep
    const n = await namen(db, [k.bauKonto ?? null, k.gruenKonto ?? null])
    const f = w.formalien ?? ({} as Wep['formalien'])
    const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    w.rolle = 'beides'
    w.formalien = {
      ...f,
      wertermittlerBaulichkeiten: t(f.wertermittlerBaulichkeiten) || n.get(k.bauKonto ?? '') || '',
      wertermittlerAussenAufwuchs: t(f.wertermittlerAussenAufwuchs) || n.get(k.gruenKonto ?? '') || '',
    }
    daten = JSON.stringify(w)
  }
  const rueckfrage = aktion.aktion === 'rueckfrage'
  const r = await db
    .prepare(
      `UPDATE weps SET zustand = ?, gruen_konto = ?, rueckfrage_an = ?, rueckfrage_bei = ?, daten = ?, rev = rev + 1, geaendert_am = ?, geaendert_von = ?${
        rueckfrage ? ', rueckfrage_notiz = ?, rueckfrage_am = ?, rueckfrage_von = ?' : k.rueckfrageAn ? '' : ', rueckfrage_notiz = NULL, rueckfrage_am = NULL, rueckfrage_von = NULL'
      } WHERE id = ? AND rev = ?`,
    )
    .bind(k.zustand, k.gruenKonto ?? null, k.rueckfrageAn ?? null, k.rueckfrageBei ?? null, daten, zeit, konto.id, ...(rueckfrage ? [erg.notiz ?? '', zeit, konto.id] : []), id, z.rev)
    .run()
  if (r.meta.changes !== 1) return fehlerMitStand(db, 409, 'Das WEP wurde inzwischen geändert.', await ladeZeile(db, id))
  await verlauf(db, { wepId: id, kontoId: konto.id, aktion: aktion.aktion, notiz: erg.notiz, vorher: z.zustand, nachher: k.zustand }, jetzt)
  const neu = (await ladeZeile(db, id))!
  await nachSchritt?.({
    aktion: aktion.aktion,
    wep: { id, vorgangsNr: neu.vorgangs_nr, anlage: neu.anlage, parzelle: neu.parzelle, bauKonto: neu.bau_konto, gruenKonto: neu.gruen_konto },
    rueckfrageAn: neu.rueckfrage_an,
  })
  return { ok: true, wert: kopfVon(neu) }
}

// ---------------------------------------------------------------------------
// Eigenes Grün-WEP mit einem abgegebenen Bau-WEP zusammenführen (und zurücknehmen)
// ---------------------------------------------------------------------------

/** Ergebnis des Zusammenführens: Kopf des Bau-WEP und die Fotos, deren Dateien vom Grün-WEP kopiert werden müssen. */
export interface ZusammenfuehrenErgebnis {
  kopf: ServerWepKopf
  gruenId: string
  fotoIds: string[]
}

/**
 * Führt das eigene Grün-WEP `eingabe.aus` in das Bau-WEP `bauId` zusammen. Die App schickt das zusammengeführte WEP
 * (`eingabe.wep`, Grün-Teil aus dem eigenen WEP) und die Stammdaten-Felder, die Grün aus dem eigenen WEP übernimmt
 * (`eingabe.felder`). Der Bau-Teil bleibt, wie er auf dem Server steht. Das Grün-WEP wird nicht gelöscht, sondern als
 * „zusammengeführt in <Bau-WEP>“ markiert und verschwindet aus allen Listen. Nur auf dem aktuellen Stand (`basisRev`).
 */
export async function fuehreZusammen(
  db: Db,
  konto: Konto,
  bauId: string,
  eingabe: { aus?: unknown; wep?: unknown; basisRev?: unknown; felder?: unknown },
  jetzt = Date.now(),
): Promise<Ergebnis<ZusammenfuehrenErgebnis>> {
  const z = await ladeZeile(db, bauId)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  const gruenId = typeof eingabe.aus === 'string' ? eingabe.aus : ''
  const g = gruenId ? await ladeZeile(db, gruenId) : null
  if (!g || (g.gruen_konto !== konto.id && !darfLesen(rechteKopf(g), konto))) return fehler(404, 'Dein WEP wurde nicht gefunden.')
  const pruefung = pruefeZusammenfuehren(rechteKopf(z), rechteKopf(g), konto)
  if (!pruefung.ok) return pruefung.status === 403 || pruefung.status === 409 ? fehlerMitStand(db, pruefung.status, pruefung.fehler, z) : fehler(pruefung.status, pruefung.fehler)
  if (eingabe.basisRev !== z.rev) return fehlerMitStand(db, 409, 'Das Bau-WEP wurde inzwischen geändert.', z)
  const roh = eingabe.wep as Wep | undefined
  if (!roh || typeof roh !== 'object' || roh.id !== bauId) return fehler(400, 'Das zusammengeführte WEP fehlt oder passt nicht zur Adresse.')
  const form = wepFormFehler(roh)
  if (form) return fehler(400, form)
  // Nur Felder der Formalien, die es im Bau-WEP gibt, nie die des Bau-Teils (N12) und nicht beliebig viele (N8)
  const bekannt = Object.keys((JSON.parse(z.daten) as Wep).formalien ?? {})
  const felder = (Array.isArray(eingabe.felder) ? eingabe.felder : [])
    .filter((f): f is string => typeof f === 'string' && bekannt.includes(f) && !BAU_FORMALIEN.includes(f))
    .slice(0, bekannt.length)
  const vorher = JSON.parse(z.daten) as Wep
  const neu = zusammenfuehrungAufServer(vorher, JSON.parse(g.daten) as Wep, ohneServerFelder(roh), felder)
  const daten = JSON.stringify(neu)
  if (new TextEncoder().encode(daten).length > MAX_WEP_BYTES) return fehler(413, 'Das WEP ist zu groß für den Server (Unterschriften oder Skizzen verkleinern).')
  const zeit = jetztIso(jetzt)
  const r = await db
    .prepare('UPDATE weps SET daten = ?, rev = rev + 1, vorgangs_nr = ?, anlage = ?, parzelle = ?, zusammengefuehrt_aus = ?, geaendert_am = ?, geaendert_von = ? WHERE id = ? AND rev = ?')
    .bind(daten, ...spaltenVon(neu), gruenId, zeit, konto.id, bauId, z.rev)
    .run()
  if (r.meta.changes !== 1) return fehlerMitStand(db, 409, 'Das Bau-WEP wurde inzwischen geändert.', await ladeZeile(db, bauId))
  await db.batch([
    db.prepare('INSERT OR REPLACE INTO zusammenfuehrungen (bau_id, gruen_id, konto_id, am, bau_vorher) VALUES (?, ?, ?, ?, ?)').bind(bauId, gruenId, konto.id, zeit, z.daten),
    db.prepare('UPDATE weps SET zusammengefuehrt_in = ?, rev = rev + 1, geaendert_am = ?, geaendert_von = ? WHERE id = ?').bind(bauId, zeit, konto.id, gruenId),
  ])
  const nr = (w: WepZeile) => w.vorgangs_nr || 'ohne Vorgangs-Nr.'
  await verlauf(db, { wepId: bauId, kontoId: konto.id, aktion: 'zusammengefuehrt', notiz: `mit dem eigenen WEP ${nr(g)}${felder.length ? `; übernommene Stammdaten: ${felder.join(', ')}` : ''}` }, jetzt)
  await verlauf(db, { wepId: gruenId, kontoId: konto.id, aktion: 'zusammengefuehrt_in', notiz: `in das Bau-WEP ${nr(z)}` }, jetzt)
  // Fotodateien, die zum Grün-WEP gehören, liegen in R2 noch dort: der Endpunkt kopiert sie zum Bau-WEP
  const vorhanden = new Set((vorher.fotos ?? []).map((f) => f.id))
  const fotoIds = (neu.fotos ?? []).map((f) => f.id).filter((id) => !vorhanden.has(id))
  return { ok: true, wert: { kopf: { ...kopfVon((await ladeZeile(db, bauId))!), zusammengefuehrt: true }, gruenId, fotoIds } }
}

/**
 * Nimmt das Zusammenführen zurück: Das Bau-WEP bekommt den Stand von vor dem Zusammenführen, das eigene Grün-WEP taucht
 * wieder auf (so, wie es beim Zusammenführen war). Nur durch dasselbe Grün-Konto und nur, solange das Bau-WEP bei Grün
 * in Arbeit ist (nicht an den BV abgegeben).
 */
export async function nimmZusammenfuehrungZurueck(db: Db, konto: Konto, bauId: string, eingabe: { basisRev?: unknown }, jetzt = Date.now()): Promise<Ergebnis<ServerWepKopf>> {
  const z = await ladeZeile(db, bauId)
  if (!z || !darfLesen(rechteKopf(z), konto)) return fehler(404, 'WEP nicht gefunden.')
  if (!darfZusammenfuehrungZuruecknehmen(rechteKopf(z), konto)) return fehlerMitStand(db, 403, 'Das Zusammenführen kann nur Grün zurücknehmen, solange das WEP bei Grün in Arbeit ist.', z)
  if (eingabe.basisRev !== z.rev) return fehlerMitStand(db, 409, 'Das Bau-WEP wurde inzwischen geändert – bitte erst abgleichen.', z)
  const f = await db.prepare('SELECT * FROM zusammenfuehrungen WHERE bau_id = ?').bind(bauId).first<{ gruen_id: string; bau_vorher: string }>()
  if (!f || !f.bau_vorher) return fehler(409, 'Der Stand vor dem Zusammenführen ist nicht mehr da – Rückgängig geht nicht mehr.')
  const vorher = JSON.parse(f.bau_vorher) as Wep
  const zeit = jetztIso(jetzt)
  const r = await db
    .prepare('UPDATE weps SET daten = ?, rev = rev + 1, vorgangs_nr = ?, anlage = ?, parzelle = ?, zusammengefuehrt_aus = NULL, geaendert_am = ?, geaendert_von = ? WHERE id = ? AND rev = ?')
    .bind(f.bau_vorher, ...spaltenVon(vorher), zeit, konto.id, bauId, z.rev)
    .run()
  if (r.meta.changes !== 1) return fehlerMitStand(db, 409, 'Das Bau-WEP wurde inzwischen geändert.', await ladeZeile(db, bauId))
  await db.batch([
    db.prepare('UPDATE weps SET zusammengefuehrt_in = NULL, rev = rev + 1, geaendert_am = ?, geaendert_von = ? WHERE id = ?').bind(zeit, konto.id, f.gruen_id),
    db.prepare('DELETE FROM zusammenfuehrungen WHERE bau_id = ?').bind(bauId),
  ])
  await verlauf(db, { wepId: bauId, kontoId: konto.id, aktion: 'zusammenfuehrung_zurueck' }, jetzt)
  await verlauf(db, { wepId: f.gruen_id, kontoId: konto.id, aktion: 'zusammenfuehrung_zurueck' }, jetzt)
  return { ok: true, wert: kopfVon((await ladeZeile(db, bauId))!) }
}
