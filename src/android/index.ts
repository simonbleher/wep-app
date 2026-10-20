// Start der Android-Funktionen (nur in der Android-App, wird von main.tsx nachgeladen):
// Speicher-Haken für die Upload-Warteschlange, Planung des Hintergrund-Workers und
// Übernahme der Worker-Ergebnisse.
import { App } from '@capacitor/app'
import { setzeSpeicherHaken } from '@/app/db'
import { ladeGeraeteEinstellungen } from '@/profil'
import { geraeteKennung, setzeSyncHaken } from '@/sync'
import { syncSpeicher } from '@/sync/speicher'
import { WepNative } from './native'
import { erstelleWarteschlange, type Warteschlange } from './warteschlange'

let warteschlange: Warteschlange | undefined

export function holeWarteschlange(): Warteschlange | undefined {
  return warteschlange
}

/** (Neu) planen, z. B. nach Änderung von „Upload nur über WLAN“. */
export async function planeHintergrundUpload(): Promise<void> {
  await WepNative.planeUpload({ nurWlan: ladeGeraeteEinstellungen().nurWlan })
}

export async function startAndroid(): Promise<void> {
  const q = erstelleWarteschlange(WepNative, syncSpeicher, geraeteKennung)
  warteschlange = q

  // Jede Speicherung → Warteschlange. Fehler hier dürfen das Speichern nie stören.
  setzeSpeicherHaken({
    nachSpeichern: (wep) => q.einreihen(wep),
    nachLoeschen: (id, geloeschtAm) => q.entfernen(id, geloeschtAm),
  })
  // Vor dem Abgleich: Worker-Ergebnisse übernehmen; danach erledigte Einträge entfernen.
  setzeSyncHaken({
    vor: async () => void (await q.uebernimmErgebnisse()),
    nach: async () => void (await q.bereinige()),
  })

  try {
    await q.uebernimmErgebnisse()
    await q.bereinige()
    await planeHintergrundUpload()
  } catch (e) {
    console.warn('Android-Start:', e)
  }
  // Update-Prüfung (Live-Update des Web-Teils, Hinweis auf neue App-Version)
  void import('./updateDienst').then((m) => m.starteAutomatik())
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void q.uebernimmErgebnisse().catch(() => undefined)
  })
}
