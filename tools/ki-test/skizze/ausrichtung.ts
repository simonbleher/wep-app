// Ausrichtung Foto → Excel: Bezugsgebäude, die im Foto UND in den Bau-Formen
// vorkommen, werden über ihre Beschriftung zugeordnet. Daraus wird je Achse eine
// Abbildung Foto-Koordinate (0–1000) → EMU berechnet.
// Handskizzen sind nicht maßstäblich: eine einzige lineare Abbildung schiebt neue
// Elemente in Gebäude (Fall 1: Hochbeete in die Laube). Deshalb je Achse
// stückweise linear durch Stützpunkte (Kanten der Bezugsgebäude + Grundstücks-
// rahmen); größere Gebäude haben Vorrang, widersprüchliche Kanten fallen weg.
//
// Mindestens 2 Bezugsgebäude, sonst Grundstücksrahmen (Foto-Rahmen → größtes
// Rechteck der Bau-Formen). Elemente, die einem Bau-Objekt zugeordnet sind,
// gelten als „vorhanden“, alle übrigen als „neu“.

import type { Box2d, ElementTyp, SkizzenElement } from './schema'

/** Eine Form aus bau-formen.json / aussen-vorher.json (EMU ab Blattecke). */
export interface BauForm {
  name: string
  typ: string // rect | ellipse | line | straightConnector1 | …
  x: number
  y: number
  w: number
  h: number
  textfeld?: boolean
  text?: string
  fuellung?: string
  flipH?: boolean
  flipV?: boolean
  pfeil?: boolean
  gestrichelt?: boolean
}

export interface Rechteck {
  x: number
  y: number
  w: number
  h: number
}

/** Klasse für die Zuordnung Foto ↔ Bau (LVP und Terrasse sind dasselbe). */
export type Klasse =
  | 'laube'
  | 'anbau'
  | 'lvp'
  | 'pavillon'
  | 'schuppen'
  | 'asg'
  | 'hw'
  | 'brunnen'
  | 'zugang'
  | 'kompost'
  | 'schacht'

/** Gebäude, die als Bezug für die Ausrichtung taugen. */
export const BEZUGS_KLASSEN: Klasse[] = ['laube', 'anbau', 'lvp', 'pavillon', 'schuppen', 'asg', 'hw']

export function klasseVonTyp(typ: ElementTyp): Klasse | null {
  switch (typ) {
    case 'terrasse':
    case 'lvp':
      return 'lvp'
    case 'tor':
    case 'zugang':
      return 'zugang'
    case 'laube':
    case 'anbau':
    case 'pavillon':
    case 'schuppen':
    case 'asg':
    case 'hw':
    case 'brunnen':
    case 'kompost':
    case 'schacht':
      return typ
    default:
      return null
  }
}

/**
 * Klasse eines Foto-Elements. Bei Gebäuden hat die Beschriftung Vorrang vor dem
 * Typ: „Pavillon LVP“ als ein Kasten ist der LVP (Terrasse), auch wenn das
 * Modell ihn als `pavillon` meldet.
 */
export function klasseVonElement(e: Pick<SkizzenElement, 'typ' | 'beschriftung'>): Klasse | null {
  const ausTyp = klasseVonTyp(e.typ)
  if (!ausTyp || !BEZUGS_KLASSEN.includes(ausTyp)) return ausTyp
  const ausText = e.beschriftung ? klasseVonText(e.beschriftung) : null
  return ausText && BEZUGS_KLASSEN.includes(ausText) ? ausText : ausTyp
}

/** Klasse aus dem Formtext der Bau-Excel („L“, „A1“, „Terrasse“, „ASG“ …). */
export function klasseVonText(text: string): Klasse | null {
  const t = text.trim()
  if (/^L\d*$/i.test(t) || /laube/i.test(t)) return 'laube'
  if (/^A\d+$/i.test(t) || /anbau/i.test(t)) return 'anbau'
  if (/terrasse|\bLVP\b|vorplatz/i.test(t)) return 'lvp'
  if (/pavill/i.test(t)) return 'pavillon'
  if (/^(S\d+|TS)$/i.test(t) || /schuppen/i.test(t)) return 'schuppen'
  if (/^ASG\b|abstell/i.test(t)) return 'asg'
  if (/schacht/i.test(t)) return 'schacht'
  if (/^(K\d+\s*)?HW\b|hauswasser/i.test(t)) return 'hw'
  if (/brunnen/i.test(t)) return 'brunnen'
  if (/zugang|eingang/i.test(t)) return 'zugang'
  if (/kompost/i.test(t)) return 'kompost'
  return null
}

export interface BauObjekt {
  klasse: Klasse
  label: string
  /** Geometrie der Form (bei fehlender Form: das Textfeld selbst) */
  rechteck: Rechteck
  formName: string
  textName: string
}

const flaeche = (r: Rechteck) => r.w * r.h
const mitte = (r: Rechteck) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const enthaelt = (r: Rechteck, p: { x: number; y: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

/** Grundstück = größtes Rechteck, das kein Textfeld ist. */
export function findeGrundstueck(formen: BauForm[]): BauForm | undefined {
  return formen
    .filter((f) => f.typ === 'rect' && !f.textfeld)
    .sort((a, b) => flaeche(b) - flaeche(a))[0]
}

/**
 * Ordnet jedem beschrifteten Textfeld die Form zu, in der es steht (kleinste
 * umschließende Form) bzw. die nächstgelegene Form (z. B. „Brunnen“ über dem
 * Kreis). Nur Objekte im Bereich des Grundstücks (+10 %).
 */
export function erkenneBauObjekte(formen: BauForm[]): { grundstueck: Rechteck; objekte: BauObjekt[] } {
  const gs = findeGrundstueck(formen)
  if (!gs) throw new Error('Bau-Formen ohne Grundstücks-Rechteck')
  const zone: Rechteck = { x: gs.x - gs.w * 0.1, y: gs.y - gs.h * 0.1, w: gs.w * 1.2, h: gs.h * 1.2 }
  const koerper = formen.filter((f) => !f.textfeld && (f.typ === 'rect' || f.typ === 'ellipse') && f !== gs)
  const objekte: BauObjekt[] = []
  for (const t of formen) {
    if (!t.textfeld || !t.text) continue
    const klasse = klasseVonText(t.text)
    const m = mitte(t)
    if (!klasse || !enthaelt(zone, m)) continue
    let wirt: BauForm | undefined
    if (klasse !== 'zugang') {
      wirt = koerper.filter((k) => enthaelt(k, m)).sort((a, b) => flaeche(a) - flaeche(b))[0]
      if (!wirt) {
        const maxAbstand = Math.max(t.h * 2.5, 400_000)
        wirt = koerper
          .map((k) => ({ k, d: Math.hypot(mitte(k).x - m.x, mitte(k).y - m.y) }))
          .filter((e) => e.d <= maxAbstand)
          .sort((a, b) => a.d - b.d)[0]?.k
      }
    }
    const quelle = wirt ?? t
    objekte.push({
      klasse,
      label: t.text,
      rechteck: { x: quelle.x, y: quelle.y, w: quelle.w, h: quelle.h },
      formName: quelle.name,
      textName: t.name,
    })
  }
  return { grundstueck: { x: gs.x, y: gs.y, w: gs.w, h: gs.h }, objekte }
}

// ---------------------------------------------------------------- Transformation

/** Stützpunkt einer Achse: Foto-Koordinate (0–1000) → EMU. */
export type Stuetzpunkt = [number, number]

/** Je Achse aufsteigend sortierte Stützpunkte (stückweise lineare Abbildung). */
export interface Trafo {
  x: Stuetzpunkt[]
  y: Stuetzpunkt[]
}

/** Stückweise linear; außerhalb mit der mittleren Steigung weiter. */
export function bilde(u: number, punkte: Stuetzpunkt[]): number {
  if (punkte.length === 1) return punkte[0][1]
  const erst = punkte[0]
  const letzt = punkte[punkte.length - 1]
  const steigung = (letzt[1] - erst[1]) / (letzt[0] - erst[0])
  if (u <= erst[0]) return erst[1] + (u - erst[0]) * steigung
  if (u >= letzt[0]) return letzt[1] + (u - letzt[0]) * steigung
  for (let i = 1; i < punkte.length; i++) {
    const [u1, z1] = punkte[i - 1]
    const [u2, z2] = punkte[i]
    if (u <= u2) return z1 + ((u - u1) / (u2 - u1)) * (z2 - z1)
  }
  return letzt[1]
}

export function boxZuEmu(b: Box2d, t: Trafo): Rechteck {
  const [ymin, xmin, ymax, xmax] = b
  const x1 = bilde(xmin, t.x)
  const x2 = bilde(xmax, t.x)
  const y1 = bilde(ymin, t.y)
  const y2 = bilde(ymax, t.y)
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}

/** Mindestabstand zweier Stützpunkte in Foto-Einheiten (sonst gelten sie als gleich). */
const MIN_ABSTAND = 3

/**
 * Fügt ein Kantenpaar (min/max einer Achse) nur ein, wenn beide Punkte zu den
 * vorhandenen passen (streng steigend in Foto UND EMU). Fällt eine Kante mit
 * einer vorhandenen zusammen (EMU-Abstand < `toleranz`, z. B. Terrasse und Laube
 * links bündig), wird nur dieser Punkt übersprungen. Sonst bleibt die Achse für
 * dieses Objekt unberücksichtigt.
 */
function fuegeKantenEin(punkte: Stuetzpunkt[], neu: Stuetzpunkt[], toleranz: number): boolean {
  const eigene = neu.filter((n) => !punkte.some((p) => Math.abs(p[1] - n[1]) < toleranz))
  const probe = [...punkte, ...eigene].sort((a, b) => a[0] - b[0])
  for (let i = 1; i < probe.length; i++) {
    if (probe[i][0] - probe[i - 1][0] < MIN_ABSTAND || probe[i][1] <= probe[i - 1][1]) return false
  }
  punkte.splice(0, punkte.length, ...probe)
  return eigene.length > 0
}

interface Paar {
  foto: Box2d
  emu: Rechteck
}

/** Stützpunkte aus Paaren in Vorrang-Reihenfolge (erstes Paar zuerst). */
function stuetzpunkte(paare: Paar[], gs: Rechteck): { trafo: Trafo; ohneX: number[]; ohneY: number[] } {
  const trafo: Trafo = { x: [], y: [] }
  const ohneX: number[] = []
  const ohneY: number[] = []
  paare.forEach(({ foto, emu }, i) => {
    if (!fuegeKantenEin(trafo.x, [[foto[1], emu.x], [foto[3], emu.x + emu.w]], gs.w * 0.01)) ohneX.push(i)
    if (!fuegeKantenEin(trafo.y, [[foto[0], emu.y], [foto[2], emu.y + emu.h]], gs.h * 0.01)) ohneY.push(i)
  })
  return { trafo, ohneX, ohneY }
}

/** Lineare Ausgleichsgerade je Achse – nur zur Diagnose (Abweichung je Bezug). */
function linear(paare: Paar[]): Trafo | null {
  const gerade = (werte: [number, number][]): Stuetzpunkt[] | null => {
    const n = werte.length
    const mu = werte.reduce((s, p) => s + p[0], 0) / n
    const mz = werte.reduce((s, p) => s + p[1], 0) / n
    let sxx = 0
    let sxy = 0
    for (const [u, z] of werte) {
      sxx += (u - mu) ** 2
      sxy += (u - mu) * (z - mz)
    }
    if (sxx < 1e-6 || sxy <= 0) return null
    const a = sxy / sxx
    return [
      [0, mz - a * mu],
      [1000, mz + a * (1000 - mu)],
    ]
  }
  const x = gerade(paare.flatMap(({ foto, emu }) => [[foto[1], emu.x], [foto[3], emu.x + emu.w]] as [number, number][]))
  const y = gerade(paare.flatMap(({ foto, emu }) => [[foto[0], emu.y], [foto[2], emu.y + emu.h]] as [number, number][]))
  return x && y ? { x, y } : null
}

/** Mittlere Kantenabweichung in % der Grundstücksbreite/-höhe. */
function fehlerProzent(p: Paar, t: Trafo, gs: Rechteck): number {
  const r = boxZuEmu(p.foto, t)
  const dx = (Math.abs(r.x - p.emu.x) + Math.abs(r.x + r.w - (p.emu.x + p.emu.w))) / 2 / gs.w
  const dy = (Math.abs(r.y - p.emu.y) + Math.abs(r.y + r.h - (p.emu.y + p.emu.h))) / 2 / gs.h
  return ((dx + dy) / 2) * 100
}

// ---------------------------------------------------------------- Zuordnung

export interface Zuordnung {
  element: SkizzenElement
  /** zugeordnetes Bau-Objekt („vorhanden“) oder undefined („neu“) */
  bau?: BauObjekt
  neu: boolean
  /** Lage in EMU nach Transformation */
  emu: Rechteck
}

export interface Bezug {
  klasse: Klasse
  fotoLabel: string
  bauLabel: string
  /** Abweichung zur linearen Ausgleichsgeraden in % (zeigt, wie unproportional die Skizze ist) */
  fehlerProzent: number
  /** Kanten, die als Stützpunkt genutzt wurden */
  achsen: 'xy' | 'x' | 'y' | '–'
}

export interface Ausrichtung {
  methode: 'bezug' | 'rahmen' | 'bild'
  trafo: Trafo
  bezuege: Bezug[]
  /** Foto-Elemente, die einem Bezugsgebäude zugeordnet sind */
  bezugElemente: SkizzenElement[]
  /** mittlere Abweichung der Bezüge zur linearen Ausgleichsgeraden in % */
  restfehlerProzent: number | null
  zuordnungen: Zuordnung[]
  grundstueck: Rechteck
  hinweise: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')

/** Wählt unter mehreren Bau-Objekten derselben Klasse: gleiche Beschriftung, sonst nächstgelegen. */
function waehle(e: SkizzenElement, kandidaten: BauObjekt[], t: Trafo): BauObjekt | undefined {
  if (kandidaten.length <= 1) return kandidaten[0]
  const gleich = kandidaten.filter((k) => norm(k.label) === norm(e.beschriftung))
  if (gleich.length === 1) return gleich[0]
  const m = mitte(boxZuEmu(e.box_2d, t))
  return (gleich.length ? gleich : kandidaten)
    .map((k) => ({ k, d: Math.hypot(mitte(k.rechteck).x - m.x, mitte(k.rechteck).y - m.y) }))
    .sort((a, b) => a.d - b.d)[0].k
}

export function richteAus(
  elemente: SkizzenElement[],
  fotoRahmen: Box2d | null,
  formen: BauForm[],
): Ausrichtung {
  const { grundstueck: gs, objekte } = erkenneBauObjekte(formen)
  const hinweise: string[] = []
  const rahmenPaar: Paar = { foto: fotoRahmen ?? [0, 0, 1000, 1000], emu: gs }
  const startTrafo = stuetzpunkte([rahmenPaar], gs).trafo

  // 1. Bezugsgebäude zuordnen (jedes Bau-Objekt höchstens einmal)
  const belegt = new Set<BauObjekt>()
  const bezugsPaare: { e: SkizzenElement; bau: BauObjekt }[] = []
  for (const e of elemente) {
    const k = klasseVonElement(e)
    if (!k || !BEZUGS_KLASSEN.includes(k)) continue
    const bau = waehle(e, objekte.filter((o) => o.klasse === k && !belegt.has(o)), startTrafo)
    if (!bau) continue
    belegt.add(bau)
    bezugsPaare.push({ e, bau })
  }

  // 2. Stützpunkte: größere Gebäude zuerst, Grundstücksrahmen zuletzt
  let methode: Ausrichtung['methode'] = 'bezug'
  let trafo: Trafo
  const paar = (x: { e: SkizzenElement; bau: BauObjekt }): Paar => ({ foto: x.e.box_2d, emu: x.bau.rechteck })
  const nachGroesse = [...bezugsPaare].sort((a, b) => flaeche(b.bau.rechteck) - flaeche(a.bau.rechteck))
  let achsen = new Map<SkizzenElement, Bezug['achsen']>()
  if (bezugsPaare.length >= 2) {
    const s = stuetzpunkte([...nachGroesse.map(paar), ...(fotoRahmen ? [rahmenPaar] : [])], gs)
    trafo = s.trafo
    achsen = new Map(
      nachGroesse.map((x, i) => {
        const ox = s.ohneX.includes(i)
        const oy = s.ohneY.includes(i)
        return [x.e, ox && oy ? '–' : ox ? 'y' : oy ? 'x' : 'xy']
      }),
    )
    if (trafo.x.length < 2 || trafo.y.length < 2) {
      methode = fotoRahmen ? 'rahmen' : 'bild'
      trafo = startTrafo
      hinweise.push('Bezugsgebäude widersprüchlich – Ausrichtung über Grundstücksrahmen')
    }
  } else {
    methode = fotoRahmen ? 'rahmen' : 'bild'
    trafo = startTrafo
    hinweise.push(
      `nur ${bezugsPaare.length} Bezugsgebäude – Ausrichtung über ${fotoRahmen ? 'Grundstücksrahmen' : 'ganzes Foto (kein Rahmen erkannt)'}`,
    )
  }

  const lin = bezugsPaare.length >= 2 ? linear(bezugsPaare.map(paar)) : null
  const bezuege: Bezug[] = bezugsPaare.map((x) => ({
    klasse: x.bau.klasse,
    fotoLabel: x.e.beschriftung || x.e.typ,
    bauLabel: x.bau.label,
    fehlerProzent: lin ? fehlerProzent(paar(x), lin, gs) : NaN,
    achsen: methode === 'bezug' ? (achsen.get(x.e) ?? '–') : '–',
  }))
  const restfehlerProzent = lin ? bezuege.reduce((s, b) => s + b.fehlerProzent, 0) / bezuege.length : null
  for (const b of bezuege.filter((b) => b.achsen !== 'xy' && methode === 'bezug')) {
    hinweise.push(`Bezug ${b.fotoLabel} ↔ ${b.bauLabel}: ${b.achsen === '–' ? 'keine Kante' : `nur ${b.achsen}`} genutzt (deckungsgleich mit oder widersprüchlich zu größerem Gebäude)`)
  }

  // 3. Übrige Elemente: vorhanden (Brunnen, Zugang … schon in den Bau-Formen) oder neu
  const bezugVon = new Map(bezugsPaare.map((x) => [x.e, x.bau]))
  const zuordnungen: Zuordnung[] = elemente.map((e) => {
    const emu = boxZuEmu(e.box_2d, trafo)
    let bau = bezugVon.get(e)
    const k = klasseVonElement(e)
    if (!bau && k && !BEZUGS_KLASSEN.includes(k)) {
      bau = waehle(e, objekte.filter((o) => o.klasse === k), trafo)
    }
    if (!bau && k && BEZUGS_KLASSEN.includes(k)) {
      hinweise.push(`${e.typ} „${e.beschriftung}“ hat kein Gegenstück in den Bau-Formen → als neu gesetzt`)
    }
    return { element: e, bau, neu: !bau, emu }
  })

  return {
    methode,
    trafo,
    bezuege,
    bezugElemente: bezugsPaare.map((x) => x.e),
    restfehlerProzent,
    zuordnungen,
    grundstueck: gs,
    hinweise,
  }
}
