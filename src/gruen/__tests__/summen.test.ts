import { describe, it, expect } from 'vitest'
import { berechneAbschnittSumme } from '../summen.js'
import type { Position } from '../../model/types.js'

/** Minimale Test-Position mit Anzahl und Einzelpreis. */
function pos(anzahl: number, einzelpreis: number): Position {
  return {
    id: crypto.randomUUID(),
    bezeichnung: 'Test',
    anzahl,
    einheit: 'Stück',
    einzelpreis,
    preisManuell: false,
    hinweise: [],
  }
}

describe('berechneAbschnittSumme', () => {
  it('leeres Array → 0', () => {
    expect(berechneAbschnittSumme([])).toBe(0)
  })

  it('eine Position: 5 × 25 = 125', () => {
    expect(berechneAbschnittSumme([pos(5, 25)])).toBe(125)
  })

  it('mehrere Positionen werden aufaddiert', () => {
    const positionen = [pos(2, 50), pos(3, 10)]
    expect(berechneAbschnittSumme(positionen)).toBe(130)
  })

  it('Einzelpreis 0 → trägt nichts bei', () => {
    expect(berechneAbschnittSumme([pos(10, 0), pos(2, 100)])).toBe(200)
  })

  it('Anzahl 0 → trägt nichts bei', () => {
    expect(berechneAbschnittSumme([pos(0, 100), pos(3, 5)])).toBe(15)
  })
})
