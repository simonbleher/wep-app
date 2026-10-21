// Windows-Umsetzung des Konto-Dienstes (gleiche Schnittstelle wie web.ts und android.ts).
//
// Authorization Code + PKCE über den Standardbrowser. Der Rücksprung geht an einen kleinen
// Server des Programms auf `http://localhost:<Port>` (Loopback-Umleitung, RFC 8252; in Azure ist
// `http://localhost` als Umleitung für „Mobil- und Desktopanwendungen“ eingetragen, der Port wird
// von Microsoft nicht verglichen). Token-Tausch und -Erneuerung laufen im Programm (Rust), nicht per
// fetch aus der WebView (die schickt einen Origin-Header, den Microsoft hier ablehnt). Der
// Refresh-Token liegt in der Windows-Anmeldeinformationsverwaltung, das Zugriffstoken nur im
// Arbeitsspeicher.
//
// Alle Abhängigkeiten sind austauschbar, damit die Logik ohne Windows getestet werden kann
// (windows.test.ts).
import { AUTHORITY, ANDROID_SCOPES, base64url, erzeugePkce, kontoAusIdToken } from './android'
import type { TokenAntwort } from './android'
import type { Konto, KontoDienst } from './types'

/** Scopes wie bei Web und Android: Dateien im App-Ordner, dazu Anzeigename und Refresh-Token. */
export const WINDOWS_SCOPES = ANDROID_SCOPES
/** Zugriffstoken bis kurz vor Ablauf weiterverwenden. */
const PUFFER_MS = 2 * 60 * 1000

export interface GespeicherteWindowsAnmeldung {
  clientId: string
  refreshToken: string
  name: string
  benutzername: string
}

export interface WindowsAbhaengigkeiten {
  /** Öffnet den Mini-Server des Programms und liefert seinen Port. */
  lausche(): Promise<number>
  /** Wartet, bis der Browser zurückkommt; liefert das Ziel (`/?code=…&state=…`). */
  warteAufRueckkehr(): Promise<string>
  brecheAb(): Promise<void>
  oeffneBrowser(url: string): Promise<void>
  tokenAnfrage(url: string, formular: Record<string, string>): Promise<TokenAntwort>
  leseAnmeldung(): Promise<Partial<GespeicherteWindowsAnmeldung>>
  speichereAnmeldung(a: GespeicherteWindowsAnmeldung): Promise<void>
  loescheAnmeldung(): Promise<void>
  zufallsBytes(anzahl: number): Uint8Array
  sha256(daten: Uint8Array): Promise<Uint8Array>
  jetzt(): number
}

export function windowsRedirectUri(port: number): string {
  return `http://localhost:${port}`
}

export function baueWindowsAnmeldeUrl(p: { clientId: string; port: number; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: windowsRedirectUri(p.port),
    response_mode: 'query',
    scope: WINDOWS_SCOPES.join(' '),
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORITY}/oauth2/v2.0/authorize?${q.toString()}`
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

export function erstelleWindowsKontoDienst(clientId: string | undefined, abh: WindowsAbhaengigkeiten): KontoDienst {
  const konfiguriert = typeof clientId === 'string' && clientId.trim().length > 0
  const id = (clientId ?? '').trim()
  let zugriff: { token: string; ablauf: number } | null = null
  let erneuerung: Promise<string> | null = null

  async function tauscheCode(code: string, verifier: string, redirectUri: string): Promise<void> {
    const antwort = await abh.tokenAnfrage(`${AUTHORITY}/oauth2/v2.0/token`, {
      client_id: id,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: WINDOWS_SCOPES.join(' '),
    })
    const j = parseToken(antwort)
    if (antwort.status !== 200 || !j.access_token || !j.refresh_token) {
      throw new Error(fehlerText(antwort, j))
    }
    const konto = kontoAusIdToken(j.id_token)
    await abh.speichereAnmeldung({
      clientId: id,
      refreshToken: j.refresh_token,
      name: konto.name,
      benutzername: konto.benutzername,
    })
    zugriff = { token: j.access_token, ablauf: abh.jetzt() + (j.expires_in ?? 3600) * 1000 }
  }

  async function erneuere(a: Partial<GespeicherteWindowsAnmeldung>): Promise<string> {
    const antwort = await abh.tokenAnfrage(`${AUTHORITY}/oauth2/v2.0/token`, {
      client_id: id,
      grant_type: 'refresh_token',
      refresh_token: a.refreshToken as string,
      scope: WINDOWS_SCOPES.join(' '),
    })
    const j = parseToken(antwort)
    if (antwort.status !== 200 || !j.access_token) {
      if (j.error === 'invalid_grant') {
        throw new Error('Die Anmeldung ist abgelaufen – bitte im Profil erneut anmelden.')
      }
      throw new Error(fehlerText(antwort, j))
    }
    if (j.refresh_token && j.refresh_token !== a.refreshToken) {
      await abh.speichereAnmeldung({
        clientId: id,
        refreshToken: j.refresh_token,
        name: a.name ?? '',
        benutzername: a.benutzername ?? '',
      })
    }
    zugriff = { token: j.access_token, ablauf: abh.jetzt() + (j.expires_in ?? 3600) * 1000 }
    return j.access_token
  }

  return {
    verfuegbar: () => konfiguriert,

    async aktuellesKonto(): Promise<Konto | null> {
      if (!konfiguriert) return null
      const a = await abh.leseAnmeldung()
      if (!a.refreshToken) return null
      return { name: a.name ?? '', benutzername: a.benutzername ?? '' }
    },

    /** Öffnet den Browser und wartet, bis der Rücksprung am Mini-Server angekommen und eingelöst ist. */
    async anmelden() {
      if (!konfiguriert) throw new Error('VITE_MS_CLIENT_ID ist nicht gesetzt')
      const port = await abh.lausche()
      const pkce = await erzeugePkce(abh.zufallsBytes, abh.sha256)
      const state = base64url(abh.zufallsBytes(16))
      let ziel: string
      try {
        await abh.oeffneBrowser(baueWindowsAnmeldeUrl({ clientId: id, port, state, challenge: pkce.challenge }))
        ziel = await abh.warteAufRueckkehr()
      } catch (e) {
        await abh.brecheAb().catch(() => undefined)
        throw e instanceof Error ? e : new Error(String(e))
      }
      const q = new URL(ziel, windowsRedirectUri(port)).searchParams
      const fehler = q.get('error')
      if (fehler) throw new Error(`Anmeldung abgebrochen: ${q.get('error_description') ?? fehler}`)
      const code = q.get('code')
      if (!code || q.get('state') !== state) {
        throw new Error('Anmeldung ungültig (Rücksprung passt zu keiner offenen Anmeldung)')
      }
      await tauscheCode(code, pkce.verifier, windowsRedirectUri(port))
    },

    async abmelden() {
      zugriff = null
      await abh.loescheAnmeldung()
    },

    async zugriffstoken() {
      if (zugriff && zugriff.ablauf - abh.jetzt() > PUFFER_MS) return zugriff.token
      const a = await abh.leseAnmeldung()
      if (!a.refreshToken) throw new Error('Nicht mit OneDrive verbunden')
      // Gleichzeitige Aufrufe teilen sich eine Erneuerung.
      erneuerung ??= erneuere(a).finally(() => {
        erneuerung = null
      })
      return erneuerung
    },
  }
}
