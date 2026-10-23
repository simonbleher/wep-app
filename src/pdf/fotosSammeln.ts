/**
 * Fotos eines WEP für den PDF-Anhang zusammenstellen: Positionsnummer (wie in den Dateinamen des Foto-Exports),
 * Bezeichnung der Position und Text zum Foto. Die Bilddateien holt `lade` (lokal oder aus OneDrive).
 */
import { fotoDateiNamen, positionsListe } from '../fotos/benennung'
import type { Wep } from '../model'
import type { PdfFoto } from './fotos'

export interface GesammelteFotos {
  fotos: PdfFoto[]
  /** Fotos, deren Datei weder hier noch in OneDrive zu bekommen war. */
  fehlen: number
}

export async function sammlePdfFotos(wep: Wep, lade: (fotoId: string) => Promise<Blob | undefined>): Promise<GesammelteFotos> {
  const namen = positionsListe(wep)
  const ergebnis: GesammelteFotos = { fotos: [], fehlen: 0 }
  for (const { foto, nr } of fotoDateiNamen(wep)) {
    const blob = await lade(foto.id)
    if (!blob) {
      ergebnis.fehlen++
      continue
    }
    ergebnis.fotos.push({
      nr,
      titel: nr === 0 ? '' : (namen.find((p) => p.nr === nr)?.name ?? ''),
      ...(foto.text?.trim() ? { text: foto.text.trim() } : {}),
      bytes: new Uint8Array(await blob.arrayBuffer()),
    })
  }
  return ergebnis
}
