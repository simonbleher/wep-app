// Typen für den Katalog (data/katalog.json) und die Unionsliste (data/invasive.json).
// Die Struktur bildet die reale JSON-Form 1:1 ab (siehe data/README.md,
// data/katalog.schema.json). Bezeichner sind laut CLAUDE.md auf Englisch erlaubt,
// Kommentare bleiben deutsch.

/** Mengeneinheit einer Position (entspricht dem Enum im JSON-Schema). */
export type Einheit = 'm' | 'm²' | 'm³' | 'Stück' | 'Pauschale';

/**
 * Eine Preisvariante einer Position. Es ist immer genau ein Höchstwert gesetzt,
 * dazu optional ein oder mehrere Unterscheidungsmerkmale (Diskriminatoren).
 * Nie alle gleichzeitig – je nach Position z. B. nur `form` + `altersstufe`
 * (Obstgehölz) oder nur `groesse` (Regenwasserbehälter).
 */
export interface Variante {
  form?: string;
  altersstufe?: string;
  groesse?: string;
  material?: string;
  ausfuehrung?: string;
  typ?: string;
  /** Höchstwert in EUR („bis“-Wert). */
  hoechstwert: number;
}

/**
 * Eine Katalogposition aus Abschnitt II (Außenanlagen) oder III (Aufwuchs).
 * Entweder `hoechstwert` (Einzelwert) ODER `varianten` (Array) ist gesetzt,
 * nie beides (siehe Schema).
 */
export interface Position {
  id: string;
  abschnitt: string;
  kategorie: string;
  bezeichnung: string;
  einheit: Einheit;
  /** Einzel-Höchstwert; nur gesetzt, wenn keine `varianten` existieren. */
  hoechstwert?: number;
  /** Preisvarianten; nur gesetzt, wenn kein `hoechstwert` existiert. */
  varianten?: Variante[];
  seite: number;
  regeln: string;
  /** Beispielpflanzen für Suche/Zuordnung (nicht abschließend). */
  arten: string[];
  /**
   * Alltags-/Umgangssprachliche Begriffe für dieselbe Position (optional), z. B.
   * „Regentonne“ für den Regenwasserauffangbehälter oder „Gartenweg“ für den
   * Wege- und Platzbelag. Nur gesetzt, wo ein echter Alltagsbegriff existiert.
   * In der Suche wie `arten` gewichtet.
   */
  synonyme?: string[];
  /** Häufigkeit im Kleingarten (1–5, 5 = sehr häufig) für die Sortierung. */
  relevanz: number;
  /** Nur zur Laufzeit: eigene, vom Wertermittler gemerkte Position (siehe eigene.ts), nicht aus dem Katalog. */
  eigen?: boolean;
}

/** Wurzelobjekt von data/katalog.json. */
export interface Katalog {
  meta: Record<string, unknown>;
  positionen: Position[];
}

/** Eine invasive Art aus der Unionsliste (data/invasive.json). */
export interface InvasiveArt {
  id: string;
  wissenschaftlich: string;
  synonym?: string;
  /** Deutscher Name; kann leer sein, wenn in der Quelle keiner gebräuchlich ist. */
  deutsch: string;
  englisch?: string;
  aufnahme: number;
  seite: number;
  hinweis?: string;
}

/** Wurzelobjekt von data/invasive.json. */
export interface InvasiveListe {
  meta: Record<string, unknown>;
  arten: InvasiveArt[];
}

/** Grund, warum ein Treffer in der Liste erscheint. */
export type TrefferGrund =
  | 'bezeichnung'
  | 'kategorie'
  | 'art'
  | 'synonym'
  | 'variante'
  | 'zuletzt'
  | 'relevanz';

/** Ein einzelner Suchtreffer. */
export interface Treffer {
  position: Position;
  /** Die konkrete Variante, wenn eine Variante gematcht wurde. */
  variante?: Variante;
  score: number;
  trefferGrund: TrefferGrund;
  /** Der Text, der gematcht hat (z. B. der Artenname oder das Variantenmerkmal). */
  matchText?: string;
}

/** Optionen für die Suche. */
export interface SucheOptions {
  /** Zuletzt verwendete Katalog-IDs, neueste zuerst; wird hier NICHT persistiert. */
  zuletztVerwendet?: string[];
  limit?: number;
}
