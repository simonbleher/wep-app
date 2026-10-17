import { describe, it, expect } from 'vitest'
import {
  neuerVerlauf,
  verlaufSchreiben,
  verlaufUndo,
  verlaufRedo,
  kannUndo,
  kannRedo,
} from '../verlauf.js'
import type { SkizzeElement } from '../types.js'

const r1: SkizzeElement = { id: 'r1', typ: 'rechteck', x: 0, y: 0, breite: 10, hoehe: 10 }
const r2: SkizzeElement = { id: 'r2', typ: 'rechteck', x: 20, y: 20, breite: 10, hoehe: 10 }
const r3: SkizzeElement = { id: 'r3', typ: 'rechteck', x: 40, y: 40, breite: 10, hoehe: 10 }

describe('Verlauf – neuerVerlauf', () => {
  it('erzeugt leeren Verlauf', () => {
    const v = neuerVerlauf()
    expect(v.vergangenheit).toHaveLength(0)
    expect(v.zukunft).toHaveLength(0)
  })
})

describe('Verlauf – verlaufSchreiben', () => {
  it('speichert vorherigen Zustand in Vergangenheit', () => {
    const v = neuerVerlauf()
    const v2 = verlaufSchreiben(v, [r1], [r1, r2])
    expect(v2.vergangenheit).toHaveLength(1)
    expect(v2.vergangenheit[0]).toContain(r1)
    expect(v2.zukunft).toHaveLength(0)
  })

  it('löscht Zukunft nach neuem Schreiben', () => {
    let v = neuerVerlauf()
    v = verlaufSchreiben(v, [], [r1])
    v = verlaufSchreiben(v, [r1], [r1, r2])
    const mitZukunft = { ...v, zukunft: [[r3]] }
    const v3 = verlaufSchreiben(mitZukunft, [r1, r2], [r1, r2, r3])
    expect(v3.zukunft).toHaveLength(0)
  })

  it('begrenzt Vergangenheit auf MAX_SCHRITTE', () => {
    let v = neuerVerlauf()
    for (let i = 0; i < 60; i++) {
      v = verlaufSchreiben(v, [r1], [r1])
    }
    expect(v.vergangenheit.length).toBeLessThanOrEqual(50)
  })
})

describe('Verlauf – Undo', () => {
  it('gibt null zurück bei leerem Verlauf', () => {
    const v = neuerVerlauf()
    expect(verlaufUndo(v, [r1])).toBeNull()
  })

  it('stellt vorherigen Zustand wieder her', () => {
    let v = neuerVerlauf()
    v = verlaufSchreiben(v, [], [r1])
    const ergebnis = verlaufUndo(v, [r1])
    expect(ergebnis).not.toBeNull()
    expect(ergebnis!.elemente).toHaveLength(0)
    expect(ergebnis!.verlauf.zukunft).toHaveLength(1)
  })

  it('verschiebt aktuellen Zustand in Zukunft', () => {
    let v = neuerVerlauf()
    v = verlaufSchreiben(v, [], [r1])
    const ergebnis = verlaufUndo(v, [r1])!
    expect(ergebnis.verlauf.zukunft[0]).toContain(r1)
  })
})

describe('Verlauf – Redo', () => {
  it('gibt null zurück bei leerer Zukunft', () => {
    const v = neuerVerlauf()
    expect(verlaufRedo(v, [])).toBeNull()
  })

  it('stellt nächsten Zustand wieder her', () => {
    let v = neuerVerlauf()
    v = verlaufSchreiben(v, [], [r1])
    const nachUndo = verlaufUndo(v, [r1])!
    const nachRedo = verlaufRedo(nachUndo.verlauf, nachUndo.elemente)!
    expect(nachRedo.elemente).toHaveLength(1)
    expect(nachRedo.elemente[0]).toStrictEqual(r1)
  })
})

describe('Verlauf – kannUndo / kannRedo', () => {
  it('kannUndo ist false bei leerem Verlauf', () => {
    expect(kannUndo(neuerVerlauf())).toBe(false)
  })

  it('kannUndo ist true nach Schreiben', () => {
    const v = verlaufSchreiben(neuerVerlauf(), [], [r1])
    expect(kannUndo(v)).toBe(true)
  })

  it('kannRedo ist false bei leerem Verlauf', () => {
    expect(kannRedo(neuerVerlauf())).toBe(false)
  })

  it('kannRedo ist true nach Undo', () => {
    const v = verlaufSchreiben(neuerVerlauf(), [], [r1])
    const { verlauf: nachUndo } = verlaufUndo(v, [r1])!
    expect(kannRedo(nachUndo)).toBe(true)
  })
})
