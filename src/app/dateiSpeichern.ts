// Eine Datei an den Nutzer geben: im Browser als Download, in der Android-App über den
// System-Dialog „Speichern unter…“ (die WebView kann Blob-Downloads nicht speichern).
import { Capacitor } from '@capacitor/core'
import { WepNative } from '@/android/native'

export type SpeicherErgebnis = 'heruntergeladen' | 'gespeichert' | 'abgebrochen'

/** Größe eines Stücks für die Brücke zur App (vor Base64). */
const STUECK = 512 * 1024

/** Base64 eines Teils eines Blobs (ohne Data-URL-Vorspann). */
async function base64(teil: Blob): Promise<string> {
  const bytes = new Uint8Array(await teil.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

export async function speichereDatei(blob: Blob, name: string): Promise<SpeicherErgebnis> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'heruntergeladen'
  }
  await WepNative.dateiBeginnen()
  for (let pos = 0; pos < blob.size; pos += STUECK) {
    await WepNative.dateiAnhaengen({ daten: await base64(blob.slice(pos, pos + STUECK)) })
  }
  const { gespeichert } = await WepNative.dateiSpeichern({ name, typ: blob.type || 'application/octet-stream' })
  return gespeichert ? 'gespeichert' : 'abgebrochen'
}

/** Nebensatz für Meldungen: was mit der Datei passiert ist. */
export function speicherText(e: SpeicherErgebnis, name: string): string {
  if (e === 'gespeichert') return `${name} gespeichert`
  if (e === 'abgebrochen') return `${name} wurde nicht gespeichert (abgebrochen)`
  return `${name} heruntergeladen`
}
