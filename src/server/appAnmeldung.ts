// Server-Modus in der Android- und Windows-App (Paket 8): Anmeldung über den Systembrowser (Android: Custom Tabs,
// Windows: Standardbrowser) – nie in einer eingebetteten WebView, das verbietet Google.
//
// 1. Die App erzeugt Verifier + Challenge (PKCE, S256) und einen state.
// 2. Der Browser öffnet /api/v2/anmeldung/<anbieter>/start?client=app&… beim Server; der macht die Anmeldung bei
//    Google oder Microsoft mit seinen eigenen Rücksprung-Adressen (keine neuen Einträge dort).
// 3. Der Server springt zurück in die App (Android: de.wep.app://auth/server, Windows: http://127.0.0.1:<Port>/) –
//    mit einem Einmal-Code (60 Sekunden) und dem state.
// 4. Die App prüft den state und tauscht Code + Verifier gegen das Sitzungs-Token.
//
// Die Abhängigkeiten sind austauschbar, damit der Ablauf ohne Gerät testbar ist (appAnmeldung.test.ts).
import { base64url, erzeugePkce } from '@/konto/android'
import type { ServerKonto } from './typen'

export type Anbieter = 'google' | 'microsoft'

/** Rücksprung der Android-App (Intent-Filter de.wep.app://auth im AndroidManifest). */
export const RUECKSPRUNG_ANDROID = 'de.wep.app://auth/server'
/** Rücksprung der Windows-App: Mini-Server des Programms (src-tauri/src/anmeldung.rs). */
export const ruecksprungWindows = (port: number) => `http://127.0.0.1:${port}/`

/** Wie lange eine offene Anmeldung einen Neustart der App übersteht (Android beendet Apps im Hintergrund). */
const OFFEN_MS = 10 * 60 * 1000
const OFFEN_KEY = 'wep-v2-app-anmeldung'

export function appStartUrl(server: string, anbieter: Anbieter, p: { challenge: string; state: string; ruecksprung: string }): string {
  const q = new URLSearchParams({ client: 'app', challenge: p.challenge, state: p.state, ruecksprung: p.ruecksprung })
  return `${server}/api/v2/anmeldung/${anbieter}/start?${q.toString()}`
}

/** Rücksprung auswerten: Code bei passendem state, sonst eine Meldung. */
export function leseRuecksprung(adresse: string, state: string): { code: string } | { fehler: string } {
  const i = adresse.indexOf('?')
  const q = new URLSearchParams(i < 0 ? '' : adresse.slice(i + 1))
  if (q.get('state') !== state) return { fehler: 'Die Anmeldung passt nicht zu dieser App (state). Bitte noch einmal anmelden.' }
  const fehler = q.get('error')
  if (fehler) return { fehler: fehler.slice(0, 300) }
  const code = q.get('code')
  return code ? { code } : { fehler: 'Der Server hat keinen Code geschickt. Bitte noch einmal anmelden.' }
}

/** Weg in den Browser und zurück, je Plattform. */
export interface RuecksprungKanal {
  ruecksprung: string
  oeffne(url: string): Promise<void>
  /** Wartet auf den Rücksprung (volle Adresse oder Pfad mit Query). Wirft bei Abbruch. */
  warte(): Promise<string>
  /** Browser schließen bzw. Mini-Server beenden (auch nach Fehlern). */
  schliesse(): Promise<void>
}

export interface AppAnmeldung {
  token: string
  konto: ServerKonto
}

export interface AppAnmeldeAbhaengigkeiten {
  server: string
  kanal(): Promise<RuecksprungKanal>
  /** POST /api/v2/anmeldung/app/token */
  tausche(code: string, verifier: string): Promise<AppAnmeldung>
  zufallsBytes(n: number): Uint8Array
  sha256(d: Uint8Array): Promise<Uint8Array>
  /** Merkt Verifier + state für den Kaltstart (Android); ohne: nur im Arbeitsspeicher. */
  merker?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  jetzt(): number
}

interface Offen {
  verifier: string
  state: string
  bis: number
}

function merke(abh: AppAnmeldeAbhaengigkeiten, o: Offen | null): void {
  try {
    if (o) abh.merker?.setItem(OFFEN_KEY, JSON.stringify(o))
    else abh.merker?.removeItem(OFFEN_KEY)
  } catch {
    /* ohne Speicher klappt nur der Kaltstart nicht */
  }
}

async function einloesen(abh: AppAnmeldeAbhaengigkeiten, adresse: string, offen: Offen): Promise<AppAnmeldung> {
  const r = leseRuecksprung(adresse, offen.state)
  if ('fehler' in r) throw new Error(r.fehler)
  return abh.tausche(r.code, offen.verifier)
}

/** Anmeldung im Systembrowser; liefert Token und Konto (gespeichert wird beim Aufrufer). */
export async function appAnmelden(anbieter: Anbieter, abh: AppAnmeldeAbhaengigkeiten): Promise<AppAnmeldung> {
  const { verifier, challenge } = await erzeugePkce(abh.zufallsBytes, abh.sha256)
  const offen: Offen = { verifier, state: base64url(abh.zufallsBytes(24)), bis: abh.jetzt() + OFFEN_MS }
  const kanal = await abh.kanal()
  merke(abh, offen)
  try {
    await kanal.oeffne(appStartUrl(abh.server, anbieter, { challenge, state: offen.state, ruecksprung: kanal.ruecksprung }))
    const adresse = await kanal.warte()
    return await einloesen(abh, adresse, offen)
  } finally {
    merke(abh, null)
    await kanal.schliesse().catch(() => undefined)
  }
}

/**
 * Android hat die App gestartet, weil der Browser zurückgesprungen ist (die App war im Hintergrund beendet worden):
 * die gemerkte Anmeldung zu Ende bringen. null = keine offene Anmeldung zu diesem Rücksprung.
 */
export async function appAnmeldungNachKaltstart(adresse: string | null, abh: AppAnmeldeAbhaengigkeiten): Promise<AppAnmeldung | null> {
  if (!adresse?.startsWith(RUECKSPRUNG_ANDROID)) return null
  let offen: Offen | null = null
  try {
    offen = JSON.parse(abh.merker?.getItem(OFFEN_KEY) ?? 'null') as Offen | null
  } catch {
    offen = null
  }
  merke(abh, null)
  if (!offen || offen.bis < abh.jetzt()) return null
  return einloesen(abh, adresse, offen)
}
