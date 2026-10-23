import { describe, expect, it } from 'vitest'
import type { Wep } from '../../model'
import { neuerWep } from '../../model'
import type { GrundrissDaten } from '../../skizze/grundriss'
import type { SkizzeBauform, SkizzeDaten, SkizzeSymbol } from '../../skizze/types'
import {
  LEINWAND,
  RAND_ANTEIL,
  abbildungFuer,
  flaecheUndVergleich,
  lageVon,
  massstabText,
  meterZuPx,
  parzellenLage,
  pfostenPositionen,
  pxZuMeter,
  rasterMeter,
  schiebeGrundrissInParzelle,
  seitenMasse,
  setzeParzelle,
  skizzeLage,
  skizzeMitParzelle,
  teileAusserhalb,
  wasLiegtDarauf,
} from '..'
import type { Parzelle } from '../types'

const rechteck = (laenge: number, breite: number): Parzelle => ({ form: 'rechteck', laenge, breite, angelegtVon: 'gruen', angelegtAm: '2026-10-23T10:00:00Z' })
const baum = (xm: number, ym: number, lage: ReturnType<typeof lageVon>): SkizzeSymbol => {
  const p = meterZuPx(lage!.abb, { x: xm, y: ym })
  return { id: 'b1', typ: 'symbol', art: 'baum', x: p.x, y: p.y, breite: 3 * lage!.abb.pxProM, hoehe: 4 * lage!.abb.pxProM, beschriftung: 'Apfel' }
}
const wepMit = (parzelle: Parzelle | undefined, extra: Partial<Wep> = {}): Wep => ({ ...neuerWep('2026-901'), ...(parzelle ? { parzelle } : {}), ...extra })

describe('Lage der Parzelle im Skizzenkasten', () => {
  it('füllt die Leinwand (600 × 825, Seitenverhältnis des Kastens B7:G48) mit Rand, zentriert, ein Maßstab', () => {
    expect(LEINWAND).toEqual({ breite: 600, hoehe: 825 })
    const rand = 600 * RAND_ANTEIL
    // schmal und hoch: die Höhe bestimmt den Maßstab
    const hoch = abbildungFuer(15, 30)
    expect(hoch.pxProM).toBeCloseTo((825 - 2 * rand) / 30, 6)
    expect(hoch.oy).toBeCloseTo(rand, 6)
    expect(hoch.ox).toBeCloseTo((600 - 15 * hoch.pxProM) / 2, 6)
    // breit: die Breite bestimmt den Maßstab
    const breit = abbildungFuer(30, 20)
    expect(breit.pxProM).toBeCloseTo((600 - 2 * rand) / 30, 6)
    expect(breit.ox).toBeCloseTo(rand, 6)
    // mindestens eine Seite berührt den Rand
    for (const [b, h] of [[15, 30], [30, 20], [18.5, 26.3]] as const) {
      const a = abbildungFuer(b, h)
      const randHorizontal = a.ox
      const randVertikal = a.oy
      expect(Math.min(randHorizontal, randVertikal)).toBeCloseTo(rand, 6)
    }
  })

  it('Rechteck: Breite waagerecht, Länge senkrecht; Ecken in Metern und in Pixeln', () => {
    const lage = parzellenLage(rechteck(26, 18))!
    expect(lage.breiteM).toBe(18)
    expect(lage.hoeheM).toBe(26)
    expect(lage.flaecheM2).toBe(468)
    expect(lage.seiten).toEqual([18, 26, 18, 26])
    const a = lage.abb
    expect(meterZuPx(a, { x: 0, y: 0 })).toEqual({ x: Math.round(a.ox * 10) / 10, y: Math.round(a.oy * 10) / 10 })
    const rechtsUnten = meterZuPx(a, { x: 18, y: 26 })
    expect(rechtsUnten.x).toBeCloseTo(a.ox + 18 * a.pxProM, 1)
    expect(rechtsUnten.y).toBeCloseTo(a.oy + 26 * a.pxProM, 1)
    // Umkehr
    const m = pxZuMeter(a, rechtsUnten)
    expect(m.x).toBeCloseTo(18, 1)
    expect(m.y).toBeCloseTo(26, 1)
  })

  it('noch nicht berechenbar → keine Lage', () => {
    expect(parzellenLage({ form: 'rechteck', laenge: 20, angelegtVon: 'bau', angelegtAm: 'x' })).toBeUndefined()
    expect(parzellenLage(undefined)).toBeUndefined()
  })

  it('Rasterkästchen in m passend zum Maßstab, gleich für beide Skizzen', () => {
    expect(rasterMeter(30)).toBe(1)
    expect(rasterMeter(13)).toBe(2)
    expect(rasterMeter(6)).toBe(5)
    expect(rasterMeter(2)).toBe(20)
    expect(massstabText(30)).toBe('1 Kästchen = 1 m')
    expect(massstabText(13)).toBe('1 Kästchen = 2 m')
  })

  it('Pfosten an den Ecken und am Rand; Seitenmaße innen, mit deutschem Komma', () => {
    const lage = parzellenLage(rechteck(26, 18.5))!
    const px = lage.punkte.map((p) => meterZuPx(lage.abb, p))
    const pf = pfostenPositionen(px)
    expect(pf.length).toBeGreaterThanOrEqual(4)
    for (const ecke of px) expect(pf.some((p) => Math.abs(p.x - ecke.x) < 0.2 && Math.abs(p.y - ecke.y) < 0.2)).toBe(true)
    const sm = seitenMasse(lage)
    expect(sm.map((s) => s.text)).toEqual(['18,5 m', '26 m', '18,5 m', '26 m'])
    // die Linie der oberen Seite liegt unterhalb der Kante (innen)
    expect(sm[0].von.y).toBeGreaterThan(px[0].y)
    // die der rechten Seite links davon
    expect(sm[1].von.x).toBeLessThan(px[1].x)
  })
})

describe('Fläche und Abweichung zur Vertragsfläche', () => {
  it('berechnete Fläche mit Hinweis bei Abweichung', () => {
    const r = flaecheUndVergleich(rechteck(26, 18), 400)
    expect(r.loesung?.flaeche).toBe(468)
    expect(r.vergleich?.hinweis).toMatch(/Berechnet 468 m², laut Vertrag 400 m² \(\+68 m², 17 %\)/)
    expect(flaecheUndVergleich(rechteck(20, 20), 400).vergleich?.hinweis).toBeUndefined()
    expect(flaecheUndVergleich(undefined, 400)).toEqual({})
  })
})

describe('Parzelle ändern: Grün-Elemente behalten ihre Lage in Metern', () => {
  it('Parzelle wird größer: Maßstab ändert sich, der Baum bleibt bei (3 m | 4 m)', () => {
    let wep = setzeParzelle(wepMit(undefined), rechteck(26, 18))
    expect(wep.skizze).toBeUndefined() // ohne Skizze entsteht keine
    wep = { ...wep, skizze: skizzeMitParzelle(wep)! }
    const lage1 = lageVon(wep)!
    wep = { ...wep, skizze: { ...wep.skizze!, elemente: [...wep.skizze!.elemente, baum(3, 4, lage1)] } }
    expect(skizzeLage(wep)).toBe('passt')

    const wep2 = setzeParzelle(wep, rechteck(40, 30))
    const lage2 = lageVon(wep2)!
    expect(lage2.abb.pxProM).toBeLessThan(lage1.abb.pxProM)
    const b = wep2.skizze!.elemente.find((e) => e.id === 'b1') as SkizzeSymbol
    const m = pxZuMeter(wep2.skizze!.massstab!, { x: b.x, y: b.y })
    expect(m.x).toBeCloseTo(3, 1)
    expect(m.y).toBeCloseTo(4, 1)
    // Größe bleibt 3 × 4 m
    expect(b.breite / wep2.skizze!.massstab!.pxProM).toBeCloseTo(3, 1)
    expect(b.hoehe / wep2.skizze!.massstab!.pxProM).toBeCloseTo(4, 1)
    // Grundstück folgt der neuen Parzelle
    const gs = wep2.skizze!.elemente.filter((e): e is SkizzeBauform => e.typ === 'bauform' && e.art === 'grundstueck')
    expect(gs).toHaveLength(1)
    const xs = gs[0].punkte.map((p) => p.x)
    expect((Math.max(...xs) - Math.min(...xs)) / wep2.skizze!.massstab!.pxProM).toBeCloseTo(30, 1)
    // nur ein Satz Pfosten, nicht doppelt
    const gl = wep2.skizze!.elemente.filter((e) => e.typ === 'bauform' && e.art === 'pfosten').length
    expect(gl).toBe(wep.skizze!.elemente.filter((e) => e.typ === 'bauform' && e.art === 'pfosten').length > 0 ? gl : 0)
  })

  it('Maßstab und Rasterkästchen der Skizze folgen der Parzelle', () => {
    const w = setzeParzelle({ ...wepMit(undefined), skizze: { elemente: [] } }, rechteck(60, 40))
    const s = w.skizze!
    expect(s.breite).toBe(600)
    expect(s.hoehe).toBe(825)
    expect(s.rasterGroesse).toBeCloseTo(rasterMeter(s.massstab!.pxProM) * s.massstab!.pxProM, 0)
  })

  it('Parzelle entfernt: die Skizze bleibt, der Maßstab entfällt', () => {
    const w1 = setzeParzelle({ ...wepMit(undefined), skizze: { elemente: [] } }, rechteck(26, 18))
    expect(w1.skizze!.massstab).toBeDefined()
    const w2 = setzeParzelle(w1, undefined)
    expect(w2.parzelle).toBeUndefined()
    expect(w2.skizze!.massstab).toBeUndefined()
    expect(w2.skizze!.elemente.length).toBe(w1.skizze!.elemente.length)
  })
})

describe('Migration: WEP ohne Parzelle', () => {
  const altSkizze = (): SkizzeDaten => ({
    breite: 800,
    hoehe: 600,
    raster: true,
    rasterGroesse: 40,
    elemente: [
      { id: 'g', typ: 'bauform', ebene: 'grundlage', art: 'grundstueck', punkte: [{ x: 100, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 500 }, { x: 100, y: 500 }] },
      { id: 'b1', typ: 'symbol', art: 'baum', x: 400, y: 300, breite: 60, hoehe: 80, beschriftung: 'Birke' },
    ],
    grundlage: { quelle: 'excel', uebernommen: '2026-10-01T00:00:00Z', gesperrt: true },
  })

  it('ohne Parzelle bleibt alles wie bisher (kein Maßstab, keine Änderung)', () => {
    const w = wepMit(undefined, { skizze: altSkizze() })
    expect(skizzeLage(w)).toBe('keine-parzelle')
    expect(skizzeMitParzelle(w)).toBe(w.skizze)
    expect(wasLiegtDarauf(w)).toEqual({ bauteile: 0, gruen: 1, grundlage: 0 })
  })

  it('mit neuer Parzelle: alte Skizze wird gleichmäßig auf die Parzelle gelegt (Grundstück = Parzelle), nichts geht verloren', () => {
    const w = wepMit(rechteck(26, 18), { skizze: altSkizze() })
    expect(skizzeLage(w)).toBe('umlegen')
    // Elemente liegen noch nach altem Maßstab → die Anzeige bleibt, wie sie ist, bis die Rückfrage bestätigt ist
    expect(skizzeMitParzelle(w)).toBe(w.skizze)
    const neu = setzeParzelle({ ...w, parzelle: undefined }, w.parzelle)
    const s = neu.skizze!
    expect(skizzeLage(neu)).toBe('passt')
    expect(s.massstab).toBeDefined()
    expect(s.breite).toBe(600)
    expect(s.hoehe).toBe(825)
    const baumNeu = s.elemente.find((e) => e.id === 'b1') as SkizzeSymbol
    // Das alte Grundstück (600 × 400 px) füllt gleichmäßig eingepasst die Parzelle (18 × 26 m): 15,4 px je m. Der Baum lag 30 | 40 px
    // neben der Mitte des Grundstücks → liegt jetzt 1,95 | 2,6 m neben der Mitte der Parzelle.
    const mitte = pxZuMeter(s.massstab!, { x: baumNeu.x + baumNeu.breite / 2, y: baumNeu.y + baumNeu.hoehe / 2 })
    expect(mitte.x).toBeCloseTo(9 + 30 / (400 / 26), 0)
    expect(mitte.y).toBeCloseTo(13 + 40 / (400 / 26), 0)
    expect(baumNeu.breite / s.massstab!.pxProM).toBeCloseTo(60 / (400 / 26), 1)
    // genau ein Grundstück, jetzt die Parzelle
    const gs = s.elemente.filter((e): e is SkizzeBauform => e.typ === 'bauform' && e.art === 'grundstueck')
    expect(gs).toHaveLength(1)
    expect(gs[0].id).not.toBe('g')
    // die Herkunft der Grundlage bleibt (Excel)
    expect(s.grundlage?.quelle).toBe('excel')
  })

  it('alte Skizze ohne Grundstück: die Leinwand steht für die Parzelle', () => {
    const alt: SkizzeDaten = { breite: 800, hoehe: 600, elemente: [{ id: 'b1', typ: 'symbol', art: 'baum', x: 0, y: 0, breite: 80, hoehe: 60 }] }
    const neu = setzeParzelle(wepMit(undefined, { skizze: alt }), rechteck(24, 32))
    const b = neu.skizze!.elemente.find((e) => e.id === 'b1') as SkizzeSymbol
    const m = pxZuMeter(neu.skizze!.massstab!, { x: b.x, y: b.y })
    expect(m.x).toBeGreaterThanOrEqual(-0.1) // links oben der alten Leinwand = links oben der eingepassten Fläche
    expect(m.x).toBeLessThanOrEqual(12)
    expect(neu.skizze!.elemente.some((e) => e.id === 'b1')).toBe(true)
  })

  it('leere/fehlende Skizze: wird ohne Rückfrage auf die Parzelle gelegt', () => {
    const w = wepMit(rechteck(26, 18))
    expect(skizzeLage(w)).toBe('leer')
    const s = skizzeMitParzelle(w)!
    expect(s.massstab).toEqual(lageVon(w)!.abb)
    expect(s.elemente.some((e) => e.typ === 'bauform' && e.art === 'grundstueck')).toBe(true)
    expect(s.grundlage?.quelle).toBe('parzelle')
    // gespeichert wird sie erst, wenn der Reiter sie ändert
    expect(w.skizze).toBeUndefined()
  })
})

describe('Grundriss und Parzelle', () => {
  const grundriss = (x: number, y: number): GrundrissDaten => ({
    teile: [{ id: 't1', kuerzel: 'L', punkte: [{ x, y }, { x: x + 4, y }, { x: x + 4, y: y + 6 }, { x, y: y + 6 }] }],
  })
  it('erkennt Teile außerhalb der Parzelle und schiebt den Grundriss hinein', () => {
    const lage = parzellenLage(rechteck(26, 18))!
    expect(teileAusserhalb(grundriss(2, 2), lage)).toEqual([])
    expect(teileAusserhalb(grundriss(16, 2), lage)).toEqual([0])
    expect(teileAusserhalb(undefined, lage)).toEqual([])
    const geschoben = schiebeGrundrissInParzelle(grundriss(16, 22), lage)
    expect(teileAusserhalb(geschoben, lage)).toEqual([])
    // Form und Größe bleiben
    const t = geschoben.teile[0].punkte
    expect(t[1].x - t[0].x).toBeCloseTo(4, 2)
    expect(t[2].y - t[1].y).toBeCloseTo(6, 2)
    // schon drin: unverändert
    expect(schiebeGrundrissInParzelle(grundriss(2, 2), lage).teile[0].punkte[0]).toEqual({ x: 2, y: 2 })
  })

  it('wasLiegtDarauf zählt Bauteile und Grün', () => {
    const w = wepMit(rechteck(26, 18), { grundriss: grundriss(2, 2), skizze: { elemente: [{ id: 'k', typ: 'kreis', cx: 10, cy: 10, radius: 5 }] } })
    expect(wasLiegtDarauf(w)).toEqual({ bauteile: 1, gruen: 1, grundlage: 0 })
  })
})
