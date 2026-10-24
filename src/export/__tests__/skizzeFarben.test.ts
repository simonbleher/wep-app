/**
 * Füllfarben, Linienfarben, Linienarten und Pfeile in Skizze und Excel-Export; alte Skizzen bleiben unverändert;
 * Farben, rote Maßlinien und Pfeilspitzen aus einer eingelesenen Bau-Excel kommen in die Grundlage. Erfundene Daten.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { erzeugeTestBauExcel, type TestForm } from '../../bauexcel/testBauExcel'
import { uebernehmeGrundlage } from '../../skizze/grundlage'
import { skizzeAufContext } from '../../skizze/skizzePng'
import type { SkizzeBauform, SkizzeDaten, SkizzeLinie } from '../../skizze/types'
import { leseBauSkizze } from '../bauSkizzeLesen'
import { skizzeDatenZuFormen } from '../skizzeFormen'
import { alteSkizze } from './alteSkizze'
import { exportiereDrawingXml } from './alteSkizzeXml'

const hier = path.dirname(fileURLToPath(import.meta.url))
const BEREICH = { x: 0, y: 0, w: 4_000_000, h: 6_000_000 }

/** Ein Shape (`xdr:sp`/`xdr:cxnSp`) des Zeichnungs-XML nach Namen. */
function form(xml: string, name: string): string {
  const m = new RegExp(`<xdr:(sp|cxnSp)\\b(?:(?!</xdr:\\1>)[\\s\\S])*?name="${name}"[\\s\\S]*?</xdr:\\1>`).exec(xml)
  if (!m) throw new Error(`Form „${name}“ fehlt`)
  return m[0]
}

describe('alte Skizzen sehen unverändert aus', () => {
  it('Excel-Export: das Zeichnungs-XML ist byte-gleich zu dem vor der Schnittstelle', async () => {
    const erwartet = fs.readFileSync(path.join(hier, 'fixtures/alte-skizze-drawing.xml'), 'utf8')
    expect(await exportiereDrawingXml(alteSkizze)).toBe(erwartet)
  })

  it('Formen: kein Stil, kein Pfeil, keine Füllung für Rechteck und Kreis', () => {
    const f = skizzeDatenZuFormen(alteSkizze, BEREICH)
    for (const e of f.filter((x) => x.typ === 'rechteck' || x.typ === 'kreis' || x.typ === 'linie')) {
      expect(e.stil, e.name).toBeUndefined()
      expect(e.pfeil, e.name).toBeUndefined()
    }
  })

  it('PNG/PDF-Zeichnung: Rechteck mit strokeRect, Kreis mit arc, ohne Strichmuster', () => {
    const aufrufe: string[] = []
    const ctx = new Proxy(
      { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '' },
      {
        get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : (..._a: unknown[]) => void aufrufe.push(k)),
        set: (t, k: string, v) => {
          ;(t as Record<string, unknown>)[k] = v
          return true
        },
      },
    )
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, { ...alteSkizze, elemente: alteSkizze.elemente.slice(0, 4) }, 800, 600, { transparent: true })
    expect(aufrufe).toContain('strokeRect')
    expect(aufrufe).toContain('arc')
    expect(aufrufe).not.toContain('setLineDash')
    expect(aufrufe).not.toContain('ellipse')
  })
})

const stilSkizze: SkizzeDaten = {
  breite: 800,
  hoehe: 600,
  elemente: [
    { id: 's1', typ: 'rechteck', x: 100, y: 100, breite: 200, hoehe: 100, fuellung: '#D9C3A5', linie: '#8B5A2B', linienart: 'gestrichelt', beschriftung: 'Kompost' },
    { id: 's2', typ: 'kreis', cx: 500, cy: 300, radius: 60, radiusY: 30, fuellung: '#B4A7D6', linie: '#7030A0' },
    { id: 's3', typ: 'vieleck', punkte: [{ x: 50, y: 400 }, { x: 300, y: 380 }, { x: 320, y: 520 }, { x: 60, y: 540 }], fuellung: '#C5E0B4', beschriftung: 'Wiese' },
    { id: 's4', typ: 'linie', x1: 400, y1: 100, x2: 450, y2: 150, farbe: '#C00000', pfeil: true },
    { id: 's5', typ: 'symbol', art: 'mangelhinweis', x: 500, y: 450, breite: 90, hoehe: 22, beschriftung: 'Mangel', ziel: { x: 450, y: 380 } },
    { id: 's6', typ: 'massangabe', x1: 100, y1: 560, x2: 400, y2: 560, beschriftung: '4 m', farbe: '#C00000' },
    { id: 's7', typ: 'rechteck', x: 600, y: 100, breite: 50, hoehe: 50 },
  ],
}

describe('Farben im Excel-Export', () => {
  it('Füllung, Linienfarbe, Strichart, Ellipse, Vieleck und Pfeil stehen in den Formen', async () => {
    const xml = await exportiereDrawingXml(stilSkizze)
    const rechteck = form(xml, 'Rechteck_0')
    expect(rechteck).toContain('<a:solidFill><a:srgbClr val="D9C3A5"/></a:solidFill>')
    expect(rechteck).toContain('<a:srgbClr val="8B5A2B"/>')
    expect(rechteck).toContain('<a:prstDash val="dash"/>')
    expect(rechteck).toContain('Kompost') // Beschriftung in der gefüllten Fläche
    // ohne Füllung und Farben wie bisher: Rahmen dunkel, keine Füllung, keine Strichart
    const alt = form(xml, 'Rechteck_1')
    expect(alt).toContain('<a:noFill/>')
    expect(alt).toContain('<a:srgbClr val="262626"/>')
    expect(alt).not.toContain('prstDash')

    const ellipse = form(xml, 'Ellipse_0')
    expect(ellipse).toContain('prst="ellipse"')
    expect(ellipse).toContain('val="B4A7D6"')
    const cx = Number(/<a:ext cx="(\d+)" cy="(\d+)"/.exec(ellipse)![1])
    const cy = Number(/<a:ext cx="(\d+)" cy="(\d+)"/.exec(ellipse)![2])
    expect(cx / cy).toBeCloseTo(2, 1)

    const vieleck = form(xml, 'Vieleck_0')
    expect(vieleck).toContain('<a:custGeom>')
    expect(vieleck).toContain('val="C5E0B4"')
    expect(vieleck).toContain('Wiese')

    const pfeil = form(xml, 'Pfeil_0')
    expect(pfeil).toContain('<a:srgbClr val="C00000"/>')
    expect(pfeil).toContain('<a:tailEnd type="triangle"')

    // Mängelhinweis mit Pfeil
    expect(form(xml, 'Mangel_0_Pfeil')).toContain('<a:tailEnd type="triangle"')
  })

  it('Flächen mit Füllung liegen unter dem Grün (Baum, Hecke), Rahmen ohne Füllung darüber wie bisher', async () => {
    const daten: SkizzeDaten = {
      breite: 800,
      hoehe: 600,
      elemente: [
        { id: 'b', typ: 'symbol', art: 'baum', x: 300, y: 300, breite: 34, hoehe: 42, beschriftung: 'Apfel' },
        { id: 'w', typ: 'rechteck', x: 200, y: 200, breite: 300, hoehe: 250, fuellung: '#C5E0B4' },
      ],
    }
    const xml = await exportiereDrawingXml(daten)
    // die Wiese (später gezeichnet) steht im Zeichnungs-XML vor dem Baum: Reihenfolge = Ebene
    expect(xml.indexOf('name="Rechteck_0"')).toBeLessThan(xml.indexOf('name="Apfel_0'))
  })
})

describe('PNG/PDF-Zeichnung gestalteter Formen', () => {
  it('Füllung, Linienfarbe, Strichmuster und Pfeil kommen beim Zeichnen vor', () => {
    const aufrufe: { m: string; fill: string; stroke: string }[] = []
    const roh = { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '' }
    const ctx = new Proxy(roh, {
      get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : (..._a: unknown[]) => void aufrufe.push({ m: k, fill: t.fillStyle, stroke: t.strokeStyle })),
      set: (t, k: string, v) => {
        ;(t as Record<string, unknown>)[k] = v
        return true
      },
    })
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, stilSkizze, 800, 600, { transparent: true })
    expect(aufrufe.some((a) => a.m === 'fill' && a.fill === '#D9C3A5')).toBe(true)
    expect(aufrufe.some((a) => a.m === 'stroke' && a.stroke === '#8B5A2B')).toBe(true)
    expect(aufrufe.some((a) => a.m === 'fill' && a.fill === '#C5E0B4')).toBe(true)
    expect(aufrufe.some((a) => a.m === 'ellipse')).toBe(true)
    expect(aufrufe.some((a) => a.m === 'setLineDash')).toBe(true)
    expect(aufrufe.some((a) => a.m === 'fill' && a.fill === '#C00000')).toBe(true) // Pfeilspitze der Linie
  })
})

describe('Bau-Excel → Grundlage: Farben, rote Maßlinien, Pfeilspitzen', () => {
  const pfeile: TestForm[] = [
    { name: 'Pfeil ende', art: 'linie', x: 100, y: 400, w: 100, h: 0, linie: 'C00000', pfeil: true },
    { name: 'Pfeil anfang', art: 'linie', x: 100, y: 420, w: 100, h: 0, linie: '0070C0', pfeil: 'anfang' },
    { name: 'Rechteck 40', art: 'rechteck', x: 60, y: 500, w: 50, h: 30, text: 'S2', fuellung: 'FFE699', linie: 'BF9000' },
  ]

  it('liest Füll- und Linienfarben sowie Pfeilspitzen aus den Formen', async () => {
    const excel = await erzeugeTestBauExcel({ skizzeBau: true, weitereFormen: pfeile })
    const lesen = await leseBauSkizze(excel)
    const rot = lesen.formen.find((f) => f.name === 'Gerader Verbinder 25')!
    expect(rot.linieFarbe).toBe('#C00000')
    expect(rot.pfeil).toBeUndefined()
    const ende = lesen.formen.find((f) => f.name === 'Pfeil ende')!
    expect(ende).toMatchObject({ art: 'linie', linieFarbe: '#C00000', pfeil: true })
    // Pfeilspitze nur am Anfang: Anfang und Ende werden getauscht, die Spitze sitzt am Ende „nach“
    const anfang = lesen.formen.find((f) => f.name === 'Pfeil anfang')!
    expect(anfang).toMatchObject({ pfeil: true, linieFarbe: '#0070C0' })
    expect(anfang.von!.x).toBeGreaterThan(anfang.nach!.x)
    const s2 = lesen.formen.find((f) => f.name === 'Rechteck 40')!
    expect(s2).toMatchObject({ fuellungFarbe: '#FFE699', linieFarbe: '#BF9000' })
  })

  it('die Grundlage übernimmt Farben, rote Maßlinie und Pfeile; eigene Formen der App folgen den Standardfarben', async () => {
    const excel = await erzeugeTestBauExcel({ skizzeBau: true, weitereFormen: pfeile })
    const lesen = await leseBauSkizze(excel)
    const erg = uebernehmeGrundlage({ elemente: [] }, { art: 'excel', lesen }, '2026-10-23T10:00:00Z')!
    const linien = erg.daten.elemente.filter((e): e is SkizzeLinie => e.typ === 'linie')
    expect(linien.some((l) => l.farbe === '#C00000' && !l.pfeil)).toBe(true) // rote Maßlinie
    expect(linien.some((l) => l.farbe === '#C00000' && l.pfeil)).toBe(true)
    expect(linien.some((l) => l.farbe === '#0070C0' && l.pfeil)).toBe(true)
    const formen = erg.daten.elemente.filter((e): e is SkizzeBauform => e.typ === 'bauform')
    expect(formen.find((f) => f.beschriftung === 'S2')).toMatchObject({ fuellung: '#FFE699', linie: '#BF9000' })
    // Gebäude in Standardfarben tragen keine eigene Farbangabe, wenn sie dem Standard entsprechen – sie werden aber 1:1 übernommen
    expect(formen.find((f) => f.beschriftung === 'L')).toMatchObject({ fuellung: '#E7E6E6', linie: '#262626' })
  })

  it('die Farben der Grundlage erreichen den Excel-Export', async () => {
    const excel = await erzeugeTestBauExcel({ skizzeBau: true, weitereFormen: pfeile })
    const lesen = await leseBauSkizze(excel)
    const erg = uebernehmeGrundlage({ elemente: [] }, { art: 'excel', lesen }, '2026-10-23T10:00:00Z')!
    const xml = await exportiereDrawingXml(erg.daten)
    expect(xml).toContain('val="FFE699"')
    expect(xml).toContain('val="BF9000"')
    expect(xml).toContain('val="0070C0"')
    expect(xml).toContain('<a:tailEnd type="triangle"')
  })
})
