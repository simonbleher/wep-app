import { describe, it, expect } from 'vitest'
import { berechneRegelhinweise } from '../regelhinweise.js'
import type { Position, Wep } from '../../model/types.js'
import { neuerWep } from '../../model/types.js'
import type { Position as KatalogPosition, InvasiveArt } from '../../katalog/types.js'

/** Minimale Test-Position. */
function pos(overrides: Partial<Position> = {}): Position {
  return {
    id: 'test',
    bezeichnung: 'Test',
    anzahl: 1,
    einheit: 'Stück',
    einzelpreis: 0,
    preisManuell: false,
    hinweise: [],
    ...overrides,
  }
}

/** WEP mit angegebener Parzellenfläche. */
function wep(parzellenflaecheM2: number = 300): Wep {
  const w = neuerWep('2026-001')
  w.formalien.parzellenflaecheM2 = parzellenflaecheM2
  return w
}

const invasiveArten: InvasiveArt[] = [
  {
    id: 'inv-knoterich',
    wissenschaftlich: 'Reynoutria japonica',
    deutsch: 'Japanischer Staudenknöterich',
    aufnahme: 2016,
    seite: 25,
  },
]

const katalogPositionen: KatalogPosition[] = [
  {
    id: 'aw-rasen',
    abschnitt: 'III. Aufwuchs',
    kategorie: 'Rasen und Wiesen',
    bezeichnung: 'Rasen',
    einheit: 'm²',
    hoechstwert: 0.5,
    seite: 18,
    regeln: 'Nur bis max. 100 m² Fläche bewertet.',
    arten: [],
    relevanz: 4,
  },
  {
    id: 'aw-wiese',
    abschnitt: 'III. Aufwuchs',
    kategorie: 'Rasen und Wiesen',
    bezeichnung: 'Wiese (Blumenwiese, Bienenweide)',
    einheit: 'm²',
    hoechstwert: 2.5,
    seite: 18,
    regeln: 'Nur bis max. 100 m² Fläche bewertet.',
    arten: [],
    relevanz: 3,
  },
  {
    id: 'aa-wegebelag',
    abschnitt: 'II. Außenanlagen',
    kategorie: 'Wege- und Platzbefestigung',
    bezeichnung: 'Wege- und Platzbelag',
    einheit: 'm²',
    varianten: [{ material: 'Steinbelag', hoechstwert: 10 }],
    seite: 14,
    regeln: 'Höchstens 6 % der verbleibenden Kleingartenfläche als versiegelte Fläche.',
    arten: [],
    relevanz: 5,
  },
]

describe('berechneRegelhinweise – Regeltext aus Katalog', () => {
  it('gibt Regeltext zurück wenn katalogId gesetzt und Regeltext vorhanden', () => {
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aw-rasen' }),
      wep(),
      katalogPositionen,
      [],
    )
    expect(hinweise.some((h) => h.schwere === 'info' && h.text.includes('100 m²'))).toBe(true)
  })

  it('gibt keinen Regeltext zurück bei unbekannter katalogId', () => {
    const hinweise = berechneRegelhinweise(pos({ katalogId: 'unbekannt' }), wep(), katalogPositionen, [])
    expect(hinweise.filter((h) => h.schwere === 'info')).toHaveLength(0)
  })
})

describe('berechneRegelhinweise – Invasive Arten', () => {
  it('warnt bei invasiver Bezeichnung', () => {
    const hinweise = berechneRegelhinweise(
      pos({ bezeichnung: 'Japanischer Staudenknöterich' }),
      wep(),
      [],
      invasiveArten,
    )
    expect(hinweise.some((h) => h.schwere === 'warnung' && h.text.includes('invasiv'))).toBe(true)
  })

  it('warnt nicht bei nicht-invasiver Bezeichnung', () => {
    const hinweise = berechneRegelhinweise(pos({ bezeichnung: 'Apfel' }), wep(), [], invasiveArten)
    expect(hinweise.filter((h) => h.schwere === 'warnung')).toHaveLength(0)
  })
})

describe('berechneRegelhinweise – Rasen/Wiese > 100 m²', () => {
  it('warnt wenn Rasen > 100 m²', () => {
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aw-rasen', anzahl: 150, einheit: 'm²' }),
      wep(),
      katalogPositionen,
      [],
    )
    expect(hinweise.some((h) => h.schwere === 'warnung' && h.text.includes('100 m²'))).toBe(true)
  })

  it('warnt wenn Wiese > 100 m²', () => {
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aw-wiese', anzahl: 101, einheit: 'm²' }),
      wep(),
      katalogPositionen,
      [],
    )
    expect(hinweise.some((h) => h.schwere === 'warnung' && h.text.includes('100 m²'))).toBe(true)
  })

  it('warnt nicht wenn Rasen = 100 m²', () => {
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aw-rasen', anzahl: 100 }),
      wep(),
      katalogPositionen,
      [],
    )
    expect(hinweise.filter((h) => h.schwere === 'warnung' && h.text.includes('100 m²'))).toHaveLength(0)
  })
})

describe('berechneRegelhinweise – Versiegelte Fläche', () => {
  it('warnt wenn Wegebelag > 6 % Restfläche', () => {
    // Parzelle 300 m²: erlaubt = (300−24) × 0,06 = 16,56 m²
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aa-wegebelag', anzahl: 20, einheit: 'm²' }),
      wep(300),
      katalogPositionen,
      [],
    )
    expect(hinweise.some((h) => h.schwere === 'warnung' && h.text.toLowerCase().includes('versiegelt'))).toBe(true)
  })

  it('warnt nicht wenn Wegebelag ≤ Limit', () => {
    // Erlaubt: 16,56 m²
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aa-wegebelag', anzahl: 10, einheit: 'm²' }),
      wep(300),
      katalogPositionen,
      [],
    )
    expect(hinweise.filter((h) => h.schwere === 'warnung' && h.text.toLowerCase().includes('versiegelt'))).toHaveLength(0)
  })

  it('warnt nicht wenn keine Parzellenfläche gesetzt', () => {
    const hinweise = berechneRegelhinweise(
      pos({ katalogId: 'aa-wegebelag', anzahl: 100 }),
      wep(0),
      katalogPositionen,
      [],
    )
    expect(hinweise.filter((h) => h.schwere === 'warnung' && h.text.toLowerCase().includes('versiegelt'))).toHaveLength(0)
  })
})
