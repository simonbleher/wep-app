// Summenberechnung für einen WEP-Abschnitt.
//
// Ergibt die Live-Summe aller Positionen (Anzahl × Einzelpreis).

import type { Position } from '@/model'

/**
 * Berechnet die Gesamtsumme aller Positionen eines Abschnitts.
 * Jede Position trägt `anzahl × einzelpreis` bei.
 */
export function berechneAbschnittSumme(positionen: Position[]): number {
  return positionen.reduce((summe, pos) => summe + pos.anzahl * pos.einzelpreis, 0)
}
