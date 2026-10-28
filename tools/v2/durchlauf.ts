// Durchlauf v2 im echten Browser (Chromium) gegen den echten Server-Code: Die App wird mit VITE_SERVER_MODUS=true
// gebaut; Anfragen an /api/v2/* beantworten die Pages Functions aus functions/ mit einer SQLite-Datenbank (dieselben
// Migrationen wie D1). Google und Microsoft sind nachgebaut (Anmeldeseite leitet sofort zurück, Token mit Testschlüssel).
// Erfundene Konten: Ada Admin (Google, V2_ADMINS), Max Mustermann (Microsoft), Bert Bauer (Google, Bau).
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
import * as wepListe from '../../functions/api/v2/weps'
import * as wepEinzeln from '../../functions/api/v2/weps/[id]'
import * as wepWieder from '../../functions/api/v2/weps/[id]/wiederherstellen'
import * as wepVerlauf from '../../functions/api/v2/weps/[id]/verlauf'
import * as wepDateien from '../../functions/api/v2/weps/[id]/dateien'
import * as wepAktion from '../../functions/api/v2/weps/[id]/aktion'
import * as gruenKontenListe from '../../functions/api/v2/konten/gruen'
import * as wepDatei from '../../functions/api/v2/weps/[id]/dateien/[datei]'
import { fakeR2 } from '../../functions/_lib/__tests__/fakeR2'
// @ts-expect-error – JavaScript-Hilfe ohne Typen (gemaltes Testbild, kein echtes Foto)
import { testFoto } from '../fotos/testbild.mjs'
import { onRequest as middleware } from '../../functions/api/v2/_middleware'
import { fuehreAdminAktionAus, ladeKonto } from '../../functions/_lib/v2/konten'

const PORT = 4183
const URL = `http://localhost:${PORT}/`
const AUSGABE = 'dist-e2e-v2'
const GOOGLE_ID = 'durchlauf.apps.googleusercontent.com'
const MS_ID = '11111111-2222-3333-4444-555555555555'
const TID = '0a1b2c3d-1111-2222-3333-444455556666'

const db = testDb()
const r2 = fakeR2()
const env = { SERVER_MODUS: 'true', WEP_DB: db, WEP_DATEIEN: r2, GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: 'g', VITE_MS_CLIENT_ID: MS_ID, MS_CLIENT_SECRET: 'm', V2_ADMINS: 'ada@example.org' }

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
  bert: { anbieter: 'google', claims: { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'bert-1', email: 'bert@example.org', email_verified: true, name: 'Bert Bauer' } },
  erika: { anbieter: 'google', claims: { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'erika-1', email: 'erika@example.org', email_verified: true, name: 'Erika Musterfrau' } },
  bea: { anbieter: 'microsoft', claims: { iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: MS_ID, tid: TID, oid: 'bea-1', preferred_username: 'bea@bv.example', name: 'Bea BV' } },
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
const ROUTEN: [RegExp, Modul, string?, string?][] = [
  [/^\/api\/v2\/status$/, status],
  [/^\/api\/v2\/anmeldung\/([^/]+)\/start$/, start, 'anbieter'],
  [/^\/api\/v2\/anmeldung\/([^/]+)\/zurueck$/, zurueck, 'anbieter'],
  [/^\/api\/v2\/ich$/, ich],
  [/^\/api\/v2\/abmelden$/, abmelden],
  [/^\/api\/v2\/admin\/konten$/, konten],
  [/^\/api\/v2\/admin\/konten\/([^/]+)$/, konto, 'id'],
  [/^\/api\/v2\/weps$/, wepListe],
  [/^\/api\/v2\/weps\/([^/]+)$/, wepEinzeln, 'id'],
  [/^\/api\/v2\/weps\/([^/]+)\/wiederherstellen$/, wepWieder, 'id'],
  [/^\/api\/v2\/weps\/([^/]+)\/verlauf$/, wepVerlauf, 'id'],
  [/^\/api\/v2\/weps\/([^/]+)\/dateien$/, wepDateien, 'id'],
  [/^\/api\/v2\/weps\/([^/]+)\/aktion$/, wepAktion, 'id'],
  [/^\/api\/v2\/konten\/gruen$/, gruenKontenListe],
  [/^\/api\/v2\/weps\/([^/]+)\/dateien\/([^/]+)$/, wepDatei, 'id', 'datei'],
]
let serverWeg = false

async function beantworte(route: Route) {
  if (serverWeg) return route.abort('internetdisconnected')
  const anfrage = route.request()
  const url = new globalThis.URL(anfrage.url())
  const treffer = ROUTEN.map(([muster, modul, param, param2]) => ({ m: muster.exec(url.pathname), modul, param, param2 })).find((t) => t.m)
  const methode = anfrage.method()
  const name = `onRequest${methode[0]}${methode.slice(1).toLowerCase()}`
  const handler = treffer?.modul[name] as ((ctx: unknown) => Promise<Response>) | undefined
  const request = new Request(anfrage.url(), { method: methode, headers: await anfrage.allHeaders(), body: ['GET', 'HEAD'].includes(methode) ? undefined : anfrage.postDataBuffer() })
  const params: Record<string, string> = {}
  if (treffer?.param) params[treffer.param] = decodeURIComponent(treffer.m![1])
  if (treffer?.param2) params[treffer.param2] = decodeURIComponent(treffer.m![2])
  const antwort = await middleware({
    env,
    next: async () =>
      handler ? handler({ request, env, params }) : Response.json({ fehler: 'Nicht gefunden.' }, { status: 404 }),
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

async function neuesWep(seite: Page, nr: string) {
  await seite.getByRole('button', { name: 'Neues WEP', exact: true }).first().click()
  const dlg = seite.getByRole('dialog', { name: 'Neues WEP' })
  await dlg.getByLabel(/Vorgangs-Nr/).fill(nr)
  await dlg.getByRole('button', { name: 'Anlegen' }).click()
  await seite.getByLabel(/Kleingartenanlage/).first().waitFor()
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
  await fuehreAdminAktionAus(db, (await ladeKonto(db, adaId))!, (await ladeKonto(db, maxId))!, { aktion: 'sperren' })
  await seite.reload()
  await seite.getByRole('link', { name: 'Mit Microsoft anmelden' }).waitFor()
  pruefe(true, 'gesperrt: Sitzung beendet, zurück zur Anmeldung')
  await anmelden(seite, 'max')
  await seite.getByText(/Das Konto ist gesperrt/).waitFor()
  pruefe(true, 'gesperrt: Anmeldung zeigt „Das Konto ist gesperrt“')
  pruefe(!seite.url().includes('anmeldefehler'), 'Meldung aus der Adresse entfernt')

  // 9. WEPs auf dem Server: Bert (Bau) legt an, sein zweites Gerät bekommt es; ohne Server wartet die Änderung
  await anmelden(seite, 'bert')
  await seite.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  const bertId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'bert@example.org'").get() as { id: string }).id
  const ada = (await ladeKonto(db, adaId))!
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, bertId))!, { aktion: 'freigeben' })
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, bertId))!, { aktion: 'rollen', rollen: ['bau'] })
  await seite.getByRole('button', { name: 'Erneut prüfen' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await neuesWep(seite, '2026-0815')
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  const aufServer = async (n: number) => {
    for (let i = 0; i < 50; i++) {
      if ((db.roh.prepare('SELECT count(*) AS n FROM weps').get() as { n: number }).n === n) return true
      await seite.waitForTimeout(100)
    }
    return false
  }
  pruefe(await aufServer(1), 'WEP nach dem Anlegen auf dem Server')
  pruefe((db.roh.prepare('SELECT vorgangs_nr, bau_konto, zustand FROM weps').get() as { vorgangs_nr: string; bau_konto: string; zustand: string }).bau_konto === bertId, 'Server: Bert ist Besitzer, Zustand „bau_in_arbeit“')
  await seite.getByText(/Abgeglichen um/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'Statuszeile: mit dem Server abgeglichen')
  pruefe(await seite.locator('.zeile', { hasText: '2026-0815' }).getByText('Bau', { exact: true }).isVisible(), 'neues WEP ist ein Bau-WEP (Rolle vom Server)')

  const geraetB = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' })
  await geraetB.route('**/api/v2/**', beantworte)
  await geraetB.route(/^https:\/\/(accounts\.google\.com\/o\/oauth2|login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize)/, anbieterSeite)
  const seiteB = await geraetB.newPage()
  seiteB.on('pageerror', (e) => skriptFehler.push(String(e)))
  await seiteB.goto(URL)
  await anmelden(seiteB, 'bert')
  await seiteB.getByRole('heading', { name: 'Protokolle' }).first().waitFor()
  await seiteB.getByText(/2026-0815/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'zweites Gerät (Tablet): WEP vom Server ist da')
  await seiteB.screenshot({ path: `${AUSGABE}/04-zweites-geraet.png` })

  serverWeg = true
  await neuesWep(seite, '2026-0816')
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByText(/1 Änderung wartet auf den Server/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'ohne Server: neues WEP wartet („1 Änderung wartet auf den Server“)')
  serverWeg = false
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  pruefe(await aufServer(2), 'Server wieder da: wartende Änderung hochgeladen')
  await seiteB.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteB.getByText(/2026-0816/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'zweites Gerät bekommt auch das zweite WEP')

  // 10. Foto: auf Gerät A aufgenommen, liegt danach auf dem Server und erscheint auf Gerät B
  await seite.getByRole('button', { name: /2026-0815/ }).first().click()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Fotos' }).click()
  await seite.locator('input[type=file][aria-label="Fotos aus der Galerie wählen: Gesamtansicht"]').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: testFoto({ breite: 1600, hoehe: 1200, variante: 0 }) })
  await seite.locator('.foto-kachel').first().waitFor({ timeout: 30000 })
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  let fotoAufServer = false
  for (let i = 0; i < 50 && !fotoAufServer; i++) {
    fotoAufServer = [...r2.daten.keys()].some((k) => /^weps\/[^/]+\/fotos\/.+\.jpg$/.test(k))
    if (!fotoAufServer) await seite.waitForTimeout(100)
  }
  pruefe(fotoAufServer, 'Foto nach dem Abgleich auf dem Server (R2)')
  await seiteB.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteB.waitForTimeout(500)
  await seiteB.getByRole('button', { name: /2026-0815/ }).first().click()
  await seiteB.getByRole('button', { name: 'Fotos', exact: true }).filter({ visible: true }).first().click()
  await seiteB.locator('.foto-kachel img').first().waitFor({ timeout: 15000 })
  pruefe(true, 'zweites Gerät lädt das Foto vom Server')
  await seiteB.screenshot({ path: `${AUSGABE}/05-foto-vom-server.png` })

  // 11. Ablauf: Bert gibt an Erika (Grün) ab, Erika bearbeitet nur den Grün-Teil und gibt an den BV ab
  const zustandVon = (nr: string) => (db.roh.prepare('SELECT zustand FROM weps WHERE vorgangs_nr = ?').get(nr) as { zustand: string }).zustand
  const erikaKontext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await erikaKontext.route('**/api/v2/**', beantworte)
  await erikaKontext.route(/^https:\/\/(accounts\.google\.com\/o\/oauth2|login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize)/, anbieterSeite)
  const seiteE = await erikaKontext.newPage()
  seiteE.on('pageerror', (e) => skriptFehler.push(String(e)))
  await seiteE.goto(URL)
  await anmelden(seiteE, 'erika')
  await seiteE.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  const erikaId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'erika@example.org'").get() as { id: string }).id
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, erikaId))!, { aktion: 'freigeben' })
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, erikaId))!, { aktion: 'rollen', rollen: ['gruen'] })
  await seiteE.getByRole('button', { name: 'Erneut prüfen' }).click()
  await seiteE.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await seiteE.getByRole('button', { name: 'Neues WEP', exact: true }).count()) === 0, 'Grün: kein „Neues WEP“ (legt der Bau-Wertermittler an)')
  pruefe((await seiteE.getByText(/2026-0815/).count()) === 0, 'Grün sieht Berts Entwurf nicht')

  await seite.getByRole('button', { name: /2026-0815/ }).first().click()
  await seite.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Abgabe' }).waitFor()
  await seite.getByLabel('Grün-Wertermittler').selectOption({ label: 'Erika Musterfrau' })
  await seite.screenshot({ path: `${AUSGABE}/06-abgabe-an-gruen.png`, fullPage: true })
  await seite.getByRole('button', { name: 'An Grün abgeben' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seite.getByText('An Erika Musterfrau abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'gruen_in_arbeit', 'Server: nach der Abgabe „gruen_in_arbeit“')
  const formalienServer = JSON.parse((db.roh.prepare("SELECT daten FROM weps WHERE vorgangs_nr = '2026-0815'").get() as { daten: string }).daten).formalien
  pruefe(formalienServer.wertermittlerBaulichkeiten === 'Bert Bauer' && formalienServer.wertermittlerAussenAufwuchs === 'Erika Musterfrau', `Formalien: Wertermittler Bau/Grün sind Bert und Erika (${formalienServer.wertermittlerBaulichkeiten} / ${formalienServer.wertermittlerAussenAufwuchs}) – auch wenn vorher eine andere Person auf dem Gerät angemeldet war`)
  pruefe(await seite.getByText(/Das WEP ist abgegeben\. Du kannst es nur noch lesen/).isVisible(), 'Bau: nach der Abgabe nur noch lesen')
  const navBau = seite.getByRole('navigation', { name: 'Abschnitte' })
  pruefe((await navBau.getByRole('button').allTextContents()).join('|') === 'Übersicht', 'Bau: nach der Abgabe nur die Übersicht')

  await seiteE.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteE.getByText(/2026-0815/).filter({ visible: true }).first().waitFor()
  pruefe(await seiteE.locator('.zeile', { hasText: '2026-0815' }).getByText('Grün in Arbeit').isVisible(), 'Grün: WEP ist da, Zustand „Grün in Arbeit“')
  await seiteE.getByRole('button', { name: /2026-0815/ }).first().click()
  const navGruen = await seiteE.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button').allTextContents()
  pruefe(!navGruen.some((t) => /Formalien|Bauten|Mängel/.test(t)) && navGruen.some((t) => /Aufwuchs/.test(t)) && navGruen.some((t) => /Übersicht/.test(t)), `Grün: nur Grün-Teil und Übersicht (${navGruen.join(', ')})`)
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await seiteE.getByRole('button', { name: 'An den BV abgeben' }).click()
  await seiteE.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seiteE.getByText('An den BV abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'Server: nach Grüns Abgabe „beim_bv“')
  await seiteE.screenshot({ path: `${AUSGABE}/07-an-bv-abgegeben.png`, fullPage: true })
  const verlaufAblauf = (db.roh.prepare("SELECT v.aktion, v.zustand_nachher AS nachher FROM verlauf v JOIN weps w ON w.id = v.wep_id WHERE w.vorgangs_nr = '2026-0815' ORDER BY v.id").all() as { aktion: string; nachher: string | null }[])
    .filter((v) => v.nachher)
    .map((v) => `${v.aktion}→${v.nachher}`)
  pruefe(verlaufAblauf.join(' ') === 'angelegt→bau_in_arbeit an_gruen→gruen_in_arbeit an_bv→beim_bv', `Verlauf mit Zuständen: ${verlaufAblauf.join(' ')}`)
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seite.locator('.zeile', { hasText: '2026-0815' }).getByText('beim BV').waitFor()
  pruefe(true, 'Bau: Liste zeigt „beim BV“')

  // 12. BV-Kontrollseite mit Server-Daten: Rückfrage an Grün, Grün gibt wieder ab, geprüft, wieder öffnen
  const beaKontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
  await beaKontext.route('**/api/v2/**', beantworte)
  await beaKontext.route(/^https:\/\/(accounts\.google\.com\/o\/oauth2|login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize)/, anbieterSeite)
  const seiteV = await beaKontext.newPage()
  seiteV.on('pageerror', (e) => skriptFehler.push(String(e)))
  await seiteV.goto(`${URL}bv`)
  await anmelden(seiteV, 'bea')
  await seiteV.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  pruefe(seiteV.url().endsWith('/bv'), 'BV: nach der Anmeldung zurück auf /bv')
  const beaId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'bea@bv.example'").get() as { id: string }).id
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, beaId))!, { aktion: 'freigeben' })
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, beaId))!, { aktion: 'rollen', rollen: ['bv'] })
  await seiteV.getByRole('button', { name: 'Erneut prüfen' }).click()
  await seiteV.getByRole('heading', { name: 'Kontrollseite BV' }).waitFor()
  const zeileBv = seiteV.locator('.bv-zeile', { hasText: '2026-0815' })
  await zeileBv.waitFor()
  pruefe(await zeileBv.getByText('beim BV').isVisible(), 'BV: Tabelle zeigt das abgegebene WEP „beim BV“')
  pruefe((await seiteV.locator('.bv-zeile', { hasText: '2026-0816' }).count()) === 0, 'BV: Entwürfe (nicht abgegeben) erscheinen nicht')
  pruefe(await zeileBv.getByText('Bert Bauer / Erika Musterfrau').isVisible(), 'BV: Wertermittler Bau / Grün in der Tabelle')
  await seiteV.screenshot({ path: `${AUSGABE}/08-bv-liste.png` })
  await zeileBv.getByRole('button', { name: '2026-0815' }).click()
  await seiteV.getByRole('heading', { name: /2026-0815/ }).waitFor()
  const download = seiteV.waitForEvent('download')
  await seiteV.getByRole('button', { name: 'PDF übersichtlich' }).click()
  pruefe((await download).suggestedFilename().endsWith('.pdf'), 'BV: „PDF übersichtlich“ erzeugt das PDF (Daten vom Server)')
  await seiteV.getByRole('group', { name: 'Rückfrage an' }).getByRole('button', { name: 'Grün', exact: true }).click()
  await seiteV.getByLabel(/Notiz \(was soll geklärt werden/).fill('Hecke an der Straße fehlt')
  await seiteV.getByRole('button', { name: 'Rückfrage senden' }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Senden' }).click()
  await seiteV.getByText('Rückfrage gesendet.').waitFor()
  pruefe(zustandVon('2026-0815') === 'rueckfrage', 'Server: Rückfrage an Grün')
  await seiteV.screenshot({ path: `${AUSGABE}/09-bv-rueckfrage.png`, fullPage: true })

  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  await seiteE.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteE.locator('.zeile', { hasText: '2026-0815' }).getByText('Rückfrage').waitFor()
  await seiteE.getByRole('button', { name: /2026-0815/ }).first().click()
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  pruefe(await seiteE.getByText(/Hecke an der Straße fehlt/).isVisible(), 'Grün: sieht die Rückfrage mit Notiz')
  await seiteE.getByRole('button', { name: 'An den BV abgeben' }).click()
  await seiteE.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seiteE.getByText('An den BV abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'Grün gibt nach der Rückfrage wieder an den BV ab')

  await seiteV.getByRole('button', { name: 'Alle WEPs' }).click()
  await seiteV.getByRole('button', { name: 'Neu laden' }).click()
  await zeileBv.getByText('beim BV').waitFor()
  await zeileBv.getByRole('button', { name: '2026-0815' }).click()
  await seiteV.getByRole('button', { name: 'Geprüft', exact: true }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Geprüft' }).click()
  await seiteV.getByText('Als geprüft markiert.').waitFor()
  pruefe(zustandVon('2026-0815') === 'geprueft', 'BV: als geprüft markiert')
  await seiteV.getByLabel('Begründung zum Wieder öffnen').fill('Betrag Laube korrigieren')
  await seiteV.getByRole('button', { name: 'Wieder öffnen' }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Wieder öffnen' }).click()
  await seiteV.getByText('Wieder geöffnet.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'BV: mit Begründung wieder geöffnet')
  const notizen = (db.roh.prepare("SELECT v.aktion, v.notiz FROM verlauf v JOIN weps w ON w.id = v.wep_id WHERE w.vorgangs_nr = '2026-0815' AND v.notiz IS NOT NULL ORDER BY v.id").all() as { aktion: string; notiz: string }[]).map((v) => `${v.aktion}: ${v.notiz}`)
  pruefe(notizen.join(' | ') === 'rueckfrage: Hecke an der Straße fehlt | wiederoeffnen: Betrag Laube korrigieren', `Verlauf mit Notizen: ${notizen.join(' | ')}`)
  await beaKontext.close()
  await erikaKontext.close()
  const verlauf = (db.roh.prepare('SELECT aktion FROM verlauf ORDER BY id').all() as { aktion: string }[]).map((v) => v.aktion)
  pruefe(verlauf.filter((a) => a === 'angelegt').length === 2, 'Verlauf: „angelegt“ je WEP')
  await geraetB.close()

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
