// „Meine Unterschrift“: Speicher und Abruf für andere Teile der App (PDF, Paket 4).
//
// Die Unterschrift steckt als transparentes PNG (Data-URL) im Profil (`Profil.unterschrift`) und wird mit
// ihm über OneDrive abgeglichen (daten/profil.json, siehe src/sync/profil.ts). Sie liegt nie im Repo.
import { aendereProfil, lokalesProfil, type ProfilSpeicher } from '@/profil'

export const PNG_VORSPANN = 'data:image/png;base64,'
/** Größtes erlaubtes Profil-Feld (Zeichen der Data-URL); ein 600 × 240-PNG hat meist 5–40 KB. */
export const MAX_URL_LAENGE = 350_000

/** Ist das eine brauchbare PNG-Data-URL in vernünftiger Größe? */
export function istUnterschriftUrl(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.startsWith(PNG_VORSPANN) && wert.length > PNG_VORSPANN.length && wert.length <= MAX_URL_LAENGE && /^[A-Za-z0-9+/]+={0,2}$/.test(wert.slice(PNG_VORSPANN.length))
}

/** Data-URL der gespeicherten Unterschrift (für `<img src>`), oder `undefined`. */
export function ladeUnterschriftUrl(speicher: ProfilSpeicher = lokalesProfil): string | undefined {
  const u = speicher.lade().profil.unterschrift
  return istUnterschriftUrl(u) ? u : undefined
}

/** Speichert die Unterschrift im Profil (lokal, Abgleich beim nächsten Sync). */
export function speichereUnterschrift(url: string, speicher: ProfilSpeicher = lokalesProfil): void {
  if (!istUnterschriftUrl(url)) throw new Error('Die Unterschrift ist kein gültiges PNG oder zu groß.')
  aendereProfil({ unterschrift: url }, speicher)
}

export function loescheUnterschrift(speicher: ProfilSpeicher = lokalesProfil): void {
  aendereProfil({ unterschrift: undefined }, speicher)
}

/**
 * Für das PDF (Paket 4): die Unterschrift als PNG-Bytes mit durchsichtigem Hintergrund, oder `null`, wenn keine
 * hinterlegt ist. Läuft offline und ohne Oberfläche.
 */
export function unterschriftAlsPng(speicher: ProfilSpeicher = lokalesProfil): Uint8Array | null {
  const url = ladeUnterschriftUrl(speicher)
  if (!url) return null
  const roh = atob(url.slice(PNG_VORSPANN.length))
  const bytes = new Uint8Array(roh.length)
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i)
  return bytes
}
