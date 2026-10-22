/**
 * Export des Grundrisses als bearbeitbare Formen ins Blatt „Skizze Bau“ (Beta 4, Paket 3).
 * Testdaten ausschließlich erfunden.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep, grundrissZuFormen, type ExportOptionen } from '../index'
import { neuerWep, neueBauDaten, type Wep } from '../../model'
import { leseBlattGeometrie, zeichenbereichVon, type Kasten } from '../skizzeFormen'
import { rechteckPunkte, type GrundrissDaten } from '../../skizze/grundriss'
import type { SkizzeDaten } from '../../skizze/types'
import { skizzeDatenZuFormen } from '../skizzeFormen'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const DRAWING_BAU = 'xl/drawings/drawing8.xml' // Blatt „Skizze Bau“
const DRAWING_AA = 'xl/drawings/drawing9.xml' // Blatt „Skizze Außenanlage-Aufwuchs“

let vorlage: ArrayBuffer
beforeAll(() => {
  const buf = fs.readFileSync(VORLAGE)
  vorlage = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

const grundriss: GrundrissDaten = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'b-laube', punkte: rechteckPunkte(2, 2, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'b-anbau', punkte: rechteckPunkte(8, 3, 2, 3), hoehe: 2.3, dachform: 'flach' },
    { id: 'g3', kuerzel: 'S', punkte: rechteckPunkte(12, 8, 2.5, 2), hoehe: 2, dachform: 'pult', hoeheOben: 2.4 },
    {
      id: 'g4', kuerzel: 'K', gestrichelt: true, hoehe: 2,
      punkte: [{ x: 2, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 8.5 }, { x: 4, y: 8.5 }, { x: 4, y: 10 }, { x: 2, y: 10 }],
    },
  ],
}

const bauteile = [
  { id: 'b-laube', kuerzel: 'L' },
  { id: 'b-anbau', kuerzel: 'A1' },
]

function bauWep(): Wep {
  const w = neuerWep('2026-777')
  w.formalien.unterpaechter = 'Erika Musterfrau'
  w.bau = neueBauDaten()
  w.grundriss = grundriss
  return w
}

const optionen = (g: GrundrissDaten): ExportOptionen => ({
  teil: 'bau',
  grundrissFormen: { elemente: ({ zeichenbereich }) => grundrissZuFormen(g, zeichenbereich, bauteile) },
})

const namen = (xml: string) => [...xml.matchAll(/<xdr:cNvPr\b[^>]*\sname="([^"]*)"[^>]*descr="wep-app"/g)].map((m) => m[1])

async function exportiere(w: Wep, o: ExportOptionen) {
  const r = await exportWep(w, vorlage, o)
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
  return { r, zip }
}

describe('grundrissZuFormen', () => {
  const bereich: Kasten = { x: 100_000, y: 100_000, w: 5_000_000, h: 7_000_000 }
  const formen = grundrissZuFormen(grundriss, bereich, bauteile)

  it('macht aus jedem Teil eine Bauteil-Form mit Kürzel und Fläche', () => {
    const teile = formen.filter((f) => f.typ === 'bauteil')
    expect(teile.map((f) => f.name)).toEqual(['L', 'A1', 'S', 'K'])
    expect(teile[0].text).toBe('L\n24,00 m²')
    expect(teile[3].gestrichelt).toBe(true)
    expect(teile[3].punkte).toHaveLength(6)
  })

  it('passt alles in den Zeichenbereich ein und hält den Maßstab einheitlich', () => {
    for (const f of formen) {
      const pts = f.punkte ?? [f.von, f.nach].filter(Boolean) as { x: number; y: number }[]
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(bereich.x - 1)
        expect(p.x).toBeLessThanOrEqual(bereich.x + bereich.w + 1)
        expect(p.y).toBeGreaterThanOrEqual(bereich.y - 1)
        expect(p.y).toBeLessThanOrEqual(bereich.y + bereich.h + 1)
      }
    }
    const l = formen.find((f) => f.name === 'L')!.punkte!
    const a1 = formen.find((f) => f.name === 'A1')!.punkte!
    const mL = (l[1].x - l[0].x) / 6 // EMU je m (Länge 6 m)
    const mA = (a1[2].y - a1[1].y) / 3 // Höhe 3 m
    expect(Math.abs(mL - mA)).toBeLessThan(2)
    // Laube hoch 4 m, breit 6 m
    expect((l[2].y - l[1].y) / mL).toBeCloseTo(4, 1)
  })

  it('schreibt Maßketten (Teilstrecken und Gesamtmaß) und die Massenberechnung', () => {
    const mass = formen.filter((f) => f.typ === 'massangabe')
    expect(mass.some((m) => m.name.startsWith('Maß_kette_x'))).toBe(true)
    expect(mass.some((m) => m.name.startsWith('Maß_gesamt_x') && m.text === '12,5 m')).toBe(true)
    expect(mass.some((m) => m.text === '2 m')).toBe(true) // 2 → 4 → 6 → 8 …: Kette über alle Ecken
    const tabelle = formen.find((f) => f.typ === 'massenberechnung')!
    expect(tabelle.text).toContain('L · 6 × 4 m = 24,00 m² · Satteldach Traufe 2,2 / First 3,1 m · 63,60 m³')
    expect(tabelle.text).toContain('Summe:')
  })

  it('ein einzelnes Rechteck bekommt Länge und Breite als Maß', () => {
    const f = grundrissZuFormen({ teile: [grundriss.teile[0]] }, bereich, bauteile)
    expect(f.filter((x) => x.typ === 'massangabe').map((x) => x.text).sort()).toEqual(['4 m', '6 m'])
  })

  it('ohne Maßketten gibt es keine Maßlinien', () => {
    const f = grundrissZuFormen({ ...grundriss, massketten: false }, bereich, bauteile)
    expect(f.some((x) => x.typ === 'massangabe')).toBe(false)
  })

  it('leerer Grundriss → keine Formen', () => {
    expect(grundrissZuFormen({ teile: [] }, bereich)).toEqual([])
  })
})

describe('Export in „Skizze Bau“', () => {
  it('schreibt bearbeitbare Formen (Rechteck, Freiform, Maße, Tabelle) mit Marker', async () => {
    const { r, zip } = await exportiere(bauWep(), optionen(grundriss))
    const xml = (await zip.file(DRAWING_BAU)!.async('string'))
    const eigene = namen(xml)
    expect(eigene).toEqual(expect.arrayContaining(['L', 'A1', 'S', 'K', 'Massenberechnung']))
    expect(eigene.some((n) => n.startsWith('Maß_kette_x'))).toBe(true)
    expect(r.grundriss?.anzahlFormen).toBe(eigene.length)
    expect(r.grundriss?.graswiese).toBe(false)
    // L-Form des Kellers = Freiform (custGeom), die Laube ein normales Rechteck
    expect(xml).toContain('<a:custGeom>')
    expect(xml).toMatch(/name="L"[\s\S]*?<a:prstGeom prst="rect">/)
    expect(xml).toContain('<a:prstDash val="dash"/>')
    // Text der Form: Kürzel + Fläche
    expect(xml).toContain('<a:t>24,00 m²</a:t>')
    // die Vorlagen-Textbox bleibt
    expect(xml).toContain('name="Textfeld 8"')
  })

  it('lässt Grün-Skizze-Blatt, Grün-Blätter und alle übrigen Blätter unberührt', async () => {
    const { zip } = await exportiere(bauWep(), optionen(grundriss))
    const orig = await JSZip.loadAsync(vorlage)
    expect(await zip.file(DRAWING_AA)!.async('string')).toBe(await orig.file(DRAWING_AA)!.async('string'))
    for (const sheet of ['sheet5', 'sheet6', 'sheet7', 'sheet19', 'sheet20']) {
      expect(await zip.file(`xl/worksheets/${sheet}.xml`)!.async('string'), sheet).toBe(await orig.file(`xl/worksheets/${sheet}.xml`)!.async('string'))
    }
  })

  it('ersetzt bei erneutem Export nur die eigenen Formen', async () => {
    const erst = await exportiere(bauWep(), optionen(grundriss))
    const zweit = await exportWep(bauWep(), await erst.r.blob.arrayBuffer(), optionen({ ...grundriss, teile: grundriss.teile.slice(0, 1) }))
    const zip = await JSZip.loadAsync(await zweit.blob.arrayBuffer())
    const xml = await zip.file(DRAWING_BAU)!.async('string')
    expect(namen(xml).filter((n) => ['A1', 'S', 'K'].includes(n))).toEqual([])
    expect(namen(xml)).toContain('L')
    expect(zweit.grundriss?.entfernt).toBeGreaterThan(5)
    expect(xml).toContain('name="Textfeld 8"')
  })

  it('schreibt nur bei Teil „bau“ oder „beides“ – bei „gruen“ bleibt „Skizze Bau“ byte-gleich', async () => {
    const orig = await JSZip.loadAsync(vorlage)
    for (const teil of ['gruen', undefined] as const) {
      const { r, zip } = await exportiere(bauWep(), { ...optionen(grundriss), teil })
      expect(r.grundriss).toBeUndefined()
      expect(await zip.file(DRAWING_BAU)!.async('string')).toBe(await orig.file(DRAWING_BAU)!.async('string'))
    }
    const beides = await exportiere(bauWep(), { ...optionen(grundriss), teil: 'beides' })
    expect(beides.r.grundriss?.anzahlFormen).toBeGreaterThan(5)
  })

  it('ohne Grundriss bleibt „Skizze Bau“ auch beim Bau-Export byte-gleich', async () => {
    const orig = await JSZip.loadAsync(vorlage)
    const { zip } = await exportiere(bauWep(), { teil: 'bau' })
    expect(await zip.file(DRAWING_BAU)!.async('string')).toBe(await orig.file(DRAWING_BAU)!.async('string'))
  })

  it('meldet fremde Formen im Blatt (von Hand gezeichnete Skizze)', async () => {
    const { r } = await exportiere(bauWep(), optionen(grundriss))
    expect(r.grundriss?.fremdeFormen).toBe(0)
    const zwei = await exportWep(bauWep(), await r.blob.arrayBuffer(), optionen(grundriss))
    expect(zwei.grundriss?.fremdeFormen).toBe(0) // eigene Formen zählen nicht als fremd
  })

  it('nutzt die Geometrie des Blatts (Zeichenbereich B7:G48)', async () => {
    const orig = await JSZip.loadAsync(vorlage)
    const blatt = await orig.file('xl/worksheets/sheet18.xml')!.async('string')
    const z = zeichenbereichVon(leseBlattGeometrie(blatt))
    const formen = grundrissZuFormen(grundriss, z, bauteile)
    expect(formen.length).toBeGreaterThan(8)
    const tabelle = formen.find((f) => f.typ === 'massenberechnung')!.kasten!
    expect(tabelle.y + tabelle.h).toBeLessThanOrEqual(z.y + z.h + 1)
  })
})

describe('Grün-Skizze bleibt unverändert', () => {
  it('Formen der Grün-Skizze sind mit und ohne Grundriss identisch', async () => {
    const skizze: SkizzeDaten = {
      breite: 800, hoehe: 600, elemente: [
        { id: 'a', typ: 'symbol', art: 'baum', x: 100, y: 100, breite: 34, hoehe: 42, beschriftung: 'Apfel' },
        { id: 'b', typ: 'symbol', art: 'beet', x: 300, y: 300, breite: 60, hoehe: 30 },
      ],
    }
    const gruenOptionen: ExportOptionen = {
      teil: 'beides',
      skizzeFormen: { elemente: ({ zeichenbereich }) => skizzeDatenZuFormen(skizze, zeichenbereich) },
    }
    const w1 = bauWep()
    w1.skizze = skizze
    const ohne = await exportiere(w1, gruenOptionen)
    const mit = await exportiere(w1, { ...gruenOptionen, ...optionen(grundriss), teil: 'beides' })
    expect(await mit.zip.file(DRAWING_AA)!.async('string')).toBe(await ohne.zip.file(DRAWING_AA)!.async('string'))
  })
})
