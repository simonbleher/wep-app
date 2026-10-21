// Update-Entscheidung des Windows-Programms (rein, ohne Tauri; Abläufe in updateAblauf.ts).
//
// Wie in der Android-App gibt es zwei Wege:
// - Live-Update: Nur der Web-Teil ändert sich. Die gehostete version.json nennt das Paket (bundleUrl);
//   das Programm lädt es und liefert es ab dem nächsten Start (src-tauri/src/webupdate.rs).
// - Neues Programm: Ändert sich die Hülle (src-tauri/), steigt `windowsHuelle` in version.json
//   (src-tauri/huelle-version.txt), oder der Tauri-Updater kennt eine neuere Programmversion.
//   Dann muss die neue .exe installiert werden.
// Die Entscheidung über „neuer Commit, passende Hülle, nicht gesperrt“ ist dieselbe wie bei Android
// (src/android/update.ts); die Hüllen-Nummer steht dort als `nativeVersion`.
import { alsVersion, entscheideUpdate, type UpdateEntscheidung, type VersionInfo } from '@/android/update'

/** version.json der gehosteten Seite, mit `windowsHuelle` als Hüllen-Nummer (`nativeVersion`). */
export function alsWindowsVersion(d: unknown): VersionInfo | null {
  const v = alsVersion(d)
  if (!v) return null
  const huelle = (d as Record<string, unknown>).windowsHuelle
  return {
    ...v,
    nativeVersion: typeof huelle === 'number' && Number.isFinite(huelle) && huelle >= 0 ? huelle : undefined,
  }
}

export function entscheideWindowsUpdate(
  installiert: VersionInfo,
  neueste: VersionInfo,
  opt: {
    huelleInstalliert: number
    /** Version einer neueren .exe laut Tauri-Updater (null = keine bekannt). */
    programmNeu?: string | null
    fehlgeschlagen?: readonly string[]
    bereitCommit?: string
  },
): UpdateEntscheidung {
  if (opt.programmNeu) return { art: 'nativ', grund: `Programm ${opt.programmNeu} verfügbar` }
  return entscheideUpdate(installiert, neueste, {
    nativInstalliert: opt.huelleInstalliert,
    fehlgeschlagen: opt.fehlgeschlagen,
    bereitCommit: opt.bereitCommit,
  })
}
