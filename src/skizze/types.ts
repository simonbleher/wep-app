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

/** Verweis auf eine Position des WEP (Aufwuchs, Außenanlage, Beseitigung): Name und Art der Skizzenform folgen ihr. */
export interface PositionsBezug {
  liste: 'aufwuchs' | 'aussenanlagen' | 'beseitigung'
  /** `Position.id` bzw. `BeseitigungsPosition.id` */
  id: string
}

/** Linienart von Rahmen und Linien. */
export type Linienart = 'durchgezogen' | 'gestrichelt'

/** Basis-Felder, die alle Skizze-Elemente gemeinsam haben. */
interface ElementBasis {
  id: string
  /** Feste Elemente (z. B. Bau-Formen) ändert der Chat-Assistent nie. */
  fest?: boolean
  /** `grundlage`: gehört zur übernommenen Bau-Skizze (eigene Ebene unter dem Grün, siehe `SkizzeGrundlage`). */
  ebene?: 'grundlage'
  /** Verweis auf eine Position (z. B. Baum ↔ Aufwuchs-Position); gesetzt vom Skizzen-Vorschlag der Schnittstelle. */
  bezug?: PositionsBezug
  /** Sprechender Name („Stamm“, „Krone“, „Weg“) – wird zum Formnamen im Excel-Export. */
  name?: string
  /**
   * Frei gezeichnet (Schnittstelle): besteht aus Grundformen, die in der Reihenfolge der Liste übereinanderliegen; der Export legt sie
   * nicht um und weicht nicht aus. Fehlt das Feld, gilt das bisherige Verhalten.
   */
  frei?: boolean
}

/**
 * Aussehen ausgefüllter Formen (Rechteck, Kreis/Ellipse, Vieleck). Fehlt eine Angabe, gilt das bisherige Aussehen:
 * keine Füllung, dunkle durchgezogene Linie – bestehende Skizzen sehen deshalb unverändert aus.
 */
export interface SkizzeStil {
  /** Füllfarbe als `#RRGGBB`; fehlt = keine Füllung. */
  fuellung?: string
  /** Linienfarbe als `#RRGGBB`; fehlt = dunkelgrau (#1A1A1A). */
  linie?: string
  /** Fehlt = durchgezogen. */
  linienart?: Linienart
  /** Linienstärke in pt des Excel-Blatts (0,25 bis 6); fehlt = bisherige Stärke. */
  linienbreite?: number
}

/** Gefülltes Rechteck (z. B. Gebäude, Beet). */
export interface SkizzeRechteck extends ElementBasis, SkizzeStil {
  typ: 'rechteck'
  x: number
  y: number
  breite: number
  hoehe: number
  beschriftung?: string
}

/** Gerade Linie zwischen zwei Punkten, optional mit Farbe, Strichart und Pfeilspitze am Ende (x2, y2). */
export interface SkizzeLinie extends ElementBasis {
  typ: 'linie'
  x1: number
  y1: number
  x2: number
  y2: number
  farbe?: string
  linienart?: Linienart
  pfeil?: boolean
  /** Linienstärke in pt des Excel-Blatts; fehlt = bisherige Stärke. */
  linienbreite?: number
}

/** Kreis (im Lageplan: Baum-Symbol), optional mit Beschriftung; mit `radiusY` eine Ellipse (`radius` = waagerechter Halbmesser). */
export interface SkizzeKreis extends ElementBasis, SkizzeStil {
  typ: 'kreis'
  cx: number
  cy: number
  radius: number
  /** Senkrechter Halbmesser; fehlt = Kreis. */
  radiusY?: number
  beschriftung?: string
}

/** Geschlossenes Vieleck (frei gezeichnet oder aus der Schnittstelle), mindestens drei Eckpunkte in Skizzen-Pixeln. */
export interface SkizzeVieleck extends ElementBasis, SkizzeStil {
  typ: 'vieleck'
  punkte: { x: number; y: number }[]
  beschriftung?: string
  /** Offener Linienzug (Bogen, Zickzack) statt geschlossener Fläche: nie gefüllt. */
  offen?: boolean
}

/** Freitext auf der Zeichenfläche. */
export interface SkizzeText extends ElementBasis {
  typ: 'text'
  x: number
  y: number
  inhalt: string
  schriftgroesse?: number // Pixel, Standard 14
  /** Schriftfarbe `#RRGGBB`; fehlt = dunkelgrau. */
  farbe?: string
  /**
   * Drehung in Grad im Uhrzeigersinn um die Mitte des Textes (aus der Bau-Excel: z. B. 270 = senkrecht, von unten nach
   * oben lesbar); fehlt = waagerecht.
   */
  drehung?: number
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
  /** Farbe; fehlt = dunkelgrau (rot z. B. bei Maßlinien aus einer Bau-Excel). */
  farbe?: string
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
  /** Nur `mangelhinweis`: Punkt, auf den ein roter Pfeil vom Hinweisfeld zeigt (Skizzen-Pixel). */
  ziel?: { x: number; y: number }
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
  /** Füllfarbe aus einer eingelesenen Bau-Excel (`#RRGGBB`); fehlt = Standard der Art. */
  fuellung?: string
  /** Linienfarbe aus einer eingelesenen Bau-Excel; fehlt = Standard der Art. */
  linie?: string
}

/** Vereinigungs-Typ aller Skizze-Elemente. */
export type SkizzeElement =
  | SkizzeBauform
  | SkizzeSymbol
  | SkizzeRechteck
  | SkizzeVieleck
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
  /**
   * `bau`: Grundriss aus dem Bau-Teil · `excel`: Formen aus dem Blatt „Skizze Bau“ der Bau-Excel · `parzelle`: nur die Parzelle
   * (Grundstück, Pfosten; Beta 6, Paket 1), ohne Bauteile.
   */
  quelle: 'bau' | 'excel' | 'parzelle'
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
  /**
   * Maßstab und Lage der Parzelle auf der Leinwand (Beta 6, Paket 1): `px = ox + Meter · pxProM`. Gesetzt, sobald die Skizze auf
   * der Parzelle des WEP liegt (Leinwand 600 × 825); fehlt bei Skizzen von vor Beta 6, die weiter wie bisher angezeigt werden.
   */
  massstab?: SkizzeMassstab
}

/** Abbildung Meter → Leinwandpixel der Parzelle (siehe `src/parzelle/lage.ts`). */
export interface SkizzeMassstab {
  pxProM: number
  ox: number
  oy: number
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
