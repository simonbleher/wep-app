// v2-Sitzungen und laufende Anmeldungen. Das Sitzungs-Token liegt im Cookie (HttpOnly) des Browsers bzw. im sicheren
// Speicher der Android-/Windows-App (Bearer), in D1 nur sein SHA-256-Hash. Anmeldungen (state, nonce, PKCE) gelten
// 10 Minuten und nur im Browser, der sie begonnen hat – auch wenn eine App sie über den Systembrowser startet.
import { jetztIso, type Db } from './db'
import { alsKonto, type Konto } from './konten'
import { sha256b64url, zufall, type Anbieter } from './oidc'

// __Host-: nur Secure, Path=/ und ohne Domain – Unterdomains (Vorschau-Adressen *.wep-pankow.pages.dev) können diese
// Cookies weder setzen noch überschreiben (Fund N5, docs/SICHERHEITSPRUEFUNG-V2.md).
export const SITZUNG_COOKIE = '__Host-wep_sitzung'
export const ANMELDUNG_COOKIE = '__Host-wep_anmeldung'
/** Frühere Namen (bis 10/2026): werden beim Abmelden mit gelöscht, aber nicht mehr gelesen. */
export const ALTE_COOKIES = ['wep_sitzung', 'wep_anmeldung']
export const SITZUNG_TAGE = 30
/** Eine Sitzung endet, wenn sie so lange nicht benutzt wurde (Fund N6). */
export const LEERLAUF_TAGE = 14
/** „Zuletzt benutzt“ wird höchstens so oft aufgefrischt (spart Schreibzugriffe). */
const AUFFRISCHEN_MS = 86_400_000
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

/** Woher eine Sitzung kommt (Anzeige im Profil und für Admins). */
export type Geraet = 'browser' | 'android' | 'windows'

/** Anmeldung aus einer App: PKCE-Prüfwert und state der App, Rücksprung in die App. */
export interface AppAnmeldung {
  challenge: string
  state: string
  ruecksprung: string
  geraet: Exclude<Geraet, 'browser'>
}

export async function beginneAnmeldung(db: Db, anbieter: Anbieter, ziel: string, jetzt = Date.now(), app?: AppAnmeldung) {
  const vorgang = { state: zufall(), nonce: zufall(), verifier: zufall(48), ziel: sicheresZiel(ziel) }
  await db.batch([
    db.prepare('DELETE FROM anmeldungen WHERE laeuft_ab < ?').bind(jetztIso(jetzt)),
    db
      .prepare('INSERT INTO anmeldungen (state, anbieter, nonce, verifier, ziel, laeuft_ab, app) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(vorgang.state, anbieter, vorgang.nonce, vorgang.verifier, vorgang.ziel, jetztIso(jetzt + ANMELDUNG_MIN * 60_000), app ? JSON.stringify(app) : null),
  ])
  return { ...vorgang, cookie: cookie(ANMELDUNG_COOKIE, vorgang.state, ANMELDUNG_MIN * 60) }
}

/** Holt die laufende Anmeldung (einmalig: sie wird dabei gelöscht). Der state muss zum Cookie dieses Browsers passen. */
export async function beendeAnmeldung(db: Db, anbieter: Anbieter, state: string | null, cookieState: string | undefined, jetzt = Date.now()) {
  if (!state || !cookieState || state !== cookieState) return undefined
  const v = await db
    .prepare('SELECT * FROM anmeldungen WHERE state = ?')
    .bind(state)
    .first<{ anbieter: string; nonce: string; verifier: string; ziel: string; laeuft_ab: string; app: string | null }>()
  await db.prepare('DELETE FROM anmeldungen WHERE state = ?').bind(state).run()
  if (!v || v.anbieter !== anbieter || v.laeuft_ab < jetztIso(jetzt)) return undefined
  return { nonce: v.nonce, verifier: v.verifier, ziel: v.ziel, app: v.app ? (JSON.parse(v.app) as AppAnmeldung) : undefined }
}

export async function neueSitzung(db: Db, kontoId: string, jetzt = Date.now(), geraet: Geraet = 'browser'): Promise<{ token: string; cookie: string }> {
  const token = zufall()
  await db
    .prepare('INSERT INTO sitzungen (token_hash, konto_id, erstellt_am, laeuft_ab, geraet, zuletzt_genutzt) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256b64url(token), kontoId, jetztIso(jetzt), jetztIso(jetzt + SITZUNG_TAGE * 86_400_000), geraet, jetztIso(jetzt))
    .run()
  return { token, cookie: cookie(SITZUNG_COOKIE, token, SITZUNG_TAGE * 86_400) }
}

/** `Authorization: Bearer <token>` – genau dieses Muster; alles andere gilt als ungültiger Kopf. */
const BEARER = /^Bearer ([A-Za-z0-9_-]{16,256})$/

/**
 * Token der Anfrage: Hat sie einen `Authorization`-Kopf, zählt nur der – ohne Rückfall auf das Cookie, auch wenn der Kopf
 * ungültig ist (Fund N1: sonst ließe ein kaputter Kopf die Herkunftsprüfung aus und nähme trotzdem das Cookie).
 */
export function tokenDerAnfrage(request: Request): string | undefined {
  const kopf = request.headers.get('authorization')
  if (kopf !== null) return BEARER.exec(kopf)?.[1]
  return leseCookie(request, SITZUNG_COOKIE)
}

/** Kommt die Anfrage mit gültig geformtem Bearer-Token (Apps)? Dann gibt es kein Cookie und keine Herkunftsprüfung. */
export const hatBearer = (request: Request) => BEARER.test(request.headers.get('authorization') ?? '')

/** Konto zur Sitzung dieses Requests (Cookie oder `Authorization: Bearer` für die Apps) – oder undefined. */
export async function kontoDerSitzung(db: Db, request: Request, jetzt = Date.now()): Promise<Konto | undefined> {
  const token = tokenDerAnfrage(request)
  if (!token) return undefined
  const hash = await sha256b64url(token)
  const z = await db
    .prepare('SELECT k.*, s.zuletzt_genutzt AS sitzung_genutzt FROM sitzungen s JOIN konten k ON k.id = s.konto_id WHERE s.token_hash = ? AND s.laeuft_ab > ? AND (s.zuletzt_genutzt IS NULL OR s.zuletzt_genutzt > ?)')
    .bind(hash, jetztIso(jetzt), jetztIso(jetzt - LEERLAUF_TAGE * 86_400_000))
    .first<Parameters<typeof alsKonto>[0] & { sitzung_genutzt: string | null }>()
  if (!z) return undefined
  if (!z.sitzung_genutzt || z.sitzung_genutzt < jetztIso(jetzt - AUFFRISCHEN_MS)) {
    await db.prepare('UPDATE sitzungen SET zuletzt_genutzt = ? WHERE token_hash = ?').bind(jetztIso(jetzt), hash).run()
  }
  return alsKonto(z)
}

export async function beendeSitzung(db: Db, request: Request): Promise<void> {
  const token = tokenDerAnfrage(request)
  if (token) await db.prepare('DELETE FROM sitzungen WHERE token_hash = ?').bind(await sha256b64url(token)).run()
}

/** Eine Sitzung, wie Profil und Admin sie sehen (Kennung = Anfang des Hashes, nie das Token). */
export interface SitzungInfo {
  id: string
  geraet: Geraet
  erstelltAm: string
  laeuftAb: string
  /** Zuletzt benutzt (auf einen Tag genau); nach LEERLAUF_TAGE ohne Nutzung endet die Sitzung. */
  zuletztGenutzt?: string
  /** Die Sitzung dieser Anfrage. */
  diese?: boolean
}

const SITZUNG_ID_LAENGE = 16

/** Offene Sitzungen eines Kontos, neueste zuerst. */
export async function sitzungenVon(db: Db, kontoId: string, request?: Request, jetzt = Date.now()): Promise<SitzungInfo[]> {
  const eigene = request && tokenDerAnfrage(request)
  const eigenerHash = eigene ? await sha256b64url(eigene) : undefined
  const { results } = await db
    .prepare(
      'SELECT token_hash, geraet, erstellt_am, laeuft_ab, zuletzt_genutzt FROM sitzungen WHERE konto_id = ? AND laeuft_ab > ? AND (zuletzt_genutzt IS NULL OR zuletzt_genutzt > ?) ORDER BY erstellt_am DESC',
    )
    .bind(kontoId, jetztIso(jetzt), jetztIso(jetzt - LEERLAUF_TAGE * 86_400_000))
    .all<{ token_hash: string; geraet: Geraet | null; erstellt_am: string; laeuft_ab: string; zuletzt_genutzt: string | null }>()
  return results.map((z) => ({
    id: z.token_hash.slice(0, SITZUNG_ID_LAENGE),
    geraet: z.geraet ?? 'browser',
    erstelltAm: z.erstellt_am,
    laeuftAb: z.laeuft_ab,
    ...(z.zuletzt_genutzt ? { zuletztGenutzt: z.zuletzt_genutzt } : {}),
    ...(z.token_hash === eigenerHash ? { diese: true } : {}),
  }))
}

/** Beendet alle Sitzungen des Kontos („Überall abmelden“). Liefert die Anzahl. */
export async function beendeAlleSitzungen(db: Db, kontoId: string): Promise<number> {
  const r = await db.prepare('DELETE FROM sitzungen WHERE konto_id = ?').bind(kontoId).run()
  return r.meta.changes ?? 0
}

/** Beendet eine Sitzung des Kontos anhand ihrer Kennung (z. B. ein verlorenes Gerät). Liefert, ob es sie gab. */
export async function beendeSitzungMitId(db: Db, kontoId: string, id: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return false
  const r = await db.prepare("DELETE FROM sitzungen WHERE konto_id = ? AND substr(token_hash, 1, 16) = ?").bind(kontoId, id).run()
  return (r.meta.changes ?? 0) > 0
}
