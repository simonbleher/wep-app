// Verdrahtung der Updates mit Capacitor: Live-Update-Plugin, Netztyp, localStorage.
// Wird nur in der Android-App geladen (Update-Hinweis, Profil, startAndroid).
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { ladeGeraeteEinstellungen } from '@/profil'
import { WepNative } from './native'
import { alsVersion, type VersionInfo } from './update'
import {
  installiereNativesUpdate,
  pruefeAufUpdate,
  type ApkFortschritt,
  type GemerkterStand,
  type UpdateDeps,
  type UpdateStand,
} from './updateAblauf'

export type { UpdateStand } from './updateAblauf'

const SPEICHER_KEY = 'wep-update-stand'
const STUNDE_MS = 60 * 60 * 1000
/** Automatische Prüfung: beim Start (höchstens alle 15 Min.) und danach etwa alle 3 Stunden. */
const START_ABSTAND_MS = 15 * 60 * 1000
const INTERVALL_MS = 3 * STUNDE_MS

function ladeGemerkt(): GemerkterStand {
  try {
    const roh = localStorage.getItem(SPEICHER_KEY)
    if (roh) return { fehlgeschlagen: [], ...(JSON.parse(roh) as Partial<GemerkterStand>) }
  } catch {
    /* gesperrter Speicher oder kaputter Inhalt: wie neu */
  }
  return { fehlgeschlagen: [] }
}

function speichereGemerkt(s: GemerkterStand): void {
  try {
    localStorage.setItem(SPEICHER_KEY, JSON.stringify(s))
  } catch {
    /* dann eben ohne Gedächtnis */
  }
}

async function holeJson(url: string): Promise<unknown> {
  const antwort = await fetch(url, { cache: 'no-store' })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return antwort.json()
}

let nativeVersionCache: number | undefined
export async function nativeVersion(): Promise<number> {
  // Schlägt der Aufruf fehl, gilt die Prüfung als fehlgeschlagen (nicht „0“ raten).
  nativeVersionCache ??= (await WepNative.nativeVersion()).nativeVersion
  return nativeVersionCache
}

/** version.json des laufenden Web-Teils (nach einem Live-Update die des neuen Pakets). */
export async function installierteVersion(): Promise<VersionInfo | null> {
  return alsVersion(await holeJson('/version.json'))
}

const deps: UpdateDeps = {
  holeJson,
  installiert: installierteVersion,
  nativInstalliert: nativeVersion,
  updater: CapacitorUpdater,
  netz: async () => {
    const online = navigator.onLine
    if (!online) return { online, unmetered: false }
    try {
      return { online, unmetered: (await WepNative.netzTyp()).unmetered }
    } catch {
      return { online, unmetered: false }
    }
  },
  nurWlan: () => ladeGeraeteEinstellungen().nurWlan,
  lade: ladeGemerkt,
  speichere: speichereGemerkt,
  jetzt: () => Date.now(),
}

type Hoerer = (s: UpdateStand | null) => void
let stand: UpdateStand | null = ladeGemerkt().letzterStand ?? null
const hoerer = new Set<Hoerer>()

export function aktuellerUpdateStand(): UpdateStand | null {
  return stand
}

export function beobachteUpdate(h: Hoerer): () => void {
  hoerer.add(h)
  return () => void hoerer.delete(h)
}

/** Prüfung mit Merken des Standes. `erzwingen` = Knopf „Nach Update suchen“. */
export async function pruefeUndMerke(erzwingen: boolean): Promise<UpdateStand | null> {
  if (!Capacitor.isNativePlatform()) return null
  if (!erzwingen) {
    const g = ladeGemerkt()
    if (g.letztePruefung && Date.now() - g.letztePruefung < START_ABSTAND_MS) return stand
  }
  const s = await pruefeAufUpdate(deps)
  // Nur echte Ergebnisse merken (Offline/Fehler ändern „letzter Stand“ nicht und zählen nicht als Prüfung).
  if (s.art !== 'offline' && s.art !== 'fehler') {
    speichereGemerkt({ ...ladeGemerkt(), letzterStand: s, letztePruefung: Date.now() })
  }
  stand = s
  hoerer.forEach((h) => h(s))
  return s
}

/** Der Start war erfolgreich: sonst fällt das Plugin auf die vorige Fassung zurück. */
export async function meldeStartErfolg(): Promise<void> {
  try {
    await CapacitorUpdater.notifyAppReady()
  } catch (e) {
    console.warn('notifyAppReady:', e)
  }
}

/** Prüfung beim Start und danach etwa alle 3 Stunden (und beim Zurückkehren in die App). */
export function starteAutomatik(): void {
  void pruefeUndMerke(false)
  let letzte = Date.now()
  const faellig = () => {
    if (Date.now() - letzte >= INTERVALL_MS) {
      letzte = Date.now()
      void pruefeUndMerke(true)
    }
  }
  setInterval(faellig, 30 * 60 * 1000)
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) faellig()
  })
}

/** Lädt die neue APK (mit Fortschritt) und öffnet den Installer. */
export async function installiereNativ(fortschritt: (f: ApkFortschritt) => void): Promise<void> {
  const handle = await WepNative.addListener('apkFortschritt', fortschritt)
  try {
    await installiereNativesUpdate({
      holeJson,
      nativInstalliert: nativeVersion,
      ladeApk: async (o) => void (await WepNative.ladeApk(o)),
      installiereApk: () => WepNative.installiereApk(),
    })
  } finally {
    await handle.remove()
  }
}
