// Modellkette mit Sperrzeiten (docs/KI-ASSISTENT.md, Abschnitt „Anbindung“).
//
// Vom besten Modell abwärts. „Limit erreicht“ (429) sperrt ein Modell bis zum Reset,
// „überlastet“ (503) wird wie 429 behandelt (kurze Sperre); danach springt die Kette
// automatisch wieder zum besten Modell. Die Sperren liegen im Speicher der
// Function-Instanz – bei einer neuen Instanz wird einmal zu viel probiert, das schadet nicht.

import { GeminiFehler } from './gemini'

/** Standardkette (anpassbar über die Umgebungsvariable KI_MODELLE, kommagetrennt). */
export const STANDARD_MODELLE = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3-flash-preview']

const SPERRE_503_SEK = 60
const SPERRE_429_STANDARD_SEK = 60
const SPERRE_NICHT_VERFUEGBAR_SEK = 3600
const SPERRE_SERVERFEHLER_SEK = 30

const gesperrtBis = new Map<string, number>()

export function leereSperren(): void {
  gesperrtBis.clear()
}

export interface KettenErgebnis<T> {
  /** Modell, das geantwortet hat. */
  modell?: string
  wert?: T
  vermerke: string[]
  /** Alle Modelle waren gesperrt oder lieferten 429/503: HTTP 503 mit Wartezeit. */
  ausgelastet?: { erneutNachSek: number }
  /** Nicht behebbarer Fehler (Schlüssel, Anfrage): HTTP-Status und Text. */
  fehler?: { status: number; text: string }
}

function sperrdauerSek(e: GeminiFehler): number {
  if (e.status === 429) {
    return e.keinFreikontingent ? SPERRE_NICHT_VERFUEGBAR_SEK : Math.max(5, Math.ceil(e.wartenSek ?? SPERRE_429_STANDARD_SEK))
  }
  if (e.status === 503) return SPERRE_503_SEK
  if (e.status === 404 || e.status === 400) return SPERRE_NICHT_VERFUEGBAR_SEK // Modell kann den Auftrag nicht
  if (e.status === 0 || e.status >= 500) return SPERRE_SERVERFEHLER_SEK
  return 0
}

export async function rufeMitKette<T>(
  modelle: string[],
  anfrage: (modell: string) => Promise<T>,
  jetzt: () => number = Date.now,
  /** false = Antwort unbrauchbar, nächstes Modell. */
  brauchbar: (wert: T) => boolean = () => true,
): Promise<KettenErgebnis<T>> {
  const vermerke: string[] = []
  let ausgelastet = false
  let fruehestens = Infinity
  for (const modell of modelle) {
    const bis = gesperrtBis.get(modell)
    if (bis !== undefined && bis > jetzt()) {
      ausgelastet = true
      fruehestens = Math.min(fruehestens, bis)
      vermerke.push(`${modell} gesperrt`)
      continue
    }
    try {
      const wert = await anfrage(modell)
      if (!brauchbar(wert)) {
        vermerke.push(`${modell}: keine brauchbare Antwort → nächstes Modell`)
        continue
      }
      gesperrtBis.delete(modell)
      return { modell, wert, vermerke }
    } catch (e) {
      if (!(e instanceof GeminiFehler)) throw e
      if (e.status === 401 || e.status === 403) {
        return { vermerke, fehler: { status: 502, text: 'KI-Zugang abgelehnt (API-Schlüssel prüfen).' } }
      }
      const sek = sperrdauerSek(e)
      if (sek === 0) return { vermerke, fehler: { status: 502, text: `KI-Fehler (HTTP ${e.status}): ${e.message}` } }
      gesperrtBis.set(modell, jetzt() + sek * 1000)
      if (e.status === 429 || e.status === 503) {
        ausgelastet = true
        fruehestens = Math.min(fruehestens, jetzt() + sek * 1000)
      }
      vermerke.push(`${e.status} bei ${modell} → nächstes Modell`)
    }
  }
  if (ausgelastet) {
    return { vermerke, ausgelastet: { erneutNachSek: Math.max(1, Math.ceil((fruehestens - jetzt()) / 1000)) } }
  }
  return { vermerke, fehler: { status: 502, text: 'Kein KI-Modell hat geantwortet.' } }
}
