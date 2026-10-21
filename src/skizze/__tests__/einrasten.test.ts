import { describe, it, expect } from 'vitest'
import { rasteLinienEnde, rastePunkt, rasteVerschiebung, schluesselPunkte, zielLinien } from '../einrasten.js'
import type { SkizzeElement } from '../types.js'

const haus: SkizzeElement = { id: 'haus', typ: 'rechteck', x: 100, y: 100, breite: 200, hoehe: 100 }
const baum: SkizzeElement = { id: 'baum', typ: 'kreis', cx: 500, cy: 300, radius: 20 }

describe('zielLinien', () => {
  it('enthält Ecken und Mitte der Formen und den Grundstücksrand', () => {
    const z = zielLinien([haus], new Set(), 800, 600)
    expect(z.xs).toEqual(expect.arrayContaining([0, 800, 100, 200, 300]))
    expect(z.ys).toEqual(expect.arrayContaining([0, 600, 100, 150, 200]))
  })

  it('lässt ausgeschlossene Formen weg', () => {
    const z = zielLinien([haus, baum], new Set(['baum']), 800, 600)
    expect(z.xs).not.toContain(480)
    expect(z.xs).toContain(100)
  })

  it('Kreis: Mitte und Viertelpunkte', () => {
    expect(schluesselPunkte(baum)).toHaveLength(5)
  })
})

describe('rastePunkt', () => {
  const ziele = zielLinien([haus], new Set(), 800, 600)

  it('rastet je Achse in der Nähe ein', () => {
    const r = rastePunkt({ x: 303, y: 250 }, ziele, 8)
    expect(r.punkt).toEqual({ x: 300, y: 250 })
    expect(r.treffer).toEqual({ x: 300, y: undefined })
  })

  it('rastet auf Ecke (beide Achsen)', () => {
    const r = rastePunkt({ x: 298, y: 103 }, ziele, 8)
    expect(r.punkt).toEqual({ x: 300, y: 100 })
  })

  it('rastet am Grundstücksrand', () => {
    expect(rastePunkt({ x: 4, y: 595 }, ziele, 8).punkt).toEqual({ x: 0, y: 600 })
  })

  it('außerhalb der Schwelle bleibt alles frei', () => {
    const r = rastePunkt({ x: 350, y: 250 }, ziele, 8)
    expect(r.punkt).toEqual({ x: 350, y: 250 })
    expect(r.treffer).toEqual({ x: undefined, y: undefined })
  })

  it('wählt die nächste Zielgerade', () => {
    const r = rastePunkt({ x: 197, y: 400 }, { xs: [190, 200], ys: [] }, 20)
    expect(r.punkt.x).toBe(200)
  })
})

describe('rasteLinienEnde: gerade Linien', () => {
  const keine = { xs: [], ys: [] }
  const start = { x: 100, y: 100 }

  it('fast waagerecht → waagerecht', () => {
    const r = rasteLinienEnde(start, { x: 300, y: 106 }, keine, 8)
    expect(r.gerade).toBe(true)
    expect(r.punkt.y).toBe(100)
    expect(r.punkt.x).toBeCloseTo(300, 0)
  })

  it('fast senkrecht (nach oben) → senkrecht', () => {
    const r = rasteLinienEnde(start, { x: 104, y: 0 }, keine, 8)
    expect(r.punkt.x).toBe(100)
    expect(r.punkt.y).toBeCloseTo(0, 0)
  })

  it('fast 45° → genau 45°, Länge bleibt', () => {
    const r = rasteLinienEnde(start, { x: 200, y: 195 }, keine, 8)
    const dx = r.punkt.x - start.x
    const dy = r.punkt.y - start.y
    expect(dx).toBeCloseTo(dy)
    expect(Math.hypot(dx, dy)).toBeCloseTo(Math.hypot(100, 95))
  })

  it('nach links oben (-135°) geht auch', () => {
    const r = rasteLinienEnde(start, { x: 0, y: 3 }, keine, 8)
    expect(r.gerade).toBe(true)
    expect(r.punkt.x).toBeLessThan(100)
    expect(r.punkt.y).toBeLessThan(100)
    expect(100 - r.punkt.x).toBeCloseTo(100 - r.punkt.y)
  })

  it('schräg dazwischen bleibt frei', () => {
    const r = rasteLinienEnde(start, { x: 200, y: 130 }, keine, 8)
    expect(r.gerade).toBe(false)
    expect(r.punkt).toEqual({ x: 200, y: 130 })
  })

  it('waagerechte Linie rastet zusätzlich auf eine Zielgerade am Ende', () => {
    const r = rasteLinienEnde(start, { x: 297, y: 104 }, { xs: [300], ys: [] }, 8)
    expect(r.punkt).toEqual({ x: 300, y: 100 })
    expect(r.treffer.x).toBe(300)
  })

  it('ohne Winkel-Einrasten bleibt die Richtung frei, Ecken rasten weiter', () => {
    const r = rasteLinienEnde(start, { x: 300, y: 106 }, { xs: [], ys: [] }, 8, 6, false)
    expect(r.punkt).toEqual({ x: 300, y: 106 })
  })

  it('Länge 0 ist kein Fehler', () => {
    expect(rasteLinienEnde(start, start, keine, 8).punkt).toEqual(start)
  })
})

describe('rasteVerschiebung', () => {
  const pfosten: SkizzeElement = { id: 'p', typ: 'rechteck', x: 400, y: 400, breite: 10, hoehe: 10 }
  const ziele = zielLinien([haus, pfosten], new Set(['p']), 800, 600)

  it('Kante rastet an der Kante der Nachbarform', () => {
    // linke Kante landet bei 304 → soll auf 300 (rechte Kante vom Haus) einrasten
    const r = rasteVerschiebung(pfosten, -96, -300, ziele, 8)
    expect(r.dx).toBe(-100)
    expect(r.treffer.x).toBe(300)
  })

  it('Ecke rastet in beiden Achsen', () => {
    const r = rasteVerschiebung(pfosten, -97, -197, ziele, 8)
    expect(r.treffer.x).toBe(300)
    expect(r.treffer.y).toBe(200)
    expect(pfosten.x + r.dx).toBe(300)
    expect(pfosten.y + r.dy).toBe(200)
  })

  it('am Grundstücksrand', () => {
    const r = rasteVerschiebung(pfosten, 385, 0, ziele, 8)
    expect(pfosten.x + 10 + r.dx).toBe(800)
  })

  it('weit weg: unverändert', () => {
    const r = rasteVerschiebung(pfosten, 50, 50, ziele, 8)
    expect(r).toEqual({ dx: 50, dy: 50, treffer: { x: undefined, y: undefined } })
  })
})
