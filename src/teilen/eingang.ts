// Dateien, die die App von außen bekommt: Android „Öffnen mit WEP“ (VIEW-Intent) und Windows-Doppelklick auf
// eine .wep-Datei. Beide Plattformen legen die Datei zwischen; hier wird sie abgeholt und danach verworfen.
// Im Browser gibt es das nicht (dort wählt man die Datei in der App).
import { Capacitor } from '@capacitor/core'
import { WepNative, type WepNativePlugin } from '@/android/native'
import { istWindowsApp } from '@/windows/plattform'
import type { WepWindowsApi } from '@/windows/api'

export interface Eingang {
  name: string
  blob: Blob
}

/** Größe eines Stücks beim Lesen vom Android-Plugin (vor Base64). */
const STUECK = 512 * 1024

function ausBase64(text: string): Uint8Array {
  const roh = atob(text)
  const bytes = new Uint8Array(roh.length)
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i)
  return bytes
}

/** Holt die wartende Datei vom Android-Plugin (stückweise, damit große Dateien die Brücke nicht sprengen). */
export async function holeAndroidEingang(plugin: Pick<WepNativePlugin, 'eingangPruefen' | 'eingangLesen' | 'eingangVerwerfen'>): Promise<Eingang | undefined> {
  const info = await plugin.eingangPruefen()
  if (!info.vorhanden || !info.name) return undefined
  try {
    const teile: Uint8Array[] = []
    const gesamt = info.groesse ?? 0
    for (let pos = 0; pos < gesamt; pos += STUECK) {
      const { daten } = await plugin.eingangLesen({ pos, laenge: Math.min(STUECK, gesamt - pos) })
      teile.push(ausBase64(daten))
    }
    return { name: info.name, blob: new Blob(teile.map((t) => t.slice().buffer as ArrayBuffer)) }
  } finally {
    await plugin.eingangVerwerfen().catch(() => undefined)
  }
}

export async function holeWindowsEingang(api: Pick<WepWindowsApi, 'eingangPruefen' | 'eingangLesen' | 'eingangVerwerfen'>): Promise<Eingang | undefined> {
  const name = await api.eingangPruefen()
  if (!name) return undefined
  try {
    return { name, blob: new Blob([(await api.eingangLesen()).slice().buffer as ArrayBuffer]) }
  } finally {
    await api.eingangVerwerfen().catch(() => undefined)
  }
}

/** Wartet beim Start schon eine Datei (App wurde mit „Öffnen mit WEP“ bzw. Doppelklick gestartet)? */
export async function holeEingang(): Promise<Eingang | undefined> {
  try {
    if (Capacitor.isNativePlatform()) return await holeAndroidEingang(WepNative)
    if (istWindowsApp()) return await holeWindowsEingang((await import('@/windows/api')).WepWindows)
  } catch {
    /* ältere native Teile kennen den Eingang nicht: dann gibt es keinen */
  }
  return undefined
}

/** Meldet Dateien, die ankommen, während die App schon läuft. Gibt die Abmeldung zurück. */
export async function beobachteEingang(bei: (e: Eingang) => void): Promise<() => void> {
  const abholen = () => void holeEingang().then((e) => e && bei(e))
  try {
    if (Capacitor.isNativePlatform()) {
      const h = await WepNative.addListener('eingang', abholen)
      return () => void h.remove()
    }
    if (istWindowsApp()) return await (await import('@/windows/api')).WepWindows.eingangBeobachten(abholen)
  } catch {
    /* kein Eingang möglich (älterer nativer Teil) */
  }
  return () => undefined
}
