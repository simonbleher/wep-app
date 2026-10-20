// Update-Logik der Android-App (rein, ohne Capacitor – Abläufe in updateAblauf.ts).
//
// Zwei Wege, beide ohne Play Store:
// - Live-Update: Nur der Web-Teil ändert sich. Die gehostete version.json nennt das Paket
//   (bundleUrl); die App lädt es und wendet es beim nächsten Start an.
// - Natives Update: Ändert sich der native Teil (android/, Plugins), steigt nativeVersion
//   (android/native-version.txt). Dann muss eine neue APK installiert werden.
// Neuer ist die gehostete Fassung, wenn ihr Commit vom eingebauten abweicht UND sie später
// gebaut wurde (gebautAm). Fehlt commit oder gebautAm auf einer Seite, gilt der frühere
// Vergleich: höherer versionName, bei gleichem Namen höherer versionCode (wenn beide > 0).

/** Gehostete Seite (siehe docs/HOSTING.md); dort liegt die neueste version.json. */
export const NEUESTE_VERSION_URL = 'https://wep-pankow.pages.dev/version.json'
/** Eigenes Pages-Projekt mit der signierten APK (fester Name /wep.apk, dazu apk.json). */
export const APK_BASIS_URL = 'https://wep-pankow-apk.pages.dev'
export const APK_JSON_URL = `${APK_BASIS_URL}/apk.json`

export interface VersionInfo {
  versionName: string
  versionCode: number
  /** Git-Commit, aus dem gebaut wurde (fehlt in alten Builds und lokalen Builds). */
  commit?: string
  /** Bauzeitpunkt (ISO). */
  gebautAm?: string
  /** Nummer des nativen Teils, zu dem dieser Web-Teil passt (fehlt in alten Builds). */
  nativeVersion?: number
  /** Live-Update-Paket (zip des Web-Builds, nur wenn der Commit bekannt ist). */
  bundleUrl?: string
  /** SHA-256 (hex, klein) des Pakets; das Update-Plugin verlangt sie. */
  bundleSha256?: string
  releaseUrl: string
}

/** apk.json des APK-Projekts. */
export interface ApkInfo {
  versionName: string
  versionCode: number
  nativeVersion: number
  apkUrl: string
  /** SHA-256 der APK (Hex), zur Prüfung nach dem Herunterladen. */
  sha256?: string
}

export type UpdateArt = 'keins' | 'live' | 'nativ'

export interface UpdateEntscheidung {
  art: UpdateArt
  /** Kurze Begründung (für Tests und Protokoll). */
  grund: string
}

function teile(name: string): number[] {
  return name.split(/[.\-+]/).map((t) => Number.parseInt(t, 10) || 0)
}

/** true, wenn `neu` neuer ist als `alt`. */
export function istNeuer(neu: VersionInfo, alt: VersionInfo): boolean {
  if (neu.commit && alt.commit && neu.gebautAm && alt.gebautAm) {
    const t1 = Date.parse(neu.gebautAm)
    const t0 = Date.parse(alt.gebautAm)
    if (!Number.isNaN(t1) && !Number.isNaN(t0)) return neu.commit !== alt.commit && t1 > t0
  }
  const a = teile(neu.versionName)
  const b = teile(alt.versionName)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return neu.versionCode > 0 && alt.versionCode > 0 && neu.versionCode > alt.versionCode
}

/**
 * Entscheidet, was mit der gehosteten Fassung `neueste` zu tun ist.
 * - `nativInstalliert`: nativeVersion der installierten App-Hülle.
 * - `fehlgeschlagen`: Commits, deren Live-Update zurückgerollt wurde (nicht erneut versuchen).
 * - `bereitCommit`: Commit des bereits geladenen, noch nicht angewendeten Pakets.
 */
export function entscheideUpdate(
  installiert: VersionInfo,
  neueste: VersionInfo,
  opt: { nativInstalliert: number; fehlgeschlagen?: readonly string[]; bereitCommit?: string },
): UpdateEntscheidung {
  const nativNeu = neueste.nativeVersion
  if (nativNeu !== undefined && nativNeu > opt.nativInstalliert) {
    return { art: 'nativ', grund: `nativeVersion ${nativNeu} > ${opt.nativInstalliert}` }
  }
  if (!istNeuer(neueste, installiert)) return { art: 'keins', grund: 'aktuell' }
  // Ein Web-Teil läuft nur auf genau dem nativen Teil, für den er gebaut wurde.
  if (nativNeu === undefined) return { art: 'keins', grund: 'Paket ohne nativeVersion' }
  if (nativNeu !== opt.nativInstalliert) return { art: 'keins', grund: 'Paket passt nicht zur installierten App' }
  if (!neueste.bundleUrl || !neueste.commit || !neueste.bundleSha256) return { art: 'keins', grund: 'kein Paket' }
  if (opt.fehlgeschlagen?.includes(neueste.commit)) return { art: 'keins', grund: 'Rückfall nach Fehlstart' }
  if (opt.bereitCommit === neueste.commit) return { art: 'keins', grund: 'schon geladen, wartet auf Neustart' }
  return { art: 'live', grund: 'neuer Commit, passender nativer Teil' }
}

/** Zahl ≥ 0 aus einem JSON-Wert. */
function zahl(w: unknown): number | undefined {
  return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : undefined
}

export function alsVersion(d: unknown): VersionInfo | null {
  if (!d || typeof d !== 'object') return null
  const v = d as Record<string, unknown>
  if (typeof v.versionName !== 'string' || !v.versionName) return null
  const text = (w: unknown) => (typeof w === 'string' && w ? w : undefined)
  return {
    versionName: v.versionName,
    versionCode: zahl(v.versionCode) ?? 0,
    commit: text(v.commit),
    gebautAm: text(v.gebautAm),
    nativeVersion: zahl(v.nativeVersion),
    bundleUrl: typeof v.bundleUrl === 'string' && v.bundleUrl.startsWith('https://') ? v.bundleUrl : undefined,
    bundleSha256:
      typeof v.bundleSha256 === 'string' && /^[0-9a-f]{64}$/.test(v.bundleSha256) ? v.bundleSha256 : undefined,
    releaseUrl: typeof v.releaseUrl === 'string' && v.releaseUrl.startsWith('https://') ? v.releaseUrl : '',
  }
}

/** apk.json prüfen; die APK-Adresse muss https sein (sonst Standardadresse). */
export function alsApkInfo(d: unknown): ApkInfo | null {
  if (!d || typeof d !== 'object') return null
  const v = d as Record<string, unknown>
  const nativeVersion = zahl(v.nativeVersion)
  if (nativeVersion === undefined) return null
  return {
    versionName: typeof v.versionName === 'string' ? v.versionName : '',
    versionCode: zahl(v.versionCode) ?? 0,
    nativeVersion,
    apkUrl: typeof v.apkUrl === 'string' && v.apkUrl.startsWith('https://') ? v.apkUrl : `${APK_BASIS_URL}/wep.apk`,
    sha256: typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(v.sha256) ? v.sha256.toLowerCase() : undefined,
  }
}

/** Verständliche Meldung für Fehler beim Laden/Installieren der APK. */
export function apkFehlerText(code: string | undefined, text: string): string {
  if (code === 'ERLAUBNIS') {
    return (
      'Android braucht einmalig die Erlaubnis „Apps installieren“ für WEP. Die Einstellung ist geöffnet – ' +
      'erlauben, dann zurück zur App und noch einmal tippen.'
    )
  }
  if (code === 'PRUEFSUMME') return 'Die heruntergeladene Datei ist beschädigt. Bitte noch einmal versuchen.'
  if (code === 'KEIN_NETZ') return 'Keine Verbindung – Download nicht möglich.'
  return `Die Installation ist fehlgeschlagen: ${text || 'unbekannter Fehler'}`
}

/** Kurzform eines Commits für die Anzeige. */
export function kurzCommit(commit: string | undefined): string {
  return commit ? commit.slice(0, 7) : 'lokal'
}
