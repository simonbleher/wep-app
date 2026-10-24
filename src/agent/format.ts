/**
 * Formate der Agent-Schnittstelle `window.wep` (siehe docs/WEP-SCHNITTSTELLE.md).
 *
 * Alle Längen sind Meter auf der Parzelle: Ursprung links oben, x nach rechts, y nach unten. Die Typen hier beschreiben
 * die Rückgaben von `lesen()`, den Skizzen-Vorschlag und die Ergebnisse von `vorschlagen()` / `status()`. Das JSON-Schema
 * dazu liefert `schema()` (`schema.ts`); beides muss zusammenpassen (Test `schnittstelle.test.ts`).
 */
import type { Dachform } from '../skizze/grundriss'
import type { Linienart, SymbolArt } from '../skizze/types'

/** Version der Schnittstelle (Rückgaben von `lesen()`, `schema()`, `status()`). */
export const SCHNITTSTELLE_VERSION = 'wep-schnittstelle/1'
/** Version des Skizzen-Vorschlags (Elementformat). */
export const SKIZZE_FORMAT = 'wep-skizze/1'

export type Modus = 'ergaenzen' | 'gruen-ersetzen'
export const MODI: readonly Modus[] = ['ergaenzen', 'gruen-ersetzen']

export type BezugsListe = 'aufwuchs' | 'aussenanlagen' | 'beseitigung'
export const BEZUGS_LISTEN: readonly BezugsListe[] = ['aufwuchs', 'aussenanlagen', 'beseitigung']

/** Elementtypen des Vorschlags: die Symbole der App plus Formen und Linien. */
export const FORM_TYPEN = ['rechteck', 'ellipse', 'vieleck', 'linie', 'massangabe', 'text'] as const
export type FormTypName = (typeof FORM_TYPEN)[number]

export interface MPunkt {
  x: number
  y: number
}

export interface Bezug {
  liste: BezugsListe
  id: string
}

/** Ein Element der Grün-Skizze im Format `wep-skizze/1` (Meter; `x`/`y` = Mittelpunkt). */
export interface FormatElement {
  typ: SymbolArt | FormTypName
  /** Nur in `lesen()`: Kennung des vorhandenen Elements. Im Vorschlag wird sie ignoriert (die App vergibt neue). */
  id?: string
  x?: number
  y?: number
  breite?: number
  hoehe?: number
  beschriftung?: string
  bezug?: Bezug
  /** Mängelhinweis: Punkt, auf den der Pfeil zeigt. */
  ziel?: MPunkt
  /** Vieleck: Eckpunkte (absolut, Meter). */
  punkte?: MPunkt[]
  /** Linie, Maßangabe: Anfang und Ende. */
  von?: MPunkt
  nach?: MPunkt
  /** rechteck, ellipse, vieleck: Kurzname einer Vorgabe (`stile.vorgaben`), Einzelangaben darunter überschreiben sie. */
  stil?: string
  fuellung?: string | null
  linie?: string
  linienart?: Linienart
  /** Linie: Farbe und Pfeilspitze am Ende. */
  farbe?: string
  pfeil?: boolean
  /** Text: der Text. */
  inhalt?: string
}

export interface FormatFehler {
  /** Pfad im Vorschlag, z. B. `elemente[2].fuellung`. */
  pfad: string
  meldung: string
}

export interface VorschlagErgebnis {
  ok: boolean
  fehler: FormatFehler[]
  /** Hinweise, die nichts verhindern (Element außerhalb der Parzelle, Position ohne Element …). */
  hinweise: string[]
  /** Kurzer deutscher Satz, was angezeigt wird (oder warum nichts). */
  zusammenfassung: string
  /** Anzahl der Elemente des Vorschlags. */
  anzahl: number
}

export type VorschlagZustand = 'kein-vorschlag' | 'offen' | 'uebernommen' | 'verworfen'

export interface StatusErgebnis {
  /** Wartet ein Vorschlag auf die Entscheidung des Nutzers? */
  offen: boolean
  zustand: VorschlagZustand
  /** Laufende Nummer des letzten Vorschlags (0 = noch keiner). */
  nr: number
  anzahl: number | null
  modus: Modus | null
  /** Zeitpunkt (ISO) der Entscheidung, sonst null. */
  entschiedenAm: string | null
}

export interface StilVorgabeInfo {
  id: string
  name: string
  fuellung: string | null
  linie: string
  linienart: Linienart
}

export interface ElementtypInfo {
  typ: string
  beschreibung: string
  /** Standardgröße in m (Breite, Höhe), falls `breite`/`hoehe` fehlen; null bei Formen ohne Standard. */
  standardgroesseM: { breite: number; hoehe: number } | null
}

export interface BauteilInfo {
  id: string
  kuerzel: string
  art: string
  bezeichnung: string | null
  laengeM: number | null
  breiteM: number | null
  hoeheM: number | null
  flaecheM2: number
  baujahr: number | null
  nichtBewerten: boolean
}

export interface GrundrissTeilInfo {
  kuerzel: string
  bauteilId: string | null
  /** Eckpunkte in m auf der Parzelle. */
  punkte: MPunkt[]
  flaecheM2: number
  gestrichelt: boolean
  dachform: Dachform | null
  traufhoeheM: number | null
  firsthoeheM: number | null
}

export interface GrundlageElementInfo {
  /** `grundstueck` · `bauteil` · `linie` · `text` */
  art: string
  beschriftung: string | null
  /** Eckpunkte (Grundstück, Bauteil) bzw. Anfang und Ende (Linie) in m auf der Parzelle. */
  punkte: MPunkt[]
  gestrichelt: boolean
}

export interface HinweisInfo {
  schwere: 'info' | 'warnung'
  text: string
}

export interface PositionInfo {
  id: string
  nr: number
  /** Vollständige Bezeichnung wie in der Liste. */
  bezeichnung: string
  /** Kurzname für die Skizze (Text vor dem ersten Komma bzw. der ersten Klammer). */
  art: string
  menge: number
  einheit: string
  zustand: string | null
  einzelpreis: number
  /** Aus der Bezeichnung gelesene Höhe in m, sonst null. */
  hoeheM: number | null
  invasiv: boolean
  problempflanze: boolean
  hinweise: HinweisInfo[]
}

export interface BeseitigungInfo {
  id: string
  nr: number
  gegenstand: string
  menge: number
  einheit: string
  einzelpreis: number
}

export interface LesenErgebnis {
  schemaVersion: typeof SCHNITTSTELLE_VERSION
  /** Format der Elemente in `skizzeGruen` (und des Vorschlags). */
  skizzeFormat: typeof SKIZZE_FORMAT
  wepId: string
  formalien: Record<string, string | number>
  rolle: 'gruen' | 'bau' | 'beides'
  parzelle: {
    vorhanden: boolean
    form: 'rechteck' | 'frei' | null
    /** Ecken in m (links oben = 0/0). */
    ecken: MPunkt[]
    flaecheM2: number | null
    vertragsflaecheM2: number | null
    /** Hinweistext, wenn berechnete Fläche und Vertragsfläche deutlich abweichen; sonst null. */
    flaechenHinweis: string | null
    breiteM: number | null
    hoeheM: number | null
    /** Hinweis, solange keine Parzelle angelegt oder berechenbar ist. */
    hinweis: string | null
  }
  bau: {
    vorhanden: boolean
    bauteile: BauteilInfo[]
    grundriss: GrundrissTeilInfo[]
  }
  grundlage: {
    vorhanden: boolean
    quelle: 'bau' | 'excel' | 'parzelle' | null
    gesperrt: boolean
    elemente: GrundlageElementInfo[]
    pfostenAnzahl: number
  }
  gruen: {
    aussenanlagen: PositionInfo[]
    aufwuchs: PositionInfo[]
    beseitigung: BeseitigungInfo[]
  }
  skizzeGruen: {
    /** Meter pro Zeichenpixel gelten nur mit Parzelle; ohne gilt eine Zeichenfläche von 20 × 15 m. */
    mitParzelle: boolean
    flaecheM: { breite: number; hoehe: number }
    elemente: FormatElement[]
  }
  stile: {
    elementtypen: ElementtypInfo[]
    vorgaben: StilVorgabeInfo[]
    fuellfarben: { name: string; wert: string }[]
    linienfarben: { name: string; wert: string }[]
    linienarten: Linienart[]
    bezugslisten: BezugsListe[]
    modi: Modus[]
  }
}
