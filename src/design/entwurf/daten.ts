// Erfundene Beispieldaten für die Design-Vorschau (keine echten Personen).
// Preise folgen dem Katalog: Höchstwert × Zustandsfaktor (sehr gut 1, gut 0,75, mittel 0,5).

export interface ListenWep {
  id: string
  anlage: string
  parzelle: string
  unterpaechter: string
  datum: string
}

export const KONTO = 'max.mustermann@example.de'
export const WERTERMITTLER = 'Max Mustermann'

export const WEPS: ListenWep[] = [
  { id: '2026-007', anlage: 'KGA Testgarten', parzelle: 'Parzelle 42', unterpaechter: 'Erika Musterfrau', datum: '14.10.2026' },
  { id: '2026-006', anlage: 'KGA Testgarten', parzelle: 'Parzelle 17', unterpaechter: 'Hans Beispiel', datum: '09.10.2026' },
  { id: '2026-005', anlage: 'KGA Musterau', parzelle: 'Parzelle 3, Weg B', unterpaechter: 'Paula Platzhalter', datum: '02.10.2026' },
  { id: '2026-004', anlage: 'KGA Testgarten', parzelle: 'Parzelle 108', unterpaechter: 'Otto Normal', datum: '25.09.2026' },
  { id: '2026-003', anlage: '', parzelle: '', unterpaechter: '', datum: '' },
]

export interface EntwurfPosition {
  id: string
  anzahl: number
  einheit: string
  bezeichnung: string
  zustand: 'sehr gut' | 'gut' | 'mittel' | 'schlecht'
  einzelpreis: number
  manuell?: boolean
  warnung?: string
}

export const AUFWUCHS: EntwurfPosition[] = [
  { id: 'p1', anzahl: 2, einheit: 'Stück', bezeichnung: 'Apfel, Halbstamm, 5–30 J.', zustand: 'gut', einzelpreis: 63.75 },
  { id: 'p2', anzahl: 1, einheit: 'Stück', bezeichnung: 'Süßkirsche, Hochstamm, über 30\u00a0J.', zustand: 'mittel', einzelpreis: 85 },
  { id: 'p3', anzahl: 4, einheit: 'Stück', bezeichnung: 'Johannisbeere, Busch, 5–20 J.', zustand: 'gut', einzelpreis: 11.25 },
  { id: 'p4', anzahl: 12, einheit: 'm', bezeichnung: 'Liguster-Hecke (Laub, einfache Art)', zustand: 'sehr gut', einzelpreis: 5 },
  {
    id: 'p5',
    anzahl: 120,
    einheit: 'm²',
    bezeichnung: 'Rasen',
    zustand: 'gut',
    einzelpreis: 0.38,
    warnung: 'Rasen/Wiese: Nur bis max. 100\u00a0m² bewertet (BewRL S.\u00a018). Eingetragen: 120\u00a0m².',
  },
  { id: 'p6', anzahl: 3, einheit: 'Stück', bezeichnung: 'Rose, Beet-, Edel- und Strauchrose', zustand: 'gut', einzelpreis: 7.5 },
  { id: 'p7', anzahl: 1, einheit: 'Stück', bezeichnung: 'Zaubernuss (Ziergehölz, wertvollere Art)', zustand: 'gut', einzelpreis: 40, manuell: true },
]

export function summe(positionen: EntwurfPosition[]): number {
  return positionen.reduce((s, p) => s + Math.round(p.anzahl * p.einzelpreis * 100) / 100, 0)
}

/** Abschnitte der Erfassung; Export ist eine Aktion und sitzt im Kopf. */
export const ABSCHNITTE = [
  { id: 'formalien', titel: 'Formalien', kurz: 'Formalien', summe: undefined },
  { id: 'aussenanlagen', titel: 'Außenanlagen', kurz: 'Außen', summe: 1312 },
  { id: 'aufwuchs', titel: 'Aufwuchs', kurz: 'Aufwuchs', summe: summe(AUFWUCHS) },
  { id: 'beseitigung', titel: 'Beseitigung', kurz: 'Beseitigung', summe: 180 },
  { id: 'skizze', titel: 'Skizze', kurz: 'Skizze', summe: undefined },
] as const

export type AbschnittId = (typeof ABSCHNITTE)[number]['id']

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const euro = (wert: number) => EURO.format(wert)
export const zahl = (wert: number) => wert.toLocaleString('de-DE', { maximumFractionDigits: 2 })
