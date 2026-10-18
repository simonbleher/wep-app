import { describe, expect, it } from 'vitest'
import { skizzeZuSzene, szeneKompakt, szeneZuSkizze, type Szene } from '../szene'
import { wendeAn } from '../operationen'
import type { SkizzeDaten } from '../types'

const daten = (): SkizzeDaten => ({
  breite: 800,
  hoehe: 600,
  elemente: [
    { id: 'r1', typ: 'rechteck', x: 400, y: 300, breite: 200, hoehe: 150 },
    { id: 's1', typ: 'symbol', art: 'baum', x: 80, y: 60, breite: 60, hoehe: 90, beschriftung: 'Apfel' },
    { id: 'l1', typ: 'linie', x1: 0, y1: 0, x2: 100, y2: 50 },
    { id: 't1', typ: 'text', x: 10, y: 10, inhalt: 'Laube' },
  ],
})

describe('SkizzeDaten ⇄ Szene', () => {
  it('übernimmt Symbole änderbar und alles andere als fest', () => {
    const s = skizzeZuSzene(daten())
    const fest = s.elemente.filter((e) => e.fest).map((e) => e.id)
    expect(fest).toEqual(['r1', 'l1', 't1'])
    const baum = s.elemente.find((e) => e.id === 's1')!
    expect(baum).toMatchObject({ typ: 'baum', beschriftung: 'Apfel', x: 100, y: 100, b: 75, h: 150 })
    expect(baum.fest).toBeUndefined()
  })

  it('Roundtrip ohne Änderung lässt die Skizze gleich', () => {
    const d = daten()
    const zurueck = szeneZuSkizze(skizzeZuSzene(d), d)
    expect(zurueck.elemente.map((e) => e.id)).toEqual(['r1', 's1', 'l1', 't1'])
    const s = zurueck.elemente[1]
    expect(s).toMatchObject({ typ: 'symbol', art: 'baum', beschriftung: 'Apfel' })
    if (s.typ === 'symbol') {
      expect(s.x).toBeCloseTo(80, 5)
      expect(s.breite).toBeCloseTo(60, 5)
    }
    // Nicht-Symbole bleiben dieselben Objekte
    expect(zurueck.elemente[0]).toBe(d.elemente[0])
  })

  it('schreibt neue Symbole ans Ende, entfernt gelöschte, verschont feste', () => {
    const d = daten()
    let s: Szene = skizzeZuSzene(d)
    s = wendeAn(s, { op: 'hinzufuegen', typ: 'hochbeet', x: 500, y: 800 }).szene
    s = wendeAn(s, { op: 'loeschen', id: 's1' }).szene
    s = wendeAn(s, { op: 'loeschen', id: 'r1' }).szene // fest → bleibt
    const neu = szeneZuSkizze(s, d)
    expect(neu.elemente.map((e) => e.id)).toEqual(['r1', 'l1', 't1', 'e1'])
    expect(neu.elemente.at(-1)).toMatchObject({ typ: 'symbol', art: 'hochbeet' })
  })

  it('bleibt bei anderen Seitenverhältnissen stimmig', () => {
    const d = { ...daten(), breite: 400, hoehe: 800 }
    const s = skizzeZuSzene(d)
    expect(s.masse.h / s.masse.b).toBeCloseTo(2, 1)
  })
})

describe('szeneKompakt', () => {
  it('ist gültiges JSON, ganze Zahlen, ohne feste Linien', () => {
    const j = JSON.parse(szeneKompakt(skizzeZuSzene(daten())))
    expect(j.masse_pt).toHaveLength(2)
    expect(j.elemente.map((e: { id: string }) => e.id)).toEqual(['r1', 's1', 't1'])
    expect(j.elemente[1]).toMatchObject({ id: 's1', typ: 'baum', t: 'Apfel' })
    expect(j.elemente[0].fest).toBe(1)
  })
})
