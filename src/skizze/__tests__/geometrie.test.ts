import { describe, it, expect } from 'vitest'
import {
  abstand,
  abstandPunktZuStrecke,
  trifftElement,
  trefferSuchen,
  elementVerschieben,
} from '../geometrie.js'
import type { SkizzeElement } from '../types.js'

describe('abstand', () => {
  it('berechnet Abstand zweier Punkte', () => {
    expect(abstand({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5)
  })

  it('gibt 0 für identische Punkte', () => {
    expect(abstand({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
  })
})

describe('abstandPunktZuStrecke', () => {
  it('berechnet senkrechten Abstand zum Mittelpunkt einer Strecke', () => {
    // Strecke von (0,0) bis (10,0); Punkt bei (5,3)
    expect(abstandPunktZuStrecke({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3)
  })

  it('gibt Abstand zum Endpunkt, wenn Fußpunkt außerhalb liegt', () => {
    // Strecke von (0,0) bis (10,0); Punkt bei (15,0) → Abstand zu (10,0) = 5
    expect(abstandPunktZuStrecke({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
  })

  it('gibt 0 bei identischen Endpunkten der Strecke', () => {
    expect(
      abstandPunktZuStrecke({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 }),
    ).toBeCloseTo(abstand({ x: 5, y: 5 }, { x: 2, y: 2 }))
  })
})

describe('trifftElement – Rechteck', () => {
  const r: SkizzeElement = { id: 'r', typ: 'rechteck', x: 10, y: 10, breite: 80, hoehe: 60 }

  it('trifft Punkt innerhalb des Rechtecks', () => {
    expect(trifftElement(r, { x: 50, y: 40 })).toBe(true)
  })

  it('trifft Punkt am Rand', () => {
    expect(trifftElement(r, { x: 10, y: 10 })).toBe(true)
  })

  it('trifft Punkt weit außerhalb nicht', () => {
    expect(trifftElement(r, { x: 200, y: 200 })).toBe(false)
  })
})

describe('trifftElement – Linie', () => {
  const l: SkizzeElement = { id: 'l', typ: 'linie', x1: 0, y1: 0, x2: 100, y2: 0 }

  it('trifft Punkt auf der Linie', () => {
    expect(trifftElement(l, { x: 50, y: 0 })).toBe(true)
  })

  it('trifft Punkt in der Nähe (innerhalb Trefferradius)', () => {
    expect(trifftElement(l, { x: 50, y: 6 })).toBe(true)
  })

  it('trifft Punkt außerhalb nicht', () => {
    expect(trifftElement(l, { x: 50, y: 20 })).toBe(false)
  })
})

describe('trifftElement – Kreis', () => {
  const k: SkizzeElement = { id: 'k', typ: 'kreis', cx: 50, cy: 50, radius: 30 }

  it('trifft Punkt auf dem Rand', () => {
    expect(trifftElement(k, { x: 80, y: 50 })).toBe(true)
  })

  it('trifft Punkt innerhalb', () => {
    expect(trifftElement(k, { x: 50, y: 50 })).toBe(true)
  })

  it('trifft Punkt weit außerhalb nicht', () => {
    expect(trifftElement(k, { x: 200, y: 200 })).toBe(false)
  })
})

describe('trefferSuchen', () => {
  const r1: SkizzeElement = { id: 'r1', typ: 'rechteck', x: 0, y: 0, breite: 100, hoehe: 100 }
  const r2: SkizzeElement = { id: 'r2', typ: 'rechteck', x: 10, y: 10, breite: 80, hoehe: 80 }

  it('gibt null bei leerer Liste zurück', () => {
    expect(trefferSuchen([], { x: 50, y: 50 })).toBeNull()
  })

  it('gibt oberstes (letztes) treffendes Element zurück', () => {
    const treffer = trefferSuchen([r1, r2], { x: 50, y: 50 })
    expect(treffer?.id).toBe('r2') // r2 ist oben (später gezeichnet)
  })

  it('gibt r1 zurück, wenn Punkt nur r1 trifft', () => {
    // r2 beginnt bei x=10, Trefferradius=8 → Toleranzbereich beginnt bei x=2.
    // x=1 liegt daher außerhalb des Toleranzbereichs von r2, aber innerhalb von r1.
    const treffer = trefferSuchen([r1, r2], { x: 1, y: 50 })
    expect(treffer?.id).toBe('r1')
  })
})

describe('elementVerschieben', () => {
  it('verschiebt Rechteck', () => {
    const r: SkizzeElement = { id: 'r', typ: 'rechteck', x: 10, y: 20, breite: 30, hoehe: 40 }
    const v = elementVerschieben(r, 5, -10)
    expect(v).toStrictEqual({ id: 'r', typ: 'rechteck', x: 15, y: 10, breite: 30, hoehe: 40 })
  })

  it('verschiebt Linie', () => {
    const l: SkizzeElement = { id: 'l', typ: 'linie', x1: 0, y1: 0, x2: 10, y2: 10 }
    const v = elementVerschieben(l, 3, 4)
    expect(v).toStrictEqual({ id: 'l', typ: 'linie', x1: 3, y1: 4, x2: 13, y2: 14 })
  })

  it('verschiebt Kreis', () => {
    const k: SkizzeElement = { id: 'k', typ: 'kreis', cx: 50, cy: 50, radius: 20 }
    const v = elementVerschieben(k, -5, 10)
    expect(v).toStrictEqual({ id: 'k', typ: 'kreis', cx: 45, cy: 60, radius: 20 })
  })

  it('verschiebt Text', () => {
    const t: SkizzeElement = { id: 't', typ: 'text', x: 100, y: 100, inhalt: 'Hallo' }
    const v = elementVerschieben(t, 10, 20)
    expect(v).toStrictEqual({ id: 't', typ: 'text', x: 110, y: 120, inhalt: 'Hallo' })
  })

  it('verschiebt Maßangabe', () => {
    const m: SkizzeElement = {
      id: 'm',
      typ: 'massangabe',
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      beschriftung: '5 m',
    }
    const v = elementVerschieben(m, 10, 5)
    expect(v).toStrictEqual({
      id: 'm',
      typ: 'massangabe',
      x1: 10,
      y1: 5,
      x2: 110,
      y2: 5,
      beschriftung: '5 m',
    })
  })
})
