// Durchlauf v2 im echten Browser (Chromium) gegen den echten Server-Code: Die App wird mit VITE_SERVER_MODUS=true
// gebaut; Anfragen an /api/v2/* beantworten die Pages Functions aus functions/ mit einer SQLite-Datenbank (dieselben
// Migrationen wie D1). Google und Microsoft sind nachgebaut (Anmeldeseite leitet sofort zurück, Token mit Testschlüssel).
// Erfundene Konten: Ada Admin (Google, V2_ADMINS), Max Mustermann (Microsoft).
//
// Start: npm run v2:durchlauf
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { chromium, type Page, type Route } from 'playwright'
import { testDb } from '../../functions/_lib/__tests__/sqliteDb'
import * as status from '../../functions/api/v2/status'
import * as start from '../../functions/api/v2/anmeldung/[anbieter]/start'
import * as zurueck from '../../functions/api/v2/anmeldung/[anbieter]/zurueck'
import * as ich from '../../functions/api/v2/ich'
import * as abmelden from '../../functions/api/v2/abmelden'
import * as konten from '../../functions/api/v2/admin/konten'
import * as konto from '../../functions/api/v2/admin/konten/[id]'
import { onRequest as middleware } from '../../functions/api/v2/_middleware'

const PORT = 4183
const URL = `http://localhost:${PORT}/`
const AUSGABE = 'dist-e2e-v2'
const GOOGLE_ID = 'durchlauf.apps.googleusercontent.com'
const MS_ID = '11111111-2222-3333-4444-555555555555'
const TID = '0a1b2c3d-1111-2222-3333-444455556666'

const db = testDb()
const env = { SERVER_MODUS: 'true', WEP_DB: db, GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: 'g', VITE_MS_CLIENT_ID: MS_ID, MS_CLIENT_SECRET: 'm', V2_ADMINS: 'ada@example.org' }

// ── nachgebaute Anbieter ─────────────────────────────────────────────────────────────────────────────
const paar = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
const oeffentlich = (await crypto.subtle.exportKey('jwk', paar.publicKey)) as { n: string; e: string }
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url')
async function signiere(inhalt: object) {
  const kopf = b64(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })))
  const koerper = b64(new TextEncoder().encode(JSON.stringify(inhalt)))
  return `${kopf}.${koerper}.${b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', paar.privateKey, new TextEncoder().encode(`${kopf}.${koerper}`))))}`
}
const PERSONEN = {
  ada: { anbieter: 'google', claims: { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'ada-1', email: 'ada@example.org', email_verified: true, name: 'Ada Admin' } },
  max: { anbieter: 'microsoft', claims: { iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: MS_ID, tid: TID, oid: 'max-1', preferred_username: 'max@bv.example', name: 'Max Mustermann' } },
} as const
let wer: keyof typeof PERSONEN = 'ada'
const codes = new Map<string, string>() // code → nonce

const echtesFetch = globalThis.fetch
globalThis.fetch = (async (eingabe: RequestInfo | URL, init?: RequestInit) => {
  const url = String(eingabe instanceof Request ? eingabe.url : eingabe)
  if (url.includes('/certs') || url.includes('/discovery/v2.0/keys')) return Response.json({ keys: [{ kid: 'k1', kty: 'RSA', n: oeffentlich.n, e: oeffentlich.e }] })
  if (url.startsWith('https://oauth2.googleapis.com/token') || url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/token')) {
    const code = new URLSearchParams(String(init?.body)).get('code') ?? ''
    return Response.json({ id_token: await signiere({ ...PERSONEN[wer].claims, nonce: codes.get(code), exp: Math.floor(Date.now() / 1000) + 3600 }) })
  }
  return echtesFetch(eingabe, init)
}) as typeof fetch

// ── Weiterleitung /api/v2/* an die Functions ─────────────────────────────────────────────────────────
type Modul = Record<string, unknown>
const ROUTEN: [RegExp, Modul, string?][] = [
  [/^\/api\/v2\/status$/, status],
  [/^\/api\/v2\/anmeldung\/([^/]+)\/start$/, start, 'anbieter'],
  [/^\/api\/v2\/anmeldung\/([^/]+)\/zurueck$/, zurueck, 'anbieter'],
  [/^\/api\/v2\/ich$/, ich],
  [/^\/api\/v2\/abmelden$/, abmelden],
  [/^\/api\/v2\/admin\/konten$/, konten],
  [/^\/api\/v2\/admin\/konten\/([^/]+)$/, konto, 'id'],
]
let serverWeg = false

async function beantworte(route: Route) {
  if (serverWeg) return route.abort('internetdisconnected')
  const anfrage = route.request()
  const url = new globalThis.URL(anfrage.url())
  const treffer = ROUTEN.map(([muster, modul, param]) => ({ m: muster.exec(url.pathname), modul, param })).find((t) => t.m)
  const methode = anfrage.method()
  const name = `onRequest${methode[0]}${methode.slice(1).toLowerCase()}`
  const handler = treffer?.modul[name] as ((ctx: unknown) => Promise<Response>) | undefined
  const request = new Request(anfrage.url(), { method: methode, headers: await anfrage.allHeaders(), body: ['GET', 'HEAD'].includes(methode) ? undefined : anfrage.postData() })
  const antwort = await middleware({
    env,
    next: async () => (handler ? handler({ request, env, params: treffer?.param ? { [treffer.param]: treffer.m![1] } : {} }) : Response.json({ fehler: 'Nicht gefunden.' }, { status: 404 })),
  })
  const kopf: Record<string, string> = {}
  antwort.headers.forEach((w, k) => k !== 'set-cookie' && k !== 'location' && (kopf[k] = w))
  const cookies = antwort.headers.getSetCookie()
  if (cookies.length) kopf['set-cookie'] = cookies.join('\n')
  const ort = antwort.headers.get('location')
  // Playwright fängt das Ziel einer Weiterleitung nicht mehr ab – daher leitet eine kleine Seite selbst weiter
  if (ort) return weiterleiten(route, ort, kopf)
  await route.fulfill({ status: antwort.status, headers: kopf, body: Buffer.from(await antwort.arrayBuffer()) })
}

function weiterleiten(route: Route, ziel: string, kopf: Record<string, string> = {}) {
  return route.fulfill({ status: 200, headers: { ...kopf, 'content-type': 'text/html' }, body: `<!doctype html><script>location.replace(${JSON.stringify(ziel)})</script>` })
}

/** Anmeldeseite des Anbieters: merkt die nonce zum Code und leitet sofort zurück. */
async function anbieterSeite(route: Route) {
  const url = new globalThis.URL(route.request().url())
  const code = `code-${codes.size + 1}`
  codes.set(code, url.searchParams.get('nonce') ?? '')
  const ziel = new globalThis.URL(url.searchParams.get('redirect_uri')!)
  ziel.searchParams.set('code', code)
  ziel.searchParams.set('state', url.searchParams.get('state') ?? '')
  await weiterleiten(route, ziel.toString())
}

// ── Prüfungen ────────────────────────────────────────────────────────────────────────────────────────
let fehler = 0
function pruefe(ok: boolean, text: string) {
  console.log(`${ok ? 'ok ' : 'FEHLER'} ${text}`)
  if (!ok) fehler++
}

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  return kandidaten.find((p) => existsSync(p))
}

async function anmelden(seite: Page, person: keyof typeof PERSONEN) {
  wer = person
  await seite.getByRole('link', { name: PERSONEN[person].anbieter === 'google' ? 'Mit Google anmelden' : 'Mit Microsoft anmelden' }).click()
}

execFileSync('npx', ['vite', 'build', '--outDir', AUSGABE], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', VITE_SERVER_MODUS: 'true', VITE_MS_CLIENT_ID: MS_ID } })
const server = spawn('npx', ['vite', 'preview', '--outDir', AUSGABE, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch({ executablePath: chromiumPfad() })
const skriptFehler: string[] = []
try {
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await kontext.route('**/api/v2/**', beantworte)
  await kontext.route(/^https:\/\/(accounts\.google\.com\/o\/oauth2|login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize)/, anbieterSeite)
  const seite = await kontext.newPage()
  seite.on('pageerror', (e) => skriptFehler.push(String(e)))

  // 1. Anmelde-Bildschirm
  await seite.goto(URL)
  await seite.getByRole('heading', { name: 'WEP-App' }).waitFor()
  pruefe(await seite.getByRole('note').getByText('v2-Vorschau – nur Testdaten').isVisible(), 'Band „v2-Vorschau – nur Testdaten“ steht oben')
  pruefe(await seite.getByRole('link', { name: 'Mit Google anmelden' }).isVisible(), 'Anmeldung mit Google angeboten')
  pruefe(await seite.getByRole('link', { name: 'Mit Microsoft anmelden' }).isVisible(), 'Anmeldung mit Microsoft angeboten')
  pruefe((await seite.getByText('Ohne Konto fortfahren').count()) === 0, 'kein „Ohne Konto fortfahren“ im Server-Modus')
  await seite.screenshot({ path: `${AUSGABE}/01-anmeldung.png` })

  // 2. Neues Konto (Microsoft) wartet auf Freigabe
  await anmelden(seite, 'max')
  await seite.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  pruefe(await seite.getByText(/max@bv\.example/).isVisible(), 'Max: Konto angelegt, wartet auf Freigabe')
  await seite.screenshot({ path: `${AUSGABE}/02-wartet.png` })
  await seite.getByRole('button', { name: 'Abmelden' }).click()
  await seite.getByRole('link', { name: 'Mit Google anmelden' }).waitFor()

  // 3. Erster Admin (V2_ADMINS) kommt direkt in die App, ohne OneDrive
  await anmelden(seite, 'ada')
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(true, 'Ada (erster Admin) landet direkt auf der Startseite')
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
  pruefe(await seite.getByText('Angemeldet als Ada Admin (ada@example.org) über Google').isVisible(), 'Profil: angemeldet über Google')
  pruefe(await seite.getByText('Rollen: Admin').isVisible(), 'Profil: Rolle Admin')
  pruefe((await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).count()) === 0, 'Profil: keine OneDrive-Anmeldung im Server-Modus')

  // 4. Mail-Benachrichtigung abschalten (bleibt auf dem Server)
  const mail = seite.getByLabel('Benachrichtigungen per E-Mail')
  pruefe(await mail.isChecked(), 'Mail-Benachrichtigung ist standardmäßig an')
  await mail.click()
  await seite.waitForTimeout(300)
  pruefe((db.roh.prepare("SELECT mail_benachrichtigung AS m FROM konten WHERE email = 'ada@example.org'").get() as { m: number }).m === 0, 'Mail-Benachrichtigung auf dem Server abgeschaltet')

  // 5. Konten verwalten: Max freigeben, Grün + BV
  await seite.getByRole('button', { name: 'Konten verwalten' }).click()
  await seite.getByRole('heading', { name: 'Konten verwalten' }).waitFor()
  const maxZeile = seite.locator('.konto-zeile', { hasText: 'Max Mustermann' })
  await maxZeile.waitFor()
  pruefe(await maxZeile.getByText('wartet auf Freigabe').isVisible(), 'Konten: Max wartet auf Freigabe')
  pruefe((await seite.locator('.konto-zeile').first().textContent())?.includes('Max Mustermann') ?? false, 'Konten: wartende stehen oben')
  await maxZeile.getByRole('button', { name: 'Freigeben' }).click()
  await maxZeile.getByText('freigegeben', { exact: true }).waitFor()
  pruefe(await maxZeile.getByText(/Noch ohne Rolle/).isVisible(), 'Konten: Hinweis „noch ohne Rolle“')
  await maxZeile.getByLabel('Wertermittler').selectOption('gruen')
  await seite.waitForTimeout(300)
  // Die Haken folgen der Antwort des Servers
  await maxZeile.getByLabel('BV').click()
  await maxZeile.locator('input[type=checkbox]:checked').waitFor()
  pruefe((db.roh.prepare("SELECT rollen FROM konten WHERE email = 'max@bv.example'").get() as { rollen: string }).rollen === 'gruen,bv', 'Konten: Max ist Grün und BV (auf dem Server)')
  const adaZeile = seite.locator('.konto-zeile', { hasText: 'Ada Admin' })
  pruefe(await adaZeile.getByLabel('Admin').isDisabled(), 'Konten: eigene Admin-Rolle nicht abwählbar')
  pruefe((await adaZeile.getByRole('button', { name: 'Sperren' }).count()) === 0, 'Konten: eigenes Konto nicht sperrbar')
  await seite.screenshot({ path: `${AUSGABE}/03-konten.png`, fullPage: true })

  // 6. Abmelden, Max meldet sich an und kommt in die App
  await seite.getByRole('button', { name: 'Profil', exact: true }).first().click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
  await seite.getByRole('button', { name: 'Abmelden' }).click()
  await anmelden(seite, 'max')
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText('Rollen: Grün, BV').isVisible(), 'Max: freigegeben mit Rollen Grün, BV')
  pruefe((await seite.getByRole('button', { name: 'Konten verwalten' }).count()) === 0, 'Max: keine Konten-Verwaltung (kein Admin)')

  // 7. Ohne Verbindung zum Server: Start mit dem zuletzt bestätigten Konto
  serverWeg = true
  await seite.reload()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText(/Ohne Verbindung zum Server/).isVisible(), 'ohne Netz: App startet mit gemerktem Konto')
  serverWeg = false

  // 8. Gesperrt: Sitzung endet, neue Anmeldung wird abgewiesen
  const adaId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'ada@example.org'").get() as { id: string }).id
  const maxId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'max@bv.example'").get() as { id: string }).id
  const { fuehreAdminAktionAus, ladeKonto } = await import('../../functions/_lib/v2/konten')
  await fuehreAdminAktionAus(db, (await ladeKonto(db, adaId))!, (await ladeKonto(db, maxId))!, { aktion: 'sperren' })
  await seite.reload()
  await seite.getByRole('link', { name: 'Mit Microsoft anmelden' }).waitFor()
  pruefe(true, 'gesperrt: Sitzung beendet, zurück zur Anmeldung')
  await anmelden(seite, 'max')
  await seite.getByText(/Das Konto ist gesperrt/).waitFor()
  pruefe(true, 'gesperrt: Anmeldung zeigt „Das Konto ist gesperrt“')
  pruefe(!seite.url().includes('anmeldefehler'), 'Meldung aus der Adresse entfernt')

  const protokoll = (db.roh.prepare('SELECT aktion FROM protokoll').all() as { aktion: string }[]).map((p) => p.aktion)
  pruefe(['konto_angelegt', 'anmeldung', 'abmeldung', 'admin_freigeben', 'admin_rollen', 'admin_sperren'].every((a) => protokoll.includes(a)), 'Zugriffsprotokoll enthält Anmeldungen und Admin-Aktionen')
  pruefe(skriptFehler.length === 0, `keine Skriptfehler im Browser ${skriptFehler.join(' | ')}`)
} finally {
  await browser.close()
  server.kill()
}
if (fehler) {
  console.error(`${fehler} Prüfung(en) fehlgeschlagen`)
  process.exit(1)
}
console.log('Durchlauf v2 erfolgreich')
