import { describe, expect, it } from 'vitest'
import { hatBauTeil, hatGruenTeil, rolleAusTeilen, wepRolle } from '../types'
import { neuerWepMitProfil } from '@/profil'

describe('Rolle pro WEP', () => {
  it('ohne eigene Einstellung gilt die Rolle aus dem Profil', () => {
    expect(wepRolle({}, 'bau')).toBe('bau')
    expect(wepRolle({ rolle: 'beides' }, 'gruen')).toBe('beides')
  })

  it('Teile je Rolle', () => {
    expect([hatGruenTeil('gruen'), hatBauTeil('gruen')]).toEqual([true, false])
    expect([hatGruenTeil('bau'), hatBauTeil('bau')]).toEqual([false, true])
    expect([hatGruenTeil('beides'), hatBauTeil('beides')]).toEqual([true, true])
  })

  it('Rolle aus den beiden Schaltern', () => {
    expect(rolleAusTeilen(true, true)).toBe('beides')
    expect(rolleAusTeilen(true, false)).toBe('gruen')
    expect(rolleAusTeilen(false, true)).toBe('bau')
  })

  it('Neues WEP: Name des Profils kommt in die Zelle des eigenen Teils', () => {
    const profil = { name: 'Erika Musterfrau', standardAnlage: 'KGA Testhain' }
    const gruen = neuerWepMitProfil('2026-001', { ...profil, rolle: 'gruen' })
    expect([gruen.formalien.wertermittlerAussenAufwuchs, gruen.formalien.wertermittlerBaulichkeiten]).toEqual(['Erika Musterfrau', ''])
    const bau = neuerWepMitProfil('2026-002', { ...profil, rolle: 'bau' })
    expect([bau.formalien.wertermittlerAussenAufwuchs, bau.formalien.wertermittlerBaulichkeiten]).toEqual(['', 'Erika Musterfrau'])
    const beides = neuerWepMitProfil('2026-003', { ...profil, rolle: 'beides' })
    expect(beides.formalien.wertermittlerAussenAufwuchs).toBe('Erika Musterfrau')
    expect(beides.formalien.wertermittlerBaulichkeiten).toBe('Erika Musterfrau')
    expect(beides.rolle).toBeUndefined()
  })
})
