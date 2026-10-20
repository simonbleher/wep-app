// Ordnerstruktur im OneDrive-App-Ordner (Apps/WEP-App):
//
//   daten/        WEP-Dateien (<Vorgangs-Nr>.json), Konflikt-Kopien, profil.json
//   daten/papierkorb/   gelöschte WEPs (30 Tage), mit Löschzeitpunkt
//   Exporte/      fertige Excel-Dateien (<Vorgangs-Nr>_WEP.xlsx)
//   LIESMICH.txt  Hinweis „bitte nichts von Hand ändern“
//
// Frühere Versionen legten die WEP-Dateien direkt in den App-Ordner. Beim ersten
// Abgleich werden sie nach daten/ verschoben.
import type { GraphClient } from './types'

export const DATEN_ORDNER = 'daten'
export const EXPORTE_ORDNER = 'Exporte'
export const PAPIERKORB_ORDNER = 'daten/papierkorb'
export const PROFIL_DATEI = 'profil.json'
export const LIESMICH_DATEI = 'LIESMICH.txt'

export const LIESMICH_TEXT =
  'Ordner der WEP-App – bitte nichts von Hand ändern.\r\n' +
  'Fertige Excel-Dateien liegen in Exporte/.\r\n'

/** WEP- oder Konflikt-Datei aus einer früheren Version (liegt direkt im App-Ordner). */
export function istAltdatei(name: string): boolean {
  return name.endsWith('.json') && name !== PROFIL_DATEI
}

export interface OrdnerErgebnis {
  verschoben: string[]
  /** Im Zielordner gab es die Datei schon; die alte Datei bleibt unberührt liegen. */
  vorhanden: string[]
  liesmichAngelegt: boolean
}

/**
 * Richtet die Ordnerstruktur ein: LIESMICH.txt anlegen (falls sie fehlt) und alte
 * WEP-/Konflikt-Dateien aus dem App-Ordner nach daten/ verschieben.
 * Idempotent: ein zweiter Lauf findet nichts mehr zu tun und überschreibt nie etwas.
 * `wurzel` ist der Client für den App-Ordner selbst.
 */
export async function richteOrdnerEin(wurzel: GraphClient): Promise<OrdnerErgebnis> {
  const ergebnis: OrdnerErgebnis = { verschoben: [], vorhanden: [], liesmichAngelegt: false }
  const dateien = await wurzel.liste()

  for (const d of dateien) {
    if (!istAltdatei(d.name)) continue
    const r = await wurzel.verschiebe(d.name, DATEN_ORDNER)
    if (r === 'verschoben') ergebnis.verschoben.push(d.name)
    else ergebnis.vorhanden.push(d.name)
  }

  if (!dateien.some((d) => d.name === LIESMICH_DATEI)) {
    await wurzel.schreibe(LIESMICH_DATEI, LIESMICH_TEXT, 'text/plain; charset=utf-8')
    ergebnis.liesmichAngelegt = true
  }
  return ergebnis
}
