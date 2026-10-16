// Datentypen für den Katalog (data/katalog.json) und die Liste der invasiven
// Arten (data/invasive.json).
//
// Die Typen bilden das JSON-Schema data/katalog.schema.json ab (dieses ist
// maßgeblich). Felder, die das Schema mit additionalProperties:false begrenzt,
// werden hier nicht um eigene Felder erweitert. Änderungen nur per PR mit
// Begründung (siehe docs/ARCHITEKTUR.md).

/**
 * Einheit einer Katalog-Position – Enum aus dem Schema
 * (katalog.schema.json, einheit.enum).
 *
 * Hinweis: `Position.einheit` in types.ts erlaubt bewusst zusätzlich eigene
 * Werte (z. B. "lfdm") und Freitext; der Katalog selbst kennt nur diese fünf.
 */
export type KatalogEinheit = 'm' | 'm²' | 'm³' | 'Stück' | 'Pauschale'

/**
 * Relevanz für die Sortierung im Kleingarten (1 = selten … 5 = sehr häufig).
 * Das Schema erlaubt ganze Zahlen von 1 bis 5.
 */
export type KatalogRelevanz = 1 | 2 | 3 | 4 | 5

/**
 * Eine Preisvariante einer Position (Differenzierung nach Form, Alter, Größe,
 * Material oder Ausführung). Nur `hoechstwert` ist Pflicht; die übrigen Felder
 * beschreiben, wofür dieser Höchstwert gilt. Das Schema lässt hier keine
 * weiteren Felder zu (additionalProperties:false).
 */
export interface KatalogVariante {
  form?: string
  altersstufe?: string
  groesse?: string
  material?: string
  ausfuehrung?: string
  typ?: string
  hoechstwert: number // „bis“-Wert in EUR
}

/**
 * Gemeinsame Pflichtfelder jeder Katalog-Position.
 * `hoechstwert` bzw. `varianten` kommen erst in den Untertypen dazu.
 */
export interface KatalogPositionBasis {
  id: string
  // Schema: string. In den Daten bislang "II. Außenanlagen" oder "III. Aufwuchs".
  abschnitt: string
  kategorie: string
  bezeichnung: string
  einheit: KatalogEinheit
  seite: number
  regeln: string // Regeltext der Richtlinie, kann leer sein ("")
  arten: string[] // Beispielpflanzen, kann leer sein
  relevanz: KatalogRelevanz
}

/**
 * Position mit einem einzelnen Höchstwert (ohne Varianten).
 * Das Schema (oneOf) verbietet in diesem Fall das Feld `varianten`.
 */
export interface KatalogPositionEinzel extends KatalogPositionBasis {
  hoechstwert: number // „bis“-Wert in EUR
  varianten?: never
}

/**
 * Position mit mehreren Preisvarianten (ohne einzelnen Höchstwert).
 * Das Schema (oneOf) verbietet in diesem Fall das Feld `hoechstwert`.
 */
export interface KatalogPositionVarianten extends KatalogPositionBasis {
  varianten: KatalogVariante[] // mindestens eine Variante
  hoechstwert?: never
}

/**
 * Eine Katalog-Position hat entweder `hoechstwert` ODER `varianten`, nie beides
 * (Schema: oneOf).
 */
export type KatalogPosition = KatalogPositionEinzel | KatalogPositionVarianten

// OFFENE FRAGE: Das Schema typisiert `meta` nur als beliebiges Objekt
// ({ "type": "object" }, ohne feste Felder). Die hier aufgeführten Felder
// stammen aus der aktuellen data/katalog.json; die Indexsignatur lässt weitere
// Felder zu, bis das Schema `meta` festlegt.
export interface KatalogMeta {
  titel?: string
  quelle?: string
  abschnitte?: string[]
  seiten?: string
  stand?: string
  erstellt_am?: string
  waehrung?: string
  [key: string]: unknown
}

/** Gesamter Inhalt von data/katalog.json. */
export interface KatalogDatei {
  meta: KatalogMeta
  positionen: KatalogPosition[]
}

/**
 * Eine invasive Art aus der Unionsliste (data/invasive.json).
 * Pflicht sind id, wissenschaftlich, deutsch, aufnahme und seite; `synonym`,
 * `englisch` und `hinweis` kommen nur bei einzelnen Einträgen vor.
 */
export interface InvasiveArt {
  id: string
  wissenschaftlich: string // wissenschaftlicher Name
  synonym?: string
  deutsch: string // deutscher Name
  englisch?: string
  aufnahme: number // Jahr der Aufnahme in die Unionsliste
  seite: number
  hinweis?: string // z. B. Vermerk zu einem Druckfehler der Quelle
}

// OFFENE FRAGE: Wie bei KatalogMeta ist auch die `meta` von invasive.json nicht
// im Schema festgelegt. Die Felder stammen aus der aktuellen Datei; weitere
// Felder sind über die Indexsignatur zulässig.
export interface InvasiveMeta {
  titel?: string
  rechtsgrundlage?: string
  quelle?: string
  seiten?: string
  erstellt_am?: string
  anzahl?: number
  hinweis?: string
  [key: string]: unknown
}

/** Gesamter Inhalt von data/invasive.json. */
export interface InvasiveDatei {
  meta: InvasiveMeta
  arten: InvasiveArt[]
}
