// @vitest-environment node
// Beta 4, Paket 3: Zustand des Grundriss-Editors (Rückgängig/Wiederholen) und Einrasten in Metern.
import { describe, expect, it } from 'vitest'
import { grundrissReducer, kannRedo, kannUndo, neuerGrundrissZustand, ZUSAMMENFASSEN_MS, type GrundrissAktion } from '../grundrissZustand'
import { rasteEckeM, rastePunktM, rasteVerschiebungM, zielLinienTeile, RASTER_M } from '../grundrissEinrasten'
import { rechteckPunkte, setzeKantenLaenge, type GrundrissTeil } from '../grundriss'

const t = (id: string, x = 0, y = 0, b = 4, h = 6): GrundrissTeil => ({ id, kuerzel: id, punkte: rechteckPunkte(x, y, b, h) })
const lauf = (aktionen: GrundrissAktion[], start = neuerGrundrissZustand()) => aktionen.reduce(grundrissReducer, start)

describe('Zustand mit Verlauf', () => {
  it('hinzufügen, rückgängig, wiederholen', () => {
    let z = lauf([{ typ: 'hinzufuegen', teil: t('a') }])
    expect(z.teile).toHaveLength(1)
    expect(kannUndo(z)).toBe(true)
    z = grundrissReducer(z, { typ: 'undo' })
    expect(z.teile).toHaveLength(0)
    expect(kannRedo(z)).toBe(true)
    z = grundrissReducer(z, { typ: 'redo' })
    expect(z.teile.map((x) => x.id)).toEqual(['a'])
  })

  it('eine neue Änderung löscht die Wiederholen-Schritte', () => {
    let z = lauf([{ typ: 'hinzufuegen', teil: t('a') }, { typ: 'undo' }])
    z = grundrissReducer(z, { typ: 'hinzufuegen', teil: t('b') })
    expect(kannRedo(z)).toBe(false)
  })

  it('Ziehen: Zwischenstände ohne Schritt, am Ende genau ein Schritt', () => {
    const start = lauf([{ typ: 'hinzufuegen', teil: t('a') }])
    const vorher = start.teile
    let z = start
    for (let i = 1; i <= 5; i++) z = grundrissReducer(z, { typ: 'live', teil: t('a', i, 0) })
    expect(z.vergangenheit).toHaveLength(1) // nur das Hinzufügen
    z = grundrissReducer(z, { typ: 'ziehen-fertig', vorher })
    expect(z.vergangenheit).toHaveLength(2)
    z = grundrissReducer(z, { typ: 'undo' })
    expect(z.teile[0].punkte[0]).toEqual({ x: 0, y: 0 })
  })

  it('Ziehen ohne Bewegung schreibt nichts', () => {
    const start = lauf([{ typ: 'hinzufuegen', teil: t('a') }])
    expect(grundrissReducer(start, { typ: 'ziehen-fertig', vorher: start.teile })).toBe(start)
  })

  it('Eintippen eines Maßes (3 → 3,5 → 4,5) ist ein einziger Schritt', () => {
    let z = lauf([{ typ: 'hinzufuegen', teil: t('a') }])
    const n0 = z.vergangenheit.length
    z = [3, 3.5, 4.5].reduce(
      (zz, v, i) =>
        grundrissReducer(zz, { typ: 'aendern', id: 'a', teil: (x) => ({ ...x, punkte: setzeKantenLaenge(x.punkte, 0, v) }), key: 'kante-0', jetzt: 1000 + i * 200 }),
      z,
    )
    expect(z.vergangenheit.length).toBe(n0 + 1)
    expect(z.teile[0].punkte[1].x).toBe(4.5)
    z = grundrissReducer(z, { typ: 'undo' })
    expect(z.teile[0].punkte[1].x).toBe(4)
  })

  it('nach einer Pause oder bei anderem Feld beginnt ein neuer Schritt', () => {
    let z = lauf([{ typ: 'hinzufuegen', teil: t('a') }])
    z = grundrissReducer(z, { typ: 'aendern', id: 'a', teil: { hoehe: 2 }, key: 'hoehe', jetzt: 1000 })
    z = grundrissReducer(z, { typ: 'aendern', id: 'a', teil: { hoehe: 2.2 }, key: 'hoehe', jetzt: 1000 + ZUSAMMENFASSEN_MS + 1 })
    z = grundrissReducer(z, { typ: 'aendern', id: 'a', teil: { dachform: 'pult' }, key: 'dach', jetzt: 1000 + ZUSAMMENFASSEN_MS + 2 })
    expect(z.vergangenheit).toHaveLength(4)
  })

  it('löschen ist rückgängig zu machen; Verlauf ist begrenzt', () => {
    let z = lauf([{ typ: 'hinzufuegen', teil: t('a') }, { typ: 'loeschen', id: 'a' }])
    expect(z.teile).toHaveLength(0)
    z = grundrissReducer(z, { typ: 'undo' })
    expect(z.teile).toHaveLength(1)
    let viele = neuerGrundrissZustand()
    for (let i = 0; i < 80; i++) viele = grundrissReducer(viele, { typ: 'hinzufuegen', teil: t(`t${i}`) })
    expect(viele.vergangenheit.length).toBeLessThanOrEqual(50)
  })

  it('„setzen“ (von außen) lässt den Verlauf in Ruhe', () => {
    const z = lauf([{ typ: 'hinzufuegen', teil: t('a') }, { typ: 'setzen', teile: [t('x')] }])
    expect(z.teile.map((x) => x.id)).toEqual(['x'])
    expect(z.vergangenheit).toHaveLength(1)
  })
})

describe('Einrasten in Metern', () => {
  const nachbar = [t('n', 5, 2, 3, 3)] // Ecken bei x 5 und 8, y 2 und 5
  const ziele = zielLinienTeile(nachbar)

  it('Zielgeraden sind die Ecken der anderen Teile', () => {
    expect(ziele.xs.sort()).toEqual([5, 8])
    expect(ziele.ys.sort()).toEqual([2, 5])
    expect(zielLinienTeile(nachbar, new Set(['n'])).xs).toEqual([])
  })

  it('Punkt rastet auf die Kante des Nachbarn; sonst auf das 5-cm-Raster', () => {
    const r = rastePunktM({ x: 5.08, y: 9.123 }, ziele, 0.15)
    expect(r.punkt).toEqual({ x: 5, y: 9.1 })
    expect(r.treffer).toEqual({ x: 5, y: undefined })
  })

  it('Ecke einer Form: gerade Richtung bleibt erhalten', () => {
    const r = rasteEckeM({ x: 0, y: 0 }, { x: 3.97, y: 0.12 }, ziele, 0.15)
    expect(r.punkt.y).toBe(0)
    expect(Math.abs(r.punkt.x - 3.95) < 1e-9 || r.punkt.x === 4).toBe(true)
    const diagonal = rasteEckeM({ x: 0, y: 0 }, { x: 2.1, y: 2.0 }, { xs: [], ys: [] }, 0.15)
    expect(diagonal.punkt.x).toBeCloseTo(diagonal.punkt.y, 2)
  })

  it('Verschieben rastet die Ecken des Teils auf die Nachbarkante', () => {
    const teil = rechteckPunkte(0, 0, 4, 6)
    const r = rasteVerschiebungM(teil, 0.96, 2.03, ziele, 0.15) // rechte Kante käme bei 4,96 → 5; obere bei 2,03 → 2
    expect(r.dx).toBe(1)
    expect(r.dy).toBe(2)
    expect(r.treffer).toEqual({ x: 5, y: 2 })
    // ohne Treffer: Raster
    const frei = rasteVerschiebungM(teil, 10.02, 20.07, { xs: [], ys: [] }, 0.15)
    expect(frei.dx).toBe(10)
    expect(frei.dy).toBeCloseTo(20.05, 9)
    expect(RASTER_M).toBe(0.05)
  })
})
