/**
 * Fotoanhang: je Seite bis zu sechs Fotos (2 × 3) mit Positionsnummer und Beschriftung.
 * Die Fotos sind schon komprimiert (JPEG); sie werden unverändert eingebettet.
 */
import type { PDFDocument, PDFPage } from 'pdf-lib'
import { kodierbar, type Schriften } from './schrift'

type Lib = typeof import('pdf-lib')

export interface PdfFoto {
  /** Positionsnummer im WEP (0 = WEP allgemein). */
  nr: number
  /** Bezeichnung der Position („Apfel, Halbstamm, 5–30 J.“). */
  titel: string
  /** Text zum Foto (optional). */
  text?: string
  /** Bilddatei (JPEG oder PNG). */
  bytes: Uint8Array
}

const A4: [number, number] = [595.28, 841.89]
const RAND = 40
const SPALTEN = 2
const ZEILEN = 3
const ABSTAND = 14
const BESCHRIFTUNG = 34

const istJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8
const istPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47

function kuerze(text: string, breite: number, mess: (t: string) => number): string {
  if (mess(text) <= breite) return text
  let t = text
  while (t.length > 1 && mess(t + '…') > breite) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

/** Hängt die Fotoseiten an. Gibt die Zahl der Seiten und Hinweise (nicht lesbare Bilder) zurück. */
export async function fotoSeiten(lib: Lib, dok: PDFDocument, schriften: Schriften, fotos: PdfFoto[], kopf?: string): Promise<{ seiten: number; hinweise: string[] }> {
  const hinweise: string[] = []
  const sortiert = [...fotos].sort((a, b) => a.nr - b.nr)
  const proSeite = SPALTEN * ZEILEN
  const seitenZahl = Math.ceil(sortiert.length / proSeite)
  const zellB = (A4[0] - 2 * RAND - (SPALTEN - 1) * ABSTAND) / SPALTEN
  const kopfH = 46
  const zellH = (A4[1] - 2 * RAND - kopfH - (ZEILEN - 1) * ABSTAND) / ZEILEN
  const bildH = zellH - BESCHRIFTUNG
  const grau = lib.rgb(0.35, 0.35, 0.35)
  const schwarz = lib.rgb(0, 0, 0)

  for (let sn = 0; sn < seitenZahl; sn++) {
    const seite: PDFPage = dok.addPage(A4)
    seite.drawText(kodierbar('Fotoanhang'), { x: RAND, y: A4[1] - RAND - 14, size: 14, font: schriften.fett, color: schwarz })
    if (kopf) seite.drawText(kodierbar(kopf), { x: RAND, y: A4[1] - RAND - 29, size: 9, font: schriften.normal, color: grau })
    const nummer = `Seite ${sn + 1} von ${seitenZahl}`
    seite.drawText(nummer, { x: A4[0] - RAND - schriften.normal.widthOfTextAtSize(nummer, 8), y: RAND - 18, size: 8, font: schriften.normal, color: grau })

    const teil = sortiert.slice(sn * proSeite, (sn + 1) * proSeite)
    for (const [i, foto] of teil.entries()) {
      const sp = i % SPALTEN
      const ze = Math.floor(i / SPALTEN)
      const x = RAND + sp * (zellB + ABSTAND)
      const yOben = A4[1] - RAND - kopfH - ze * (zellH + ABSTAND)
      try {
        const bild = istPng(foto.bytes) ? await dok.embedPng(foto.bytes) : istJpeg(foto.bytes) ? await dok.embedJpg(foto.bytes) : undefined
        if (!bild) throw new Error('Format')
        const f = Math.min(zellB / bild.width, bildH / bild.height)
        const w = bild.width * f
        const h = bild.height * f
        seite.drawRectangle({ x, y: yOben - bildH, width: zellB, height: bildH, borderColor: lib.rgb(0.8, 0.8, 0.8), borderWidth: 0.5 })
        seite.drawImage(bild, { x: x + (zellB - w) / 2, y: yOben - bildH + (bildH - h) / 2, width: w, height: h })
      } catch {
        seite.drawRectangle({ x, y: yOben - bildH, width: zellB, height: bildH, borderColor: lib.rgb(0.8, 0.8, 0.8), borderWidth: 0.5 })
        seite.drawText('Bild nicht lesbar', { x: x + 8, y: yOben - bildH / 2, size: 9, font: schriften.normal, color: grau })
        hinweise.push(`Foto zu „${foto.titel}“ konnte nicht eingebettet werden.`)
      }
      const titel = `${foto.nr === 0 ? 'Gesamtansicht' : `Nr. ${String(foto.nr).padStart(2, '0')}`}${foto.nr === 0 || !foto.titel ? '' : ` – ${foto.titel}`}`
      const mess = (t: string) => schriften.fett.widthOfTextAtSize(kodierbar(t), 9)
      seite.drawText(kodierbar(kuerze(titel, zellB, mess)), { x, y: yOben - bildH - 12, size: 9, font: schriften.fett, color: schwarz })
      if (foto.text) {
        const messN = (t: string) => schriften.normal.widthOfTextAtSize(kodierbar(t), 8)
        seite.drawText(kodierbar(kuerze(foto.text.replace(/\s+/g, ' '), zellB, messN)), { x, y: yOben - bildH - 23, size: 8, font: schriften.normal, color: grau })
      }
    }
  }
  return { seiten: seitenZahl, hinweise }
}
