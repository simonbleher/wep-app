// Liest ein fertiges PDF mit pdf.js (nur für Tests): Text je Seite und Zahl der Bilder/Pfade.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfSeite {
  text: string
  bilder: number
  pfade: number
}

export async function liesPdf(bytes: Uint8Array): Promise<PdfSeite[]> {
  const dok = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise
  const seiten: PdfSeite[] = []
  for (let i = 1; i <= dok.numPages; i++) {
    const seite = await dok.getPage(i)
    const inhalt = await seite.getTextContent()
    const ops = await seite.getOperatorList()
    const bild = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject])
    seiten.push({
      text: inhalt.items.map((t) => ('str' in t ? t.str : '')).join(' '),
      bilder: ops.fnArray.filter((f) => bild.has(f)).length,
      pfade: ops.fnArray.filter((f) => f === OPS.constructPath).length,
    })
  }
  return seiten
}
