// Formprüfung (functions/_lib/v2/form.ts) für die Maße der Bäume: fehlen dürfen sie, falsch geformt nicht.
import { describe, expect, it } from 'vitest'
import { neuerWep } from '../../../src/model'
import { wepFormFehler } from '../v2/form'

const mit = (aufwuchs: unknown[], beseitigungAA: unknown[] = []) => {
  const w = neuerWep('2026-902') as unknown as { gruen: Record<string, unknown> }
  w.gruen.aufwuchs = aufwuchs
  w.gruen.beseitigungAA = beseitigungAA
  return w
}

describe('Formprüfung: Maße der Bäume', () => {
  it('alte Positionen ohne Maß und neue mit Maß sind gültig', () => {
    expect(wepFormFehler(mit([{ id: 'a', bezeichnung: 'Apfel, Halbstamm, 5–30 J.' }], [{ id: 'b', gegenstand: 'Knöterich' }]))).toBeUndefined()
    expect(wepFormFehler(mit([{ id: 'a', baumform: 'Halbstamm', alterJahre: 12 }], [{ id: 'b', baum: { art: 'Birke', stammumfangCm: 84.8, durchmesserCm: 27 }, preisManuell: false }]))).toBeUndefined()
    expect(wepFormFehler(mit([{ id: 'a', baumform: 'Halbstamm' }], [{ id: 'b', baum: {} }]))).toBeUndefined()
  })

  it('falsche Form wird abgelehnt', () => {
    expect(wepFormFehler(mit([{ id: 'a', alterJahre: '12' }]))).toMatch(/aufwuchs.*Maß/)
    expect(wepFormFehler(mit([{ id: 'a', alterJahre: -1 }]))).toMatch(/Maß/)
    expect(wepFormFehler(mit([], [{ id: 'b', baum: 'gross' }]))).toMatch(/beseitigungAA.*Maß/)
    expect(wepFormFehler(mit([], [{ id: 'b', baum: { stammumfangCm: '85' } }]))).toMatch(/Maß/)
    expect(wepFormFehler(mit([], [{ id: 'b', preisManuell: 'ja' }]))).toMatch(/Maß/)
  })
})
