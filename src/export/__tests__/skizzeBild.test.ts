/**
 * Tests für das Einfügen der Parzellenskizze (src/export/skizzeBild.ts).
 * Testdaten ausschließlich erfunden.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import zlib from 'node:zlib'
import { execSync } from 'node:child_process'
import JSZip from 'jszip'

import { exportWep, deckblattPfade } from '../index'
import { neuerWep } from '../../model'
import { BAU_SHEET_PATHS } from '../cellMapper'
import {
  SKIZZE_BILDNAME,
  einpassen,
  findeBlattPfad,
  pngGroesse,
  skizzeBlattHatFormen,
  zaehleFremdeFormen,
  zelleUndVersatz,
} from '../skizzeBild'

const VORLAGE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/WEP_Vorlage.xlsx',
)

let vorlage: ArrayBuffer

beforeAll(() => {
  const buf = fs.readFileSync(VORLAGE_PATH)
  vorlage = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

// --- kleines PNG ohne Canvas erzeugen (Rahmen + Diagonale) ------------------

const CRC_TABELLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABELLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(typ: string, daten: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(daten.length)
  const td = Buffer.concat([Buffer.from(typ, 'ascii'), daten])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function testPng(breite: number, hoehe: number): Uint8Array {
  const zeilen: Buffer[] = []
  for (let y = 0; y < hoehe; y++) {
    const z = Buffer.alloc(1 + breite * 3, 255)
    z[0] = 0
    for (let x = 0; x < breite; x++) {
      const rand = x < 3 || y < 3 || x >= breite - 3 || y >= hoehe - 3
      const diagonale = Math.abs(x / breite - y / hoehe) < 0.01
      if (rand || diagonale) z.fill(0, 1 + x * 3, 4 + x * 3)
    }
    zeilen.push(z)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breite, 0)
  ihdr.writeUInt32BE(hoehe, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(zeilen))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

async function alsZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer())
}

// ---------------------------------------------------------------------------

describe('Hilfsfunktionen', () => {
  it('liest die PNG-Größe', () => {
    expect(pngGroesse(testPng(80, 60))).toEqual({ breite: 80, hoehe: 60 })
    expect(() => pngGroesse(new Uint8Array([1, 2, 3]))).toThrow(/PNG/)
  })

  it('passt ein und zentriert', () => {
    expect(einpassen(800, 600, 400, 600)).toEqual({ x: 0, y: 150, cx: 400, cy: 300 })
    expect(einpassen(100, 200, 400, 400)).toEqual({ x: 100, y: 0, cx: 200, cy: 400 })
  })

  it('rechnet Abstand in Zelle + Versatz um', () => {
    expect(zelleUndVersatz(0, [10, 20, 30], 1)).toEqual([1, 0])
    expect(zelleUndVersatz(15, [10, 20, 30], 1)).toEqual([2, 5])
    expect(zelleUndVersatz(35, [10, 20, 30], 1)).toEqual([3, 5])
  })

  it('findet das Skizzen-Blatt der Vorlage', async () => {
    const zip = await JSZip.loadAsync(vorlage)
    expect(await findeBlattPfad(zip, 'Skizze Außenanlage-Aufwuchs')).toBe('xl/worksheets/sheet19.xml')
    expect(await findeBlattPfad(zip, 'gibt es nicht')).toBeUndefined()
  })
})

describe('Export mit Skizze', () => {
  const wep = neuerWep('test-skizze')
  wep.formalien.unterpaechter = 'Erika Musterfrau'
  wep.formalien.vorgangsNr = '2026-SK1'

  it('ohne PNG bleibt das Skizzen-Blatt unverändert', async () => {
    const r = await exportWep(wep, vorlage)
    expect(r.skizzeEingefuegt).toBe(false)
    const zip = await alsZip(r.blob)
    const orig = await JSZip.loadAsync(vorlage)
    expect(await zip.file('xl/drawings/drawing9.xml')!.async('string')).toBe(
      await orig.file('xl/drawings/drawing9.xml')!.async('string'),
    )
    expect(zip.file(/^xl\/media\//)).toHaveLength(0)
  })

  it('fügt Bild, Beziehungen und Content-Type ein; Textfeld bleibt', async () => {
    const r = await exportWep(wep, vorlage, { skizzePng: testPng(800, 600) })
    expect(r.skizzeEingefuegt).toBe(true)
    const zip = await alsZip(r.blob)

    expect(zip.file('xl/media/wep-skizze1.png')).not.toBeNull()
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('<Default Extension="png" ContentType="image/png"/>')

    const rels = await zip.file('xl/drawings/_rels/drawing9.xml.rels')!.async('string')
    expect(rels).toMatch(/Id="rId1"[^>]*relationships\/image" Target="..\/media\/wep-skizze1.png"/)

    const drawing = await zip.file('xl/drawings/drawing9.xml')!.async('string')
    expect(drawing).toContain('name="Textfeld 1"')
    expect(drawing).toContain(`name="${SKIZZE_BILDNAME}"`)
    expect(drawing).toContain('r:embed="rId1"')
    // Seitenverhältnis 4:3 bleibt erhalten
    const ext = /<xdr:ext cx="(\d+)" cy="(\d+)"\/><xdr:pic>/.exec(drawing)!
    expect(Number(ext[1]) / Number(ext[2])).toBeCloseTo(4 / 3, 2)
  })

  it('erneuter Export ersetzt die alte Skizze statt zu stapeln', async () => {
    const erst = await exportWep(wep, vorlage, { skizzePng: testPng(400, 300) })
    const zweit = await exportWep(wep, await erst.blob.arrayBuffer(), {
      skizzePng: testPng(300, 400),
    })
    const drawing = await (await alsZip(zweit.blob)).file('xl/drawings/drawing9.xml')!.async('string')
    expect(drawing.split(`name="${SKIZZE_BILDNAME}"`)).toHaveLength(2)
    expect(drawing).toContain('name="Textfeld 1"')
  })

  it('Bau-Blätter bleiben byte-gleich (Deckblätter ausgenommen, siehe export.test.ts)', async () => {
    const r = await exportWep(wep, vorlage, { skizzePng: testPng(200, 100) })
    const zip = await alsZip(r.blob)
    const orig = await JSZip.loadAsync(vorlage)
    const deckblaetter = await deckblattPfade(orig)
    for (const p of BAU_SHEET_PATHS.filter((x) => !deckblaetter.includes(x))) {
      expect(await zip.file(p)!.async('string'), p).toBe(await orig.file(p)!.async('string'))
    }
  })

  it('LibreOffice öffnet die Datei und das Bild landet im PDF', async () => {
    try {
      execSync('libreoffice --version', { stdio: 'pipe' })
      execSync('pdfimages -v', { stdio: 'pipe' })
    } catch {
      console.log('LibreOffice/pdfimages nicht gefunden – Test wird übersprungen')
      return
    }
    const r = await exportWep(wep, vorlage, { skizzePng: testPng(640, 480) })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wep-skizze-'))
    try {
      const xlsx = path.join(dir, 'skizze.xlsx')
      fs.writeFileSync(xlsx, Buffer.from(await r.blob.arrayBuffer()))
      execSync(`libreoffice --headless --convert-to pdf --outdir "${dir}" "${xlsx}"`, {
        stdio: 'pipe',
        timeout: 90000,
      })
      const liste = execSync(`pdfimages -list "${path.join(dir, 'skizze.pdf')}"`).toString()
      expect(liste).toMatch(/\s640\s+480\s/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 120000)
})

// --- Blatt mit vorhandenen Formen (kopierte Bau-Skizze, erfunden) -------------

function form(id: number, name: string, inhalt: string, txBox = false): string {
  return (
    '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
    '<xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvSpPr${txBox ? ' txBox="1"' : ''}/></xdr:nvSpPr>` +
    '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p>${inhalt}</a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`
  )
}

const DRAWING_KOPF =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'

/** Drawing wie in einer Bau-Excel: leere Vorlagen-Textfelder + Grundstück, Laube, Beschriftung. */
const DRAWING_MIT_FORMEN =
  DRAWING_KOPF +
  form(2, 'Textfeld 1', '<a:endParaRPr lang="de-DE"/>', true) +
  form(3, 'Textfeld 2', '<a:r><a:t> </a:t></a:r>', true) +
  form(4, 'Rechteck 3', '') +
  form(5, 'Rechteck 8', '') +
  form(6, 'Textfeld 15', '<a:r><a:rPr lang="de-DE"/><a:t>L</a:t></a:r>', true) +
  '</xdr:wsDr>'

async function vorlageMitDrawing(drawingXml: string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(vorlage)
  zip.file('xl/drawings/drawing9.xml', drawingXml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('Skizzen-Blatt mit vorhandenen Formen', () => {
  const wep = neuerWep('test-skizze-formen')
  wep.formalien.unterpaechter = 'Erika Musterfrau'

  it('zählt nur Formen, die keine leeren Vorlagen-Textfelder oder App-Bilder sind', async () => {
    const orig = await JSZip.loadAsync(vorlage)
    expect(zaehleFremdeFormen(await orig.file('xl/drawings/drawing9.xml')!.async('string'))).toBe(0)
    expect(zaehleFremdeFormen(DRAWING_MIT_FORMEN)).toBe(3)
  })

  it('erkennt Formen im Blatt (Vorlage: nein, Bau-Skizze: ja)', async () => {
    expect(await skizzeBlattHatFormen(vorlage)).toBe(false)
    expect(await skizzeBlattHatFormen(await vorlageMitDrawing(DRAWING_MIT_FORMEN))).toBe(true)
  })

  it('ein früheres App-Bild allein zählt nicht als Form', async () => {
    const erst = await exportWep(wep, vorlage, { skizzePng: testPng(100, 100) })
    expect(await skizzeBlattHatFormen(await erst.blob.arrayBuffer())).toBe(false)
  })

  it('fordert ein transparentes PNG an und lässt die Formen stehen', async () => {
    const aufrufe: boolean[] = []
    const r = await exportWep(wep, await vorlageMitDrawing(DRAWING_MIT_FORMEN), {
      skizzePng: async ({ transparent }) => {
        aufrufe.push(transparent)
        return testPng(400, 300)
      },
    })
    expect(aufrufe).toEqual([true])
    expect(r.skizzeEingefuegt).toBe(true)
    expect(r.skizzeTransparent).toBe(true)
    const drawing = await (await alsZip(r.blob)).file('xl/drawings/drawing9.xml')!.async('string')
    for (const name of ['Textfeld 1', 'Textfeld 2', 'Rechteck 3', 'Rechteck 8', 'Textfeld 15']) {
      expect(drawing).toContain(`name="${name}"`)
    }
    // Bild liegt als letzter Anker oben – sichtbar ist es nur, weil es transparent ist
    expect(drawing.lastIndexOf(`name="${SKIZZE_BILDNAME}"`)).toBeGreaterThan(drawing.lastIndexOf('name="Textfeld 15"'))
    // neue Shape-ID kollidiert nicht
    expect(drawing).toMatch(new RegExp(`id="7" name="${SKIZZE_BILDNAME}"`))
  })

  it('leere Vorlage: PNG mit Hintergrund (transparent=false)', async () => {
    const aufrufe: boolean[] = []
    const r = await exportWep(wep, vorlage, {
      skizzePng: async ({ transparent }) => {
        aufrufe.push(transparent)
        return testPng(400, 300)
      },
    })
    expect(aufrufe).toEqual([false])
    expect(r.skizzeTransparent).toBe(false)
  })
})
