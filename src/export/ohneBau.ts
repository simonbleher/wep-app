/**
 * Hat ein WEP weder Bau-Daten noch eine Bau-Excel, stehen in der Vorlage im Bau-Teil noch ihre Beispielwerte
 * (Baulichkeiten F104/G104 „nicht beräumt“ 250 €, Beseitigungskosten Zeile 12 Fäkalien 150 €), und das Deckblatt
 * zöge sie ab. Dann wird mit leeren Bau-Daten exportiert, die diese Zellen leeren.
 */
import { neueBauDaten, type Rolle, type Wep } from '../model'

export interface ExportEingabe {
  wep: Wep
  /** Teil für `exportWep`. */
  teil: Rolle
}

export function mitLeerenBauDaten(wep: Wep, rolle: Rolle, hatBauExcel: boolean): ExportEingabe {
  if (wep.bau || hatBauExcel) return { wep, teil: rolle }
  // Der Grün-Teil schreibt den Bau-Teil sonst nicht; „beides“ schreibt mit den leeren Daten Bau und Grün
  return { wep: { ...wep, bau: neueBauDaten() }, teil: rolle === 'gruen' ? 'beides' : rolle }
}
