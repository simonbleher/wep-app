import { describe, expect, it } from 'vitest'
import { flaecheVon, hatUeberschneidung, loese, vergleicheFlaeche } from '../geometrie'
import type { Parzelle } from '../types'

const base = { angelegtVon: 'gruen', angelegtAm: '2026-10-23T10:00:00Z' } as const
const frei = (ecken: [number, number][], seiten: (number | null)[], extra: Partial<Parzelle> = {}): Parzelle => ({
  form: 'frei',
  ecken: ecken.map(([x, y]) => ({ x, y })),
  seiten,
  ...base,
  ...extra,
})
const abstand = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

// grobe Ecken eines Vierecks (Uhrzeigersinn, y nach unten)
const VIERECK: [number, number][] = [[0, 0], [100, 0], [100, 150], [0, 150]]

describe('Rechteck', () => {
  it('Länge × Breite → Fläche, Ausdehnung und Ecken (Breite waagerecht, Länge senkrecht)', () => {
    const l = loese({ form: 'rechteck', laenge: 25, breite: 16, ...base })
    expect(l.status).toBe('fertig')
    expect(l.flaeche).toBe(400)
    expect(l.breite).toBe(16)
    expect(l.hoehe).toBe(25)
    expect(l.punkte).toEqual([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 25 }, { x: 0, y: 25 }])
    expect(l.mehrdeutig).toBe(false)
  })

  it('sagt, was fehlt', () => {
    expect(loese({ form: 'rechteck', laenge: 25, ...base }).fehlt.map((f) => f.art)).toEqual(['breite'])
    expect(loese({ form: 'rechteck', ...base }).fehlt.map((f) => f.art)).toEqual(['laenge', 'breite'])
    expect(loese({ form: 'rechteck', laenge: 0, breite: -3, ...base }).status).toBe('unvollstaendig')
  })
})

describe('freie Form aus Seiten und Diagonalen', () => {
  it('Viereck mit vier Seiten und einer Diagonale: eindeutig, Fläche stimmt (Trapez)', () => {
    // Trapez: oben 10, unten 16, Höhe 8 → 104 m². Seiten: oben 10, rechts √(3²+8²), unten 16, links √(3²+8²)
    const schraeg = Math.hypot(3, 8)
    const diag = Math.hypot(13, 8) // von links oben (3,0) zu rechts unten (16,8)... A=(3,0) B=(13,0) C=(16,8) D=(0,8)
    const p = frei([[3, 0], [13, 0], [16, 8], [0, 8]], [10, schraeg, 16, schraeg], { diagonalen: [{ von: 0, nach: 2, laenge: diag }] })
    const l = loese(p)
    expect(l.status).toBe('fertig')
    expect(l.flaeche).toBeCloseTo(104, 1)
    expect(l.mehrdeutig).toBe(false)
    expect(l.fehlt).toEqual([])
    // alle eingetippten Längen stehen in der Form
    expect(abstand(l.punkte[0], l.punkte[1])).toBeCloseTo(10, 2)
    expect(abstand(l.punkte[2], l.punkte[3])).toBeCloseTo(16, 2)
    expect(abstand(l.punkte[0], l.punkte[2])).toBeCloseTo(diag, 2)
    // links oben der Ausdehnung liegt bei (0, 0)
    expect(Math.min(...l.punkte.map((q) => q.x))).toBe(0)
    expect(Math.min(...l.punkte.map((q) => q.y))).toBe(0)
  })

  it('ohne Diagonale: unvollständig, die App nennt die fehlende Diagonale', () => {
    const l = loese(frei(VIERECK, [10, 15, 10, 15]))
    expect(l.status).toBe('unvollstaendig')
    expect(l.punkte).toEqual([])
    expect(l.fehlt).toHaveLength(1)
    expect(l.fehlt[0]).toMatchObject({ art: 'diagonale', text: 'Diagonale A–C', ecken: [0, 2], alternativWinkel: [1, 3] })
  })

  it('fehlende Seiten werden genannt, danach die nötigen Diagonalen', () => {
    const l = loese(frei(VIERECK, [10, null, 10, null]))
    expect(l.status).toBe('unvollstaendig')
    expect(l.fehlt.map((f) => f.text)).toEqual(['Seite B–C', 'Seite D–A', 'Diagonale A–C'])
  })

  it('Fünfeck braucht zwei Diagonalen, Sechseck drei (n − 3)', () => {
    const fuenf: [number, number][] = [[50, 0], [100, 40], [80, 100], [20, 100], [0, 40]]
    const l5 = loese(frei(fuenf, [10, 10, 10, 10, 10]))
    expect(l5.fehlt.filter((f) => f.art === 'diagonale')).toHaveLength(2)
    const sechs: [number, number][] = [[30, 0], [70, 0], [100, 50], [70, 100], [30, 100], [0, 50]]
    const l6 = loese(frei(sechs, [8, 8, 8, 8, 8, 8]))
    expect(l6.fehlt.filter((f) => f.art === 'diagonale')).toHaveLength(3)
  })

  it('Fünfeck: nach Eintippen der genannten Diagonalen ist die Form fertig und eindeutig', () => {
    // regelmäßiges Fünfeck, Seite 10 m, Diagonale 16,18 m, Fläche ≈ 172,05 m²
    const fuenf: [number, number][] = [[50, 0], [100, 38], [81, 97], [19, 97], [0, 38]]
    const d = 10 * ((1 + Math.sqrt(5)) / 2)
    let p = frei(fuenf, [10, 10, 10, 10, 10])
    let l = loese(p)
    // die App nennt die Diagonalen nacheinander; wir tippen die Länge ein
    for (let runde = 0; runde < 4 && l.status === 'unvollstaendig'; runde++) {
      const f = l.fehlt.find((x) => x.art === 'diagonale')!
      p = { ...p, diagonalen: [...(p.diagonalen ?? []), { von: f.ecken![0], nach: f.ecken![1], laenge: d }] }
      l = loese(p)
    }
    expect(l.status).toBe('fertig')
    expect(l.flaeche).toBeCloseTo(172.05, 0)
    // die grobe Zeichnung (konvex) hat entschieden – eine nach innen geknickte Ecke wäre mit denselben Maßen auch möglich
    expect(l.mehrdeutig).toBe(true)
  })

  it('Dreieck aus drei Seiten', () => {
    const l = loese(frei([[0, 0], [100, 0], [0, 75]], [8, Math.hypot(8, 6), 6]))
    expect(l.status).toBe('fertig')
    expect(l.flaeche).toBeCloseTo(24, 2)
    expect(l.mehrdeutig).toBe(false)
  })

  it('Winkel ersetzt die Diagonale: Viereck mit rechtem Winkel an B', () => {
    const l = loese(frei(VIERECK, [10, 15, 10, 15], { winkel: [{ ecke: 1, grad: 90 }] }))
    expect(l.status).toBe('fertig')
    expect(l.flaeche).toBeCloseTo(150, 1)
    expect(l.mehrdeutig).toBe(false)
  })

  it('Winkel ohne die zwei Seiten: Hinweis, nichts rechnet damit', () => {
    const l = loese(frei(VIERECK, [10, null, 10, 15], { winkel: [{ ecke: 1, grad: 90 }] }))
    expect(l.status).toBe('unvollstaendig')
    expect(l.hinweise.join(' ')).toMatch(/Winkel an Ecke B braucht die Seiten A–B und B–C/)
  })
})

describe('eindeutig / mehrdeutig', () => {
  // Viereck, dessen Diagonale A–C die Ecken B und D auf derselben oder auf entgegengesetzten Seiten haben kann:
  // Seiten 10, 10, 10, 10 und Diagonale 10 → Raute aus zwei gleichseitigen Dreiecken (D gegenüber von B)
  // oder zwei aufeinanderliegende Dreiecke (D = B, Fläche 43,3 – entartet, Ecken fallen zusammen).
  // Besser: ungleiche Seiten, damit „nach innen geknickt“ eine echte andere Form ist.
  // B weit außen, D nahe an der Diagonale A–C: D kann auf der Seite von B (nach innen geknickt) oder gegenüber liegen
  const seiten = [10, 9, 5.5, 5]
  const diag = 8
  const roh = (innen: boolean): [number, number][] => (innen ? [[0, 0], [100, 0], [100, 100], [30, 20]] : [[0, 0], [100, 0], [100, 100], [-30, 60]])

  it('Viereck mit Diagonale kann nach außen oder nach innen knicken → mehrdeutig, die grobe Zeichnung entscheidet', () => {
    const konvex = loese(frei(roh(false), seiten, { diagonalen: [{ von: 0, nach: 2, laenge: diag }] }))
    const knick = loese(frei(roh(true), seiten, { diagonalen: [{ von: 0, nach: 2, laenge: diag }] }))
    expect(konvex.status).toBe('fertig')
    expect(knick.status).toBe('fertig')
    expect(konvex.mehrdeutig).toBe(true)
    expect(knick.mehrdeutig).toBe(true)
    expect(konvex.hinweise.join(' ')).toMatch(/auch eine andere Form möglich/)
    // zwei verschiedene Flächen: konvex größer als geknickt
    expect(konvex.flaeche!).toBeGreaterThan(knick.flaeche!)
    // beide halten alle eingetippten Längen ein
    for (const l of [konvex, knick]) {
      expect(abstand(l.punkte[0], l.punkte[2])).toBeCloseTo(diag, 2)
      seiten.forEach((s, i) => expect(abstand(l.punkte[i], l.punkte[(i + 1) % 4])).toBeCloseTo(s, 2))
    }
  })

  it('eine zweite Diagonale macht die Form eindeutig', () => {
    const konvex = loese(frei(roh(false), seiten, { diagonalen: [{ von: 0, nach: 2, laenge: diag }] }))
    const bd = abstand(konvex.punkte[1], konvex.punkte[3])
    const l = loese(frei(roh(true), seiten, { diagonalen: [{ von: 0, nach: 2, laenge: diag }, { von: 1, nach: 3, laenge: bd }] }))
    expect(l.mehrdeutig).toBe(false)
    expect(l.flaeche).toBeCloseTo(konvex.flaeche!, 1)
  })

  it('die Form bleibt gleich, wenn die grobe Zeichnung nur gedreht oder gespiegelt ist (kein Unterschied in den Maßen)', () => {
    const p1 = loese(frei([[0, 0], [100, 0], [100, 150], [0, 150]], [10, 15, 10, 15], { diagonalen: [{ von: 0, nach: 2, laenge: Math.hypot(10, 15) }] }))
    const p2 = loese(frei([[100, 0], [100, 150], [0, 150], [0, 0]], [15, 10, 15, 10], { diagonalen: [{ von: 1, nach: 3, laenge: Math.hypot(10, 15) }] }))
    expect(p1.flaeche).toBeCloseTo(150, 1)
    expect(p2.flaeche).toBeCloseTo(150, 1)
    expect(p1.mehrdeutig).toBe(false)
  })
})

describe('Hinweise statt Sperren', () => {
  it('unmögliche Maße (Diagonale länger als zwei Seiten zusammen): „unmöglich“ mit Klartext', () => {
    const l = loese(frei(VIERECK, [3, 4, 3, 4], { diagonalen: [{ von: 0, nach: 2, laenge: 20 }] }))
    expect(l.status).toBe('unmoeglich')
    expect(l.hinweise.join(' ')).toMatch(/lässt sich keine Form zeichnen/)
  })

  it('Maße, die nicht ganz zusammenpassen (Überbestimmung), werden benannt – die Form entsteht trotzdem', () => {
    const l = loese(
      frei(VIERECK, [10, 15, 10, 15], {
        diagonalen: [{ von: 0, nach: 2, laenge: Math.hypot(10, 15) }, { von: 1, nach: 3, laenge: 20 }],
      }),
    )
    expect(l.status).toBe('fertig')
    expect(l.hinweise.join(' ')).toMatch(/Diagonale B–D: eingetippt 20 m, in der Form 18,03 m/)
  })

  it('sich kreuzende Seiten werden erkannt', () => {
    expect(hatUeberschneidung([{ x: 0, y: 0 }, { x: 10, y: 15 }, { x: 10, y: 0 }, { x: 0, y: 15 }])).toBe(true)
    expect(hatUeberschneidung([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 15 }, { x: 0, y: 15 }])).toBe(false)
  })

  it('weniger als drei Ecken: es fehlen Ecken', () => {
    expect(loese(frei([[0, 0], [1, 1]], [1, 1])).fehlt[0].art).toBe('ecken')
  })
})

describe('Fläche und Vertragsfläche', () => {
  it('Abweichung deutlich → Hinweis (nur Hinweis)', () => {
    const v = vergleicheFlaeche(412.3, 400)!
    expect(v.unterschied).toBe(12.3)
    expect(v.prozent).toBe(3.1)
    expect(v.hinweis).toMatch(/Berechnet 412,3 m², laut Vertrag 400 m² \(\+12,3 m², 3,1 %\)/)
    expect(v.hinweis).toMatch(/nur ein Hinweis/)
  })
  it('kleine Abweichung → kein Hinweis; ohne Vertragsfläche → kein Vergleich', () => {
    expect(vergleicheFlaeche(401, 400)!.hinweis).toBeUndefined()
    expect(vergleicheFlaeche(405, 400)!.hinweis).toBeUndefined() // 1,25 %
    expect(vergleicheFlaeche(400, 0)).toBeUndefined()
    expect(vergleicheFlaeche(undefined, 400)).toBeUndefined()
  })
  it('zu kleine Fläche wird ebenfalls gemeldet', () => {
    expect(vergleicheFlaeche(350, 400)!.hinweis).toMatch(/−50 m²/)
  })
  it('flaecheVon: Rechteck und L-Form', () => {
    expect(flaecheVon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12)
    expect(flaecheVon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }])).toBe(12)
  })
})
