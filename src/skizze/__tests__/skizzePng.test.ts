/**
 * Tests für die Skizze-PNG-Rendering-Logik (skizzeAufContext).
 *
 * Die DOM-abhängige skizzeAlsPng-Funktion wird nicht getestet – sie ruft nur
 * skizzeAufContext auf und delegiert toBlob an das Browser-Canvas-API.
 * skizzeAufContext ist rein und benötigt nur einen gemockten 2D-Kontext.
 */
import { describe, it, expect, vi } from 'vitest'
import { skizzeAufContext } from '../skizzePng.js'
import type { SkizzeDaten } from '../types.js'

// ---------------------------------------------------------------------------
// Mock-Kontext
// ---------------------------------------------------------------------------

function erstelleMockCtx() {
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
    font: '' as string,
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skizzeAufContext – Hintergrund', () => {
  it('füllt den Hintergrund weiß', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = { elemente: [] }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600)
  })
})

describe('skizzeAufContext – Raster', () => {
  it('zeichnet Rasterlinien wenn raster=true', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = { elemente: [], raster: true, rasterGroesse: 400, breite: 400, hoehe: 400 }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 400, 400)
    // stroke wird für Raster aufgerufen
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('zeichnet kein Raster wenn raster=false', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = { elemente: [], raster: false }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('skizzeAufContext – transparent', () => {
  it('ohne Hintergrund und ohne Raster, Elemente werden gezeichnet', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [{ id: 'r1', typ: 'rechteck', x: 10, y: 20, breite: 100, hoehe: 50 }],
      raster: true,
      rasterGroesse: 40,
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 400, 400, { transparent: true })
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 50)
  })
})

describe('skizzeAufContext – Elemente', () => {
  it('zeichnet Rechteck mit strokeRect', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [{ id: 'r1', typ: 'rechteck', x: 10, y: 20, breite: 100, hoehe: 50 }],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 50)
  })

  it('zeichnet Linie mit moveTo/lineTo/stroke', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [{ id: 'l1', typ: 'linie', x1: 0, y1: 0, x2: 100, y2: 100 }],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 100)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('zeichnet Kreis mit arc', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [{ id: 'k1', typ: 'kreis', cx: 50, cy: 50, radius: 30 }],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 30, 0, 2 * Math.PI)
  })

  it('zeichnet Kreis-Beschriftung mit fillText', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [{ id: 'k2', typ: 'kreis', cx: 50, cy: 50, radius: 30, beschriftung: 'Apfel' }],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.fillText).toHaveBeenCalledWith('Apfel', 50, 50 + 30 + 2)
  })

  it('zeichnet Text mit fillText', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [{ id: 't1', typ: 'text', x: 100, y: 200, inhalt: 'Laube' }],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.fillText).toHaveBeenCalledWith('Laube', 100, 200)
  })

  it('zeichnet Maßangabe mit moveTo/lineTo', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [
        { id: 'm1', typ: 'massangabe', x1: 0, y1: 100, x2: 200, y2: 100, beschriftung: '5 m' },
      ],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 100)
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 100)
    expect(ctx.fillText).toHaveBeenCalledWith('5 m', 100, 98)
  })

  it('ruft save/restore für jedes Element auf', () => {
    const ctx = erstelleMockCtx()
    const daten: SkizzeDaten = {
      elemente: [
        { id: 'r1', typ: 'rechteck', x: 0, y: 0, breite: 10, hoehe: 10 },
        { id: 'l1', typ: 'linie', x1: 0, y1: 0, x2: 10, y2: 10 },
      ],
    }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600)
    expect(ctx.save).toHaveBeenCalledTimes(2)
    expect(ctx.restore).toHaveBeenCalledTimes(2)
  })
})
