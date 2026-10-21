// Verdrahtung der Updates mit dem Windows-Programm: Rust-Befehle, Online-Status, localStorage.
// Gleiche Schnittstelle wie src/android/updateDienst.ts (siehe src/app/updateModul.ts).
import { alsVersion, type VersionInfo } from '@/android/update'
import type { ApkFortschritt, UpdateStand } from '@/android/updateAblauf'
import { WepWindows } from './api'
import { installiereProgrammUpdate, pruefeWindowsUpdate, type WindowsUpdateDeps } from './updateAblauf'

export type { UpdateStand } from '@/android/updateAblauf'

const SPEICHER_KEY = 'wep-update-stand-windows'
const STUNDE_MS = 60 * 60 * 1000
/** Automatische Prüfung: beim Start (höchstens alle 15 Min.) und danach etwa alle 3 Stunden. */
const START_ABSTAND_MS = 15 * 60 * 1000
const INTERVALL_MS = 3 * STUNDE_MS

interface Gemerkt {
  letzterStand?: UpdateStand
  /** Zeitpunkt der letzten erfolgreichen Prüfung (ms). */
  letztePruefung?: number
  /** Für welche Fassung (Commit | Hülle | Programm) die letzte Prüfung galt. */
  geprueftFuer?: string
}

function ladeGemerkt(): Gemerkt {
  try {
    const roh = localStorage.getItem(SPEICHER_KEY)
    if (roh) return JSON.parse(roh) as Gemerkt
  } catch {
    /* gesperrter Speicher oder kaputter Inhalt: wie neu */
  }
  return {}
}

function speichereGemerkt(g: Gemerkt): void {
  try {
    localStorage.setItem(SPEICHER_KEY, JSON.stringify(g))
  } catch {
    /* dann eben ohne Gedächtnis */
  }
}

async function holeJson(url: string): Promise<unknown> {
  const antwort = await fetch(url, { cache: 'no-store' })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return antwort.json()
}

/** Nummer der Hülle (Programm-Teil), fest eingebaut. */
export async function nativeVersion(): Promise<number> {
  return (await WepWindows.webInfo()).huelle
}

/** version.json des laufenden Web-Teils (nach einem Live-Update die des neuen Pakets). */
export async function installierteVersion(): Promise<VersionInfo | null> {
  return alsVersion(await holeJson('/version.json'))
}

const deps: WindowsUpdateDeps = {
  holeJson,
  installiert: installierteVersion,
  info: () => WepWindows.webInfo(),
  programmPruefen: () => WepWindows.programmPruefen(),
  paketLaden: (commit, sha256) => WepWindows.webPaketLaden(commit, sha256),
  online: () => navigator.onLine,
  jetzt: () => Date.now(),
}

type Hoerer = (s: UpdateStand | null) => void
// Erst nach dem Abgleich mit der laufenden Fassung anzeigen (pruefeUndMerke), sonst stünde nach
// einer Installation kurz der alte Hinweis „Neue App-Version“ da.
let stand: UpdateStand | null = null
const hoerer = new Set<Hoerer>()

export function aktuellerUpdateStand(): UpdateStand | null {
  return stand
}

export function beobachteUpdate(h: Hoerer): () => void {
  hoerer.add(h)
  return () => void hoerer.delete(h)
}

/** Kennung der laufenden Fassung (Commit des Web-Teils | Hülle | Programmversion); undefined, wenn unbekannt. */
async function laufendeFassung(): Promise<string | undefined> {
  try {
    const [v, i] = await Promise.all([installierteVersion(), WepWindows.webInfo()])
    return `${v?.commit ?? '?'}|${i.huelle}|${i.programm}`
  } catch {
    return undefined
  }
}

/** Prüfung mit Merken des Standes. `erzwingen` = Knopf „Nach Update suchen“. */
export async function pruefeUndMerke(erzwingen: boolean): Promise<UpdateStand | null> {
  const fassung = await laufendeFassung()
  if (!erzwingen) {
    const g = ladeGemerkt()
    // Gemerkter Stand gilt nur für dieselbe Fassung: nach Installation oder Live-Update sofort neu prüfen.
    const gleicheFassung = fassung !== undefined && g.geprueftFuer === fassung
    if (gleicheFassung && g.letztePruefung && Date.now() - g.letztePruefung < START_ABSTAND_MS) {
      if (!stand && g.letzterStand) {
        stand = g.letzterStand
        hoerer.forEach((h) => h(stand))
      }
      return stand
    }
  }
  const s = await pruefeWindowsUpdate(deps)
  // Nur echte Ergebnisse merken (Offline/Fehler ändern „letzter Stand“ nicht und zählen nicht als Prüfung).
  if (s.art !== 'offline' && s.art !== 'fehler') {
    speichereGemerkt({ letzterStand: s, letztePruefung: Date.now(), geprueftFuer: fassung })
  }
  stand = s
  hoerer.forEach((h) => h(s))
  return s
}

/** Der Start war erfolgreich: sonst fällt das Programm auf den Web-Teil der .exe zurück. */
export async function meldeStartErfolg(): Promise<void> {
  try {
    await WepWindows.webStartGemeldet()
  } catch (e) {
    console.warn('webStartGemeldet:', e)
  }
}

/** Prüfung beim Start und danach etwa alle 3 Stunden (und beim Zurückkehren ins Fenster). */
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') faellig()
  })
}

/** Lädt die neue .exe (mit Fortschritt) und startet den Installer; das Programm beendet sich dabei. */
export async function installiereNativ(fortschritt: (f: ApkFortschritt) => void): Promise<void> {
  await installiereProgrammUpdate(
    {
      programmPruefen: () => WepWindows.programmPruefen(),
      programmInstallieren: (f) => WepWindows.programmInstallieren(f),
    },
    fortschritt,
  )
}
