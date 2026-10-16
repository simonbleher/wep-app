// Gemeinsame Datentypen der WEP-App.
//
// Ein WEP ist intern ein JSON-Objekt (nicht die Excel-Datei). Die hier
// definierten Typen sind für alle Bereiche verbindlich (siehe
// docs/ARCHITEKTUR.md). Änderungen nur per PR mit Begründung.

/**
 * Ein vollständiges Wertermittlungsprotokoll.
 * `id` entspricht der Vorgangs-Nr., z. B. "2026-999".
 */
export interface Wep {
  id: string // Vorgangs-Nr., z. B. "2026-999"
  formalien: Formalien
  gruen: {
    beschreibungAussen: string
    beschreibungAufwuchs: string
    aussenanlagen: Position[]
    aufwuchs: Position[]
    beseitigungAA: BeseitigungsPosition[]
  }
  bau?: unknown // später
  skizze?: SkizzeDaten
}

/**
 * Eine bewertete Position (Außenanlage oder Aufwuchs).
 * Die Spaltenangaben beziehen sich auf das Zellen-Mapping der Vorlage.
 */
export interface Position {
  id: string
  katalogId?: string // Verweis auf data/katalog.json, fehlt bei eigener Pflanze
  bezeichnung: string // wird in Spalte C geschrieben, z. B. "Apfel, Halbstamm, 5–30 J."
  anzahl: number // Spalte A
  einheit: 'Stück' | 'm' | 'm²' | 'lfdm' | string // Spalte B
  zustand?: 'sehr gut' | 'gut' | 'mittel' | 'schlecht'
  hoechstwert?: number // aus Katalog
  einzelpreis: number // Spalte K – Vorschlag, frei überschreibbar
  preisManuell: boolean
  hinweise: string[] // Regel-Warnungen
}

// OFFENE FRAGE: `Formalien` wird in docs/ARCHITEKTUR.md referenziert, aber nicht
// als Typ definiert. Die Felder sind aus dem Zellen-Mapping E3–E17 hergeleitet.
// Benennung und Datumsformat (ISO-String) müssen vom BV bestätigt werden.
export interface Formalien {
  kleingartenanlage: string // E3
  parzelle: string // E4
  weg?: string // E5 (optional)
  unterpaechter: string // E6
  auftraggeber: string // E7
  vertretenDurchRA: string // E8  – vertreten durch Rechtsanwalt
  anwesendVerein: string // E9  – anwesend für den Verein
  anwesendUnterpaechter: string // E10 – anwesend für den Unterpächter
  anwesendAuftraggeber: string // E11 – anwesend für den Auftraggeber
  wertermittlerBaulichkeiten: string // E12
  wertermittlerAussenAufwuchs: string // E13 – Außenanlagen & Aufwuchs
  wertermittlungAm: string // E14 – Datum (ISO-String)
  protokollerstellungAm: string // E15 – Datum (ISO-String)
  parzellenflaecheM2: number // E16 – Parzellenfläche lt. Vertrag (m²)
  vorgangsNr: string // E17 – Vorgangs-Nr.
}

// OFFENE FRAGE: `BeseitigungsPosition` wird in docs/ARCHITEKTUR.md referenziert,
// aber nicht als Typ definiert. Die Felder sind aus dem Zellen-Mapping der
// Beseitigungskosten (Anlage 4, Zeilen 34–44) hergeleitet. Muss bestätigt werden.
export interface BeseitigungsPosition {
  id: string
  gegenstand: string // Spalte B (verbunden B:E)
  menge: number // Spalte F
  einheit: 'Stück' | 'm' | 'm²' | 'lfdm' | string // Spalte G (ME)
  einzelpreis: number // Spalte H
  faktor: number // Spalte J (Standard 1); Begründung bei > 1 in F53
  begruendung?: string // F53 – Begründung bei Faktor > 100 %
}

// OFFENE FRAGE: `SkizzeDaten` wird in docs/ARCHITEKTUR.md referenziert, aber nicht
// als Typ definiert. Vorläufig nur ein minimaler Stub – die eigentliche Struktur
// (Formen, Maße, Bild-Export) legt der Bereich `skizze` (Aufgabe S1) fest.
export interface SkizzeDaten {
  notiz?: string
}

// OFFENE FRAGE: Die Zuordnung Zustand → Faktor ist vorläufig. Die BewRL nennt nur
// Höchstwerte ("bis €") und "bei schlechtem Zustand Abwertung bis 1,00 €". Diese
// Staffel (sehr gut 100 %, gut 75 %, mittel 50 %, schlecht = 1 € Sonderfall) muss
// vom BV bestätigt werden.
export const ZUSTANDSSTUFEN: Record<
  NonNullable<Position['zustand']>,
  { faktor: number; festpreis?: number }
> = {
  'sehr gut': { faktor: 1.0 },
  gut: { faktor: 0.75 },
  mittel: { faktor: 0.5 },
  // Sonderfall: schlechter Zustand → fester Erinnerungswert von 1,00 €
  schlecht: { faktor: 0, festpreis: 1 },
}

/**
 * Erzeugt ein leeres, aber gültiges Wep-Objekt mit der angegebenen id.
 * Alle Pflichtfelder sind vorbelegt (leere Strings / leere Arrays),
 * damit die Erfassung sofort beginnen kann.
 */
export function neuerWep(id: string): Wep {
  return {
    id,
    formalien: {
      kleingartenanlage: '',
      parzelle: '',
      weg: '',
      unterpaechter: '',
      auftraggeber: '',
      vertretenDurchRA: '',
      anwesendVerein: '',
      anwesendUnterpaechter: '',
      anwesendAuftraggeber: '',
      wertermittlerBaulichkeiten: '',
      wertermittlerAussenAufwuchs: '',
      wertermittlungAm: '',
      protokollerstellungAm: '',
      parzellenflaecheM2: 0,
      vorgangsNr: id,
    },
    gruen: {
      beschreibungAussen: '',
      beschreibungAufwuchs: '',
      aussenanlagen: [],
      aufwuchs: [],
      beseitigungAA: [],
    },
    skizze: undefined,
  }
}
