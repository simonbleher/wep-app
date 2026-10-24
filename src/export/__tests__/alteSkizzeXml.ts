/** Hilfe für den Vergleich „alte Skizze unverändert“: Zeichnungs-XML des Blatts „Skizze Außenanlage-Aufwuchs“ nach dem Export. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep } from '../index'
import { neuerWep } from '../../model'
import { skizzeDatenZuFormen, type SvgRaster } from '../skizzeFormen'
import type { SkizzeDaten } from '../../skizze/types'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const PNG_1X1 = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
const raster: SvgRaster = async () => PNG_1X1

export async function exportiereDrawingXml(daten: SkizzeDaten): Promise<string> {
  const buf = fs.readFileSync(VORLAGE)
  const vorlage = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const wep = neuerWep('test-alt')
  const r = await exportWep(wep, vorlage, { skizzeFormen: { elemente: ({ zeichenbereich }) => skizzeDatenZuFormen(daten, zeichenbereich), rasterisiere: raster } })
  const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
  return zip.file('xl/drawings/drawing9.xml')!.async('string')
}
