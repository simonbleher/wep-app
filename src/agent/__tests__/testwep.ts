/**
 * Erfundenes Test-WEP für die Agent-Schnittstelle (keine echten Personendaten): Parzelle 18 × 26 m, Grundriss mit
 * Laube, Anbau und Keller, Grundlage in Metern, Aufwuchs mit invasiver Art und Problempflanze.
 */
import { neuerWep, type Position, type Wep } from '../../model'
import { lageVon, meterZuPx, setzeParzelle, skizzeMitParzelle, type Parzelle } from '../../parzelle'
import { uebernehmeGrundlage } from '../../skizze/grundlage'
import { rechteckPunkte } from '../../skizze/grundriss'
import { leereSkizze, type SkizzeSymbol } from '../../skizze/types'

const jetzt = '2026-10-23T10:00:00.000Z'

const pos = (id: string, bezeichnung: string, anzahl: number, einheit: string, einzelpreis: number, extra: Partial<Position> = {}): Position => ({
  id,
  bezeichnung,
  anzahl,
  einheit,
  einzelpreis,
  preisManuell: false,
  hinweise: [],
  ...extra,
})

export function testWep(): Wep {
  let w = neuerWep('2026-777')
  w.formalien = {
    ...w.formalien,
    kleingartenanlage: 'Anlage Musterwiese',
    parzelle: '123',
    weg: 'Birkenweg',
    unterpaechter: 'Erika Musterfrau',
    auftraggeber: 'Max Mustermann',
    wertermittlerAussenAufwuchs: 'Hans Beispiel',
    wertermittlungAm: '2026-10-20',
    parzellenflaecheM2: 470,
  }
  w.gruen.aufwuchs = [
    pos('p-apfel', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 85, { zustand: 'gut' }),
    pos('p-birne', 'Birne, Buschbaum, 5–30 J.', 1, 'Stück', 75),
    pos('p-hecke', 'Liguster-Hecke (Laub, einfache Art) 1,2 m hoch', 9, 'm', 5),
    pos('p-fichte', 'Blaufichte', 1, 'Stück', 1, { hinweise: [{ schwere: 'warnung', text: 'Nadelgehölz, zu entfernen.' }] }),
    pos('p-goetter', 'Götterbaum', 1, 'Stück', 1),
  ]
  w.gruen.aussenanlagen = [pos('a-kompost', 'Kompostanlage', 1, 'm³', 40), pos('a-weg', 'Weg Tenne', 12, 'm²', 4), pos('a-tuer', 'Türanlage einflügelig', 1, 'Stück', 150)]
  w.gruen.beseitigungAA = [{ id: 'b-fichte', gegenstand: 'Blaufichte entfernen', menge: 1, einheit: 'Stück', einzelpreis: 80, faktor: 1 }]
  w.bau = {
    bauteile: [
      { id: 'b-laube', art: 'laube', kuerzel: 'L', flaeche: 24, laenge: 6, breite: 4, hoehe: 2.2, maengel: [] },
      { id: 'b-anbau', art: 'anbau', kuerzel: 'A1', flaeche: 6, maengel: [] },
    ],
    abwasser: { art: 'keine', grube: {}, kanal: {} },
    nichtBeraeumt: { aktiv: false },
    ausstattung: {},
    beschreibung: '',
    beseitigung: [],
  }
  w.grundriss = {
    teile: [
      { id: 'g1', kuerzel: 'L', bauteilId: 'b-laube', punkte: rechteckPunkte(5, 10, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
      { id: 'g2', kuerzel: 'A1', bauteilId: 'b-anbau', punkte: rechteckPunkte(11, 11, 2, 3) },
      { id: 'g3', kuerzel: 'K', gestrichelt: true, punkte: rechteckPunkte(5, 15, 3, 2) },
    ],
  }
  const parzelle: Parzelle = { form: 'rechteck', laenge: 26, breite: 18, angelegtVon: 'gruen', angelegtAm: jetzt }
  w = setzeParzelle(w, parzelle, jetzt)
  // Grün-Skizze mit Grundlage aus Parzelle und Grundriss und einem vorhandenen Strauch bei (3 m | 5 m)
  const lage = lageVon(w)!
  const erg = uebernehmeGrundlage(skizzeMitParzelle(w, jetzt) ?? leereSkizze(), { art: 'parzelle', lage, grundriss: w.grundriss!, bauteile: w.bau!.bauteile }, jetzt)!
  const mitte = meterZuPx(lage.abb, { x: 3, y: 5 })
  const strauch: SkizzeSymbol = { id: 'alt-strauch', typ: 'symbol', art: 'strauch', x: mitte.x - 15, y: mitte.y - 12, breite: 30, hoehe: 24, beschriftung: 'Flieder' }
  return { ...w, skizze: { ...erg.daten, elemente: [...erg.daten.elemente, strauch] } }
}
