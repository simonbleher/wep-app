// Fotos beim Excel-Export: Ordner `Exporte/<Vorgangs-Nr>_Fotos/` mit sprechenden Dateinamen
// (nicht in der Excel-Datei). Ohne Konto: dieselben Dateien als ZIP zum Herunterladen.
import JSZip from 'jszip'
import type { Wep } from '@/model'
import type { ExportDatei } from '@/sync/exporte'
import type { FotoAblage } from './ablage'
import { fotoDateiNamen } from './benennung'

export function fotoOrdnerName(wepId: string): string {
  return `${wepId}_Fotos`
}

export interface ExportFotos {
  dateien: ExportDatei[]
  /** Fotos, deren Datei weder hier noch in OneDrive zu bekommen war. */
  fehlen: string[]
}

/**
 * Sammelt die Bilddateien aller Fotos des WEP unter ihren Export-Namen. Fotos, die nur in OneDrive
 * liegen, werden über `hole` nachgeladen (falls möglich).
 */
export async function sammleExportFotos(
  wep: Wep,
  ablage: Pick<FotoAblage, 'ladeDatei'>,
  hole?: (wepId: string, fotoId: string) => Promise<Blob | undefined>,
): Promise<ExportFotos> {
  const ergebnis: ExportFotos = { dateien: [], fehlen: [] }
  for (const { foto, name } of fotoDateiNamen(wep)) {
    let blob = await ablage.ladeDatei(wep.id, foto.id)
    if (!blob && hole) blob = await hole(wep.id, foto.id).catch(() => undefined)
    if (blob) ergebnis.dateien.push({ name, blob })
    else ergebnis.fehlen.push(name)
  }
  return ergebnis
}

/** Packt die Dateien in ein ZIP (JPEG ist schon komprimiert: nur ablegen, das geht schnell). */
export async function zipDateien(dateien: ExportDatei[]): Promise<Blob> {
  const zip = new JSZip()
  for (const d of dateien) zip.file(d.name, d.blob, { binary: true })
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}
