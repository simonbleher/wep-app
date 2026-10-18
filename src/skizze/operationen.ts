/**
 * Operationen des Skizzen-Chats. Die KI nennt nur, WAS geschehen soll (Function Calls);
 * die Geometrie – Mitte, Abstände, Reihen, Kanten – rechnet dieser Code.
 *
 * Alle Funktionen sind rein (Szene rein, neue Szene raus), feste Elemente werden
 * nie verändert. Fehler (unbekannte id, festes Element, unbekannter Typ) sind keine
 * Ausnahmen, sondern ein Schritt mit `ok: false` – der Chat zeigt sie an.
 */

import type { SymbolArt } from './types'
import { SYMBOL_ARTEN } from './types'
import {
  findeElement,
  mitteVon,
  neueSzenenId,
  rund,
  standardKasten,
  type Szene,
  type SzenenElement,
} from './szene'

export type Kante = 'oben' | 'unten' | 'links' | 'rechts'
export const KANTEN: Kante[] = ['oben', 'unten', 'links', 'rechts']

export interface Bereich {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type Operation =
  | { op: 'hinzufuegen'; typ: SymbolArt; x: number; y: number; b?: number; h?: number; beschriftung?: string }
  | { op: 'aendern'; id: string; typ?: SymbolArt; beschriftung?: string }
  | { op: 'verschieben'; id: string; x?: number; y?: number; dx?: number; dy?: number }
  | { op: 'groesse'; id: string; b: number; h: number }
  | { op: 'loeschen'; id: string }
  | { op: 'beschriften'; id: string; text: string }
  | { op: 'reihe'; typ: SymbolArt; anzahl: number; bereich: Bereich; beschriftung?: string }
  | { op: 'entlangKante'; kante: Kante; typ: SymbolArt; beschriftung?: string; abstand?: number; anzahl?: number }
  | { op: 'neben'; id: string; typ: SymbolArt; seite?: 'links' | 'rechts'; abstand?: number; beschriftung?: string; b?: number; h?: number }
  | { op: 'unter'; id: string; typ: SymbolArt; abstand?: number; beschriftung?: string; b?: number; h?: number }
  | { op: 'ueber'; id: string; typ: SymbolArt; abstand?: number; beschriftung?: string; b?: number; h?: number }

export interface Schritt {
  ok: boolean
  /** Kurzer deutscher Satz für die Liste „was ich geändert habe“. */
  text: string
  /** Betroffene ids (neu, geändert; bei Löschen die gelöschte). */
  ids: string[]
  /** Zustand der betroffenen Elemente vor dem Schritt (null = gab es noch nicht) – für „Rückgängig“. */
  vorher?: { id: string; element: SzenenElement | null }[]
}

export interface Ergebnis {
  szene: Szene
  schritt: Schritt
}

const GRENZE = 1000
const MIN_GROESSE = 4
const STANDARD_ABSTAND = 20
/** Hecken und Wege am Rand sind so dick (pt). */
const KANTEN_DICKE_PT = 24

const klemme = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const zahl = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Name für Meldungen: „Beet (e2)“. */
function name(e: SzenenElement): string {
  return `${e.beschriftung || e.typ} (${e.id})`
}

const fehler = (szene: Szene, text: string, ids: string[] = []): Ergebnis => ({ szene, schritt: { ok: false, text, ids } })

/** Kasten ins Grundstück schieben und auf Mindestgröße bringen. */
function einpassen<T extends Pick<SzenenElement, 'x' | 'y' | 'b' | 'h'>>(e: T): T {
  const b = klemme(e.b, MIN_GROESSE, GRENZE)
  const h = klemme(e.h, MIN_GROESSE, GRENZE)
  return { ...e, b: rund(b), h: rund(h), x: rund(klemme(e.x, 0, GRENZE - b)), y: rund(klemme(e.y, 0, GRENZE - h)) }
}

function neu(szene: Szene, typ: SymbolArt, kasten: { x: number; y: number; b: number; h: number }, beschriftung = '', gruppe?: string): SzenenElement {
  return einpassen({
    id: neueSzenenId(szene),
    typ,
    ...kasten,
    beschriftung: beschriftung.trim(),
    ...(gruppe ? { gruppe } : {}),
  })
}

const mitElement = (szene: Szene, e: SzenenElement): Szene => ({ ...szene, elemente: [...szene.elemente, e] })
const ersetze = (szene: Szene, e: SzenenElement): Szene => ({
  ...szene,
  elemente: szene.elemente.map((x) => (x.id === e.id ? e : x)),
})

/** Beschreibung der Lage für die Meldung („oben links“). */
export function lageText(e: Pick<SzenenElement, 'x' | 'y' | 'b' | 'h'>): string {
  const m = mitteVon(e)
  const senkrecht = m.y < 340 ? 'oben' : m.y > 660 ? 'unten' : 'mittig'
  const waagerecht = m.x < 340 ? 'links' : m.x > 660 ? 'rechts' : 'mittig'
  if (senkrecht === 'mittig' && waagerecht === 'mittig') return 'in der Mitte'
  if (senkrecht === 'mittig') return waagerecht
  if (waagerecht === 'mittig') return senkrecht
  return `${senkrecht} ${waagerecht}`
}

/** Ziel-Element prüfen: gibt es, ist nicht fest. */
function aenderbar(szene: Szene, id: unknown): SzenenElement | Ergebnis {
  const e = typeof id === 'string' ? findeElement(szene, id) : undefined
  if (!e) return fehler(szene, `Element „${String(id)}“ gibt es nicht.`)
  if (e.fest) return fehler(szene, `„${e.beschriftung || e.typ}“ (${e.id}) ist fest und bleibt unverändert.`, [e.id])
  return e
}

const istErgebnis = (x: SzenenElement | Ergebnis): x is Ergebnis => 'schritt' in x

function pruefeTyp(szene: Szene, typ: unknown): Ergebnis | null {
  return typeof typ === 'string' && (SYMBOL_ARTEN as readonly string[]).includes(typ)
    ? null
    : fehler(szene, `Typ „${String(typ)}“ gibt es nicht.`)
}

// ---------------------------------------------------------------------------
// Einzeloperationen
// ---------------------------------------------------------------------------

function hinzufuegen(szene: Szene, op: Extract<Operation, { op: 'hinzufuegen' }>): Ergebnis {
  const f = pruefeTyp(szene, op.typ)
  if (f) return f
  if (!zahl(op.x) || !zahl(op.y)) return fehler(szene, 'Position fehlt.')
  const std = standardKasten(op.typ, szene.masse)
  const b = zahl(op.b) ? op.b : std.b
  const h = zahl(op.h) ? op.h : std.h
  const e = neu(szene, op.typ, { x: op.x - b / 2, y: op.y - h / 2, b, h }, op.beschriftung)
  return {
    szene: mitElement(szene, e),
    schritt: { ok: true, text: `${name(e)} hinzugefügt, ${lageText(e)}`, ids: [e.id] },
  }
}

function aendern(szene: Szene, op: Extract<Operation, { op: 'aendern' }>): Ergebnis {
  const e = aenderbar(szene, op.id)
  if (istErgebnis(e)) return e
  if (op.typ !== undefined) {
    const f = pruefeTyp(szene, op.typ)
    if (f) return f
  }
  const neuerTyp = op.typ ?? (e.typ as SymbolArt)
  const n: SzenenElement = { ...e, typ: neuerTyp, beschriftung: op.beschriftung !== undefined ? op.beschriftung.trim() : e.beschriftung }
  return {
    szene: ersetze(szene, n),
    schritt: { ok: true, text: op.typ && op.typ !== e.typ ? `${name(e)} → ${n.typ}` : `${name(n)} geändert`, ids: [e.id] },
  }
}

function verschieben(szene: Szene, op: Extract<Operation, { op: 'verschieben' }>): Ergebnis {
  const e = aenderbar(szene, op.id)
  if (istErgebnis(e)) return e
  let n: SzenenElement
  if (zahl(op.x) || zahl(op.y)) {
    const m = mitteVon(e)
    const mx = zahl(op.x) ? op.x : m.x
    const my = zahl(op.y) ? op.y : m.y
    n = einpassen({ ...e, x: mx - e.b / 2, y: my - e.h / 2 })
  } else if (zahl(op.dx) || zahl(op.dy)) {
    n = einpassen({ ...e, x: e.x + (op.dx ?? 0), y: e.y + (op.dy ?? 0) })
  } else {
    return fehler(szene, `Für „${name(e)}“ fehlt die neue Position.`, [e.id])
  }
  return { szene: ersetze(szene, n), schritt: { ok: true, text: `${name(e)} verschoben, jetzt ${lageText(n)}`, ids: [e.id] } }
}

function groesse(szene: Szene, op: Extract<Operation, { op: 'groesse' }>): Ergebnis {
  const e = aenderbar(szene, op.id)
  if (istErgebnis(e)) return e
  if (!zahl(op.b) || !zahl(op.h)) return fehler(szene, `Für „${name(e)}“ fehlt die Größe.`, [e.id])
  const m = mitteVon(e)
  const n = einpassen({ ...e, b: op.b, h: op.h, x: m.x - op.b / 2, y: m.y - op.h / 2 })
  return { szene: ersetze(szene, n), schritt: { ok: true, text: `${name(e)} in der Größe geändert`, ids: [e.id] } }
}

function loeschen(szene: Szene, op: Extract<Operation, { op: 'loeschen' }>): Ergebnis {
  const e = aenderbar(szene, op.id)
  if (istErgebnis(e)) return e
  return {
    szene: { ...szene, elemente: szene.elemente.filter((x) => x.id !== e.id) },
    schritt: { ok: true, text: `${name(e)} gelöscht`, ids: [e.id] },
  }
}

function beschriften(szene: Szene, op: Extract<Operation, { op: 'beschriften' }>): Ergebnis {
  const e = aenderbar(szene, op.id)
  if (istErgebnis(e)) return e
  const text = String(op.text ?? '').trim()
  return {
    szene: ersetze(szene, { ...e, beschriftung: text }),
    schritt: { ok: true, text: text ? `${e.typ} (${e.id}) beschriftet: „${text}“` : `Beschriftung von ${e.typ} (${e.id}) entfernt`, ids: [e.id] },
  }
}

function reihe(szene: Szene, op: Extract<Operation, { op: 'reihe' }>): Ergebnis {
  const f = pruefeTyp(szene, op.typ)
  if (f) return f
  const bb = op.bereich
  if (!bb || ![bb.x1, bb.y1, bb.x2, bb.y2].every(zahl)) return fehler(szene, 'Bereich der Reihe fehlt.')
  const n = Math.round(op.anzahl)
  if (!zahl(n) || n < 1 || n > 20) return fehler(szene, 'Anzahl der Reihe muss zwischen 1 und 20 liegen.')
  const x1 = klemme(Math.min(bb.x1, bb.x2), 0, GRENZE)
  const x2 = klemme(Math.max(bb.x1, bb.x2), 0, GRENZE)
  const y1 = klemme(Math.min(bb.y1, bb.y2), 0, GRENZE)
  const y2 = klemme(Math.max(bb.y1, bb.y2), 0, GRENZE)
  // Richtung nach echter Ausdehnung (pt), nicht nach Promille
  const waagerecht = ((x2 - x1) / 1000) * szene.masse.b >= ((y2 - y1) / 1000) * szene.masse.h
  const std = standardKasten(op.typ, szene.masse)
  const gruppe = neueGruppe(szene)
  const mittelIndex = Math.floor((n - 1) / 2)
  let s = szene
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const zelleB = (x2 - x1) / (waagerecht ? n : 1)
    const zelleH = (y2 - y1) / (waagerecht ? 1 : n)
    const b = Math.max(MIN_GROESSE, Math.min(std.b, zelleB * 0.85))
    const h = Math.max(MIN_GROESSE, Math.min(std.h, zelleH * 0.85))
    const mx = x1 + (waagerecht ? (i + 0.5) * zelleB : zelleB / 2)
    const my = y1 + (waagerecht ? zelleH / 2 : (i + 0.5) * zelleH)
    const e = neu(s, op.typ, { x: mx - b / 2, y: my - h / 2, b, h }, i === mittelIndex ? (op.beschriftung ?? '') : '', gruppe)
    s = mitElement(s, e)
    ids.push(e.id)
  }
  return {
    szene: s,
    schritt: {
      ok: true,
      text: `${n} × ${op.typ}${op.beschriftung ? ` („${op.beschriftung}“)` : ''} ${waagerecht ? 'nebeneinander' : 'untereinander'}, ${lageText({ x: x1, y: y1, b: x2 - x1, h: y2 - y1 })}`,
      ids,
    },
  }
}

/** Nächste freie Gruppe („g1“, „g2“ …). */
function neueGruppe(szene: Szene): string {
  let max = 0
  for (const e of szene.elemente) {
    const m = /^g(\d+)$/.exec(e.gruppe ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `g${max + 1}`
}

const LINEARE_TYPEN: SymbolArt[] = ['hecke', 'weg']

function entlangKante(szene: Szene, op: Extract<Operation, { op: 'entlangKante' }>): Ergebnis {
  const f = pruefeTyp(szene, op.typ)
  if (f) return f
  if (!KANTEN.includes(op.kante)) return fehler(szene, `Kante „${String(op.kante)}“ gibt es nicht.`)
  const abstand = zahl(op.abstand) ? op.abstand : 12
  const senkrecht = op.kante === 'links' || op.kante === 'rechts'
  const dicke = senkrecht ? (KANTEN_DICKE_PT / szene.masse.b) * 1000 : (KANTEN_DICKE_PT / szene.masse.h) * 1000
  const std = standardKasten(op.typ, szene.masse)
  // Position quer zur Kante (Anfang des Kastens)
  const quer = (breite: number) =>
    op.kante === 'links' ? abstand : op.kante === 'rechts' ? GRENZE - abstand - breite : op.kante === 'oben' ? abstand : GRENZE - abstand - breite

  if (LINEARE_TYPEN.includes(op.typ)) {
    const rand = 40
    const kasten = senkrecht
      ? { x: quer(dicke), y: rand, b: dicke, h: GRENZE - 2 * rand }
      : { x: rand, y: quer(dicke), b: GRENZE - 2 * rand, h: dicke }
    const e = neu(szene, op.typ, kasten, op.beschriftung)
    return { szene: mitElement(szene, e), schritt: { ok: true, text: `${name(e)} am Rand ${op.kante} entlang`, ids: [e.id] } }
  }

  const n = Math.max(1, Math.min(20, Math.round(op.anzahl ?? 3)))
  let s = szene
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const entlang = 150 + ((GRENZE - 300) * (i + 0.5)) / n
    const kasten = senkrecht
      ? { x: quer(std.b), y: entlang - std.h / 2, b: std.b, h: std.h }
      : { x: entlang - std.b / 2, y: quer(std.h), b: std.b, h: std.h }
    const e = neu(s, op.typ, kasten, i === Math.floor((n - 1) / 2) ? op.beschriftung : '')
    s = mitElement(s, e)
    ids.push(e.id)
  }
  return { szene: s, schritt: { ok: true, text: `${n} × ${op.typ} am Rand ${op.kante} entlang`, ids } }
}

function relativ(
  szene: Szene,
  op: Extract<Operation, { op: 'neben' | 'unter' | 'ueber' }>,
): Ergebnis {
  const f = pruefeTyp(szene, op.typ)
  if (f) return f
  const ref = typeof op.id === 'string' ? findeElement(szene, op.id) : undefined
  if (!ref) return fehler(szene, `Bezugselement „${String(op.id)}“ gibt es nicht.`)
  const std = standardKasten(op.typ, szene.masse)
  const b = zahl(op.b) ? op.b : std.b
  const h = zahl(op.h) ? op.h : std.h
  const abstand = zahl(op.abstand) ? op.abstand : STANDARD_ABSTAND
  const m = mitteVon(ref)
  let x: number
  let y: number
  let lage: string
  if (op.op === 'neben') {
    const links = op.seite === 'links'
    x = links ? ref.x - abstand - b : ref.x + ref.b + abstand
    y = m.y - h / 2
    lage = `${links ? 'links' : 'rechts'} neben`
  } else if (op.op === 'unter') {
    x = m.x - b / 2
    y = ref.y + ref.h + abstand
    lage = 'unter'
  } else {
    x = m.x - b / 2
    y = ref.y - abstand - h
    lage = 'über'
  }
  const e = neu(szene, op.typ, { x, y, b, h }, op.beschriftung)
  return {
    szene: mitElement(szene, e),
    schritt: { ok: true, text: `${name(e)} ${lage} ${name(ref)}`, ids: [e.id] },
  }
}

// ---------------------------------------------------------------------------
// Öffentliche Eingänge
// ---------------------------------------------------------------------------

export function wendeAn(szene: Szene, op: Operation): Ergebnis {
  const e = wendeAnRoh(szene, op)
  if (!e.schritt.ok || !e.schritt.ids.length) return e
  const vorher = e.schritt.ids.map((id) => ({ id, element: findeElement(szene, id) ?? null }))
  return { szene: e.szene, schritt: { ...e.schritt, vorher } }
}

/** Macht einen Schritt rückgängig: betroffene Elemente kehren in den Zustand davor zurück. */
export function macheRueckgaengig(szene: Szene, schritt: Schritt): Szene {
  let elemente = szene.elemente
  for (const { id, element } of schritt.vorher ?? []) {
    if (element === null) elemente = elemente.filter((e) => e.id !== id)
    else if (elemente.some((e) => e.id === id)) elemente = elemente.map((e) => (e.id === id ? element : e))
    else elemente = [...elemente, element]
  }
  return { ...szene, elemente }
}

function wendeAnRoh(szene: Szene, op: Operation): Ergebnis {
  switch (op.op) {
    case 'hinzufuegen':
      return hinzufuegen(szene, op)
    case 'aendern':
      return aendern(szene, op)
    case 'verschieben':
      return verschieben(szene, op)
    case 'groesse':
      return groesse(szene, op)
    case 'loeschen':
      return loeschen(szene, op)
    case 'beschriften':
      return beschriften(szene, op)
    case 'reihe':
      return reihe(szene, op)
    case 'entlangKante':
      return entlangKante(szene, op)
    case 'neben':
    case 'unter':
    case 'ueber':
      return relativ(szene, op)
    default:
      return fehler(szene, `Unbekannte Operation „${String((op as { op?: unknown }).op)}“.`)
  }
}

/** Wendet die Operationen nacheinander an; fehlerhafte werden übersprungen und gemeldet. */
export function wendeAlleAn(szene: Szene, ops: Operation[]): { szene: Szene; schritte: Schritt[] } {
  let s = szene
  const schritte: Schritt[] = []
  for (const op of ops) {
    const e = wendeAn(s, op)
    s = e.szene
    schritte.push(e.schritt)
  }
  return { szene: s, schritte }
}

// ---------------------------------------------------------------------------
// Prüfung: Überlappungen, Elemente außerhalb, verdeckte Beschriftungen
// ---------------------------------------------------------------------------

interface Rahmen {
  x: number
  y: number
  b: number
  h: number
}

const SCHRIFT_PT = 11

/** Typen, bei denen die Beschriftung unter dem Symbol steht. */
const TEXT_UNTEN: SymbolArt[] = [
  'baum', 'strauch', 'wildling', 'kletterpflanze', 'beet', 'hochbeet', 'blumenbeet', 'brunnen', 'schacht',
  'holzpferd', 'schaukel', 'gegenstand', 'hecke', 'tor',
]

/**
 * Ungefähres Rechteck der sichtbaren Beschriftung (Promille). Für Typen, deren Text im
 * Symbol steht (Weg, Hinweis, Rasen), ist es der Kasten selbst und zählt nicht als „außen“.
 */
export function beschriftungsRahmen(e: SzenenElement, masse: Szene['masse']): Rahmen | null {
  const text = e.beschriftung
  if (!text) return null
  const w = ((text.length * SCHRIFT_PT * 0.55 + 4) / masse.b) * 1000
  const h = ((SCHRIFT_PT + 3) / masse.h) * 1000
  const m = mitteVon(e)
  if (e.typ === 'kompost') return { x: m.x - w / 2, y: e.y - h, b: w, h }
  if (e.typ === 'entfernen') return { x: m.x - w / 2, y: e.y - h - (8 / masse.h) * 1000, b: w, h }
  if (e.typ === 'hecke' && e.h > e.b) return { x: e.x + e.b + 2, y: m.y - h / 2, b: w, h }
  if ((TEXT_UNTEN as string[]).includes(e.typ) || e.typ === 'bau-ellipse') return { x: m.x - w / 2, y: e.y + e.h, b: w, h }
  return null
}

function schnitt(a: Rahmen, b: Rahmen): number {
  const w = Math.min(a.x + a.b, b.x + b.b) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

const flaeche = (r: Rahmen) => Math.max(1e-6, r.b * r.h)

/** Typen, die sich mit anderen überlagern dürfen. */
const UEBERLAGERT_ERLAUBT: string[] = ['rasen', 'weg', 'bau-linie', 'bau-text']

export interface Befund {
  art: 'ueberlappung' | 'ausserhalb' | 'beschriftung'
  text: string
  ids: string[]
}

/** Deterministische Vorprüfung; der zweite KI-Aufruf bekommt die Befunde zusätzlich zum Bild. */
export function pruefeSzene(szene: Szene): Befund[] {
  const befunde: Befund[] = []
  const el = szene.elemente
  for (const e of el) {
    if (e.fest) continue
    if (e.x < -2 || e.y < -2 || e.x + e.b > GRENZE + 2 || e.y + e.h > GRENZE + 2) {
      befunde.push({ art: 'ausserhalb', text: `${name(e)} liegt außerhalb des Grundstücks`, ids: [e.id] })
    }
  }
  for (let i = 0; i < el.length; i++) {
    for (let j = i + 1; j < el.length; j++) {
      const a = el[i]
      const b = el[j]
      if (a.fest && b.fest) continue
      if (UEBERLAGERT_ERLAUBT.includes(a.typ) || UEBERLAGERT_ERLAUBT.includes(b.typ)) continue
      const s = schnitt(a, b)
      if (s > 0.2 * Math.min(flaeche(a), flaeche(b))) {
        befunde.push({ art: 'ueberlappung', text: `${name(a)} überlappt ${name(b)}`, ids: [a.id, b.id] })
      }
    }
  }
  for (let i = 0; i < el.length; i++) {
    const a = el[i]
    const t = beschriftungsRahmen(a, szene.masse)
    if (!t || a.fest) continue
    for (let j = 0; j < el.length; j++) {
      const b = el[j]
      if (j === i || b.typ === 'bau-linie' || b.typ === 'rasen' || b.typ === 'weg') continue
      if (schnitt(t, b) > 0.25 * flaeche(t)) {
        befunde.push({ art: 'beschriftung', text: `Beschriftung „${a.beschriftung}“ (${a.id}) wird von ${name(b)} verdeckt`, ids: [a.id, b.id] })
      }
      const tb = beschriftungsRahmen(b, szene.masse)
      if (tb && j > i && schnitt(t, tb) > 0.25 * Math.min(flaeche(t), flaeche(tb))) {
        befunde.push({ art: 'beschriftung', text: `Beschriftungen „${a.beschriftung}“ (${a.id}) und „${b.beschriftung}“ (${b.id}) überlappen`, ids: [a.id, b.id] })
      }
    }
  }
  return befunde
}

