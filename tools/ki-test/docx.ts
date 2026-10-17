// Word-Datei (.docx) → Klartext für den Prompt, mit mammoth (läuft auch im Browser).
//
// mammoth.extractRawText würde Tabellenzellen als einzelne Absätze ausgeben und
// damit „Position | Menge | Bemerkung“ auseinanderreißen. Deshalb über HTML:
// eine Tabellenzeile = eine Textzeile, Zellen mit „ | “ getrennt.

import mammoth from 'mammoth'

function entschaerfen(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Wandelt das HTML von mammoth in Zeilen um (Absätze, Listen, Tabellenzeilen). */
export function htmlZuText(html: string): string {
  const text = html
    // Tabellenzeile → eine Zeile; Absätze innerhalb einer Zelle mit Leerzeichen
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, zeile: string) => {
      const zellen = [...zeile.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
        m[1].replace(/<\/p>\s*<p[^>]*>/g, ' ').replace(/<[^>]+>/g, '').trim(),
      )
      return `<p>${zellen.join(' | ')}</p>`
    })
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<li[^>]*>/g, '- ')
    .replace(/<\/(p|h[1-6]|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
  return entschaerfen(text)
    .split('\n')
    .map((z) => z.replace(/[ \t]+/g, ' ').replace(/(\s*\|\s*)+$/, '').trim())
    .filter((z) => z && !/^(\|\s*)+$/.test(z))
    .join('\n')
}

export async function docxZuText(daten: Buffer | ArrayBuffer): Promise<string> {
  const { value } =
    daten instanceof ArrayBuffer
      ? await mammoth.convertToHtml({ arrayBuffer: daten })
      : await mammoth.convertToHtml({ buffer: daten })
  return htmlZuText(value)
}
