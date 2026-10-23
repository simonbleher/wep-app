/**
 * Typen für die Parzellenskizze (Aufgabe S1).
 *
 * Eine Skizze besteht aus einer geordneten Liste von Elementen. Jedes Element
 * hat einen eindeutigen Typ und eine eindeutige id. Das gesamte Objekt `SkizzeDaten`
 * wird als JSON in der WEP-Datei gespeichert und ist serialisierungsfähig.
 */

// ---------------------------------------------------------------------------
// Werkzeuge
// ---------------------------------------------------------------------------

/** Alle verfügbaren Zeichenwerkzeuge. */
export type SkizzeWerkzeug =
  | 'rechteck'
  | 'linie'
  | 'kreis'
  | 'text'
  | 'massangabe'
  | 'symbol'
  | 'auswahl'

// ---------------------------------------------------------------------------
// Elemente
// ---------------------------------------------------------------------------

/** Basis-Felder, die alle Skizze-Elemente gemeinsam haben. */
interface ElementBasis {
  id: string
  /** Feste Elemente (z. B. Bau-Formen) ändert der Chat-Assistent nie. */
  fest?: boolean
  /** `grundlage`: gehört zur übernommenen Bau-Skizze (eigene Ebene unter dem Grün, siehe `SkizzeGrundlage`). */
  ebene?: 'grundlage'
}

/** Gefülltes Rechteck (z. B. Gebäude, Beet). */
export interface SkizzeRechteck extends ElementBasis {
  typ: 'rechteck'
  x: number
  y: number
  breite: number
  hoehe: number
}

/** Gerade Linie zwischen zwei Punkten. */
export interface SkizzeLinie extends ElementBasis {
  typ: 'linie'
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Kreis (im Lageplan: Baum-Symbol), optional mit Beschriftung. */
export interface SkizzeKreis extends ElementBasis {
  typ: 'kreis'
  cx: number
  cy: number
  radius: number
  beschriftung?: string
}

/** Freitext auf der Zeichenfläche. */
export interface SkizzeText extends ElementBasis {
  typ: 'text'
  x: number
  y: number
  inhalt: string
  schriftgroesse?: number // Pixel, Standard 14
}

/**
 * Maßangabe: Bemaßungslinie mit Zahl in m.
 * Wird als Linie mit Endhaken und mittigem Label gezeichnet.
 */
export interface SkizzeMassangabe extends ElementBasis {
  typ: 'massangabe'
  x1: number
  y1: number
  x2: number
  y2: number
  /** Anzeigetext, z. B. „3,5 m". Frei eingebbar, wird nicht aus Koordinaten berechnet. */
  beschriftung: string
}

/** Piktogramme im Lageplan-Stil (Skill parzellen-skizze). */
export const SYMBOL_ARTEN = [
  'baum',
  'strauch',
  'wildling',
  'kletterpflanze',
  'hecke',
  'beet',
  'hochbeet',
  'blumenbeet',
  'rasen',
  'kompost',
  'brunnen',
  'schacht',
  'weg',
  'tor',
  'holzpferd',
  'schaukel',
  'gegenstand',
  'entfernen',
  'mangelhinweis',
] as const
export type SymbolArt = (typeof SYMBOL_ARTEN)[number]

/** Piktogramm in einem Kasten, mit Beschriftung (bei „gegenstand“ der Name). */
export interface SkizzeSymbol extends ElementBasis {
  typ: 'symbol'
  art: SymbolArt
  x: number
  y: number
  breite: number
  hoehe: number
  beschriftung?: string
}

/** Was eine Bauform der Grundlage darstellt (bestimmt Farbe und Ebene im Excel-Blatt). */
export type BauformArt = 'grundstueck' | 'bauteil' | 'pfosten'

/**
 * Geschlossene Form der Bau-Skizze (Beta 5, Paket 1): Grundstück, Gebäude, Anbau, Schuppen, Terrasse, Keller,
 * Pfosten. Rechtecke haben vier Punkte, L-Formen mehr. Gehört in der Regel zur Grundlage (`ebene: 'grundlage'`).
 */
export interface SkizzeBauform extends ElementBasis {
  typ: 'bauform'
  art: BauformArt
  /** Eckpunkte in Skizzen-Pixeln (mindestens 3). */
  punkte: { x: number; y: number }[]
  /** Beschriftung in der Form (Kürzel, Text aus der Bau-Excel); „\n“ = Zeilenumbruch. */
  beschriftung?: string
  /** Gestrichelt ohne Füllung (Keller, Hauswasser). */
  gestrichelt?: boolean
}

/** Vereinigungs-Typ aller Skizze-Elemente. */
export type SkizzeElement =
  | SkizzeBauform
  | SkizzeSymbol
  | SkizzeRechteck
  | SkizzeLinie
  | SkizzeKreis
  | SkizzeText
  | SkizzeMassangabe

// ---------------------------------------------------------------------------
// Grundlage (Bau-Skizze unter dem Grün)
// ---------------------------------------------------------------------------

/**
 * Angaben zur Grundlage. Die Formen selbst stehen am Anfang von `SkizzeDaten.elemente` (`ebene: 'grundlage'`);
 * hier steht, woher sie kommen und ob sie gegen versehentliches Verschieben gesperrt sind.
 */
export interface SkizzeGrundlage {
  /** `bau`: Grundriss aus dem Bau-Teil · `excel`: Formen aus dem Blatt „Skizze Bau“ der Bau-Excel. */
  quelle: 'bau' | 'excel'
  /** Zeitpunkt der Übernahme (ISO). */
  uebernommen: string
  /** Gesperrt: nicht auswählbar, nicht verschiebbar (Standard). Entsperrt: einzeln korrigierbar. */
  gesperrt: boolean
  /** Bei `excel`: Name der Bau-Excel. */
  excelName?: string
  /** Was nicht übernommen werden konnte (Bilder, Formen ohne Umrechnung …). */
  hinweise?: string[]
}

export const istGrundlage = (el: SkizzeElement): boolean => el.ebene === 'grundlage'

// ---------------------------------------------------------------------------
// Gesamt-Datenstruktur (wird auch in src/model/types.ts referenziert)
// ---------------------------------------------------------------------------

/**
 * Alle Daten einer Parzellenskizze.
 * Wird als `wep.skizze` gespeichert.
 */
export interface SkizzeDaten {
  /** Geordnete Liste der Zeichenelemente (hintere Elemente zuerst). */
  elemente: SkizzeElement[]
  /** Breite der Zeichenfläche in logischen Pixeln (Default 800). */
  breite?: number
  /** Höhe der Zeichenfläche in logischen Pixeln (Default 600). */
  hoehe?: number
  /** Raster einblenden? */
  raster?: boolean
  /** Rasterabstand in Pixeln (Default 40). */
  rasterGroesse?: number
  /** Herkunft und Sperre der Grundlage; fehlt, wenn keine Grundlage übernommen wurde. */
  grundlage?: SkizzeGrundlage
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen für neue Elemente
// ---------------------------------------------------------------------------

let _idZaehler = 0

/** Erzeugt eine einfache, eindeutige ID für ein neues Element. */
export function neueId(): string {
  _idZaehler += 1
  return `el-${Date.now()}-${_idZaehler}`
}

/** Leere SkizzeDaten (kein Element). */
export function leereSkizze(): SkizzeDaten {
  return { elemente: [], breite: 800, hoehe: 600, raster: true, rasterGroesse: 40 }
}
