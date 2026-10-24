// Schuppen und Unterstände werden nicht bewertet, solange es eine Laube gibt; ohne Laube ist der Schuppen die Anlage.
import { describe, expect, it } from 'vitest'
import { berechneBau, hinweiseBauteil } from '..'
import { neuerWep, type Bauteil, type Wep } from '../../model'

const bt = (b: Partial<Bauteil> & Pick<Bauteil, 'id' | 'art' | 'kuerzel'>): Bauteil => ({ flaeche: 0, maengel: [], ...b })
const laube = bt({ id: 'l', art: 'laube', kuerzel: 'L', flaeche: 19.43, typ: 'Doppelwand 8,01 - 10,00 cm', typManuell: true, baujahr: 1982, restnutzungsjahre: 10, rnManuell: true })
const schuppen = bt({ id: 's', art: 'schuppen', kuerzel: 'S1', flaeche: 6.41, typ: 'Doppelwand bis 4,00 cm', typManuell: true, baujahr: 2015, restnutzungsjahre: 15, rnManuell: true })
const keller = bt({ id: 'k', art: 'keller', kuerzel: 'K1', flaeche: 4, typ: 'Stein 10,00 - 12,00 cm', typManuell: true, baujahr: 1990, restnutzungsjahre: 10, rnManuell: true })

function wep(...teile: Bauteil[]): Wep {
  const w = neuerWep('x')
  w.formalien = { ...w.formalien, wertermittlungAm: '2026-10-19' }
  w.bau = { bauteile: teile, abwasser: { art: 'keine', grube: {}, kanal: {} }, nichtBeraeumt: { aktiv: false }, ausstattung: {}, beschreibung: '', beseitigung: [] }
  return w
}

describe('Schuppen und Unterstände neben einer Laube', () => {
  it('werden nicht bewertet: Wert 0, Fläche 0, nicht in Summe und bewerteter Fläche', () => {
    const mit = berechneBau(wep(laube, schuppen))!
    const ohne = berechneBau(wep(laube))!
    expect(mit.schuppen?.wert).toBe(0)
    expect(mit.schuppen?.flaeche).toBe(0)
    expect(mit.schuppen?.nichtBewertetWegenLaube).toBe(true)
    expect(mit.summeBauteile).toBe(ohne.summeBauteile)
    expect(mit.insgesamt).toBe(ohne.insgesamt)
    expect(mit.bewerteteFlaeche).toBe(ohne.bewerteteFlaeche)
  })

  it('ohne Laube ist der Schuppen die einzige Anlage und wird bewertet', () => {
    const e = berechneBau(wep(schuppen))!
    expect(e.schuppen?.nichtBewertetWegenLaube).toBeUndefined()
    expect(e.schuppen?.flaeche).toBe(6.41)
    expect(e.schuppen!.wert).toBeGreaterThan(0)
    expect(e.insgesamt).toBe(e.schuppen!.wert)
  })

  it('ein Keller auf demselben Platz zählt weiter (eigene Regel)', () => {
    const e = berechneBau(wep(laube, keller))!
    expect(e.schuppen?.nichtBewertetWegenLaube).toBeUndefined()
    expect(e.schuppen?.flaeche).toBe(4)
  })

  it('Hinweis am Schuppen erklärt, warum er nicht zählt', () => {
    const w = wep(laube, schuppen)
    const h = hinweiseBauteil(schuppen, berechneBau(w)!)
    expect(h).toHaveLength(1)
    expect(h[0].text).toMatch(/nicht bewertet.*Laube/)
  })
})
