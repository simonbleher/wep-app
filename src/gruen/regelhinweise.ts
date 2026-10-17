// Regelhinweise für erfasste Positionen.
//
// Gibt Warnungen aus (schwere: 'warnung') für Regelverstöße laut BewRL,
// blockiert jedoch NICHTS (CLAUDE.md: „Nichts sperren, nur warnen").
// Die Funktion ist rein (kein Netz, kein localStorage) und damit testbar.
//
// Quellen der Regeln: docs/ARCHITEKTUR.md (Abschnitt „Regeln aus der BewRL")
// und docs/Richtlinie.pdf.

import type { Position, Hinweis } from '@/model'
import type { InvasiveArt } from '@/model'
import { istInvasiv } from '@/katalog'

// Katalog-IDs für Rasen/Wiese (Aufwuchs-Abschnitt)
const RASEN_IDS = new Set(['aw-rasen', 'aw-wiese'])

// Katalog-IDs für Wege-/Platzbelag (Außenanlagen-Abschnitt)
const WEGEBELAG_IDS = new Set(['aa-wegebelag'])

/** Prüft, ob eine Position Rasen oder Wiese darstellt. */
function istRasenOderWiese(pos: Position): boolean {
  if (pos.katalogId && RASEN_IDS.has(pos.katalogId)) return true
  // Fallback: Heuristik über Bezeichnung (eigene Positionen ohne katalogId)
  const bez = pos.bezeichnung.toLowerCase()
  return bez.includes('rasen') || bez.includes('wiese')
}

/** Prüft, ob eine Position versiegelte Fläche darstellt. */
function istVersiegelt(pos: Position): boolean {
  if (pos.katalogId && WEGEBELAG_IDS.has(pos.katalogId)) return true
  // Fallback: Heuristik (Wege, Platz, Terrasse in m²)
  const bez = pos.bezeichnung.toLowerCase()
  const betriffsFlaechenart =
    bez.includes('weg') ||
    bez.includes('platz') ||
    bez.includes('terrasse') ||
    bez.includes('pflaster')
  return betriffsFlaechenart && pos.einheit === 'm²'
}

/**
 * Berechnet Regel-Warnungen für eine Positionsliste.
 *
 * Geprüfte Regeln (laut BewRL / ARCHITEKTUR.md):
 * 1. Rasen/Wiese: Fläche > 100 m² → Warnung
 * 2. Versiegelte Fläche: > 6 % von (Parzellenfläche − 24 m²) → Warnung
 * 3. Invasive Arten (Unionsliste): Bezeichnung erkannt → Warnung + Beseitigung vorschlagen
 *
 * @param positionen          - Model-Positionen (Außenanlagen, Aufwuchs oder beides)
 * @param parzellenflaecheQm  - Parzellenfläche laut Vertrag in m²
 * @param invasiveArten       - Artenliste aus data/invasive.json (optional; ohne kein Invasiv-Check)
 */
export function regelhinweise(
  positionen: Position[],
  parzellenflaecheQm: number,
  invasiveArten?: InvasiveArt[],
): Hinweis[] {
  const hinweise: Hinweis[] = []

  // ── 1. Rasen/Wiese > 100 m² ────────────────────────────────────────────────
  const rasenQm = positionen
    .filter((p) => istRasenOderWiese(p) && p.einheit === 'm²')
    .reduce((sum, p) => sum + p.anzahl, 0)

  if (rasenQm > 100) {
    hinweise.push({
      schwere: 'warnung',
      text: `Rasen/Wiese: ${rasenQm} m² erfasst – maximal zulässig sind 100 m².`,
      regel: 'BewRL: Rasen/Wiese max. 100 m²',
    })
  }

  // ── 2. Versiegelte Fläche > 6 % von (Parzellenfläche − 24 m²) ─────────────
  if (parzellenflaecheQm > 0) {
    const restflaeche = Math.max(0, parzellenflaecheQm - 24)
    const maxVersiegelt = restflaeche * 0.06
    const versiegeltQm = positionen
      .filter((p) => istVersiegelt(p) && p.einheit === 'm²')
      .reduce((sum, p) => sum + p.anzahl, 0)

    if (versiegeltQm > maxVersiegelt) {
      hinweise.push({
        schwere: 'warnung',
        text:
          `Versiegelte Fläche: ${versiegeltQm} m² – zulässig sind max. 6 % von ` +
          `${restflaeche} m² = ${maxVersiegelt.toFixed(1)} m².`,
        regel: 'BewRL: Wege/Plätze max. 6 % der Restfläche (Parzellenfläche − 24 m²)',
      })
    }
  }

  // ── 3. Invasive Arten ──────────────────────────────────────────────────────
  if (invasiveArten && invasiveArten.length > 0) {
    for (const pos of positionen) {
      const art = istInvasiv(invasiveArten, pos.bezeichnung)
      if (art) {
        const name = art.deutsch || art.wissenschaftlich
        hinweise.push({
          schwere: 'warnung',
          text: `„${pos.bezeichnung}" ist eine invasive Art (${name}) – Beseitigungskosten vorschlagen.`,
          regel: 'BewRL Anlage: Invasive Arten der Unionsliste → entfernen',
        })
      }
    }
  }

  return hinweise
}
