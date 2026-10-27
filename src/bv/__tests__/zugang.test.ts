// @vitest-environment node
// Zugang zur BV-Kontrollseite (Ziel 4): Was die Seite zeigt – je nach Konfiguration, Anmeldung, Antwort und Netz.
import { describe, expect, it } from 'vitest'
import { OFFLINE_TAGE, entscheide, naechsterGemerkt, offlineGueltig, type ZugangsAntwort } from '../zugang'

const JETZT = Date.parse('2026-10-27T10:00:00.000Z')
const TAG = 24 * 3600_000
const antwort = (status: ZugangsAntwort['status'], admin = false): ZugangsAntwort => ({ status, admin, name: 'Erika Musterfrau', email: 'erika@bv.example' })

describe('Entscheidung', () => {
  it('ohne eingeschaltete Kontrolle (Funktion fehlt oder aus) ist die Seite offen – auch ohne Anmeldung', () => {
    expect(entscheide({ konfig: undefined, angemeldet: false, jetzt: JETZT })).toEqual({ art: 'offen' })
    expect(entscheide({ konfig: { aktiv: false }, angemeldet: false, jetzt: JETZT })).toEqual({ art: 'offen' })
  })

  it('eingeschaltet: anmelden → beantragt / gesperrt / freigegeben (Admin)', () => {
    const k = { aktiv: true }
    expect(entscheide({ konfig: k, angemeldet: false, jetzt: JETZT }).art).toBe('anmelden')
    expect(entscheide({ konfig: k, angemeldet: true, antwort: antwort('beantragt'), jetzt: JETZT })).toMatchObject({ art: 'beantragt', email: 'erika@bv.example' })
    expect(entscheide({ konfig: k, angemeldet: true, antwort: antwort('gesperrt'), jetzt: JETZT }).art).toBe('gesperrt')
    expect(entscheide({ konfig: k, angemeldet: true, antwort: antwort('freigegeben', true), jetzt: JETZT })).toMatchObject({ art: 'freigegeben', admin: true })
    expect(entscheide({ konfig: k, angemeldet: true, antwort: { fehler: 'Anmeldung ungültig: Token abgelaufen' }, jetzt: JETZT })).toEqual({ art: 'fehler', meldung: 'Anmeldung ungültig: Token abgelaufen' })
  })

  it(`offline: bestätigte Freigabe gilt ${OFFLINE_TAGE} Tage, danach Hinweis; ohne bekannte Kontrolle bleibt die Seite offen`, () => {
    const gemerkt = { aktiv: true, email: 'erika@bv.example', admin: false, freigegebenAm: new Date(JETZT - 6 * TAG).toISOString() }
    expect(entscheide({ konfig: 'offline', angemeldet: false, gemerkt, jetzt: JETZT })).toMatchObject({ art: 'freigegeben', offline: true, email: 'erika@bv.example' })
    const alt = { ...gemerkt, freigegebenAm: new Date(JETZT - 8 * TAG).toISOString() }
    expect(entscheide({ konfig: 'offline', angemeldet: false, gemerkt: alt, jetzt: JETZT }).art).toBe('fehler')
    expect(entscheide({ konfig: { aktiv: true }, angemeldet: true, antwort: 'offline', gemerkt, jetzt: JETZT }).art).toBe('freigegeben')
    expect(entscheide({ konfig: 'offline', angemeldet: false, jetzt: JETZT })).toEqual({ art: 'offen' })
    // beantragt (ohne bestätigte Freigabe) öffnet offline nicht
    expect(entscheide({ konfig: 'offline', angemeldet: false, gemerkt: { aktiv: true, email: 'x' }, jetzt: JETZT }).art).toBe('fehler')
    expect(offlineGueltig({ aktiv: true, freigegebenAm: new Date(JETZT + TAG).toISOString() }, JETZT)).toBe(false)
  })
})

describe('Was gemerkt wird', () => {
  it('Freigabe online → neues Datum; offline → unverändert; beantragt/gesperrt → keine Freigabe mehr; offen → nichts', () => {
    const vorher = { aktiv: true, email: 'erika@bv.example', freigegebenAm: new Date(JETZT - 3 * TAG).toISOString() }
    expect(naechsterGemerkt({ art: 'freigegeben', admin: false, name: '', email: 'erika@bv.example' }, vorher, JETZT)).toEqual({ aktiv: true, email: 'erika@bv.example', admin: false, freigegebenAm: new Date(JETZT).toISOString() })
    expect(naechsterGemerkt({ art: 'freigegeben', admin: false, name: '', email: '', offline: true }, vorher, JETZT)).toBe(vorher)
    expect(naechsterGemerkt({ art: 'gesperrt', name: '', email: 'erika@bv.example' }, vorher, JETZT)).toEqual({ aktiv: true, email: 'erika@bv.example' })
    expect(naechsterGemerkt({ art: 'offen' }, vorher, JETZT)).toBeUndefined()
    expect(naechsterGemerkt({ art: 'anmelden' }, vorher, JETZT)).toEqual({ aktiv: true, email: 'erika@bv.example' })
  })
})
