// @vitest-environment node
// Paket 8: Anmeldung der Android- und Windows-App (Systembrowser, PKCE, state), Token-Speicher und Zugriff mit Bearer.
import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { appAnmelden, appAnmeldungNachKaltstart, appStartUrl, leseRuecksprung, RUECKSPRUNG_ANDROID, ruecksprungWindows, type AppAnmeldeAbhaengigkeiten, type RuecksprungKanal } from './appAnmeldung'
import { fetchMitBearer, serverZiel } from './appZugriff'
import { androidTokenSpeicher, erstelleTokenHalter, testTokenSpeicher, windowsTokenSpeicher } from './tokenSpeicher'
import { zaehleAltbestand } from '@/sicherung/altbestand'
import type { ServerKonto } from './typen'

const SERVER = 'https://wep-pankow.pages.dev'
const konto = { id: 'k1', name: 'Erika Musterfrau' } as ServerKonto
const sha256 = async (d: Uint8Array) => new Uint8Array(await webcrypto.subtle.digest('SHA-256', d))
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url')

/** Kanal, der den Rücksprung „wie der Server“ baut – oder wie ein Angreifer, je nach `antwort`. */
function testKanal(ruecksprung: string, antwort: (start: URL) => string) {
  const k = {
    geoeffnet: '' as string,
    geschlossen: false,
    kanal: async (): Promise<RuecksprungKanal> => ({
      ruecksprung,
      oeffne: async (url) => {
        k.geoeffnet = url
      },
      warte: async () => antwort(new URL(k.geoeffnet)),
      schliesse: async () => {
        k.geschlossen = true
      },
    }),
  }
  return k
}

function abh(kanal: AppAnmeldeAbhaengigkeiten['kanal'], extra: Partial<AppAnmeldeAbhaengigkeiten> = {}) {
  const getauscht: { code: string; verifier: string }[] = []
  const a: AppAnmeldeAbhaengigkeiten = {
    server: SERVER,
    kanal,
    tausche: async (code, verifier) => {
      getauscht.push({ code, verifier })
      return { token: 'tok-123', konto }
    },
    zufallsBytes: (n) => webcrypto.getRandomValues(new Uint8Array(n)),
    sha256,
    jetzt: () => 1_000_000,
    ...extra,
  }
  return { a, getauscht }
}

describe('App-Anmeldung über den Systembrowser', () => {
  it('Start-Adresse: client=app, challenge (S256 des Verifiers), state, Rücksprung der App', async () => {
    const k = testKanal(RUECKSPRUNG_ANDROID, (s) => `${RUECKSPRUNG_ANDROID}?code=C0DE&state=${s.searchParams.get('state')}`)
    const { a, getauscht } = abh(k.kanal)
    expect(await appAnmelden('google', a)).toEqual({ token: 'tok-123', konto })
    const start = new URL(k.geoeffnet)
    expect(start.origin + start.pathname).toBe(`${SERVER}/api/v2/anmeldung/google/start`)
    expect(start.searchParams.get('client')).toBe('app')
    expect(start.searchParams.get('ruecksprung')).toBe(RUECKSPRUNG_ANDROID)
    expect(start.searchParams.get('state')!.length).toBeGreaterThanOrEqual(16)
    // der Server bekommt nur die Challenge; der Verifier geht erst beim Tausch mit
    expect(getauscht).toHaveLength(1)
    expect(getauscht[0].code).toBe('C0DE')
    expect(b64url(await sha256(new TextEncoder().encode(getauscht[0].verifier)))).toBe(start.searchParams.get('challenge'))
    expect(k.geoeffnet).not.toContain(getauscht[0].verifier)
    expect(k.geschlossen).toBe(true)
  })

  it('Windows: Loopback-Rücksprung mit Port, Antwort als Pfad', async () => {
    const k = testKanal(ruecksprungWindows(51234), (s) => `/?code=X&state=${s.searchParams.get('state')}`)
    const { a } = abh(k.kanal)
    await appAnmelden('microsoft', a)
    expect(new URL(k.geoeffnet).searchParams.get('ruecksprung')).toBe('http://127.0.0.1:51234/')
    expect(appStartUrl(SERVER, 'microsoft', { challenge: 'c', state: 's', ruecksprung: 'r' })).toBe(`${SERVER}/api/v2/anmeldung/microsoft/start?client=app&challenge=c&state=s&ruecksprung=r`)
  })

  it('falscher state: kein Tausch (fremder oder eingeschleuster Rücksprung)', async () => {
    const k = testKanal(RUECKSPRUNG_ANDROID, () => `${RUECKSPRUNG_ANDROID}?code=GESTOHLEN&state=fremd-fremd-fremd-1`)
    const { a, getauscht } = abh(k.kanal)
    await expect(appAnmelden('google', a)).rejects.toThrow(/state/)
    expect(getauscht).toHaveLength(0)
    expect(k.geschlossen).toBe(true)
  })

  it('Fehler vom Server (error=…) kommt als Meldung an, ohne Tausch', async () => {
    const k = testKanal(RUECKSPRUNG_ANDROID, (s) => `${RUECKSPRUNG_ANDROID}?error=Anmeldung+abgebrochen.&state=${s.searchParams.get('state')}`)
    const { a, getauscht } = abh(k.kanal)
    await expect(appAnmelden('google', a)).rejects.toThrow('Anmeldung abgebrochen.')
    expect(getauscht).toHaveLength(0)
  })

  it('leseRuecksprung prüft state vor allem anderen', () => {
    expect(leseRuecksprung('/?code=a&state=s1', 's1')).toEqual({ code: 'a' })
    expect(leseRuecksprung('/?code=a&state=s2', 's1')).toHaveProperty('fehler')
    expect(leseRuecksprung('/?state=s1', 's1')).toHaveProperty('fehler')
    expect(leseRuecksprung('/', 's1')).toHaveProperty('fehler')
  })

  it('Android-Kaltstart: gemerkte Anmeldung wird einmal zu Ende gebracht, danach nicht wieder', async () => {
    const speicher = new Map<string, string>()
    const merker = { getItem: (k: string) => speicher.get(k) ?? null, setItem: (k: string, v: string) => void speicher.set(k, v), removeItem: (k: string) => void speicher.delete(k) }
    let state = ''
    // App wird beendet, während der Browser offen ist: warte() kehrt nie zurück
    const kanal = async (): Promise<RuecksprungKanal> => ({
      ruecksprung: RUECKSPRUNG_ANDROID,
      oeffne: async (url) => {
        state = new URL(url).searchParams.get('state')!
      },
      warte: () => new Promise<string>(() => undefined),
      schliesse: async () => undefined,
    })
    const { a, getauscht } = abh(kanal, { merker })
    void appAnmelden('google', a)
    await vi.waitFor(() => expect(state).not.toBe(''))
    expect(JSON.stringify([...speicher.values()])).not.toContain('tok-')
    const url = `${RUECKSPRUNG_ANDROID}?code=K&state=${state}`
    expect(await appAnmeldungNachKaltstart(url, a)).toEqual({ token: 'tok-123', konto })
    expect(getauscht[0].code).toBe('K')
    expect(speicher.size).toBe(0)
    expect(await appAnmeldungNachKaltstart(url, a)).toBeNull()
    expect(await appAnmeldungNachKaltstart('https://localhost/', a)).toBeNull()
  })

  it('Android-Kaltstart nach Ablauf (10 Minuten) wird verworfen', async () => {
    const speicher = new Map<string, string>([['wep-v2-app-anmeldung', JSON.stringify({ verifier: 'v'.repeat(43), state: 's'.repeat(22), bis: 999 })]])
    const merker = { getItem: (k: string) => speicher.get(k) ?? null, setItem: () => undefined, removeItem: (k: string) => void speicher.delete(k) }
    const { a, getauscht } = abh(async () => ({}) as RuecksprungKanal, { merker })
    expect(await appAnmeldungNachKaltstart(`${RUECKSPRUNG_ANDROID}?code=K&state=${'s'.repeat(22)}`, a)).toBeNull()
    expect(getauscht).toHaveLength(0)
  })
})

describe('Token-Speicher', () => {
  it('Halter: laden, setzen (erst speichern), vergessen', async () => {
    const sp = testTokenSpeicher('alt')
    const h = erstelleTokenHalter(sp)
    expect(h.aktuell()).toBeNull()
    expect(await h.lade()).toBe('alt')
    await h.setze('neu')
    expect([h.aktuell(), sp.wert]).toEqual(['neu', 'neu'])
    await h.vergiss()
    expect([h.aktuell(), sp.wert]).toEqual([null, null])
  })

  it('Speicher kaputt: gilt als abgemeldet; Speichern scheitert → Token wird nicht benutzt', async () => {
    const kaputt = { lese: () => Promise.reject(new Error('Keystore')), speichere: () => Promise.reject(new Error('voll')), loesche: () => Promise.reject(new Error('x')) }
    const h = erstelleTokenHalter(kaputt)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await h.lade()).toBeNull()
    await expect(h.setze('t')).rejects.toThrow('voll')
    expect(h.aktuell()).toBeNull()
    await h.vergiss()
  })

  it('Android und Windows reichen an Plugin bzw. Rust-Befehle durch', async () => {
    let a: string | undefined
    const android = androidTokenSpeicher({
      leseServerToken: async () => (a ? { token: a } : {}),
      speichereServerToken: async ({ token }) => void (a = token),
      loescheServerToken: async () => void (a = undefined),
    })
    expect(await android.lese()).toBeNull()
    await android.speichere('A')
    expect(await android.lese()).toBe('A')
    await android.loesche()
    expect(await android.lese()).toBeNull()

    let w: string | null = null
    const windows = windowsTokenSpeicher({
      serverTokenLesen: async () => w,
      serverTokenSpeichern: async (t) => void (w = t),
      serverTokenLoeschen: async () => void (w = null),
    })
    await windows.speichere('W')
    expect(await windows.lese()).toBe('W')
    await windows.loesche()
    expect(await windows.lese()).toBeNull()
  })
})

describe('Zugriff der App auf den Server', () => {
  const SEITE = 'https://localhost/'

  it('nur /api/v2 der eigenen Seite wird umgeleitet', () => {
    expect(serverZiel('/api/v2/weps?x=1', SEITE, SERVER)).toBe(`${SERVER}/api/v2/weps?x=1`)
    expect(serverZiel('https://localhost/api/v2/ich', SEITE, SERVER)).toBe(`${SERVER}/api/v2/ich`)
    expect(serverZiel('/api/v2', SEITE, SERVER)).toBe(`${SERVER}/api/v2`)
    expect(serverZiel('/api/v2x', SEITE, SERVER)).toBeNull()
    expect(serverZiel('/WEP_Vorlage.xlsx', SEITE, SERVER)).toBeNull()
    expect(serverZiel('https://graph.microsoft.com/api/v2/x', SEITE, SERVER)).toBeNull()
    expect(serverZiel('https://tauri.localhost/api/v2/ich', 'https://tauri.localhost/', SERVER)).toBe(`${SERVER}/api/v2/ich`)
  })

  it('Bearer statt Cookie, Körper und Methode bleiben, andere Adressen unberührt', async () => {
    const gesehen: Request[] = []
    const roh: unknown[] = []
    const original = (async (e: RequestInfo | URL, init?: RequestInit) => {
      if (typeof e === 'string' && e.startsWith('/')) roh.push(e)
      else gesehen.push(e instanceof Request ? e : new Request(e, init))
      return new Response('{}')
    }) as typeof fetch
    let token: string | null = 'geheim'
    const f = fetchMitBearer(original, SERVER, () => token, () => SEITE)

    await f('/api/v2/weps/w1', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{"a":1}' })
    const r = gesehen[0]
    expect(r.url).toBe(`${SERVER}/api/v2/weps/w1`)
    expect(r.method).toBe('PUT')
    expect(r.headers.get('authorization')).toBe('Bearer geheim')
    expect(r.headers.get('content-type')).toBe('application/json')
    expect(r.credentials).toBe('omit')
    expect(await r.text()).toBe('{"a":1}')

    // Foto-Upload als Request-Objekt mit Bytes
    await f(new Request('https://localhost/api/v2/weps/w1/dateien/f1.jpg', { method: 'PUT', body: new Uint8Array([1, 2, 3]) }))
    expect(gesehen[1].url).toBe(`${SERVER}/api/v2/weps/w1/dateien/f1.jpg`)
    expect(new Uint8Array(await gesehen[1].arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(gesehen[1].headers.get('authorization')).toBe('Bearer geheim')

    // andere Adressen: unverändert, kein Token
    await f('/WEP_Vorlage.xlsx')
    expect(roh).toEqual(['/WEP_Vorlage.xlsx'])

    // ohne Token (vor der Anmeldung, Token-Tausch): kein Authorization-Kopf, auch kein mitgeschickter
    token = null
    await f('/api/v2/anmeldung/app/token', { method: 'POST', headers: { authorization: 'Bearer alt' }, body: '{}' })
    expect(gesehen[2].headers.get('authorization')).toBeNull()
  })

  it('Altbestand: ohne v1-Datenbank 0 und keine neue Datenbank angelegt', async () => {
    const offen = vi.fn()
    const idb = { databases: async () => [{ name: 'wep-db-v2', version: 6 }], open: offen } as unknown as IDBFactory
    expect(await zaehleAltbestand('wep-db', idb)).toBe(0)
    expect(offen).not.toHaveBeenCalled()
  })
})
