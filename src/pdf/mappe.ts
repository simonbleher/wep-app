/**
 * Arbeitsmappe (.xlsx) lesen – nur, was das PDF braucht: Blätter, Zellen (Wert und Formel), Stile
 * (Schrift, Füllung, Rahmen, Zahlenformat, Ausrichtung), Spaltenbreiten, Zeilenhöhen, verbundene Zellen,
 * Druckbereich, Seitenumbrüche, Seitenränder und Skalierung. Die Datei wird nie verändert.
 */
import JSZip from 'jszip'
import { kind, kinder, leseXml, volltext, type XmlKnoten } from './xml'

export type Wert = string | number | boolean | null
export type Fehlerwert = { fehler: string }
export type Zellwert = Wert | Fehlerwert

export interface Schrift {
  name: string
  groesse: number
  fett: boolean
  kursiv: boolean
  unterstrichen: boolean
  farbe: string | null
}

export type Strich = 'thin' | 'medium' | 'thick' | 'hair' | 'dashed' | 'dotted' | 'dashDot' | 'double' | 'mediumDashed' | 'dashDotDot' | 'slantDashDot' | 'mediumDashDot' | 'mediumDashDotDot'
export interface Kante {
  stil: Strich
  farbe: string
}
export interface Rahmen {
  l?: Kante
  r?: Kante
  o?: Kante
  u?: Kante
}
export interface Ausrichtung {
  h: 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed'
  v: 'top' | 'center' | 'bottom' | 'justify' | 'distributed'
  umbruch: boolean
  einzug: number
  drehung: number
  schrumpfen: boolean
}
export interface Stil {
  schrift: Schrift
  fuellung: string | null
  rahmen: Rahmen
  format: string
  ausrichtung: Ausrichtung
}

/** Ein Abschnitt eines Textes mit eigener Formatierung (Rich Text in der Zelle). Fehlende Angaben gelten wie in der Zelle. */
export interface Lauf {
  text: string
  fett?: boolean
  kursiv?: boolean
  unterstrichen?: boolean
  groesse?: number
  farbe?: string
}

export interface Zelle {
  /** Läufe bei Text mit gemischter Formatierung (nur Texte aus der Textliste, ohne Formel). */
  laeufe?: Lauf[]
  /** Gespeicherter Wert (bei Formeln der zuletzt berechnete, veraltet). */
  wert: Wert
  formel?: string
  /** Gemeinsame Formel: `formel` ist die der Ursprungszelle, um so viele Zeilen/Spalten zu verschieben. */
  verschiebung?: { dz: number; ds: number }
  stil: number
}

export interface Bereich {
  z1: number
  s1: number
  z2: number
  s2: number
}

export interface Seite {
  /** Ränder in Zoll. */
  rand: { l: number; r: number; o: number; u: number }
  skala: number
  breitenAnpassen: boolean
  hochformat: boolean
  /** Papier in pt (Breite, Höhe) im Hochformat. */
  papier: [number, number]
  zentriertH: boolean
}

export interface Checkbox {
  z1: number
  s1: number
  zOff1: number
  sOff1: number
  z2: number
  s2: number
  zOff2: number
  sOff2: number
}

export interface Blatt {
  name: string
  sichtbar: boolean
  zellen: Map<number, Zelle>
  zeilenHoehe: Map<number, number>
  zeilenStil: Map<number, number>
  zeilenVersteckt: Set<number>
  /** Spalten (ab 1): Breite in Zeichen und Standardstil. */
  spalten: { min: number; max: number; breite: number; stil: number; versteckt: boolean }[]
  standardZeilenHoehe: number
  standardSpaltenBreite: number
  verbunden: Bereich[]
  druckbereich?: Bereich
  umbrueche: number[]
  seite: Seite
  checkboxen: Checkbox[]
}

export interface Mappe {
  blaetter: Blatt[]
  stile: Stil[]
  /** Hilfsliste der Namen in Dateireihenfolge. */
  blattNamen: string[]
  /** Definierte Namen (klein geschrieben) → Bezug, z. B. „uwe“ → „Tabelle1!$J$54:$N$75“. */
  namen: Map<string, string>
}

export const schluessel = (z: number, s: number): number => z * 20000 + s

/** „AB12“ → { z: 12, s: 28 } (beide ab 1). */
export function zelleAdresse(a: string): { z: number; s: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a)
  if (!m) throw new Error(`Keine Zelladresse: ${a}`)
  return { z: Number(m[2]), s: spaltenNummer(m[1]) }
}
export function spaltenNummer(buchstaben: string): number {
  let n = 0
  for (const c of buchstaben.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n
}
export function spaltenBuchstaben(n: number): string {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// ---------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------

const INDEX_FARBEN = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
]

function hex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
}

/** Helligkeit nach Excel (Tint) über HLS. */
function tonen(rgb: string, tint: number): string {
  if (!tint) return rgb
  const r = parseInt(rgb.slice(0, 2), 16) / 255
  const g = parseInt(rgb.slice(2, 4), 16) / 255
  const b = parseInt(rgb.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return s === 0 ? hex(l * 255).repeat(3) : hex(f(h + 1 / 3) * 255) + hex(f(h) * 255) + hex(f(h - 1 / 3) * 255)
}

function farbeVon(k: XmlKnoten | undefined, theme: string[], standard: string | null): string | null {
  if (!k) return standard
  const tint = k.attr.tint ? Number(k.attr.tint) : 0
  if (k.attr.rgb) return tonen(k.attr.rgb.slice(-6).toUpperCase(), tint)
  if (k.attr.theme !== undefined) return tonen(theme[Number(k.attr.theme)] ?? '000000', tint)
  if (k.attr.indexed !== undefined) {
    const i = Number(k.attr.indexed)
    if (i === 64) return standard ?? '000000'
    if (i === 65) return 'FFFFFF'
    return INDEX_FARBEN[i] ?? standard
  }
  return standard
}

function themeFarben(xml: string | undefined): string[] {
  // Reihenfolge der Theme-Indizes in Excel: lt1, dk1, lt2, dk2, accent1–6, hlink, folHlink
  const standard = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646', '0000FF', '800080']
  if (!xml) return standard
  const wurzel = leseXml(xml)
  const schema = (function suche(k: XmlKnoten): XmlKnoten | undefined {
    if (k.name === 'a:clrScheme') return k
    for (const c of k.kinder) {
      const r = suche(c)
      if (r) return r
    }
    return undefined
  })(wurzel)
  if (!schema) return standard
  const wert = (n: string): string | undefined => {
    const e = kind(schema, n)?.kinder[0]
    return e?.attr.val === undefined && e?.attr.lastClr === undefined ? undefined : (e.attr.lastClr ?? e.attr.val).toUpperCase()
  }
  const reihe = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
  return reihe.map((n, i) => wert(n) ?? standard[i])
}

// ---------------------------------------------------------------------------
// Stile
// ---------------------------------------------------------------------------

const EINGEBAUT: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd.mm.yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd.mm.yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  41: '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-', 42: '_-* #,##0\\ "€"_-;\\-* #,##0\\ "€"_-;_-* "-"\\ "€"_-;_-@_-',
  43: '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-', 44: '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
}

function kante(k: XmlKnoten | undefined, theme: string[]): Kante | undefined {
  const stil = k?.attr.style as Strich | undefined
  if (!k || !stil) return undefined
  return { stil, farbe: farbeVon(kind(k, 'color'), theme, '000000') ?? '000000' }
}

function leseStile(xml: string, theme: string[]): Stil[] {
  const w = leseXml(xml)
  const formate = new Map<number, string>()
  for (const n of kinder(kind(w, 'numFmts'), 'numFmt')) formate.set(Number(n.attr.numFmtId), n.attr.formatCode)

  const schriften: Schrift[] = kinder(kind(w, 'fonts'), 'font').map((f) => ({
    name: kind(f, 'name')?.attr.val ?? 'Calibri',
    groesse: Number(kind(f, 'sz')?.attr.val ?? 11),
    fett: Boolean(kind(f, 'b')) && kind(f, 'b')?.attr.val !== '0',
    kursiv: Boolean(kind(f, 'i')) && kind(f, 'i')?.attr.val !== '0',
    unterstrichen: Boolean(kind(f, 'u')) && kind(f, 'u')?.attr.val !== 'none',
    farbe: farbeVon(kind(f, 'color'), theme, null),
  }))
  const fuellungen: (string | null)[] = kinder(kind(w, 'fills'), 'fill').map((f) => {
    const p = kind(f, 'patternFill')
    if (!p || p.attr.patternType !== 'solid') return null
    return farbeVon(kind(p, 'fgColor'), theme, 'FFFFFF')
  })
  const rahmen: Rahmen[] = kinder(kind(w, 'borders'), 'border').map((b) => ({
    l: kante(kind(b, 'left'), theme),
    r: kante(kind(b, 'right'), theme),
    o: kante(kind(b, 'top'), theme),
    u: kante(kind(b, 'bottom'), theme),
  }))

  return kinder(kind(w, 'cellXfs'), 'xf').map((xf) => {
    const id = Number(xf.attr.numFmtId ?? 0)
    const a = kind(xf, 'alignment')
    return {
      schrift: schriften[Number(xf.attr.fontId ?? 0)] ?? schriften[0],
      fuellung: fuellungen[Number(xf.attr.fillId ?? 0)] ?? null,
      rahmen: rahmen[Number(xf.attr.borderId ?? 0)] ?? {},
      format: formate.get(id) ?? EINGEBAUT[id] ?? 'General',
      ausrichtung: {
        h: (a?.attr.horizontal as Ausrichtung['h']) ?? 'general',
        v: (a?.attr.vertical as Ausrichtung['v']) ?? 'bottom',
        umbruch: a?.attr.wrapText === '1' || a?.attr.wrapText === 'true',
        einzug: Number(a?.attr.indent ?? 0),
        drehung: Number(a?.attr.textRotation ?? 0),
        schrumpfen: a?.attr.shrinkToFit === '1' || a?.attr.shrinkToFit === 'true',
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Blätter
// ---------------------------------------------------------------------------

const PAPIER: Record<string, [number, number]> = {
  '8': [841.89, 1190.55],
  '9': [595.28, 841.89],
  '1': [612, 792],
}

function leseBereich(text: string): Bereich | undefined {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(text.trim())
  if (!m) return undefined
  const s1 = spaltenNummer(m[1])
  const z1 = Number(m[2])
  return { z1, s1, z2: m[4] ? Number(m[4]) : z1, s2: m[3] ? spaltenNummer(m[3]) : s1 }
}

function leseBlatt(xml: string, name: string, sichtbar: boolean, geteilt: string[], geteiltLaeufe: (Lauf[] | undefined)[], druckbereich: Bereich | undefined, drawingXml?: string): Blatt {
  const w = leseXml(xml)
  const zellen = new Map<number, Zelle>()
  const zeilenHoehe = new Map<number, number>()
  const zeilenStil = new Map<number, number>()
  const zeilenVersteckt = new Set<number>()
  const geteilteFormeln = new Map<string, { formel: string; z: number; s: number }>()

  const fmt = kind(w, 'sheetFormatPr')
  const standardZeilenHoehe = Number(fmt?.attr.defaultRowHeight ?? 15)
  const standardSpaltenBreite = Number(fmt?.attr.defaultColWidth ?? (fmt?.attr.baseColWidth ? Number(fmt.attr.baseColWidth) + 0.7109375 : 8.7109375))

  const spalten = kinder(kind(w, 'cols'), 'col').map((c) => ({
    min: Number(c.attr.min),
    max: Math.min(Number(c.attr.max), 200),
    breite: Number(c.attr.width ?? standardSpaltenBreite),
    stil: Number(c.attr.style ?? 0),
    versteckt: c.attr.hidden === '1',
  }))

  for (const zeile of kinder(kind(w, 'sheetData'), 'row')) {
    const z = Number(zeile.attr.r)
    if (zeile.attr.ht !== undefined) zeilenHoehe.set(z, Number(zeile.attr.ht))
    if (zeile.attr.hidden === '1') zeilenVersteckt.add(z)
    if (zeile.attr.s !== undefined && zeile.attr.customFormat === '1') zeilenStil.set(z, Number(zeile.attr.s))
    for (const c of kinder(zeile, 'c')) {
      const a = zelleAdresse(c.attr.r)
      const t = c.attr.t
      const v = kind(c, 'v')?.text
      const f = kind(c, 'f')
      let wert: Wert = null
      let laeufe: Lauf[] | undefined
      if (t === 's' && v !== undefined) {
        wert = geteilt[Number(v)] ?? ''
        laeufe = geteiltLaeufe[Number(v)]
      }
      else if (t === 'inlineStr') wert = kinder(kind(c, 'is'), 't').map((x) => x.text).join('') + kinder(kind(c, 'is'), 'r').map((r) => kind(r, 't')?.text ?? '').join('')
      else if (t === 'str' && v !== undefined) wert = v
      else if (t === 'b' && v !== undefined) wert = v === '1'
      else if (t === 'e') wert = null
      else if (v !== undefined && v !== '') wert = Number(v)
      let formel: string | undefined
      let verschiebung: Zelle['verschiebung']
      if (f) {
        if (f.attr.t === 'shared') {
          const si = f.attr.si
          if (f.text.trim()) {
            geteilteFormeln.set(si, { formel: f.text, z: a.z, s: a.s })
            formel = f.text
          } else {
            const m = geteilteFormeln.get(si)
            if (m) {
              formel = m.formel
              verschiebung = { dz: a.z - m.z, ds: a.s - m.s }
            }
          }
        } else if (f.text.trim()) formel = f.text
      }
      zellen.set(schluessel(a.z, a.s), { wert, formel, verschiebung, stil: Number(c.attr.s ?? 0), ...(laeufe && !formel ? { laeufe } : {}) })
    }
  }

  const verbunden = kinder(kind(w, 'mergeCells'), 'mergeCell')
    .map((m) => leseBereich(m.attr.ref))
    .filter((b): b is Bereich => Boolean(b))

  const umbrueche = kinder(kind(w, 'rowBreaks'), 'brk').map((b) => Number(b.attr.id)).sort((a, b) => a - b)

  const rand = kind(w, 'pageMargins')
  const ps = kind(w, 'pageSetup')
  const optionen = kind(w, 'printOptions')
  const seite: Seite = {
    rand: {
      l: Number(rand?.attr.left ?? 0.7),
      r: Number(rand?.attr.right ?? 0.7),
      o: Number(rand?.attr.top ?? 0.75),
      u: Number(rand?.attr.bottom ?? 0.75),
    },
    skala: Number(ps?.attr.scale ?? 100),
    breitenAnpassen: kind(kind(w, 'sheetPr'), 'pageSetUpPr')?.attr.fitToPage === '1',
    hochformat: ps?.attr.orientation !== 'landscape',
    papier: PAPIER[ps?.attr.paperSize ?? '9'] ?? PAPIER['9'],
    zentriertH: optionen?.attr.horizontalCentered === '1',
  }

  const checkboxen: Checkbox[] = []
  if (drawingXml) {
    const wd = leseXml(drawingXml)
    const sammle = (k: XmlKnoten) => {
      if (k.name === 'xdr:twoCellAnchor') {
        const sp = kind(k, 'xdr:sp')
        const nm = kind(kind(sp, 'xdr:nvSpPr'), 'xdr:cNvPr')?.attr.name ?? ''
        if (/^Check Box/i.test(nm)) {
          const von = kind(k, 'xdr:from')
          const bis = kind(k, 'xdr:to')
          const n = (p: XmlKnoten | undefined, e: string) => Number(kind(p, e)?.text ?? 0)
          checkboxen.push({
            s1: n(von, 'xdr:col') + 1, sOff1: n(von, 'xdr:colOff') / 12700, z1: n(von, 'xdr:row') + 1, zOff1: n(von, 'xdr:rowOff') / 12700,
            s2: n(bis, 'xdr:col') + 1, sOff2: n(bis, 'xdr:colOff') / 12700, z2: n(bis, 'xdr:row') + 1, zOff2: n(bis, 'xdr:rowOff') / 12700,
          })
        }
        return
      }
      for (const c of k.kinder) sammle(c)
    }
    sammle(wd)
  }

  return { name, sichtbar, zellen, zeilenHoehe, zeilenStil, zeilenVersteckt, spalten, standardZeilenHoehe, standardSpaltenBreite, verbunden, druckbereich, umbrueche, seite, checkboxen }
}

function pfadAufloesen(basis: string, ziel: string): string {
  if (ziel.startsWith('/')) return ziel.slice(1)
  const teile = basis.split('/').slice(0, -1)
  for (const t of ziel.split('/')) {
    if (t === '..') teile.pop()
    else if (t !== '.') teile.push(t)
  }
  return teile.join('/')
}

/** Liest die Arbeitsmappe aus den Bytes einer .xlsx. */
export async function leseMappe(daten: ArrayBuffer | Uint8Array): Promise<Mappe> {
  const zip = await JSZip.loadAsync(daten)
  return leseMappeAusZip(zip)
}

export async function leseMappeAusZip(zip: JSZip): Promise<Mappe> {
  const text = async (pfad: string): Promise<string | undefined> => zip.file(pfad)?.async('string')
  const wbXml = await text('xl/workbook.xml')
  if (!wbXml) throw new Error('Keine Arbeitsmappe (xl/workbook.xml fehlt)')
  const wb = leseXml(wbXml)
  const relXml = (await text('xl/_rels/workbook.xml.rels')) ?? ''
  const rels = new Map<string, string>()
  for (const r of kinder(leseXml(relXml), 'Relationship')) rels.set(r.attr.Id, r.attr.Target)

  const theme = themeFarben(await text('xl/theme/theme1.xml'))
  const stile = leseStile((await text('xl/styles.xml')) ?? '<styleSheet/>', theme)

  const ssXml = await text('xl/sharedStrings.xml')
  const geteilt: string[] = ssXml
    ? kinder(leseXml(ssXml), 'si').map((si) => {
        const direkt = kinder(si, 't').map((t) => t.text).join('')
        const laeufe = kinder(si, 'r').map((r) => kind(r, 't')?.text ?? '').join('')
        return direkt + laeufe
      })
    : []

  const geteiltLaeufe: (Lauf[] | undefined)[] = ssXml
    ? kinder(leseXml(ssXml), 'si').map((si) => {
        const rs = kinder(si, 'r')
        if (!rs.length) return undefined
        return rs.map((r): Lauf => {
          const pr = kind(r, 'rPr')
          const an = (n: string) => kind(pr, n)
          return {
            text: kind(r, 't')?.text ?? '',
            ...(an('b') ? { fett: an('b')!.attr.val !== '0' } : {}),
            ...(an('i') ? { kursiv: an('i')!.attr.val !== '0' } : {}),
            ...(an('u') ? { unterstrichen: an('u')!.attr.val !== 'none' } : {}),
            ...(an('sz') ? { groesse: Number(an('sz')!.attr.val) } : {}),
            ...(an('color') ? { farbe: farbeVon(an('color'), theme, null) ?? undefined } : {}),
          }
        })
      })
    : []

  const namen = kinder(kind(wb, 'sheets'), 'sheet')
  const druck = new Map<number, Bereich>()
  for (const d of kinder(kind(wb, 'definedNames'), 'definedName')) {
    if (d.attr.name !== '_xlnm.Print_Area' || d.attr.localSheetId === undefined) continue
    const teil = d.text.split('!').pop() ?? ''
    const b = leseBereich(teil)
    if (b) druck.set(Number(d.attr.localSheetId), b)
  }

  const bezugsNamen = new Map<string, string>()
  for (const d of kinder(kind(wb, 'definedNames'), 'definedName')) {
    if (d.attr.name.startsWith('_xlnm.') || d.attr.localSheetId !== undefined) continue
    bezugsNamen.set(d.attr.name.toLowerCase(), d.text)
  }

  const blaetter: Blatt[] = []
  for (const [i, s] of namen.entries()) {
    const ziel = rels.get(s.attr['r:id'])
    if (!ziel) continue
    const pfad = pfadAufloesen('xl/workbook.xml', ziel)
    const xml = await text(pfad)
    if (!xml) continue
    // Zeichnung des Blatts (Kontrollkästchen der Mängelliste)
    let drawingXml: string | undefined
    const relPfad = pfad.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels')
    const blattRels = await text(relPfad)
    if (blattRels) {
      for (const r of kinder(leseXml(blattRels), 'Relationship')) {
        if (/\/drawing$/.test(r.attr.Type ?? '')) drawingXml = await text(pfadAufloesen(pfad, r.attr.Target))
      }
    }
    const b = leseBlatt(xml, s.attr.name, s.attr.state !== 'hidden' && s.attr.state !== 'veryHidden', geteilt, geteiltLaeufe, druck.get(i), drawingXml)
    blaetter.push(b)
  }
  return { blaetter, stile, blattNamen: blaetter.map((b) => b.name), namen: bezugsNamen }
}

export { volltext }
