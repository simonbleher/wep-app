// Die Wahl auf dem Login-Bildschirm („mit Konto“ / „ohne Konto“) wird auf dem Gerät
// gemerkt. Danach startet die App direkt – auch offline.
import type { Konto, KontoDienst } from './types'

const KEY = 'wep-start-wahl'

export type StartWahl = 'konto' | 'ohne-konto'

export function leseStartWahl(): StartWahl | null {
  try {
    const w = localStorage.getItem(KEY)
    return w === 'konto' || w === 'ohne-konto' ? w : null
  } catch {
    return null
  }
}

export function speichereStartWahl(wahl: StartWahl | null): void {
  try {
    if (wahl) localStorage.setItem(KEY, wahl)
    else localStorage.removeItem(KEY)
  } catch {
    /* ohne Speicher fragt die App eben beim nächsten Start noch einmal */
  }
}

export type Start = { typ: 'login' } | { typ: 'start'; konto: Konto | null }

/**
 * Entscheidet beim App-Start, ob der Login-Bildschirm kommt.
 * - Anmeldung nicht eingerichtet oder „ohne Konto“ gewählt → direkt starten
 * - Konto vorhanden → starten (und merken)
 * - kein Konto, aber früher mit Konto gestartet und Anmeldedaten nicht lesbar
 *   (offline) → trotzdem starten
 * - sonst → Login-Bildschirm
 */
export async function ermittleStart(dienst: KontoDienst): Promise<Start> {
  if (!dienst.verfuegbar()) return { typ: 'start', konto: null }
  const wahl = leseStartWahl()
  if (wahl === 'ohne-konto') return { typ: 'start', konto: null }
  try {
    const konto = await dienst.aktuellesKonto()
    if (konto) {
      speichereStartWahl('konto')
      return { typ: 'start', konto }
    }
    return { typ: 'login' }
  } catch {
    return wahl === 'konto' ? { typ: 'start', konto: null } : { typ: 'login' }
  }
}
