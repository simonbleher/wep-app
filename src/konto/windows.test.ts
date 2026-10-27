import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { AUTHORITY, base64url, type TokenAntwort } from './android'
import {
  baueWindowsAnmeldeUrl,
  erstelleWindowsKontoDienst,
  WINDOWS_SCOPES,
  windowsRedirectUri,
  type GespeicherteWindowsAnmeldung,
  type WindowsAbhaengigkeiten,
} from './windows'

const sha256 = async (d: Uint8Array) => new Uint8Array(await webcrypto.subtle.digest('SHA-256', d as BufferSource))

function idToken(daten: object): string {
  const teil = (o: object) => base64url(new TextEncoder().encode(JSON.stringify(o)))
  return `${teil({ alg: 'none' })}.${teil(daten)}.sig`
}

const TOKEN_OK = (extra: object = {}): TokenAntwort => ({
  status: 200,
  text: JSON.stringify({
    access_token: 'ACCESS1',
    refresh_token: 'REFRESH1',
    expires_in: 3600,
    id_token: idToken({ name: 'Erika Musterfrau', preferred_username: 'erika@example.org' }),
    ...extra,
  }),
})

const PORT = 51234

/** Gemockte Abhängigkeiten: Mini-Server, Browser und Anmeldeinformationen laufen im Speicher. */
function aufbau(antworten: TokenAntwort[] = []) {
  let gespeichert: Partial<GespeicherteWindowsAnmeldung> = {}
  let jetzt = 1_000_000
  const anfragen: { url: string; formular: Record<string, string> }[] = []
  const geoeffnet: string[] = []
  // Der „Browser“: liefert das Ziel, das der Mini-Server nach dem Rücksprung melden würde.
  let rueckkehr: (ziel: string | Error) => void = () => undefined
  const abh: WindowsAbhaengigkeiten = {
    lausche: vi.fn(async () => PORT),
    warteAufRueckkehr: vi.fn(
      () =>
        new Promise<string>((resolve, reject) => {
          rueckkehr = (z) => (z instanceof Error ? reject(z) : resolve(z))
        }),
    ),
    brecheAb: vi.fn(async () => undefined),
    oeffneBrowser: vi.fn(async (url: string) => void geoeffnet.push(url)),
    tokenAnfrage: vi.fn(async (url, formular) => {
      anfragen.push({ url, formular })
      const a = antworten.shift()
      if (!a) throw new Error('keine Antwort vorbereitet')
      return a
    }),
    leseAnmeldung: async () => ({ ...gespeichert }),
    speichereAnmeldung: async (a) => void (gespeichert = { ...a }),
    loescheAnmeldung: async () => void (gespeichert = {}),
    zufallsBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i + 1),
    sha256,
    jetzt: () => jetzt,
  }
  return {
    abh,
    anfragen,
    geoeffnet,
    gespeichert: () => gespeichert,
    setzeGespeichert: (a: Partial<GespeicherteWindowsAnmeldung>) => void (gespeichert = a),
    rueckkehr: (z: string | Error) => rueckkehr(z),
    zeit: (ms: number) => void (jetzt += ms),
  }
}

/** Startet die Anmeldung und liefert den state aus der geöffneten URL. */
async function melde(t: ReturnType<typeof aufbau>, dienst: ReturnType<typeof erstelleWindowsKontoDienst>) {
  const fertig = dienst.anmelden()
  await vi.waitFor(() => expect(t.geoeffnet.length).toBeGreaterThan(0))
  const url = new URL(t.geoeffnet[0])
  return { fertig, state: url.searchParams.get('state') as string, url }
}

describe('Anmeldung über Loopback (Windows)', () => {
  it('Umleitung ist http://localhost:<Port> ohne Pfad', () => {
    expect(windowsRedirectUri(PORT)).toBe('http://localhost:51234')
  })

  it('baut die Anmelde-URL mit PKCE und Loopback-Umleitung', () => {
    const u = new URL(baueWindowsAnmeldeUrl({ clientId: 'CID', port: PORT, state: 'S', challenge: 'C' }))
    expect(`${u.origin}${u.pathname}`).toBe(`${AUTHORITY}/oauth2/v2.0/authorize`)
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:51234')
    expect(u.searchParams.get('client_id')).toBe('CID')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBe('C')
    expect(u.searchParams.get('scope')).toBe(WINDOWS_SCOPES.join(' '))
  })

  it('ohne Client-ID nicht verfügbar', async () => {
    const t = aufbau()
    const d = erstelleWindowsKontoDienst(undefined, t.abh)
    expect(d.verfuegbar()).toBe(false)
    expect(await d.aktuellesKonto()).toBeNull()
    await expect(d.anmelden()).rejects.toThrow('VITE_MS_CLIENT_ID')
  })

  it('Erfolg: Browser auf, Rücksprung am Port, Code gegen Token getauscht, Refresh-Token gespeichert', async () => {
    const t = aufbau([TOKEN_OK()])
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const { fertig, state, url } = await melde(t, d)
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:51234')
    t.rueckkehr(`/?code=CODE1&state=${state}&session_state=x`)
    await fertig

    expect(t.anfragen).toHaveLength(1)
    const f = t.anfragen[0].formular
    expect(t.anfragen[0].url).toBe(`${AUTHORITY}/oauth2/v2.0/token`)
    expect(f).toMatchObject({
      client_id: 'CID',
      grant_type: 'authorization_code',
      code: 'CODE1',
      redirect_uri: 'http://localhost:51234',
    })
    // Der Verifier gehört zur Challenge aus der Anmelde-URL (PKCE)
    expect(base64url(await sha256(new TextEncoder().encode(f.code_verifier)))).toBe(url.searchParams.get('code_challenge'))
    // Gespeichert wird nur, was in den Tresor gehört – kein Zugriffstoken
    expect(t.gespeichert()).toEqual({
      clientId: 'CID',
      refreshToken: 'REFRESH1',
      name: 'Erika Musterfrau',
      benutzername: 'erika@example.org',
    })
    expect(await d.aktuellesKonto()).toEqual({ name: 'Erika Musterfrau', benutzername: 'erika@example.org' })
    // Das Zugriffstoken kommt aus dem Arbeitsspeicher, ohne neue Anfrage
    expect(await d.zugriffstoken()).toBe('ACCESS1')
    expect(t.anfragen).toHaveLength(1)
  })

  it('falscher state: Anmeldung ungültig, nichts gespeichert, kein Token-Tausch', async () => {
    const t = aufbau([TOKEN_OK()])
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const { fertig } = await melde(t, d)
    t.rueckkehr('/?code=CODE1&state=FALSCH')
    await expect(fertig).rejects.toThrow('ungültig')
    expect(t.anfragen).toHaveLength(0)
    expect(t.gespeichert()).toEqual({})
  })

  it('Fehler von Microsoft im Rücksprung (z. B. Zugriff verweigert)', async () => {
    const t = aufbau()
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const { fertig, state } = await melde(t, d)
    t.rueckkehr(`/?error=access_denied&error_description=Der+Nutzer+hat+abgelehnt&state=${state}`)
    await expect(fertig).rejects.toThrow('abgebrochen')
    expect(t.anfragen).toHaveLength(0)
  })

  it('Zeitüberschreitung/Abbruch im Programm: Server wird geschlossen, Fehler geht weiter', async () => {
    const t = aufbau()
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const { fertig } = await melde(t, d)
    t.rueckkehr(new Error('Zeitüberschreitung: Der Browser hat nicht geantwortet.'))
    await expect(fertig).rejects.toThrow('Zeitüberschreitung')
    expect(t.abh.brecheAb).toHaveBeenCalled()
  })

  it('Browser lässt sich nicht öffnen: Fehler und Server wird geschlossen', async () => {
    const t = aufbau()
    ;(t.abh.oeffneBrowser as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('kein Browser'))
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    await expect(d.anmelden()).rejects.toThrow('kein Browser')
    expect(t.abh.brecheAb).toHaveBeenCalled()
  })

  it('Microsoft lehnt den Tausch ab: verständlicher Fehler, nichts gespeichert', async () => {
    const t = aufbau([{ status: 400, text: JSON.stringify({ error: 'invalid_grant', error_description: 'AADSB: kaputt\r\nTrace' }) }])
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const { fertig, state } = await melde(t, d)
    t.rueckkehr(`/?code=X&state=${state}`)
    await expect(fertig).rejects.toThrow('fehlgeschlagen (400): AADSB: kaputt')
    expect(t.gespeichert()).toEqual({})
  })

  it('erneuert das Zugriffstoken mit dem Refresh-Token, wenn das alte abgelaufen ist', async () => {
    const t = aufbau([TOKEN_OK({ access_token: 'ACCESS2', refresh_token: 'REFRESH2' })])
    t.setzeGespeichert({ clientId: 'CID', refreshToken: 'REFRESH1', name: 'E', benutzername: 'e@x' })
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    expect(await d.zugriffstoken()).toBe('ACCESS2')
    expect(t.anfragen[0].formular).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'REFRESH1' })
    // der neue Refresh-Token ersetzt den alten
    expect(t.gespeichert().refreshToken).toBe('REFRESH2')
    // noch gültig → keine weitere Anfrage; nach Ablauf (abzüglich Puffer) wieder
    expect(await d.zugriffstoken()).toBe('ACCESS2')
    expect(t.anfragen).toHaveLength(1)
  })

  it('alle Microsoft-Konten: Erneuerung im Tenant des Kontos, ohne Tenant (alte Anmeldung) über „consumers“', async () => {
    const firma = aufbau([TOKEN_OK({ access_token: 'A2', refresh_token: 'R2' })])
    firma.setzeGespeichert({ clientId: 'CID', refreshToken: 'R1', name: 'E', benutzername: 'e@x', tenant: '0a1b2c3d-1111-2222-3333-444455556666' })
    await erstelleWindowsKontoDienst('CID', firma.abh).zugriffstoken()
    expect(firma.anfragen[0].url).toBe('https://login.microsoftonline.com/0a1b2c3d-1111-2222-3333-444455556666/oauth2/v2.0/token')
    expect(firma.gespeichert().tenant).toBe('0a1b2c3d-1111-2222-3333-444455556666')
    const alt = aufbau([TOKEN_OK({ access_token: 'A2' })])
    alt.setzeGespeichert({ clientId: 'CID', refreshToken: 'R1', name: 'E', benutzername: 'e@x' })
    await erstelleWindowsKontoDienst('CID', alt.abh).zugriffstoken()
    expect(alt.anfragen[0].url).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/token')
  })

  it('gleichzeitige Aufrufe teilen sich eine Erneuerung', async () => {
    const t = aufbau([TOKEN_OK({ access_token: 'ACCESS2' })])
    t.setzeGespeichert({ clientId: 'CID', refreshToken: 'REFRESH1' })
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const [a, b] = await Promise.all([d.zugriffstoken(), d.zugriffstoken()])
    expect([a, b]).toEqual(['ACCESS2', 'ACCESS2'])
    expect(t.anfragen).toHaveLength(1)
  })

  it('abgelaufene Anmeldung (invalid_grant): Hinweis zum erneuten Anmelden', async () => {
    const t = aufbau([{ status: 400, text: JSON.stringify({ error: 'invalid_grant' }) }])
    t.setzeGespeichert({ clientId: 'CID', refreshToken: 'ALT' })
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    await expect(d.zugriffstoken()).rejects.toThrow('erneut anmelden')
  })

  it('ohne Anmeldung: kein Konto, Zugriffstoken wirft', async () => {
    const t = aufbau()
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    expect(await d.aktuellesKonto()).toBeNull()
    await expect(d.zugriffstoken()).rejects.toThrow('Nicht mit OneDrive verbunden')
  })

  it('abmelden löscht die Anmeldedaten und das Zugriffstoken im Arbeitsspeicher', async () => {
    const t = aufbau([TOKEN_OK()])
    const d = erstelleWindowsKontoDienst('CID', t.abh)
    const { fertig, state } = await melde(t, d)
    t.rueckkehr(`/?code=C&state=${state}`)
    await fertig
    await d.abmelden()
    expect(t.gespeichert()).toEqual({})
    expect(await d.aktuellesKonto()).toBeNull()
    await expect(d.zugriffstoken()).rejects.toThrow('Nicht mit OneDrive verbunden')
  })
})
