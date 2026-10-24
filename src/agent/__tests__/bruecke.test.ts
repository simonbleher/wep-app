// @vitest-environment node
/**
 * `window.wep`: Verfügbarkeit, nur lesend außer dem Skizzen-Vorschlag, keine Netzwerkzugriffe, status() nach
 * Übernehmen/Verwerfen. Testdaten ausschließlich erfunden.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baueSchnittstelle, installiereSchnittstelle, meldeSkizzenQuelle, vorschlagSpeicher } from '../bruecke'
import { BEISPIEL_VORSCHLAG } from './beispiel'

const N = BEISPIEL_VORSCHLAG.elemente.length
import { testWep } from './testwep'

type Fenster = { wep?: unknown }
const fenster: Fenster = {}
beforeEach(() => {
  ;(globalThis as unknown as { window: Fenster }).window = fenster
  delete fenster.wep
  vorschlagSpeicher.zuruecksetzen()
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  vi.restoreAllMocks()
})

describe('window.wep', () => {
  it('ist da, solange ein WEP geöffnet ist, und danach weg', () => {
    const wep = testWep()
    expect(fenster.wep).toBeUndefined()
    const ab = installiereSchnittstelle({ holeWep: () => wep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    const api = fenster.wep as ReturnType<typeof baueSchnittstelle>
    expect(api.version).toBe('wep-schnittstelle/1')
    expect(Object.keys(api).sort()).toEqual(['lesen', 'positionen', 'schema', 'skizze', 'version'])
    expect(Object.keys(api.skizze).sort()).toEqual(['baustein', 'status', 'vorschlagen'])
    expect(Object.keys(api.positionen).sort()).toEqual(['katalogSuchen', 'status', 'vorschlagen'])
    ab()
    expect(fenster.wep).toBeUndefined()
  })

  it('ist eingefroren (Seitenskripte können sie nicht umbiegen)', () => {
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.isFrozen(api.skizze)).toBe(true)
  })

  it('schema() und lesen() ändern nichts am WEP und machen keine Netzwerkzugriffe', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const wep = testWep()
    const vorher = JSON.stringify(wep)
    const api = baueSchnittstelle({ holeWep: () => wep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    api.schema()
    api.lesen()
    api.skizze.status()
    api.skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    expect(JSON.stringify(wep)).toBe(vorher)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('lesen() bezieht sich auf den Stand des geöffneten Skizzen-Reiters', () => {
    const wep = testWep()
    const api = baueSchnittstelle({ holeWep: () => wep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    expect(api.lesen().skizzeGruen.elemente).toHaveLength(1)
    const weg = meldeSkizzenQuelle(() => ({ ...wep.skizze!, elemente: wep.skizze!.elemente.filter((e) => e.ebene === 'grundlage') }))
    expect(api.lesen().skizzeGruen.elemente).toHaveLength(0)
    weg()
    expect(api.lesen().skizzeGruen.elemente).toHaveLength(1)
  })
})

describe('skizze.vorschlagen() und skizze.status()', () => {
  it('gültiger Vorschlag: ok, Zusammenfassung, Skizze wird gezeigt, Vorschlag wartet auf den Nutzer', () => {
    const zeige = vi.fn()
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: zeige, zeigeListe: () => {} })
    expect(api.skizze.status()).toEqual({ offen: false, zustand: 'kein-vorschlag', nr: 0, anzahl: null, modus: null, entschiedenAm: null })
    const r = api.skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    expect(r.ok).toBe(true)
    expect(r.fehler).toEqual([])
    expect(r.anzahl).toBe(N)
    expect(r.zusammenfassung).toMatch(new RegExp(`${N} Elemente`))
    expect(Object.keys(r).sort()).toEqual(['anzahl', 'fehler', 'hinweise', 'ok', 'zusammenfassung'])
    expect(zeige).toHaveBeenCalledTimes(1)
    expect(api.skizze.status()).toMatchObject({ offen: true, zustand: 'offen', nr: 1, anzahl: N, modus: 'ergaenzen', entschiedenAm: null })
    expect(vorschlagSpeicher.schaue().anzeige?.elemente).toHaveLength(N)
  })

  it('ungültiger Vorschlag: Fehler mit Pfad, nichts wird angezeigt, ein offener Vorschlag bleibt', () => {
    const zeige = vi.fn()
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: zeige, zeigeListe: () => {} })
    const r = api.skizze.vorschlagen({ format: 'wep-skizze/2', elemente: [{ typ: 'ellipse', y: 1, breite: 1, hoehe: 1 }] })
    expect(r.ok).toBe(false)
    expect(r.fehler[0].pfad).toBe('elemente[0].x')
    expect(zeige).not.toHaveBeenCalled()
    expect(api.skizze.status().zustand).toBe('kein-vorschlag')
    api.skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    api.skizze.vorschlagen({ format: 'falsch', elemente: [] })
    expect(api.skizze.status()).toMatchObject({ offen: true, nr: 1 })
  })

  it('ein neuer Vorschlag ersetzt den offenen (laufende Nummer steigt)', () => {
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    api.skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    api.skizze.vorschlagen({ format: 'wep-skizze/2', modus: 'gruen-ersetzen', elemente: [{ typ: 'ellipse', x: 5, y: 5, breite: 1, hoehe: 1 }] })
    expect(api.skizze.status()).toMatchObject({ offen: true, nr: 2, anzahl: 1, modus: 'gruen-ersetzen' })
  })

  it('Entscheidung des Nutzers: übernommen bzw. verworfen, mit Zeitpunkt', () => {
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    api.skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    vorschlagSpeicher.entscheide('uebernommen')
    const s = api.skizze.status()
    expect(s).toMatchObject({ offen: false, zustand: 'uebernommen', nr: 1, anzahl: N })
    expect(s.entschiedenAm).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(vorschlagSpeicher.schaue().anzeige).toBeNull()
    api.skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    vorschlagSpeicher.entscheide('verworfen')
    expect(api.skizze.status()).toMatchObject({ offen: false, zustand: 'verworfen', nr: 2 })
    // ohne offenen Vorschlag tut entscheide nichts
    vorschlagSpeicher.entscheide('uebernommen')
    expect(api.skizze.status().zustand).toBe('verworfen')
  })

  it('Rolle „bau“: kein Vorschlag, nichts wird gezeigt', () => {
    const zeige = vi.fn()
    const api = baueSchnittstelle({ holeWep: () => ({ ...testWep(), rolle: 'bau' }), zeigeSkizze: zeige, zeigeListe: () => {} })
    expect(api.skizze.vorschlagen(BEISPIEL_VORSCHLAG).ok).toBe(false)
    expect(zeige).not.toHaveBeenCalled()
  })

  it('Schließen des WEP: ein offener Vorschlag verfällt, ohne dass etwas gespeichert wird', () => {
    const wep = testWep()
    const vorher = JSON.stringify(wep)
    const ab = installiereSchnittstelle({ holeWep: () => wep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    ;(fenster.wep as ReturnType<typeof baueSchnittstelle>).skizze.vorschlagen(BEISPIEL_VORSCHLAG)
    ab()
    expect(vorschlagSpeicher.schaue().anzeige).toBeNull()
    expect(vorschlagSpeicher.schaue().zustand).toBe('kein-vorschlag')
    expect(JSON.stringify(wep)).toBe(vorher)
  })
})
