/**
 * Tests für den Formen-Export der Grün-Skizze (src/export/skizzeFormen.ts).
 * Testdaten ausschließlich erfunden.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

import { exportWep } from '../index'
import { neuerWep } from '../../model'
import { BAU_SHEET_PATHS } from '../cellMapper'
import { deckblattPfade } from '../index'
import { ANKER_REGEX, skizzeBlattHatFormen } from '../skizzeBild'
import {
  elementeZuFormen,
  formNamen,
  leseBlattGeometrie,
  skizzeDatenZuFormen,
  zeichenbereichVon,
  type FormElement,
  type SvgRaster,
} from '../skizzeFormen'
import type { SkizzeDaten } from '../../skizze/types'

const VORLAGE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const DRAWING = 'xl/drawings/drawing9.xml'
const PT = 12700

let vorlage: ArrayBuffer
beforeAll(() => {
  const buf = fs.readFileSync(VORLAGE_PATH)
  vorlage = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

/** Winziges gültiges PNG als SVG-Fallback (die Pixel sind für die Tests egal). */
const PNG_1X1 = new Uint8Array(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
)
const raster: SvgRaster = async () => PNG_1X1

const wep = neuerWep('test-formen')
wep.formalien.unterpaechter = 'Erika Musterfrau'

const BEISPIEL: FormElement[] = [
  { typ: 'hochbeet', name: 'Hochbeet_0', kasten: { x: 1_500_000, y: 6_000_000, w: 400_000, h: 600_000 } },
  { typ: 'hochbeet', name: 'Hochbeet_1', kasten: { x: 2_000_000, y: 6_000_000, w: 400_000, h: 600_000 } },
  { typ: 'entfernen', name: 'Holzpferd', kasten: { x: 3_000_000, y: 3_000_000, w: 500_000, h: 400_000 }, text: 'Holzpferd entfernen' },
  { typ: 'baum', name: 'Bergahorn', kasten: { x: 4_000_000, y: 4_000_000, w: 500_000, h: 600_000 }, text: 'Bergahorn', variante: 'bergahorn' },
  { typ: 'hecke', name: 'Fliederhecke', kasten: { x: 1_000_000, y: 2_500_000, w: 2_000_000, h: 300_000 }, text: 'Flieder', variante: 'flieder' },
  { typ: 'kompost', name: 'Kompost', kasten: { x: 4_500_000, y: 2_500_000, w: 600_000, h: 400_000 } },
  { typ: 'mangelhinweis', name: 'Rueckschnitt', kasten: { x: 1_000_000, y: 2_000_000, w: 900_000, h: 200_000 }, text: 'Rückschnitt', nach: { x: 1_500_000, y: 2_500_000 } },
  { typ: 'massangabe', name: 'Maß_Laube_Breite', von: { x: 1_500_000, y: 7_000_000 }, nach: { x: 3_500_000, y: 7_000_000 }, text: '4 m' },
]

async function alsZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer())
}

function anker(drawingXml: string): string[] {
  return [...drawingXml.matchAll(ANKER_REGEX)].map((m) => m[0])
}

function istWohlgeformt(xml: string, name: string) {
  const fehler: string[] = []
  new DOMParser({ onError: (_l, m) => fehler.push(m) } as never).parseFromString(xml, 'text/xml')
  expect(fehler, name).toEqual([])
}

// ---------------------------------------------------------------------------

describe('Blatt-Geometrie', () => {
  it('liest Spalten und Zeilen des Skizzen-Blatts', async () => {
    const zip = await JSZip.loadAsync(vorlage)
    const geo = leseBlattGeometrie(await zip.file('xl/worksheets/sheet19.xml')!.async('string'))
    // Spalte A: 2,71 Zeichen = 19 px
    expect(geo.spalte(0)).toBe(19 * 9525)
    // Zeile 1: 18 pt
    expect(geo.zeile(0)).toBe(18 * PT)
    // nicht definierte Spalte/Zeile: Standardmaße
    expect(geo.zeile(100)).toBe(15 * PT)
    expect(geo.spalte(30)).toBeGreaterThan(0)
  })

  it('rechnet Position und Zelle ineinander um', async () => {
    const zip = await JSZip.loadAsync(vorlage)
    const geo = leseBlattGeometrie(await zip.file('xl/worksheets/sheet19.xml')!.async('string'))
    for (const x of [0, 5000, 200_000, 3_000_000, 6_100_000, 9_000_000]) {
      const p = geo.spaltePos(x)
      expect(geo.spalteStart(p.index) + p.versatz).toBe(x)
      expect(p.versatz).toBeLessThan(geo.spalte(p.index))
    }
    for (const y of [0, 1000, 2_000_000, 8_000_000]) {
      const p = geo.zeilePos(y)
      expect(geo.zeileStart(p.index) + p.versatz).toBe(y)
    }
  })

  it('stimmt mit dem Textfeld der Vorlage überein (Spalte E + Versatz, ±3 %)', async () => {
    // Textfeld 1: Anker Spalte 4 (E) + 1013460 EMU, xfrm x = 4739640
    const zip = await JSZip.loadAsync(vorlage)
    const geo = leseBlattGeometrie(await zip.file('xl/worksheets/sheet19.xml')!.async('string'))
    const x = geo.spalteStart(4) + 1013460
    expect(Math.abs(x - 4739640) / 4739640).toBeLessThan(0.03)
  })

  it('Zeichenbereich B7:G48 liegt im Rahmen der Vorlage', async () => {
    const zip = await JSZip.loadAsync(vorlage)
    const z = zeichenbereichVon(leseBlattGeometrie(await zip.file('xl/worksheets/sheet19.xml')!.async('string')))
    expect(z.x).toBeGreaterThan(19 * 9525)
    expect(z.w / PT).toBeGreaterThan(400)
    expect(z.w / PT).toBeLessThan(480)
    expect(z.h / PT).toBeGreaterThan(600)
    expect(z.h / PT).toBeLessThan(700)
  })
})

describe('Elemente → Formen', () => {
  it('vergibt sprechende Namen wie im Skill', () => {
    const namen = formNamen(BEISPIEL)
    for (const n of [
      'Hochbeet_0', 'Hochbeet_1',
      'Holzpferd', 'Holzpferd_X1', 'Holzpferd_X2', 'Holzpferd_Hinweis',
      'Bergahorn', 'Bergahorn_Text',
      'Fliederhecke_0', 'Fliederhecke_Text',
      'Kompost', 'Kompost_Latte_0', 'Kompost_Latte_1', 'Kompost_Latte_2', 'Kompost_Text',
      'Rueckschnitt', 'Rueckschnitt_Pfeil',
      'Maß_Laube_Breite', 'Maß_Laube_Breite_Strich1', 'Maß_Laube_Breite_Strich2', 'Maß_Laube_Breite_Text',
    ]) {
      expect(namen, n).toContain(n)
    }
    expect(new Set(namen).size).toBe(namen.length)
  })

  it('ordnet die Ebenen: Grün unten, Beschriftung, Hinweise, Maße oben', () => {
    const namen = formNamen(BEISPIEL)
    const pos = (n: string) => namen.indexOf(n)
    expect(pos('Fliederhecke_0')).toBeLessThan(pos('Kompost'))
    expect(pos('Kompost')).toBeLessThan(pos('Holzpferd'))
    expect(pos('Holzpferd')).toBeLessThan(pos('Bergahorn_Text'))
    expect(pos('Bergahorn_Text')).toBeLessThan(pos('Rueckschnitt'))
    expect(pos('Rueckschnitt')).toBeLessThan(pos('Maß_Laube_Breite'))
  })

  it('zeichnet die Hecke als versetzte, überlappende Ellipsen', () => {
    const formen = elementeZuFormen([BEISPIEL[4]], false).filter((f) => f.name.startsWith('Fliederhecke_') && f.art === 'sp')
    const ellipsen = formen.filter((f) => f.name !== 'Fliederhecke_Text')
    expect(ellipsen.length).toBeGreaterThanOrEqual(5)
    for (const e of ellipsen) {
      expect(e.art === 'sp' && e.prst).toBe('ellipse')
      expect(e.art === 'sp' && e.kasten.w).toBeLessThanOrEqual(30 * PT)
    }
    const ys = new Set(ellipsen.map((e) => (e.art === 'sp' ? e.kasten.y : 0)))
    expect(ys.size).toBe(2) // abwechselnd versetzt
  })

  it('Baum ohne SVG: Krone aus Kreisen + Stamm', () => {
    const namen = formNamen([BEISPIEL[3]], false)
    expect(namen).toEqual(expect.arrayContaining(['Bergahorn_Stamm', 'Bergahorn_Krone_0', 'Bergahorn_Krone_1', 'Bergahorn_Krone_2']))
  })
})

describe('Export als Excel-Formen', () => {
  it('schreibt Formen ins Drawing; die Textfelder der Vorlage bleiben byte-gleich', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    expect(r.skizzeEingefuegt).toBe(true)
    expect(r.skizzeFormen!.anzahlFormen).toBeGreaterThan(20)
    expect(r.skizzeFormen!.svgBilder).toBe(2) // Baum + Gras (Blatt ist leer)

    const zip = await alsZip(r.blob)
    const drawing = await zip.file(DRAWING)!.async('string')
    const orig = await (await JSZip.loadAsync(vorlage)).file(DRAWING)!.async('string')
    for (const a of anker(orig)) expect(drawing).toContain(a)

    for (const n of ['Hochbeet_0', 'Holzpferd_X1', 'Holzpferd_Hinweis', 'Maß_Laube_Breite', 'Kompost_Latte_2', 'Fliederhecke_Text']) {
      expect(drawing, n).toContain(`name="${n}"`)
    }
    istWohlgeformt(drawing, DRAWING)
  })

  it('Stil: Farben, Formen und Pfeile nach Skill', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const drawing = await (await alsZip(r.blob)).file(DRAWING)!.async('string')
    const form = (name: string) => anker(drawing).find((a) => a.includes(`name="${name}"`))!
    expect(form('Holzpferd')).toContain('prst="star16"')
    expect(form('Holzpferd_X1')).toMatch(/<a:ln w="25400"><a:solidFill><a:srgbClr val="C00000"/)
    expect(form('Holzpferd_Hinweis')).toContain('prst="roundRect"')
    expect(form('Holzpferd_Hinweis')).toContain('<a:srgbClr val="FFFFFF"/>')
    expect(form('Holzpferd_Hinweis')).toMatch(/<a:rPr[^>]*><a:solidFill><a:srgbClr val="C00000"/)
    expect(form('Rueckschnitt_Pfeil')).toContain('<a:tailEnd type="triangle"')
    expect(form('Maß_Laube_Breite')).toContain('val="C00000"')
    expect(form('Maß_Laube_Breite_Text')).toContain('>4 m<')
    expect(form('Fliederhecke_0')).toContain('prst="ellipse"')
    expect(form('Fliederhecke_0')).toContain('B4A7D6')
    expect(form('Kompost')).toContain('D9C3A5')
    expect(form('Kompost_Latte_0')).toContain('8B5A2B')
    // Beschriftungen sind transparente Textfelder, 9 pt
    expect(form('Bergahorn_Text')).toContain('txBox="1"')
    expect(form('Bergahorn_Text')).toContain('<a:noFill/>')
    expect(form('Bergahorn_Text')).toContain('sz="900"')
  })

  it('alle eigenen Formen tragen descr="wep-app", die IDs sind eindeutig', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const drawing = await (await alsZip(r.blob)).file(DRAWING)!.async('string')
    const eigene = anker(drawing).filter((a) => a.includes('descr="wep-app"'))
    expect(eigene.length).toBe(r.skizzeFormen!.anzahlFormen)
    const ids = [...drawing.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.min(...ids.map(Number))).toBeGreaterThanOrEqual(2) // 2 = Textfeld 1 der Vorlage
    const namen = [...drawing.matchAll(/<xdr:cNvPr\b[^>]*\sname="([^"]*)"/g)].map((m) => m[1])
    expect(new Set(namen).size).toBe(namen.length)
  })

  it('Positionen: twoCellAnchor editAs="oneCell" passt zu xfrm und Blatt-Geometrie', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const zip = await alsZip(r.blob)
    const drawing = await zip.file(DRAWING)!.async('string')
    const geo = leseBlattGeometrie(await zip.file('xl/worksheets/sheet19.xml')!.async('string'))
    const a = anker(drawing).find((x) => x.includes('name="Hochbeet_0"'))!
    expect(a).toContain('<xdr:twoCellAnchor editAs="oneCell">')
    const num = (tag: string) => Number(new RegExp(`<xdr:${tag}>(\\d+)</xdr:${tag}>`).exec(a)![1])
    const xVon = geo.spalteStart(num('col')) + num('colOff')
    const yVon = geo.zeileStart(num('row')) + num('rowOff')
    expect(xVon).toBe(1_500_000)
    expect(yVon).toBe(6_000_000)
    expect(a).toContain('<a:off x="1500000" y="6000000"/>')
    expect(a).toContain('<a:ext cx="400000" cy="600000"/>')
  })

  it('Piktogramme: SVG-Bild mit PNG-Fallback, Beziehungen und Content-Types', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const zip = await alsZip(r.blob)
    const drawing = await zip.file(DRAWING)!.async('string')
    const rels = await zip.file('xl/drawings/_rels/drawing9.xml.rels')!.async('string')
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('<Default Extension="png" ContentType="image/png"/>')
    expect(ct).toContain('<Default Extension="svg" ContentType="image/svg+xml"/>')
    const pic = anker(drawing).find((a) => a.includes('name="Bergahorn"'))!
    expect(pic).toContain('<xdr:pic>')
    expect(pic).toContain('{96DAC541-7B7A-43D3-8B79-37D633B846F1}')
    istWohlgeformt(rels, 'drawing9.xml.rels')
    // jedes r:embed zeigt auf eine vorhandene Datei
    for (const id of [...pic.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1])) {
      const ziel = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)?.[1]
      expect(ziel, id).toBeTruthy()
      expect(zip.file(`xl/${ziel!.replace('../', '')}`), ziel).not.toBeNull()
    }
    const svg = await zip.file(/xl\/media\/wep-skizze-form\d+\.svg/)[0].async('string')
    expect(svg).toContain('<svg')
    istWohlgeformt(svg, 'svg')
  })

  it('ohne Rasterisierer entstehen nur einfache Formen und keine Bilddateien', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL } })
    expect(r.skizzeFormen!.svgBilder).toBe(0)
    const zip = await alsZip(r.blob)
    expect(zip.file(/^xl\/media\//)).toHaveLength(0)
    expect(await zip.file(DRAWING)!.async('string')).toContain('name="Bergahorn_Krone_0"')
  })

  it('leeres Blatt: Grundstück + Gras (SVG) kommen dazu, Gras liegt unten', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    expect(r.skizzeFormen!.graswiese).toBe(true)
    const drawing = await (await alsZip(r.blob)).file(DRAWING)!.async('string')
    const namen = anker(drawing).map((a) => /name="([^"]*)"/.exec(a)![1])
    expect(namen.indexOf('Grundstück')).toBeLessThan(namen.indexOf('Gras'))
    expect(namen.indexOf('Gras')).toBeLessThan(namen.indexOf('Hochbeet_0'))
    expect(r.skizzeFormen!.svgBilder).toBe(2)
    // Option: ohne Wiese
    const ohne = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster, graswiese: false } })
    expect(ohne.skizzeFormen!.graswiese).toBe(false)
  })

  it('die Elemente-Funktion sieht Zeichenbereich und Formen-Status', async () => {
    let ctx: { hatFormen: boolean; w: number } | undefined
    await exportWep(wep, vorlage, {
      skizzeFormen: {
        elemente: (c) => {
          ctx = { hatFormen: c.hatFormen, w: c.zeichenbereich.w }
          return []
        },
      },
    })
    expect(ctx!.hatFormen).toBe(false)
    expect(ctx!.w).toBeGreaterThan(5_000_000)
  })

  it('Bau-Blätter bleiben byte-gleich', async () => {
    const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const zip = await alsZip(r.blob)
    const orig = await JSZip.loadAsync(vorlage)
    const deckblaetter = await deckblattPfade(orig)
    for (const p of BAU_SHEET_PATHS.filter((x) => !deckblaetter.includes(x))) {
      expect(await zip.file(p)!.async('string'), p).toBe(await orig.file(p)!.async('string'))
    }
  })

  it('PNG-Weg bleibt als Fallback (skizzeAlsBild)', async () => {
    const r = await exportWep(wep, vorlage, {
      skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster },
      skizzeAlsBild: true,
      skizzePng: PNG_1X1,
    })
    expect(r.skizzeFormen).toBeUndefined()
    const drawing = await (await alsZip(r.blob)).file(DRAWING)!.async('string')
    expect(drawing).toContain('name="WEP-App Skizze"')
    expect(drawing).not.toContain('name="Hochbeet_0"')
  })
})

// --- Blatt mit fremden Formen (kopierte Bau-Skizze, erfunden) -------------------

function fremdForm(id: number, name: string, text = ''): string {
  return (
    '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
    '<xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
    '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`
  )
}
const KOPF =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
const FREMDE = [fremdForm(2, 'Rechteck 3'), fremdForm(3, 'Rechteck 8', 'L'), fremdForm(4, 'Textfeld 15', 'A1')]

async function vorlageMit(drawingXml: string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(vorlage)
  zip.file(DRAWING, drawingXml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('Blatt mit fremden Formen', () => {
  const quelle = KOPF + FREMDE.join('') + '</xdr:wsDr>'

  it('fremde Formen bleiben unverändert, Gras/Wiese entfallen', async () => {
    const r = await exportWep(wep, await vorlageMit(quelle), {
      skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster },
    })
    expect(r.skizzeFormen!.graswiese).toBe(false)
    const drawing = await (await alsZip(r.blob)).file(DRAWING)!.async('string')
    for (const f of FREMDE) expect(drawing).toContain(f)
    expect(drawing).not.toContain('name="Gras"')
    expect(drawing).not.toContain('name="Grundstück"')
    // neue Shape-IDs beginnen hinter der höchsten vorhandenen
    const ids = anker(drawing).filter((a) => a.includes('wep-app')).map((a) => Number(/ id="(\d+)"/.exec(a)![1]))
    expect(Math.min(...ids)).toBe(5)
    // die fremden Formen stehen vor den eigenen (liegen darunter)
    expect(drawing.indexOf('name="Textfeld 15"')).toBeLessThan(drawing.indexOf('name="Hochbeet_0"'))
  })

  it('erneuter Export ersetzt nur eigene Formen (samt Bilddateien), nie fremde', async () => {
    const erst = await exportWep(wep, await vorlageMit(quelle), { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const zweit = await exportWep(wep, await erst.blob.arrayBuffer(), {
      skizzeFormen: { elemente: BEISPIEL.slice(0, 2), rasterisiere: raster },
    })
    expect(zweit.skizzeFormen!.entfernt).toBe(erst.skizzeFormen!.anzahlFormen)
    const zip = await alsZip(zweit.blob)
    const drawing = await zip.file(DRAWING)!.async('string')
    for (const f of FREMDE) expect(drawing).toContain(f)
    expect(drawing).not.toContain('name="Holzpferd"')
    expect(drawing).toContain('name="Hochbeet_1"')
    expect(drawing.match(/name="Hochbeet_0"/g)).toHaveLength(1)
    // keine Bild-Leichen: nur Bilder, die noch verwendet werden (hier: keine Pikto­gramme mehr)
    expect(zip.file(/^xl\/media\//)).toHaveLength(0)
    const rels = await zip.file('xl/drawings/_rels/drawing9.xml.rels')?.async('string')
    expect(rels ?? '').not.toContain('wep-skizze')
  })

  it('ein früherer Export zählt nicht als „Blatt hat Formen“', async () => {
    const erst = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    expect(await skizzeBlattHatFormen(await erst.blob.arrayBuffer())).toBe(false)
    // …und ein zweiter Export auf leerem Blatt bekommt wieder Wiese + Gras
    const zweit = await exportWep(wep, await erst.blob.arrayBuffer(), { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    expect(zweit.skizzeFormen!.graswiese).toBe(true)
  })

  it('PNG-Export nach Formen-Export: keine doppelten Formen', async () => {
    const erst = await exportWep(wep, vorlage, { skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster } })
    const png = await exportWep(wep, await erst.blob.arrayBuffer(), { skizzePng: PNG_1X1 })
    const drawing = await (await alsZip(png.blob)).file(DRAWING)!.async('string')
    expect(drawing).not.toContain('descr="wep-app"')
    expect(drawing).toContain('name="WEP-App Skizze"')
  })
})

// --- Editor-Skizze (Pixel) → Formen ---------------------------------------------

describe('skizzeDatenZuFormen', () => {
  const daten: SkizzeDaten = {
    breite: 800,
    hoehe: 600,
    elemente: [
      { id: 'a', typ: 'rechteck', x: 0, y: 0, breite: 400, hoehe: 300 },
      { id: 'b', typ: 'kreis', cx: 600, cy: 450, radius: 50, beschriftung: 'Baum' },
      { id: 'c', typ: 'massangabe', x1: 0, y1: 320, x2: 400, y2: 320, beschriftung: '4 m' },
      { id: 'd', typ: 'text', x: 100, y: 500, inhalt: 'Laube' },
      { id: 'e', typ: 'linie', x1: 0, y1: 0, x2: 800, y2: 600 },
    ],
  }
  const bereich = { x: 1_000_000, y: 2_000_000, w: 4_000_000, h: 6_000_000 }

  it('passt die Skizze zentriert in den Bereich (Seitenverhältnis bleibt)', () => {
    const f = skizzeDatenZuFormen(daten, bereich)
    expect(f.map((e) => e.name)).toEqual(['Rechteck_0', 'Kreis_0', 'Maß_0', 'Text_0', 'Linie_0'])
    const linie = f[4]
    expect(linie.von!.x).toBe(1_000_000)
    expect(linie.nach!.x).toBe(5_000_000)
    // 800×600 in 4 000 000 × 6 000 000 → Höhe 3 000 000, zentriert
    expect(linie.nach!.y - linie.von!.y).toBe(3_000_000)
    expect(linie.von!.y).toBe(2_000_000 + 1_500_000)
  })

  it('wird exportiert (Rechteck, Kreis mit Beschriftung, Maßlinie, Text)', async () => {
    const r = await exportWep(wep, vorlage, {
      skizzeFormen: { elemente: ({ zeichenbereich }) => skizzeDatenZuFormen(daten, zeichenbereich) },
    })
    const drawing = await (await alsZip(r.blob)).file(DRAWING)!.async('string')
    for (const n of ['Rechteck_0', 'Kreis_0', 'Kreis_0_Text', 'Maß_0', 'Maß_0_Text', 'Text_0', 'Linie_0']) {
      expect(drawing, n).toContain(`name="${n}"`)
    }
  })
})

// --- LibreOffice -------------------------------------------------------------------

function findeSoffice(): string | undefined {
  const k = [
    process.env.SOFFICE,
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ].filter(Boolean) as string[]
  const gefunden = k.find((p) => fs.existsSync(p))
  if (gefunden) return gefunden
  return ['libreoffice', 'soffice'].find((n) => spawnSync(n, ['--version'], { stdio: 'ignore' }).status === 0)
}

describe('LibreOffice', () => {
  const soffice = findeSoffice()

  it('öffnet die Datei, liest alle Formen und rendert ein PDF', async () => {
    if (!soffice) {
      console.log('LibreOffice nicht gefunden (SOFFICE setzen) – Test übersprungen')
      return
    }
    const r = await exportWep(wep, await vorlageMit(KOPF + FREMDE.join('') + '</xdr:wsDr>'), {
      skizzeFormen: { elemente: BEISPIEL, rasterisiere: raster },
    })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wep-formen-'))
    try {
      const xlsx = path.join(dir, 'formen.xlsx')
      fs.writeFileSync(xlsx, Buffer.from(await r.blob.arrayBuffer()))
      const profil = `-env:UserInstallation=file:///${path.join(dir, 'profil').replace(/\\/g, '/')}`
      // 1. Flat-ODS: LibreOffice hat die Formen als Zeichenobjekte gelesen (Name erhalten)
      execFileSync(soffice, [profil, '--headless', '--convert-to', 'fods', '--outdir', dir, xlsx], { stdio: 'pipe', timeout: 120000 })
      const fods = fs.readFileSync(path.join(dir, 'formen.fods'), 'utf8')
      for (const n of ['Hochbeet_0', 'Holzpferd', 'Holzpferd_X1', 'Holzpferd_Hinweis', 'Kompost_Latte_1', 'Maß_Laube_Breite', 'Rechteck 8']) {
        expect(fods, n).toContain(`draw:name="${n}"`)
      }
      // 2. PDF entsteht (alle Blätter, inkl. Skizzen-Blatt mit den Formen)
      execFileSync(soffice, [profil, '--headless', '--convert-to', 'pdf', '--outdir', dir, xlsx], { stdio: 'pipe', timeout: 120000 })
      expect(fs.statSync(path.join(dir, 'formen.pdf')).size).toBeGreaterThan(20_000)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 240000)
})

// Hinweis: Die Sichtprüfung (PDF → PNG) macht `npm run ki-test-skizze-export`
// (tools/ki-test/export-skizze.ts); das Ergebnis liegt in tools/ki-test/ergebnis-skizze/.
