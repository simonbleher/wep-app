import { describe, expect, it } from 'vitest'
import { macheRueckgaengig, pruefeSzene, wendeAlleAn, wendeAn } from '../operationen'
import type { Szene } from '../szene'

/** Grundstück 445 × 600 pt mit Laube (fest) und ASG (fest). */
function basis(): Szene {
  return {
    masse: { b: 445, h: 600 },
    elemente: [
      { id: 'b1', typ: 'bau', x: 300, y: 400, b: 400, h: 150, beschriftung: 'Laube', fest: true },
      { id: 'b2', typ: 'bau', x: 100, y: 600, b: 150, h: 80, beschriftung: 'ASG', fest: true },
    ],
  }
}

describe('hinzufuegen', () => {
  it('setzt die Mitte auf x/y und nimmt die Standardgröße', () => {
    const e = wendeAn(basis(), { op: 'hinzufuegen', typ: 'baum', x: 500, y: 200, beschriftung: 'Apfel' })
    expect(e.schritt.ok).toBe(true)
    const n = e.szene.elemente.at(-1)!
    expect(n.id).toBe('e1')
    expect(n.typ).toBe('baum')
    expect(n.beschriftung).toBe('Apfel')
    expect(n.x + n.b / 2).toBeCloseTo(500, 0)
    expect(n.y + n.h / 2).toBeCloseTo(200, 0)
    expect(n.b).toBeCloseTo((34 / 445) * 1000, 0)
  })

  it('schiebt Elemente am Rand ins Grundstück', () => {
    const n = wendeAn(basis(), { op: 'hinzufuegen', typ: 'baum', x: 1000, y: 0 }).szene.elemente.at(-1)!
    expect(n.x + n.b).toBeLessThanOrEqual(1000)
    expect(n.y).toBeGreaterThanOrEqual(0)
  })

  it('meldet unbekannte Typen, ohne etwas zu ändern', () => {
    const s = basis()
    const e = wendeAn(s, { op: 'hinzufuegen', typ: 'ufo' as never, x: 1, y: 1 })
    expect(e.schritt.ok).toBe(false)
    expect(e.szene).toBe(s)
  })

  it('vergibt fortlaufende ids', () => {
    const r = wendeAlleAn(basis(), [
      { op: 'hinzufuegen', typ: 'baum', x: 100, y: 100 },
      { op: 'hinzufuegen', typ: 'baum', x: 200, y: 100 },
    ])
    expect(r.szene.elemente.map((e) => e.id)).toEqual(['b1', 'b2', 'e1', 'e2'])
  })
})

describe('feste Elemente', () => {
  const ops = [
    { op: 'loeschen', id: 'b1' },
    { op: 'verschieben', id: 'b1', x: 10, y: 10 },
    { op: 'groesse', id: 'b1', b: 10, h: 10 },
    { op: 'beschriften', id: 'b1', text: 'Schuppen' },
    { op: 'aendern', id: 'b1', typ: 'baum' },
  ] as const
  for (const op of ops) {
    it(`${op.op} ändert nie ein festes Element`, () => {
      const s = basis()
      const e = wendeAn(s, op)
      expect(e.schritt.ok).toBe(false)
      expect(e.schritt.text).toContain('fest')
      expect(e.szene).toBe(s)
    })
  }

  it('dient aber als Bezug für neben/unter/ueber', () => {
    const e = wendeAn(basis(), { op: 'unter', id: 'b1', typ: 'hochbeet' })
    expect(e.schritt.ok).toBe(true)
  })
})

describe('aendern, verschieben, groesse, loeschen, beschriften', () => {
  const mitBaum = () => wendeAn(basis(), { op: 'hinzufuegen', typ: 'baum', x: 200, y: 200 }).szene

  it('aendern wechselt Typ und Text', () => {
    const e = wendeAn(mitBaum(), { op: 'aendern', id: 'e1', typ: 'strauch', beschriftung: 'Flieder' })
    const n = e.szene.elemente.find((x) => x.id === 'e1')!
    expect([n.typ, n.beschriftung]).toEqual(['strauch', 'Flieder'])
  })

  it('verschieben absolut setzt die Mitte, relativ addiert', () => {
    const a = wendeAn(mitBaum(), { op: 'verschieben', id: 'e1', x: 700, y: 300 }).szene.elemente.find((x) => x.id === 'e1')!
    expect(a.x + a.b / 2).toBeCloseTo(700, 0)
    const r = wendeAn(mitBaum(), { op: 'verschieben', id: 'e1', dx: 50, dy: -20 }).szene.elemente.find((x) => x.id === 'e1')!
    const v = mitBaum().elemente.find((x) => x.id === 'e1')!
    expect(r.x - v.x).toBeCloseTo(50, 0)
    expect(r.y - v.y).toBeCloseTo(-20, 0)
  })

  it('verschieben ohne Ziel meldet einen Fehler', () => {
    expect(wendeAn(mitBaum(), { op: 'verschieben', id: 'e1' }).schritt.ok).toBe(false)
  })

  it('groesse behält die Mitte', () => {
    const v = mitBaum().elemente.find((x) => x.id === 'e1')!
    const n = wendeAn(mitBaum(), { op: 'groesse', id: 'e1', b: 100, h: 80 }).szene.elemente.find((x) => x.id === 'e1')!
    expect(n.x + n.b / 2).toBeCloseTo(v.x + v.b / 2, 0)
    expect([n.b, n.h]).toEqual([100, 80])
  })

  it('loeschen und beschriften', () => {
    expect(wendeAn(mitBaum(), { op: 'loeschen', id: 'e1' }).szene.elemente.some((x) => x.id === 'e1')).toBe(false)
    expect(wendeAn(mitBaum(), { op: 'beschriften', id: 'e1', text: ' Birne ' }).szene.elemente.find((x) => x.id === 'e1')!.beschriftung).toBe('Birne')
  })

  it('unbekannte id wird gemeldet', () => {
    const e = wendeAn(mitBaum(), { op: 'loeschen', id: 'zz' })
    expect(e.schritt.ok).toBe(false)
  })
})

describe('reihe', () => {
  it('ordnet drei Beete gleichmäßig nebeneinander an', () => {
    const r = wendeAn(basis(), { op: 'reihe', typ: 'beet', anzahl: 3, bereich: { x1: 150, y1: 60, x2: 850, y2: 180 }, beschriftung: 'Beete' })
    expect(r.schritt.ok).toBe(true)
    const beete = r.szene.elemente.filter((e) => e.typ === 'beet')
    expect(beete).toHaveLength(3)
    const mitten = beete.map((e) => e.x + e.b / 2)
    expect(mitten[1] - mitten[0]).toBeCloseTo(mitten[2] - mitten[1], 0)
    expect(beete.every((e) => e.y >= 60 && e.y + e.h <= 180)).toBe(true)
    expect(beete.every((e) => !(e.x < 150 || e.x + e.b > 850))).toBe(true)
    // gleiche Gruppe, Beschriftung nur einmal in der Mitte
    expect(new Set(beete.map((e) => e.gruppe)).size).toBe(1)
    expect(beete.map((e) => e.beschriftung)).toEqual(['', 'Beete', ''])
  })

  it('läuft bei hohem Bereich untereinander', () => {
    const r = wendeAn(basis(), { op: 'reihe', typ: 'baum', anzahl: 3, bereich: { x1: 900, y1: 100, x2: 960, y2: 700 } })
    const ys = r.szene.elemente.filter((e) => e.typ === 'baum').map((e) => e.y)
    expect(ys[0]).toBeLessThan(ys[1])
    expect(ys[1]).toBeLessThan(ys[2])
    expect(r.schritt.text).toContain('untereinander')
  })

  it('lehnt unsinnige Anzahlen ab', () => {
    const bereich = { x1: 0, y1: 0, x2: 500, y2: 100 }
    expect(wendeAn(basis(), { op: 'reihe', typ: 'beet', anzahl: 0, bereich }).schritt.ok).toBe(false)
    expect(wendeAn(basis(), { op: 'reihe', typ: 'beet', anzahl: 99, bereich }).schritt.ok).toBe(false)
  })

  it('nummeriert Gruppen fortlaufend', () => {
    const bereich = { x1: 0, y1: 0, x2: 500, y2: 100 }
    const r = wendeAlleAn(basis(), [
      { op: 'reihe', typ: 'beet', anzahl: 2, bereich },
      { op: 'reihe', typ: 'beet', anzahl: 2, bereich: { x1: 0, y1: 200, x2: 500, y2: 300 } },
    ])
    expect([...new Set(r.szene.elemente.map((e) => e.gruppe).filter(Boolean))]).toEqual(['g1', 'g2'])
  })
})

describe('entlangKante', () => {
  it('Hecke rechts: schmale Linie am rechten Rand', () => {
    const r = wendeAn(basis(), { op: 'entlangKante', kante: 'rechts', typ: 'hecke' })
    const h = r.szene.elemente.at(-1)!
    expect(h.typ).toBe('hecke')
    expect(h.x + h.b).toBeCloseTo(1000 - 12, 0)
    expect(h.h).toBeGreaterThan(h.b * 5)
  })

  it('Hecke oben: liegend', () => {
    const h = wendeAn(basis(), { op: 'entlangKante', kante: 'oben', typ: 'hecke' }).szene.elemente.at(-1)!
    expect(h.b).toBeGreaterThan(h.h * 5)
    expect(h.y).toBeCloseTo(12, 0)
  })

  it('Bäume am Rand: mehrere Einzelelemente', () => {
    const r = wendeAn(basis(), { op: 'entlangKante', kante: 'links', typ: 'baum', anzahl: 4 })
    expect(r.szene.elemente.filter((e) => e.typ === 'baum')).toHaveLength(4)
  })

  it('unbekannte Kante wird gemeldet', () => {
    expect(wendeAn(basis(), { op: 'entlangKante', kante: 'mitte' as never, typ: 'hecke' }).schritt.ok).toBe(false)
  })
})

describe('neben / unter / ueber', () => {
  it('neben links liegt links mit Lücke, gleiche Höhe der Mitte', () => {
    const r = wendeAn(basis(), { op: 'neben', id: 'b1', typ: 'schaukel', seite: 'links', abstand: 30 })
    const n = r.szene.elemente.at(-1)!
    const ref = basis().elemente[0]
    expect(ref.x - (n.x + n.b)).toBeCloseTo(30, 0)
    expect(n.y + n.h / 2).toBeCloseTo(ref.y + ref.h / 2, 0)
  })

  it('unter und ueber', () => {
    const u = wendeAn(basis(), { op: 'unter', id: 'b1', typ: 'hochbeet' }).szene.elemente.at(-1)!
    expect(u.y).toBeGreaterThan(550)
    const o = wendeAn(basis(), { op: 'ueber', id: 'b1', typ: 'baum' }).szene.elemente.at(-1)!
    expect(o.y + o.h).toBeLessThan(400)
  })

  it('bleibt im Grundstück, wenn der Bezug am Rand liegt', () => {
    const s = wendeAn(basis(), { op: 'hinzufuegen', typ: 'baum', x: 990, y: 500 }).szene
    const n = wendeAn(s, { op: 'neben', id: 'e1', typ: 'baum' }).szene.elemente.at(-1)!
    expect(n.x + n.b).toBeLessThanOrEqual(1000)
  })

  it('unbekannte Bezugs-id', () => {
    expect(wendeAn(basis(), { op: 'neben', id: 'x9', typ: 'baum' }).schritt.ok).toBe(false)
  })
})

describe('Rückgängig je Schritt', () => {
  it('macht Hinzufügen, Ändern und Löschen einzeln rückgängig', () => {
    const r = wendeAlleAn(basis(), [
      { op: 'hinzufuegen', typ: 'baum', x: 100, y: 100, beschriftung: 'Apfel' },
      { op: 'hinzufuegen', typ: 'strauch', x: 300, y: 100 },
      { op: 'beschriften', id: 'e1', text: 'Birne' },
      { op: 'loeschen', id: 'e2' },
    ])
    expect(r.szene.elemente.map((e) => e.id)).toEqual(['b1', 'b2', 'e1'])
    // Löschen zurück: Strauch ist wieder da
    const a = macheRueckgaengig(r.szene, r.schritte[3])
    expect(a.elemente.some((e) => e.id === 'e2')).toBe(true)
    // Beschriften zurück: wieder Apfel
    const b = macheRueckgaengig(r.szene, r.schritte[2])
    expect(b.elemente.find((e) => e.id === 'e1')!.beschriftung).toBe('Apfel')
    // Hinzufügen zurück: Baum weg
    const c = macheRueckgaengig(r.szene, r.schritte[0])
    expect(c.elemente.some((e) => e.id === 'e1')).toBe(false)
  })

  it('macht eine ganze Reihe auf einmal rückgängig', () => {
    const r = wendeAn(basis(), { op: 'reihe', typ: 'beet', anzahl: 3, bereich: { x1: 0, y1: 0, x2: 600, y2: 100 } })
    expect(macheRueckgaengig(r.szene, r.schritt).elemente).toHaveLength(2)
  })
})

describe('pruefeSzene', () => {
  it('findet nichts bei sauberer Szene', () => {
    const s = wendeAn(basis(), { op: 'hinzufuegen', typ: 'baum', x: 100, y: 150, beschriftung: 'Apfel' }).szene
    expect(pruefeSzene(s)).toEqual([])
  })

  it('findet ein Element, das die Laube überlappt', () => {
    const s = wendeAn(basis(), { op: 'hinzufuegen', typ: 'hochbeet', x: 500, y: 470 }).szene
    expect(pruefeSzene(s).some((b) => b.art === 'ueberlappung' && b.ids.includes('b1'))).toBe(true)
  })

  it('findet Elemente außerhalb', () => {
    const s = basis()
    s.elemente.push({ id: 'e1', typ: 'baum', x: 980, y: 100, b: 60, h: 60, beschriftung: '' })
    expect(pruefeSzene(s).some((b) => b.art === 'ausserhalb')).toBe(true)
  })

  it('findet eine Beschriftung, die von einem anderen Element verdeckt wird', () => {
    const r = wendeAlleAn(basis(), [
      { op: 'hinzufuegen', typ: 'baum', x: 100, y: 100, beschriftung: 'Apfelbaum' },
      { op: 'hinzufuegen', typ: 'hochbeet', x: 100, y: 165 },
    ])
    const b = pruefeSzene(r.szene)
    expect(b.some((x) => x.art === 'beschriftung' && x.ids.includes('e1'))).toBe(true)
  })

  it('Rasen und Wege dürfen sich überlagern', () => {
    const r = wendeAlleAn(basis(), [
      { op: 'hinzufuegen', typ: 'rasen', x: 500, y: 480, beschriftung: 'Rasen' },
      { op: 'hinzufuegen', typ: 'weg', x: 500, y: 480 },
    ])
    expect(pruefeSzene(r.szene)).toEqual([])
  })
})
