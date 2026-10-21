// Gemeinsame Schnittstelle der Update-Dienste von Android-App und Windows-Programm. Die
// Oberfläche (Profil, Update-Hinweis, App) lädt den passenden Dienst über `ladeUpdateDienst`;
// im Browser gibt es keinen (dort aktualisiert der Service Worker).
import { Capacitor } from '@capacitor/core'
import type { VersionInfo } from '@/android/update'
import type { ApkFortschritt, UpdateStand } from '@/android/updateAblauf'
import { istWindowsApp } from '@/windows/plattform'

export interface UpdateDienstModul {
  aktuellerUpdateStand(): UpdateStand | null
  beobachteUpdate(h: (s: UpdateStand | null) => void): () => void
  pruefeUndMerke(erzwingen: boolean): Promise<UpdateStand | null>
  meldeStartErfolg(): Promise<void>
  /** Android: neue APK laden und installieren; Windows: neue .exe laden und installieren. */
  installiereNativ(fortschritt: (f: ApkFortschritt) => void): Promise<void>
  installierteVersion(): Promise<VersionInfo | null>
  nativeVersion(): Promise<number>
}

/** Läuft die App in einer Hülle mit Selbst-Update (Android-App oder Windows-Programm)? */
export const hatSelbstUpdate = (): boolean => Capacitor.isNativePlatform() || istWindowsApp()

export async function ladeUpdateDienst(): Promise<UpdateDienstModul | null> {
  if (Capacitor.isNativePlatform()) return import('@/android/updateDienst')
  if (istWindowsApp()) return import('@/windows/updateDienst')
  return null
}
