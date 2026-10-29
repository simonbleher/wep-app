// Schalter für v2 (docs/PLAN-V2.md): Server, Konten mit Rollen, Abgabe-Ablauf. Wird beim Build eingebaut
// (VITE_SERVER_MODUS=true, in Cloudflare für Produktion gesetzt). Ohne Schalter verhält sich die App wie v1.
//
// Android- und Windows-App bekommen dasselbe Web-Paket als Live-Update. Den Server-Modus gibt es dort nur, wenn die
// installierte App (der native Teil) die Anmeldung über den Systembrowser und den sicheren Token-Speicher mitbringt
// (Paket 8): Android ab native-version 8 (Plugin-Methode `speichereServerToken`), Windows ab huelle-version 4 (Marke
// `__WEP_HUELLE__`). Ältere APK/EXE mit neuem Web-Paket arbeiten weiter wie v1 und zeigen „bitte App aktualisieren“.
import { Capacitor } from '@capacitor/core'
import { istWindowsApp } from '@/windows/plattform'

/** Liest den Schalter aus den Build-Variablen; nur genau "true" schaltet ein. */
export const istServerModus = (env: { VITE_SERVER_MODUS?: string }): boolean => env.VITE_SERVER_MODUS === 'true'

interface PluginKopf {
  name: string
  methods?: { name: string }[]
}

/**
 * Kann die native Hülle die Server-Anmeldung? Synchron geprüft, damit die Weiche schon beim Laden feststeht:
 * - Android: Capacitor meldet die Methoden der nativen Plugins in `Capacitor.PluginHeaders`.
 * - Windows: Die Hülle setzt vor dem Start `window.__WEP_HUELLE__` (src-tauri/src/lib.rs).
 */
export function huelleKannServer(w: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  const fenster = w as { Capacitor?: { PluginHeaders?: PluginKopf[] }; __WEP_HUELLE__?: { serverAnmeldung?: number } } | undefined
  if (fenster?.__WEP_HUELLE__?.serverAnmeldung === 1) return true
  return Boolean(fenster?.Capacitor?.PluginHeaders?.some((p) => p.name === 'WepNative' && p.methods?.some((m) => m.name === 'speichereServerToken')))
}

export interface Modus {
  /** v2 mit Server (Browser, oder App mit Anmelde-Fähigkeit). */
  serverModus: boolean
  /** App mit Server-Modus: Anmeldung über den Systembrowser, Zugriff mit Bearer-Token auf die Server-Adresse. */
  appMitServer: boolean
  /** App, die den Server noch nicht kann (alte APK/EXE): v1 plus Hinweis „bitte App aktualisieren“. */
  appOhneServer: boolean
}

/** Wie der Build mit dem Schalter umgeht – im Browser immer Server-Modus, in den Apps nur mit Anmelde-Fähigkeit. */
export function modusFuer(gebautMitServer: boolean, nativeApp: boolean, kannServer = false): Modus {
  return {
    serverModus: gebautMitServer && (!nativeApp || kannServer),
    appMitServer: gebautMitServer && nativeApp && kannServer,
    appOhneServer: gebautMitServer && nativeApp && !kannServer,
  }
}

const modus = modusFuer(istServerModus(import.meta.env), Capacitor.isNativePlatform() || istWindowsApp(), huelleKannServer())

/** Server-Modus in dieser Umgebung. */
export const serverModus: boolean = modus.serverModus

/** Android- oder Windows-App im Server-Modus. */
export const appMitServer: boolean = modus.appMitServer

/** Android- oder Windows-App mit einem Web-Paket, das den Server nutzen will, aber eine zu alte Hülle: v1 plus Hinweis. */
export const appOhneServer: boolean = modus.appOhneServer

/** Wo Fotos und Bau-Excel außerhalb des Geräts liegen (für Texte der Oberfläche). */
export const ABLAGE = serverModus ? 'auf dem Server' : 'in OneDrive'
export const AUS_ABLAGE = serverModus ? 'vom Server' : 'aus OneDrive'
