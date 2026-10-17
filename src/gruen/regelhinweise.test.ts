import { describe, it, expect } from 'vitest'
import { regelhinweise } from './regelhinweise.js'
import type { Position } from '@/model'
import type { InvasiveArt } from '@/model'
import invasiveData from '../../data/invasive.json'

const invasive = (invasiveData as unknown as { arten: InvasiveArt[] }).arten

/** Erzeugt eine minimale Modell-Position für Tests. */
function pos(overrides: Partial<Position> & { bezeichnung: string; anzahl: number; einheit: string }): Position {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    katalogId: undefined,
    zustand: 'gut',
    hoechstwert: 10,
    einzelpreis: 7.5,
    preisManuell: false,
    hinweise: [],
    ...overrides,
  }
}

describe('regelhinweise – Rasen/Wiese', () => {
  it('keine Warnung bei Rasen ≤ 100 m²', () => {
    const positionen = [pos({ katalogId: 'aw-rasen', bezeichnung: 'Rasen', anzahl: 100, einheit: 'm²' })]
    const h = regelhinweise(positionen, 400)
    expect(h).toHaveLength(0)
  })

  it('Warnung bei Rasen > 100 m²', () => {
    const positionen = [pos({ katalogId: 'aw-rasen', bezeichnung: 'Rasen', anzahl: 101, einheit: 'm²' })]
    const h = regelhinweise(positionen, 400)
    expect(h).toHaveLength(1)
    expect(h[0].schwere).toBe('warnung')
    expect(h[0].text).toContain('101 m²')
  })

  it('Warnung wenn Rasen + Wiese zusammen > 100 m²', () => {
    const positionen = [
      pos({ katalogId: 'aw-rasen', bezeichnung: 'Rasen', anzahl: 60, einheit: 'm²' }),
      pos({ katalogId: 'aw-wiese', bezeichnung: 'Wiese', anzahl: 50, einheit: 'm²' }),
    ]
    const h = regelhinweise(positionen, 400)
    expect(h.some((hw) => hw.text.includes('110 m²'))).toBe(true)
  })

  it('erkennt Rasen auch ohne katalogId per Heuristik', () => {
    const positionen = [pos({ bezeichnung: 'Eigener Rasen', anzahl: 110, einheit: 'm²' })]
    const h = regelhinweise(positionen, 400)
    expect(h.some((hw) => hw.schwere === 'warnung')).toBe(true)
  })

  it('ignoriert Rasen in Stück (falsche Einheit)', () => {
    const positionen = [pos({ katalogId: 'aw-rasen', bezeichnung: 'Rasen', anzahl: 200, einheit: 'Stück' })]
    const h = regelhinweise(positionen, 400)
    expect(h).toHaveLength(0)
  })
})

describe('regelhinweise – versiegelte Fläche', () => {
  // 400 m² Parzelle → Restfläche = 376 m² → max versiegelt = 22,56 m²
  it('keine Warnung bei versiegelter Fläche innerhalb Grenze', () => {
    const positionen = [pos({ katalogId: 'aa-wegebelag', bezeichnung: 'Weg', anzahl: 20, einheit: 'm²' })]
    const h = regelhinweise(positionen, 400)
    expect(h).toHaveLength(0)
  })

  it('Warnung bei versiegelter Fläche > 6 %', () => {
    const positionen = [pos({ katalogId: 'aa-wegebelag', bezeichnung: 'Weg', anzahl: 25, einheit: 'm²' })]
    const h = regelhinweise(positionen, 400)
    expect(h).toHaveLength(1)
    expect(h[0].schwere).toBe('warnung')
  })

  it('Heuristik: Weg in m² ohne katalogId wird als versiegelt erkannt', () => {
    const positionen = [pos({ bezeichnung: 'Gartenweg', anzahl: 30, einheit: 'm²' })]
    const h = regelhinweise(positionen, 300)
    // 300-24=276, 6%=16,56 m² → 30 > 16,56 → Warnung
    expect(h.some((hw) => hw.schwere === 'warnung')).toBe(true)
  })
})

describe('regelhinweise – invasive Arten', () => {
  it('keine Warnung ohne invasiveArten-Parameter', () => {
    const positionen = [pos({ bezeichnung: 'Japanischer Staudenknöterich', anzahl: 1, einheit: 'Stück' })]
    const h = regelhinweise(positionen, 400)
    expect(h).toHaveLength(0)
  })

  it('Warnung bei invasiver Art (echte Unionsliste)', () => {
    // Riesenbärenklau ist auf der EU-Unionsliste (heracleum-mantegazzianum)
    const positionen = [pos({ bezeichnung: 'Riesenbärenklau', anzahl: 1, einheit: 'Stück' })]
    const h = regelhinweise(positionen, 400, invasive)
    expect(h.some((hw) => hw.schwere === 'warnung')).toBe(true)
  })

  it('keine Warnung für normale Pflanze', () => {
    const positionen = [pos({ bezeichnung: 'Apfelbaum', anzahl: 1, einheit: 'Stück' })]
    const h = regelhinweise(positionen, 400, invasive)
    expect(h).toHaveLength(0)
  })
})

describe('regelhinweise – leere Liste', () => {
  it('gibt leeres Array zurück für keine Positionen', () => {
    expect(regelhinweise([], 400, invasive)).toHaveLength(0)
  })
})
