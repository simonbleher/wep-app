// Update-Hinweis der Android-App: vergleicht die eingebaute Version (version.json im APK)
// mit der neuesten (version.json der gehosteten Seite, wird bei jedem Merge auf main neu
// gebaut). Das Repo ist privat, deshalb gibt es keine anonyme Abfrage der GitHub-Releases.
// Neuer ist die gehostete Fassung, wenn ihr Commit vom eingebauten abweicht UND sie später
// gebaut wurde (gebautAm). Fehlt commit oder gebautAm auf einer Seite, gilt der frühere
// Vergleich: höherer versionName, bei gleichem Namen höherer versionCode (wenn beide > 0).
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

/** Gehostete Seite (siehe docs/HOSTING.md); dort liegt die neueste version.json. */
export const NEUESTE_VERSION_URL = 'https://wep-pankow.pages.dev/version.json'

const LETZTE_PRUEFUNG_KEY = 'wep-update-letzte-pruefung'
const TAG_MS = 24 * 60 * 60 * 1000

export interface VersionInfo {
  versionName: string
  versionCode: number
  /** Git-Commit, aus dem gebaut wurde (fehlt in alten Builds und lokalen Builds). */
  commit?: string
  /** Bauzeitpunkt (ISO). */
  gebautAm?: string
  releaseUrl: string
}

export interface UpdateStand {
  verfuegbar: VersionInfo | null
  /** Ergebnis der letzten Prüfung für die Anzeige im Profil. */
  meldung: string
}

function teile(name: string): number[] {
  return name.split(/[.\-+]/).map((t) => Number.parseInt(t, 10) || 0)
}

/** true, wenn `neu` neuer ist als `alt`. */
export function istNeuer(neu: VersionInfo, alt: VersionInfo): boolean {
  if (neu.commit && alt.commit && neu.gebautAm && alt.gebautAm) {
    const t1 = Date.parse(neu.gebautAm)
    const t0 = Date.parse(alt.gebautAm)
    if (!Number.isNaN(t1) && !Number.isNaN(t0)) return neu.commit !== alt.commit && t1 > t0
  }
  const a = teile(neu.versionName)
  const b = teile(alt.versionName)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return neu.versionCode > 0 && alt.versionCode > 0 && neu.versionCode > alt.versionCode
}

function alsVersion(d: unknown): VersionInfo | null {
  if (!d || typeof d !== 'object') return null
  const v = d as Partial<VersionInfo>
  if (typeof v.versionName !== 'string' || !v.versionName) return null
  return {
    versionName: v.versionName,
    versionCode: typeof v.versionCode === 'number' ? v.versionCode : 0,
    commit: typeof v.commit === 'string' && v.commit ? v.commit : undefined,
    gebautAm: typeof v.gebautAm === 'string' && v.gebautAm ? v.gebautAm : undefined,
    releaseUrl: typeof v.releaseUrl === 'string' && v.releaseUrl.startsWith('https://') ? v.releaseUrl : '',
  }
}

async function holeJson(url: string): Promise<VersionInfo | null> {
  const antwort = await fetch(url, { cache: 'no-store' })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return alsVersion(await antwort.json())
}

/** Prüft einmal. Wirft nie; ohne Netz oder Fehler gibt es keinen Hinweis. */
export async function pruefeAufUpdate(): Promise<UpdateStand> {
  try {
    const [installiert, neueste] = await Promise.all([holeJson('/version.json'), holeJson(NEUESTE_VERSION_URL)])
    if (!installiert || !neueste) return { verfuegbar: null, meldung: 'Versionsangabe nicht lesbar.' }
    if (istNeuer(neueste, installiert)) {
      return { verfuegbar: neueste, meldung: 'Eine neuere Version ist verfügbar.' }
    }
    return { verfuegbar: null, meldung: 'Die App ist auf dem neuesten Stand.' }
  } catch {
    return { verfuegbar: null, meldung: 'Keine Verbindung – Prüfung nicht möglich.' }
  }
}

function merkePruefung(): void {
  try {
    localStorage.setItem(LETZTE_PRUEFUNG_KEY, String(Date.now()))
  } catch {
    /* gesperrter Speicher: dann eben öfter prüfen */
  }
}

function pruefungFaellig(): boolean {
  try {
    const t = Number(localStorage.getItem(LETZTE_PRUEFUNG_KEY))
    return !(t > 0 && Date.now() - t < TAG_MS)
  } catch {
    return true
  }
}

type Hoerer = (s: UpdateStand | null) => void
let stand: UpdateStand | null = null
const hoerer = new Set<Hoerer>()

export function aktuellerUpdateStand(): UpdateStand | null {
  return stand
}

export function beobachteUpdate(h: Hoerer): () => void {
  hoerer.add(h)
  return () => void hoerer.delete(h)
}

/** Prüfung mit Merken des Zeitpunkts. `erzwingen` = Knopf „Nach Update suchen“. */
export async function pruefeUndMerke(erzwingen: boolean): Promise<UpdateStand | null> {
  if (!Capacitor.isNativePlatform()) return null
  if (!erzwingen && (!navigator.onLine || !pruefungFaellig())) return stand
  const s = await pruefeAufUpdate()
  // Ohne Verbindung nicht als „geprüft“ merken, sonst gäbe es einen Tag lang keinen Hinweis.
  if (s.verfuegbar || s.meldung.startsWith('Die App')) merkePruefung()
  stand = s
  hoerer.forEach((h) => h(s))
  return s
}

/** Öffnet die Release-Seite im System-Browser. */
export async function oeffneReleaseSeite(info: VersionInfo): Promise<void> {
  await Browser.open({ url: info.releaseUrl || 'https://github.com/simonbleher/wep-app/releases/latest' })
}
