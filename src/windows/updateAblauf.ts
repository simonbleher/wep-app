// Ablauf der Updates des Windows-Programms, mit austauschbaren Abhängigkeiten (Tests in
// updateAblauf.test.ts; die echte Verdrahtung steht in updateDienst.ts).
//
// Live-Update: version.json der gehosteten Seite lesen → passt die Hülle und ist der Commit neu,
// das Paket vom Programm laden lassen (Prüfsumme, Entpacken, Vormerken für den nächsten Start).
// Neues Programm: der Tauri-Updater kennt eine neuere .exe, oder die Hüllen-Nummer ist gestiegen.
import { NEUESTE_VERSION_URL, type VersionInfo } from '@/android/update'
import type { StandArt, UpdateStand } from '@/android/updateAblauf'
import type { ProgrammUpdate, WebInfo } from './api'
import { alsWindowsVersion, entscheideWindowsUpdate } from './update'

export interface WindowsUpdateDeps {
  holeJson(url: string): Promise<unknown>
  /** version.json des laufenden Web-Teils. */
  installiert(): Promise<VersionInfo | null>
  info(): Promise<WebInfo>
  /** Tauri-Updater: neuere .exe? Wirft, wenn Programm-Updates nicht eingerichtet sind. */
  programmPruefen(): Promise<ProgrammUpdate | null>
  paketLaden(commit: string, sha256: string): Promise<void>
  online(): boolean
  jetzt(): number
}

/** Prüft einmal und lädt ein passendes Live-Update. Wirft nie. */
export async function pruefeWindowsUpdate(d: WindowsUpdateDeps): Promise<UpdateStand> {
  const zeit = new Date(d.jetzt()).toISOString()
  const stand = (art: StandArt, meldung: string, neueste?: VersionInfo): UpdateStand => ({
    art,
    meldung,
    zeit,
    ...(neueste ? { neueste } : {}),
  })
  try {
    if (!d.online()) return stand('offline', 'Keine Verbindung – Prüfung nicht möglich.')
    // Fehler des Programm-Updaters (z. B. Schlüssel nicht eingerichtet) dürfen das Live-Update nicht stoppen.
    const [programm, info, installiert, neueste] = await Promise.all([
      d.programmPruefen().catch(() => null),
      d.info(),
      d.installiert(),
      d.holeJson(NEUESTE_VERSION_URL).then(alsWindowsVersion),
    ])
    if (!installiert || !neueste) return stand('fehler', 'Versionsangabe nicht lesbar.')
    const e = entscheideWindowsUpdate(installiert, neueste, {
      huelleInstalliert: info.huelle,
      programmNeu: programm?.version ?? null,
      fehlgeschlagen: info.zustand.fehlgeschlagen,
      bereitCommit: info.zustand.naechste ?? undefined,
    })
    if (e.art === 'nativ') {
      return stand(
        'nativ',
        programm ? `Neue Programmversion ${programm.version} verfügbar.` : 'Neue Programmversion verfügbar.',
        neueste,
      )
    }
    if (e.art === 'live') {
      await d.paketLaden(neueste.commit!, neueste.bundleSha256!)
      return stand('live-bereit', 'Update geladen – wird beim nächsten Start der App angewendet.')
    }
    if (e.grund.startsWith('schon geladen')) {
      return stand('live-bereit', 'Update geladen – wird beim nächsten Start der App angewendet.')
    }
    if (e.grund.startsWith('Rückfall')) {
      return stand('aktuell', 'Die letzte Version ließ sich nicht starten und wurde zurückgenommen.')
    }
    return stand('aktuell', 'Die App ist auf dem neuesten Stand.')
  } catch (err) {
    return stand('fehler', `Update fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export interface WindowsInstallDeps {
  programmPruefen(): Promise<ProgrammUpdate | null>
  programmInstallieren(fortschritt: (f: { geladen: number; gesamt: number }) => void): Promise<void>
}

/**
 * Lädt die neue .exe (Tauri-Updater, Signatur wird geprüft) und startet den Installer; das
 * Programm beendet sich dabei und startet nach der Installation neu. Wirft Error mit verständlichem Text.
 */
export async function installiereProgrammUpdate(
  d: WindowsInstallDeps,
  fortschritt: (f: { geladen: number; gesamt: number }) => void,
): Promise<ProgrammUpdate> {
  let update: ProgrammUpdate | null
  try {
    update = await d.programmPruefen()
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e))
  }
  if (!update) {
    throw new Error('Die neue Programmversion wird noch gebaut. Bitte in einigen Minuten noch einmal versuchen.')
  }
  try {
    await d.programmInstallieren(fortschritt)
  } catch (e) {
    throw new Error(`Die Installation ist fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
  }
  return update
}
