// Nicht geschützte Laub- und Nadelbäume werden immer entfernt (Entscheidung BV 31.10.2026): Hinweis mit Knopf
// zur Vorlage „Baum fällen“ (Art übernommen). Erfundene Daten.
import { describe, expect, it } from 'vitest'
import invasiveRaw from '../../../data/invasive.json'
import problemRaw from '../../../data/problempflanzen.json'
import type { InvasiveListe, ProblempflanzenListe } from '@/katalog'
import { neuerWep, type Position } from '@/model'
import { berechneRegelhinweise } from '../regelhinweise'

const liste = (problemRaw as unknown as ProblempflanzenListe).eintraege
const invasive = (invasiveRaw as unknown as InvasiveListe).arten
const pos = (bezeichnung: string, teil: Partial<Position> = {}): Position => ({
  id: 'p', bezeichnung, anzahl: 1, einheit: 'Stück', zustand: 'gut', einzelpreis: 0, preisManuell: false, hinweise: [], ...teil,
})
const baumHinweis = (p: Position) => berechneRegelhinweise(p, neuerWep('2026-906'), [], invasive, liste).find((h) => h.beseitigung?.baum)

describe('Laub-/Nadelbaum im Aufwuchs', () => {
  it('Freitext „Birke“, „Bergahorn“, „Linde, groß“: Warnung „wird entfernt“ mit Vorschlag „Baum fällen“ und Art', () => {
    for (const [b, art] of [['Birke', 'Birke'], ['Bergahorn', 'Bergahorn'], ['Linde, groß', 'Linde'], ['Robinie', 'Robinie']] as const) {
      const h = baumHinweis(pos(b, { anzahl: 2 }))
      expect(h, b).toBeDefined()
      expect(h!.schwere).toBe('warnung')
      expect(h!.text).toContain('wird entfernt')
      expect(h!.text).toContain('Baum fällen')
      expect(h!.beseitigung).toEqual({ gegenstand: b, einheit: 'Stück', menge: 2, baum: { art } })
    }
  })

  it('große Nadelbäume (S. 17) öffnen ebenfalls „Baum fällen“', () => {
    expect(baumHinweis(pos('Fichte'))?.beseitigung?.baum).toEqual({ art: 'Fichte' })
  })

  it('kein Hinweis bei geschützten Bäumen, Obst, Hecken, Solitär-Nadelgehölz und Sträuchern', () => {
    expect(baumHinweis(pos('Eiche', { katalogId: 'aw-baum-geschuetzt' }))).toBeUndefined()
    expect(baumHinweis(pos('Hainbuche', { katalogId: 'aw-hecke' }))).toBeUndefined()
    for (const b of ['Hainbuchenhecke', 'Fächerahorn', 'Zaubernuss', 'Apfel, Halbstamm, 12 J.', 'Kopfweidenzaun']) expect(baumHinweis(pos(b)), b).toBeUndefined()
  })

  it('nur Hinweis: Position bleibt unverändert', () => {
    const p = pos('Birke', { einzelpreis: 20, preisManuell: true })
    const vorher = JSON.stringify(p)
    baumHinweis(p)
    expect(JSON.stringify(p)).toBe(vorher)
  })
})
