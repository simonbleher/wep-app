// „Nur WLAN“ für Fotos: Dürfen Fotos jetzt hochgeladen werden?
import { Capacitor } from '@capacitor/core'
import { WepNative } from '@/android/native'
import { ladeGeraeteEinstellungen } from '@/profil'

/**
 * Android-App: Nur im unbegrenzten Netz (WLAN), wenn „Upload nur über WLAN“ an ist – dieselbe
 * Prüfung wie beim Hintergrunddienst. Browser: Wo der Browser die Verbindungsart verrät
 * (`navigator.connection.type`), gilt Mobilfunk als „nicht WLAN“; sonst ist der Upload erlaubt.
 */
export async function fotoUploadErlaubt(): Promise<boolean> {
  if (!ladeGeraeteEinstellungen().nurWlan) return true
  if (Capacitor.isNativePlatform()) {
    try {
      return (await WepNative.netzTyp()).unmetered
    } catch {
      return false // im Zweifel nichts über Mobilfunk senden
    }
  }
  const verbindung = (navigator as Navigator & { connection?: { type?: string } }).connection
  return verbindung?.type !== 'cellular'
}
