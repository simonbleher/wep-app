/**
 * Beta 5, Paket 1: Grundlage der Grün-Skizze – aus dem Grundriss und aus „Skizze Bau“ einer Bau-Excel,
 * Export ins Blatt „Skizze Außenanlage-Aufwuchs“. Testdaten ausschließlich erfunden.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep, type ExportOptionen } from '../index'
import { neuerWep, type Wep } from '../../model'
import { leseBauSkizze } from '../bauSkizzeLesen'
import { skizzeDatenZuFormen, formNamen } from '../skizzeFormen'
import { erzeugeTestBauExcel, TEST_SKIZZE_BAU } from '../../bauexcel/testBauExcel'
import { rechteckPunkte, type GrundrissDaten } from '../../skizze/grundriss'
import { hatGrundlage, setzeGrundlageGesperrt, uebernehmeGrundlage, waehlbareElemente } from '../../skizze/grundlage'
import { alleTreffer } from '../../skizze/geometrie'
import { istGrundlage, leereSkizze, type SkizzeBauform, type SkizzeDaten, type SkizzeSymbol } from '../../skizze/types'
import { skizzeZuSzene } from '../../skizze/szene'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const DRAWING_BAU = 'xl/drawings/drawing8.xml' // „Skizze Bau“
const DRAWING_AA = 'xl/drawings/drawing9.xml' // „Skizze Außenanlage-Aufwuchs“
const JETZT = '2026-10-23T10:00:00.000Z'

let vorlage: ArrayBuffer
let bauExcel: Uint8Array
beforeAll(async () => {
  const buf = fs.readFileSync(VORLAGE)
  vorlage = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  bauExcel = await erzeugeTestBauExcel({ skizzeBau: true })
})

const grundriss: GrundrissDaten = {
  teile: [
    { id: 'g1', kuerzel: 'L', punkte: rechteckPunkte(2, 2, 6, 4) },
    { id: 'g2', kuerzel: 'A1', punkte: rechteckPunkte(8, 3, 2, 3) },
    { id: 'g3', kuerzel: 'K', gestrichelt: true, punkte: [{ x: 2, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 8.5 }, { x: 4, y: 8.5 }, { x: 4, y: 10 }, { x: 2, y: 10 }] },
  ],
}

const baum: SkizzeSymbol = { id: 'b1', typ: 'symbol', art: 'baum', x: 300, y: 500, breite: 40, hoehe: 50, beschriftung: 'Apfel' }

const bauformen = (d: SkizzeDaten) => d.elemente.filter((e): e is SkizzeBauform => e.typ === 'bauform')

describe('bauSkizzeLesen: Formen aus „Skizze Bau“', () => {
  it('liest Rechtecke, Freiform, Keller (gestrichelt), Textfelder und Linie mit Position und Text', async () => {
    const l = await leseBauSkizze(bauExcel)
    expect(l.blattVorhanden).toBe(true)
    // leere Textfelder (Vorlage, „TextBox 8“) fallen weg
    expect(l.formen).toHaveLength(TEST_SKIZZE_BAU.length - 1)
    const nach = (n: string) => l.formen.find((f) => f.name === n)!
    const laube = nach('Rechteck 20')
    expect(laube.art).toBe('vieleck')
    expect(laube.text).toBe('L')
    expect(laube.gefuellt).toBe(true)
    expect(laube.kasten.x / 12700).toBeCloseTo(150, 0)
    expect(laube.kasten.w / 12700).toBeCloseTo(160, 0)
    expect(laube.kasten.h / 12700).toBeCloseTo(120, 0)
    const keller = nach('K1_HW')
    expect(keller.gestrichelt).toBe(true)
    expect(keller.gefuellt).toBe(false)
    const freiform = nach('Freihandform 23')
    expect(freiform.punkte).toHaveLength(6)
    expect(nach('Textfeld 24').art).toBe('text')
    const linie = nach('Gerader Verbinder 25')
    expect(linie.art).toBe('linie')
    expect(linie.nach!.x - linie.von!.x).toBeCloseTo(160 * 12700, -3)
  })

  it('liest nichts aus einer Datei ohne eigene Formen und meldet fehlende Blätter', async () => {
    const leer = await leseBauSkizze(vorlage)
    expect(leer.blattVorhanden).toBe(true)
    expect(leer.formen).toEqual([])
    const zip = await JSZip.loadAsync(vorlage)
    zip.file('xl/workbook.xml', (await zip.file('xl/workbook.xml')!.async('string')).replace('name="Skizze Bau"', 'name="Anderes Blatt"'))
    const ohne = await leseBauSkizze(await zip.generateAsync({ type: 'uint8array' }))
    expect(ohne.blattVorhanden).toBe(false)
  })

  it('wertet Gruppen, Drehung, Ellipsen, Bilder und angenäherte Formen aus', async () => {
    const zip = await JSZip.loadAsync(bauExcel)
    let xml = await zip.file(DRAWING_BAU)!.async('string')
    const sp = (id: number, name: string, prst: string, extra = '') =>
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm${extra}><a:off x="100000" y="100000"/><a:ext cx="600000" cy="300000"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="E7E6E6"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></xdr:spPr></xdr:sp>`
    const anker = (inhalt: string) =>
      `<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="600000" cy="300000"/>${inhalt}<xdr:clientData/></xdr:oneCellAnchor>`
    const extra =
      anker(sp(90, 'Ellipse 1', 'ellipse')) +
      anker(sp(91, 'Dreieck 1', 'triangle')) +
      anker(sp(92, 'Gedreht', 'rect', ' rot="5400000"')) +
      anker(`<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="93" name="Bild 1"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill/><xdr:spPr/></xdr:pic>`) +
      `<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>24</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="94" name="Gruppe 1"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="1000"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="1000"/></a:xfrm></xdr:grpSpPr>` +
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="95" name="Kind"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="500" y="500"/><a:ext cx="500" cy="500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="E7E6E6"/></a:solidFill></xdr:spPr></xdr:sp></xdr:grpSp><xdr:clientData/></xdr:twoCellAnchor>`
    xml = xml.replace('</xdr:wsDr>', `${extra}</xdr:wsDr>`)
    zip.file(DRAWING_BAU, xml)
    const l = await leseBauSkizze(await zip.generateAsync({ type: 'uint8array' }))
    const nach = (n: string) => l.formen.find((f) => f.name === n)!
    expect(nach('Ellipse 1').punkte).toHaveLength(24)
    expect(nach('Dreieck 1').angenaehert).toBe('triangle')
    // 90° gedreht: aus 600000 × 300000 wird ein hohes Rechteck um dieselbe Mitte
    const g = nach('Gedreht').punkte!
    expect(Math.max(...g.map((p) => p.x)) - Math.min(...g.map((p) => p.x))).toBeCloseTo(300000, -2)
    expect(Math.max(...g.map((p) => p.y)) - Math.min(...g.map((p) => p.y))).toBeCloseTo(600000, -2)
    expect(nach('Bild 1').art).toBe('bild')
    // Gruppenkind: untere rechte Hälfte der Gruppenfläche (2 Spalten × 4 Zeilen)
    const kind = nach('Kind')
    expect(kind.kasten.w).toBeGreaterThan(500_000)
    expect(kind.kasten.h).toBeCloseTo((4 * 15 * 12700) / 2, -3)
  })
})

describe('Grundlage aus dem Grundriss des Bau-Teils', () => {
  it('legt Grundstück, Pfosten und Bauteile an, gesperrt und als eigene Ebene', () => {
    const erg = uebernehmeGrundlage(leereSkizze(), { art: 'bau', grundriss, flaecheM2: 380 }, JETZT)!
    expect(erg).not.toBeNull()
    expect(hatGrundlage(erg.daten)).toBe(true)
    expect(erg.daten.grundlage).toMatchObject({ quelle: 'bau', gesperrt: true, uebernommen: JETZT })
    const f = bauformen(erg.daten)
    expect(f.filter((x) => x.art === 'grundstueck')).toHaveLength(1)
    expect(f.filter((x) => x.art === 'pfosten').length).toBeGreaterThanOrEqual(8)
    const teile = f.filter((x) => x.art === 'bauteil')
    expect(teile.map((x) => x.beschriftung)).toEqual(['L', 'A1', 'K'])
    expect(teile[2].gestrichelt).toBe(true)
    expect(erg.daten.elemente.every(istGrundlage)).toBe(true)
    // Grundstück zuerst (ganz unten), Seitenverhältnis wie der Zeichenbereich im Excel-Blatt
    expect(erg.daten.elemente[0]).toMatchObject({ art: 'grundstueck' })
    expect(erg.daten.hoehe! / erg.daten.breite!).toBeCloseTo(1.3748, 2)
  })

  it('hält alle Formen im Grundstück und zeichnet maßstäblich (L = 6 m × 4 m)', () => {
    const erg = uebernehmeGrundlage(leereSkizze(), { art: 'bau', grundriss }, JETZT)!
    const f = bauformen(erg.daten)
    const gs = f.find((x) => x.art === 'grundstueck')!.punkte
    const [x1, x2] = [Math.min(...gs.map((p) => p.x)), Math.max(...gs.map((p) => p.x))]
    const [y1, y2] = [Math.min(...gs.map((p) => p.y)), Math.max(...gs.map((p) => p.y))]
    for (const t of f.filter((x) => x.art === 'bauteil'))
      for (const p of t.punkte) {
        expect(p.x).toBeGreaterThanOrEqual(x1)
        expect(p.x).toBeLessThanOrEqual(x2)
        expect(p.y).toBeGreaterThanOrEqual(y1)
        expect(p.y).toBeLessThanOrEqual(y2)
      }
    const laube = f.find((x) => x.beschriftung === 'L')!.punkte
    const b = laube[1].x - laube[0].x
    const h = laube[2].y - laube[1].y
    expect(b / h).toBeCloseTo(6 / 4, 1)
  })

  it('gibt ohne Teile nichts zurück (Hinweis statt Sperre)', () => {
    expect(uebernehmeGrundlage(leereSkizze(), { art: 'bau', grundriss: { teile: [] } }, JETZT)).toBeNull()
  })

  it('neu übernehmen ersetzt nur die Grundlage – das Grün bleibt, Größe der Fläche auch', () => {
    const erst = uebernehmeGrundlage(leereSkizze(), { art: 'bau', grundriss }, JETZT)!.daten
    const mitGruen: SkizzeDaten = { ...erst, elemente: [...erst.elemente, baum] }
    const neu = uebernehmeGrundlage(mitGruen, { art: 'bau', grundriss: { teile: grundriss.teile.slice(0, 1) } }, JETZT)!.daten
    expect(neu.elemente.filter((e) => !istGrundlage(e))).toEqual([baum])
    expect(bauformen(neu).filter((x) => x.art === 'bauteil')).toHaveLength(1)
    expect(neu.breite).toBe(mitGruen.breite)
    expect(neu.hoehe).toBe(mitGruen.hoehe)
    // Grundlage liegt unter dem Grün
    expect(istGrundlage(neu.elemente[0])).toBe(true)
    expect(neu.elemente[neu.elemente.length - 1]).toEqual(baum)
  })

  it('bestehende Grün-Skizze behält ihre Fläche (800 × 600), die Grundlage wird eingepasst', () => {
    const gruen: SkizzeDaten = { ...leereSkizze(), elemente: [baum] }
    const erg = uebernehmeGrundlage(gruen, { art: 'bau', grundriss }, JETZT)!.daten
    expect(erg.breite).toBe(800)
    expect(erg.hoehe).toBe(600)
    for (const p of bauformen(erg).flatMap((x) => x.punkte)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(800)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(600)
    }
  })

  it('gesperrte Grundlage ist nicht auswählbar (Tippen trifft das Grün darüber), entsperrt ist jede Form wählbar', () => {
    const gesperrt = uebernehmeGrundlage({ ...leereSkizze(), elemente: [baum] }, { art: 'bau', grundriss }, JETZT)!.daten
    // Der Baum liegt mitten auf dem Grundstück (Grundlage): Tippen trifft ihn, nie das Grundstück
    const imBaum = { x: baum.x + 10, y: baum.y + 10 }
    expect(alleTreffer(waehlbareElemente(gesperrt), imBaum, 8).map((e) => e.id)).toEqual(['b1'])
    expect(alleTreffer(waehlbareElemente(gesperrt), { x: 40, y: 40 }, 8)).toEqual([]) // nur Grundlage dort
    const entsperrt = setzeGrundlageGesperrt(gesperrt, false)
    const treffer = alleTreffer(waehlbareElemente(entsperrt), { x: 40, y: 40 }, 8)
    expect(treffer.length).toBeGreaterThan(0)
    expect(treffer.every(istGrundlage)).toBe(true)
    // Die Grundlage bleibt Ziel zum Einrasten, auch wenn sie gesperrt ist (Elemente werden nicht entfernt)
    expect(gesperrt.elemente.filter(istGrundlage).length).toBeGreaterThan(8)
  })

  it('Sperre lässt sich umschalten; ohne Grundlage ändert sich nichts', () => {
    const gesperrt = uebernehmeGrundlage(leereSkizze(), { art: 'bau', grundriss }, JETZT)!.daten
    const entsperrt = setzeGrundlageGesperrt(gesperrt, false)
    expect(entsperrt.grundlage!.gesperrt).toBe(false)
    expect(entsperrt.elemente).toBe(gesperrt.elemente)
    expect(setzeGrundlageGesperrt(leereSkizze(), false)).toEqual(leereSkizze())
  })

  it('der Skizzen-Chat sieht die Grundlage als feste Bau-Formen', () => {
    const erg = uebernehmeGrundlage({ ...leereSkizze(), elemente: [baum] }, { art: 'bau', grundriss }, JETZT)!.daten
    const szene = skizzeZuSzene(erg)
    const fest = szene.elemente.filter((e) => e.fest)
    expect(fest.length).toBeGreaterThan(8)
    expect(szene.elemente.find((e) => e.id === 'b1')?.fest).toBeUndefined()
  })
})

describe('Grundlage aus „Skizze Bau“ der Bau-Excel', () => {
  it('rechnet Formen um: Grundstück, Pfosten, Bauteile (Keller gestrichelt), Linie, Beschriftung', async () => {
    const lesen = await leseBauSkizze(bauExcel)
    const erg = uebernehmeGrundlage(leereSkizze(), { art: 'excel', lesen, excelName: 'Bau.xlsx' }, JETZT)!
    expect(erg.daten.grundlage).toMatchObject({ quelle: 'excel', gesperrt: true, excelName: 'Bau.xlsx' })
    const f = bauformen(erg.daten)
    expect(f.filter((x) => x.art === 'grundstueck')).toHaveLength(1)
    expect(f.filter((x) => x.art === 'pfosten')).toHaveLength(8)
    const bauteile = f.filter((x) => x.art === 'bauteil')
    expect(bauteile.map((x) => x.beschriftung).sort()).toEqual(['A1', 'K1 HW', 'L', 'LVP', 'S1'])
    expect(bauteile.find((x) => x.beschriftung === 'K1 HW')!.gestrichelt).toBe(true)
    expect(bauteile.find((x) => x.beschriftung === 'A1')!.punkte).toHaveLength(6)
    expect(erg.daten.elemente.filter((e) => e.typ === 'linie')).toHaveLength(1)
    const texte = erg.daten.elemente.filter((e) => e.typ === 'text').map((e) => (e as { inhalt: string }).inhalt)
    expect(texte).toContain('4 m')
    // Seitenverhältnis wie das Excel-Blatt → Positionen 1:1 (Laube 160 × 120 pt = 4:3)
    const laube = bauformen(erg.daten).find((x) => x.beschriftung === 'L')!.punkte
    expect((laube[1].x - laube[0].x) / (laube[2].y - laube[1].y)).toBeCloseTo(160 / 120, 2)
  })

  it('liefert null, wenn das Blatt keine Formen hat – die Skizze bleibt, wie sie ist', async () => {
    const lesen = await leseBauSkizze(vorlage)
    expect(uebernehmeGrundlage(leereSkizze(), { art: 'excel', lesen }, JETZT)).toBeNull()
  })

  it('meldet nicht übernommene Bilder und Näherungen als Hinweis', () => {
    const k = { x: 0, y: 0, w: 1_000_000, h: 1_000_000 }
    const erg = uebernehmeGrundlage(
      leereSkizze(),
      {
        art: 'excel',
        lesen: {
          blattVorhanden: true,
          bereich: { x: 0, y: 0, w: 5_743_575, h: 7_896_225 },
          hinweise: [],
          formen: [
            { art: 'bild', name: 'Bild 7', eigen: false, kasten: k },
            { art: 'bild', name: 'Gras', eigen: false, kasten: k },
            { art: 'vieleck', name: 'Dreieck', eigen: false, kasten: k, punkte: [{ x: 0, y: 0 }, { x: 900_000, y: 0 }, { x: 900_000, y: 900_000 }, { x: 0, y: 900_000 }], angenaehert: 'triangle', text: 'S' },
          ],
        },
      },
      JETZT,
    )!
    expect(erg.hinweise.join(' ')).toMatch(/Ein Bild.*Bild 7/)
    expect(erg.hinweise.join(' ')).not.toMatch(/Gras/)
    expect(erg.hinweise.join(' ')).toMatch(/triangle/)
    expect(erg.daten.grundlage!.hinweise).toEqual(erg.hinweise)
  })

  it('übernimmt keine eigenen Maßketten und keine Massenberechnung des Bau-Exports', () => {
    const k = { x: 100_000, y: 100_000, w: 800_000, h: 200_000 }
    const erg = uebernehmeGrundlage(
      leereSkizze(),
      {
        art: 'excel',
        lesen: {
          blattVorhanden: true,
          bereich: { x: 0, y: 0, w: 5_743_575, h: 7_896_225 },
          hinweise: [],
          formen: [
            { art: 'vieleck', name: 'Massenberechnung', eigen: true, kasten: k, punkte: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], text: 'Summe' },
            { art: 'linie', name: 'Maß_kette_x_0', eigen: true, kasten: k, von: { x: 0, y: 0 }, nach: { x: 100000, y: 0 } },
            { art: 'vieleck', name: 'L', eigen: true, kasten: k, punkte: [{ x: 0, y: 0 }, { x: 800_000, y: 0 }, { x: 800_000, y: 200_000 }, { x: 0, y: 200_000 }], text: 'L\n24,00 m²' },
          ],
        },
      },
      JETZT,
    )!
    expect(erg.anzahl).toBe(1)
    expect(bauformen(erg.daten)[0].beschriftung).toBe('L')
  })
})

describe('Export ins Blatt „Skizze Außenanlage-Aufwuchs“ (Modus Außenanlage)', () => {
  const wep = (skizze: SkizzeDaten): Wep => ({ ...neuerWep('2026-501'), skizze })
  const opt = (skizze: SkizzeDaten): ExportOptionen => ({
    skizzeFormen: { elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(skizze, zeichenbereich, { grundlage: !hatFormen }) },
  })
  const namenIn = (xml: string) => [...xml.matchAll(/<xdr:cNvPr\b[^>]*\sname="([^"]*)"[^>]*descr="wep-app"/g)].map((m) => m[1])

  async function mitGrundlage(quelle: 'bau' | 'excel'): Promise<SkizzeDaten> {
    const start: SkizzeDaten = { ...leereSkizze(), elemente: [] }
    if (quelle === 'bau') return uebernehmeGrundlage(start, { art: 'bau', grundriss, bauteile: [] }, JETZT)!.daten
    return uebernehmeGrundlage(start, { art: 'excel', lesen: await leseBauSkizze(bauExcel) }, JETZT)!.daten
  }

  it('schreibt Wiese, Gebäude, Keller gestrichelt, Pfosten und Grün; Wiese ist grün, Gebäude grau', async () => {
    const d = await mitGrundlage('excel')
    const skizze: SkizzeDaten = { ...d, elemente: [...d.elemente, { ...baum, x: 120, y: 520 }] }
    const r = await exportWep(wep(skizze), bauExcel, opt(skizze))
    expect(r.skizzeFormen?.fremdeFormen).toBe(0)
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const xml = await zip.file(DRAWING_AA)!.async('string')
    const n = namenIn(xml)
    expect(n).toContain('Grundstück')
    expect(n).toEqual(expect.arrayContaining(['L', 'S1', 'LVP', 'A1', 'K1_HW', 'Apfel_0_Stamm']))
    expect(n.filter((x) => x.startsWith('Pfosten'))).toHaveLength(8)
    expect(xml).toMatch(/name="Grundstück"[\s\S]*?<a:srgbClr val="C5E0B4"\/>/)
    expect(xml).toMatch(/name="L"[\s\S]*?<a:srgbClr val="E7E6E6"\/>/)
    expect(xml).toMatch(/name="K1_HW"[\s\S]*?prstDash val="dash"/)
    // Reihenfolge = Ebenen: Wiese vor Pfosten vor Gebäude vor Baum
    const pos = (s: string) => xml.indexOf(`name="${s}"`)
    expect(pos('Grundstück')).toBeLessThan(pos('Pfosten_0'))
    expect(pos('Pfosten_0')).toBeLessThan(pos('L'))
    expect(pos('L')).toBeLessThan(pos('Apfel_0_Stamm'))
    // Fremde Textfelder der Vorlage bleiben
    expect(xml).toContain('name="Textfeld 1"')
  })

  it('„Skizze Bau“ bleibt byte-gleich (Grundlage aus Bau-Teil und aus Bau-Excel)', async () => {
    for (const quelle of ['bau', 'excel'] as const) {
      const skizze = await mitGrundlage(quelle)
      const r = await exportWep(wep(skizze), bauExcel, opt(skizze))
      const vorher = await JSZip.loadAsync(bauExcel)
      const nachher = await JSZip.loadAsync(await r.blob.arrayBuffer())
      for (const datei of [DRAWING_BAU, 'xl/worksheets/sheet18.xml', 'xl/drawings/_rels/drawing8.xml.rels']) {
        const a = vorher.file(datei)
        const b = nachher.file(datei)
        if (!a) continue
        expect(await b!.async('string'), `${datei} (${quelle})`).toBe(await a.async('string'))
      }
      expect(namenIn(await nachher.file(DRAWING_AA)!.async('string')).length).toBeGreaterThan(8)
    }
  })

  it('ein erneuter Export ersetzt nur die eigenen Formen (kein Doppelt)', async () => {
    const skizze = await mitGrundlage('bau')
    const erst = await exportWep(wep(skizze), vorlage, opt(skizze))
    const zweit = await exportWep(wep(skizze), await erst.blob.arrayBuffer(), opt(skizze))
    const zip = await JSZip.loadAsync(await zweit.blob.arrayBuffer())
    const n = namenIn(await zip.file(DRAWING_AA)!.async('string'))
    expect(n.filter((x) => x === 'L')).toHaveLength(1)
    expect(n.filter((x) => x === 'Grundstück')).toHaveLength(1)
    expect(zweit.skizzeFormen?.entfernt).toBeGreaterThan(8)
  })

  it('schreibt die Grundlage nicht doppelt, wenn das Blatt schon eine Bau-Skizze von Hand hat', async () => {
    const skizze = await mitGrundlage('bau')
    const zip = await JSZip.loadAsync(vorlage)
    const alt = await zip.file(DRAWING_AA)!.async('string')
    const fremd =
      '<xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>14</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="40" name="Rechteck 40"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="1" y="1"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>'
    zip.file(DRAWING_AA, alt.replace('</xdr:wsDr>', `${fremd}</xdr:wsDr>`))
    const quelle = await zip.generateAsync({ type: 'uint8array' })
    const mitGruen: SkizzeDaten = { ...skizze, elemente: [...skizze.elemente, { ...baum, x: 120, y: 520 }] }
    const r = await exportWep(wep(mitGruen), quelle, opt(mitGruen))
    expect(r.skizzeFormen?.fremdeFormen).toBe(1)
    const n = namenIn(await (await JSZip.loadAsync(await r.blob.arrayBuffer())).file(DRAWING_AA)!.async('string'))
    expect(n.every((x) => x.startsWith('Apfel_0') || x.startsWith('Text_'))).toBe(true)
    expect(n).not.toContain('L')
    expect(n).not.toContain('Grundstück')
  })

  it('ohne Grundlage bleibt der Export wie bisher (Wiese + Gras + Grün)', async () => {
    const skizze: SkizzeDaten = { ...leereSkizze(), elemente: [baum] }
    const r = await exportWep(wep(skizze), vorlage, opt(skizze))
    const n = namenIn(await (await JSZip.loadAsync(await r.blob.arrayBuffer())).file(DRAWING_AA)!.async('string'))
    expect(n).toEqual(expect.arrayContaining(['Grundstück', 'Apfel_0_Stamm']))
    expect(n.filter((x) => x.startsWith('Pfosten'))).toHaveLength(0)
  })

  it('formNamen: Grundstück, Pfosten und Bauteile bekommen sprechende Namen', async () => {
    const d = await mitGrundlage('bau')
    const bereich = { x: 0, y: 0, w: 5_743_575, h: 7_896_225 }
    const namen = formNamen(skizzeDatenZuFormen(d, bereich), false)
    expect(namen).toEqual(expect.arrayContaining(['Grundstück', 'Pfosten_0', 'L', 'A1', 'K']))
    expect(skizzeDatenZuFormen(d, bereich, { grundlage: false })).toEqual([])
  })
})
