import { describe, it, expect } from 'vitest'
import { summeAbschnitt, summeBeseitigung, gesamtsumme } from './summen.js'
import type { Position, BeseitigungsPosition, Wep } from '@/model'
import { neuerWep } from '@/model'

function pos(anzahl: number, einzelpreis: number): Position {
  return {
    id: 'p-' + Math.random().toString(36).slice(2),
    bezeichnung: 'Testposition',
    anzahl,
    einheit: 'Stück',
    einzelpreis,
    preisManuell: false,
    hinweise: [],
  }
}

function besPos(menge: number, einzelpreis: number, faktor = 1): BeseitigungsPosition {
  return {
    id: 'b-' + Math.random().toString(36).slice(2),
    gegenstand: 'Testbeseitigung',
    menge,
    einheit: 'Stück',
    einzelpreis,
    faktor,
  }
}

describe('summeAbschnitt', () => {
  it('gibt 0 für leere Liste', () => {
    expect(summeAbschnitt([])).toBe(0)
  })

  it('berechnet Summe korrekt', () => {
    const positionen = [
      pos(2, 50),   // 100
      pos(3, 20),   // 60
      pos(1, 7.5),  //   7.5
    ]
    expect(summeAbschnitt(positionen)).toBe(167.5)
  })

  it('rundet auf 2 Dezimalstellen', () => {
    // 3 × 10.01 = 30.03 (exakt dank Rundung)
    const positionen = [pos(3, 10.01)]
    expect(summeAbschnitt(positionen)).toBe(30.03)
  })

  it('Einzelposition', () => {
    expect(summeAbschnitt([pos(5, 12.5)])).toBe(62.5)
  })
})

describe('summeBeseitigung', () => {
  it('gibt 0 für leere Liste', () => {
    expect(summeBeseitigung([])).toBe(0)
  })

  it('berechnet Summe ohne Faktor', () => {
    const positionen = [besPos(2, 50), besPos(3, 10)]
    expect(summeBeseitigung(positionen)).toBe(130)
  })

  it('berücksichtigt Faktor', () => {
    // 2 × 50 × 1.5 = 150
    const positionen = [besPos(2, 50, 1.5)]
    expect(summeBeseitigung(positionen)).toBe(150)
  })

  it('Faktor 0 ergibt 0', () => {
    expect(summeBeseitigung([besPos(10, 100, 0)])).toBe(0)
  })
})

describe('gesamtsumme', () => {
  it('gibt 0 für leeres WEP', () => {
    const wep = neuerWep('2026-001')
    expect(gesamtsumme(wep)).toBe(0)
  })

  it('addiert alle drei Abschnitte', () => {
    const wep: Wep = {
      ...neuerWep('2026-001'),
      gruen: {
        beschreibungAussen: '',
        beschreibungAufwuchs: '',
        aussenanlagen: [pos(1, 100)],  // 100
        aufwuchs: [pos(2, 50)],        // 100
        beseitigungAA: [besPos(1, 30)], //  30
      },
    }
    expect(gesamtsumme(wep)).toBe(230)
  })

  it('rundet Gesamtsumme auf 2 Stellen', () => {
    const wep: Wep = {
      ...neuerWep('2026-001'),
      gruen: {
        beschreibungAussen: '',
        beschreibungAufwuchs: '',
        aussenanlagen: [pos(1, 0.001)],
        aufwuchs: [],
        beseitigungAA: [],
      },
    }
    // 0.001 → nach Math.round(0.001 * 100) / 100 = 0
    expect(gesamtsumme(wep)).toBe(0)
  })
})
