// Anfrage über die Modellkette mit Fallback (Skizzen-Testlauf).
//
// Wie im Testlauf A: 429 mit kurzer Wartezeit (≤ 60 s) → warten und neu versuchen,
// sonst Modell für den Rest des Laufs sperren und das nächste nehmen.
// Zusätzlich: 503 („überlastet“) wird wie 429 behandelt – kommt im Gratis-Tarif bei
// Vorschau-Modellen oft minutenlang, ein Neuversuch hilft dann selten.

import { GeminiFehler } from './gemini'

const MAX_WARTEN_SEK = 60
const PAUSE_MS = 2000 // Abstand zwischen Anfragen (Minutenlimit im Gratis-Tarif)

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface KettenErgebnis<T> {
  angefragt: string
  antwortVon?: string
  sekunden: number
  vermerke: string[]
  wert?: T
  fehler?: string
}

/** Gemma-Modelle nehmen am Skizzen-Testlauf nicht teil (kein verlässliches box_2d/responseSchema). */
export const ohneGemma = (namen: string[]) => namen.filter((n) => !/^gemma/i.test(n))

export async function rufeMitKette<T>(
  kette: string[],
  gesperrt: Set<string>,
  startModell: string,
  anfrage: (modell: string) => Promise<T>,
  pauseMs = PAUSE_MS,
): Promise<KettenErgebnis<T>> {
  const erg: KettenErgebnis<T> = { angefragt: startModell, sekunden: 0, vermerke: [] }
  for (const modell of kette.slice(kette.indexOf(startModell))) {
    if (gesperrt.has(modell)) {
      if (modell === startModell) erg.vermerke.push(`${modell} gesperrt`)
      continue
    }
    for (let versuch = 1; versuch <= 2; versuch++) {
      if (pauseMs) await pause(pauseMs)
      const t0 = performance.now()
      try {
        erg.wert = await anfrage(modell)
        erg.sekunden = (performance.now() - t0) / 1000
        erg.antwortVon = modell
        return erg
      } catch (e) {
        erg.sekunden = (performance.now() - t0) / 1000
        if (e instanceof GeminiFehler && (e.status === 429 || e.status === 503)) {
          const kurz = e.status === 429 && !e.keinFreikontingent && (e.wartenSek ?? Infinity) <= MAX_WARTEN_SEK
          if (versuch === 1 && kurz) {
            erg.vermerke.push(`429 bei ${modell}, ${Math.ceil(e.wartenSek!)} s gewartet`)
            await pause(Math.ceil(e.wartenSek! * 1000) + 500)
            continue
          }
          gesperrt.add(modell)
          erg.vermerke.push(`${e.status} bei ${modell} → nächstes Modell`)
          break
        }
        if (e instanceof GeminiFehler && e.status >= 500 && versuch === 1) {
          erg.vermerke.push(`HTTP ${e.status} bei ${modell}, neuer Versuch`)
          await pause(10_000)
          continue
        }
        erg.antwortVon = modell
        erg.fehler =
          e instanceof GeminiFehler
            ? `HTTP ${e.status}: ${e.message.slice(0, 160)}`
            : `Antwort unlesbar: ${(e as Error).message.slice(0, 160)}`
        return erg
      }
    }
  }
  erg.fehler = 'kein Modell verfügbar (alle 429/503)'
  return erg
}
