/**
 * Beta 6, Paket 1: Grundlage der Grün-Skizze auf der Parzelle (Grundriss in echten Metern, Bau-Excel) und
 * Übernahme der Parzelle aus der Bau-Excel. Testdaten ausschließlich erfunden.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { erzeugeTestBauExcel } from '../../bauexcel/testBauExcel'
import { leseBauSkizze } from '../../export/bauSkizzeLesen'
import { rechteckPunkte, type GrundrissDaten } from '../../skizze/grundriss'
import { uebernehmeGrundlage } from '../../skizze/grundlage'
import type { SkizzeBauform, SkizzeSymbol } from '../../skizze/types'
import { LEINWAND, meterZuPx, parzelleAusBauExcel, parzellenLage, pxZuMeter, type Parzelle } from '..'
import { loese } from '../geometrie'

const jetzt = '2026-10-23T10:00:00.000Z'
const rechteck: Parzelle = { form: 'rechteck', laenge: 26, breite: 18, angelegtVon: 'bau', angelegtAm: jetzt }
const grundriss: GrundrissDaten = {
  teile: [
    { id: 'g1', kuerzel: 'L', punkte: rechteckPunkte(5, 10, 6, 4) },
    { id: 'g2', kuerzel: 'K', gestrichelt: true, punkte: rechteckPunkte(5, 15, 3, 2) },
  ],
}
const bauformen = (d: { elemente: unknown[] }) => (d.elemente as { typ: string }[]).filter((e): e is SkizzeBauform => e.typ === 'bauform')

let bauExcel: Uint8Array
beforeAll(async () => {
  bauExcel = await erzeugeTestBauExcel({ skizzeBau: true })
})

describe('Grundlage aus Parzelle und Grundriss', () => {
  it('Grundstück, Pfosten und Bauteile liegen in echten Metern auf der Leinwand (600 × 825)', () => {
    const lage = parzellenLage(rechteck)!
    const erg = uebernehmeGrundlage({ elemente: [] }, { art: 'parzelle', lage, grundriss, bauteile: [] }, jetzt)!
    expect(erg.daten.breite).toBe(LEINWAND.breite)
    expect(erg.daten.hoehe).toBe(LEINWAND.hoehe)
    expect(erg.daten.massstab).toEqual(lage.abb)
    expect(erg.daten.grundlage).toMatchObject({ quelle: 'bau', gesperrt: true })
    const formen = bauformen(erg.daten)
    const gs = formen.filter((f) => f.art === 'grundstueck')
    expect(gs).toHaveLength(1)
    const laube = formen.find((f) => f.beschriftung === 'L')!
    // Laube 6 × 4 m, 5 m rechts und 10 m unter der linken oberen Ecke der Parzelle
    const m = laube.punkte.map((p) => pxZuMeter(lage.abb, p))
    expect(m[1].x - m[0].x).toBeCloseTo(6, 1)
    expect(m[2].y - m[1].y).toBeCloseTo(4, 1)
    expect(m[0].x).toBeCloseTo(5, 1)
    expect(m[0].y).toBeCloseTo(10, 1)
    // Keller gestrichelt
    expect(formen.find((f) => f.beschriftung === 'K')?.gestrichelt).toBe(true)
    // Das Grundstück ist die Parzelle: 18 m breit
    const xs = gs[0].punkte.map((p) => p.x)
    expect((Math.max(...xs) - Math.min(...xs)) / lage.abb.pxProM).toBeCloseTo(18, 1)
    expect(formen.filter((f) => f.art === 'pfosten').length).toBeGreaterThanOrEqual(4)
  })

  it('Grün-Elemente bleiben beim Übernehmen erhalten und behalten ihre Lage in Metern', () => {
    const lage = parzellenLage(rechteck)!
    const p = meterZuPx(lage.abb, { x: 4, y: 6 })
    const baum: SkizzeSymbol = { id: 'b', typ: 'symbol', art: 'baum', x: p.x, y: p.y, breite: 3 * lage.abb.pxProM, hoehe: 4 * lage.abb.pxProM }
    const erst = uebernehmeGrundlage({ elemente: [] }, { art: 'parzelle', lage, bauteile: [] }, jetzt)!
    expect(erst.daten.grundlage?.quelle).toBe('parzelle')
    const mitBaum = { ...erst.daten, elemente: [...erst.daten.elemente, baum] }
    const neu = uebernehmeGrundlage(mitBaum, { art: 'parzelle', lage, grundriss, bauteile: [] }, jetzt)!
    const b = neu.daten.elemente.find((e) => e.id === 'b') as SkizzeSymbol
    expect(b).toEqual(baum)
    expect(neu.daten.grundlage?.quelle).toBe('bau')
  })

  it('liegt der Grundriss außerhalb der Parzelle, steht ein Hinweis (nichts wird gesperrt)', () => {
    const lage = parzellenLage(rechteck)!
    const raus: GrundrissDaten = { teile: [{ id: 'g', kuerzel: 'S', punkte: rechteckPunkte(16, 24, 5, 4) }] }
    const erg = uebernehmeGrundlage({ elemente: [] }, { art: 'parzelle', lage, grundriss: raus, bauteile: [] }, jetzt)!
    expect(erg.hinweise.join(' ')).toMatch(/S liegt im Grundriss außerhalb der Parzelle/)
    expect(bauformen(erg.daten).some((f) => f.beschriftung === 'S')).toBe(true)
  })

  it('Seitenmaße als Maßlinien der Grundlage, wenn gewünscht', () => {
    const lage = parzellenLage({ ...rechteck, massketten: true })!
    const erg = uebernehmeGrundlage({ elemente: [] }, { art: 'parzelle', lage, bauteile: [] }, jetzt)!
    const mass = erg.daten.elemente.filter((e) => e.typ === 'massangabe')
    expect(mass.map((e) => (e as { beschriftung: string }).beschriftung)).toEqual(['18 m', '26 m', '18 m', '26 m'])
    expect(mass.every((e) => e.ebene === 'grundlage')).toBe(true)
    expect(uebernehmeGrundlage({ elemente: [] }, { art: 'parzelle', lage: parzellenLage(rechteck)!, bauteile: [] }, jetzt)!.daten.elemente.some((e) => e.typ === 'massangabe')).toBe(false)
  })

  it('Grundlage aus der Bau-Excel wird auf die Parzelle gelegt: Gebäude behalten ihre Lage zum Grundstück, Grundstück und Pfosten sind die der Parzelle', async () => {
    const lesen = await leseBauSkizze(bauExcel)
    const lage = parzellenLage({ form: 'rechteck', laenge: 41, breite: 29.7, angelegtVon: 'excel', angelegtAm: jetzt })! // Seitenverhältnis wie das Grundstück der Bau-Excel (445 × 615 pt)
    const erg = uebernehmeGrundlage({ elemente: [] }, { art: 'excel', lesen, excelName: 'Bau.xlsx', lage }, jetzt)!
    const formen = bauformen(erg.daten)
    expect(formen.filter((f) => f.art === 'grundstueck')).toHaveLength(1)
    // Laube der Bau-Excel: 160 × 120 pt, links 128 pt und oben 69 pt vom Grundstück (22 | 101)
    const laube = formen.find((f) => f.beschriftung === 'L')!
    const gs = formen.find((f) => f.art === 'grundstueck')!
    const gx = Math.min(...gs.punkte.map((p) => p.x))
    const gy = Math.min(...gs.punkte.map((p) => p.y))
    const gb = Math.max(...gs.punkte.map((p) => p.x)) - gx
    const faktor = gb / 445 // px je pt
    expect(Math.min(...laube.punkte.map((p) => p.x)) - gx).toBeCloseTo((150 - 22) * faktor, 0)
    expect(Math.min(...laube.punkte.map((p) => p.y)) - gy).toBeCloseTo((170 - 101) * faktor, 0)
    expect(Math.max(...laube.punkte.map((p) => p.x)) - Math.min(...laube.punkte.map((p) => p.x))).toBeCloseTo(160 * faktor, 0)
    expect(erg.daten.massstab).toEqual(lage.abb)
    expect(erg.daten.grundlage).toMatchObject({ quelle: 'excel', excelName: 'Bau.xlsx' })
    // die Grundstück-Linie in Pixeln = Parzelle in Metern
    expect(pxZuMeter(lage.abb, { x: gx, y: gy }).x).toBeCloseTo(0, 0)
  })
})

describe('Parzelle aus der Bau-Excel (Form „Grundstück“)', () => {
  it('Rechteck der Bau-Excel → rechteckige Parzelle ohne Maße (die App sagt, was fehlt), Seitenverhältnis bleibt in den Ecken', async () => {
    const r = await parzelleAusBauExcel(bauExcel, jetzt)
    expect(r.parzelle).toBeDefined()
    const p = r.parzelle!
    expect(p.form).toBe('rechteck')
    expect(p.angelegtVon).toBe('excel')
    expect(p.laenge).toBeUndefined()
    expect(p.breite).toBeUndefined()
    expect(p.ecken).toHaveLength(4)
    const w = Math.max(...p.ecken!.map((e) => e.x))
    const h = Math.max(...p.ecken!.map((e) => e.y))
    expect(h / w).toBeCloseTo(615 / 445, 2)
    expect(r.hinweis).toMatch(/Die Maße in Metern fehlen noch/)
    // noch nicht berechenbar
    expect(loese(p).fehlt.map((f) => f.art)).toEqual(['laenge', 'breite'])
    expect(parzellenLage(p)).toBeUndefined()
  })

  it('Bau-Excel ohne Blatt „Skizze Bau“ oder ohne Grundstück: keine Parzelle, aber ein Hinweis', async () => {
    const ohneFormen = await erzeugeTestBauExcel({})
    const r = await parzelleAusBauExcel(ohneFormen, jetzt)
    expect(r.parzelle).toBeUndefined()
    expect(r.hinweis).toMatch(/kein Grundstück/)
  })
})
