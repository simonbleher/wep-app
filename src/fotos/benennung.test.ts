import { describe, expect, it } from 'vitest'
import { neuerWep, type Foto } from '@/model'
import { dateiNamenTeil, fotoDateiNamen, positionsListe } from './benennung'

const foto = (id: string, zeit: string, positionId?: string): Foto => ({
  id,
  ...(positionId ? { positionId } : {}),
  aufgenommenAm: zeit,
  breite: 1,
  hoehe: 1,
  groesse: 1,
})

function beispiel() {
  const w = neuerWep('2026-007')
  const pos = (id: string, bezeichnung: string) => ({
    id,
    bezeichnung,
    anzahl: 1,
    einheit: 'Stück',
    einzelpreis: 1,
    preisManuell: false,
    hinweise: [],
  })
  w.gruen.aussenanlagen = [pos('a1', 'Weg, Beton'), pos('a2', 'Laube')]
  w.gruen.aufwuchs = [pos('w1', 'Apfelbaum')]
  w.gruen.beseitigungAA = [{ id: 'b1', gegenstand: 'Thuja-Hecke', menge: 1, einheit: 'm', einzelpreis: 1, faktor: 1 }]
  return w
}

describe('Positionsnummern', () => {
  it('laufend: Außenanlagen, dann Aufwuchs, dann Beseitigung', () => {
    expect(positionsListe(beispiel()).map((p) => [p.nr, p.id])).toEqual([
      [1, 'a1'],
      [2, 'a2'],
      [3, 'w1'],
      [4, 'b1'],
    ])
  })
})

describe('Dateinamen beim Export', () => {
  it('Nummer = Positionsnummer, Gesamtansicht = 00', () => {
    const w = beispiel()
    w.fotos = [
      foto('g1', '2026-10-20T08:00:00Z'),
      foto('g2', '2026-10-20T08:01:00Z'),
      foto('x', '2026-10-20T08:02:00Z', 'w1'),
    ]
    expect(fotoDateiNamen(w).map((f) => f.name)).toEqual(['00 Gesamtansicht 1.jpg', '00 Gesamtansicht 2.jpg', '03 Apfelbaum.jpg'])
  })

  it('mehrere Fotos zur selben Position werden durchnummeriert (nach Aufnahmezeit)', () => {
    const w = beispiel()
    w.fotos = [foto('b', '2026-10-20T09:00:00Z', 'w1'), foto('a', '2026-10-20T08:00:00Z', 'w1')]
    const n = fotoDateiNamen(w)
    expect(n.map((f) => [f.foto.id, f.name])).toEqual([
      ['a', '03 Apfelbaum 1.jpg'],
      ['b', '03 Apfelbaum 2.jpg'],
    ])
  })

  it('Namen bleiben eindeutig und sind für Windows/OneDrive gültig', () => {
    const w = beispiel()
    w.gruen.aufwuchs[0].bezeichnung = 'Apfel: 5/30 J. "Halbstamm"?'
    w.fotos = [foto('a', '1', 'w1'), foto('b', '2', 'a1'), foto('c', '3', 'a1')]
    const namen = fotoDateiNamen(w).map((f) => f.name)
    expect(new Set(namen).size).toBe(namen.length)
    for (const n of namen) expect(n).not.toMatch(/[\\/:*?"<>|]/)
    expect(namen).toContain('03 Apfel- 5-30 J. -Halbstamm--.jpg')
  })

  it('Foto einer gelöschten Position landet bei der Gesamtansicht', () => {
    const w = beispiel()
    w.fotos = [foto('a', '1', 'gibt-es-nicht')]
    expect(fotoDateiNamen(w)[0].name).toBe('00 Gesamtansicht 1.jpg')
  })

  it('bei über 99 Positionen dreistellig', () => {
    const w = beispiel()
    for (let i = 0; i < 100; i++) w.gruen.aufwuchs.push({ ...w.gruen.aufwuchs[0], id: `x${i}` })
    w.fotos = [foto('a', '1', 'a1')]
    expect(fotoDateiNamen(w)[0].name).toBe('001 Weg, Beton.jpg')
  })

  it('Dateinamen-Teil: lange und leere Bezeichnungen', () => {
    expect(dateiNamenTeil('x'.repeat(80)).length).toBe(50)
    expect(dateiNamenTeil('   ')).toBe('Position')
    expect(dateiNamenTeil('Gartenhaus.')).toBe('Gartenhaus')
  })
})
