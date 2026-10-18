import { describe, expect, it } from 'vitest'
import { FUNKTIONEN, FUNKTIONS_NAMEN, aufrufZuOperation } from '../chatWerkzeuge'

describe('Function-Declarations', () => {
  it('enthalten alle verlangten Funktionen', () => {
    for (const n of ['hinzufuegen', 'aendern', 'verschieben', 'groesse', 'loeschen', 'beschriften', 'reihe', 'entlangKante', 'neben', 'unter', 'ueber']) {
      expect(FUNKTIONS_NAMEN).toContain(n)
    }
  })

  it('haben Beschreibung, Objekt-Schema und gültige required-Felder', () => {
    for (const f of FUNKTIONEN) {
      expect(f.description.length).toBeGreaterThan(5)
      expect(f.parameters.type).toBe('OBJECT')
      for (const r of f.parameters.required) expect(Object.keys(f.parameters.properties)).toContain(r)
    }
  })

  it('bieten alle Typen inklusive der neuen an', () => {
    const typ = FUNKTIONEN.find((f) => f.name === 'hinzufuegen')!.parameters.properties.typ as { enum: string[] }
    for (const t of ['gegenstand', 'holzpferd', 'schaukel', 'wildling', 'kletterpflanze', 'blumenbeet', 'rasen', 'hecke', 'entfernen']) {
      expect(typ.enum).toContain(t)
    }
  })
})

describe('aufrufZuOperation', () => {
  it('wandelt gültige Aufrufe um', () => {
    expect(aufrufZuOperation({ name: 'hinzufuegen', args: { typ: 'baum', x: 100, y: '200,5' } })).toMatchObject({
      art: 'operation',
      operation: { op: 'hinzufuegen', typ: 'baum', x: 100, y: 200.5 },
    })
    expect(aufrufZuOperation({ name: 'neben', args: { id: 'b2', typ: 'entfernen', seite: 'links', beschriftung: 'Walnuss-Wildling entfernen' } })).toMatchObject({
      operation: { op: 'neben', id: 'b2', seite: 'links' },
    })
    expect(aufrufZuOperation({ name: 'unter', args: { id: 'b2', typ: 'baum' } })).toMatchObject({ operation: { op: 'unter' } })
    expect(aufrufZuOperation({ name: 'reihe', args: { typ: 'beet', anzahl: 3, bereich: { x1: 1, y1: 2, x2: 3, y2: 4 } } })).toMatchObject({
      operation: { op: 'reihe', anzahl: 3, bereich: { x1: 1, y2: 4 } },
    })
    expect(aufrufZuOperation({ name: 'entlangKante', args: { kante: 'rechts', typ: 'hecke' } })).toMatchObject({ operation: { kante: 'rechts' } })
  })

  it('meldet fehlende oder ungültige Argumente statt zu raten', () => {
    expect(aufrufZuOperation({ name: 'hinzufuegen', args: { typ: 'ufo', x: 1, y: 1 } }).art).toBe('fehler')
    expect(aufrufZuOperation({ name: 'hinzufuegen', args: { typ: 'baum' } }).art).toBe('fehler')
    expect(aufrufZuOperation({ name: 'loeschen', args: {} }).art).toBe('fehler')
    expect(aufrufZuOperation({ name: 'reihe', args: { typ: 'beet', anzahl: 3 } }).art).toBe('fehler')
    expect(aufrufZuOperation({ name: 'entlangKante', args: { kante: 'diagonal', typ: 'hecke' } }).art).toBe('fehler')
    expect(aufrufZuOperation({ name: 'verbrenne', args: {} }).art).toBe('fehler')
  })

  it('erkennt hinweis und fertig', () => {
    expect(aufrufZuOperation({ name: 'hinweis', args: { text: 'Welches Beet?' } })).toEqual({ art: 'hinweis', text: 'Welches Beet?' })
    expect(aufrufZuOperation({ name: 'fertig' }).art).toBe('fertig')
  })
})
