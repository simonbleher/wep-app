// @vitest-environment node
// Beta 4, Paket 3: Grundriss mit echten Maßen – Maße → Geometrie, Fläche, Kubatur, Maßketten. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import {
  bewegeEcke,
  flaecheVon,
  freiesKuerzel,
  kantenLaenge,
  kuerzelVon,
  masskette,
  massenJeBauteil,
  massenVon,
  massenZeileText,
  massenberechnung,
  naechsteEcke,
  naechsteKante,
  punktImPolygon,
  rechteckMasse,
  rechteckPunkte,
  schwerpunktVon,
  setzeKantenLaenge,
  setzeRechteckMasse,
  umfangVon,
  verschiebePunkte,
  zahlText,
  meterText,
  type GrundrissDaten,
  type GrundrissTeil,
} from '../grundriss'

const rechteck = rechteckPunkte(0, 0, 4, 6)
const lForm = [
  { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 0, y: 5 },
]
const teil = (p: Partial<GrundrissTeil> & { punkte: GrundrissTeil['punkte'] }): GrundrissTeil => ({ id: 't', kuerzel: 'L', ...p })

describe('Fläche, Umfang, Form', () => {
  it('Rechteck: Fläche, Umfang, Länge und Breite', () => {
    expect(flaecheVon(rechteck)).toBe(24)
    expect(umfangVon(rechteck)).toBe(20)
    expect(rechteckMasse(rechteck)).toEqual({ laenge: 6, breite: 4 })
  })

  it('L-Form ist kein Rechteck; Fläche 18 m²', () => {
    expect(flaecheVon(lForm)).toBe(18)
    expect(rechteckMasse(lForm)).toBeUndefined()
  })

  it('erkennt auch gedrehte Rechtecke', () => {
    const w = Math.SQRT1_2
    const gedreht = [{ x: 0, y: 0 }, { x: 4 * w, y: 4 * w }, { x: 4 * w - 3 * w, y: 4 * w + 3 * w }, { x: -3 * w, y: 3 * w }]
    expect(rechteckMasse(gedreht)).toEqual({ laenge: 4, breite: 3 })
    expect(flaecheVon(gedreht)).toBeCloseTo(12, 9)
  })

  it('Schwerpunkt, Punkt-im-Polygon, nächste Kante und Ecke', () => {
    expect(schwerpunktVon(rechteck)).toEqual({ x: 2, y: 3 })
    expect(punktImPolygon({ x: 1, y: 1 }, lForm)).toBe(true)
    expect(punktImPolygon({ x: 4, y: 4 }, lForm)).toBe(false) // in der Aussparung
    expect(naechsteKante(rechteck, { x: 2, y: 0.1 }, 0.3)).toBe(0)
    expect(naechsteKante(rechteck, { x: 2, y: 3 }, 0.3)).toBe(-1)
    expect(naechsteEcke(rechteck, { x: 3.9, y: 5.9 }, 0.3)).toBe(2)
  })
})

describe('Länge eintippen → die Form passt sich an', () => {
  it('Rechteck: Kante 0 (4 m → 5 m) zieht die gegenüberliegende Seite mit', () => {
    const neu = setzeKantenLaenge(rechteck, 0, 5)
    expect(neu).toEqual(rechteckPunkte(0, 0, 5, 6))
    expect(flaecheVon(neu)).toBe(30)
    expect(rechteckMasse(neu)).toEqual({ laenge: 6, breite: 5 })
  })

  it('Rechteck: senkrechte Kante (6 m → 3 m)', () => {
    const neu = setzeKantenLaenge(rechteck, 1, 3)
    expect(neu).toEqual(rechteckPunkte(0, 0, 4, 3))
    expect(kantenLaenge(neu, 1)).toBe(3)
  })

  it('Rechteck: Kante von rechts nach links (Richtung wird beachtet)', () => {
    // Kante 2 läuft von (4,6) nach (0,6); Punkt 2 bleibt stehen, die linke Seite wandert
    const neu = setzeKantenLaenge(rechteck, 2, 5)
    expect(kantenLaenge(neu, 2)).toBe(5)
    expect(neu[2]).toEqual({ x: 4, y: 6 })
    expect(neu[3]).toEqual({ x: -1, y: 6 })
    expect(neu[0]).toEqual({ x: -1, y: 0 })
    expect(rechteckMasse(neu)).toEqual({ laenge: 6, breite: 5 })
  })

  it('L-Form: obere Kante 6 → 8 m, die Form bleibt rechtwinklig', () => {
    const neu = setzeKantenLaenge(lForm, 0, 8)
    expect(neu).toEqual([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 5 }, { x: 0, y: 5 }])
    expect(flaecheVon(neu)).toBe(22)
  })

  it('L-Form: innere senkrechte Kante 3 → 4 m verlängert den Schenkel', () => {
    const neu = setzeKantenLaenge(lForm, 3, 4)
    expect(neu[4]).toEqual({ x: 2, y: 6 })
    expect(neu[5]).toEqual({ x: 0, y: 6 })
    expect(flaecheVon(neu)).toBe(20)
  })

  it('Schräge Kante: nur der Endpunkt wandert entlang der Kante', () => {
    const dreieck = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]
    const neu = setzeKantenLaenge(dreieck, 1, 10) // Hypotenuse 5 m → 10 m
    expect(neu[1]).toEqual({ x: 4, y: 0 })
    expect(neu[2]).toEqual({ x: -4, y: 6 })
    expect(kantenLaenge(neu, 1)).toBeCloseTo(10, 2)
  })

  it('ungültige Längen ändern nichts', () => {
    for (const l of [0, -2, NaN, Infinity]) expect(setzeKantenLaenge(rechteck, 0, l)).toEqual(rechteck)
  })

  it('auf Zentimeter genau, Eingabe wird nicht verfälscht', () => {
    const neu = setzeKantenLaenge(rechteck, 0, 4.567)
    expect(kantenLaenge(neu, 0)).toBe(4.57)
  })

  it('wiederholtes Eintippen (3 → 3,5 → 4,5) landet exakt beim Endwert', () => {
    let p = rechteck
    for (const v of [3, 3.5, 4.5]) p = setzeKantenLaenge(p, 0, v)
    expect(p).toEqual(rechteckPunkte(0, 0, 4.5, 6))
  })

  it('setzeRechteckMasse: Länge = längere Seite, Breite = kürzere', () => {
    const neu = setzeRechteckMasse(rechteck, 7, 3)
    expect(rechteckMasse(neu)).toEqual({ laenge: 7, breite: 3 })
    expect(flaecheVon(neu)).toBe(21)
    // hochkant gezeichnet (Kante 0 = kurz)
    const quer = rechteckPunkte(1, 1, 6, 4)
    expect(rechteckMasse(setzeRechteckMasse(quer, 8, undefined))).toEqual({ laenge: 8, breite: 4 })
  })

  it('Ecke ziehen: ein Rechteck bleibt ein Rechteck', () => {
    const neu = bewegeEcke(rechteck, 2, { x: 5, y: 7 })
    expect(neu).toEqual(rechteckPunkte(0, 0, 5, 7))
    expect(rechteckMasse(neu)).toEqual({ laenge: 7, breite: 5 })
  })

  it('Ecke ziehen an schrägen Kanten verformt frei', () => {
    const dreieck = [{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 3 }]
    const neu = bewegeEcke(dreieck, 2, { x: 2, y: 5 })
    expect(neu).toEqual([{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: 2, y: 5 }])
  })

  it('verschieben ändert die Maße nicht', () => {
    const neu = verschiebePunkte(rechteck, 2.5, -1)
    expect(flaecheVon(neu)).toBe(24)
    expect(neu[0]).toEqual({ x: 2.5, y: -1 })
  })
})

describe('Massenberechnung: Fläche und Kubatur nach Dachform', () => {
  it('Flachdach: Fläche × Höhe', () => {
    const m = massenVon(teil({ punkte: rechteck, hoehe: 2.5 }))
    expect(m).toMatchObject({ flaeche: 24, dachform: 'flach', raumM3: 60, dachraumM3: 0, kubaturM3: 60, mittlereHoehe: 2.5 })
    expect(m.hinweise).toEqual([])
  })

  it('Pultdach: Fläche × Mittel aus niedriger und hoher Wand', () => {
    const m = massenVon(teil({ punkte: rechteckPunkte(0, 0, 2.5, 2), hoehe: 2, dachform: 'pult', hoeheOben: 2.4 }))
    expect(m.kubaturM3).toBe(11)
    expect(m.raumM3).toBe(10)
    expect(m.dachraumM3).toBe(1)
    expect(m.mittlereHoehe).toBe(2.2)
  })

  it('Satteldach: Fläche × Traufhöhe + Dachraum (Fläche × Firsthöhe über Traufe ÷ 2)', () => {
    const m = massenVon(teil({ punkte: rechteck, hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 }))
    expect(m.raumM3).toBe(52.8)
    expect(m.dachraumM3).toBe(10.8)
    expect(m.kubaturM3).toBe(63.6)
    expect(m.mittlereHoehe).toBe(2.65)
  })

  it('ohne Höhe: Fläche ja, Kubatur nein, mit Hinweis', () => {
    const m = massenVon(teil({ punkte: rechteck }))
    expect(m.flaeche).toBe(24)
    expect(m.kubaturM3).toBeUndefined()
    expect(m.hinweise[0]).toMatch(/Höhe fehlt/)
  })

  it('Satteldach ohne Firsthöhe rechnet wie Flachdach und sagt es', () => {
    const m = massenVon(teil({ punkte: rechteck, hoehe: 2, dachform: 'sattel' }))
    expect(m.kubaturM3).toBe(48)
    expect(m.hinweise.join(' ')).toMatch(/Firsthöhe fehlt/)
  })

  it('Firsthöhe unter der Wandhöhe: Warnung, nichts gesperrt', () => {
    const m = massenVon(teil({ punkte: rechteck, hoehe: 3, dachform: 'sattel', hoeheOben: 2 }))
    expect(m.hinweise.join(' ')).toMatch(/niedriger/)
    expect(m.kubaturM3).toBe(72) // Dachraum nie negativ
  })

  it('Dachraum bei nicht rechteckigem Grundriss ist eine Näherung (Hinweis)', () => {
    const m = massenVon(teil({ punkte: lForm, hoehe: 2, dachform: 'sattel', hoeheOben: 3 }))
    expect(m.flaeche).toBe(18)
    expect(m.kubaturM3).toBe(45)
    expect(m.hinweise.join(' ')).toMatch(/Näherung/)
  })

  it('Berechnung für den ganzen Grundriss: Summen, Kürzel aus dem Bauteil, Zeilentext', () => {
    const daten: GrundrissDaten = {
      teile: [
        { id: 'a', kuerzel: 'x', bauteilId: 'b1', punkte: rechteck, hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
        { id: 'b', kuerzel: 'S', punkte: rechteckPunkte(10, 0, 2, 2), hoehe: 2 },
        { id: 'c', kuerzel: 'K', punkte: rechteckPunkte(10, 5, 2, 2) },
      ],
    }
    const b = massenberechnung(daten, [{ id: 'b1', kuerzel: 'L' }])
    expect(b.zeilen.map((z) => z.kuerzel)).toEqual(['L', 'S', 'K'])
    expect(b.flaecheSumme).toBe(32)
    expect(b.kubaturSumme).toBe(71.6) // 63,6 + 8, Teil ohne Höhe zählt nicht
    expect(massenZeileText(b.zeilen[0])).toBe('L · 6 × 4 m = 24,00 m² · Satteldach Traufe 2,2 / First 3,1 m · 63,60 m³')
    expect(massenZeileText(b.zeilen[2])).toBe('K · 2 × 2 m = 4,00 m² · Höhe fehlt')
  })

  it('Kürzel: verknüpftes Bauteil gewinnt, sonst das gespeicherte, sonst „?“', () => {
    expect(kuerzelVon({ id: 'a', kuerzel: 'x', bauteilId: 'b', punkte: rechteck }, [{ id: 'b', kuerzel: 'A2' }])).toBe('A2')
    expect(kuerzelVon({ id: 'a', kuerzel: 'S', bauteilId: 'weg', punkte: rechteck }, [])).toBe('S')
    expect(kuerzelVon({ id: 'a', kuerzel: '', punkte: rechteck })).toBe('?')
  })

  it('mehrere Teile eines Bauteils werden zusammengezählt', () => {
    const daten: GrundrissDaten = {
      teile: [
        { id: 'a', kuerzel: 'L', bauteilId: 'b1', punkte: rechteck, hoehe: 2.2 },
        { id: 'b', kuerzel: 'L', bauteilId: 'b1', punkte: rechteckPunkte(4, 0, 2, 3), hoehe: 2.2 },
        { id: 'c', kuerzel: 'S', bauteilId: 'b2', punkte: rechteckPunkte(10, 0, 2, 2.5), hoehe: 2, dachform: 'pult', hoeheOben: 3 },
        { id: 'd', kuerzel: 'frei', punkte: rechteck },
      ],
    }
    const m = massenJeBauteil(daten)
    expect(m).toHaveLength(2)
    const l = m.find((x) => x.bauteilId === 'b1')!
    expect(l.flaeche).toBe(30)
    expect(l.laenge).toBeUndefined() // zwei Teile: keine Länge × Breite
    expect(l.kubaturM3).toBe(66)
    expect(l.hoeheMittel).toBe(2.2)
    const s = m.find((x) => x.bauteilId === 'b2')!
    expect(s).toMatchObject({ flaeche: 5, laenge: 2.5, breite: 2, hoeheMax: 3, kubaturM3: 12.5, hoeheMittel: 2.5 })
  })

  it('fehlt bei einem Teil die Höhe, gibt es für das Bauteil keine Kubatur', () => {
    const m = massenJeBauteil({ teile: [
      { id: 'a', kuerzel: 'L', bauteilId: 'b1', punkte: rechteck, hoehe: 2 },
      { id: 'b', kuerzel: 'L', bauteilId: 'b1', punkte: rechteck },
    ] })
    expect(m[0].flaeche).toBe(48)
    expect(m[0].kubaturM3).toBeUndefined()
  })
})

describe('Maßketten', () => {
  it('ein Rechteck: Länge und Breite, kein Gesamtmaß', () => {
    const m = masskette({ teile: [teil({ punkte: rechteck })] })
    expect(m.map((x) => `${x.art} ${x.text}`)).toEqual(['kette-x 4 m', 'kette-y 6 m'])
    // unter und rechts vom Grundriss
    expect(m[0].von.y).toBeGreaterThan(6)
    expect(m[1].von.x).toBeGreaterThan(4)
  })

  it('zwei angrenzende Teile: Teilstrecken und Gesamtmaß', () => {
    const m = masskette({ teile: [
      teil({ id: 'a', punkte: rechteckPunkte(2, 2, 6, 4) }),
      teil({ id: 'b', punkte: rechteckPunkte(8, 3, 2, 3) }),
    ] })
    const x = m.filter((k) => k.art === 'kette-x').map((k) => k.wert)
    expect(x).toEqual([6, 2])
    expect(m.find((k) => k.art === 'gesamt-x')?.text).toBe('8 m')
    expect(m.filter((k) => k.art === 'kette-y').map((k) => k.wert)).toEqual([1, 3]) // 2 → 3 → 6
    expect(m.find((k) => k.art === 'gesamt-y')?.text).toBe('4 m')
  })

  it('Ecken, die fast übereinander liegen, zählen als eine Stelle', () => {
    const m = masskette({ teile: [
      teil({ id: 'a', punkte: rechteckPunkte(0, 0, 4, 3) }),
      teil({ id: 'b', punkte: rechteckPunkte(4.01, 0, 2, 3) }),
    ] })
    expect(m.filter((k) => k.art === 'kette-x').map((k) => k.wert)).toEqual([4, 2.01])
  })

  it('schräge Kanten bekommen ihr eigenes Maß, außen versetzt', () => {
    const m = masskette({ teile: [teil({ punkte: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] })] })
    const s = m.find((k) => k.art === 'schraeg')!
    expect(s.text).toBe('5 m')
    // außen = von der Dreiecksmitte weg
    expect(s.von.x + s.von.y).toBeGreaterThan(4)
  })

  it('leer: keine Maße', () => {
    expect(masskette({ teile: [] })).toEqual([])
  })
})

describe('Kleinkram', () => {
  it('Zahlen deutsch', () => {
    expect(zahlText(4.5)).toBe('4,5')
    expect(zahlText(3.254)).toBe('3,25')
    expect(meterText(12)).toBe('12 m')
  })

  it('freiesKuerzel', () => {
    expect(freiesKuerzel({ teile: [] })).toBe('L')
    expect(freiesKuerzel({ teile: [teil({ kuerzel: 'L' })] })).toBe('L1')
    expect(freiesKuerzel({ teile: [teil({ kuerzel: 'A1' }), teil({ kuerzel: 'A2' })] }, 'A1')).toBe('A3')
  })
})
