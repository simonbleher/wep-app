import { describe, it, expect } from 'vitest'
import { berechnePreisvorschlag } from '../preisvorschlag.js'
import type { Position } from '../../model/types.js'

/** Minimale Test-Position mit optionalen Überschreibungen. */
function pos(overrides: Partial<Position> = {}): Position {
  return {
    id: 'test',
    bezeichnung: 'Testposition',
    anzahl: 1,
    einheit: 'Stück',
    einzelpreis: 0,
    preisManuell: false,
    hinweise: [],
    ...overrides,
  }
}

describe('berechnePreisvorschlag', () => {
  it('sehr gut → 100 % des Höchstwerts', () => {
    expect(berechnePreisvorschlag(pos({ hoechstwert: 100, zustand: 'sehr gut' }))).toBe(100)
  })

  it('gut → 75 % des Höchstwerts', () => {
    expect(berechnePreisvorschlag(pos({ hoechstwert: 80, zustand: 'gut' }))).toBe(60)
  })

  it('mittel → 50 % des Höchstwerts', () => {
    expect(berechnePreisvorschlag(pos({ hoechstwert: 100, zustand: 'mittel' }))).toBe(50)
  })

  it('schlecht → Festpreis 1,00 €', () => {
    expect(berechnePreisvorschlag(pos({ hoechstwert: 100, zustand: 'schlecht' }))).toBe(1)
  })

  it('ohne Zustand → 0 (Wertermittler trägt selbst ein)', () => {
    expect(berechnePreisvorschlag(pos({ hoechstwert: 100 }))).toBe(0)
  })

  it('ohne Höchstwert → 0 (Freitext-Position)', () => {
    expect(berechnePreisvorschlag(pos({ zustand: 'gut' }))).toBe(0)
  })

  it('schlecht mit beliebigem Höchstwert → immer 1,00 €', () => {
    expect(berechnePreisvorschlag(pos({ hoechstwert: 999, zustand: 'schlecht' }))).toBe(1)
  })

  it('schlecht ohne Höchstwert (eigene Position) → 1,00 €', () => {
    expect(berechnePreisvorschlag(pos({ zustand: 'schlecht' }))).toBe(1)
  })

  it('ohne Höchstwert bleibt es bei 0, solange der Zustand nicht „schlecht“ ist', () => {
    expect(berechnePreisvorschlag(pos({ zustand: 'sehr gut' }))).toBe(0)
    expect(berechnePreisvorschlag(pos({ zustand: 'mittel' }))).toBe(0)
  })
})
