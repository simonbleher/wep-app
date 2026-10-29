// v2 Paket 8: Anmeldung der Android- und Windows-App über den Systembrowser – Einmal-Code (60 s, einmal, nur mit dem
// passenden Verifier), erlaubte Rücksprünge, state, Bearer auf den v2-Endpunkten, Widerruf, Sitzungen mit Gerät.
// Google ist nachgebaut (echte RS256-Signatur); alle Namen und Daten sind erfunden.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Jwk } from '../idToken'
import { testDb } from './sqliteDb'
import { fakeR2 } from './fakeR2'
import { appAnmeldungAus, loeseAppCodeEin, RUECKSPRUNG_ANDROID } from '../v2/appAnmeldung'
import { sha256b64url } from '../v2/oidc'
import { onRequestGet as start } from '../../api/v2/anmeldung/[anbieter]/start'
import { onRequestGet as zurueck } from '../../api/v2/anmeldung/[anbieter]/zurueck'
import { onRequestPost as tausche } from '../../api/v2/anmeldung/app/token'
import { onRequestGet as ich } from '../../api/v2/ich'
import { onRequestPost as abmelden } from '../../api/v2/abmelden'
import { onRequestDelete as sitzungBeenden, onRequestGet as sitzungen } from '../../api/v2/ich/sitzungen'
import { onRequestGet as kontenListe } from '../../api/v2/admin/konten'
import { onRequestPost as kontoAktion } from '../../api/v2/admin/konten/[id]'
import { onRequestGet as wepListe } from '../../api/v2/weps'
import { onRequestGet as wepHolen, onRequestPut as wepSpeichern } from '../../api/v2/weps/[id]'
import { onRequestPut as dateiHochladen, onRequestGet as dateiHolen } from '../../api/v2/weps/[id]/dateien/[datei]'
import { onRequestGet as benachrichtigungen } from '../../api/v2/benachrichtigungen'

const ORIGIN = 'https://wep-pankow.pages.dev'
const APP_ORIGIN = 'https://localhost'
const GOOGLE_ID = 'test-client.apps.googleusercontent.com'

let paar: CryptoKeyPair
let jwk: Jwk
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const teil = (o: object) => b64(new TextEncoder().encode(JSON.stringify(o)))

beforeAll(async () => {
  paar = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const e = (await crypto.subtle.exportKey('jwk', paar.publicKey)) as { n: string; e: string }
  jwk = { kid: 'k1', kty: 'RSA', n: e.n, e: e.e }
})
afterEach(() => vi.unstubAllGlobals())

async function googleToken(nonce: string, email = 'bert@example.org', sub = 'g-bert') {
  const kopf = teil({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
  const koerper = teil({ iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub, email, email_verified: true, name: 'Bert Bauer', nonce, exp: Math.floor(Date.now() / 1000) + 3600 })
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', paar.privateKey, new TextEncoder().encode(`${kopf}.${koerper}`)))
  return `${kopf}.${koerper}.${b64(sig)}`
}

function umgebung() {
  return { SERVER_MODUS: 'true', WEP_DB: testDb(), WEP_DATEIEN: fakeR2(), GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: 'geheim', V2_ADMINS: 'admin@example.org' }
}
type Env = ReturnType<typeof umgebung>

/** PKCE der App: Verifier (43 Zeichen) und S256-Challenge. */
async function pkce() {
  const verifier = b64(crypto.getRandomValues(new Uint8Array(32)))
  return { verifier, challenge: await sha256b64url(verifier) }
}

/** Anmeldung wie aus der App: start (Systembrowser) → Google (nachgebaut) → zurueck. Liefert die Antwort des Rücksprungs. */
async function appAnmeldung(env: Env, opt: { ruecksprung?: string; email?: string; sub?: string; falscherState?: boolean; anbieterFehler?: string } = {}) {
  let nonce = ''
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('certs')) return Response.json({ keys: [jwk] })
    return Response.json({ id_token: await googleToken(nonce, opt.email, opt.sub) })
  })
  const { verifier, challenge } = await pkce()
  const appState = b64(crypto.getRandomValues(new Uint8Array(16)))
  const q = new URLSearchParams({ client: 'app', challenge, state: appState, ruecksprung: opt.ruecksprung ?? RUECKSPRUNG_ANDROID })
  const s = await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start?${q}`), env, params: { anbieter: 'google' } })
  expect(s.status).toBe(302)
  const ort = new URL(s.headers.get('location')!)
  nonce = ort.searchParams.get('nonce')!
  // Google bekommt die Rücksprung-Adresse des Servers (unverändert), nicht die der App
  expect(ort.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/v2/anmeldung/google/zurueck`)
  const cookie = s.headers.get('set-cookie')!.split(';')[0]
  const state = opt.falscherState ? 'fremd' : ort.searchParams.get('state')!
  const rq = opt.anbieterFehler ? `error=${opt.anbieterFehler}&state=${state}` : `code=c0de&state=${state}`
  const r = await zurueck({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/zurueck?${rq}`, { headers: { cookie } }), env, params: { anbieter: 'google' } })
  return { r, verifier, appState, ort: new URL(r.headers.get('location')!) }
}

const einloesen = (env: Env, code: string, verifier: string) =>
  tausche({ request: new Request(`${ORIGIN}/api/v2/anmeldung/app/token`, { method: 'POST', body: JSON.stringify({ code, verifier }), headers: { origin: APP_ORIGIN } }), env, params: {} })

/** Anfrage aus der App: Bearer, App-Herkunft, kein Cookie. */
const ausApp = (pfad: string, token: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${pfad}`, { ...init, headers: { origin: APP_ORIGIN, authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })

/** Ganze Anmeldung bis zum Token. */
async function token(env: Env, opt: Parameters<typeof appAnmeldung>[1] = {}) {
  const a = await appAnmeldung(env, opt)
  const t = await einloesen(env, a.ort.searchParams.get('code')!, a.verifier)
  expect(t.status).toBe(200)
  return ((await t.json()) as { token: string }).token
}

describe('Parameter der App-Anmeldung', () => {
  it('nur die Rücksprünge der Apps; challenge und state geprüft', async () => {
    const { challenge } = await pkce()
    const p = (r: string, extra: Record<string, string> = {}) => new URLSearchParams({ client: 'app', challenge, state: 'abcdefghijklmnopq', ruecksprung: r, ...extra })
    expect(appAnmeldungAus(new URLSearchParams('ziel=/'))).toBeUndefined()
    expect(appAnmeldungAus(p(RUECKSPRUNG_ANDROID))).toMatchObject({ geraet: 'android' })
    expect(appAnmeldungAus(p('http://127.0.0.1:53817/'))).toMatchObject({ geraet: 'windows' })
    for (const r of ['https://evil.example/', 'http://127.0.0.1:80/', 'http://localhost:53817/', 'http://127.0.0.1:53817/x', 'de.wep.app://auth/anders', 'de.wep.app://auth/server?x=1']) {
      expect(appAnmeldungAus(p(r))).toMatch(/nicht erlaubt/)
    }
    expect(appAnmeldungAus(p(RUECKSPRUNG_ANDROID, { challenge: 'kurz' }))).toMatch(/challenge/)
    expect(appAnmeldungAus(p(RUECKSPRUNG_ANDROID, { state: 'x' }))).toMatch(/state/)
  })

  it('start lehnt einen fremden Rücksprung ab (400), bevor es zu Google geht', async () => {
    const env = umgebung()
    const { challenge } = await pkce()
    const r = await start({ request: new Request(`${ORIGIN}/api/v2/anmeldung/google/start?client=app&challenge=${challenge}&state=abcdefghijklmnopq&ruecksprung=https://evil.example/`), env, params: { anbieter: 'google' } })
    expect(r.status).toBe(400)
  })
})

describe('Einmal-Code und Token', () => {
  it('Android: Rücksprung in die App mit Code und state der App, kein Cookie; Code + Verifier → Token; Bearer wirkt', async () => {
    const env = umgebung()
    const a = await appAnmeldung(env)
    expect(a.r.status).toBe(302)
    expect(`${a.ort.protocol}//${a.ort.host}${a.ort.pathname}`).toBe(RUECKSPRUNG_ANDROID)
    expect(a.ort.searchParams.get('state')).toBe(a.appState)
    expect(a.r.headers.getSetCookie().some((c) => c.startsWith('__Host-wep_sitzung=') && !c.startsWith('__Host-wep_sitzung=;'))).toBe(false)
    const t = await einloesen(env, a.ort.searchParams.get('code')!, a.verifier)
    expect(t.status).toBe(200)
    const { token, konto } = (await t.json()) as { token: string; konto: { email: string; status: string } }
    expect(konto).toMatchObject({ email: 'bert@example.org', status: 'wartet' })
    const i = await ich({ request: ausApp('/api/v2/ich', token), env, params: {} })
    expect(i.status).toBe(200)
    const s = (await (await sitzungen({ request: ausApp('/api/v2/ich/sitzungen', token), env, params: {} })).json()) as { sitzungen: { geraet: string; diese?: boolean }[] }
    expect(s.sitzungen).toEqual([expect.objectContaining({ geraet: 'android', diese: true })])
    expect(env.WEP_DB.roh.prepare("SELECT aktion, details FROM protokoll WHERE aktion = 'anmeldung_app'").get()).toEqual({ aktion: 'anmeldung_app', details: 'android' })
  })

  it('Windows: Loopback-Rücksprung, Sitzung „windows“', async () => {
    const env = umgebung()
    const a = await appAnmeldung(env, { ruecksprung: 'http://127.0.0.1:53817/' })
    expect(a.ort.origin).toBe('http://127.0.0.1:53817')
    const t = (await (await einloesen(env, a.ort.searchParams.get('code')!, a.verifier)).json()) as { token: string }
    const s = (await (await sitzungen({ request: ausApp('/api/v2/ich/sitzungen', t.token), env, params: {} })).json()) as { sitzungen: { geraet: string }[] }
    expect(s.sitzungen[0].geraet).toBe('windows')
  })

  it('Code: nur einmal, nur mit passendem Verifier (danach verbraucht), höchstens 60 Sekunden', async () => {
    const env = umgebung()
    const a = await appAnmeldung(env)
    const code = a.ort.searchParams.get('code')!
    const falsch = await einloesen(env, code, (await pkce()).verifier)
    expect(falsch.status).toBe(400)
    expect(await falsch.json()).toMatchObject({ fehler: expect.stringMatching(/Prüfwert passt nicht/) })
    expect((await einloesen(env, code, a.verifier)).status).toBe(400) // verbraucht
    const b = await appAnmeldung(env)
    const code2 = b.ort.searchParams.get('code')!
    expect(await loeseAppCodeEin(env.WEP_DB, code2, b.verifier, Date.now() + 61_000)).toMatchObject({ ok: false, fehler: expect.stringMatching(/abgelaufen/) })
    const c = await appAnmeldung(env)
    expect((await einloesen(env, c.ort.searchParams.get('code')!, c.verifier)).status).toBe(200)
    expect((await einloesen(env, c.ort.searchParams.get('code')!, c.verifier)).status).toBe(400) // Wiederverwendung
    expect((await einloesen(env, 'ausgedacht', c.verifier)).status).toBe(400)
  })

  it('falscher state beim Rücksprung von Google: kein Code; Fehler des Anbieters gehen mit state zurück in die App', async () => {
    const env = umgebung()
    const a = await appAnmeldung(env, { falscherState: true })
    expect(a.ort.searchParams.get('code')).toBeNull()
    expect(a.ort.origin).toBe(ORIGIN) // ohne gültigen Vorgang: nicht in irgendeine App
    const b = await appAnmeldung(env, { anbieterFehler: 'access_denied' })
    expect(`${b.ort.protocol}//${b.ort.host}${b.ort.pathname}`).toBe(RUECKSPRUNG_ANDROID)
    expect(b.ort.searchParams.get('error')).toBe('Anmeldung abgebrochen.')
    expect(b.ort.searchParams.get('state')).toBe(b.appState)
    expect(b.ort.searchParams.get('code')).toBeNull()
  })
})

describe('Bearer auf den v2-Endpunkten', () => {
  it('Liste, Speichern, Laden, Foto hoch- und herunterladen, Benachrichtigungen – mit Bearer aus der App, ohne Cookie', async () => {
    const env = umgebung()
    const t = await token(env, { email: 'admin@example.org', sub: 'g-admin' }) // erster Admin: freigegeben
    const kontoId = (env.WEP_DB.roh.prepare("SELECT id FROM konten WHERE email = 'admin@example.org'").get() as { id: string }).id
    env.WEP_DB.roh.prepare("UPDATE konten SET rollen = 'bau,admin' WHERE id = ?").run(kontoId)
    expect((await wepListe({ request: ausApp('/api/v2/weps', t), env, params: {} })).status).toBe(200)
    const wep = { id: 'w-app', formalien: { vorgangsNr: '2026-0815', kleingartenanlage: 'KGA Musterwiese', parzelle: '12' }, gruen: { aussenanlagen: [], aufwuchs: [], beseitigungAA: [], beschreibungAussen: '', beschreibungAufwuchs: '' }, fotos: [{ id: 'f1' }] }
    const put = await wepSpeichern({ request: ausApp('/api/v2/weps/w-app', t, { method: 'PUT', body: JSON.stringify({ wep, basisRev: 0 }) }), env, params: { id: 'w-app' } })
    expect(put.status).toBe(200)
    expect((await wepHolen({ request: ausApp('/api/v2/weps/w-app', t), env, params: { id: 'w-app' } })).status).toBe(200)
    const hoch = await dateiHochladen({ request: ausApp('/api/v2/weps/w-app/dateien/foto-f1.jpg', t, { method: 'PUT', body: new Uint8Array([0xff, 0xd8, 1, 2]), headers: { 'content-type': 'image/jpeg' } }), env, params: { id: 'w-app', datei: 'foto-f1.jpg' } })
    expect(hoch.status).toBe(200)
    const runter = await dateiHolen({ request: ausApp('/api/v2/weps/w-app/dateien/foto-f1.jpg', t), env, params: { id: 'w-app', datei: 'foto-f1.jpg' } })
    expect([...new Uint8Array(await runter.arrayBuffer())]).toEqual([0xff, 0xd8, 1, 2])
    expect((await benachrichtigungen({ request: ausApp('/api/v2/benachrichtigungen', t), env, params: {} })).status).toBe(200)
    expect((await kontenListe({ request: ausApp('/api/v2/admin/konten', t), env, params: {} })).status).toBe(200)
    // ohne Token: nicht angemeldet
    expect((await wepListe({ request: new Request(`${ORIGIN}/api/v2/weps`, { headers: { origin: APP_ORIGIN } }), env, params: {} })).status).toBe(401)
  })
})

describe('Widerruf', () => {
  it('Abmelden widerruft das Token; eine andere Sitzung lässt sich im Profil beenden; Admin: „abmelden“ und Sperren beenden App-Sitzungen', async () => {
    const env = umgebung()
    const t1 = await token(env)
    const t2 = await token(env, { ruecksprung: 'http://127.0.0.1:53817/' })
    const t3 = await token(env)
    expect((await abmelden({ request: ausApp('/api/v2/abmelden', t1, { method: 'POST' }), env, params: {} })).status).toBe(200)
    expect((await ich({ request: ausApp('/api/v2/ich', t1), env, params: {} })).status).toBe(401)
    // t3 beendet die Windows-Sitzung (t2)
    const liste = (await (await sitzungen({ request: ausApp('/api/v2/ich/sitzungen', t3), env, params: {} })).json()) as { sitzungen: { id: string; geraet: string }[] }
    const windows = liste.sitzungen.find((s) => s.geraet === 'windows')!
    expect((await sitzungBeenden({ request: ausApp(`/api/v2/ich/sitzungen?id=${windows.id}`, t3, { method: 'DELETE' }), env, params: {} })).status).toBe(200)
    expect((await ich({ request: ausApp('/api/v2/ich', t2), env, params: {} })).status).toBe(401)
    expect((await ich({ request: ausApp('/api/v2/ich', t3), env, params: {} })).status).toBe(200)
    // Admin sieht die App-Sitzung von Bert und beendet sie („abmelden“), ohne zu sperren
    const admin = await token(env, { email: 'admin@example.org', sub: 'g-admin' })
    const bertId = (env.WEP_DB.roh.prepare("SELECT id FROM konten WHERE email = 'bert@example.org'").get() as { id: string }).id
    const konten = (await (await kontenListe({ request: ausApp('/api/v2/admin/konten', admin), env, params: {} })).json()) as { konten: { id: string; sitzungen: { geraet: string }[] }[] }
    expect(konten.konten.find((k) => k.id === bertId)?.sitzungen.map((s) => s.geraet)).toEqual(['android'])
    const r = await kontoAktion({ request: ausApp(`/api/v2/admin/konten/${bertId}`, admin, { method: 'POST', body: JSON.stringify({ aktion: 'abmelden' }) }), env, params: { id: bertId } })
    expect(r.status).toBe(200)
    expect((await ich({ request: ausApp('/api/v2/ich', t3), env, params: {} })).status).toBe(401)
    expect(env.WEP_DB.roh.prepare('SELECT status FROM konten WHERE id = ?').get(bertId)).toEqual({ status: 'wartet' })
    // Sperren beendet App-Sitzungen ebenso
    const t4 = await token(env)
    await kontoAktion({ request: ausApp(`/api/v2/admin/konten/${bertId}`, admin, { method: 'POST', body: JSON.stringify({ aktion: 'sperren' }) }), env, params: { id: bertId } })
    expect((await ich({ request: ausApp('/api/v2/ich', t4), env, params: {} })).status).toBe(401)
  })
})
