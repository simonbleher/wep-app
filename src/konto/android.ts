// Android-Umsetzung des Konto-Dienstes (gleiche Schnittstelle wie web.ts).
//
// Authorization Code + PKCE über den System-Browser (Custom Tab), Rücksprung per
// App-Link `de.wep.app://auth`. Der Token-Tausch und die Erneuerung laufen NICHT per
// fetch aus der WebView (die schickt einen Origin-Header, und Microsoft lehnt das für
// Registrierungen ohne SPA-Plattform ab), sondern über das native Plugin. Dort liegt
// auch der Refresh-Token (EncryptedSharedPreferences), damit der Hintergrunddienst
// ihn lesen kann.
//
// Alle Abhängigkeiten (Browser, Rücksprung, natives Plugin, Zufall, SHA-256) sind
// austauschbar, damit die Logik ohne Gerät getestet werden kann (android.test.ts).
import type { Konto, KontoDienst } from './types'

export const AUTHORITY = 'https://login.microsoftonline.com/consumers'
export const REDIRECT_URI = 'de.wep.app://auth'
/** openid/profile liefern den Anzeigenamen (id_token); wie in der Web-Umsetzung (MSAL). */
export const ANDROID_SCOPES = ['openid', 'profile', 'offline_access', 'Files.ReadWrite.AppFolder']

const PENDING_KEY = 'wep-android-login'
/** Zugriffstoken bis kurz vor Ablauf weiterverwenden. */
const PUFFER_MS = 2 * 60 * 1000
/** So lange warten wir nach dem Schließen des Browsers auf den Rücksprung. */
const ABBRUCH_WARTEZEIT_MS = 2000

/** Anmeldedaten, wie das native Plugin sie speichert. */
export interface GespeicherteAnmeldung {
  clientId: string
  refreshToken: string
  accessToken: string
  /** Ablaufzeit des Zugriffstokens (ms seit 1970). */
  ablauf: number
  name: string
  benutzername: string
}

export interface TokenAntwort {
  status: number
  text: string
}

export interface AndroidAbhaengigkeiten {
  tokenAnfrage(url: string, formular: Record<string, string>): Promise<TokenAntwort>
  leseAnmeldung(): Promise<Partial<GespeicherteAnmeldung>>
  speichereAnmeldung(a: GespeicherteAnmeldung): Promise<void>
  loescheAnmeldung(): Promise<void>
  oeffneBrowser(url: string): Promise<void>
  schliesseBrowser(): Promise<void>
  /** Registriert den Rücksprung (appUrlOpen); liefert eine Abmelde-Funktion. */
  aufRueckkehr(cb: (url: string) => void): Promise<() => void>
  /** Registriert „Browser wurde geschlossen“. */
  aufBrowserBeendet(cb: () => void): Promise<() => void>
  /** URL, mit der die App gestartet wurde (Kaltstart über den Rücksprung). */
  startUrl(): Promise<string | null>
  speicher: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  zufallsBytes(anzahl: number): Uint8Array
  sha256(daten: Uint8Array): Promise<Uint8Array>
  jetzt(): number
}

// --- PKCE ---------------------------------------------------------------------

export function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface Pkce {
  verifier: string
  challenge: string
}

export async function erzeugePkce(
  zufallsBytes: (n: number) => Uint8Array,
  sha256: (d: Uint8Array) => Promise<Uint8Array>,
): Promise<Pkce> {
  const verifier = base64url(zufallsBytes(32)) // 43 Zeichen, RFC 7636
  const challenge = base64url(await sha256(new TextEncoder().encode(verifier)))
  return { verifier, challenge }
}

export function baueAnmeldeUrl(p: { clientId: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: ANDROID_SCOPES.join(' '),
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORITY}/oauth2/v2.0/authorize?${q.toString()}`
}

/** Liest Namen und Anmeldenamen aus dem id_token (ohne Signaturprüfung, nur Anzeige). */
export function kontoAusIdToken(idToken: string | undefined): Konto {
  const leer: Konto = { name: '', benutzername: 'Microsoft-Konto' }
  if (!idToken) return leer
  try {
    const teil = idToken.split('.')[1]
    const bin = atob(teil.replace(/-/g, '+').replace(/_/g, '/'))
    const daten = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as {
      name?: string
      preferred_username?: string
      email?: string
    }
    return {
      name: daten.name ?? '',
      benutzername: daten.preferred_username ?? daten.email ?? 'Microsoft-Konto',
    }
  } catch {
    return leer
  }
}

interface TokenJson {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  error?: string
  error_description?: string
}

function parseToken(a: TokenAntwort): TokenJson {
  try {
    return JSON.parse(a.text) as TokenJson
  } catch {
    return {}
  }
}

function fehlerText(a: TokenAntwort, j: TokenJson): string {
  const detail = j.error_description?.split('\r\n')[0] ?? j.error ?? a.text.slice(0, 120)
  return `Microsoft-Anmeldung fehlgeschlagen (${a.status}): ${detail}`
}

// --- Dienst -------------------------------------------------------------------

export function erstelleAndroidKontoDienst(
  clientId: string | undefined,
  abh: AndroidAbhaengigkeiten,
): KontoDienst {
  const konfiguriert = typeof clientId === 'string' && clientId.trim().length > 0
  const id = (clientId ?? '').trim()

  interface Wartend {
    resolve: () => void
    reject: (e: Error) => void
  }
  let wartend: Wartend | null = null
  let rueckkehrAngekommen = false
  let bearbeitung: Promise<void> = Promise.resolve()
  let erneuerung: Promise<string> | null = null

  function beende(fehler?: Error) {
    const w = wartend
    wartend = null
    if (!w) return
    if (fehler) w.reject(fehler)
    else w.resolve()
  }

  async function tauscheCode(code: string, verifier: string): Promise<void> {
    const antwort = await abh.tokenAnfrage(`${AUTHORITY}/oauth2/v2.0/token`, {
      client_id: id,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      scope: ANDROID_SCOPES.join(' '),
    })
    const j = parseToken(antwort)
    if (antwort.status !== 200 || !j.access_token || !j.refresh_token) {
      throw new Error(fehlerText(antwort, j))
    }
    const konto = kontoAusIdToken(j.id_token)
    await abh.speichereAnmeldung({
      clientId: id,
      refreshToken: j.refresh_token,
      accessToken: j.access_token,
      ablauf: abh.jetzt() + (j.expires_in ?? 3600) * 1000,
      name: konto.name,
      benutzername: konto.benutzername,
    })
  }

  /** Verarbeitet den Rücksprung `de.wep.app://auth?code=…&state=…`. */
  async function verarbeiteRueckkehr(url: string): Promise<void> {
    if (!url.startsWith(REDIRECT_URI)) return
    rueckkehrAngekommen = true
    await abh.schliesseBrowser().catch(() => undefined)
    let pending: { verifier: string; state: string } | null = null
    try {
      pending = JSON.parse(abh.speicher.getItem(PENDING_KEY) ?? 'null')
    } catch {
      pending = null
    }
    abh.speicher.removeItem(PENDING_KEY)
    try {
      const q = new URL(url).searchParams
      const fehler = q.get('error')
      if (fehler) {
        throw new Error(`Anmeldung abgebrochen: ${q.get('error_description') ?? fehler}`)
      }
      const code = q.get('code')
      if (!pending || !code || q.get('state') !== pending.state) {
        throw new Error('Anmeldung ungültig (Rücksprung passt zu keiner offenen Anmeldung)')
      }
      await tauscheCode(code, pending.verifier)
      beende()
    } catch (e) {
      beende(e instanceof Error ? e : new Error(String(e)))
    }
  }

  function auf(url: string): void {
    bearbeitung = bearbeitung.then(() => verarbeiteRueckkehr(url))
  }

  let bereit: Promise<void> | undefined
  /** Hängt die Listener ein (einmal) und verarbeitet einen Kaltstart über den Rücksprung. */
  function starte(): Promise<void> {
    if (!bereit) {
      bereit = (async () => {
        await abh.aufRueckkehr(auf)
        await abh.aufBrowserBeendet(() => {
          // Browser zu: Kam kurz danach kein Rücksprung, wurde die Anmeldung abgebrochen.
          setTimeout(() => {
            if (wartend && !rueckkehrAngekommen) beende(new Error('Anmeldung abgebrochen'))
          }, ABBRUCH_WARTEZEIT_MS)
        })
        const start = await abh.startUrl()
        if (start) auf(start)
        await bearbeitung
      })()
    }
    return bereit
  }

  async function gespeichert(): Promise<Partial<GespeicherteAnmeldung>> {
    await starte()
    await bearbeitung
    return abh.leseAnmeldung()
  }

  async function erneuere(a: Partial<GespeicherteAnmeldung>): Promise<string> {
    const antwort = await abh.tokenAnfrage(`${AUTHORITY}/oauth2/v2.0/token`, {
      client_id: id,
      grant_type: 'refresh_token',
      refresh_token: a.refreshToken as string,
      scope: ANDROID_SCOPES.join(' '),
    })
    const j = parseToken(antwort)
    if (antwort.status !== 200 || !j.access_token) {
      if (j.error === 'invalid_grant') {
        throw new Error('Die Anmeldung ist abgelaufen – bitte im Profil erneut anmelden.')
      }
      throw new Error(fehlerText(antwort, j))
    }
    await abh.speichereAnmeldung({
      clientId: id,
      refreshToken: j.refresh_token ?? (a.refreshToken as string),
      accessToken: j.access_token,
      ablauf: abh.jetzt() + (j.expires_in ?? 3600) * 1000,
      name: a.name ?? '',
      benutzername: a.benutzername ?? '',
    })
    return j.access_token
  }

  return {
    verfuegbar: () => konfiguriert,

    async aktuellesKonto() {
      if (!konfiguriert) return null
      const a = await gespeichert()
      if (!a.refreshToken) return null
      return { name: a.name ?? '', benutzername: a.benutzername ?? '' }
    },

    /** Öffnet den System-Browser; wartet, bis der Rücksprung verarbeitet ist. */
    async anmelden() {
      if (!konfiguriert) throw new Error('VITE_MS_CLIENT_ID ist nicht gesetzt')
      await starte()
      const pkce = await erzeugePkce(abh.zufallsBytes, abh.sha256)
      const state = base64url(abh.zufallsBytes(16))
      abh.speicher.setItem(PENDING_KEY, JSON.stringify({ verifier: pkce.verifier, state }))
      rueckkehrAngekommen = false
      beende(new Error('Neue Anmeldung gestartet'))
      const fertig = new Promise<void>((resolve, reject) => {
        wartend = { resolve, reject }
      })
      try {
        await abh.oeffneBrowser(baueAnmeldeUrl({ clientId: id, state, challenge: pkce.challenge }))
      } catch (e) {
        beende(e instanceof Error ? e : new Error(String(e)))
      }
      await fertig
    },

    async abmelden() {
      abh.speicher.removeItem(PENDING_KEY)
      await abh.loescheAnmeldung()
    },

    async zugriffstoken() {
      const a = await gespeichert()
      if (!a.refreshToken) throw new Error('Nicht mit OneDrive verbunden')
      if (a.accessToken && (a.ablauf ?? 0) - abh.jetzt() > PUFFER_MS) return a.accessToken
      // Gleichzeitige Aufrufe teilen sich eine Erneuerung.
      erneuerung ??= erneuere(a).finally(() => {
        erneuerung = null
      })
      return erneuerung
    },
  }
}
