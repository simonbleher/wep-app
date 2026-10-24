/**
 * Hat ein WEP weder Bau-Daten noch eine Bau-Excel, stehen in der Vorlage im Bau-Teil noch ihre Beispielwerte
 * (Baulichkeiten F104/G104 „nicht beräumt“ 250 €, Beseitigungskosten Zeile 12 Fäkalien 150 €), und das Deckblatt
 * zöge sie ab. Dann wird mit leeren Bau-Daten exportiert, die diese Zellen leeren.
 */
import { neueBauDaten, type BauDaten, type Rolle, type Wep } from '../model'

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

/** Hat das WEP etwas im Bau-Teil (Bauteile, Abwasser, Beschreibung, Beseitigung …)? */
export function hatBauDaten(bau: BauDaten | undefined): boolean {
  if (!bau) return false
  return (
    bau.bauteile.length > 0 ||
    bau.beseitigung.length > 0 ||
    bau.abwasser.art !== 'keine' ||
    bau.nichtBeraeumt.aktiv ||
    Boolean(bau.beschreibung?.trim())
  )
}

/**
 * Rolle für Export und PDF: Ein WEP „nur Grün“, das trotzdem Bau-Daten hat (z. B. vom Bau-Wertermittler geteilt oder
 * aus der Bau-Excel übernommen), wird mit beiden Teilen exportiert – sonst fehlten Laube & Co. in Excel und PDF.
 */
export function exportRolle(wep: Pick<Wep, 'bau'>, rolle: Rolle): Rolle {
  return rolle === 'gruen' && hatBauDaten(wep.bau) ? 'beides' : rolle
}
