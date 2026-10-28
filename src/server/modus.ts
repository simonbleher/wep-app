// Schalter für v2 (docs/PLAN-V2.md): Server, Konten mit Rollen, Abgabe-Ablauf. Wird beim Build eingebaut
// (VITE_SERVER_MODUS=true, in Cloudflare für Produktion gesetzt). Ohne Schalter verhält sich die App wie v1.
// Android- und Windows-App bekommen dasselbe Web-Paket als Live-Update, können den Server aber noch nicht
// nutzen (keine Anmeldung über den Server, kein /api/v2 unter capacitor:// bzw. tauri://). Dort bleibt der
// Server-Modus aus: Die Apps arbeiten weiter wie v1 und zeigen den Hinweis „bitte im Browser nutzen“.
import { Capacitor } from '@capacitor/core'
import { istWindowsApp } from '@/windows/plattform'

/** Liest den Schalter aus den Build-Variablen; nur genau "true" schaltet ein. */
export const istServerModus = (env: { VITE_SERVER_MODUS?: string }): boolean => env.VITE_SERVER_MODUS === 'true'

/** Wie der Build mit dem Schalter umgeht: im Browser Server-Modus, in den Apps v1 mit Hinweis. */
export function modusFuer(gebautMitServer: boolean, nativeApp: boolean): { serverModus: boolean; appOhneServer: boolean } {
  return { serverModus: gebautMitServer && !nativeApp, appOhneServer: gebautMitServer && nativeApp }
}

const modus = modusFuer(istServerModus(import.meta.env), Capacitor.isNativePlatform() || istWindowsApp())

/** Server-Modus in dieser Umgebung (nur Browser/PWA). */
export const serverModus: boolean = modus.serverModus

/** Android- oder Windows-App mit einem Web-Paket, das im Browser den Server nutzt: v1 plus Hinweis. */
export const appOhneServer: boolean = modus.appOhneServer

/** Wo Fotos und Bau-Excel außerhalb des Geräts liegen (für Texte der Oberfläche). */
export const ABLAGE = serverModus ? 'auf dem Server' : 'in OneDrive'
export const AUS_ABLAGE = serverModus ? 'vom Server' : 'aus OneDrive'
