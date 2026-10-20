// Nur für Tests und Werkzeuge: eine Test-Bau-Excel aus der Vorlage (docs/WEP_Vorlage.xlsx) mit erfundenen
// Formalien-Werten – nie eine echte Datei. Die Vorlage selbst wird nur gelesen. Die Texte stehen wie in einer
// echten, mit Excel gespeicherten Datei als Shared Strings; auf Wunsch als Inline-Strings.
// Bewusst ohne Importe aus src/, damit auch `vite-node tools/paket5/erzeuge-test-bau-excel.ts` es nutzen kann.
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'

/** Erfundene Angaben (Zelle → Wert). Datumsfelder als Excel-Seriennummer, die Fläche als Zahl. */
export const TEST_FORMALIEN: Record<string, string | number> = {
  E3: 'KGA Testgarten',
  E4: 'Parzelle 42',
  E5: 'Rosenweg',
  E6: 'Erika Musterfrau',
  E7: 'Bezirksverband Beispielstadt',
  E9: 'Hans Vorstand',
  E12: 'Bert Bauer',
  E14: 46309, // 14.10.2026
  E15: 46315, // 20.10.2026
  E16: 380,
  E17: '2026-007',
}

export interface TestBauExcelOptionen {
  /** Zelle → Wert; ersetzt `TEST_FORMALIEN` vollständig, `null` lässt die Zelle leer. */
  werte?: Record<string, string | number | null>
  /** Texte als Inline-Strings statt als Shared Strings. */
  inline?: boolean
  vorlagePfad?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function erzeugeTestBauExcel(opt: TestBauExcelOptionen = {}): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(readFileSync(opt.vorlagePfad ?? 'docs/WEP_Vorlage.xlsx'))
  let blatt = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  let geteilt = await zip.file('xl/sharedStrings.xml')!.async('string')
  let anzahl = (geteilt.match(/<si\b/g) ?? []).length
  const werte = opt.werte ?? TEST_FORMALIEN
  for (const [zelle, wert] of Object.entries(werte)) {
    if (wert === null) continue
    const re = new RegExp(`<c r="${zelle}"( s="\\d+")?\\s*/>`)
    if (!re.test(blatt)) throw new Error(`Zelle ${zelle} nicht in der Vorlage gefunden`)
    blatt = blatt.replace(re, (_m, s: string | undefined) => {
      const stil = s ?? ''
      if (typeof wert === 'number') return `<c r="${zelle}"${stil}><v>${wert}</v></c>`
      if (opt.inline) return `<c r="${zelle}"${stil} t="inlineStr"><is><t>${esc(wert)}</t></is></c>`
      geteilt = geteilt.replace('</sst>', `<si><t>${esc(wert)}</t></si></sst>`)
      return `<c r="${zelle}"${stil} t="s"><v>${anzahl++}</v></c>`
    })
  }
  geteilt = geteilt.replace(/uniqueCount="\d+"/, `uniqueCount="${anzahl}"`).replace(/ count="(\d+)"/, (_m, n: string) => ` count="${Number(n) + 100}"`)
  zip.file('xl/worksheets/sheet1.xml', blatt)
  zip.file('xl/sharedStrings.xml', geteilt)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
