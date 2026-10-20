// Verdrahtung der Android-Anmeldung mit Capacitor (Browser, App-Rücksprung) und dem
// nativen Plugin. Getrennt von android.ts, damit dessen Logik ohne Capacitor testbar ist.
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { WepNative } from '@/android/native'
import type { AndroidAbhaengigkeiten } from './android'

export function androidAbhaengigkeiten(): AndroidAbhaengigkeiten {
  return {
    tokenAnfrage: (url, formular) => WepNative.tokenAnfrage({ url, formular }),
    leseAnmeldung: () => WepNative.leseAnmeldung(),
    speichereAnmeldung: (a) => WepNative.speichereAnmeldung(a),
    loescheAnmeldung: () => WepNative.loescheAnmeldung(),
    oeffneBrowser: (url) => Browser.open({ url }),
    schliesseBrowser: () => Browser.close(),
    async aufRueckkehr(cb) {
      const h = await App.addListener('appUrlOpen', (e) => cb(e.url))
      return () => void h.remove()
    },
    async aufBrowserBeendet(cb) {
      const h = await Browser.addListener('browserFinished', cb)
      return () => void h.remove()
    },
    async startUrl() {
      return (await App.getLaunchUrl())?.url ?? null
    },
    speicher: localStorage,
    zufallsBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    async sha256(daten) {
      return new Uint8Array(await crypto.subtle.digest('SHA-256', daten as BufferSource))
    },
    jetzt: () => Date.now(),
  }
}
