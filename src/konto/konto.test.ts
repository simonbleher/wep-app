import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  abmelden,
  anmelden,
  aktuellesKonto,
  istAngemeldet,
  kontoVerfuegbar,
  setzeKontoDienst,
  startZustand,
  zugriffstoken,
  type Konto,
  type KontoDienst,
} from './index'
import { leseStartWahl, speichereStartWahl } from './startwahl'

/** Konto-Mock: keine Anmeldung, nur Zustand und Aufrufzähler. */
function mock(opt: { verfuegbar?: boolean; konto?: Konto | null; fehler?: Error } = {}) {
  let konto = opt.konto ?? null
  const aufrufe: string[] = []
  const dienst: KontoDienst = {
    verfuegbar: () => opt.verfuegbar ?? true,
    async anmelden() {
      aufrufe.push('anmelden')
      konto = { name: 'Erika Musterfrau', benutzername: 'erika@example.org' }
    },
    async abmelden() {
      aufrufe.push('abmelden')
      konto = null
    },
    async aktuellesKonto() {
      aufrufe.push('aktuellesKonto')
      if (opt.fehler) throw opt.fehler
      return konto
    },
    async zugriffstoken() {
      if (!konto) throw new Error('Nicht mit OneDrive verbunden')
      return 'TOKEN'
    },
  }
  return { dienst, aufrufe }
}

const erika: Konto = { name: 'Erika Musterfrau', benutzername: 'erika@example.org' }

beforeEach(() => {
  const speicher = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => void speicher.set(k, v),
    removeItem: (k: string) => void speicher.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Konto-Schnittstelle', () => {
  it('reicht anmelden, abmelden, aktuellesKonto, zugriffstoken und istAngemeldet an die Umsetzung durch', async () => {
    const { dienst, aufrufe } = mock()
    setzeKontoDienst(dienst)

    expect(kontoVerfuegbar()).toBe(true)
    expect(await istAngemeldet()).toBe(false)
    await expect(zugriffstoken()).rejects.toThrow('Nicht mit OneDrive verbunden')

    await anmelden()
    expect(await istAngemeldet()).toBe(true)
    expect(await aktuellesKonto()).toEqual(erika)
    expect(await zugriffstoken()).toBe('TOKEN')

    await abmelden()
    expect(await istAngemeldet()).toBe(false)
    expect(aufrufe).toContain('abmelden')
  })
})

describe('Start: Login-Bildschirm und „ohne Konto“', () => {
  it('erster Start (noch keine Wahl, kein Konto) → Login-Bildschirm', async () => {
    setzeKontoDienst(mock().dienst)
    expect(await startZustand()).toEqual({ typ: 'login' })
  })

  it('„ohne Konto“ wird gemerkt: danach direkt starten, ohne das Konto zu fragen', async () => {
    const { dienst, aufrufe } = mock()
    setzeKontoDienst(dienst)
    speichereStartWahl('ohne-konto')

    expect(await startZustand()).toEqual({ typ: 'start', konto: null })
    expect(aufrufe).toEqual([])
  })

  it('mit Konto → direkt starten und merken', async () => {
    setzeKontoDienst(mock({ konto: erika }).dienst)
    expect(await startZustand()).toEqual({ typ: 'start', konto: erika })
    expect(leseStartWahl()).toBe('konto')
  })

  it('früher mit Konto gestartet, jetzt offline und Anmeldedaten nicht lesbar → trotzdem starten', async () => {
    setzeKontoDienst(mock({ fehler: new Error('offline') }).dienst)
    speichereStartWahl('konto')
    expect(await startZustand()).toEqual({ typ: 'start', konto: null })
  })

  it('Anmeldung abgebrochen (Wahl „konto“, aber kein Konto) → wieder Login-Bildschirm', async () => {
    setzeKontoDienst(mock().dienst)
    speichereStartWahl('konto')
    expect(await startZustand()).toEqual({ typ: 'login' })
  })

  it('Anmeldung nicht eingerichtet → direkt starten, kein Login-Bildschirm', async () => {
    setzeKontoDienst(mock({ verfuegbar: false }).dienst)
    expect(await startZustand()).toEqual({ typ: 'start', konto: null })
  })

  it('nach dem Abmelden (Wahl gelöscht) kommt wieder der Login-Bildschirm', async () => {
    setzeKontoDienst(mock({ konto: erika }).dienst)
    await startZustand()
    speichereStartWahl(null)
    await abmelden()
    expect(await startZustand()).toEqual({ typ: 'login' })
  })

  it('spätere Anmeldung nach „ohne Konto“: startet danach mit Konto', async () => {
    const { dienst } = mock()
    setzeKontoDienst(dienst)
    speichereStartWahl('ohne-konto')
    speichereStartWahl('konto') // wie im Profil beim Tippen auf „Anmelden“
    await anmelden()
    expect(await startZustand()).toEqual({ typ: 'start', konto: erika })
  })
})
