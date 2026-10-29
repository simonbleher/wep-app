// v2 Paket 8: Anmeldung der Android- und Windows-App über den Systembrowser (docs/PLAN-V2.md, „Apps“).
//
// Ablauf (RFC 8252, „OAuth 2.0 for Native Apps“, mit einem eigenen PKCE-Paar zwischen App und Server):
// 1. Die App erzeugt Verifier + Challenge (S256) und einen state und öffnet im Systembrowser
//    /api/v2/anmeldung/<anbieter>/start?client=app&challenge=…&state=…&ruecksprung=…
// 2. Der Server macht den OIDC-Weg wie im Browser – mit seinen eigenen Rücksprung-Adressen bei Google und Microsoft.
// 3. Am Ende leitet er auf den Rücksprung der App um (Android: de.wep.app://auth/server, Windows: Loopback
//    http://127.0.0.1:<Port>/) – mit einem Einmal-Code (60 Sekunden, nur einmal einlösbar) und dem state der App.
// 4. Die App tauscht Code + Verifier gegen ein Sitzungs-Token (Bearer). Ohne passenden Verifier kein Token: Ein
//    abgefangener Rücksprung nützt niemandem.
import { jetztIso, type Db } from './db'
import { sha256b64url, zufall } from './oidc'
import { neueSitzung, type AppAnmeldung } from './sitzung'

/** Rücksprung der Android-App (Intent-Filter de.wep.app://auth, seit der Microsoft-Anmeldung von v1 vorhanden). */
export const RUECKSPRUNG_ANDROID = 'de.wep.app://auth/server'
/** Rücksprung der Windows-App: Mini-Server auf dem eigenen Rechner (src-tauri/src/anmeldung.rs). */
const RUECKSPRUNG_WINDOWS = /^http:\/\/127\.0\.0\.1:(\d{4,5})\/$/

export const APP_CODE_SEKUNDEN = 60

const B64URL = /^[A-Za-z0-9_-]+$/

/**
 * Parameter einer App-Anmeldung prüfen. `undefined` = keine App-Anmeldung (Browser), ein Text = ungültig.
 * Erlaubt sind nur die beiden Rücksprünge der Apps – sonst könnte jemand Codes an eine fremde Adresse leiten.
 */
export function appAnmeldungAus(p: URLSearchParams): AppAnmeldung | string | undefined {
  if (p.get('client') !== 'app') return undefined
  const challenge = p.get('challenge') ?? ''
  const state = p.get('state') ?? ''
  const ruecksprung = p.get('ruecksprung') ?? ''
  if (challenge.length !== 43 || !B64URL.test(challenge)) return 'Prüfwert (challenge) fehlt oder ist ungültig.'
  if (state.length < 16 || state.length > 128 || !B64URL.test(state)) return 'state fehlt oder ist ungültig.'
  if (ruecksprung === RUECKSPRUNG_ANDROID) return { challenge, state, ruecksprung, geraet: 'android' }
  const port = Number(RUECKSPRUNG_WINDOWS.exec(ruecksprung)?.[1])
  if (port >= 1024 && port <= 65535) return { challenge, state, ruecksprung, geraet: 'windows' }
  return 'Rücksprung in die App ist nicht erlaubt.'
}

/** Adresse des Rücksprungs mit Parametern (Code bzw. Fehler, immer mit dem state der App). */
export function ruecksprungMit(app: AppAnmeldung, werte: Record<string, string>): string {
  const q = new URLSearchParams({ ...werte, state: app.state })
  return `${app.ruecksprung}?${q.toString()}`
}

/** Einmal-Code für die App nach erfolgreicher Anmeldung (in D1 nur sein Hash). */
export async function erstelleAppCode(db: Db, kontoId: string, app: AppAnmeldung, jetzt = Date.now()): Promise<string> {
  const code = zufall()
  await db.batch([
    db.prepare('DELETE FROM app_codes WHERE laeuft_ab < ?').bind(jetztIso(jetzt)),
    db
      .prepare('INSERT INTO app_codes (code_hash, konto_id, challenge, geraet, laeuft_ab) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256b64url(code), kontoId, app.challenge, app.geraet, jetztIso(jetzt + APP_CODE_SEKUNDEN * 1000)),
  ])
  return code
}

export type CodeErgebnis = { ok: true; token: string; kontoId: string; geraet: AppAnmeldung['geraet'] } | { ok: false; fehler: string }

/**
 * Code + Verifier gegen ein Sitzungs-Token tauschen. Der Code ist danach verbraucht – auch bei falschem Verifier
 * (sonst ließe er sich durchprobieren).
 */
export async function loeseAppCodeEin(db: Db, code: unknown, verifier: unknown, jetzt = Date.now()): Promise<CodeErgebnis> {
  if (typeof code !== 'string' || !code || typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) {
    return { ok: false, fehler: 'Code oder Prüfwert fehlt.' }
  }
  const hash = await sha256b64url(code)
  const z = await db.prepare('SELECT * FROM app_codes WHERE code_hash = ?').bind(hash).first<{ konto_id: string; challenge: string; geraet: string; laeuft_ab: string }>()
  if (!z) return { ok: false, fehler: 'Der Code ist ungültig oder schon benutzt.' }
  await db.prepare('DELETE FROM app_codes WHERE code_hash = ?').bind(hash).run()
  if (z.laeuft_ab < jetztIso(jetzt)) return { ok: false, fehler: 'Der Code ist abgelaufen. Bitte noch einmal anmelden.' }
  if ((await sha256b64url(verifier)) !== z.challenge) return { ok: false, fehler: 'Der Prüfwert passt nicht zum Code.' }
  const geraet = z.geraet === 'windows' ? 'windows' : 'android'
  const { token } = await neueSitzung(db, z.konto_id, jetzt, geraet)
  return { ok: true, token, kontoId: z.konto_id, geraet }
}
