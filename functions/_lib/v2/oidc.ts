// v2-Anmeldung mit Google und Microsoft (OpenID Connect, Authorization Code mit PKCE, state und nonce). Der Server
// tauscht den Code mit seinem Client-Geheimnis gegen das ID-Token und prüft es (Signatur, aud, iss, exp, nonce).
import { pruefeSignatur, SPIEL_S, TokenFehler, type Jwk } from '../idToken'
import type { V2Umgebung } from '../serverModus'

export type Anbieter = 'google' | 'microsoft'
export const ANBIETER: Anbieter[] = ['google', 'microsoft']
export const istAnbieter = (a: unknown): a is Anbieter => a === 'google' || a === 'microsoft'

/** Tenant der persönlichen Microsoft-Konten. */
export const MS_PERSOENLICH = '9188040d-6c67-4c5b-b112-36a304b66dad'

interface AnbieterDaten {
  autorisierung: string
  token: string
  jwks: string
  /** Zusätzliche Parameter der Autorisierung. */
  extra: Record<string, string>
}

export const ANBIETER_DATEN: Record<Anbieter, AnbieterDaten> = {
  google: {
    autorisierung: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    extra: { prompt: 'select_account' },
  },
  microsoft: {
    autorisierung: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    extra: { prompt: 'select_account', response_mode: 'query' },
  },
}

export function clientDaten(env: V2Umgebung, anbieter: Anbieter): { id: string; geheimnis: string } | undefined {
  const id = (anbieter === 'google' ? env.GOOGLE_CLIENT_ID : env.VITE_MS_CLIENT_ID)?.trim()
  const geheimnis = (anbieter === 'google' ? env.GOOGLE_CLIENT_SECRET : env.MS_CLIENT_SECRET)?.trim()
  return id && geheimnis ? { id, geheimnis } : undefined
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Zufallswert (URL-sicher) für state, nonce, PKCE und Sitzungs-Token. */
export const zufall = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

export async function sha256b64url(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

export const ruecksprung = (origin: string, anbieter: Anbieter) => `${origin}/api/v2/anmeldung/${anbieter}/zurueck`

export async function autorisierungsUrl(opt: { anbieter: Anbieter; clientId: string; origin: string; state: string; nonce: string; verifier: string }): Promise<string> {
  const d = ANBIETER_DATEN[opt.anbieter]
  const p = new URLSearchParams({
    client_id: opt.clientId,
    response_type: 'code',
    redirect_uri: ruecksprung(opt.origin, opt.anbieter),
    scope: 'openid email profile',
    state: opt.state,
    nonce: opt.nonce,
    code_challenge: await sha256b64url(opt.verifier),
    code_challenge_method: 'S256',
    ...d.extra,
  })
  return `${d.autorisierung}?${p}`
}

/** Tauscht den Code gegen das ID-Token. */
export async function holeIdToken(opt: {
  anbieter: Anbieter
  client: { id: string; geheimnis: string }
  origin: string
  code: string
  verifier: string
  laden?: typeof fetch
}): Promise<string> {
  const laden = opt.laden ?? fetch
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opt.code,
    client_id: opt.client.id,
    client_secret: opt.client.geheimnis,
    redirect_uri: ruecksprung(opt.origin, opt.anbieter),
    code_verifier: opt.verifier,
  })
  if (opt.anbieter === 'microsoft') body.set('scope', 'openid email profile')
  const r = await laden(ANBIETER_DATEN[opt.anbieter].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const daten = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string }
  if (!r.ok || !daten.id_token) throw new TokenFehler(`Anmeldung beim Anbieter fehlgeschlagen (${daten.error ?? r.status})`)
  return daten.id_token
}

const zwischenspeicher = new Map<string, { schluessel: Jwk[]; bis: number }>()

/** JWKS eines Anbieters (eine Stunde zwischengespeichert; `neu` lädt frisch, z. B. bei unbekannter `kid`). */
export function jwks(anbieter: Anbieter, laden: typeof fetch = fetch, jetzt = () => Date.now()) {
  return async (neu: boolean): Promise<Jwk[]> => {
    const url = ANBIETER_DATEN[anbieter].jwks
    const z = zwischenspeicher.get(url)
    if (!neu && z && z.bis > jetzt()) return z.schluessel
    const r = await laden(url)
    if (!r.ok) throw new TokenFehler(`Schlüssel des Anbieters nicht abrufbar (${r.status})`)
    const daten = (await r.json()) as { keys?: Jwk[] }
    const schluessel = (daten.keys ?? []).filter((k) => k.kty === 'RSA' && k.kid && k.n && k.e)
    zwischenspeicher.set(url, { schluessel, bis: jetzt() + 3600_000 })
    return schluessel
  }
}

/** Was aus dem ID-Token übernommen wird. */
export interface Identitaet {
  anbieter: Anbieter
  /** Google: sub; Microsoft: tid:oid. */
  subjekt: string
  name: string
  email: string
  /** E-Mail-Adresse ist vom Anbieter bestätigt (nur dann zählt sie für V2_ADMINS). */
  emailBestaetigt: boolean
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const SICHER = /^[A-Za-z0-9_-]{1,128}$/

export async function pruefeAnmeldeToken(
  token: string,
  opt: { anbieter: Anbieter; clientId: string; nonce: string; schluessel: (neu: boolean) => Promise<Jwk[]>; jetztS?: number },
): Promise<Identitaet> {
  const { inhalt } = await pruefeSignatur(token, opt.schluessel)
  const jetzt = opt.jetztS ?? Math.floor(Date.now() / 1000)
  const aud = inhalt.aud
  if (!opt.clientId || !(aud === opt.clientId || (Array.isArray(aud) && aud.includes(opt.clientId)))) throw new TokenFehler('Token ist nicht für diese App')
  // Mehrere Empfänger oder ein anderer „azp“: nur, wenn das Token für diese App ausgestellt wurde (Fund N15)
  if ((Array.isArray(aud) && aud.length > 1) || inhalt.azp !== undefined) {
    if (inhalt.azp !== opt.clientId) throw new TokenFehler('Token ist nicht für diese App (azp)')
  }
  if (!opt.nonce || inhalt.nonce !== opt.nonce) throw new TokenFehler('Anmeldung passt nicht zu dieser Sitzung (nonce)')
  const exp = Number(inhalt.exp)
  if (!Number.isFinite(exp) || exp + SPIEL_S < jetzt) throw new TokenFehler('Token abgelaufen')
  const nbf = Number(inhalt.nbf ?? 0)
  if (Number.isFinite(nbf) && nbf - SPIEL_S > jetzt) throw new TokenFehler('Token noch nicht gültig')
  const name = text(inhalt.name).slice(0, 200)

  if (opt.anbieter === 'google') {
    if (inhalt.iss !== 'https://accounts.google.com' && inhalt.iss !== 'accounts.google.com') throw new TokenFehler('Falscher Aussteller')
    const sub = text(inhalt.sub)
    if (!SICHER.test(sub)) throw new TokenFehler('Konto-Angaben fehlen')
    const email = text(inhalt.email).slice(0, 200)
    return { anbieter: 'google', subjekt: sub, name: name || email, email, emailBestaetigt: Boolean(email) && inhalt.email_verified === true }
  }

  const tid = text(inhalt.tid)
  const oid = text(inhalt.oid)
  if (!SICHER.test(tid) || !SICHER.test(oid)) throw new TokenFehler('Konto-Angaben fehlen')
  if (inhalt.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new TokenFehler('Falscher Aussteller')
  // preferred_username: bei persönlichen Konten die Anmeldeadresse, bei Geschäftskonten der UPN auf einer bestätigten
  // Domain des Tenants. Der Anspruch „email“ ist bei Microsoft nicht bestätigt und zählt deshalb nicht.
  const upn = text(inhalt.preferred_username).slice(0, 200)
  const email = upn.includes('@') ? upn : ''
  return { anbieter: 'microsoft', subjekt: `${tid}:${oid}`, name: name || email, email: email || text(inhalt.email).slice(0, 200), emailBestaetigt: Boolean(email) }
}
