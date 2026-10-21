// Verdrahtung der Windows-Anmeldung mit dem Programm (Rust). Getrennt von windows.ts, damit
// dessen Logik ohne Tauri testbar ist.
import { WepWindows } from '@/windows/api'
import type { WindowsAbhaengigkeiten } from './windows'

export function windowsAbhaengigkeiten(): WindowsAbhaengigkeiten {
  return {
    lausche: () => WepWindows.anmeldungLauschen(),
    warteAufRueckkehr: () => WepWindows.anmeldungWarten(),
    brecheAb: () => WepWindows.anmeldungAbbrechen(),
    oeffneBrowser: (url) => WepWindows.anmeldungBrowser(url),
    tokenAnfrage: (url, formular) => WepWindows.tokenAnfrage(url, formular),
    leseAnmeldung: () => WepWindows.anmeldungLesen(),
    speichereAnmeldung: (a) => WepWindows.anmeldungSpeichern(a),
    loescheAnmeldung: () => WepWindows.anmeldungLoeschen(),
    zufallsBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    async sha256(daten) {
      return new Uint8Array(await crypto.subtle.digest('SHA-256', daten as BufferSource))
    },
    jetzt: () => Date.now(),
  }
}
