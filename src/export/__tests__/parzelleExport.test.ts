/**
 * Parzelle in beiden Skizzen-Blättern (Beta 6, Paket 1): gleiche Position und Größe, gleicher Maßstab.
 * Testdaten ausschließlich erfunden.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep, grundrissZuFormen, type ExportOptionen } from '../index'
import { neuerWep, neueBauDaten, type Wep } from '../../model'
import { skizzeDatenZuFormen, type Kasten } from '../skizzeFormen'
import { rechteckPunkte, type GrundrissDaten } from '../../skizze/grundriss'
import { lageVon, meterZuPx, skizzeMitParzelle, setzeParzelle, type Parzelle } from '../../parzelle'
import type { SkizzeSymbol } from '../../skizze/types'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const DRAWING_BAU = 'xl/drawings/drawing8.xml' // Blatt „Skizze Bau“
const DRAWING_AA = 'xl/drawings/drawing9.xml' // Blatt „Skizze Außenanlage-Aufwuchs“

let vorlage: ArrayBuffer
beforeAll(() => {
  const buf = fs.readFileSync(VORLAGE)
  vorlage = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

const jetzt = '2026-10-23T10:00:00Z'
const rechteck: Parzelle = { form: 'rechteck', laenge: 26, breite: 18, angelegtVon: 'bau', angelegtAm: jetzt }
// Trapez: oben 10 m, unten 16 m, Höhe 24 m (Seiten und Diagonale eingetippt)
const trapez: Parzelle = {
  form: 'frei',
  ecken: [{ x: 30, y: 0 }, { x: 130, y: 0 }, { x: 160, y: 240 }, { x: 0, y: 240 }],
  seiten: [10, Math.hypot(3, 24), 16, Math.hypot(3, 24)],
  diagonalen: [{ von: 0, nach: 2, laenge: Math.hypot(13, 24) }],
  massketten: true,
  angelegtVon: 'gruen',
  angelegtAm: jetzt,
}

const grundriss: GrundrissDaten = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'b-laube', punkte: rechteckPunkte(5, 10, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'b-anbau', punkte: rechteckPunkte(11, 11, 2, 3), hoehe: 2.3, dachform: 'flach' },
  ],
}
const bauteile = [
  { id: 'b-laube', kuerzel: 'L' },
  { id: 'b-anbau', kuerzel: 'A1' },
]

function wepMit(p: Parzelle): Wep {
  const w = neuerWep('2026-888')
  w.formalien.unterpaechter = 'Erika Musterfrau'
  w.formalien.parzellenflaecheM2 = 300
  w.bau = neueBauDaten()
  w.grundriss = grundriss
  let wep = setzeParzelle(w, p, jetzt)
  // Grün-Skizze mit einem Baum von 3 × 4 m an der Stelle (4 m | 6 m)
  const lage = lageVon(wep)!
  const start = skizzeMitParzelle(wep, jetzt)!
  const pos = meterZuPx(lage.abb, { x: 4, y: 6 })
  const baum: SkizzeSymbol = { id: 'baum1', typ: 'symbol', art: 'baum', x: pos.x, y: pos.y, breite: 3 * lage.abb.pxProM, hoehe: 4 * lage.abb.pxProM, beschriftung: 'Apfel' }
  wep = { ...wep, skizze: { ...start, elemente: [...start.elemente, baum] } }
  return wep
}

function optionenFuer(w: Wep): ExportOptionen {
  const lage = lageVon(w)
  const skizze = skizzeMitParzelle(w)!
  return {
    teil: 'beides',
    grundrissFormen: {
      elemente: ({ zeichenbereich, hatFormen }: { zeichenbereich: Kasten; hatFormen: boolean }) =>
        grundrissZuFormen(w.grundriss!, zeichenbereich, bauteile, { parzelle: lage, hatFormen }),
    },
    skizzeFormen: { elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(skizze, zeichenbereich, { grundlage: !hatFormen }) },
  }
}

interface Anker {
  name: string
  von: string
  bis: string
  xml: string
}
/** Alle Anker mit Name, Start/Ende (Zelle + Versatz) und Rohtext. */
function anker(xml: string): Anker[] {
  return [...xml.matchAll(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)].map((m) => ({
    name: /<xdr:cNvPr\b[^>]*\sname="([^"]*)"/.exec(m[0])?.[1] ?? '',
    von: /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(m[0])?.[1].replace(/\s+/g, '') ?? '',
    bis: /<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(m[0])?.[1].replace(/\s+/g, '') ?? '',
    xml: m[0],
  }))
}
const eigene = (xml: string) => anker(xml).filter((a) => /descr="wep-app"/.test(a.xml))
const finde = (xml: string, name: string) => eigene(xml).find((a) => a.name === name)

async function exportiere(w: Wep) {
  const r = await exportWep(w, vorlage, optionenFuer(w))
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
  return { r, bau: await zip.file(DRAWING_BAU)!.async('string'), aa: await zip.file(DRAWING_AA)!.async('string') }
}

describe.each([
  ['Rechteck 18 × 26 m', rechteck],
  ['Trapez (freie Form)', trapez],
])('Parzelle in beiden Skizzen-Blättern: %s', (_name, parzelle) => {
  it('Grundstück liegt in „Skizze Bau“ und „Skizze Außenanlage-Aufwuchs“ an derselben Stelle in derselben Größe', async () => {
    const { bau, aa } = await exportiere(wepMit(parzelle))
    const gb = finde(bau, 'Grundstück')
    const gg = finde(aa, 'Grundstück')
    expect(gb, 'Grundstück im Blatt Bau').toBeDefined()
    expect(gg, 'Grundstück im Blatt Grün').toBeDefined()
    expect(gb!.von).toBe(gg!.von)
    expect(gb!.bis).toBe(gg!.bis)
    // gleiche Form (Freiform-Pfad bzw. Rechteck)
    const form = (a: Anker) => /<a:custGeom>[\s\S]*?<\/a:custGeom>|<a:prstGeom prst="[^"]*"/.exec(a.xml)?.[0]
    expect(form(gb!)).toBe(form(gg!))
    // Bau hell, Grün Wiese
    expect(gb!.xml).toContain('E2F0D9')
    expect(gg!.xml).toContain('C5E0B4')
  })

  it('die Zaunpfosten liegen auf beiden Blättern an denselben Stellen', async () => {
    const { bau, aa } = await exportiere(wepMit(parzelle))
    const pb = eigene(bau).filter((a) => /^Pfosten/.test(a.name))
    const pg = eigene(aa).filter((a) => /^Pfosten/.test(a.name))
    expect(pb.length).toBeGreaterThanOrEqual(4)
    expect(pb.map((a) => a.name + a.von + a.bis)).toEqual(pg.map((a) => a.name + a.von + a.bis))
  })

  it('Maßstab ist gleich: Laube (6 × 4 m) und Baum (3 × 4 m) stehen im selben Verhältnis zur Parzelle', async () => {
    const w = wepMit(parzelle)
    const lage = lageVon(w)!
    const { bau, aa } = await exportiere(w)
    // Breite in Spalten/Zeilen-EMU lässt sich aus den Ankern nicht direkt lesen; die Absolutmaße stehen im xfrm der Form
    const ext = (a: Anker) => {
      const m = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(a.xml)!
      return { cx: Number(m[1]), cy: Number(m[2]) }
    }
    const gs = ext(finde(bau, 'Grundstück')!)
    const emuProM = gs.cx / lage.breiteM
    const laube = ext(finde(bau, 'L')!)
    expect(laube.cx / emuProM).toBeCloseTo(6, 0)
    expect(laube.cy / emuProM).toBeCloseTo(4, 0)
    // Der Baum besteht ohne SVG aus Stamm und Krone: ihr gemeinsamer Kasten füllt höchstens den Platz von 3 × 4 m, beginnt bei (4 m | 6 m)
    const teile = eigene(aa).filter((a) => /^Apfel_0_(Stamm|Krone)/.test(a.name))
    expect(teile.length).toBeGreaterThan(1)
    const kasten = teile.map((a) => {
      const o = /<a:off x="(\d+)" y="(\d+)"/.exec(a.xml)!
      const e = ext(a)
      return { x: Number(o[1]), y: Number(o[2]), x2: Number(o[1]) + e.cx, y2: Number(o[2]) + e.cy }
    })
    const baum = {
      x: Math.min(...kasten.map((k) => k.x)),
      y: Math.min(...kasten.map((k) => k.y)),
      cx: Math.max(...kasten.map((k) => k.x2)) - Math.min(...kasten.map((k) => k.x)),
      cy: Math.max(...kasten.map((k) => k.y2)) - Math.min(...kasten.map((k) => k.y)),
    }
    expect(baum.cx / emuProM).toBeLessThanOrEqual(3.05)
    expect(baum.cx / emuProM).toBeGreaterThan(1.5)
    expect(baum.cy / emuProM).toBeLessThanOrEqual(4.05)
    expect(baum.cy / emuProM).toBeGreaterThan(2.5)
    const posX = (a: Anker) => Number(/<a:off x="(\d+)" y="(\d+)"/.exec(a.xml)![1])
    const posY = (a: Anker) => Number(/<a:off x="(\d+)" y="(\d+)"/.exec(a.xml)![2])
    const g = finde(bau, 'Grundstück')!
    expect((posX(finde(bau, 'L')!) - posX(g)) / emuProM).toBeCloseTo(5, 0)
    expect((posY(finde(bau, 'L')!) - posY(g)) / emuProM).toBeCloseTo(10, 0)
    const gg = finde(aa, 'Grundstück')!
    expect((baum.x - posX(gg)) / emuProM).toBeGreaterThanOrEqual(3.9)
    expect((baum.x - posX(gg)) / emuProM).toBeLessThan(5.5)
    expect((baum.y - posY(gg)) / emuProM).toBeGreaterThanOrEqual(5.9)
    expect((baum.y - posY(gg)) / emuProM).toBeLessThan(7.5)
  })

  it('der Grundriss mit Maßketten und Massenberechnung bleibt im Blatt „Skizze Bau“, nichts verdoppelt sich beim erneuten Export', async () => {
    const w = wepMit(parzelle)
    const { bau, r } = await exportiere(w)
    expect(r.grundriss?.anzahlFormen).toBeGreaterThan(5)
    const namen = eigene(bau).map((a) => a.name)
    expect(namen).toContain('L')
    expect(namen).toContain('A1')
    expect(namen).toContain('Massenberechnung')
    expect(namen.filter((n) => n === 'Grundstück')).toHaveLength(1)
    // Zweiter Export auf dem ersten Ergebnis ersetzt nur die eigenen Formen
    const zwei = await exportWep(w, await r.blob.arrayBuffer(), optionenFuer(w))
    const zip = await JSZip.loadAsync(await zwei.blob.arrayBuffer())
    const bau2 = await zip.file(DRAWING_BAU)!.async('string')
    expect(eigene(bau2).map((a) => a.name)).toEqual(namen)
  })
})

describe('Seitenmaße auf Wunsch', () => {
  it('stehen in beiden Blättern als rote Maßlinien an der Parzelle', async () => {
    const { bau, aa } = await exportiere(wepMit(trapez))
    const m = (xml: string) => eigene(xml).filter((a) => /^Maß_[0-9]+$|^Maß$/.test(a.name) || /^Maß/.test(a.name))
    // Texte der Seiten: 10 m, 24,19 m, 16 m
    for (const xml of [bau, aa]) {
      expect(xml).toContain('>10 m<')
      expect(xml).toContain('>16 m<')
      expect(xml).toContain('>24,19 m<')
    }
    expect(m(bau).length).toBeGreaterThan(0)
  })
})
