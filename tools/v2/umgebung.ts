// Testumgebung für v2 im echten Browser: Die App wird mit VITE_SERVER_MODUS=true gebaut; Anfragen an /api/v2/*
// beantworten die echten Pages Functions aus functions/ mit einer SQLite-Datenbank (dieselben Migrationen wie D1) und
// einem R2-Ersatz. Google, Microsoft und Resend sind nachgebaut (Anmeldeseite leitet sofort zurück, Token mit
// Testschlüssel, Mails werden nur mitgeschrieben). Genutzt von tools/v2/durchlauf.ts und tools/anleitung-v2/.
// Alle Konten und Daten sind erfunden.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { chromium, type BrowserContextOptions, type Page, type Route } from 'playwright'
import { testDb } from '../../functions/_lib/__tests__/sqliteDb'
import { fakeR2 } from '../../functions/_lib/__tests__/fakeR2'
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
import * as wepDatei from '../../functions/api/v2/weps/[id]/dateien/[datei]'
import * as wepAktion from '../../functions/api/v2/weps/[id]/aktion'
import * as wepZusammen from '../../functions/api/v2/weps/[id]/zusammenfuehren'
import * as wepZurueck from '../../functions/api/v2/weps/[id]/zusammenfuehren-zuruecknehmen'
import * as gruenKontenListe from '../../functions/api/v2/konten/gruen'
import * as benListe from '../../functions/api/v2/benachrichtigungen'
import * as benGelesen from '../../functions/api/v2/benachrichtigungen/gelesen'
import { onRequest as middleware } from '../../functions/api/v2/_middleware'
import { fuehreAdminAktionAus, ladeKonto, type Rolle } from '../../functions/_lib/v2/konten'

const GOOGLE_ID = 'durchlauf.apps.googleusercontent.com'
const MS_ID = '11111111-2222-3333-4444-555555555555'
const TID = '0a1b2c3d-1111-2222-3333-444455556666'

/** Erfundene Personen (Anbieter und ID-Token-Ansprüche). Ada steht in V2_ADMINS. */
export const PERSONEN = {
  ada: { anbieter: 'google', claims: { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'ada-1', email: 'ada@example.org', email_verified: true, name: 'Ada Admin' } },
  max: { anbieter: 'microsoft', claims: { iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: MS_ID, tid: TID, oid: 'max-1', preferred_username: 'max@bv.example', name: 'Max Mustermann' } },
  bert: { anbieter: 'google', claims: { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'bert-1', email: 'bert@example.org', email_verified: true, name: 'Bert Bauer' } },
  erika: { anbieter: 'google', claims: { iss: 'https://accounts.google.com', aud: GOOGLE_ID, sub: 'erika-1', email: 'erika@example.org', email_verified: true, name: 'Erika Musterfrau' } },
  bea: { anbieter: 'microsoft', claims: { iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: MS_ID, tid: TID, oid: 'bea-1', preferred_username: 'bea@bv.example', name: 'Bea BV' } },
} as const
export type Person = keyof typeof PERSONEN

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  return kandidaten.find((p) => existsSync(p))
}

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
  [/^\/api\/v2\/weps\/([^/]+)\/dateien\/([^/]+)$/, wepDatei, 'id', 'datei'],
  [/^\/api\/v2\/weps\/([^/]+)\/aktion$/, wepAktion, 'id'],
  [/^\/api\/v2\/weps\/([^/]+)\/zusammenfuehren$/, wepZusammen, 'id'],
  [/^\/api\/v2\/weps\/([^/]+)\/zusammenfuehren-zuruecknehmen$/, wepZurueck, 'id'],
  [/^\/api\/v2\/konten\/gruen$/, gruenKontenListe],
  [/^\/api\/v2\/benachrichtigungen$/, benListe],
  [/^\/api\/v2\/benachrichtigungen\/gelesen$/, benGelesen],
]
const ANBIETER_SEITEN = /^https:\/\/(accounts\.google\.com\/o\/oauth2|login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize)/

export async function starteV2Umgebung(opt: { port: number; ausgabe: string }) {
  const URL = `http://localhost:${opt.port}/`
  const db = testDb()
  const r2 = fakeR2()
  const env = { SERVER_MODUS: 'true', WEP_DB: db, WEP_DATEIEN: r2, RESEND_API_KEY: 're_durchlauf', MAIL_ABSENDER: 'WEP-App <wep@mail.example.org>', GOOGLE_CLIENT_ID: GOOGLE_ID, GOOGLE_CLIENT_SECRET: 'g', VITE_MS_CLIENT_ID: MS_ID, MS_CLIENT_SECRET: 'm', V2_ADMINS: 'ada@example.org' }

  // nachgebaute Anbieter und Resend
  const paar = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const oeffentlich = (await crypto.subtle.exportKey('jwk', paar.publicKey)) as { n: string; e: string }
  const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url')
  async function signiere(inhalt: object) {
    const kopf = b64(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })))
    const koerper = b64(new TextEncoder().encode(JSON.stringify(inhalt)))
    return `${kopf}.${koerper}.${b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', paar.privateKey, new TextEncoder().encode(`${kopf}.${koerper}`))))}`
  }
  let wer: Person = 'ada'
  const codes = new Map<string, string>() // code → nonce
  const mails: { to: string[]; subject: string; text: string }[] = []
  const echtesFetch = globalThis.fetch
  globalThis.fetch = (async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const url = String(eingabe instanceof Request ? eingabe.url : eingabe)
    if (url === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(String(init?.body)))
      return Response.json({ id: `mail-${mails.length}` })
    }
    if (url.includes('/certs') || url.includes('/discovery/v2.0/keys')) return Response.json({ keys: [{ kid: 'k1', kty: 'RSA', n: oeffentlich.n, e: oeffentlich.e }] })
    if (url.startsWith('https://oauth2.googleapis.com/token') || url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/token')) {
      const code = new URLSearchParams(String(init?.body)).get('code') ?? ''
      return Response.json({ id_token: await signiere({ ...PERSONEN[wer].claims, nonce: codes.get(code), exp: Math.floor(Date.now() / 1000) + 3600 }) })
    }
    return echtesFetch(eingabe, init)
  }) as typeof fetch

  let serverWeg = false

  function weiterleiten(route: Route, ziel: string, kopf: Record<string, string> = {}) {
    return route.fulfill({ status: 200, headers: { ...kopf, 'content-type': 'text/html' }, body: `<!doctype html><script>location.replace(${JSON.stringify(ziel)})</script>` })
  }

  /** Weiterleitung /api/v2/* an die Functions (wie Cloudflare Pages, mit derselben Middleware). */
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
    const antwort = await middleware({ env, next: async () => (handler ? handler({ request, env, params }) : Response.json({ fehler: 'Nicht gefunden.' }, { status: 404 })) })
    const kopf: Record<string, string> = {}
    antwort.headers.forEach((w, k) => k !== 'set-cookie' && k !== 'location' && (kopf[k] = w))
    const cookies = antwort.headers.getSetCookie()
    if (cookies.length) kopf['set-cookie'] = cookies.join('\n')
    const ort = antwort.headers.get('location')
    // Playwright fängt das Ziel einer Weiterleitung nicht mehr ab – daher leitet eine kleine Seite selbst weiter
    if (ort) return weiterleiten(route, ort, kopf)
    await route.fulfill({ status: antwort.status, headers: kopf, body: Buffer.from(await antwort.arrayBuffer()) })
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

  execFileSync('npx', ['vite', 'build', '--outDir', opt.ausgabe], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', VITE_SERVER_MODUS: 'true', VITE_MS_CLIENT_ID: MS_ID } })
  const vorschau = spawn('npx', ['vite', 'preview', '--outDir', opt.ausgabe, '--port', String(opt.port), '--strictPort'], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 2500))
  const browser = await chromium.launch({ executablePath: chromiumPfad() })

  return {
    URL,
    db,
    r2,
    mails,
    browser,
    /** Server nicht erreichbar (Abbruch wie ohne Netz). */
    setzeServerWeg: (weg: boolean) => (serverWeg = weg),
    /** Neues Gerät (eigener Browser-Kontext, ohne Service Worker) mit Weiterleitung an die Functions. */
    async neuerKontext(o: BrowserContextOptions = {}) {
      const k = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...o })
      await k.route('**/api/v2/**', beantworte)
      await k.route(ANBIETER_SEITEN, anbieterSeite)
      return k
    },
    /** Auf dem Anmelde-Bildschirm anmelden (die Anmeldung beim Anbieter läuft nachgebaut sofort durch). */
    async anmelden(seite: Page, person: Person) {
      wer = person
      await seite.getByRole('link', { name: PERSONEN[person].anbieter === 'google' ? 'Mit Google anmelden' : 'Mit Microsoft anmelden' }).click()
    },
    /** Ein Admin (Ada) gibt das Konto frei und vergibt Rollen – wie auf der Admin-Seite. */
    async freigeben(email: string, rollen: Rolle[]) {
      const ada = await ladeKonto(db, (db.roh.prepare("SELECT id FROM konten WHERE email = 'ada@example.org'").get() as { id: string }).id)
      const ziel = (db.roh.prepare('SELECT id FROM konten WHERE email = ?').get(email) as { id: string } | undefined)?.id
      if (!ada || !ziel) throw new Error(`Konto ${email} (oder Ada) gibt es noch nicht`)
      await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, ziel))!, { aktion: 'freigeben' })
      await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, ziel))!, { aktion: 'rollen', rollen })
    },
    async schliessen() {
      await browser.close()
      vorschau.kill()
      globalThis.fetch = echtesFetch
    },
  }
}
