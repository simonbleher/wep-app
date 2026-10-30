// Sicherheitsprüfung v2 (docs/SICHERHEITSPRUEFUNG-V2.md): Jede Route unter /api/v2 mit jeder Rolle und jedem Zustand,
// IDs austauschen (IDOR), Teile-Grenzen Bau/Grün, Herkunft (CSRF), CORS, gesperrte Konten.
// Tests mit „Fund …“ im Namen zeigen einen Fund aus dem Bericht. Offene Funde (mittel/niedrig, Simon entscheidet) stehen
// als `it.fails`: Der Test beschreibt das sichere Verhalten und schlägt heute fehl. Wird der Fund behoben, meldet vitest
// den Test als „unerwartet bestanden“ – dann aus `it.fails` ein `it` machen.
// Alle Konten, Namen und WEPs sind erfunden.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { neuerWep } from '../../../src/model'
import type { Wep } from '../../../src/model/types'
import type { Jwk } from '../idToken'
import type { DbAnweisung } from '../v2/db'
import { testDb } from './sqliteDb'
import { fakeR2 } from './fakeR2'
import type { Konto, Rolle } from '../v2/konten'
import { adminWarnungen, kontoZurAnmeldung } from '../v2/konten'
import { GRENZEN, zuViele } from '../v2/begrenzung'
import { ANMELDEFEHLER_TEXT, anmeldeFehlerText } from '../../../src/server/anmeldeFehler'
import { onRequestPost as appToken } from '../../api/v2/anmeldung/app/token'
import { ANMELDUNG_COOKIE, cookie, kontoDerSitzung, neueSitzung, SITZUNG_COOKIE } from '../v2/sitzung'
import { erstelleAppCode, loeseAppCodeEin, RUECKSPRUNG_ANDROID } from '../v2/appAnmeldung'
import { pruefeAnmeldeToken, sha256b64url } from '../v2/oidc'
import { onRequest as middleware } from '../../api/v2/_middleware'
import { onRequestGet as status } from '../../api/v2/status'
import { onRequestGet as ich, onRequestPatch as ichAendern } from '../../api/v2/ich'
import { onRequestDelete as sitzungBeenden, onRequestGet as sitzungen } from '../../api/v2/ich/sitzungen'
import { onRequestPost as abmelden } from '../../api/v2/abmelden'
import { onRequestGet as kontenListe } from '../../api/v2/admin/konten'
import { onRequestPost as kontoAktion } from '../../api/v2/admin/konten/[id]'
import { onRequestGet as gruenListe } from '../../api/v2/konten/gruen'
import { onRequestGet as benachrichtigungen } from '../../api/v2/benachrichtigungen'
import { onRequestPost as gelesen } from '../../api/v2/benachrichtigungen/gelesen'
import { onRequestGet as wepListe } from '../../api/v2/weps'
import { onRequestDelete as wepLoeschen, onRequestGet as wepHolen, onRequestPut as wepSpeichern } from '../../api/v2/weps/[id]'
import { onRequestPost as aktion } from '../../api/v2/weps/[id]/aktion'
import { onRequestGet as dateiListe } from '../../api/v2/weps/[id]/dateien'
import { onRequestDelete as dateiLoeschen, onRequestGet as dateiHolen, onRequestPut as dateiHochladen } from '../../api/v2/weps/[id]/dateien/[datei]'
import { onRequestGet as verlauf } from '../../api/v2/weps/[id]/verlauf'
import { onRequestPost as wiederherstellen } from '../../api/v2/weps/[id]/wiederherstellen'
import { onRequestPost as zusammenfuehren } from '../../api/v2/weps/[id]/zusammenfuehren'
import { onRequestPost as zuruecknehmen } from '../../api/v2/weps/[id]/zusammenfuehren-zuruecknehmen'
import { onRequestGet as anmeldungStart } from '../../api/v2/anmeldung/[anbieter]/start'
import { onRequestGet as anmeldungZurueck } from '../../api/v2/anmeldung/[anbieter]/zurueck'
import { sendeMail } from '../v2/benachrichtigungen'

const ORIGIN = 'https://wep-pankow.pages.dev'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const JPEG_BOESE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 6, 6, 6])
const ZEIT = '2026-10-28T08:00:00.000Z'

type Env = { SERVER_MODUS: string; WEP_DB: ReturnType<typeof testDb>; WEP_DATEIEN: ReturnType<typeof fakeR2>; [k: string]: unknown }
type Handler = (ctx: { request: Request; env: Env; params: Record<string, string>; waitUntil?: (p: Promise<unknown>) => void }) => Promise<Response>

function anlegen(db: ReturnType<typeof testDb>, id: string, rollen: Rolle[], status: Konto['status'] = 'freigegeben'): Konto {
  db.roh
    .prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?)")
    .run(id, id, `${id}@example.org`, `Test ${id}`, status, rollen.join(','), ZEIT, ZEIT)
  return { id, anbieter: 'google', email: `${id}@example.org`, name: `Test ${id}`, status, rollen, mailBenachrichtigung: true, erstelltAm: ZEIT, geaendertAm: ZEIT }
}

/** Bau-WEP mit einem Bau-Foto (ohne Position) und einer Grün-Position samt Foto. */
function bauWep(id: string): Wep {
  const w = neuerWep(id)
  w.formalien.unterpaechter = 'Erika Musterfrau'
  w.gruen.aussenanlagen = [{ id: 'p1', bezeichnung: 'Weg', anzahl: 1, einheit: 'm²', einzelpreis: 10, preisManuell: false, hinweise: [] }]
  w.fotos = [
    { id: 'bf1', aufgenommenAm: ZEIT, breite: 1, hoehe: 1, groesse: 7 },
    { id: 'gf1', positionId: 'p1', aufgenommenAm: ZEIT, breite: 1, hoehe: 1, groesse: 7 },
  ]
  w.bau = { baulichkeiten: [{ id: 'l1', bezeichnung: 'Laube' }] } as unknown as Wep['bau']
  return w
}

async function aufbau() {
  const db = testDb()
  const r2 = fakeR2()
  const env: Env = { SERVER_MODUS: 'true', WEP_DB: db, WEP_DATEIEN: r2 }
  const k = {
    bau: anlegen(db, 'bau', ['bau']),
    bau2: anlegen(db, 'bau2', ['bau']),
    gruen: anlegen(db, 'gruen', ['gruen']),
    gruen2: anlegen(db, 'gruen2', ['gruen']),
    bv: anlegen(db, 'bv', ['bv']),
    admin: anlegen(db, 'admin', ['admin']),
    wartet: anlegen(db, 'wartet', [], 'wartet'),
    gesperrt: anlegen(db, 'gesperrt', ['bau'], 'gesperrt'),
  }
  const cookies = new Map<string, string>()
  for (const konto of Object.values(k)) cookies.set(konto.id, (await neueSitzung(db, konto.id)).cookie.split(';')[0])

  /** Anfrage an einen Endpunkt als Konto (null = abgemeldet). */
  const ruf = async (h: Handler, methode: string, pfad: string, wer: Konto | null, opt: { body?: unknown; params?: Record<string, string>; kopf?: Record<string, string> } = {}) => {
    const roh = opt.body instanceof Uint8Array
    const request = new Request(`${ORIGIN}${pfad}`, {
      method: methode,
      headers: { origin: ORIGIN, ...(wer ? { cookie: cookies.get(wer.id)! } : {}), ...(opt.body !== undefined && !roh ? { 'content-type': 'application/json' } : {}), ...opt.kopf },
      ...(opt.body !== undefined ? { body: roh ? (opt.body as Uint8Array) : JSON.stringify(opt.body) } : {}),
    })
    return h({ request, env, params: opt.params ?? {} })
  }
  const rev = async (id: string) => (await db.prepare('SELECT rev FROM weps WHERE id = ?').bind(id).first<{ rev: number }>())!.rev
  const p = (id: string, datei?: string) => (datei ? { id, datei } : { id })

  // Bau legt w1 an, lädt beide Fotos hoch und gibt an Grün ab
  expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.bau, { body: { wep: bauWep('w1'), basisRev: 0 }, params: p('w1') })).status).toBe(200)
  for (const f of ['bf1', 'gf1']) expect((await ruf(dateiHochladen, 'PUT', `/api/v2/weps/w1/dateien/foto-${f}.jpg`, k.bau, { body: JPEG, params: p('w1', `foto-${f}.jpg`) })).status).toBe(200)
  const abgabe = async (id: string, wer: Konto, body: Record<string, unknown>) => ruf(aktion, 'POST', `/api/v2/weps/${id}/aktion`, wer, { body: { ...body, basisRev: await rev(id) }, params: p(id) })
  return { db, r2, env, k, ruf, rev, p, abgabe }
}

describe('Fund H1: Grün darf Bau-Fotos in R2 weder überschreiben noch löschen', () => {
  it('Grün: Foto des Bau-Teils überschreiben und löschen wird abgelehnt, eigene und neue Fotos gehen', async () => {
    const { r2, k, ruf, p, abgabe } = await aufbau()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)

    // Angriff: Datei eines Bau-Fotos (ohne Position) austauschen bzw. entfernen
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-bf1.jpg', k.gruen, { body: JPEG_BOESE, params: p('w1', 'foto-bf1.jpg') })).status).toBe(403)
    expect((await ruf(dateiLoeschen, 'DELETE', '/api/v2/weps/w1/dateien/foto-bf1.jpg', k.gruen, { params: p('w1', 'foto-bf1.jpg') })).status).toBe(403)
    expect(r2.daten.get('weps/w1/fotos/bf1.jpg')?.bytes).toEqual(JPEG)

    // Erlaubt: Foto an einer Grün-Position und ein neues Foto (noch nicht im WEP)
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-gf1.jpg', k.gruen, { body: JPEG_BOESE, params: p('w1', 'foto-gf1.jpg') })).status).toBe(200)
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-neu1.jpg', k.gruen, { body: JPEG, params: p('w1', 'foto-neu1.jpg') })).status).toBe(200)
    expect((await ruf(dateiLoeschen, 'DELETE', '/api/v2/weps/w1/dateien/foto-gf1.jpg', k.gruen, { params: p('w1', 'foto-gf1.jpg') })).status).toBe(200)
    // Bau-Excel bleibt Bau vorbehalten
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/bau.xlsx', k.gruen, { body: new Uint8Array([0x50, 0x4b, 3, 4]), params: p('w1', 'bau.xlsx') })).status).toBe(403)
  })

  it('Grün fügt ein Foto ohne Position hinzu (zählt dann zum Bau-Teil): die fehlende Datei darf Grün einmal hochladen', async () => {
    const { r2, k, ruf, p, rev, abgabe } = await aufbau()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    const w = bauWep('w1')
    w.fotos!.push({ id: 'allg1', aufgenommenAm: ZEIT, breite: 1, hoehe: 1, groesse: 7 })
    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.gruen, { params: p('w1'), body: { wep: w, basisRev: await rev('w1') } })).status).toBe(200)
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-allg1.jpg', k.gruen, { body: JPEG, params: p('w1', 'foto-allg1.jpg') })).status).toBe(200)
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-allg1.jpg', k.gruen, { body: JPEG_BOESE, params: p('w1', 'foto-allg1.jpg') })).status).toBe(403)
    expect((await ruf(dateiLoeschen, 'DELETE', '/api/v2/weps/w1/dateien/foto-allg1.jpg', k.gruen, { params: p('w1', 'foto-allg1.jpg') })).status).toBe(403)
    expect(r2.daten.get('weps/w1/fotos/allg1.jpg')?.bytes).toEqual(JPEG)
  })

  it('Bau, solange noch kein Grün beteiligt ist: alle Fotos (auch an Grün-Positionen) wie bisher', async () => {
    const { k, ruf, p } = await aufbau()
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-gf1.jpg', k.bau, { body: JPEG, params: p('w1', 'foto-gf1.jpg') })).status).toBe(200)
    expect((await ruf(dateiLoeschen, 'DELETE', '/api/v2/weps/w1/dateien/foto-bf1.jpg', k.bau, { params: p('w1', 'foto-bf1.jpg') })).status).toBe(200)
  })
})

describe('Rechte je Route, Rolle und Zustand (geprüft, in Ordnung)', () => {
  it('abgemeldet → 401; wartend/gesperrt → 403 auf allen Routen mit freigegebenem Konto', async () => {
    const { k, ruf, p } = await aufbau()
    const routen: [Handler, string, string, Record<string, string>, unknown?][] = [
      [wepListe, 'GET', '/api/v2/weps', {}],
      [wepHolen, 'GET', '/api/v2/weps/w1', p('w1')],
      [wepSpeichern, 'PUT', '/api/v2/weps/w9', p('w9'), { wep: neuerWep('w9'), basisRev: 0 }],
      [wepLoeschen, 'DELETE', '/api/v2/weps/w1', p('w1'), { basisRev: 1 }],
      [aktion, 'POST', '/api/v2/weps/w1/aktion', p('w1'), { aktion: 'an_bv', basisRev: 1 }],
      [verlauf, 'GET', '/api/v2/weps/w1/verlauf', p('w1')],
      [dateiListe, 'GET', '/api/v2/weps/w1/dateien', p('w1')],
      [dateiHolen, 'GET', '/api/v2/weps/w1/dateien/foto-bf1.jpg', p('w1', 'foto-bf1.jpg')],
      [dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-x.jpg', p('w1', 'foto-x.jpg'), JPEG],
      [dateiLoeschen, 'DELETE', '/api/v2/weps/w1/dateien/foto-bf1.jpg', p('w1', 'foto-bf1.jpg')],
      [wiederherstellen, 'POST', '/api/v2/weps/w1/wiederherstellen', p('w1')],
      [zusammenfuehren, 'POST', '/api/v2/weps/w1/zusammenfuehren', p('w1'), { aus: 'x', basisRev: 1 }],
      [zuruecknehmen, 'POST', '/api/v2/weps/w1/zusammenfuehren-zuruecknehmen', p('w1'), { basisRev: 1 }],
      [benachrichtigungen, 'GET', '/api/v2/benachrichtigungen', {}],
      [gelesen, 'POST', '/api/v2/benachrichtigungen/gelesen', {}, {}],
      [gruenListe, 'GET', '/api/v2/konten/gruen', {}],
      [kontenListe, 'GET', '/api/v2/admin/konten', {}],
      [kontoAktion, 'POST', '/api/v2/admin/konten/bau', p('bau'), { aktion: 'sperren' }],
      [ichAendern, 'PATCH', '/api/v2/ich', {}, { mailBenachrichtigung: false }],
    ]
    for (const [h, m, pfad, params, body] of routen) {
      expect([pfad, m, 'abgemeldet', (await ruf(h, m, pfad, null, { params, body })).status]).toEqual([pfad, m, 'abgemeldet', 401])
      expect([pfad, m, 'wartet', (await ruf(h, m, pfad, k.wartet, { params, body })).status]).toEqual([pfad, m, 'wartet', 403])
      expect([pfad, m, 'gesperrt', (await ruf(h, m, pfad, k.gesperrt, { params, body })).status]).toEqual([pfad, m, 'gesperrt', 403])
    }
    // Ohne Anmeldung gibt es auch keine Sitzungsliste und kein Konto
    expect((await ruf(ich, 'GET', '/api/v2/ich', null)).status).toBe(401)
    expect((await ruf(sitzungen, 'GET', '/api/v2/ich/sitzungen', null)).status).toBe(401)
    expect((await ruf(sitzungBeenden, 'DELETE', '/api/v2/ich/sitzungen?id=AAAAAAAAAAAAAAAA', null)).status).toBe(401)
  })

  it('IDOR: fremde Konten (Bau, Grün, BV und Admin vor der Abgabe) sehen und ändern das WEP nicht', async () => {
    const { k, ruf, p, rev } = await aufbau()
    for (const wer of [k.bau2, k.gruen, k.gruen2, k.bv, k.admin]) {
      expect((await ruf(wepHolen, 'GET', '/api/v2/weps/w1', wer, { params: p('w1') })).status).toBe(404)
      expect((await ruf(verlauf, 'GET', '/api/v2/weps/w1/verlauf', wer, { params: p('w1') })).status).toBe(404)
      expect((await ruf(dateiListe, 'GET', '/api/v2/weps/w1/dateien', wer, { params: p('w1') })).status).toBe(404)
      expect((await ruf(dateiHolen, 'GET', '/api/v2/weps/w1/dateien/foto-bf1.jpg', wer, { params: p('w1', 'foto-bf1.jpg') })).status).toBe(404)
      expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', wer, { params: p('w1'), body: { wep: neuerWep('w1'), basisRev: await rev('w1') } })).status).toBe(404)
      expect((await ruf(wepLoeschen, 'DELETE', '/api/v2/weps/w1', wer, { params: p('w1'), body: { basisRev: await rev('w1') } })).status).toBe(404)
      expect((await ruf(aktion, 'POST', '/api/v2/weps/w1/aktion', wer, { params: p('w1'), body: { aktion: 'an_gruen', gruenKonto: 'gruen', basisRev: await rev('w1') } })).status).toBe(404)
      const liste = (await (await ruf(wepListe, 'GET', '/api/v2/weps', wer)).json()) as { weps: { id: string }[] }
      expect(liste.weps.map((w) => w.id)).not.toContain('w1')
    }
  })

  it('Grün schreibt nur den Grün-Teil; Bau schreibt nach der Abgabe nicht mehr; Löschen nur durch den Besitzer', async () => {
    const { db, k, ruf, p, rev, abgabe } = await aufbau()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    const boese = bauWep('w1')
    boese.formalien.unterpaechter = 'Geändert von Grün'
    boese.bau = undefined
    boese.fotos = boese.fotos!.filter((f) => f.id !== 'bf1')
    boese.gruen.beschreibungAussen = 'Grün-Text'
    const r = await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.gruen, { params: p('w1'), body: { wep: { ...boese, ablauf: { zustand: 'geprueft' } }, basisRev: await rev('w1') } })
    expect(r.status).toBe(200)
    const gespeichert = JSON.parse((await db.prepare('SELECT daten FROM weps WHERE id = ?').bind('w1').first<{ daten: string }>())!.daten) as Wep
    expect(gespeichert.formalien.unterpaechter).toBe('Erika Musterfrau')
    expect(gespeichert.bau).toBeTruthy()
    expect(gespeichert.fotos?.map((f) => f.id)).toContain('bf1')
    expect(gespeichert.gruen.beschreibungAussen).toBe('Grün-Text')
    expect((gespeichert as Wep & { ablauf?: unknown }).ablauf).toBeUndefined()

    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.bau, { params: p('w1'), body: { wep: bauWep('w1'), basisRev: await rev('w1') } })).status).toBe(403)
    expect((await ruf(wepLoeschen, 'DELETE', '/api/v2/weps/w1', k.bau, { params: p('w1'), body: { basisRev: await rev('w1') } })).status).toBe(403)
    expect((await ruf(wepLoeschen, 'DELETE', '/api/v2/weps/w1', k.gruen, { params: p('w1'), body: { basisRev: await rev('w1') } })).status).toBe(403)
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-bf1.jpg', k.bau, { body: JPEG_BOESE, params: p('w1', 'foto-bf1.jpg') })).status).toBe(403)
    // Bau darf noch lesen
    expect((await ruf(wepHolen, 'GET', '/api/v2/weps/w1', k.bau, { params: p('w1') })).status).toBe(200)
  })

  it('Ablauf: nur BV fragt zurück und prüft, nur BV/Admin öffnen wieder; nach der Abgabe schreibt niemand', async () => {
    const { k, ruf, p, abgabe } = await aufbau()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    expect((await abgabe('w1', k.gruen, { aktion: 'an_bv' })).status).toBe(200)
    for (const wer of [k.bau, k.gruen, k.admin]) {
      expect((await abgabe('w1', wer, { aktion: 'rueckfrage', an: 'bau', notiz: 'x' })).status).toBe(403)
      expect((await abgabe('w1', wer, { aktion: 'geprueft' })).status).toBe(403)
    }
    for (const wer of [k.bau, k.gruen, k.bv]) {
      expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', wer, { params: p('w1'), body: { wep: bauWep('w1'), basisRev: 3 } })).status).toBe(403)
    }
    expect((await ruf(wepHolen, 'GET', '/api/v2/weps/w1', k.bv, { params: p('w1') })).status).toBe(200)
    expect((await abgabe('w1', k.bv, { aktion: 'geprueft' })).status).toBe(200)
    for (const wer of [k.bau, k.gruen, k.bau2]) expect((await abgabe('w1', wer, { aktion: 'wiederoeffnen', begruendung: 'x' })).status).toBe(wer === k.bau2 ? 404 : 403)
    expect((await abgabe('w1', k.admin, { aktion: 'wiederoeffnen', begruendung: '' })).status).toBe(400)
    expect((await abgabe('w1', k.admin, { aktion: 'wiederoeffnen', begruendung: 'Tippfehler' })).status).toBe(200)
    // Rückfrage an Bau: Grün darf jetzt nicht schreiben
    expect((await abgabe('w1', k.bv, { aktion: 'rueckfrage', an: 'bau', notiz: 'Laube fehlt' })).status).toBe(200)
    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.gruen, { params: p('w1'), body: { wep: bauWep('w1'), basisRev: 7 } })).status).toBe(403)
  })

  it('Zusammenführen nur mit eigenem Grün-WEP und nur durch das Grün-Konto, an das abgegeben wurde', async () => {
    const { k, ruf, p, rev, abgabe } = await aufbau()
    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/g1', k.gruen, { params: p('g1'), body: { wep: neuerWep('g1'), basisRev: 0 } })).status).toBe(200)
    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/g2', k.gruen2, { params: p('g2'), body: { wep: neuerWep('g2'), basisRev: 0 } })).status).toBe(200)
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    const zf = async (wer: Konto, aus: string) => ruf(zusammenfuehren, 'POST', '/api/v2/weps/w1/zusammenfuehren', wer, { params: p('w1'), body: { aus, wep: bauWep('w1'), felder: [], basisRev: await rev('w1') } })
    expect((await zf(k.gruen, 'g2')).status).toBe(404) // fremdes Grün-WEP
    expect((await zf(k.gruen2, 'g2')).status).toBe(404) // Bau-WEP nicht an gruen2 abgegeben
    expect((await zf(k.bau, 'g1')).status).toBe(403) // keine Grün-Rolle
    expect((await zf(k.gruen, 'w1')).status).toBe(403) // Bau-WEP ist kein eigenes Grün-WEP
    expect((await zf(k.gruen, 'g1')).status).toBe(200)
    expect((await ruf(zuruecknehmen, 'POST', '/api/v2/weps/w1/zusammenfuehren-zuruecknehmen', k.gruen2, { params: p('w1'), body: { basisRev: await rev('w1') } })).status).toBe(404)
    // Eigenes Grün-WEP bleibt für Bau unsichtbar
    expect((await ruf(wepHolen, 'GET', '/api/v2/weps/g2', k.bau, { params: p('g2') })).status).toBe(404)
  })

  it('Admin-Endpunkte nur mit Admin; die eigene Rolle lässt sich nicht selbst setzen', async () => {
    const { db, k, ruf, p } = await aufbau()
    for (const wer of [k.bau, k.gruen, k.bv]) {
      expect((await ruf(kontenListe, 'GET', '/api/v2/admin/konten', wer)).status).toBe(403)
      expect((await ruf(kontoAktion, 'POST', `/api/v2/admin/konten/${wer.id}`, wer, { params: p(wer.id), body: { aktion: 'rollen', rollen: ['admin'] } })).status).toBe(403)
    }
    const r = await ruf(ichAendern, 'PATCH', '/api/v2/ich', k.bau, { body: { mailBenachrichtigung: false, rollen: ['admin'], status: 'freigegeben' } })
    expect(r.status).toBe(200)
    expect((await db.prepare("SELECT rollen FROM konten WHERE id = 'bau'").first<{ rollen: string }>())!.rollen).toBe('bau')
    expect((await ruf(gruenListe, 'GET', '/api/v2/konten/gruen', k.gruen)).status).toBe(403)
  })

  it('Benachrichtigungen: fremde lassen sich nicht als gelesen markieren und erscheinen nicht in der eigenen Liste', async () => {
    const { db, k, ruf, abgabe } = await aufbau()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    const b = await db.prepare("SELECT id FROM benachrichtigungen WHERE konto_id = 'gruen'").first<{ id: number }>()
    expect(b).toBeTruthy()
    expect((await ruf(gelesen, 'POST', '/api/v2/benachrichtigungen/gelesen', k.bau2, { body: { ids: [b!.id] } })).status).toBe(200)
    expect((await db.prepare('SELECT gelesen_am FROM benachrichtigungen WHERE id = ?').bind(b!.id).first<{ gelesen_am: string | null }>())!.gelesen_am).toBeNull()
    const liste = (await (await ruf(benachrichtigungen, 'GET', '/api/v2/benachrichtigungen', k.bau2)).json()) as { benachrichtigungen: unknown[] }
    expect(liste.benachrichtigungen).toEqual([])
  })

  it('Gesperrtes Konto verliert sofort den Zugriff (Sitzungen weg, Status je Anfrage geprüft)', async () => {
    const { db, k, ruf, p } = await aufbau()
    expect((await ruf(kontoAktion, 'POST', '/api/v2/admin/konten/bau', k.admin, { params: p('bau'), body: { aktion: 'sperren' } })).status).toBe(200)
    expect((await ruf(wepHolen, 'GET', '/api/v2/weps/w1', k.bau, { params: p('w1') })).status).toBe(401)
    // auch ohne gelöschte Sitzung: Statusprüfung bei jeder Anfrage
    db.roh.prepare("UPDATE konten SET status = 'gesperrt' WHERE id = 'gruen'").run()
    expect((await ruf(wepListe, 'GET', '/api/v2/weps', k.gruen)).status).toBe(403)
  })
})

describe('Herkunft, CORS, Sitzung (geprüft, in Ordnung)', () => {
  it('schreibende Anfragen von fremder Seite oder ohne Origin → 403', async () => {
    const { k, ruf, p } = await aufbau()
    for (const origin of ['https://evil.example', 'null', 'https://wep-pankow.pages.dev.evil.example']) {
      expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.bau, { params: p('w1'), body: { wep: bauWep('w1'), basisRev: 1 }, kopf: { origin } })).status).toBe(403)
      expect((await ruf(kontoAktion, 'POST', '/api/v2/admin/konten/bau2', k.admin, { params: p('bau2'), body: { aktion: 'sperren' }, kopf: { origin } })).status).toBe(403)
      expect((await ruf(abmelden, 'POST', '/api/v2/abmelden', k.bau, { kopf: { origin } })).status).toBe(403)
    }
  })

  it('CORS: nur App-Herkünfte, ohne Credentials, Preflight fremder Herkunft 403, ohne Schalter 404', async () => {
    const weiter = async () => new Response('{}')
    const pre = (origin: string) => middleware({ request: new Request(`${ORIGIN}/api/v2/weps`, { method: 'OPTIONS', headers: { origin } }), env: { SERVER_MODUS: 'true' }, next: weiter })
    expect((await pre('https://evil.example')).status).toBe(403)
    const app = await pre('https://localhost')
    expect(app.status).toBe(204)
    expect(app.headers.get('access-control-allow-origin')).toBe('https://localhost')
    expect(app.headers.get('access-control-allow-credentials')).toBeNull()
    const fremd = await middleware({ request: new Request(`${ORIGIN}/api/v2/weps`, { headers: { origin: 'https://evil.example' } }), env: { SERVER_MODUS: 'true' }, next: weiter })
    expect(fremd.headers.get('access-control-allow-origin')).toBeNull()
    expect((await middleware({ request: new Request(`${ORIGIN}/api/v2/weps`), env: {}, next: weiter })).status).toBe(404)
  })

  it('Sitzungs-Cookie: HttpOnly, Secure, SameSite=Lax; in D1 nur der Hash', async () => {
    const db = testDb()
    anlegen(db, 'k1', ['bau'])
    const s = await neueSitzung(db, 'k1')
    expect(s.cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/)
    const zeile = await db.prepare('SELECT token_hash FROM sitzungen').first<{ token_hash: string }>()
    expect(zeile!.token_hash).toBe(await sha256b64url(s.token))
    expect(zeile!.token_hash).not.toBe(s.token)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Offene Funde (mittel/niedrig): sicheres Verhalten beschrieben, schlägt heute fehl
// ---------------------------------------------------------------------------------------------------------------------

describe('offene Funde', () => {
  // Bewusst erlaubt, siehe Entscheidung M1 (docs/ENTSCHEIDUNGEN.md, 29.10.2026): Die BV-Revision legt keine eigenen WEPs
  // an, und zum Testen soll ein Konto alle Rollen durchspielen können. Der Test hält das heutige Verhalten fest.
  it('Fund M1 (bewusst erlaubt): Wer selbst Bau/Grün am WEP ist, darf es als BV prüfen', async () => {
    const { db, k, abgabe } = await aufbau()
    db.roh.prepare("UPDATE konten SET rollen = 'gruen,bv' WHERE id = 'gruen'").run()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    const gruenBv = { ...k.gruen, rollen: ['gruen', 'bv'] as Rolle[] }
    expect((await abgabe('w1', gruenBv, { aktion: 'an_bv' })).status).toBe(200)
    expect((await abgabe('w1', gruenBv, { aktion: 'geprueft' })).status).toBe(200)
  })

  it('Fund M2 (behoben): WEPs in falscher Form werden mit 400 abgelehnt', async () => {
    const { k, ruf, p, rev, abgabe } = await aufbau()
    expect((await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })).status).toBe(200)
    const kaputt = { ...bauWep('w1'), gruen: 'kein Objekt', skizze: { elemente: 'x'.repeat(10) } }
    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w1', k.gruen, { params: p('w1'), body: { wep: kaputt, basisRev: await rev('w1') } })).status).toBe(400)
    // formalien: null hätte später „an Grün“/„an den BV“ mit 500 abbrechen lassen
    for (const wep of [{ ...neuerWep('w2'), formalien: null }, { ...neuerWep('w2'), fotos: [{ id: '../x' }] }, { ...neuerWep('w2'), bau: 'x' }, { ...neuerWep('w2'), gruen: { aufwuchs: 'x' } }]) {
      expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w2', k.bau, { params: p('w2'), body: { wep, basisRev: 0 } })).status).toBe(400)
    }
    // Fehlende Teile bleiben erlaubt
    expect((await ruf(wepSpeichern, 'PUT', '/api/v2/weps/w3', k.bau, { params: p('w3'), body: { wep: { id: 'w3', formalien: {} }, basisRev: 0 } })).status).toBe(200)
  })

  it('Fund M3a (behoben): Microsoft – der unbestätigte Anspruch „email“ wird als unbestätigt geführt; Admin-Seite zeigt Tenant und „unbestätigt“', async () => {
    const { schluessel, signiere } = await testSchluessel()
    const tid = '0a1b2c3d-1111-2222-3333-444455556666'
    const token = await signiere({ iss: `https://login.microsoftonline.com/${tid}/v2.0`, aud: 'ms', tid, oid: 'o1', preferred_username: '+491701234567', email: 'simon@example.org', nonce: 'n', exp: Math.floor(Date.now() / 1000) + 600 })
    const id = await pruefeAnmeldeToken(token, { anbieter: 'microsoft', clientId: 'ms', nonce: 'n', schluessel })
    expect(id.emailBestaetigt).toBe(false)
    const db = testDb()
    const k = await kontoZurAnmeldung(db, id, 'microsoft:simon@example.org')
    expect(k).toMatchObject({ email: 'simon@example.org', emailBestaetigt: false, tenant: tid, status: 'wartet' })
    expect(k.rollen).not.toContain('admin')
    const persoenlich = await kontoZurAnmeldung(db, { anbieter: 'microsoft', subjekt: '9188040d-6c67-4c5b-b112-36a304b66dad:o2', name: 'P', email: 'p@example.org', emailBestaetigt: true }, '')
    expect(persoenlich).toMatchObject({ emailBestaetigt: true, tenant: 'persoenlich' })
  })

  it('Fund M3b (behoben): V2_ADMINS mit Anbieter gilt nur bei diesem Anbieter; die alte Form gilt weiter, mit Warnung nur für Admins', async () => {
    const db = testDb()
    const tid = 'fremder-tenant-0000'
    const ms = { anbieter: 'microsoft' as const, subjekt: `${tid}:o1`, name: 'Irgendwer', email: 'admin@example.org', emailBestaetigt: true }
    expect((await kontoZurAnmeldung(db, ms, 'google:admin@example.org')).rollen).not.toContain('admin')
    const g = await kontoZurAnmeldung(db, { anbieter: 'google', subjekt: 'g-1', name: 'Simon', email: 'admin@example.org', emailBestaetigt: true }, ' Google:Admin@Example.org ')
    expect(g.rollen).toContain('admin')
    // alte Form (ohne Anbieter): gilt noch für beide Anbieter
    expect((await kontoZurAnmeldung(testDb(), ms, 'admin@example.org')).rollen).toContain('admin')
    expect(adminWarnungen('google:a@example.org, microsoft:b@example.org')).toEqual([])
    expect(adminWarnungen('google:a@example.org, b@example.org')[0]).toMatch(/ohne Anbieter/)

    // /api/v2/status: Warnung nur für angemeldete Admins
    const { env, k, db: db2 } = await aufbau()
    env.V2_ADMINS = 'admin@example.org'
    const status2 = async (wer: Konto | null) => {
      const cookieWert = wer ? (await neueSitzung(db2, wer.id)).cookie.split(';')[0] : ''
      return (await (await status({ request: new Request(`${ORIGIN}/api/v2/status`, { headers: { cookie: cookieWert } }), env })).json()) as { warnungen?: string[] }
    }
    expect((await status2(k.admin)).warnungen?.[0]).toMatch(/ohne Anbieter/)
    expect((await status2(k.bau)).warnungen).toBeUndefined()
    expect((await status2(null)).warnungen).toBeUndefined()
  })

  it.fails('Fund M4: Security-Header in public/_headers (CSP mit frame-ancestors, nosniff, Referrer-Policy)', () => {
    const kopf = readFileSync(join(__dirname, '../../../public/_headers'), 'utf8')
    expect(kopf).toMatch(/Content-Security-Policy:.*frame-ancestors/i)
    expect(kopf).toMatch(/X-Content-Type-Options: nosniff/i)
    expect(kopf).toMatch(/Referrer-Policy:/i)
  })

  it('Fund M5 (behoben): Anmeldung und Token-Tausch sind je IP begrenzt (Zähler mit Ablauf, nur IP-Hash in D1)', async () => {
    const db = testDb()
    const env = { SERVER_MODUS: 'true', WEP_DB: db, GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's' }
    const start = (ip: string) => anmeldungStart({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start`, { headers: { 'cf-connecting-ip': ip } }), env, params: { anbieter: 'google' } })
    for (let i = 0; i < GRENZEN.anmeldung.anzahl; i++) expect((await start('203.0.113.7')).headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com/)
    expect((await start('203.0.113.7')).headers.get('location')).toBe(`${ORIGIN}/?anmeldefehler=zu_viele`)
    // Rücksprung zählt mit; andere IP nicht betroffen
    expect((await anmeldungZurueck({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/zurueck?code=x&state=y`, { headers: { 'cf-connecting-ip': '203.0.113.7' } }), env, params: { anbieter: 'google' } })).headers.get('location')).toBe(`${ORIGIN}/?anmeldefehler=zu_viele`)
    expect((await start('198.51.100.1')).headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com/)
    const n = (await db.prepare('SELECT count(*) AS n FROM anmeldungen').first<{ n: number }>())!.n
    expect(n).toBe(GRENZEN.anmeldung.anzahl + 1)
    expect(JSON.stringify(db.roh.prepare('SELECT * FROM begrenzung').all())).not.toContain('203.0.113.7')
    // Token-Tausch
    const tausch = () => appToken({ request: new Request(`${ORIGIN}/api/v2/anmeldung/app/token`, { method: 'POST', body: '{}', headers: { 'cf-connecting-ip': '203.0.113.9' } }), env, params: {} })
    for (let i = 0; i < GRENZEN.token.anzahl; i++) expect((await tausch()).status).toBe(400)
    const zuViel = await tausch()
    expect(zuViel.status).toBe(429)
    expect(Number(zuViel.headers.get('retry-after'))).toBeGreaterThan(0)
    // Nach Ablauf des Fensters wieder frei
    expect(await zuViele(db, new Request(ORIGIN, { headers: { 'cf-connecting-ip': '203.0.113.9' } }), 'token', Date.now() + 11 * 60_000)).toBeUndefined()
    // Ohne CF-Connecting-IP (lokal, Tests) keine Begrenzung
    expect(await zuViele(db, new Request(ORIGIN), 'token')).toBeUndefined()
  })

  it.fails('Fund M6: Massen-Uploads – Fotos ohne Eintrag im WEP sind begrenzt', async () => {
    const { r2, k, ruf, p } = await aufbau()
    for (let i = 0; i < 60; i++) await ruf(dateiHochladen, 'PUT', `/api/v2/weps/w1/dateien/foto-x${i}.jpg`, k.bau, { body: JPEG, params: p('w1', `foto-x${i}.jpg`) })
    expect([...r2.daten.keys()].filter((s) => s.startsWith('weps/w1/fotos/x')).length).toBeLessThan(60)
  })

  it.fails('Fund M6b: Mail-Flut – viele eigene Grün-WEPs direkt an den BV erzeugen nicht je eine Nachricht an jedes BV-Konto', async () => {
    const { db, k, ruf, p, abgabe } = await aufbau()
    for (let i = 0; i < 30; i++) {
      await ruf(wepSpeichern, 'PUT', `/api/v2/weps/s${i}`, k.gruen, { params: p(`s${i}`), body: { wep: neuerWep(`s${i}`), basisRev: 0 } })
      await abgabe(`s${i}`, k.gruen, { aktion: 'an_bv' })
    }
    const n = (await db.prepare("SELECT count(*) AS n FROM benachrichtigungen WHERE konto_id = 'bv'").first<{ n: number }>())!.n
    expect(n).toBeLessThan(30)
  })

  it('Fund N1 (behoben): Origin-Prüfung und Sitzung lesen „Authorization“ gleich (kein Cookie-Rückfall bei ungültigem Bearer)', async () => {
    const { k, ruf, p } = await aufbau()
    // „Bearer a b“: fremdeHerkunft lässt durch (startsWith), kontoDerSitzung nimmt dann das Cookie
    const r = await ruf(wepLoeschen, 'DELETE', '/api/v2/weps/w1', k.bau, { params: p('w1'), body: { basisRev: 1 }, kopf: { origin: 'https://evil.example', authorization: 'Bearer a b' } })
    expect([401, 403]).toContain(r.status)
  })

  it('Fund N2 (behoben): Einmal-Code lässt sich auch bei gleichzeitigen Anfragen nur einmal einlösen', async () => {
    const db = testDb()
    anlegen(db, 'k1', ['bau'])
    const verifier = 'v'.repeat(43)
    const code = await erstelleAppCode(db, 'k1', { challenge: await sha256b64url(verifier), state: 's'.repeat(16), ruecksprung: RUECKSPRUNG_ANDROID, geraet: 'android' })
    // D1 antwortet über das Netz: zwischen SELECT und DELETE kann eine zweite Anfrage laufen
    const langsam = { ...db, prepare: (sql: string) => verzoegert(db.prepare(sql)) } as typeof db
    const [a, b] = await Promise.all([loeseAppCodeEin(langsam, code, verifier), loeseAppCodeEin(langsam, code, verifier)])
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1)
  })

  it('Fund N3 (behoben): Token-Tausch gibt einem inzwischen gesperrten Konto keine Sitzung', async () => {
    const db = testDb()
    anlegen(db, 'k1', ['bau'])
    const verifier = 'v'.repeat(43)
    const code = await erstelleAppCode(db, 'k1', { challenge: await sha256b64url(verifier), state: 's'.repeat(16), ruecksprung: RUECKSPRUNG_ANDROID, geraet: 'android' })
    db.roh.prepare("UPDATE konten SET status = 'gesperrt' WHERE id = 'k1'").run()
    expect((await loeseAppCodeEin(db, code, verifier)).ok).toBe(false)
  })

  it('Fund N4 (behoben): Bei einer Rückfrage darf die gefragte Person Fotos hochladen, die andere nicht', async () => {
    const { k, ruf, p, abgabe } = await aufbau()
    await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })
    await abgabe('w1', k.gruen, { aktion: 'an_bv' })
    await abgabe('w1', k.bv, { aktion: 'rueckfrage', an: 'bau', notiz: 'Foto fehlt' })
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-bf2.jpg', k.bau, { body: JPEG, params: p('w1', 'foto-bf2.jpg') })).status).toBe(200)
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-gf9.jpg', k.gruen, { body: JPEG, params: p('w1', 'foto-gf9.jpg') })).status).toBe(403)
    // H1 gilt auch hier: Bau überschreibt kein Foto an einer Grün-Position
    expect((await ruf(dateiHochladen, 'PUT', '/api/v2/weps/w1/dateien/foto-gf1.jpg', k.bau, { body: JPEG_BOESE, params: p('w1', 'foto-gf1.jpg') })).status).toBe(403)
  })

  it('Fund N5 (behoben): Sitzungs- und Anmelde-Cookie mit __Host-Präfix (Vorschau-Subdomains können sie nicht setzen)', () => {
    expect(cookie(SITZUNG_COOKIE, 'x', 60)).toMatch(/^__Host-wep_sitzung=x; Path=\/; HttpOnly; Secure; SameSite=Lax/)
    expect(cookie(ANMELDUNG_COOKIE, 'x', 60)).toMatch(/^__Host-/)
    expect(cookie(SITZUNG_COOKIE, 'x', 60)).not.toMatch(/Domain=/i)
  })

  it('Fund N6 (behoben): Sitzung endet nach 14 Tagen Untätigkeit; Nutzung verlängert; „Überall abmelden“ beendet alle', async () => {
    const db = testDb()
    anlegen(db, 'k1', ['bau'])
    const jetzt = Date.parse(ZEIT)
    const tag = 86_400_000
    const { token } = await neueSitzung(db, 'k1', jetzt)
    const req = () => new Request(ORIGIN, { headers: { authorization: `Bearer ${token}` } })
    expect(await kontoDerSitzung(db, req(), jetzt + 13 * tag)).toBeTruthy() // benutzt: zählt neu
    expect(await kontoDerSitzung(db, req(), jetzt + 26 * tag)).toBeTruthy()
    expect(await kontoDerSitzung(db, req(), jetzt + 41 * tag)).toBeUndefined() // 15 Tage nicht benutzt
    // Überall abmelden (auch diese Sitzung)
    const { k, ruf } = await aufbau()
    const r = await ruf(sitzungBeenden, 'DELETE', '/api/v2/ich/sitzungen?alle=1', k.bau)
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/^__Host-wep_sitzung=; .*Max-Age=0/)
    expect((await ruf(wepListe, 'GET', '/api/v2/weps', k.bau)).status).toBe(401)
    expect((await ruf(wepListe, 'GET', '/api/v2/weps', k.bau2)).status).toBe(200)
  })

  it('Fund N7 (behoben): Alte, erratbare Kennungen und ungültige Kennungen lassen sich nicht neu belegen', async () => {
    const { k, ruf, p } = await aufbau()
    for (const id of ['2026-007', '2026-1', 'a b', 'x'.repeat(65)]) {
      expect((await ruf(wepSpeichern, 'PUT', `/api/v2/weps/${encodeURIComponent(id)}`, k.bau2, { params: p(id), body: { wep: neuerWep(id), basisRev: 0 } })).status).toBe(400)
    }
    const uuid = '6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5'
    expect((await ruf(wepSpeichern, 'PUT', `/api/v2/weps/${uuid}`, k.bau2, { params: p(uuid), body: { wep: neuerWep(uuid), basisRev: 0 } })).status).toBe(200)
  })

  it('Fund N8 (behoben): Notizen und Begründungen haben eine Höchstlänge', async () => {
    const { k, abgabe } = await aufbau()
    await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })
    await abgabe('w1', k.gruen, { aktion: 'an_bv' })
    expect((await abgabe('w1', k.bv, { aktion: 'rueckfrage', an: 'bau', notiz: 'x'.repeat(200_000) })).status).toBe(400)
    expect((await abgabe('w1', k.bv, { aktion: 'geprueft', notiz: 'x'.repeat(2001) })).status).toBe(400)
    expect((await abgabe('w1', k.bv, { aktion: 'geprueft', notiz: 'x'.repeat(2000) })).status).toBe(200)
    expect((await abgabe('w1', k.bv, { aktion: 'wiederoeffnen', begruendung: 'x'.repeat(2001) })).status).toBe(400)
  })

  it.fails('Fund N9: /api/v2/status verrät ohne Anmeldung nichts über die Einrichtung', async () => {
    const r = await status({ env: { SERVER_MODUS: 'true' } })
    expect(((await r.json()) as { einrichtung?: unknown }).einrichtung).toBeUndefined()
  })

  it.fails('Fund N11: Die Grün-Auswahl für Bau zeigt keine E-Mail-Adressen', async () => {
    const { k, ruf } = await aufbau()
    const d = (await (await ruf(gruenListe, 'GET', '/api/v2/konten/gruen', k.bau)).json()) as { konten: { email?: string }[] }
    expect(d.konten.every((x) => !x.email)).toBe(true)
  })

  it('Fund N12 (behoben): Beim Zusammenführen übernimmt Grün nicht den Namen des Bau-Wertermittlers, und `felder` ist begrenzt', async () => {
    const { db, k, ruf, p, rev, abgabe } = await aufbau()
    const g = neuerWep('g1')
    g.formalien.wertermittlerBaulichkeiten = 'Falscher Name'
    await ruf(wepSpeichern, 'PUT', '/api/v2/weps/g1', k.gruen, { params: p('g1'), body: { wep: g, basisRev: 0 } })
    await abgabe('w1', k.bau, { aktion: 'an_gruen', gruenKonto: 'gruen' })
    const felder = ['wertermittlerBaulichkeiten', 'auftraggeber', ...Array.from({ length: 5000 }, (_, i) => `x${i}`)]
    g.formalien.auftraggeber = 'Gartenfreunde e. V.'
    await ruf(wepSpeichern, 'PUT', '/api/v2/weps/g1', k.gruen, { params: p('g1'), body: { wep: g, basisRev: await rev('g1') } })
    expect((await ruf(zusammenfuehren, 'POST', '/api/v2/weps/w1/zusammenfuehren', k.gruen, { params: p('w1'), body: { aus: 'g1', wep: bauWep('w1'), felder, basisRev: await rev('w1') } })).status).toBe(200)
    const w = JSON.parse((await db.prepare("SELECT daten FROM weps WHERE id = 'w1'").first<{ daten: string }>())!.daten) as Wep
    expect(w.formalien.wertermittlerBaulichkeiten).not.toBe('Falscher Name')
    expect(w.formalien.auftraggeber).toBe('Gartenfreunde e. V.')
    const notiz = (await db.prepare("SELECT notiz FROM verlauf WHERE wep_id = 'w1' AND aktion = 'zusammengefuehrt'").first<{ notiz: string }>())!.notiz
    expect(notiz).toBe('mit dem eigenen WEP ohne Vorgangs-Nr.; übernommene Stammdaten: auftraggeber')
  })

  it('Fund N15 (behoben): aud mit mehreren Empfängern nur mit passendem azp', async () => {
    const { schluessel, signiere } = await testSchluessel()
    const token = await signiere({ iss: 'https://accounts.google.com', aud: ['fremde-app', 'g'], azp: 'fremde-app', sub: '123', email: 'a@example.org', email_verified: true, nonce: 'n', exp: Math.floor(Date.now() / 1000) + 600 })
    await expect(pruefeAnmeldeToken(token, { anbieter: 'google', clientId: 'g', nonce: 'n', schluessel })).rejects.toThrow(/azp/)
    const passend = await signiere({ iss: 'https://accounts.google.com', aud: ['fremde-app', 'g'], azp: 'g', sub: '123', email: 'a@example.org', email_verified: true, nonce: 'n', exp: Math.floor(Date.now() / 1000) + 600 })
    expect((await pruefeAnmeldeToken(passend, { anbieter: 'google', clientId: 'g', nonce: 'n', schluessel })).subjekt).toBe('123')
  })

  it('Fund N10 (behoben): Die Anmeldeseite zeigt keinen beliebigen Text aus der Adresse', async () => {
    const env = { SERVER_MODUS: 'true', WEP_DB: testDb(), GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's' }
    const text = 'Bitte rufen Sie 0800 123 an'
    const r = await anmeldungZurueck({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/zurueck?error=${encodeURIComponent(text)}`), env, params: { anbieter: 'google' } })
    expect(decodeURIComponent(r.headers.get('location') ?? '')).not.toContain(text)
    expect(r.headers.get('location')).toBe(`${ORIGIN}/?anmeldefehler=anbieter`)
    expect(anmeldeFehlerText(text)).toBe(ANMELDEFEHLER_TEXT.fehler)
    expect(anmeldeFehlerText('gesperrt')).toBe(ANMELDEFEHLER_TEXT.gesperrt)
    expect(anmeldeFehlerText('__proto__')).toBe(ANMELDEFEHLER_TEXT.fehler)
  })

  it.fails('Fund N13: Fehler von Resend landen ohne E-Mail-Adresse im Log', async () => {
    const laden = (async () => new Response('Invalid `to` field: erika@example.org', { status: 422 })) as unknown as typeof fetch
    const fehler = await sendeMail({ RESEND_API_KEY: 'k', MAIL_ABSENDER: 'a@example.org' }, 'erika@example.org', { subject: 's', text: 't', html: 'h' }, laden).catch((e: Error) => e.message)
    expect(fehler).not.toContain('erika@example.org')
  })

  it.fails('Fund N14: Ein Start-Link mit fremder challenge führt nicht ohne Rückfrage zum Anbieter', async () => {
    const env = { SERVER_MODUS: 'true', WEP_DB: testDb(), GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's' }
    const q = new URLSearchParams({ client: 'app', challenge: 'A'.repeat(43), state: 'S'.repeat(16), ruecksprung: RUECKSPRUNG_ANDROID })
    const r = await anmeldungStart({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start?${q}`), env, params: { anbieter: 'google' } })
    expect(r.headers.get('location') ?? '').not.toMatch(/^https:\/\/accounts\.google\.com/)
  })
})

/** Anweisung, die wie D1 erst nach einer kurzen Pause antwortet. */
function verzoegert(a: DbAnweisung): DbAnweisung {
  const pause = () => new Promise((r) => setTimeout(r, 5))
  return {
    bind: (...w) => verzoegert(a.bind(...w)),
    first: async () => (await pause(), a.first()),
    all: async () => (await pause(), a.all()),
    run: async () => (await pause(), a.run()),
  } as DbAnweisung
}

// Testschlüssel (RS256) für nachgebaute ID-Tokens
let schluesselPaar: CryptoKeyPair
let schluesselJwk: Jwk
beforeAll(async () => {
  schluesselPaar = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const e = (await crypto.subtle.exportKey('jwk', schluesselPaar.publicKey)) as { n: string; e: string }
  schluesselJwk = { kid: 'k1', kty: 'RSA', n: e.n, e: e.e }
})
async function testSchluessel() {
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const teil = (o: object) => b64(new TextEncoder().encode(JSON.stringify(o)))
  return {
    schluessel: async () => [schluesselJwk],
    signiere: async (inhalt: Record<string, unknown>) => {
      const kopf = teil({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
      const koerper = teil(inhalt)
      const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', schluesselPaar.privateKey, new TextEncoder().encode(`${kopf}.${koerper}`)))
      return `${kopf}.${koerper}.${b64(sig)}`
    },
  }
}
