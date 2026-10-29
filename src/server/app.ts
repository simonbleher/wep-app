// Server-Modus in der Android- und Windows-App (Paket 8): Verdrahtung mit Capacitor bzw. Tauri. Wird nur in den
// Apps geladen (main.tsx), vor dem ersten Zeichnen: Zugriff mit Bearer einrichten und das gespeicherte Token laden.
import { Capacitor } from '@capacitor/core'
import { WepNative } from '@/android/native'
import { WepWindows } from '@/windows/api'
import { tauscheAppCode } from './api'
import { appAnmelden, appAnmeldungNachKaltstart, RUECKSPRUNG_ANDROID, ruecksprungWindows, type AppAnmeldeAbhaengigkeiten, type Anbieter, type RuecksprungKanal } from './appAnmeldung'
import { installiereAppZugriff, SERVER_ADRESSE } from './appZugriff'
import { androidTokenSpeicher, erstelleTokenHalter, windowsTokenSpeicher } from './tokenSpeicher'
import type { ServerKonto } from './typen'

/** Was V2Tor in den Apps braucht. */
export interface AppAnbindung {
  hatToken(): boolean
  /** Anmeldung im Systembrowser; das Token liegt danach sicher im Gerät. */
  anmelden(anbieter: Anbieter): Promise<ServerKonto>
  /** Android: Kam die App über den Rücksprung (Kaltstart)? Dann die Anmeldung zu Ende bringen. */
  kaltstart(): Promise<ServerKonto | null>
  /** Laufende Anmeldung abbrechen (Windows: Mini-Server beenden; Android: der Browser meldet das Schließen selbst). */
  abbrechen(): Promise<void>
  /** Token löschen (nach dem Abmelden beim Server oder wenn der Server die Sitzung nicht mehr kennt). */
  vergiss(): Promise<void>
}

const android = Capacitor.isNativePlatform()
const halter = erstelleTokenHalter(android ? androidTokenSpeicher(WepNative) : windowsTokenSpeicher(WepWindows))

/** So lange nach dem Schließen des Browsers auf den Rücksprung warten, bevor die Anmeldung als abgebrochen gilt. */
const ABBRUCH_WARTEZEIT_MS = 1500

async function androidKanal(): Promise<RuecksprungKanal> {
  const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')])
  let angekommen = false
  let fertig: (url: string) => void = () => undefined
  let abbruch: (e: Error) => void = () => undefined
  const rueckkehr = new Promise<string>((res, rej) => {
    fertig = res
    abbruch = rej
  })
  const h1 = await App.addListener('appUrlOpen', (e) => {
    if (!e.url.startsWith(RUECKSPRUNG_ANDROID)) return
    angekommen = true
    fertig(e.url)
  })
  const h2 = await Browser.addListener('browserFinished', () => {
    // Browser zu: kam kurz danach kein Rücksprung, wurde die Anmeldung abgebrochen
    setTimeout(() => !angekommen && abbruch(new Error('Anmeldung abgebrochen.')), ABBRUCH_WARTEZEIT_MS)
  })
  return {
    ruecksprung: RUECKSPRUNG_ANDROID,
    oeffne: (url) => Browser.open({ url }),
    warte: () => rueckkehr,
    async schliesse() {
      await h1.remove()
      await h2.remove()
      await Browser.close().catch(() => undefined)
    },
  }
}

async function windowsKanal(): Promise<RuecksprungKanal> {
  const port = await WepWindows.anmeldungLauschen()
  return {
    ruecksprung: ruecksprungWindows(port),
    oeffne: (url) => WepWindows.anmeldungBrowser(url),
    warte: () => WepWindows.anmeldungWarten(),
    schliesse: () => WepWindows.anmeldungAbbrechen(),
  }
}

function abhaengigkeiten(): AppAnmeldeAbhaengigkeiten {
  return {
    server: SERVER_ADRESSE,
    kanal: android ? androidKanal : windowsKanal,
    tausche: tauscheAppCode,
    zufallsBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', d as BufferSource)),
    // Kaltstart gibt es nur auf Android (Windows beendet das Programm nicht, während der Browser offen ist)
    merker: android ? localStorage : undefined,
    jetzt: () => Date.now(),
  }
}

export const appAnbindung: AppAnbindung = {
  hatToken: () => halter.aktuell() !== null,
  async anmelden(anbieter) {
    const { token, konto } = await appAnmelden(anbieter, abhaengigkeiten())
    await halter.setze(token)
    return konto
  },
  async kaltstart() {
    if (!android) return null
    const { App } = await import('@capacitor/app')
    const r = await appAnmeldungNachKaltstart((await App.getLaunchUrl())?.url ?? null, abhaengigkeiten())
    if (!r) return null
    await halter.setze(r.token)
    return r.konto
  },
  abbrechen: async () => {
    if (!android) await WepWindows.anmeldungAbbrechen().catch(() => undefined)
  },
  vergiss: () => halter.vergiss(),
}

/** Vor dem ersten Zeichnen: alle /api/v2-Aufrufe an den Server (mit Token), gespeichertes Token laden. */
export async function starteAppServer(): Promise<AppAnbindung> {
  installiereAppZugriff(() => halter.aktuell())
  await halter.lade()
  return appAnbindung
}
