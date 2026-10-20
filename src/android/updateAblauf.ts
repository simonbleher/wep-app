// Ablauf der Updates der Android-App, mit austauschbaren Abhängigkeiten (Tests in
// updateAblauf.test.ts; die echte Verdrahtung steht in updateDienst.ts).
//
// Live-Update: version.json der gehosteten Seite lesen → passt der native Teil und ist der
// Commit neu, das Paket im Hintergrund laden und als „nächstes“ vormerken (`next`). Es wird
// beim nächsten Start angewendet. Meldet die App den Start nicht (notifyAppReady), fällt das
// Plugin selbst auf die vorige Fassung zurück; der Commit landet dann auf der Sperrliste
// und wird nicht erneut geladen.
import {
  APK_JSON_URL,
  alsApkInfo,
  alsVersion,
  apkFehlerText,
  entscheideUpdate,
  NEUESTE_VERSION_URL,
  type ApkInfo,
  type VersionInfo,
} from './update'

export type StandArt = 'aktuell' | 'live-bereit' | 'wartet-wlan' | 'nativ' | 'offline' | 'fehler'

export interface UpdateStand {
  art: StandArt
  /** Ergebnis der letzten Prüfung für die Anzeige im Profil. */
  meldung: string
  /** Zeitpunkt der Prüfung (ISO). */
  zeit: string
  /** Bei art = 'nativ': die gehostete Fassung, die den neuen nativen Teil verlangt. */
  neueste?: VersionInfo
}

/** Was auf dem Gerät gemerkt wird (localStorage). */
export interface GemerkterStand {
  fehlgeschlagen: string[]
  bereitCommit?: string
  letzterStand?: UpdateStand
  /** Zeitpunkt der letzten erfolgreichen Prüfung (ms). */
  letztePruefung?: number
  /** Für welche App-Fassung (Commit + nativer Teil) die letzte Prüfung galt. */
  geprueftFuer?: string
}

/** Der benutzte Ausschnitt von @capgo/capacitor-updater. */
export interface UpdaterPlugin {
  download(o: { url: string; version: string; checksum: string }): Promise<{ id: string; version: string }>
  next(o: { id: string }): Promise<unknown>
  list(): Promise<{ bundles: { id: string; version: string; status: string }[] }>
}

export interface UpdateDeps {
  holeJson(url: string): Promise<unknown>
  /** version.json des eingebauten (aktuell laufenden) Web-Teils. */
  installiert(): Promise<VersionInfo | null>
  nativInstalliert(): Promise<number>
  updater: UpdaterPlugin
  netz(): Promise<{ online: boolean; unmetered: boolean }>
  nurWlan(): boolean
  lade(): GemerkterStand
  speichere(s: GemerkterStand): void
  jetzt(): number
}

/** Nach einem Rückfall: fehlgeschlagene Pakete (Status „error“) auf die Sperrliste setzen. */
export async function uebernimmFehlstarts(d: UpdateDeps): Promise<string[]> {
  const gemerkt = d.lade()
  let bundles: { version: string; status: string }[] = []
  try {
    bundles = (await d.updater.list()).bundles
  } catch {
    return gemerkt.fehlgeschlagen
  }
  const neu = bundles.filter((b) => b.status === 'error').map((b) => b.version)
  const alle = [...new Set([...gemerkt.fehlgeschlagen, ...neu])]
  if (alle.length !== gemerkt.fehlgeschlagen.length || (gemerkt.bereitCommit && alle.includes(gemerkt.bereitCommit))) {
    d.speichere({
      ...gemerkt,
      fehlgeschlagen: alle,
      bereitCommit: gemerkt.bereitCommit && alle.includes(gemerkt.bereitCommit) ? undefined : gemerkt.bereitCommit,
    })
  }
  return alle
}

/** Prüft einmal und lädt ein passendes Live-Update. Wirft nie. */
export async function pruefeAufUpdate(d: UpdateDeps): Promise<UpdateStand> {
  const zeit = new Date(d.jetzt()).toISOString()
  const stand = (art: StandArt, meldung: string, neueste?: VersionInfo): UpdateStand => ({
    art,
    meldung,
    zeit,
    ...(neueste ? { neueste } : {}),
  })
  try {
    const netz = await d.netz()
    if (!netz.online) return stand('offline', 'Keine Verbindung – Prüfung nicht möglich.')
    const fehlgeschlagen = await uebernimmFehlstarts(d)
    const [installiert, neueste, nativ] = await Promise.all([
      d.installiert(),
      d.holeJson(NEUESTE_VERSION_URL).then(alsVersion),
      d.nativInstalliert(),
    ])
    if (!installiert || !neueste) return stand('fehler', 'Versionsangabe nicht lesbar.')
    const e = entscheideUpdate(installiert, neueste, {
      nativInstalliert: nativ,
      fehlgeschlagen,
      bereitCommit: d.lade().bereitCommit,
    })
    if (e.art === 'nativ') return stand('nativ', 'Neue App-Version verfügbar.', neueste)
    if (e.art === 'live') {
      if (d.nurWlan() && !netz.unmetered) {
        return stand('wartet-wlan', 'Update gefunden, wird im WLAN geladen (Einstellung „nur WLAN“).')
      }
      const paket = await d.updater.download({
        url: neueste.bundleUrl!,
        version: neueste.commit!,
        checksum: neueste.bundleSha256!,
      })
      await d.updater.next({ id: paket.id })
      d.speichere({ ...d.lade(), bereitCommit: neueste.commit })
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

/** Fortschritt des APK-Downloads. */
export interface ApkFortschritt {
  geladen: number
  gesamt: number
}

export interface InstallDeps {
  holeJson(url: string): Promise<unknown>
  nativInstalliert(): Promise<number>
  ladeApk(o: { url: string; sha256?: string }): Promise<void>
  installiereApk(): Promise<void>
}

/**
 * Lädt die APK und öffnet den Android-Installer. Wirft Error mit verständlichem Text.
 * Ist die APK noch nicht auf dem Server (Cloudflare schneller als der APK-Bau), kommt eine
 * entsprechende Meldung statt eines Downloads.
 */
export async function installiereNativesUpdate(d: InstallDeps): Promise<ApkInfo> {
  let info: ApkInfo | null
  try {
    info = alsApkInfo(await d.holeJson(APK_JSON_URL))
  } catch {
    throw new Error('Die neue App-Version ist noch nicht erreichbar. Bitte später noch einmal versuchen.')
  }
  const installiert = await d.nativInstalliert()
  if (!info || info.nativeVersion <= installiert) {
    throw new Error('Die neue App-Version wird noch gebaut. Bitte in einigen Minuten noch einmal versuchen.')
  }
  try {
    await d.ladeApk({ url: info.apkUrl, sha256: info.sha256 })
    await d.installiereApk()
  } catch (e) {
    const code = (e as { code?: string }).code
    const text = e instanceof Error ? e.message : String(e)
    throw new Error(apkFehlerText(code, text))
  }
  return info
}
