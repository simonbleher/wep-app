// Gemeinsames der Endpunkte /api/bv/*: Umgebung, Antworten, Token aus dem Authorization-Header prüfen.
import { microsoftSchluessel, pruefeIdToken, TokenFehler, type GeprueftesToken } from './idToken'
import type { KvAblage } from './freigaben'

export interface BvUmgebung {
  /** KV-Bindung mit Anträgen und Freigaben (Cloudflare → Pages → Einstellungen → Bindungen). */
  BV_ZUGANG?: KvAblage
  /** "true" schaltet die Zugangskontrolle ein (nur zusammen mit der KV-Bindung). */
  BV_ZUGANG_AKTIV?: string
  /** Admins: E-Mail-Adressen oder Objekt-IDs, kommagetrennt. */
  BV_ADMINS?: string
  /** Client-ID der App (dieselbe Variable wie beim Build). */
  VITE_MS_CLIENT_ID?: string
}

export interface BvKontext {
  request: Request
  env: BvUmgebung
}

export const antwort = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

/** Zugangskontrolle eingeschaltet und eingerichtet? */
export const aktiv = (env: BvUmgebung): env is BvUmgebung & { BV_ZUGANG: KvAblage } => env.BV_ZUGANG_AKTIV === 'true' && Boolean(env.BV_ZUGANG)

export async function angemeldet(ctx: BvKontext): Promise<GeprueftesToken | Response> {
  const kopf = ctx.request.headers.get('authorization') ?? ''
  const token = /^Bearer (.+)$/.exec(kopf)?.[1]
  if (!token) return antwort(401, { fehler: 'Nicht angemeldet.' })
  try {
    return await pruefeIdToken(token, { clientId: ctx.env.VITE_MS_CLIENT_ID ?? '', schluessel: (neu) => microsoftSchluessel(fetch, Date.now(), neu) })
  } catch (e) {
    return antwort(401, { fehler: e instanceof TokenFehler ? `Anmeldung ungültig: ${e.message}` : 'Anmeldung konnte nicht geprüft werden.' })
  }
}
