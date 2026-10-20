import { describe, expect, it } from 'vitest'
import { dupliziereWep, naechsteVorgangsNr, neuerWep, wepStatus } from '..'
import { entpacke, verpacke } from '@/sync/engine'

describe('Status je WEP', () => {
  it('ohne Angabe gilt „in Arbeit“ (ältere WEPs)', () => {
    expect(wepStatus(neuerWep('2026-001'))).toBe('in Arbeit')
    expect(wepStatus({ status: 'fertig' })).toBe('fertig')
  })

  it('reist mit dem WEP durch den OneDrive-Abgleich', () => {
    const wep = { ...neuerWep('2026-001'), status: 'exportiert' as const }
    const zurueck = entpacke(verpacke(wep, '2026-10-20T10:00:00.000Z', 'test')).wep
    expect(wepStatus(zurueck)).toBe('exportiert')
  })
})

describe('Duplizieren', () => {
  const original = neuerWep('2026-001')
  original.status = 'exportiert'
  original.formalien.kleingartenanlage = 'Muster-Anlage'
  original.formalien.unterpaechter = 'Erika Musterfrau'
  original.gruen.beschreibungAussen = 'Laube mit Terrasse'
  original.gruen.aufwuchs = [
    { id: 'p1', bezeichnung: 'Rasen', anzahl: 20, einheit: 'm²', zustand: 'gut', einzelpreis: 0.38, preisManuell: false, hinweise: [] },
  ]
  original.gruen.beseitigungAA = [{ id: 'b1', gegenstand: 'Schuppen', menge: 1, einheit: 'Stück', einzelpreis: 100, faktor: 1 }]
  original.skizze = { elemente: [] } as unknown as typeof original.skizze

  it('kopiert alles, vergibt neue Vorgangs-Nr. und Status „in Arbeit“', () => {
    const kopie = dupliziereWep(original, '2026-002')
    expect(kopie.id).toBe('2026-002')
    expect(kopie.formalien.vorgangsNr).toBe('2026-002')
    expect(kopie.status).toBe('in Arbeit')
    expect(kopie.formalien.unterpaechter).toBe('Erika Musterfrau')
    expect(kopie.gruen).toEqual(original.gruen)
    expect(kopie.skizze).toEqual(original.skizze)
  })

  it('ist unabhängig vom Original (tiefe Kopie)', () => {
    const kopie = dupliziereWep(original, '2026-002')
    kopie.gruen.aufwuchs[0].anzahl = 99
    kopie.formalien.parzelle = '7'
    expect(original.gruen.aufwuchs[0].anzahl).toBe(20)
    expect(original.formalien.parzelle).toBe('')
    expect(original.status).toBe('exportiert')
    expect(original.id).toBe('2026-001')
  })
})

describe('naechsteVorgangsNr', () => {
  it('zählt je Jahr weiter', () => {
    expect(naechsteVorgangsNr([], 2026)).toBe('2026-001')
    expect(naechsteVorgangsNr([{ id: '2026-001' }, { id: '2026-007' }, { id: '2025-099' }], 2026)).toBe('2026-008')
  })
})
