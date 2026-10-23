// @vitest-environment node
// Beta 4, Paket 5: 3D-Modell aus Grundriss, Höhen und Dachform – Dreiecke, Rauminhalt = Kubatur, Farben, Kamera. Erfundene Daten.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { massenVon, rechteckPunkte, type GrundrissDaten, type GrundrissTeil } from '../grundriss'
import { ART_TEXT_3D, FARBEN_3D, FARBE_KANTE, FARBE_RASTER, artVon, baueModell3D, baueTeil3D, rauminhaltAusDach, trianguliere } from '../modell3d'
import { abstandsgrenzen, dreheKamera, kameraPosition, MAX_HOEHENWINKEL, MIN_HOEHENWINKEL, passenderAbstand, startKamera, zoomeKamera } from '../kamera3d'

const teil = (extra: Partial<GrundrissTeil> = {}): GrundrissTeil => ({ id: 't1', kuerzel: 'L', punkte: rechteckPunkte(0, 0, 6, 4), ...extra })
const daten = (...teile: GrundrissTeil[]): GrundrissDaten => ({ teile })

const ohneNaN = (a: number[]) => a.every((x) => Number.isFinite(x))

describe('Ohrenschneiden', () => {
  it('Rechteck → 2 Dreiecke, L-Form → 4, Fläche bleibt gleich', () => {
    expect(trianguliere(rechteckPunkte(0, 0, 3, 2))).toHaveLength(2)
    const l = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1.5 }, { x: 2, y: 1.5 }, { x: 2, y: 3 }, { x: 0, y: 3 }]
    const tris = trianguliere(l)
    expect(tris).toHaveLength(4)
    const f = tris.reduce((s, [a, b, c]) => s + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2, 0)
    expect(f).toBeCloseTo(4 * 1.5 + 2 * 1.5, 6)
    // andere Umlaufrichtung ergibt dasselbe
    expect(trianguliere([...l].reverse())).toHaveLength(4)
  })
})

describe('Rauminhalt aus dem Modell = Kubatur der Massenberechnung', () => {
  const faelle: [string, Partial<GrundrissTeil>][] = [
    ['Flachdach', { dachform: 'flach', hoehe: 2.3 }],
    ['Pultdach', { dachform: 'pult', hoehe: 2, hoeheOben: 2.8 }],
    ['Satteldach', { dachform: 'sattel', hoehe: 2.2, hoeheOben: 3.4 }],
    ['Walmdach', { dachform: 'walm', hoehe: 2.2, hoeheOben: 3.8, firstLaenge: 2.5 }],
    ['Walmdach (Firstlänge 0 = Pyramide)', { dachform: 'walm', hoehe: 2.2, hoeheOben: 3.8, firstLaenge: 0 }],
    ['Zeltdach', { dachform: 'zelt', hoehe: 2.2, hoeheOben: 4 }],
    ['Krüppelwalmdach', { dachform: 'krueppelwalm', hoehe: 2.2, hoeheOben: 3.8, walmHoehe: 0.7, walmTiefe: 1.1 }],
    ['Krüppelwalmdach (Walmhöhe = Dachhöhe)', { dachform: 'krueppelwalm', hoehe: 2.2, hoeheOben: 3.8, walmHoehe: 1.6, walmTiefe: 1.5 }],
    ['Mansarddach', { dachform: 'mansard', hoehe: 2.2, hoeheOben: 4.2, knickHoehe: 3.4, knickBreite: 0.9 }],
  ]
  for (const [name, extra] of faelle) {
    it(name, () => {
      const t = teil(extra)
      const m = baueTeil3D(t, 'laube', 'L', { x: 3, y: 2 })
      expect(rauminhaltAusDach(m)).toBeCloseTo(massenVon(t).kubaturM3!, 2) // Kubatur ist auf 0,01 m³ gerundet
      expect(ohneNaN(m.wand) && ohneNaN(m.dach) && ohneNaN(m.kanten)).toBe(true)
    })
  }
  it('Walm-, Krüppelwalm-, Mansard- und Zeltdach auch gedreht (längste Kante senkrecht) und gespiegelt', () => {
    for (const extra of [
      { dachform: 'walm', hoehe: 2, hoeheOben: 3.6, firstLaenge: 3 },
      { dachform: 'krueppelwalm', hoehe: 2, hoeheOben: 3.6, walmHoehe: 0.8, walmTiefe: 1 },
      { dachform: 'mansard', hoehe: 2, hoeheOben: 3.6, knickHoehe: 3, knickBreite: 0.7 },
      { dachform: 'zelt', hoehe: 2, hoeheOben: 3.6 },
    ] as const) {
      const t = teil({ punkte: rechteckPunkte(1, 2, 3, 7), ...extra })
      expect(rauminhaltAusDach(baueTeil3D(t, 'laube', 'L', { x: 0, y: 0 }))).toBeCloseTo(massenVon(t).kubaturM3!, 2)
      const spiegel = teil({ punkte: [...rechteckPunkte(1, 2, 3, 7)].reverse(), ...extra })
      expect(rauminhaltAusDach(baueTeil3D(spiegel, 'laube', 'L', { x: 0, y: 0 }))).toBeCloseTo(massenVon(spiegel).kubaturM3!, 2)
    }
  })
  it('Handrechnung: Walmdach 8 × 6, Traufe 2,5, First 5, Firstlänge 2 → Dachraum 45 m³; Mansard → 66 m³', () => {
    const walm = baueTeil3D(teil({ punkte: rechteckPunkte(0, 0, 8, 6), dachform: 'walm', hoehe: 2.5, hoeheOben: 5, firstLaenge: 2 }), 'laube', 'L', { x: 4, y: 3 })
    expect(rauminhaltAusDach(walm)).toBeCloseTo(48 * 2.5 + 45, 6)
    const mansard = baueTeil3D(teil({ punkte: rechteckPunkte(0, 0, 8, 6), dachform: 'mansard', hoehe: 2.5, hoeheOben: 5, knickHoehe: 4, knickBreite: 1.5 }), 'laube', 'L', { x: 4, y: 3 })
    expect(rauminhaltAusDach(mansard)).toBeCloseTo(48 * 2.5 + 66, 6)
  })
  it('Satteldach um 90° gedreht (längste Kante senkrecht) rechnet gleich', () => {
    const t = teil({ punkte: rechteckPunkte(0, 0, 3, 7), dachform: 'sattel', hoehe: 2, hoeheOben: 3 })
    expect(rauminhaltAusDach(baueTeil3D(t, 'laube', 'L', { x: 0, y: 0 }))).toBeCloseTo(massenVon(t).kubaturM3!, 6)
  })
})

describe('Form der neuen Dächer', () => {
  const kantenAufHoehe = (k: number[], y: number): number => {
    let n = 0
    for (let i = 0; i < k.length; i += 6) if (Math.abs(k[i + 1] - y) < 1e-9 && Math.abs(k[i + 4] - y) < 1e-9 && (k[i] !== k[i + 3] || k[i + 2] !== k[i + 5])) n++
    return n
  }
  it('Walmdach: First nur über der Firstlänge (2 m), vier Dachflächen, Wände rundum nur bis zur Traufe', () => {
    const m = baueTeil3D(teil({ punkte: rechteckPunkte(0, 0, 8, 6), dachform: 'walm', hoehe: 2.5, hoeheOben: 5, firstLaenge: 2 }), 'laube', 'L', { x: 4, y: 3 })
    expect(m.hoechsterPunkt).toBeCloseTo(5, 9)
    expect(m.dachform).toBe('walm')
    const k = m.kanten
    let firstLaenge = 0
    for (let i = 0; i < k.length; i += 6) {
      if (Math.abs(k[i + 1] - 5) < 1e-9 && Math.abs(k[i + 4] - 5) < 1e-9) firstLaenge += Math.hypot(k[i + 3] - k[i], k[i + 5] - k[i + 2])
    }
    expect(firstLaenge).toBeGreaterThanOrEqual(2 - 1e-9)
    // alle Wandpunkte liegen höchstens auf Traufhöhe
    for (let i = 1; i < m.wand.length; i += 3) expect(m.wand[i]).toBeLessThanOrEqual(2.5 + 1e-9)
  })
  it('Zeltdach: eine Spitze über der Mitte, Wände auf Traufhöhe', () => {
    const m = baueTeil3D(teil({ punkte: rechteckPunkte(0, 0, 6, 4), dachform: 'zelt', hoehe: 2.2, hoeheOben: 4 }), 'laube', 'L', { x: 3, y: 2 })
    expect(m.hoechsterPunkt).toBeCloseTo(4, 9)
    const d = m.dach
    for (let i = 0; i + 8 < d.length; i += 9) {
      const spitze = [0, 3, 6].filter((o) => Math.abs(d[i + o + 1] - 4) < 1e-9)
      expect(spitze).toHaveLength(1)
      expect(d[i + spitze[0]]).toBeCloseTo(0, 9)
      expect(d[i + spitze[0] + 2]).toBeCloseTo(0, 9)
    }
    expect(kantenAufHoehe(m.kanten, 4)).toBe(0) // kein First, nur Grate zur Spitze
  })
  it('Krüppelwalmdach: Giebelwand reicht bis Firsthöhe − Walmhöhe, First bleibt ganz auf Firsthöhe', () => {
    const m = baueTeil3D(teil({ punkte: rechteckPunkte(0, 0, 8, 6), dachform: 'krueppelwalm', hoehe: 2.5, hoeheOben: 5, walmHoehe: 1, walmTiefe: 1 }), 'laube', 'L', { x: 4, y: 3 })
    const giebel = [] as number[]
    for (let i = 0; i + 2 < m.wand.length; i += 3) if (Math.abs(m.wand[i] + 4) < 1e-9) giebel.push(m.wand[i + 1])
    expect(Math.max(...giebel)).toBeCloseTo(5 - 1, 9)
    expect(m.hoechsterPunkt).toBeCloseTo(5, 9)
  })
  it('Mansarddach: Knick auf Knickhöhe, Giebelwand mit Knickpunkten (Sieben­eck), Dach sonst über Traufe', () => {
    const m = baueTeil3D(teil({ punkte: rechteckPunkte(0, 0, 8, 6), dachform: 'mansard', hoehe: 2.5, hoeheOben: 5, knickHoehe: 4, knickBreite: 1.5 }), 'laube', 'L', { x: 4, y: 3 })
    const ys = new Set<number>()
    for (let i = 0; i + 2 < m.wand.length; i += 3) if (Math.abs(m.wand[i] + 4) < 1e-9) ys.add(Math.round(m.wand[i + 1] * 1e6) / 1e6)
    expect([...ys].sort((a, b) => a - b)).toEqual([0, 2.5, 4, 5])
    expect(kantenAufHoehe(m.kanten, 4)).toBeGreaterThan(0) // Knicklinie entlang der Längsseite
  })
  it('fehlende Zusatzmaße: Satteldach mit Hinweis, nichts bricht', () => {
    for (const extra of [{ dachform: 'walm' }, { dachform: 'krueppelwalm' }, { dachform: 'mansard' }] as const) {
      const m = baueTeil3D(teil({ ...extra, hoehe: 2.2, hoeheOben: 3.4 }), 'laube', 'L', { x: 3, y: 2 })
      expect(m.dachform).toBe('sattel')
      expect(m.hinweise.join(' ')).toMatch(/Satteldach dargestellt/)
      expect(rauminhaltAusDach(m)).toBeCloseTo(massenVon(teil({ ...extra, hoehe: 2.2, hoeheOben: 3.4 })).kubaturM3!, 2)
    }
  })
  it('Nicht-Rechteck (L-Form): alle Formen liefern endliche Zahlen, Höhe nie über der Firsthöhe', () => {
    const l = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 0, y: 5 }]
    for (const extra of [
      { dachform: 'walm', firstLaenge: 2 },
      { dachform: 'zelt' },
      { dachform: 'krueppelwalm', walmHoehe: 0.8, walmTiefe: 1 },
      { dachform: 'mansard', knickHoehe: 3, knickBreite: 0.5 },
    ] as const) {
      const m = baueTeil3D(teil({ punkte: l, hoehe: 2, hoeheOben: 4, ...extra }), 'laube', 'L', { x: 3, y: 2.5 })
      expect(ohneNaN(m.wand) && ohneNaN(m.dach) && ohneNaN(m.kanten)).toBe(true)
      expect(m.hoechsterPunkt).toBeLessThanOrEqual(4 + 1e-9)
      expect(m.dach.length).toBeGreaterThan(0)
    }
  })
})

describe('Form des Daches', () => {
  it('Satteldach: First liegt in der Mitte, Giebelwände sind Fünfecke (höchster Punkt = Firsthöhe)', () => {
    const m = baueTeil3D(teil({ dachform: 'sattel', hoehe: 2.2, hoeheOben: 3.4 }), 'laube', 'L', { x: 3, y: 2 })
    expect(m.hoechsterPunkt).toBeCloseTo(3.4, 9)
    expect(m.dachform).toBe('sattel')
    // Firstlinie: Kantenpaare auf Höhe 3,4 und z = 0 (Mitte der kürzeren Seite 4 m)
    const k = m.kanten
    let first = 0
    for (let i = 0; i < k.length; i += 6) {
      if (Math.abs(k[i + 1] - 3.4) < 1e-9 && Math.abs(k[i + 4] - 3.4) < 1e-9 && Math.abs(k[i + 2]) < 1e-9 && Math.abs(k[i + 5]) < 1e-9) first++
    }
    expect(first).toBeGreaterThan(0)
  })
  it('Pultdach: niedrige und hohe Wand', () => {
    const m = baueTeil3D(teil({ dachform: 'pult', hoehe: 2, hoeheOben: 2.8 }), 'laube', 'L', { x: 0, y: 0 })
    const ys = new Set<number>()
    for (let i = 1; i < m.dach.length; i += 3) ys.add(Math.round(m.dach[i] * 100) / 100)
    expect([...ys].sort()).toEqual([2, 2.8])
  })
  it('Mitte wird in den Ursprung gelegt', () => {
    const m = baueModell3D(daten(teil({ punkte: rechteckPunkte(10, 20, 6, 4), hoehe: 2 })))
    expect(m.mitte).toEqual({ x: 13, y: 22 })
    const xs = m.teile[0].dach.filter((_v, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBeCloseTo(-3, 9)
    expect(Math.max(...xs)).toBeCloseTo(3, 9)
  })
})

describe('Fehlende Angaben: nur Hinweise, nie ein Fehler', () => {
  it('ohne Höhe: Annahme 2,2 m mit Hinweis', () => {
    const m = baueModell3D(daten(teil()))
    expect(m.teile[0].hoechsterPunkt).toBeCloseTo(2.2, 9)
    expect(m.hinweise.join(' ')).toMatch(/L: Höhe fehlt/)
  })
  it('Satteldach ohne Firsthöhe → flach mit Hinweis; First unter Traufe → flach', () => {
    expect(baueTeil3D(teil({ dachform: 'sattel', hoehe: 2 }), 'laube', 'L', { x: 0, y: 0 })).toMatchObject({ dachform: 'flach', hinweise: [expect.stringMatching(/Firsthöhe fehlt/)] })
    expect(baueTeil3D(teil({ dachform: 'sattel', hoehe: 3, hoeheOben: 2 }), 'laube', 'L', { x: 0, y: 0 }).dachform).toBe('flach')
  })
  it('leerer Grundriss und Teile mit weniger als drei Ecken', () => {
    expect(baueModell3D({ teile: [] }).teile).toEqual([])
    expect(baueModell3D(daten(teil({ punkte: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }))).teile).toEqual([])
  })
})

describe('Bauteile und Farben', () => {
  it('Art kommt vom verknüpften Bauteil, sonst vom Kürzel', () => {
    expect(artVon(teil({ bauteilId: 'x' }), [{ id: 'x', art: 'schuppen' }])).toBe('schuppen')
    expect(artVon(teil({ kuerzel: 'A2' }))).toBe('anbau')
    expect(artVon(teil({ kuerzel: 'K' }))).toBe('keller')
    expect(artVon(teil({ kuerzel: 'GWH' }))).toBe('gewaechshaus')
    expect(artVon(teil({ kuerzel: 'Ü1' }))).toBe('vorplatz')
    expect(artVon(teil({ kuerzel: 'S' }))).toBe('schuppen')
    expect(artVon(teil({ kuerzel: 'L' }))).toBe('laube')
  })
  it('Kürzel des Bauteils gilt vor dem im Grundriss; mehrere Teile, höchster Punkt und Radius', () => {
    const m = baueModell3D(
      daten(teil({ bauteilId: 'b1', kuerzel: 'alt', hoehe: 2.5 }), teil({ id: 't2', kuerzel: 'A1', punkte: rechteckPunkte(6, 0, 2, 3), hoehe: 2 })),
      [{ id: 'b1', art: 'laube', kuerzel: 'L' }],
    )
    expect(m.teile.map((t) => t.kuerzel)).toEqual(['L', 'A1'])
    expect(m.hoechsterPunkt).toBeCloseTo(2.5, 9)
    expect(m.radius).toBeGreaterThanOrEqual(Math.hypot(8, 4) / 2)
  })
  it('Keller liegt unter dem Boden', () => {
    const m = baueModell3D(daten(teil({ kuerzel: 'K', gestrichelt: true, hoehe: 2 })))
    expect(m.teile[0].art).toBe('keller')
    expect(m.tiefsterPunkt).toBeCloseTo(-2, 9)
    expect(m.hoechsterPunkt).toBeCloseTo(0, 9)
    const ys = m.teile[0].wand.filter((_v, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBeCloseTo(-2, 9)
    expect(Math.max(...ys)).toBeCloseTo(0, 9)
  })
  it('jede Art hat eine Farbe und einen Namen; Farben stammen aus dem App-Design', () => {
    const tokens = readFileSync('src/design/tokens.css', 'utf-8').toLowerCase()
    for (const art of Object.keys(ART_TEXT_3D) as (keyof typeof FARBEN_3D)[]) {
      expect(FARBEN_3D[art].wand).toMatch(/^#[0-9a-f]{6}$/)
      expect(FARBEN_3D[art].dach).toMatch(/^#[0-9a-f]{6}$/)
    }
    // Grundfarben (Akzent, Text, Linie, Fläche) sind die Tokens selbst
    for (const f of [FARBEN_3D.laube.dach, FARBEN_3D.laube.wand, FARBEN_3D.schuppen.wand, FARBEN_3D.schuppen.dach, FARBEN_3D.vorplatz.wand, FARBEN_3D.vorplatz.dach, FARBE_KANTE, FARBE_RASTER]) {
      expect(tokens).toContain(f)
    }
    // die Bauteile lassen sich unterscheiden
    const dach = Object.values(FARBEN_3D).map((f) => f.dach)
    expect(new Set(dach.filter((_x, i) => i < 4)).size).toBe(4)
  })
})

describe('Kamera', () => {
  it('Start zeigt alles: Abstand wächst mit dem Radius und mit schmalerem Bild', () => {
    expect(passenderAbstand(10, 1.5)).toBeGreaterThan(10)
    expect(passenderAbstand(10, 0.5)).toBeGreaterThan(passenderAbstand(10, 2))
    expect(startKamera(5, 1.5).abstand).toBeGreaterThan(5)
  })
  it('Drehen: waagerecht beliebig, Höhenwinkel bleibt über dem Boden und unter dem Zenit', () => {
    let k = startKamera(5, 1.5)
    k = dreheKamera(k, 100, 0)
    expect(k.azimut).not.toBe(startKamera(5, 1.5).azimut)
    expect(dreheKamera(k, 0, -100000).hoehenwinkel).toBe(MIN_HOEHENWINKEL)
    expect(dreheKamera(k, 0, 100000).hoehenwinkel).toBe(MAX_HOEHENWINKEL)
  })
  it('Zoomen: begrenzt, ungültige Faktoren ändern nichts', () => {
    const k = startKamera(5, 1.5)
    const g = abstandsgrenzen(5)
    expect(zoomeKamera(k, 1000, 5).abstand).toBe(g.min)
    expect(zoomeKamera(k, 0.0001, 5).abstand).toBe(g.max)
    expect(zoomeKamera(k, 2, 5).abstand).toBeCloseTo(k.abstand / 2, 9)
    expect(zoomeKamera(k, NaN, 5)).toBe(k)
    expect(zoomeKamera(k, 0, 5)).toBe(k)
  })
  it('Position liegt im Abstand der Mitte, über dem Boden', () => {
    const k = { azimut: 1, hoehenwinkel: 0.6, abstand: 12 }
    const [x, y, z] = kameraPosition(k)
    expect(Math.hypot(x, y, z)).toBeCloseTo(12, 9)
    expect(y).toBeGreaterThan(0)
  })
})
