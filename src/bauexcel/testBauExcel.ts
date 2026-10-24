// Nur für Tests und Werkzeuge: eine Test-Bau-Excel aus der Vorlage (docs/WEP_Vorlage.xlsx) mit erfundenen
// Formalien-Werten – nie eine echte Datei. Die Vorlage selbst wird nur gelesen. Die Texte stehen wie in einer
// echten, mit Excel gespeicherten Datei als Shared Strings; auf Wunsch als Inline-Strings.
// Bewusst ohne Importe aus src/, damit auch `vite-node tools/paket5/erzeuge-test-bau-excel.ts` es nutzen kann.
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { leseBlattGeometrie } from '../export/skizzeFormen'

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
  /** Handgezeichnete Formen (erfunden: Laube, Anbauten, Schuppen, Terrasse, Keller …) ins Blatt „Skizze Bau“ legen. */
  skizzeBau?: boolean
  /** Zusätzliche Formen in „Skizze Bau“ (nur mit `skizzeBau`). */
  weitereFormen?: TestForm[]
}

/** Eine handgezeichnete Form im Blatt „Skizze Bau“ (Punkt ab Blattecke, wie Excel sie anzeigt). */
export interface TestForm {
  name: string
  art: 'rechteck' | 'freiform' | 'textfeld' | 'linie'
  x: number
  y: number
  w: number
  h: number
  text?: string
  fuellung?: string
  linie?: string
  gestrichelt?: boolean
  /** linie: Pfeilspitze am Ende (`tailEnd`) bzw. am Anfang (`'anfang'`, `headEnd`). */
  pfeil?: boolean | 'anfang'
  /** freiform: Eckpunkte in pt relativ zur linken oberen Ecke von (x, y). */
  punkte?: [number, number][]
}

/** Die erfundene Bau-Skizze (Kasten ca. x 14–475, y 93–724 pt wie in der Vorlage). */
export const TEST_SKIZZE_BAU: TestForm[] = [
  { name: 'Rechteck 3', art: 'rechteck', x: 22, y: 101, w: 445, h: 615, fuellung: 'E2F0D9', linie: '595959' },
  ...[
    [22, 101], [244, 101], [467, 101], [22, 408], [467, 408], [22, 716], [244, 716], [467, 716],
  ].map(([x, y], i): TestForm => ({ name: `Rechteck ${10 + i}`, art: 'rechteck', x: x - 2.5, y: y - 2.5, w: 5, h: 5, fuellung: 'FFFFFF', linie: '595959' })),
  { name: 'Rechteck 20', art: 'rechteck', x: 150, y: 170, w: 160, h: 120, text: 'L', fuellung: 'E7E6E6', linie: '262626' },
  { name: 'Rechteck 21', art: 'rechteck', x: 60, y: 200, w: 90, h: 70, text: 'S1', fuellung: 'E7E6E6', linie: '262626' },
  { name: 'Rechteck 22', art: 'rechteck', x: 150, y: 290, w: 160, h: 60, text: 'LVP', fuellung: 'E7E6E6', linie: '262626' },
  { name: 'K1_HW', art: 'rechteck', x: 170, y: 190, w: 60, h: 50, text: 'K1 HW', linie: '262626', gestrichelt: true },
  {
    name: 'Freihandform 23', art: 'freiform', x: 310, y: 170, w: 90, h: 150, text: 'A1', fuellung: 'E7E6E6', linie: '262626',
    punkte: [[0, 0], [90, 0], [90, 150], [50, 150], [50, 60], [0, 60]],
  },
  { name: 'TextBox 8', art: 'textfeld', x: 330, y: 400, w: 90, h: 24 },
  { name: 'Textfeld 24', art: 'textfeld', x: 300, y: 440, w: 120, h: 24, text: 'Zufahrt' },
  { name: 'Gerader Verbinder 25', art: 'linie', x: 150, y: 155, w: 160, h: 0, linie: 'C00000' },
  { name: 'Textfeld 26', art: 'textfeld', x: 200, y: 135, w: 60, h: 20, text: '4 m' },
]

const emuPt = (pt: number) => Math.round(pt * 12700)

function testFormXml(f: TestForm, id: number, geo: ReturnType<typeof leseBlattGeometrie>): string {
  const x1 = emuPt(f.x)
  const y1 = emuPt(f.y)
  const x2 = emuPt(f.x + f.w)
  const y2 = emuPt(f.y + f.h)
  const a = { c: geo.spaltePos(x1), r: geo.zeilePos(y1) }
  const b = { c: geo.spaltePos(x2), r: geo.zeilePos(y2) }
  const anker =
    `<xdr:from><xdr:col>${a.c.index}</xdr:col><xdr:colOff>${a.c.versatz}</xdr:colOff><xdr:row>${a.r.index}</xdr:row><xdr:rowOff>${a.r.versatz}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${b.c.index}</xdr:col><xdr:colOff>${b.c.versatz}</xdr:colOff><xdr:row>${b.r.index}</xdr:row><xdr:rowOff>${b.r.versatz}</xdr:rowOff></xdr:to>`
  const xfrm = `<a:xfrm><a:off x="${x1}" y="${y1}"/><a:ext cx="${x2 - x1}" cy="${y2 - y1}"/></a:xfrm>`
  const fuell = f.fuellung ? `<a:solidFill><a:srgbClr val="${f.fuellung}"/></a:solidFill>` : '<a:noFill/>'
  const rahmen = f.linie
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${f.linie}"/></a:solidFill>${f.gestrichelt ? '<a:prstDash val="dash"/>' : ''}${f.pfeil === 'anfang' ? '<a:headEnd type="triangle"/>' : f.pfeil ? '<a:tailEnd type="triangle"/>' : ''}</a:ln>`
    : '<a:ln><a:noFill/></a:ln>'
  const text = f.text
    ? `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="de-DE" sz="1100"/><a:t>${esc(f.text)}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="de-DE" sz="1100"/></a:p>'
  const koerper = `<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" rtlCol="0" anchor="ctr"/><a:lstStyle/>${text}</xdr:txBody>`
  const kopf = `<xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}"/><xdr:cNvSpPr${f.art === 'textfeld' ? ' txBox="1"' : ''}/></xdr:nvSpPr>`
  if (f.art === 'linie') {
    return (
      `<xdr:twoCellAnchor>${anker}<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr>` +
      `<xdr:spPr>${xfrm}<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>${rahmen}</xdr:spPr></xdr:cxnSp><xdr:clientData/></xdr:twoCellAnchor>`
    )
  }
  const geometrie =
    f.art === 'freiform' && f.punkte
      ? `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${x2 - x1}" h="${y2 - y1}">` +
        f.punkte.map(([px, py], i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${emuPt(px)}" y="${emuPt(py)}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('') +
        '<a:close/></a:path></a:pathLst></a:custGeom>'
      : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
  return (
    `<xdr:twoCellAnchor>${anker}<xdr:sp macro="" textlink="">${kopf}<xdr:spPr>${xfrm}${geometrie}${fuell}${rahmen}</xdr:spPr>${koerper}</xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`
  )
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
  if (opt.skizzeBau) {
    // Blatt „Skizze Bau“ = sheet18.xml mit drawing8.xml in der Vorlage; die vorhandene leere Textbox bleibt
    const geo = leseBlattGeometrie(await zip.file('xl/worksheets/sheet18.xml')!.async('string'))
    let zeichnung = await zip.file('xl/drawings/drawing8.xml')!.async('string')
    const ids = [...zeichnung.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => Number(m[1]))
    let id = Math.max(1, ...ids) + 1
    zeichnung = zeichnung.replace('</xdr:wsDr>', `${[...TEST_SKIZZE_BAU, ...(opt.weitereFormen ?? [])].map((f) => testFormXml(f, id++, geo)).join('')}</xdr:wsDr>`)
    zip.file('xl/drawings/drawing8.xml', zeichnung)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
