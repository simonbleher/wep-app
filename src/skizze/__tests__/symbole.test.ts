import { describe, expect, it } from 'vitest'
import { istPflanze, primsZuSvg, symbolPrims, symbolSvg } from '../symbole'
import { skizzeAufContext } from '../skizzePng'
import { SYMBOL_ARTEN } from '../types'
import { bildGroesse, szeneAufContext } from '../szenePng'
import { elementeZuFormen, skizzeDatenZuFormen } from '../../export/skizzeFormen'
import { szeneZuFormen } from '../szeneExport'
import type { Szene } from '../szene'

const box = { x: 10, y: 20, w: 60, h: 50 }

describe('Symbole', () => {
  for (const art of SYMBOL_ARTEN) {
    it(`${art}: Zeichenbefehle ohne NaN, SVG wohlgeformt`, () => {
      const prims = symbolPrims(art, box, art === 'gegenstand' ? 'Gartenzwerg' : 'Text')
      expect(prims.length).toBeGreaterThan(0)
      expect(JSON.stringify(prims)).not.toMatch(/NaN|null/)
      const svg = primsZuSvg(prims)
      expect(svg).not.toContain('NaN')
      expect(symbolSvg(art, 40, 30)).toMatch(/^<svg [^>]*>.*<\/svg>$/s)
    })
  }

  it('Rasen zeichnet nur die Beschriftung', () => {
    const p = symbolPrims('rasen', box, 'Rasen')
    expect(p.map((x) => x.k)).toEqual(['text'])
    expect(symbolPrims('rasen', box, '')).toEqual([])
  })

  it('Gegenstand trägt seinen Namen', () => {
    expect(JSON.stringify(symbolPrims('gegenstand', box, 'Gartenzwerg'))).toContain('Gartenzwerg')
  })

  it('Hecke ist eine Linie aus Ellipsen entlang der langen Seite', () => {
    const wag = symbolPrims('hecke', { x: 0, y: 0, w: 120, h: 20 }, '').filter((p) => p.k === 'ellipse')
    expect(wag.length).toBeGreaterThan(5)
    const senk = symbolPrims('hecke', { x: 0, y: 0, w: 20, h: 120 }, '').filter((p) => p.k === 'ellipse')
    expect(senk).toHaveLength(wag.length)
  })

  it('Entfernen: Pflanze mit Stern, Gegenstand nur kleines X', () => {
    expect(symbolPrims('entfernen', box, 'Walnuss-Wildling entfernen').some((p) => p.k === 'poly' && p.closed)).toBe(true)
    expect(symbolPrims('entfernen', box, 'Holzpferd entfernen').some((p) => p.k === 'poly')).toBe(false)
    expect(istPflanze('Walnuss-Wildling')).toBe(true)
    expect(istPflanze('Holzpferd')).toBe(false)
  })
})

/** Mock-Kontext, der nur mitzählt. */
function mockCtx() {
  const calls: string[] = []
  const ctx = new Proxy({}, {
    get: (_t, name: string) => (name === 'calls' ? calls : (..._a: unknown[]) => void calls.push(name)),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D & { calls: string[] }
  return ctx
}

describe('Zeichnen und Export', () => {
  it('PNG-Export zeichnet Symbole', () => {
    const ctx = mockCtx()
    skizzeAufContext(ctx, { elemente: [{ id: 's', typ: 'symbol', art: 'baum', x: 10, y: 10, breite: 40, hoehe: 50, beschriftung: 'Apfel' }] }, 800, 600)
    expect((ctx as unknown as { calls: string[] }).calls).toContain('fillText')
  })

  it('Szene-Bild hat das Seitenverhältnis des Grundstücks', () => {
    const s: Szene = { masse: { b: 400, h: 800 }, elemente: [{ id: 'e1', typ: 'baum', x: 1, y: 1, b: 50, h: 50, beschriftung: 'A' }] }
    expect(bildGroesse(s, 400)).toEqual({ breite: 400, hoehe: 800 })
    const ctx = mockCtx()
    szeneAufContext(ctx, s, 400, 800)
    expect((ctx as unknown as { calls: string[] }).calls.length).toBeGreaterThan(5)
  })

  it('neue Typen werden im Excel-Export zu Formen (mit und ohne SVG)', () => {
    for (const typ of ['wildling', 'kletterpflanze', 'holzpferd', 'schaukel', 'blumenbeet', 'gegenstand', 'rasen'] as const) {
      const el = [{ typ, name: 'X', kasten: { x: 0, y: 0, w: 400000, h: 300000 }, text: 'Name' }]
      expect(elementeZuFormen(el, true).length, `${typ} mit SVG`).toBeGreaterThan(0)
      expect(elementeZuFormen(el, false).length, `${typ} ohne SVG`).toBeGreaterThan(0)
    }
    expect(elementeZuFormen([{ typ: 'wildling', name: 'W', kasten: { x: 0, y: 0, w: 1, h: 1 } }], true).some((f) => f.art === 'pic')).toBe(true)
  })

  it('SkizzeDaten mit Symbolen und Szene → FormElement', () => {
    const f = skizzeDatenZuFormen(
      { elemente: [{ id: 's', typ: 'symbol', art: 'entfernen', x: 10, y: 10, breite: 30, hoehe: 30, beschriftung: 'Holzpferd entfernen' }] },
      { x: 0, y: 0, w: 8000000, h: 6000000 },
    )
    expect(f[0]).toMatchObject({ typ: 'entfernen', text: 'Holzpferd entfernen', pflanze: false })

    const s: Szene = {
      masse: { b: 445, h: 600 },
      elemente: [
        { id: 'b1', typ: 'bau', x: 0, y: 0, b: 100, h: 100, beschriftung: 'Laube', fest: true },
        { id: 'e1', typ: 'hecke', x: 900, y: 100, b: 40, h: 800, beschriftung: 'Flieder', gruppe: 'g1' },
      ],
    }
    const z = szeneZuFormen(s, { x: 1000, y: 2000, w: 10000, h: 20000 })
    expect(z).toHaveLength(1)
    expect(z[0]).toMatchObject({ typ: 'hecke', variante: 'flieder', gruppe: 'g1', kasten: { x: 10000, y: 4000, w: 400, h: 16000 } })
  })
})
