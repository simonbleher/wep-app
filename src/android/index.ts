// Start der Android-Funktionen (nur in der Android-App, wird von main.tsx nachgeladen):
// Speicher-Haken für die Upload-Warteschlange, Planung des Hintergrund-Workers und
// Übernahme der Worker-Ergebnisse.
import { App } from '@capacitor/app'
import { setzeSpeicherHaken } from '@/app/db'
import { ladeGeraeteEinstellungen } from '@/profil'
import { geraeteKennung, setzeSyncHaken } from '@/sync'
import { fotoSpeicher, syncSpeicher } from '@/sync/speicher'
import { WepNative } from './native'
import { erstelleFotoWarteschlange } from './fotoWarteschlange'
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
  const fq = erstelleFotoWarteschlange(WepNative, fotoSpeicher, syncSpeicher)

  // Jede Speicherung → Warteschlange. Fehler hier dürfen das Speichern nie stören.
  setzeSpeicherHaken({
    nachSpeichern: (wep) => q.einreihen(wep),
    nachLoeschen: async (id, geloeschtAm) => {
      await q.entfernen(id, geloeschtAm)
      await fq.sperren(id) // Fotos eines gelöschten WEP nie nach daten/fotos/ hochladen
    },
    nachFotoSpeichern: (wepId, fotoId, blob) => fq.einreihen(wepId, fotoId, blob),
    nachFotoEntfernen: (wepId, fotoId) => fq.entfernen(wepId, fotoId),
  })
  // Vor dem Abgleich: Worker-Ergebnisse übernehmen; danach erledigte Einträge entfernen.
  setzeSyncHaken({
    vor: async () => {
      await q.uebernimmErgebnisse()
      await fq.uebernimmErgebnisse()
    },
    nach: async () => {
      await q.bereinige()
      await fq.abstimmen()
    },
  })

  try {
    await q.uebernimmErgebnisse()
    await fq.uebernimmErgebnisse()
    await q.bereinige()
    await fq.abstimmen()
    await planeHintergrundUpload()
  } catch (e) {
    console.warn('Android-Start:', e)
  }
  // Update-Prüfung (Live-Update des Web-Teils, Hinweis auf neue App-Version)
  void import('./updateDienst').then((m) => m.starteAutomatik())
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void q.uebernimmErgebnisse().catch(() => undefined)
      void fq.uebernimmErgebnisse().catch(() => undefined)
    }
  })
}
