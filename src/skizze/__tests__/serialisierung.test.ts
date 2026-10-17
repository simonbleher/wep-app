/**
 * Serialisierungs-Roundtrip-Tests für SkizzeDaten.
 *
 * SkizzeDaten muss vollständig als JSON serialisiert und wieder deserialisiert
 * werden können (für IndexedDB-Speicherung und OneDrive-Sync).
 */
import { describe, it, expect } from 'vitest'
import type { SkizzeDaten, SkizzeElement } from '../types.js'
import { leereSkizze } from '../types.js'

function serialisieren(daten: SkizzeDaten): string {
  return JSON.stringify(daten)
}

function deserialisieren(json: string): SkizzeDaten {
  return JSON.parse(json) as SkizzeDaten
}

describe('SkizzeDaten Serialisierung', () => {
  it('leere Skizze überlebt Roundtrip', () => {
    const original = leereSkizze()
    const wieder = deserialisieren(serialisieren(original))
    expect(wieder).toStrictEqual(original)
  })

  it('Rechteck überlebt Roundtrip', () => {
    const r: SkizzeElement = { id: 'r1', typ: 'rechteck', x: 10, y: 20, breite: 100, hoehe: 50 }
    const daten: SkizzeDaten = { elemente: [r] }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder.elemente).toHaveLength(1)
    expect(wieder.elemente[0]).toStrictEqual(r)
  })

  it('Linie überlebt Roundtrip', () => {
    const l: SkizzeElement = { id: 'l1', typ: 'linie', x1: 0, y1: 0, x2: 200, y2: 100 }
    const daten: SkizzeDaten = { elemente: [l] }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder.elemente[0]).toStrictEqual(l)
  })

  it('Kreis mit Beschriftung überlebt Roundtrip', () => {
    const k: SkizzeElement = {
      id: 'k1',
      typ: 'kreis',
      cx: 150,
      cy: 150,
      radius: 25,
      beschriftung: 'Apfel',
    }
    const daten: SkizzeDaten = { elemente: [k] }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder.elemente[0]).toStrictEqual(k)
  })

  it('Kreis ohne Beschriftung überlebt Roundtrip', () => {
    const k: SkizzeElement = { id: 'k2', typ: 'kreis', cx: 100, cy: 100, radius: 20 }
    const daten: SkizzeDaten = { elemente: [k] }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder.elemente[0]).toStrictEqual(k)
  })

  it('Text überlebt Roundtrip', () => {
    const t: SkizzeElement = { id: 't1', typ: 'text', x: 50, y: 50, inhalt: 'Laube', schriftgroesse: 16 }
    const daten: SkizzeDaten = { elemente: [t] }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder.elemente[0]).toStrictEqual(t)
  })

  it('Maßangabe überlebt Roundtrip', () => {
    const m: SkizzeElement = {
      id: 'm1',
      typ: 'massangabe',
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      beschriftung: '3,5 m',
    }
    const daten: SkizzeDaten = { elemente: [m] }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder.elemente[0]).toStrictEqual(m)
  })

  it('komplexe Skizze mit allen Elementtypen überlebt Roundtrip', () => {
    const daten: SkizzeDaten = {
      elemente: [
        { id: 'r1', typ: 'rechteck', x: 10, y: 10, breite: 100, hoehe: 80 },
        { id: 'l1', typ: 'linie', x1: 0, y1: 0, x2: 200, y2: 200 },
        { id: 'k1', typ: 'kreis', cx: 300, cy: 100, radius: 30, beschriftung: 'Birne' },
        { id: 't1', typ: 'text', x: 50, y: 200, inhalt: 'Gartenweg' },
        {
          id: 'm1',
          typ: 'massangabe',
          x1: 10,
          y1: 300,
          x2: 210,
          y2: 300,
          beschriftung: '5 m',
        },
      ],
      breite: 800,
      hoehe: 600,
      raster: true,
      rasterGroesse: 40,
    }
    const wieder = deserialisieren(serialisieren(daten))
    expect(wieder).toStrictEqual(daten)
  })

  it('undefined-Felder (optionale) gehen verloren – das ist OK', () => {
    // beschriftung ist optional und wird nicht serialisiert wenn undefined
    const k: SkizzeElement = { id: 'k3', typ: 'kreis', cx: 50, cy: 50, radius: 15 }
    const json = serialisieren({ elemente: [k] })
    expect(json).not.toContain('beschriftung')
  })
})
