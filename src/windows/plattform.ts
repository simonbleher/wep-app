// Läuft die App im Windows-Programm (Tauri)? Tauri setzt `__TAURI_INTERNALS__` in die Seite,
// bevor die App startet. Im Browser und in der Android-App gibt es das nicht.
import { Capacitor } from '@capacitor/core'

export function istWindowsApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export type Huelle = 'web' | 'android' | 'windows'

/** In welcher Hülle läuft die App: Browser/PWA, Android-App oder Windows-Programm? */
export function huelle(): Huelle {
  if (Capacitor.isNativePlatform()) return 'android'
  return istWindowsApp() ? 'windows' : 'web'
}
