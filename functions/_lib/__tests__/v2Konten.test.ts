// v2 Paket 1: Anmeldung (Google/Microsoft nachgebaut, echte RS256-Signatur), Sitzungen, Freigabe, Rollen, Admin-Seite.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Jwk } from '../idToken'
import { testDb } from './sqliteDb'
import { istErsterAdmin, kontoZurAnmeldung, rollenFehler } from '../v2/konten'
import { pruefeAnmeldeToken, MS_PERSOENLICH } from '../v2/oidc'
import { sicheresZiel } from '../v2/sitzung'
import { onRequestGet as start } from '../../api/v2/anmeldung/[anbieter]/start'
import { onRequestGet as zurueck } from '../../api/v2/anmeldung/[anbieter]/zurueck'
import { onRequestGet as ich, onRequestPatch as ichAendern } from '../../api/v2/ich'
import { onRequestPost as abmelden } from '../../api/v2/abmelden'
import { onRequestGet as kontenListe } from '../../api/v2/admin/konten'
import { onRequestPost as kontoAktion } from '../../api/v2/admin/konten/[id]'

const ORIGIN = 'https://main.wep-pankow.pages.dev'
const GOOGLE_ID = 'test-client.apps.googleusercontent.com'
const MS_ID = '11111111-2222-3333-4444-555555555555'
const TID = '0a1b2c3d-1111-2222-3333-444455556666'

let paar: CryptoKeyPair
let jwk: Jwk
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const teil = (o: object) => b64(new TextEncoder().encode(JSON.stringify(o)))

async function signiere(inhalt: Record<string, unknown>): Promise<string> {
  const kopf = teil({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
  const koerper = teil(inhalt)
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', paar.privateKey, new TextEncoder().encode(`${kopf}.${koerper}`)))
  return `${kopf}.${koerper}.${b64(sig)}`
}

beforeAll(async () => {
  paar = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const e = (await crypto.subtle.exportKey('jwk', paar.publicKey)) as { n: string; e: string }
  jwk = { kid: 'k1', kty: 'RSA', n: e.n, e: e.e }
})
afterEach(() => vi.unstubAllGlobals())

const jetztS = () => Math.floor(Date.now() / 1000)
const googleToken = (nonce: string, extra: Record<string, unknown> = {}) =>
  signiere({ iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: '1098765', email: 'erika@example.org', email_verified: true, name: 'Erika Musterfrau', nonce, exp: jetztS() + 3600, ...extra })
const msToken = (nonce: string, extra: Record<string, unknown> = {}) =>
  signiere({ iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: MS_ID, tid: TID, oid: 'aaaa-bbbb', preferred_username: 'max@bv.example', name: 'Max Mustermann', nonce, exp: jetztS() + 3600, ...extra })

function umgebung(extra: Record<string, unknown> = {}) {
  return { SERVER_MODUS: 'true', WEP_DB: testDb(), GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: 'geheim', VITE_MS_CLIENT_ID: MS_ID, MS_CLIENT_SECRET: 'geheim', V2_ADMINS: 'admin@example.org', ...extra }
}
type Env = ReturnType<typeof umgebung>

/** Nachgebauter Anbieter: Token-Endpunkt liefert das ID-Token zur nonce der Anmeldung, JWKS den Testschlüssel. */
function anbieter(token: (nonce: string) => Promise<string>, merke: { body?: URLSearchParams } = {}) {
  let nonce = ''
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.includes('certs') || url.includes('keys')) return Response.json({ keys: [jwk] })
    merke.body = new URLSearchParams(String(init?.body))
    return Response.json({ id_token: await token(nonce) })
  })
  return { setzeNonce: (n: string) => (nonce = n) }
}

/** Ganze Anmeldung: start → (Anbieter) → zurueck. Liefert die Antwort des Rücksprungs und das Sitzungs-Cookie. */
async function melde(env: Env, wer: 'google' | 'microsoft', token: (nonce: string) => Promise<string>, opt: { ziel?: string } = {}) {
  const a = anbieter(token)
  const s = await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/${wer}/start?ziel=${encodeURIComponent(opt.ziel ?? '/')}`), env, params: { anbieter: wer } })
  expect(s.status).toBe(302)
  const ort = new URL(s.headers.get('location')!)
  const state = ort.searchParams.get('state')!
  a.setzeNonce(ort.searchParams.get('nonce')!)
  const anmeldeCookie = s.headers.get('set-cookie')!.split(';')[0]
  const r = await zurueck({ request: new Request(`${ORIGIN}/api/v2/anmeldung/${wer}/zurueck?code=c0de&state=${state}`, { headers: { cookie: anmeldeCookie } }), env, params: { anbieter: wer } })
  const sitzung = r.headers.getSetCookie().find((c) => c.startsWith('wep_sitzung=') && !c.startsWith('wep_sitzung=;'))?.split(';')[0]
  return { r, sitzung, ort }
}

const anfrage = (pfad: string, sitzung: string | undefined, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${pfad}`, { ...init, headers: { origin: ORIGIN, ...(sitzung ? { cookie: sitzung } : {}), ...(init.headers ?? {}) } })

describe('Rollen', () => {
  it('Bau ODER Grün, BV und Admin zusätzlich; Unbekanntes abgelehnt', () => {
    expect(rollenFehler(['bau'])).toBeUndefined()
    expect(rollenFehler(['gruen', 'bv', 'admin'])).toBeUndefined()
    expect(rollenFehler([])).toBeUndefined()
    expect(rollenFehler(['bau', 'gruen'])).toMatch(/entweder Bau oder Grün/)
    expect(rollenFehler(['chef'])).toMatch(/Unbekannte/)
    expect(rollenFehler('bau')).toMatch(/fehlen/)
  })

  it('erste Admins nur mit bestätigter E-Mail (Groß-/Kleinschreibung egal)', () => {
    expect(istErsterAdmin({ email: 'Admin@Example.org', emailBestaetigt: true }, ' admin@example.org , x@y.de')).toBe(true)
    expect(istErsterAdmin({ email: 'admin@example.org', emailBestaetigt: false }, 'admin@example.org')).toBe(false)
    expect(istErsterAdmin({ email: '', emailBestaetigt: true }, '')).toBe(false)
  })
})

describe('ID-Token der Anmeldung prüfen', () => {
  const schluessel = async () => [jwk]
  it('Google: sub als Kennung, E-Mail nur mit email_verified bestätigt', async () => {
    const id = await pruefeAnmeldeToken(await googleToken('n1'), { anbieter: 'google', clientId: GOOGLE_ID, nonce: 'n1', schluessel })
    expect(id).toEqual({ anbieter: 'google', subjekt: '1098765', name: 'Erika Musterfrau', email: 'erika@example.org', emailBestaetigt: true })
    const unbestaetigt = await pruefeAnmeldeToken(await googleToken('n1', { email_verified: false }), { anbieter: 'google', clientId: GOOGLE_ID, nonce: 'n1', schluessel })
    expect(unbestaetigt.emailBestaetigt).toBe(false)
  })

  it('Microsoft: tid:oid als Kennung, preferred_username als E-Mail, persönliche Konten ebenso', async () => {
    const id = await pruefeAnmeldeToken(await msToken('n2'), { anbieter: 'microsoft', clientId: MS_ID, nonce: 'n2', schluessel })
    expect(id).toEqual({ anbieter: 'microsoft', subjekt: `${TID}:aaaa-bbbb`, name: 'Max Mustermann', email: 'max@bv.example', emailBestaetigt: true })
    const msa = await pruefeAnmeldeToken(await msToken('n2', { tid: MS_PERSOENLICH, iss: `https://login.microsoftonline.com/${MS_PERSOENLICH}/v2.0` }), { anbieter: 'microsoft', clientId: MS_ID, nonce: 'n2', schluessel })
    expect(msa.subjekt).toBe(`${MS_PERSOENLICH}:aaaa-bbbb`)
    // nur „email“ (unbestätigt), kein UPN mit @ → zählt nicht als bestätigt
    const ohneUpn = await pruefeAnmeldeToken(await msToken('n2', { preferred_username: 'max', email: 'admin@example.org' }), { anbieter: 'microsoft', clientId: MS_ID, nonce: 'n2', schluessel })
    expect(ohneUpn).toMatchObject({ email: 'admin@example.org', emailBestaetigt: false })
  })

  it('lehnt ab: falsche nonce, fremde App, falscher Aussteller, abgelaufen', async () => {
    const pruefe = (t: string, nonce = 'n') => pruefeAnmeldeToken(t, { anbieter: 'google', clientId: GOOGLE_ID, nonce, schluessel })
    await expect(pruefe(await googleToken('n'), 'anders')).rejects.toThrow(/nonce/)
    await expect(pruefe(await googleToken('n', { aud: 'fremd' }))).rejects.toThrow(/nicht für diese App/)
    await expect(pruefe(await googleToken('n', { iss: 'https://evil.example' }))).rejects.toThrow(/Aussteller/)
    await expect(pruefe(await googleToken('n', { exp: jetztS() - 3600 }))).rejects.toThrow(/abgelaufen/)
    await expect(pruefeAnmeldeToken(await msToken('n', { iss: 'https://login.microsoftonline.com/anderer/v2.0' }), { anbieter: 'microsoft', clientId: MS_ID, nonce: 'n', schluessel })).rejects.toThrow(/Aussteller/)
  })
})

describe('Anmeldung, Sitzung, Freigabe', () => {
  it('Start leitet mit PKCE, state und nonce zum Anbieter; Ziel nur als Pfad dieser Seite', async () => {
    const env = umgebung()
    const s = await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start?ziel=/admin`), env, params: { anbieter: 'google' } })
    const ort = new URL(s.headers.get('location')!)
    expect(ort.origin + ort.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(ort.searchParams)).toMatchObject({ client_id: GOOGLE_ID, response_type: 'code', code_challenge_method: 'S256', scope: 'openid email profile', redirect_uri: `${ORIGIN}/api/v2/anmeldung/google/zurueck` })
    expect(s.headers.get('set-cookie')).toMatch(/^wep_anmeldung=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/)
    expect(sicheresZiel('/admin?x=1')).toBe('/admin?x=1')
    for (const boese of ['//evil.example', 'https://evil.example', '/\\evil.example', '', null]) expect(sicheresZiel(boese)).toBe('/')
    expect((await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/github/start`), env, params: { anbieter: 'github' } })).status).toBe(404)
    expect((await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start`), env: { ...env, GOOGLE_CLIENT_SECRET: '' }, params: { anbieter: 'google' } })).status).toBe(503)
  })

  it('neues Konto wartet auf Freigabe; Sitzungs-Cookie HttpOnly; Token nur als Hash gespeichert; Code-Tausch mit PKCE', async () => {
    const env = umgebung()
    const merke: { body?: URLSearchParams } = {}
    let nonce = ''
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('keys')) return Response.json({ keys: [jwk] })
      merke.body = new URLSearchParams(String(init?.body))
      return Response.json({ id_token: await msToken(nonce) })
    })
    const s = await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/microsoft/start?ziel=/`), env, params: { anbieter: 'microsoft' } })
    const ort = new URL(s.headers.get('location')!)
    nonce = ort.searchParams.get('nonce')!
    const r = await zurueck({
      request: new Request(`${ORIGIN}/api/v2/anmeldung/microsoft/zurueck?code=c0de&state=${ort.searchParams.get('state')}`, { headers: { cookie: s.headers.get('set-cookie')!.split(';')[0] } }),
      env,
      params: { anbieter: 'microsoft' },
    })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`${ORIGIN}/`)
    expect(merke.body?.get('client_secret')).toBe('geheim')
    expect(merke.body?.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{60,}$/)
    const sitzungsCookie = r.headers.getSetCookie().find((c) => c.startsWith('wep_sitzung='))!
    expect(sitzungsCookie).toMatch(/HttpOnly; Secure; SameSite=Lax; Max-Age=2592000/)
    const token = sitzungsCookie.split(';')[0].split('=')[1]
    const gespeichert = env.WEP_DB.roh.prepare('SELECT token_hash FROM sitzungen').all() as { token_hash: string }[]
    expect(gespeichert).toHaveLength(1)
    expect(gespeichert[0].token_hash).not.toBe(token)

    const antwort = await ich({ request: anfrage('/api/v2/ich', `wep_sitzung=${token}`), env, params: {} })
    expect((await antwort.json()).konto).toMatchObject({ name: 'Max Mustermann', email: 'max@bv.example', status: 'wartet', rollen: [], mailBenachrichtigung: true })
    // wartendes Konto: keine Admin-Seite
    expect((await kontenListe({ request: anfrage('/api/v2/admin/konten', `wep_sitzung=${token}`), env, params: {} })).status).toBe(403)
  })

  it('Rücksprung ohne passendes Anmelde-Cookie (anderer Browser) oder zweimal: zurück zur App mit Meldung, keine Sitzung', async () => {
    const env = umgebung()
    const a = anbieter((n) => googleToken(n))
    const s = await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start`), env, params: { anbieter: 'google' } })
    const ort = new URL(s.headers.get('location')!)
    a.setzeNonce(ort.searchParams.get('nonce')!)
    const url = `${ORIGIN}/api/v2/anmeldung/google/zurueck?code=c&state=${ort.searchParams.get('state')}`
    const fremd = await zurueck({ request: new Request(url, { headers: { cookie: 'wep_anmeldung=anderer' } }), env, params: { anbieter: 'google' } })
    expect(fremd.headers.get('location')).toMatch(/anmeldefehler=/)
    expect(fremd.headers.getSetCookie().some((c) => c.startsWith('wep_sitzung='))).toBe(false)
    const cookie = s.headers.get('set-cookie')!.split(';')[0]
    expect((await zurueck({ request: new Request(url, { headers: { cookie } }), env, params: { anbieter: 'google' } })).headers.get('location')).toBe(`${ORIGIN}/`)
    // derselbe Rücksprung ein zweites Mal: state ist verbraucht
    expect((await zurueck({ request: new Request(url, { headers: { cookie } }), env, params: { anbieter: 'google' } })).headers.get('location')).toMatch(/anmeldefehler=/)
    // Abbruch beim Anbieter
    const abbruch = await zurueck({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/zurueck?error=access_denied`), env, params: { anbieter: 'google' } })
    expect(decodeURIComponent(abbruch.headers.get('location')!)).toContain('Anmeldung abgebrochen.')
  })

  it('erster Admin (V2_ADMINS) ist sofort freigegeben; Admin gibt frei, vergibt Rollen, sperrt (Sitzung endet), löscht; alles protokolliert', async () => {
    const env = umgebung()
    const admin = await melde(env, 'google', (n) => googleToken(n, { sub: 'admin-1', email: 'admin@example.org', name: 'Ada Admin' }), { ziel: '/admin' })
    expect(admin.r.headers.get('location')).toBe(`${ORIGIN}/admin`)
    const ichAdmin = (await (await ich({ request: anfrage('/api/v2/ich', admin.sitzung), env, params: {} })).json()).konto
    expect(ichAdmin).toMatchObject({ status: 'freigegeben', rollen: ['admin'] })

    const max = await melde(env, 'microsoft', (n) => msToken(n))
    const liste = async () => (await (await kontenListe({ request: anfrage('/api/v2/admin/konten', admin.sitzung), env, params: {} })).json()).konten as { id: string; status: string; name: string; rollen: string[] }[]
    const maxId = (await liste()).find((k) => k.name === 'Max Mustermann')!.id
    expect((await liste())[0].name).toBe('Max Mustermann') // wartende zuerst

    const aktion = (body: object, id = maxId, sitzung = admin.sitzung, origin = ORIGIN) =>
      kontoAktion({ request: new Request(`${ORIGIN}/api/v2/admin/konten/${id}`, { method: 'POST', body: JSON.stringify(body), headers: { origin, cookie: sitzung ?? '' } }), env, params: { id } })

    expect((await aktion({ aktion: 'freigeben' })).status).toBe(200)
    expect((await aktion({ aktion: 'rollen', rollen: ['bau', 'gruen'] })).status).toBe(400)
    const r = await aktion({ aktion: 'rollen', rollen: ['gruen', 'bv'] })
    expect((await r.json()).konten.find((k: { id: string }) => k.id === maxId)).toMatchObject({ status: 'freigegeben', rollen: ['gruen', 'bv'] })
    // fremde Seite (Origin) und Nicht-Admin werden abgelehnt
    expect((await aktion({ aktion: 'sperren' }, maxId, admin.sitzung, 'https://evil.example')).status).toBe(403)
    expect((await aktion({ aktion: 'freigeben' }, maxId, max.sitzung)).status).toBe(403)
    // Admin kann sich selbst nicht aussperren
    const adminId = (await liste()).find((k) => k.name === 'Ada Admin')!.id
    expect((await aktion({ aktion: 'sperren' }, adminId)).status).toBe(400)
    expect((await aktion({ aktion: 'rollen', rollen: ['bv'] }, adminId)).status).toBe(400)

    // Sperren beendet Max' Sitzung sofort
    expect((await ich({ request: anfrage('/api/v2/ich', max.sitzung), env, params: {} })).status).toBe(200)
    await aktion({ aktion: 'sperren' })
    expect((await ich({ request: anfrage('/api/v2/ich', max.sitzung), env, params: {} })).status).toBe(401)
    // gesperrt: neue Anmeldung bekommt keine Sitzung
    const wieder = await melde(env, 'microsoft', (n) => msToken(n))
    expect(wieder.sitzung).toBeUndefined()
    expect(decodeURIComponent(wieder.r.headers.get('location')!)).toContain('gesperrt')

    await aktion({ aktion: 'loeschen' })
    expect((await liste()).map((k) => k.name)).toEqual(['Ada Admin'])
    expect((await aktion({ aktion: 'freigeben' })).status).toBe(404)

    const protokoll = (env.WEP_DB.roh.prepare('SELECT aktion FROM protokoll ORDER BY id').all() as { aktion: string }[]).map((p) => p.aktion)
    expect(protokoll).toEqual(expect.arrayContaining(['konto_angelegt', 'anmeldung', 'admin_freigeben', 'admin_rollen', 'admin_sperren', 'admin_loeschen']))
  })

  it('eigene Mail-Benachrichtigung abschalten; Abmelden beendet die Sitzung', async () => {
    const env = umgebung()
    const admin = await melde(env, 'google', (n) => googleToken(n, { email: 'admin@example.org' }))
    const patch = await ichAendern({ request: anfrage('/api/v2/ich', admin.sitzung, { method: 'PATCH', body: JSON.stringify({ mailBenachrichtigung: false }) }), env, params: {} })
    expect((await patch.json()).konto.mailBenachrichtigung).toBe(false)
    expect((await (await ich({ request: anfrage('/api/v2/ich', admin.sitzung), env, params: {} })).json()).konto.mailBenachrichtigung).toBe(false)
    const raus = await abmelden({ request: anfrage('/api/v2/abmelden', admin.sitzung, { method: 'POST' }), env, params: {} })
    expect(raus.headers.get('set-cookie')).toMatch(/^wep_sitzung=; .*Max-Age=0/)
    expect((await ich({ request: anfrage('/api/v2/ich', admin.sitzung), env, params: {} })).status).toBe(401)
  })

  it('ohne Datenbank-Bindung: 503 mit Hinweis', async () => {
    const r = await ich({ request: anfrage('/api/v2/ich', undefined), env: { SERVER_MODUS: 'true' }, params: {} })
    expect(r.status).toBe(503)
  })

  it('Name und E-Mail werden bei jeder Anmeldung aufgefrischt; ein schon wartendes Konto aus V2_ADMINS wird Admin', async () => {
    const db = testDb()
    const id = { anbieter: 'google' as const, subjekt: 's1', name: 'Erika', email: 'erika@example.org', emailBestaetigt: true }
    expect((await kontoZurAnmeldung(db, id, '')).status).toBe('wartet')
    const neu = await kontoZurAnmeldung(db, { ...id, name: 'Erika Musterfrau' }, 'erika@example.org')
    expect(neu).toMatchObject({ name: 'Erika Musterfrau', status: 'freigegeben', rollen: ['admin'] })
  })
})
