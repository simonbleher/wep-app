// Summenberechnungen für Positionen und das gesamte WEP.
//
// Alle Funktionen sind rein (keine Seiteneffekte) und leicht testbar.
// Alle Geldbeträge werden auf 2 Dezimalstellen gerundet, um Gleitkomma-
// Artefakte zu vermeiden (identisch mit ROUND(A*K,2) der Excel-Formel).

import type { Position, BeseitigungsPosition, Wep } from '@/model'

/**
 * Summe eines Positions-Abschnitts (Außenanlagen oder Aufwuchs).
 * Entspricht der Summe aller Zeilen: ROUND(anzahl × einzelpreis, 2).
 */
export function summeAbschnitt(positionen: Position[]): number {
  const summe = positionen.reduce((acc, p) => acc + p.anzahl * p.einzelpreis, 0)
  return Math.round(summe * 100) / 100
}

/**
 * Summe der Beseitigungskosten (Anlage 4, Abschnitt 2).
 * Jede Position: menge × einzelpreis × faktor.
 */
export function summeBeseitigung(positionen: BeseitigungsPosition[]): number {
  const summe = positionen.reduce(
    (acc, p) => acc + p.menge * p.einzelpreis * p.faktor,
    0,
  )
  return Math.round(summe * 100) / 100
}

/**
 * Gesamtsumme des Grün-Teils eines WEP:
 * Außenanlagen + Aufwuchs + Beseitigungskosten (Abschnitt 2).
 */
export function gesamtsumme(wep: Wep): number {
  const aa = summeAbschnitt(wep.gruen.aussenanlagen)
  const aufwuchs = summeAbschnitt(wep.gruen.aufwuchs)
  const beseitigung = summeBeseitigung(wep.gruen.beseitigungAA)
  return Math.round((aa + aufwuchs + beseitigung) * 100) / 100
}
