// Gemeinsamer Abgleich von Bau- und Grün-Teil der Bau-Excel: alles wählbar, Rolle wächst mit.
import { beforeAll, describe, expect, it } from 'vitest'
import { leseBauGruen } from '@/export/bauExcelLesen'
import { leseBauTeil } from '@/export/bauTeilLesen'
import { neuerWep, wepRolle } from '@/model'
import { offeneZeilen, pruefeAlles, uebernimmAlles, type BauExcelInhalt, type Liste } from '../uebernahme'
import { erzeugeTestBauExcel } from '../testBauExcel'

let inhalt: BauExcelInhalt
beforeAll(async () => {
  const bytes = await erzeugeTestBauExcel({ bau: true, gruen: true })
  inhalt = { teil: await leseBauTeil(bytes), gruen: await leseBauGruen(bytes) }
})

const alle = (): Set<Liste> => new Set(pruefeAlles(neuerWep('x'), inhalt).map((l) => l.liste))

describe('Bau- und Grün-Teil zusammen', () => {
  it('bietet beide Teile an und übernimmt alles', () => {
    const w = neuerWep('2026-007')
    const ab = pruefeAlles(w, inhalt)
    expect(ab.map((l) => l.liste)).toEqual(['bauteile', 'beschreibung', 'beseitigung', 'nichtBeraeumt', 'abwasser', 'index', 'aussenanlagen', 'aufwuchs', 'beseitigungAA'])
    const neu = uebernimmAlles(w, inhalt, alle())
    expect(neu.bau?.bauteile.length).toBeGreaterThan(0)
    expect(neu.gruen.aussenanlagen).toHaveLength(3)
    expect(neu.gruen.aufwuchs).toHaveLength(4)
    expect(neu.gruen.beseitigungAA).toHaveLength(2)
    expect(offeneZeilen(pruefeAlles(neu, inhalt))).toBe(0)
    expect(uebernimmAlles(neu, inhalt, alle())).toBe(neu) // zweites Mal: nichts doppelt
  })

  it('ein reines Grün-WEP bekommt mit dem Bau-Teil die Rolle „beides“, ein Bau-WEP mit Grün ebenfalls', () => {
    const gruen = { ...neuerWep('g'), rolle: 'gruen' as const }
    expect(wepRolle(uebernimmAlles(gruen, inhalt, new Set<Liste>(['bauteile'])))).toBe('beides')
    expect(wepRolle(uebernimmAlles(gruen, inhalt, new Set<Liste>(['aufwuchs'])))).toBe('gruen')
    const bau = { ...neuerWep('b'), rolle: 'bau' as const }
    expect(wepRolle(uebernimmAlles(bau, inhalt, new Set<Liste>(['aufwuchs'])))).toBe('beides')
    expect(wepRolle(uebernimmAlles(bau, inhalt, new Set<Liste>(['bauteile'])))).toBe('bau')
  })
})
