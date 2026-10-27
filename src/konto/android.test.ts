import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  ANDROID_SCOPES,
  AUTHORITY,
  CONSUMERS_TID,
  REDIRECT_URI,
  base64url,
  baueAnmeldeUrl,
  erstelleAndroidKontoDienst,
  erzeugePkce,
  kontoAusIdToken,
  tokenUrl,
  type AndroidAbhaengigkeiten,
  type GespeicherteAnmeldung,
  type TokenAntwort,
} from './android'
import { anmeldeFehlerText } from './fehler'

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

/** Gemockte Abhängigkeiten: Browser, Rücksprung und natives Plugin laufen im Speicher. */
function aufbau(antworten: TokenAntwort[] = []) {
  let anmeldung: Partial<GespeicherteAnmeldung> = {}
  let rueckkehr: (url: string) => void = () => undefined
  let browserFertig: () => void = () => undefined
  let jetzt = 1_000_000
  const speicher = new Map<string, string>()
  const anfragen: { url: string; formular: Record<string, string> }[] = []
  const geoeffnet: string[] = []
  const abh: AndroidAbhaengigkeiten = {
    tokenAnfrage: vi.fn(async (url, formular) => {
      anfragen.push({ url, formular })
      const a = antworten.shift()
      if (!a) throw new Error('keine Antwort vorbereitet')
      return a
    }),
    leseAnmeldung: async () => ({ ...anmeldung }),
    speichereAnmeldung: async (a) => void (anmeldung = { ...a }),
    loescheAnmeldung: async () => void (anmeldung = {}),
    oeffneBrowser: async (url) => void geoeffnet.push(url),
    schliesseBrowser: async () => undefined,
    aufRueckkehr: async (cb) => {
      rueckkehr = cb
      return () => undefined
    },
    aufBrowserBeendet: async (cb) => {
      browserFertig = cb
      return () => undefined
    },
    startUrl: async () => null,
    speicher: {
      getItem: (k) => speicher.get(k) ?? null,
      setItem: (k, v) => void speicher.set(k, v),
      removeItem: (k) => void speicher.delete(k),
    },
    zufallsBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i + 1),
    sha256,
    jetzt: () => jetzt,
  }
  return {
    abh,
    anfragen,
    geoeffnet,
    speicher,
    anmeldung: () => anmeldung,
    setzeAnmeldung: (a: Partial<GespeicherteAnmeldung>) => void (anmeldung = a),
    rueckkehr: (url: string) => rueckkehr(url),
    browserFertig: () => browserFertig(),
    zeit: (ms: number) => void (jetzt += ms),
  }
}

/** Startet die Anmeldung und liefert state aus der geöffneten URL. */
async function melde(t: ReturnType<typeof aufbau>, dienst: ReturnType<typeof erstelleAndroidKontoDienst>) {
  const fertig = dienst.anmelden()
  await vi.waitFor(() => expect(t.geoeffnet.length).toBeGreaterThan(0))
  const q = new URL(t.geoeffnet.at(-1) as string).searchParams
  return { fertig, state: q.get('state') as string, q }
}

describe('PKCE', () => {
  it('berechnet die Challenge nach RFC 7636 (Testvektor aus Anhang B)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = base64url(await sha256(new TextEncoder().encode(verifier)))
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('erzeugt einen Verifier mit 43 URL-sicheren Zeichen', async () => {
    const p = await erzeugePkce((n) => webcrypto.getRandomValues(new Uint8Array(n)), sha256)
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(p.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(p.challenge).not.toBe(p.verifier)
  })

  it('baut die Anmelde-URL mit Authority common (alle Microsoft-Konten), Scopes, S256 und Rücksprung', () => {
    const u = new URL(baueAnmeldeUrl({ clientId: 'CID', state: 'ST', challenge: 'CH' }))
    expect(u.origin + u.pathname).toBe(`${AUTHORITY}/oauth2/v2.0/authorize`)
    expect(AUTHORITY).toBe('https://login.microsoftonline.com/common')
    expect(u.searchParams.get('client_id')).toBe('CID')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('redirect_uri')).toBe('de.wep.app://auth')
    expect(u.searchParams.get('scope')).toBe(ANDROID_SCOPES.join(' '))
    expect(u.searchParams.get('scope')).toContain('Files.ReadWrite.AppFolder')
    expect(u.searchParams.get('scope')).toContain('offline_access')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBe('CH')
  })

  it('liest Namen und Anmeldenamen aus dem id_token, ohne Token mit Ersatzwert', () => {
    expect(kontoAusIdToken(idToken({ name: 'Erika Musterfrau', preferred_username: 'e@example.org' }))).toEqual({
      name: 'Erika Musterfrau',
      benutzername: 'e@example.org',
    })
    expect(kontoAusIdToken(undefined).benutzername).toBe('Microsoft-Konto')
    expect(kontoAusIdToken('kaputt').benutzername).toBe('Microsoft-Konto')
  })
})

describe('Android-Konto-Dienst', () => {
  it('ist ohne Client-ID nicht verfügbar und hat kein Konto', async () => {
    const dienst = erstelleAndroidKontoDienst('', aufbau().abh)
    expect(dienst.verfuegbar()).toBe(false)
    expect(await dienst.aktuellesKonto()).toBeNull()
    await expect(dienst.anmelden()).rejects.toThrow('VITE_MS_CLIENT_ID')
  })

  it('meldet an: Browser → Rücksprung → Token-Tausch nativ mit Verifier, Konto gespeichert', async () => {
    const t = aufbau([TOKEN_OK()])
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    expect(await dienst.aktuellesKonto()).toBeNull()

    const { fertig, state, q } = await melde(t, dienst)
    t.rueckkehr(`${REDIRECT_URI}?code=CODE123&state=${state}`)
    await fertig

    expect(t.anfragen).toHaveLength(1)
    const a = t.anfragen[0]
    expect(a.url).toBe(`${AUTHORITY}/oauth2/v2.0/token`)
    expect(a.formular).toMatchObject({
      client_id: 'CID',
      grant_type: 'authorization_code',
      code: 'CODE123',
      redirect_uri: REDIRECT_URI,
    })
    // Der Verifier gehört zur Challenge aus der Anmelde-URL
    const challenge = base64url(await sha256(new TextEncoder().encode(a.formular.code_verifier)))
    expect(challenge).toBe(q.get('code_challenge'))
    expect(t.anmeldung()).toMatchObject({
      clientId: 'CID',
      refreshToken: 'REFRESH1',
      accessToken: 'ACCESS1',
      ablauf: 1_000_000 + 3600_000,
      name: 'Erika Musterfrau',
      benutzername: 'erika@example.org',
    })
    expect(await dienst.aktuellesKonto()).toEqual({ name: 'Erika Musterfrau', benutzername: 'erika@example.org' })
    // Der gemerkte Anmeldevorgang ist verbraucht
    expect(t.speicher.size).toBe(0)
  })

  it('lehnt einen Rücksprung mit falschem state ab, ohne Token anzufragen', async () => {
    const t = aufbau([TOKEN_OK()])
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    const { fertig } = await melde(t, dienst)
    t.rueckkehr(`${REDIRECT_URI}?code=CODE&state=FALSCH`)
    await expect(fertig).rejects.toThrow('ungültig')
    expect(t.anfragen).toHaveLength(0)
    expect(t.anmeldung()).toEqual({})
  })

  it('meldet Fehler aus dem Rücksprung (z. B. Zustimmung verweigert)', async () => {
    const t = aufbau()
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    const { fertig, state } = await melde(t, dienst)
    t.rueckkehr(`${REDIRECT_URI}?error=access_denied&error_description=Abgelehnt&state=${state}`)
    await expect(fertig).rejects.toThrow('Abgelehnt')
  })

  it('meldet einen Fehler des Token-Endpunkts', async () => {
    const t = aufbau([{ status: 400, text: JSON.stringify({ error: 'invalid_request', error_description: 'AADSTS9002327: Origin' }) }])
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    const { fertig, state } = await melde(t, dienst)
    t.rueckkehr(`${REDIRECT_URI}?code=C&state=${state}`)
    await expect(fertig).rejects.toThrow('AADSTS9002327')
    expect(t.anmeldung()).toEqual({})
  })

  it('bricht ab, wenn der Browser ohne Rücksprung geschlossen wird', async () => {
    vi.useFakeTimers()
    try {
      const t = aufbau()
      const dienst = erstelleAndroidKontoDienst('CID', t.abh)
      const p = dienst.anmelden()
      const ergebnis = p.then(
        () => 'ok',
        (e: Error) => e.message,
      )
      await vi.waitFor(() => expect(t.geoeffnet).toHaveLength(1)) // PKCE (echtes WebCrypto) ist fertig
      t.browserFertig()
      await vi.advanceTimersByTimeAsync(2500)
      expect(await ergebnis).toBe('Anmeldung abgebrochen')
    } finally {
      vi.useRealTimers()
    }
  })

  it('verwendet ein noch gültiges Zugriffstoken ohne Anfrage', async () => {
    const t = aufbau()
    t.setzeAnmeldung({ refreshToken: 'R', accessToken: 'A', ablauf: 1_000_000 + 10 * 60_000, name: '', benutzername: 'x' })
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    expect(await dienst.zugriffstoken()).toBe('A')
    expect(t.anfragen).toHaveLength(0)
  })

  it('erneuert ein abgelaufenes Zugriffstoken nativ und speichert den neuen Refresh-Token', async () => {
    const t = aufbau([
      { status: 200, text: JSON.stringify({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600 }) },
    ])
    t.setzeAnmeldung({ refreshToken: 'R', accessToken: 'A', ablauf: 1_000_000 + 30_000, name: 'N', benutzername: 'b' })
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    // zwei gleichzeitige Aufrufe → nur eine Erneuerung
    const [x, y] = await Promise.all([dienst.zugriffstoken(), dienst.zugriffstoken()])
    expect([x, y]).toEqual(['A2', 'A2'])
    expect(t.anfragen).toHaveLength(1)
    expect(t.anfragen[0].formular).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'R', client_id: 'CID' })
    expect(t.anmeldung()).toMatchObject({ refreshToken: 'R2', accessToken: 'A2', name: 'N', benutzername: 'b' })
  })

  it('alle Microsoft-Konten: Tenant aus dem id_token merken (persönlich „consumers“, Organisation die Tenant-ID)', async () => {
    for (const [tid, erwartet] of [
      [CONSUMERS_TID, 'consumers'],
      ['0a1b2c3d-1111-2222-3333-444455556666', '0a1b2c3d-1111-2222-3333-444455556666'],
    ]) {
      const t = aufbau([TOKEN_OK({ id_token: idToken({ name: 'Erika Musterfrau', preferred_username: 'erika@example.org', tid }) })])
      const dienst = erstelleAndroidKontoDienst('CID', t.abh)
      const { fertig, state } = await melde(t, dienst)
      t.rueckkehr(`${REDIRECT_URI}?code=C&state=${state}`)
      await fertig
      expect(t.anmeldung().tenant).toBe(erwartet)
    }
  })

  it('erneuert im Tenant des Kontos; alte Anmeldung ohne Tenant wie bisher über „consumers“', async () => {
    const antwort = () => ({ status: 200, text: JSON.stringify({ access_token: 'A2', expires_in: 3600 }) })
    const firma = aufbau([antwort()])
    firma.setzeAnmeldung({ refreshToken: 'R', accessToken: 'A', ablauf: 0, name: 'N', benutzername: 'b', tenant: '0a1b2c3d-1111-2222-3333-444455556666' })
    await erstelleAndroidKontoDienst('CID', firma.abh).zugriffstoken()
    expect(firma.anfragen[0].url).toBe('https://login.microsoftonline.com/0a1b2c3d-1111-2222-3333-444455556666/oauth2/v2.0/token')
    expect(firma.anmeldung().tenant).toBe('0a1b2c3d-1111-2222-3333-444455556666')
    const alt = aufbau([antwort()])
    alt.setzeAnmeldung({ refreshToken: 'R', accessToken: 'A', ablauf: 0, name: 'N', benutzername: 'b' })
    await erstelleAndroidKontoDienst('CID', alt.abh).zugriffstoken()
    expect(alt.anfragen[0].url).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/token')
    expect(tokenUrl('../x')).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/token')
  })

  it('fehlende Administratorzustimmung (AADSTS65001/90094): verständliche Meldung', async () => {
    const t = aufbau()
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    const { fertig, state } = await melde(t, dienst)
    t.rueckkehr(`${REDIRECT_URI}?error=consent_required&error_description=${encodeURIComponent('AADSTS65001: The user or administrator has not consented')}&state=${state}`)
    await expect(fertig).rejects.toThrow(/Administratorzustimmung.*AADSTS65001/)
    expect(anmeldeFehlerText(new Error('AADSTS90094: Admin consent is required'))).toMatch(/IT.*Administratorzustimmung.*AADSTS90094/)
    expect(anmeldeFehlerText(new Error('Netz weg'))).toBe('Netz weg')
  })

  it('behält den alten Refresh-Token, wenn Microsoft keinen neuen liefert', async () => {
    const t = aufbau([{ status: 200, text: JSON.stringify({ access_token: 'A2', expires_in: 60 }) }])
    t.setzeAnmeldung({ refreshToken: 'R', accessToken: 'A', ablauf: 0, name: '', benutzername: '' })
    await erstelleAndroidKontoDienst('CID', t.abh).zugriffstoken()
    expect(t.anmeldung().refreshToken).toBe('R')
  })

  it('meldet abgelaufene Anmeldung (invalid_grant) verständlich', async () => {
    const t = aufbau([{ status: 400, text: JSON.stringify({ error: 'invalid_grant' }) }])
    t.setzeAnmeldung({ refreshToken: 'R', accessToken: '', ablauf: 0, name: '', benutzername: '' })
    await expect(erstelleAndroidKontoDienst('CID', t.abh).zugriffstoken()).rejects.toThrow('erneut anmelden')
  })

  it('wirft ohne Anmeldung „Nicht mit OneDrive verbunden“; abmelden löscht die Anmeldedaten', async () => {
    const t = aufbau()
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    await expect(dienst.zugriffstoken()).rejects.toThrow('Nicht mit OneDrive verbunden')
    t.setzeAnmeldung({ refreshToken: 'R', accessToken: 'A', ablauf: 9e12, name: '', benutzername: 'b' })
    expect(await dienst.aktuellesKonto()).not.toBeNull()
    await dienst.abmelden()
    expect(await dienst.aktuellesKonto()).toBeNull()
  })

  it('verarbeitet einen Kaltstart über den Rücksprung (App wurde im Browser beendet)', async () => {
    const t = aufbau([TOKEN_OK()])
    t.speicher.set('wep-android-login', JSON.stringify({ verifier: 'V', state: 'S' }))
    t.abh.startUrl = async () => `${REDIRECT_URI}?code=C&state=S`
    const dienst = erstelleAndroidKontoDienst('CID', t.abh)
    expect(await dienst.aktuellesKonto()).toEqual({ name: 'Erika Musterfrau', benutzername: 'erika@example.org' })
    expect(t.anfragen[0].formular.code_verifier).toBe('V')
  })
})
