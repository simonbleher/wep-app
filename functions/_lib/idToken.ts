// Microsoft-ID-Token serverseitig prüfen (BV-Kontrollseite, Ziel 4): Signatur (RS256) gegen die öffentlichen Schlüssel von
// Microsoft (JWKS), Empfänger (`aud` = Client-ID der App), Aussteller passend zum Tenant (`iss` = …/<tid>/v2.0), Ablauf.
// Ohne Abhängigkeiten, nur WebCrypto – läuft in Cloudflare Pages Functions und in Node (Tests).

export const JWKS_URL = 'https://login.microsoftonline.com/common/discovery/v2.0/keys'
/** Erlaubte Uhrabweichung zwischen Microsoft und Cloudflare. */
const SPIEL_S = 300

export interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
}

export interface GeprueftesToken {
  oid: string
  tid: string
  name: string
  email: string
}

export class TokenFehler extends Error {}

const b64url = (s: string): Uint8Array => {
  const roh = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  return Uint8Array.from(roh, (c) => c.charCodeAt(0))
}
const json = (s: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(b64url(s)))
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const SICHER = /^[A-Za-z0-9-]{1,64}$/

let zwischenspeicher: { schluessel: Jwk[]; bis: number } | undefined

/** Schlüssel von Microsoft (eine Stunde zwischengespeichert; bei unbekannter `kid` neu geholt). */
export async function microsoftSchluessel(laden: typeof fetch = fetch, jetzt = Date.now(), neu = false): Promise<Jwk[]> {
  if (!neu && zwischenspeicher && zwischenspeicher.bis > jetzt) return zwischenspeicher.schluessel
  const antwort = await laden(JWKS_URL)
  if (!antwort.ok) throw new TokenFehler(`Schlüssel von Microsoft nicht abrufbar (${antwort.status})`)
  const daten = (await antwort.json()) as { keys?: Jwk[] }
  const schluessel = (daten.keys ?? []).filter((k) => k.kty === 'RSA' && k.kid && k.n && k.e)
  zwischenspeicher = { schluessel, bis: jetzt + 3600_000 }
  return schluessel
}

/**
 * Prüft ein ID-Token. `schluessel` liefert die JWKS (`microsoftSchluessel`), mit `neu = true` frisch geladen.
 * Wirft `TokenFehler` mit kurzer Begründung, wenn etwas nicht stimmt.
 */
export async function pruefeIdToken(
  token: string,
  opt: { clientId: string; schluessel: (neu: boolean) => Promise<Jwk[]>; jetztS?: number },
): Promise<GeprueftesToken> {
  const teile = token.split('.')
  if (teile.length !== 3) throw new TokenFehler('Kein JWT')
  let kopf: Record<string, unknown>
  let inhalt: Record<string, unknown>
  try {
    kopf = json(teile[0])
    inhalt = json(teile[1])
  } catch {
    throw new TokenFehler('Token nicht lesbar')
  }
  if (kopf.alg !== 'RS256') throw new TokenFehler('Falscher Algorithmus')
  const kid = text(kopf.kid)
  let jwk = (await opt.schluessel(false)).find((k) => k.kid === kid)
  if (!jwk) jwk = (await opt.schluessel(true)).find((k) => k.kid === kid)
  if (!jwk) throw new TokenFehler('Unbekannter Schlüssel')
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(teile[2]) as BufferSource, new TextEncoder().encode(`${teile[0]}.${teile[1]}`) as BufferSource)
  if (!ok) throw new TokenFehler('Signatur ungültig')

  const jetzt = opt.jetztS ?? Math.floor(Date.now() / 1000)
  if (!opt.clientId || inhalt.aud !== opt.clientId) throw new TokenFehler('Token ist nicht für diese App')
  const tid = text(inhalt.tid)
  const oid = text(inhalt.oid)
  if (!SICHER.test(tid) || !SICHER.test(oid)) throw new TokenFehler('Konto-Angaben fehlen')
  if (inhalt.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new TokenFehler('Falscher Aussteller')
  const exp = Number(inhalt.exp)
  if (!Number.isFinite(exp) || exp + SPIEL_S < jetzt) throw new TokenFehler('Token abgelaufen')
  const nbf = Number(inhalt.nbf ?? 0)
  if (Number.isFinite(nbf) && nbf - SPIEL_S > jetzt) throw new TokenFehler('Token noch nicht gültig')
  return {
    oid,
    tid,
    name: text(inhalt.name).slice(0, 200),
    email: (text(inhalt.preferred_username) || text(inhalt.email)).slice(0, 200),
  }
}
