/**
 * Schriften des PDF: die Standardschriften (Helvetica in vier Schnitten) – metrisch gleich Arial, der Schrift der
 * Vorlage. Sie brauchen keine eingebettete Schriftdatei, kennen aber nur den Zeichensatz WinAnsi; alles andere
 * wird beim Schreiben durch „?“ ersetzt.
 */
import type { PDFDocument, PDFFont } from 'pdf-lib'
import type { Messer } from './blatt'

const WIN_ANSI = /[ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/

/** Ersetzt Zeichen, die die Standardschriften nicht kennen. */
export function kodierbar(text: string): string {
  let aus = ''
  for (const c of text) aus += WIN_ANSI.test(c) ? c : c === '\n' || c === '\r' || c === '\t' ? ' ' : '?'
  return aus
}

export interface Schriften {
  normal: PDFFont
  fett: PDFFont
  kursiv: PDFFont
  fettKursiv: PDFFont
}

export async function ladeSchriften(dok: PDFDocument, standard: typeof import('pdf-lib').StandardFonts): Promise<Schriften> {
  return {
    normal: await dok.embedFont(standard.Helvetica),
    fett: await dok.embedFont(standard.HelveticaBold),
    kursiv: await dok.embedFont(standard.HelveticaOblique),
    fettKursiv: await dok.embedFont(standard.HelveticaBoldOblique),
  }
}

export const schriftFuer = (s: Schriften, fett: boolean, kursiv: boolean): PDFFont => (fett ? (kursiv ? s.fettKursiv : s.fett) : kursiv ? s.kursiv : s.normal)

export function messerAus(s: Schriften): Messer {
  return { breite: (text, fett, kursiv, groesse) => schriftFuer(s, fett, kursiv).widthOfTextAtSize(kodierbar(text), groesse) }
}
