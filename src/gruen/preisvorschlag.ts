// Preisvorschlag-Berechnung für eine WEP-Position.
//
// Die BewRL nennt Höchstwerte ("bis €"). Die App schlägt Höchstwert × Faktor
// der Zustandsstufe vor; bei schlechtem Zustand gilt ein fester Erinnerungswert
// von 1,00 € – auch bei eigenen Positionen ohne Höchstwert. Der Wertermittler kann den Vorschlag jederzeit überschreiben.

import type { Position } from '@/model'
import { ZUSTANDSSTUFEN } from '@/model'

/**
 * Berechnet den Preisvorschlag für eine Position.
 *
 * Gibt 0 zurück, wenn kein Zustand gesetzt ist oder (außer bei „schlecht“) kein
 * Höchstwert (z. B. Freitext-Positionen ohne Katalog-Eintrag). Der Wertermittler
 * trägt dann selbst einen Preis ein.
 */
export function berechnePreisvorschlag(position: Position): number {
  if (!position.zustand) return 0

  const stufe = ZUSTANDSSTUFEN[position.zustand]

  // Sonderfall: schlechter Zustand → fester Erinnerungswert, unabhängig vom Höchstwert
  if (stufe.festpreis !== undefined) {
    return stufe.festpreis
  }

  if (position.hoechstwert === undefined) return 0

  return position.hoechstwert * stufe.faktor
}
