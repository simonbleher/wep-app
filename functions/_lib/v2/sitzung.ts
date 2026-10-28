// v2-Sitzungen und laufende Anmeldungen. Das Sitzungs-Token liegt nur im Cookie (HttpOnly) des Browsers, in D1 nur
// sein SHA-256-Hash. Anmeldungen (state, nonce, PKCE) gelten 10 Minuten und nur im Browser, der sie begonnen hat.
import { jetztIso, type Db } from './db'
import { alsKonto, type Konto } from './konten'
import { sha256b64url, zufall, type Anbieter } from './oidc'

export const SITZUNG_COOKIE = 'wep_sitzung'
export const ANMELDUNG_COOKIE = 'wep_anmeldung'
export const SITZUNG_TAGE = 30
const ANMELDUNG_MIN = 10

export function leseCookie(request: Request, name: string): string | undefined {
  for (const teil of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = teil.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

/** Set-Cookie für Sitzung bzw. Anmeldung (leerer Wert = löschen). */
export function cookie(name: string, wert: string, maxAlterS: number): string {
  return `${name}=${wert}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${wert ? maxAlterS : 0}`
}

/** Erlaubtes Ziel nach der Anmeldung: nur Pfade dieser Seite (kein //fremd.example, keine absolute Adresse). */
export const sicheresZiel = (ziel: string | null | undefined): string => (ziel && /^\/(?![/\\])[^\s]*$/.test(ziel) ? ziel : '/')

export async function beginneAnmeldung(db: Db, anbieter: Anbieter, ziel: string, jetzt = Date.now()) {
  const vorgang = { state: zufall(), nonce: zufall(), verifier: zufall(48), ziel: sicheresZiel(ziel) }
  await db.batch([
    db.prepare('DELETE FROM anmeldungen WHERE laeuft_ab < ?').bind(jetztIso(jetzt)),
    db
      .prepare('INSERT INTO anmeldungen (state, anbieter, nonce, verifier, ziel, laeuft_ab) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(vorgang.state, anbieter, vorgang.nonce, vorgang.verifier, vorgang.ziel, jetztIso(jetzt + ANMELDUNG_MIN * 60_000)),
  ])
  return { ...vorgang, cookie: cookie(ANMELDUNG_COOKIE, vorgang.state, ANMELDUNG_MIN * 60) }
}

/** Holt die laufende Anmeldung (einmalig: sie wird dabei gelöscht). Der state muss zum Cookie dieses Browsers passen. */
export async function beendeAnmeldung(db: Db, anbieter: Anbieter, state: string | null, cookieState: string | undefined, jetzt = Date.now()) {
  if (!state || !cookieState || state !== cookieState) return undefined
  const v = await db.prepare('SELECT * FROM anmeldungen WHERE state = ?').bind(state).first<{ anbieter: string; nonce: string; verifier: string; ziel: string; laeuft_ab: string }>()
  await db.prepare('DELETE FROM anmeldungen WHERE state = ?').bind(state).run()
  if (!v || v.anbieter !== anbieter || v.laeuft_ab < jetztIso(jetzt)) return undefined
  return { nonce: v.nonce, verifier: v.verifier, ziel: v.ziel }
}

export async function neueSitzung(db: Db, kontoId: string, jetzt = Date.now()): Promise<{ token: string; cookie: string }> {
  const token = zufall()
  await db
    .prepare('INSERT INTO sitzungen (token_hash, konto_id, erstellt_am, laeuft_ab) VALUES (?, ?, ?, ?)')
    .bind(await sha256b64url(token), kontoId, jetztIso(jetzt), jetztIso(jetzt + SITZUNG_TAGE * 86_400_000))
    .run()
  return { token, cookie: cookie(SITZUNG_COOKIE, token, SITZUNG_TAGE * 86_400) }
}

/** Konto zur Sitzung dieses Requests (Cookie oder `Authorization: Bearer` für die Apps) – oder undefined. */
export async function kontoDerSitzung(db: Db, request: Request, jetzt = Date.now()): Promise<Konto | undefined> {
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
  const token = bearer ?? leseCookie(request, SITZUNG_COOKIE)
  if (!token) return undefined
  const z = await db
    .prepare('SELECT k.* FROM sitzungen s JOIN konten k ON k.id = s.konto_id WHERE s.token_hash = ? AND s.laeuft_ab > ?')
    .bind(await sha256b64url(token), jetztIso(jetzt))
    .first<Parameters<typeof alsKonto>[0]>()
  return z ? alsKonto(z) : undefined
}

export async function beendeSitzung(db: Db, request: Request): Promise<void> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? leseCookie(request, SITZUNG_COOKIE)
  if (token) await db.prepare('DELETE FROM sitzungen WHERE token_hash = ?').bind(await sha256b64url(token)).run()
}
