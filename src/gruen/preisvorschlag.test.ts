import { describe, it, expect } from 'vitest'
import { preisvorschlag } from './preisvorschlag.js'
import { ZUSTANDSSTUFEN } from '@/model'

describe('preisvorschlag', () => {
  it('gibt 1 € zurück wenn Faktor 0 (schlecht)', () => {
    const faktor = ZUSTANDSSTUFEN.schlecht.faktor // 0
    expect(preisvorschlag(100, faktor)).toBe(1)
  })

  it('gibt 1 € zurück unabhängig vom Höchstwert bei Faktor 0', () => {
    expect(preisvorschlag(500, 0)).toBe(1)
    expect(preisvorschlag(0, 0)).toBe(1)
  })

  it('berechnet sehr gut (100 %) korrekt', () => {
    expect(preisvorschlag(100, ZUSTANDSSTUFEN['sehr gut'].faktor)).toBe(100)
    expect(preisvorschlag(50, 1.0)).toBe(50)
  })

  it('berechnet gut (75 %) korrekt', () => {
    expect(preisvorschlag(100, ZUSTANDSSTUFEN.gut.faktor)).toBe(75)
    expect(preisvorschlag(80, 0.75)).toBe(60)
  })

  it('berechnet mittel (50 %) korrekt', () => {
    expect(preisvorschlag(100, ZUSTANDSSTUFEN.mittel.faktor)).toBe(50)
    expect(preisvorschlag(33, 0.5)).toBe(16.5)
  })

  it('rundet auf 2 Dezimalstellen', () => {
    // 10 × 0.75 = 7.5 → exakt
    expect(preisvorschlag(10, 0.75)).toBe(7.5)
    // 7 × 0.75 = 5.25 → 5.25
    expect(preisvorschlag(7, 0.75)).toBe(5.25)
    // 1 × 0.75 = 0.75 → 0.75
    expect(preisvorschlag(1, 0.75)).toBe(0.75)
  })

  it('gibt 0 zurück wenn Höchstwert 0 und Faktor > 0', () => {
    expect(preisvorschlag(0, 0.75)).toBe(0)
  })
})
