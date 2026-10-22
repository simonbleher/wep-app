/**
 * Grundriss mit echten Maßen (Beta 4, Paket 3) – reine Rechnung ohne DOM.
 *
 * Alle Koordinaten sind Meter (x nach rechts, y nach unten). Ein Teil des Grundrisses ist ein Polygon
 * (meist ein Rechteck) mit Höhen und Dachform; daraus rechnet der Code Fläche, Umfang, Maßketten und die
 * Kubatur (Massenberechnung). Der Editor (`GrundrissEditor`) zeigt es nur an; der Export schreibt es als
 * Excel-Formen in „Skizze Bau“ (`src/export/grundrissFormen.ts`).
 *
 * Die Grün-Skizze (`types.ts`, `SkizzeEditor`) kennt nichts davon und bleibt unverändert.
 */

export interface GPunkt {
  x: number
  y: number
}

export type Dachform = 'flach' | 'pult' | 'sattel'

export const DACHFORMEN: { id: Dachform; text: string; hilfe: string }[] = [
  { id: 'flach', text: 'Flachdach', hilfe: 'Eine Höhe überall; Kubatur = Fläche × Höhe.' },
  { id: 'pult', text: 'Pultdach', hilfe: 'Niedrige und hohe Wand; Kubatur = Fläche × Mittel der beiden Höhen.' },
  { id: 'sattel', text: 'Satteldach', hilfe: 'Traufhöhe und Firsthöhe; Kubatur = Fläche × Traufhöhe + Dachraum (Fläche × Firsthöhe über der Traufe ÷ 2).' },
]

export const dachformText = (d: Dachform | undefined): string => DACHFORMEN.find((x) => x.id === (d ?? 'flach'))!.text

/** Ein Teil des Grundrisses, meist ein Bauteil (L, A1, S, Ü1 …). */
export interface GrundrissTeil {
  id: string
  /** Kürzel auf der Skizze. Ist das Teil mit einem Bauteil verknüpft, gilt dessen Kürzel (`kuerzelVon`). */
  kuerzel: string
  /** Verknüpftes Bauteil aus Paket 2 (`Bauteil.id`); dessen Fläche und Kubatur kommen aus diesem Teil. */
  bauteilId?: string
  /** Eckpunkte im Uhrzeigersinn oder dagegen, mindestens 3, in Metern. */
  punkte: GPunkt[]
  /** Wandhöhe in m (Traufhöhe; beim Pultdach die niedrige Wand). */
  hoehe?: number
  dachform?: Dachform
  /** Pultdach: hohe Wand, Satteldach: Firsthöhe – jeweils in m über dem Fußboden. */
  hoeheOben?: number
  /** Gestrichelt zeichnen (Keller, Hauswasser). */
  gestrichelt?: boolean
}

export interface GrundrissDaten {
  teile: GrundrissTeil[]
  /** Raster einblenden (Standard: ja). */
  raster?: boolean
  /** Maßketten einblenden und exportieren (Standard: ja). */
  massketten?: boolean
}

export function leererGrundriss(): GrundrissDaten {
  return { teile: [], raster: true, massketten: true }
}

/** Zeichenfläche des Editors in Metern; die Ansicht (Zoom) schneidet daraus einen Ausschnitt. */
export const FLAECHE_M = { breite: 20, hoehe: 15 } as const

let _zaehler = 0
export function neueTeilId(): string {
  _zaehler += 1
  return `gt-${Date.now().toString(36)}-${_zaehler}`
}

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

/** Auf Zentimeter runden (Meter mit zwei Stellen). */
export const cm = (n: number): number => Math.round(n * 100) / 100

const EPS = 0.005

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const DE2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

/** „4,5“ bzw. „3,25“ – ohne überflüssige Nullen. */
export const zahlText = (n: number): string => DE.format(cm(n))
/** „24,00“ – immer zwei Stellen (Flächen, Kubatur). */
export const zahl2Text = (n: number): string => DE2.format(Math.round(n * 100) / 100)
/** „4,5 m“ */
export const meterText = (n: number): string => `${zahlText(n)} m`

// ---------------------------------------------------------------------------
// Polygon
// ---------------------------------------------------------------------------

export function rechteckPunkte(x: number, y: number, breite: number, hoehe: number): GPunkt[] {
  return [
    { x, y },
    { x: x + breite, y },
    { x: x + breite, y: y + hoehe },
    { x, y: y + hoehe },
  ]
}

/** Fläche in m² (Gauß’sche Trapezformel, immer positiv). */
export function flaecheVon(punkte: readonly GPunkt[]): number {
  let s = 0
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[(i + 1) % punkte.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export const abstandG = (a: GPunkt, b: GPunkt): number => Math.hypot(b.x - a.x, b.y - a.y)

/** Länge der Kante `i` (von Punkt `i` zu Punkt `i+1`) in m. */
export function kantenLaenge(punkte: readonly GPunkt[], i: number): number {
  return abstandG(punkte[i], punkte[(i + 1) % punkte.length])
}

export function umfangVon(punkte: readonly GPunkt[]): number {
  return punkte.reduce((s, _p, i) => s + kantenLaenge(punkte, i), 0)
}

export function umgebendesRechteck(punkte: readonly GPunkt[]): { x1: number; y1: number; x2: number; y2: number } {
  const xs = punkte.map((p) => p.x)
  const ys = punkte.map((p) => p.y)
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}

/** Schwerpunkt der Fläche (bei entartetem Polygon der Mittelwert der Ecken). */
export function schwerpunktVon(punkte: readonly GPunkt[]): GPunkt {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i]
    const q = punkte[(i + 1) % punkte.length]
    const k = p.x * q.y - q.x * p.y
    a += k
    cx += (p.x + q.x) * k
    cy += (p.y + q.y) * k
  }
  if (Math.abs(a) < 1e-9) {
    return { x: punkte.reduce((s, p) => s + p.x, 0) / punkte.length, y: punkte.reduce((s, p) => s + p.y, 0) / punkte.length }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

/** Liegt der Punkt im Polygon (Strahlverfahren)? */
export function punktImPolygon(p: GPunkt, punkte: readonly GPunkt[]): boolean {
  let innen = false
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[i]
    const b = punkte[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) innen = !innen
  }
  return innen
}

/** Abstand eines Punktes von der Strecke a–b. */
export function abstandZuStrecke(p: GPunkt, a: GPunkt, b: GPunkt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return abstandG(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return abstandG(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Nächste Kante zum Punkt innerhalb `toleranz` (Index der Kante) oder -1. */
export function naechsteKante(punkte: readonly GPunkt[], p: GPunkt, toleranz: number): number {
  let best = -1
  let bestAbstand = toleranz
  for (let i = 0; i < punkte.length; i++) {
    const d = abstandZuStrecke(p, punkte[i], punkte[(i + 1) % punkte.length])
    if (d <= bestAbstand) {
      best = i
      bestAbstand = d
    }
  }
  return best
}

/** Nächste Ecke zum Punkt innerhalb `toleranz` (Index) oder -1. */
export function naechsteEcke(punkte: readonly GPunkt[], p: GPunkt, toleranz: number): number {
  let best = -1
  let bestAbstand = toleranz
  punkte.forEach((q, i) => {
    const d = abstandG(p, q)
    if (d <= bestAbstand) {
      best = i
      bestAbstand = d
    }
  })
  return best
}

const waagerecht = (a: GPunkt, b: GPunkt) => Math.abs(a.y - b.y) < EPS
const senkrecht = (a: GPunkt, b: GPunkt) => Math.abs(a.x - b.x) < EPS

/** Sind alle Kanten waagerecht oder senkrecht (Rechteck, L-Form …)? */
export function istRechtwinklig(punkte: readonly GPunkt[]): boolean {
  return punkte.every((p, i) => {
    const q = punkte[(i + 1) % punkte.length]
    return waagerecht(p, q) || senkrecht(p, q)
  })
}

/** Rechteck (4 Ecken, rechte Winkel, auch gedreht) → Länge (die längere Seite) und Breite, sonst `undefined`. */
export function rechteckMasse(punkte: readonly GPunkt[]): { laenge: number; breite: number } | undefined {
  if (punkte.length !== 4) return undefined
  const [a, b, c, d] = punkte
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const bc = { x: c.x - b.x, y: c.y - b.y }
  const la = Math.hypot(ab.x, ab.y)
  const lb = Math.hypot(bc.x, bc.y)
  if (la < EPS || lb < EPS) return undefined
  const rechterWinkel = Math.abs(ab.x * bc.x + ab.y * bc.y) / (la * lb) < 0.01
  const parallelogramm = Math.abs(a.x + c.x - (b.x + d.x)) < 0.01 && Math.abs(a.y + c.y - (b.y + d.y)) < 0.01
  if (!rechterWinkel || !parallelogramm) return undefined
  return { laenge: cm(Math.max(la, lb)), breite: cm(Math.min(la, lb)) }
}

// ---------------------------------------------------------------------------
// Maße ändern: Länge eintippen → Form passt sich an
// ---------------------------------------------------------------------------

/**
 * Setzt die Länge der Kante `i` (Punkt `i` → Punkt `i+1`) auf `laenge` Meter. Punkt `i` bleibt stehen.
 *
 * - Ist die Kante waagerecht oder senkrecht und das Polygon rechtwinklig (Rechteck, L-Form …), wandern alle
 *   Ecken, die „hinter“ der Kante liegen, mit: Die gegenüberliegende Seite wird verschoben, die Form bleibt
 *   rechtwinklig.
 * - Sonst wandert nur der Endpunkt der Kante entlang der Kante; die Nachbarkanten ändern sich mit.
 *
 * Ungültige Längen (≤ 0, keine Zahl) ändern nichts.
 */
export function setzeKantenLaenge(punkte: readonly GPunkt[], i: number, laenge: number): GPunkt[] {
  const n = punkte.length
  const a = punkte[i]
  const b = punkte[(i + 1) % n]
  const alt = abstandG(a, b)
  if (!Number.isFinite(laenge) || laenge <= 0 || alt < EPS) return punkte.map((p) => ({ ...p }))
  const ziel = cm(laenge)
  const ux = (b.x - a.x) / alt
  const uy = (b.y - a.y) / alt
  const delta = ziel - alt
  const kopie = punkte.map((p) => ({ ...p }))
  if (istRechtwinklig(punkte) && (waagerecht(a, b) || senkrecht(a, b))) {
    // Projektion auf die Richtung der Kante: alles, was mindestens so weit „vorn“ liegt wie der Endpunkt, wandert
    const t = (p: GPunkt) => (p.x - a.x) * ux + (p.y - a.y) * uy
    const grenze = t(b) - EPS
    for (const p of kopie) {
      if (t(p) >= grenze) {
        p.x = cm(p.x + ux * delta)
        p.y = cm(p.y + uy * delta)
      }
    }
    return kopie
  }
  const j = (i + 1) % n
  kopie[j] = { x: cm(a.x + ux * ziel), y: cm(a.y + uy * ziel) }
  return kopie
}

/** Rechteck: Länge und Breite setzen (Länge = längere Seite, Ecke 0 bleibt, Lage der Seiten bleibt). */
export function setzeRechteckMasse(punkte: readonly GPunkt[], laenge?: number, breite?: number): GPunkt[] {
  const m = rechteckMasse(punkte)
  if (!m) return punkte.map((p) => ({ ...p }))
  let r = punkte.map((p) => ({ ...p }))
  const erste = kantenLaenge(r, 0) >= kantenLaenge(r, 1) ? 'laenge' : 'breite'
  const kante0 = erste === 'laenge' ? laenge : breite
  const kante1 = erste === 'laenge' ? breite : laenge
  if (kante0) r = setzeKantenLaenge(r, 0, kante0)
  if (kante1) r = setzeKantenLaenge(r, 1, kante1)
  return r
}

/**
 * Verschiebt Ecke `i` nach `neu`. Waren die anliegenden Kanten waagerecht/senkrecht, bleiben sie es (die
 * Nachbarecken folgen): So bleibt ein Rechteck beim Ziehen an einer Ecke ein Rechteck.
 */
export function bewegeEcke(punkte: readonly GPunkt[], i: number, neu: GPunkt): GPunkt[] {
  const n = punkte.length
  const kopie = punkte.map((p) => ({ ...p }))
  const vor = (i + n - 1) % n
  const nach = (i + 1) % n
  const alt = punkte[i]
  if (waagerecht(punkte[vor], alt)) kopie[vor].y = neu.y
  else if (senkrecht(punkte[vor], alt)) kopie[vor].x = neu.x
  if (waagerecht(alt, punkte[nach])) kopie[nach].y = neu.y
  else if (senkrecht(alt, punkte[nach])) kopie[nach].x = neu.x
  kopie[i] = { x: neu.x, y: neu.y }
  return kopie.map((p) => ({ x: cm(p.x), y: cm(p.y) }))
}

export function verschiebePunkte(punkte: readonly GPunkt[], dx: number, dy: number): GPunkt[] {
  return punkte.map((p) => ({ x: cm(p.x + dx), y: cm(p.y + dy) }))
}

// ---------------------------------------------------------------------------
// Massenberechnung (Fläche und Kubatur nach Dachform)
// ---------------------------------------------------------------------------

export interface Massen {
  /** Grundfläche in m² (Außenmaße). */
  flaeche: number
  umfang: number
  dachform: Dachform
  /** Wandhöhe/Traufhöhe in m, falls angegeben. */
  hoehe?: number
  /** Höchster Punkt in m (Pultdach: hohe Wand, Satteldach: First, Flachdach: Wandhöhe). */
  hoeheOben?: number
  /** Mittlere Höhe = Kubatur ÷ Fläche. */
  mittlereHoehe?: number
  /** Kubatur bis zur Traufe (Fläche × Wandhöhe) in m³. */
  raumM3?: number
  /** Dachraum über der Traufe in m³ (Pultdach: Keil, Satteldach: Prisma). */
  dachraumM3?: number
  /** Umbauter Raum insgesamt in m³; fehlt, solange die Höhe fehlt. */
  kubaturM3?: number
  /** Hinweise (nur Warnungen, nichts wird gesperrt). */
  hinweise: string[]
}

const rund2 = (n: number) => Math.round(n * 100) / 100

/**
 * Fläche und Kubatur eines Teils.
 *
 * - Flachdach: Fläche × Höhe.
 * - Pultdach: Fläche × (niedrige + hohe Wand) ÷ 2.
 * - Satteldach: Fläche × Traufhöhe + Fläche × (Firsthöhe − Traufhöhe) ÷ 2.
 *
 * Pult- und Satteldach gelten exakt für ein Rechteck mit durchgehender Dachneigung; bei anderen Grundrissen
 * ist es eine Näherung (der Hinweis steht in `hinweise`). Fehlt `hoeheOben`, gilt das Dach als flach.
 */
export function massenVon(teil: Pick<GrundrissTeil, 'punkte' | 'hoehe' | 'dachform' | 'hoeheOben'>): Massen {
  const flaeche = rund2(flaecheVon(teil.punkte))
  const umfang = rund2(umfangVon(teil.punkte))
  const dachform = teil.dachform ?? 'flach'
  const hinweise: string[] = []
  const h = teil.hoehe && teil.hoehe > 0 ? teil.hoehe : undefined
  const o = teil.hoeheOben && teil.hoeheOben > 0 ? teil.hoeheOben : undefined
  const m: Massen = { flaeche, umfang, dachform, hinweise }
  if (h === undefined) {
    hinweise.push('Höhe fehlt – die Kubatur wird erst mit der Höhe berechnet.')
    return m
  }
  m.hoehe = h
  const oben = dachform === 'flach' ? h : (o ?? h)
  if (dachform !== 'flach' && o === undefined) {
    hinweise.push(`${dachform === 'pult' ? 'Hohe Wand' : 'Firsthöhe'} fehlt – gerechnet wie Flachdach.`)
  }
  if (oben < h) {
    hinweise.push(`${dachform === 'pult' ? 'Die hohe Wand' : 'Die Firsthöhe'} (${meterText(oben)}) ist niedriger als die Wandhöhe (${meterText(h)}) – bitte prüfen.`)
  }
  if (dachform !== 'flach' && !rechteckMasse(teil.punkte)) {
    hinweise.push('Kein Rechteck: Dachraum als Näherung (Fläche × Höhenunterschied ÷ 2).')
  }
  m.hoeheOben = oben
  m.raumM3 = rund2(flaeche * h)
  m.dachraumM3 = rund2(flaeche * Math.max(0, oben - h) * 0.5)
  m.kubaturM3 = rund2(m.raumM3 + m.dachraumM3)
  m.mittlereHoehe = flaeche > 0 ? rund2(m.kubaturM3 / flaeche) : h
  return m
}

export interface MassenZeile extends Massen {
  teil: GrundrissTeil
  kuerzel: string
  /** „4 × 6 m“ bei Rechtecken. */
  masseText: string
}

export interface Massenberechnung {
  zeilen: MassenZeile[]
  flaecheSumme: number
  /** Summe der Kubatur aller Teile, die eine Höhe haben. */
  kubaturSumme: number
}

/** Kürzel eines Teils: das des verknüpften Bauteils, sonst das gespeicherte. */
export function kuerzelVon(teil: GrundrissTeil, bauteile: ReadonlyArray<{ id: string; kuerzel: string }> = []): string {
  const b = teil.bauteilId ? bauteile.find((x) => x.id === teil.bauteilId) : undefined
  return (b?.kuerzel || teil.kuerzel || '?').trim()
}

export function massenberechnung(daten: GrundrissDaten, bauteile: ReadonlyArray<{ id: string; kuerzel: string }> = []): Massenberechnung {
  const zeilen = daten.teile.map((teil): MassenZeile => {
    const r = rechteckMasse(teil.punkte)
    return {
      ...massenVon(teil),
      teil,
      kuerzel: kuerzelVon(teil, bauteile),
      masseText: r ? `${zahlText(r.laenge)} × ${zahlText(r.breite)} m` : `${teil.punkte.length} Ecken`,
    }
  })
  return {
    zeilen,
    flaecheSumme: rund2(zeilen.reduce((s, z) => s + z.flaeche, 0)),
    kubaturSumme: rund2(zeilen.reduce((s, z) => s + (z.kubaturM3 ?? 0), 0)),
  }
}

/** Eine Zeile der Massenberechnung als Text (Export und Anzeige), z. B. „L · 4 × 6 m = 24,00 m² · Satteldach 2,2 / 3,1 m · 63,60 m³“. */
export function massenZeileText(z: MassenZeile): string {
  const hoehen =
    z.hoehe === undefined
      ? 'Höhe fehlt'
      : z.dachform === 'flach'
        ? `Flachdach ${zahlText(z.hoehe)} m`
        : z.dachform === 'pult'
          ? `Pultdach ${zahlText(z.hoehe)} / ${zahlText(z.hoeheOben ?? z.hoehe)} m`
          : `Satteldach Traufe ${zahlText(z.hoehe)} / First ${zahlText(z.hoeheOben ?? z.hoehe)} m`
  return `${z.kuerzel} · ${z.masseText} = ${zahl2Text(z.flaeche)} m² · ${hoehen}${z.kubaturM3 !== undefined ? ` · ${zahl2Text(z.kubaturM3)} m³` : ''}`
}

/** Alle Teile eines Bauteils zusammen (eine Laube kann aus zwei Rechtecken bestehen). */
export interface BauteilMassen {
  bauteilId: string
  flaeche: number
  /** Nur bei genau einem Rechteck. */
  laenge?: number
  breite?: number
  /** Höchster Punkt (Gewächshaus: Firsthöhe). */
  hoeheMax?: number
  /** Mittlere Höhe (Kubatur ÷ Fläche); nur wenn alle Teile eine Höhe haben. */
  hoeheMittel?: number
  kubaturM3?: number
}

export function massenJeBauteil(daten: GrundrissDaten): BauteilMassen[] {
  const gruppen = new Map<string, GrundrissTeil[]>()
  for (const t of daten.teile) {
    if (!t.bauteilId) continue
    gruppen.set(t.bauteilId, [...(gruppen.get(t.bauteilId) ?? []), t])
  }
  return [...gruppen].map(([bauteilId, teile]) => {
    const ms = teile.map(massenVon)
    const flaeche = rund2(ms.reduce((s, m) => s + m.flaeche, 0))
    const alleMitHoehe = ms.every((m) => m.kubaturM3 !== undefined)
    const r = teile.length === 1 ? rechteckMasse(teile[0].punkte) : undefined
    const kubatur = alleMitHoehe ? rund2(ms.reduce((s, m) => s + (m.kubaturM3 ?? 0), 0)) : undefined
    const hoeheMax = alleMitHoehe ? Math.max(...ms.map((m) => m.hoeheOben ?? 0)) : undefined
    return {
      bauteilId,
      flaeche,
      ...(r ? { laenge: r.laenge, breite: r.breite } : {}),
      ...(hoeheMax !== undefined ? { hoeheMax } : {}),
      ...(kubatur !== undefined && flaeche > 0 ? { hoeheMittel: rund2(kubatur / flaeche), kubaturM3: kubatur } : {}),
    }
  })
}

// ---------------------------------------------------------------------------
// Maßketten
// ---------------------------------------------------------------------------

export type MassArt = 'kette-x' | 'kette-y' | 'gesamt-x' | 'gesamt-y' | 'schraeg'

/** Eine Maßlinie: von → nach mit Text, in Metern. */
export interface Massbild {
  art: MassArt
  von: GPunkt
  nach: GPunkt
  text: string
  /** Länge in m (Zahl hinter dem Text). */
  wert: number
}

/** Abstände der Maßketten vom Grundriss in m; `gesamtY` fehlt = wie `gesamt` (der Export braucht rechts mehr Platz für die Zahlen). */
export interface Kettenabstaende {
  kette: number
  gesamt: number
  gesamtY?: number
}

/** Abstand der ersten Maßkette vom Grundriss in m. */
export const KETTE_ABSTAND = 0.7
/** Abstand der Gesamtmaß-Linie hinter der Kette in m. */
export const KETTE_ABSTAND_GESAMT = 1.4
/** Rechts steht die Zahl neben der Kette; das Gesamtmaß liegt weiter außen. */
export const KETTE_ABSTAND_GESAMT_Y = 2.2
/** Eckpunkte, die näher als dies beieinanderliegen, zählen als dieselbe Stelle. */
const KETTE_TOLERANZ = 0.03

function eindeutig(werte: number[]): number[] {
  const sortiert = [...werte].sort((a, b) => a - b)
  const out: number[] = []
  for (const w of sortiert) if (!out.length || w - out[out.length - 1] > KETTE_TOLERANZ) out.push(w)
  return out
}

/**
 * Maßketten über alle Teile: unter dem Grundriss die Kette der x-Koordinaten aller Ecken (Teilstrecken),
 * rechts daneben die der y-Koordinaten, jeweils mit einer Gesamtmaß-Linie dahinter (ab drei Teilstrecken
 * bzw. wenn es mehrere gibt). Schräge Kanten bekommen ihr eigenes Maß parallel zur Kante.
 */
export function masskette(
  daten: GrundrissDaten,
  abstaende: Kettenabstaende = { kette: KETTE_ABSTAND, gesamt: KETTE_ABSTAND_GESAMT, gesamtY: KETTE_ABSTAND_GESAMT_Y },
): Massbild[] {
  if (!daten.teile.length) return []
  const alle = daten.teile.flatMap((t) => t.punkte)
  const r = umgebendesRechteck(alle)
  const out: Massbild[] = []

  const xs = eindeutig(alle.map((p) => p.x))
  const ys = eindeutig(alle.map((p) => p.y))
  const yKette = r.y2 + abstaende.kette
  const xKette = r.x2 + abstaende.kette
  for (let i = 0; i + 1 < xs.length; i++) {
    out.push({ art: 'kette-x', von: { x: xs[i], y: yKette }, nach: { x: xs[i + 1], y: yKette }, wert: cm(xs[i + 1] - xs[i]), text: meterText(xs[i + 1] - xs[i]) })
  }
  for (let i = 0; i + 1 < ys.length; i++) {
    out.push({ art: 'kette-y', von: { x: xKette, y: ys[i] }, nach: { x: xKette, y: ys[i + 1] }, wert: cm(ys[i + 1] - ys[i]), text: meterText(ys[i + 1] - ys[i]) })
  }
  if (xs.length > 2) {
    const g = xs[xs.length - 1] - xs[0]
    out.push({ art: 'gesamt-x', von: { x: xs[0], y: r.y2 + abstaende.gesamt }, nach: { x: xs[xs.length - 1], y: r.y2 + abstaende.gesamt }, wert: cm(g), text: meterText(g) })
  }
  if (ys.length > 2) {
    const g = ys[ys.length - 1] - ys[0]
    out.push({ art: 'gesamt-y', von: { x: r.x2 + (abstaende.gesamtY ?? abstaende.gesamt), y: ys[0] }, nach: { x: r.x2 + (abstaende.gesamtY ?? abstaende.gesamt), y: ys[ys.length - 1] }, wert: cm(g), text: meterText(g) })
  }

  // Schräge Kanten: eigenes Maß, 0,35 m nach außen versetzt
  for (const t of daten.teile) {
    const s = schwerpunktVon(t.punkte)
    t.punkte.forEach((a, i) => {
      const b = t.punkte[(i + 1) % t.punkte.length]
      if (waagerecht(a, b) || senkrecht(a, b)) return
      const l = abstandG(a, b)
      if (l < EPS) return
      let nx = -(b.y - a.y) / l
      let ny = (b.x - a.x) / l
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if ((m.x - s.x) * nx + (m.y - s.y) * ny < 0) {
        nx = -nx
        ny = -ny
      }
      const v = 0.35
      out.push({ art: 'schraeg', von: { x: a.x + nx * v, y: a.y + ny * v }, nach: { x: b.x + nx * v, y: b.y + ny * v }, wert: cm(l), text: meterText(l) })
    })
  }
  return out
}

/** Gesamte Ausdehnung inkl. Maßketten (für die Einpassung im Export). */
export function ausdehnungMitMassen(
  daten: GrundrissDaten,
  abstaende?: Kettenabstaende,
): { x1: number; y1: number; x2: number; y2: number } | undefined {
  if (!daten.teile.length) return undefined
  const r = umgebendesRechteck(daten.teile.flatMap((t) => t.punkte))
  if (daten.massketten === false) return r
  const extra = masskette(daten, abstaende).flatMap((m) => [m.von, m.nach])
  return extra.length ? umgebendesRechteck([...extra, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }]) : r
}

/** Nächstes freies Kürzel für eine Art von Teil, wenn kein Bauteil verknüpft ist (L, A1, A2, S …). */
export function freiesKuerzel(daten: GrundrissDaten, bevorzugt = 'L'): string {
  const belegt = new Set(daten.teile.map((t) => t.kuerzel))
  if (!belegt.has(bevorzugt)) return bevorzugt
  for (let i = 1; i < 100; i++) {
    const k = `${bevorzugt.replace(/\d+$/, '')}${i}`
    if (!belegt.has(k)) return k
  }
  return bevorzugt
}
