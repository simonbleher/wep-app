// Preisvorschlag-Berechnung für eine WEP-Position.
//
// Die BewRL nennt Höchstwerte ("bis €"). Die App schlägt Höchstwert × Faktor
// der Zustandsstufe vor; bei schlechtem Zustand gilt ein fester Erinnerungswert
// von 1,00 €. Der Wertermittler kann den Vorschlag jederzeit überschreiben.

import type { Position } from '@/model'
import { ZUSTANDSSTUFEN } from '@/model'

/**
 * Berechnet den Preisvorschlag für eine Position.
 *
 * Gibt 0 zurück, wenn kein Zustand oder kein Höchstwert gesetzt ist (z. B.
 * Freitext-Positionen ohne Katalog-Eintrag). Der Wertermittler trägt dann
 * selbst einen Preis ein.
 */
export function berechnePreisvorschlag(position: Position): number {
  if (!position.zustand || position.hoechstwert === undefined) return 0

  const stufe = ZUSTANDSSTUFEN[position.zustand]

  // Sonderfall: schlechter Zustand → fester Erinnerungswert
  if (stufe.festpreis !== undefined) {
    return stufe.festpreis
  }

  return position.hoechstwert * stufe.faktor
}
