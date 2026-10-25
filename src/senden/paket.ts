// „An den BV senden“ (Stufe A): ein ZIP mit allem, was die Geschäftsstelle braucht – PDF(s), die WEP-Datei (zum Öffnen in
// der App) und die Fotos als JPG mit sprechenden Namen. Der Wertermittler legt es in den Synology-Ordner des BV (oder teilt
// es direkt in die Synology-Drive-App). Name: `<Vorgangs-Nr>_<Anlage>_<Parzelle>_an-BV.zip`.
import JSZip from 'jszip'
import type { Wep } from '@/model'
import { vorgangsNrVon } from '@/model'

export interface PaketDatei {
  name: string
  daten: Blob | Uint8Array
}

const sauber = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60)

/** Dateiname des Pakets: Vorgangs-Nr., Anlage und Parzelle (soweit vorhanden). */
export function paketName(wep: Pick<Wep, 'id' | 'formalien'>): string {
  const teile = [vorgangsNrVon(wep) || 'ohne-Vorgangs-Nr', wep.formalien.kleingartenanlage, wep.formalien.parzelle && `Parzelle_${wep.formalien.parzelle}`]
    .map((t) => sauber(t || ''))
    .filter(Boolean)
  return `${teile.join('_')}_an-BV.zip`
}

/** Packt PDFs und WEP-Datei an die Wurzel, die Fotos in den Ordner `Fotos/`. JPEG/PDF sind schon komprimiert: nur ablegen. */
export async function baueBvPaket(opt: { pdfs: PaketDatei[]; wepDatei: PaketDatei; fotos: PaketDatei[] }): Promise<Blob> {
  const zip = new JSZip()
  for (const d of opt.pdfs) zip.file(d.name, d.daten, { compression: 'STORE' })
  zip.file(opt.wepDatei.name, opt.wepDatei.daten, { compression: 'STORE' })
  for (const d of opt.fotos) zip.file(`Fotos/${d.name}`, d.daten, { compression: 'STORE' })
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}
