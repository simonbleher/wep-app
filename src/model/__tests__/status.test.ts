import { describe, expect, it } from 'vitest'
import { dupliziereWep, gleicheVorgangsNr, istAlteKennung, neueWepId, neuerWep, vorgangsNrVon, wepName, wepStatus } from '..'
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

  it('kopiert alles, neue Kennung (UUID), Vorgangs-Nr. leer (anderer Vorgang), Status „in Arbeit“', () => {
    const kopie = dupliziereWep(original)
    expect(kopie.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(kopie.formalien.vorgangsNr).toBe('')
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

describe('Kennung und Vorgangs-Nr.', () => {
  it('neueWepId liefert verschiedene UUIDs', () => {
    const a = neueWepId()
    const b = neueWepId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('neues WEP mit UUID hat keine Vorgangs-Nr.; alte Kennung „2026-007“ gilt als Vorgangs-Nr.', () => {
    const neu = neuerWep(neueWepId())
    expect(neu.formalien.vorgangsNr).toBe('')
    expect(vorgangsNrVon(neu)).toBe('')
    expect(wepName({ ...neu, formalien: { ...neu.formalien, parzelle: '42' } })).toBe('WEP ohne Vorgangs-Nr. (Parzelle 42)')
    const alt = neuerWep('2026-007')
    expect(alt.formalien.vorgangsNr).toBe('2026-007')
    expect(vorgangsNrVon({ ...alt, formalien: { ...alt.formalien, vorgangsNr: '' } })).toBe('2026-007')
    expect(istAlteKennung('2026-007')).toBe(true)
    expect(istAlteKennung(neu.id)).toBe(false)
    expect(wepName({ ...neu, formalien: { ...neu.formalien, vorgangsNr: '2026-152' } })).toBe('WEP 2026-152')
  })

  it('gleicheVorgangsNr findet Doppelte (Leerzeichen, Groß-/Kleinschreibung egal), nicht das WEP selbst', () => {
    const a = { ...neuerWep('a-1'), formalien: { ...neuerWep('x').formalien, vorgangsNr: '2026-152' } }
    const b = { ...neuerWep('b-1'), formalien: { ...neuerWep('x').formalien, vorgangsNr: ' 2026-152 ' } }
    expect(gleicheVorgangsNr('2026-152', [a, b], 'a-1').map((w) => w.id)).toEqual(['b-1'])
    expect(gleicheVorgangsNr('', [a, b])).toEqual([])
  })
})
