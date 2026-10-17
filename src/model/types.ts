// Datenmodell für die WEP-App (BV Pankow)
// Änderungen nur per PR mit Begründung in docs/ENTSCHEIDUNGEN.md

export interface Formalien {
  kleingartenanlage: string;
  parzelle: string;
  weg?: string;
  unterpächter: string;
  auftraggeber: string;
  rechtsanwalt?: string;
  anwesendVerein?: string;
  anwesendUnterpächter?: string;
  anwesendAuftraggeber?: string;
  wertermittlerBaulichkeiten?: string;
  wertermittlerGruen: string;
  wertermittlungAm: string;
  protokollAm: string;
  parzellenfläche: number;
  vorgangsNr: string;
}

export type Zustand = 'sehr gut' | 'gut' | 'mittel' | 'schlecht';
export type Einheit = 'Stück' | 'm' | 'm²' | 'lfdm' | string;

export interface Position {
  id: string;
  katalogId?: string;
  bezeichnung: string;
  anzahl: number;
  einheit: Einheit;
  zustand?: Zustand;
  hoechstwert?: number;
  einzelpreis: number;
  preisManuell: boolean;
  hinweise: string[];
}

export interface BeseitigungsPosition {
  id: string;
  gegenstand: string;
  menge: number;
  einheit: Einheit;
  einzelpreis: number;
  faktor: number;
  hinweis?: string;
}

// S1: Skizzendaten – Parzellenskizze als JSON gespeichert
export type SkizzeObjektTyp = 'rechteck' | 'linie' | 'kreis' | 'text' | 'mass';

export interface SkizzeObjektBase {
  id: string;
  typ: SkizzeObjektTyp;
  farbe?: string;
  strichbreite?: number;
}

export interface SkizzeRechteck extends SkizzeObjektBase {
  typ: 'rechteck';
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

export interface SkizzeLinie extends SkizzeObjektBase {
  typ: 'linie';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SkizzeKreis extends SkizzeObjektBase {
  typ: 'kreis';
  cx: number;
  cy: number;
  radius: number;
}

export interface SkizzeText extends SkizzeObjektBase {
  typ: 'text';
  x: number;
  y: number;
  inhalt: string;
  schriftgroesse?: number;
}

export interface SkizzeMass extends SkizzeObjektBase {
  typ: 'mass';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  beschriftung: string;
}

export type SkizzeObjekt =
  | SkizzeRechteck
  | SkizzeLinie
  | SkizzeKreis
  | SkizzeText
  | SkizzeMass;

export interface SkizzeDaten {
  objekte: SkizzeObjekt[];
  breite: number;
  hoehe: number;
}

export interface GruenDaten {
  beschreibungAussen: string;
  beschreibungAufwuchs: string;
  aussenanlagen: Position[];
  aufwuchs: Position[];
  beseitigungAA: BeseitigungsPosition[];
}

export interface Wep {
  id: string;
  formalien: Formalien;
  gruen: GruenDaten;
  bau?: unknown;
  skizze?: SkizzeDaten;
}
