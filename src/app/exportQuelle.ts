// Die Excel-Datei, in die ein Export schreibt: die am WEP gemerkte Bau-Excel (lokal, sonst aus OneDrive geholt)
// oder die leere Vorlage. Excel-Export und PDF-Export nehmen dieselbe Quelle.
import { bauExcelFuerExport } from '@/bauexcel'
import type { Wep } from '@/model'
import { ladeBauExcelAusOneDrive } from '@/sync'

export interface ExportQuelle {
  buffer: ArrayBuffer
  /** `buffer` ist eine Bau-Excel (und nicht die leere Vorlage). */
  hatBauExcel: boolean
}

/** `nurBau`: der Bau-Wertermittler exportiert ohne Bau-Excel (sie ist ja sein eigener Teil). */
export async function ladeExportQuelle(wep: Wep, nurBau: boolean): Promise<ExportQuelle> {
  const bau = nurBau ? undefined : await bauExcelFuerExport({ wep, quelle: { hole: ladeBauExcelAusOneDrive } })
  if (bau) return { buffer: bau, hatBauExcel: true }
  const resp = await fetch('/WEP_Vorlage.xlsx')
  if (!resp.ok) throw new Error(`Vorlage nicht gefunden: ${resp.statusText}`)
  return { buffer: await resp.arrayBuffer(), hatBauExcel: false }
}
