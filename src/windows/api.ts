// Brücke zum Windows-Programm (Rust, siehe src-tauri/src/). Nur dort vorhanden; das Tauri-Paket
// wird erst beim ersten Aufruf geladen, damit Browser und Android-App es nie brauchen.
import type { TokenAntwort } from '@/konto/android'

/** Gemerkter Stand des Live-Updates (src-tauri/src/webupdate.rs). */
export interface WebZustand {
  /** Commit des Pakets, das gerade läuft (null = Web-Teil aus der .exe). */
  aktiv: string | null
  /** Geladen, wird beim nächsten Start aktiv. */
  naechste: string | null
  unbestaetigt: string | null
  fehlgeschlagen: string[]
}

export interface WebInfo {
  zustand: WebZustand
  /** Nummer der Hülle (src-tauri/huelle-version.txt). */
  huelle: number
  /** Programmversion (tauri.conf.json). */
  programm: string
}

export interface ProgrammUpdate {
  version: string
  notizen: string | null
}

export interface ProgrammFortschritt {
  geladen: number
  gesamt: number
}

/** Was im Credential Manager liegt (das Zugriffstoken bleibt im Arbeitsspeicher). */
export interface WindowsAnmeldung {
  clientId: string
  refreshToken: string
  name: string
  benutzername: string
}

export interface WepWindowsApi {
  // Anmeldung (Loopback + PKCE)
  anmeldungLauschen(): Promise<number>
  anmeldungWarten(): Promise<string>
  anmeldungAbbrechen(): Promise<void>
  anmeldungBrowser(url: string): Promise<void>
  tokenAnfrage(url: string, formular: Record<string, string>): Promise<TokenAntwort>
  anmeldungLesen(): Promise<Partial<WindowsAnmeldung>>
  anmeldungSpeichern(a: WindowsAnmeldung): Promise<void>
  anmeldungLoeschen(): Promise<void>
  // „Speichern unter…“: true = gespeichert, false = abgebrochen
  dateiSpeichern(daten: Uint8Array, name: string): Promise<boolean>
  // Updates
  webInfo(): Promise<WebInfo>
  webStartGemeldet(): Promise<void>
  webPaketLaden(commit: string, sha256: string): Promise<void>
  programmPruefen(): Promise<ProgrammUpdate | null>
  programmInstallieren(fortschritt: (f: ProgrammFortschritt) => void): Promise<void>
}

async function aufruf<T>(befehl: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(befehl, args)
}

export const WepWindows: WepWindowsApi = {
  anmeldungLauschen: () => aufruf('anmeldung_lauschen'),
  anmeldungWarten: () => aufruf('anmeldung_warten'),
  anmeldungAbbrechen: () => aufruf('anmeldung_abbrechen'),
  anmeldungBrowser: (url) => aufruf('anmeldung_browser', { url }),
  tokenAnfrage: (url, formular) => aufruf('token_anfrage', { url, formular }),
  anmeldungLesen: () => aufruf('anmeldung_lesen'),
  anmeldungSpeichern: (daten) => aufruf('anmeldung_speichern', { daten }),
  anmeldungLoeschen: () => aufruf('anmeldung_loeschen'),
  async dateiSpeichern(daten, name) {
    const { invoke } = await import('@tauri-apps/api/core')
    // Rohe Bytes im Anfragekörper (ohne Base64); der Name geht URL-kodiert im Kopf mit.
    return invoke<boolean>('datei_speichern', daten, { headers: { 'x-dateiname': encodeURIComponent(name) } })
  },
  webInfo: () => aufruf('web_info'),
  webStartGemeldet: () => aufruf('web_start_gemeldet'),
  webPaketLaden: (commit, sha256) => aufruf('web_paket_laden', { commit, sha256 }),
  programmPruefen: () => aufruf('programm_pruefen'),
  async programmInstallieren(fortschritt) {
    const { Channel, invoke } = await import('@tauri-apps/api/core')
    const kanal = new Channel<ProgrammFortschritt>()
    kanal.onmessage = fortschritt
    await invoke('programm_installieren', { fortschritt: kanal })
  },
}
