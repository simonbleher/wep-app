/**
 * Liest die Formalien (Blatt „Formalien“, Zellen E3–E17) aus einer Bau-Excel.
 *
 * Das Blatt „Formalien“ der Vorlage legt Texte meist als Shared Strings ab; die Datumsfelder sind
 * Seriennummern mit Datumsformat. Gelesen wird nur, nichts verändert. Leere Zellen ergeben kein Feld.
 */
import JSZip from 'jszip'
import type { Formalien } from '../model'
import { AUFWUCHS_I, AUFWUCHS_II, AUSSENANLAGEN, BESEITIGUNG_AA, FORMALIEN_MAP, SHEET_PATHS, excelSerialToIso } from './cellMapper'

/** Formalien-Felder, die in der Bau-Excel ausgefüllt sind (Zahl für die Fläche, sonst Text; Datum als ISO). */
export type BauFormalien = Partial<Formalien>

const FORMALIEN_BLATT = 'Formalien'
const FORMALIEN_PFAD_STANDARD = 'xl/worksheets/sheet1.xml'

function entschluessle(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** Alle Texte eines `<si>`/`<is>`-Elements (auch formatierte Abschnitte `<r><t>`), ohne Lautschrift. */
function textVon(xml: string): string {
  const ohnePhonetik = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  return entschluessle([...ohnePhonetik.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
}

export async function sharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await zip.file('xl/sharedStrings.xml')?.async('string')
  if (!xml) return []
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => (m[1] ? textVon(m[1]) : ''))
}

/** Pfad eines Blatts im ZIP über seinen Namen (workbook.xml); `standard`, wenn es nicht gefunden wird. */
export async function blattPfadNachName(zip: JSZip, blattName: string, standard: string): Promise<string> {
  const wb = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!wb || !rels) return standard
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = entschluessle(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '')
    const rid = /\br:id="([^"]*)"/.exec(m[0])?.[1]
    if (name.trim() !== blattName || !rid) continue
    const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels)?.[0]
    const ziel = rel && /\bTarget="([^"]*)"/.exec(rel)?.[1]
    if (ziel) return ziel.startsWith('/') ? ziel.slice(1) : `xl/${ziel}`
  }
  return standard
}

export const formalienBlattPfad = (zip: JSZip) => blattPfadNachName(zip, FORMALIEN_BLATT, FORMALIEN_PFAD_STANDARD)

/** Textwert einer Zelle (Shared String, Inline-String, Formelergebnis, Zahl); null = leer. */
export function zellenWert(blattXml: string, zelle: string, geteilt: string[]): string | null {
  const treffer = new RegExp(`<c\\s[^>]*\\br="${zelle}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(blattXml)
  if (!treffer || treffer[1] === undefined) return null
  const kopf = treffer[0].slice(0, treffer[0].indexOf('>') + 1)
  const art = /\bt="([^"]*)"/.exec(kopf)?.[1] ?? 'n'
  const inhalt = treffer[1]
  let wert: string | null = null
  if (art === 'inlineStr') {
    const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inhalt)
    wert = is ? textVon(is[1]) : null
  } else {
    const v = /<v>([\s\S]*?)<\/v>/.exec(inhalt)?.[1]
    if (v === undefined) return null
    if (art === 's') wert = geteilt[Number(v)] ?? null
    else if (art === 'e') wert = null // Fehlerwert (#NV …)
    else wert = entschluessle(v)
  }
  return wert !== null && wert.trim() !== '' ? wert : null
}

/** „20.10.2026“ oder „2026-10-20“ → ISO; sonst null. */
export function datumAlsIso(text: string): string | null {
  const t = text.trim()
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t)
  if (de) return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

/** Liest die ausgefüllten Formalien-Felder aus einer Bau-Excel (ArrayBuffer/Uint8Array/Blob-Bytes). */
export async function leseBauFormalien(excel: ArrayBuffer | Uint8Array): Promise<BauFormalien> {
  const zip = await JSZip.loadAsync(excel)
  const pfad = await formalienBlattPfad(zip)
  const xml = await zip.file(pfad)?.async('string')
  if (!xml) throw new Error('In der Bau-Excel fehlt das Blatt „Formalien“. Ist das die WEP-Vorlage?')
  const geteilt = await sharedStrings(zip)
  const ergebnis: Record<string, string | number> = {}
  for (const feld of Object.keys(FORMALIEN_MAP) as (keyof Formalien)[]) {
    const def = FORMALIEN_MAP[feld]
    const roh = zellenWert(xml, def.cell, geteilt)
    if (roh === null) continue
    if (def.typ === 'number') {
      const zahl = Number(roh.replace(/\s/g, '').replace(',', '.'))
      if (Number.isFinite(zahl) && zahl > 0) ergebnis[feld] = zahl
    } else if (def.typ === 'datum') {
      const serie = Number(roh)
      const iso = Number.isFinite(serie) && serie > 0 ? excelSerialToIso(serie) : datumAlsIso(roh)
      if (iso) ergebnis[feld] = iso
    } else {
      ergebnis[feld] = roh.trim()
    }
  }
  return ergebnis as BauFormalien
}

/** Wert eines Formalien-Felds in einheitlicher Form zum Vergleichen (Text getrimmt, Datum ISO, Zahl). */
export function vergleichsWert(feld: keyof Formalien, wert: string | number | undefined): string {
  if (wert === undefined || wert === null) return ''
  const typ = FORMALIEN_MAP[feld].typ
  if (typ === 'number') {
    const n = Number(wert)
    return Number.isFinite(n) && n > 0 ? String(n) : ''
  }
  const text = String(wert).replace(/\s+/g, ' ').trim()
  if (typ === 'datum') {
    // Aus der Zelle kommt ein Datum als Seriennummer („46314“)
    const serie = /^\d+(\.\d+)?$/.test(text) ? excelSerialToIso(Number(text)) : null
    return serie ?? datumAlsIso(text) ?? text
  }
  return text
}

// ---------------------------------------------------------------------------
// Grün-Positionen (Außenanlagen, Aufwuchs I/II, Beseitigung Abschnitt 2)
// ---------------------------------------------------------------------------

/** Eine ausgefüllte Zeile von „Außenanlagen“ bzw. „Aufwuchs I/II“ (Spalten A, B, C, K). */
export interface BauGruenPosition {
  anzahl: number
  einheit: string
  bezeichnung: string
  /** 0, wenn in der Bau-Excel kein Einzelpreis steht. */
  einzelpreis: number
}

/** Eine ausgefüllte Zeile von „Beseitigungskosten“ Abschnitt 2 (Spalten B, F, G, H, J). */
export interface BauGruenBeseitigung {
  gegenstand: string
  menge: number
  einheit: string
  einzelpreis: number
  faktor: number
}

export interface BauGruen {
  aussenanlagen: BauGruenPosition[]
  /** Aufwuchs I, danach Aufwuchs II. */
  aufwuchs: BauGruenPosition[]
  beseitigungAA: BauGruenBeseitigung[]
  /** Begründung bei Faktor > 100 % (Zelle F53), wenn ausgefüllt. */
  beseitigungBegruendung?: string
}

function zahlAus(roh: string | null): number | undefined {
  if (roh === null) return undefined
  const n = Number(roh.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function lesePositionen(xml: string | undefined, von: number, bis: number, geteilt: string[]): BauGruenPosition[] {
  if (!xml) return []
  const liste: BauGruenPosition[] = []
  for (let zeile = von; zeile <= bis; zeile++) {
    const text = zellenWert(xml, `C${zeile}`, geteilt)?.replace(/\s+/g, ' ').trim()
    if (!text) continue // Zeile ohne Bezeichnung ist leer (Vorlage: nur Formel in L)
    const anzahl = zahlAus(zellenWert(xml, `A${zeile}`, geteilt))
    const preis = zahlAus(zellenWert(xml, `K${zeile}`, geteilt))
    liste.push({
      anzahl: anzahl !== undefined && anzahl > 0 ? anzahl : 1,
      einheit: zellenWert(xml, `B${zeile}`, geteilt)?.replace(/\s+/g, ' ').trim() || 'Stück',
      bezeichnung: text,
      einzelpreis: preis !== undefined && preis > 0 ? preis : 0,
    })
  }
  return liste
}

/** Liest Außenanlagen, Aufwuchs I/II und Beseitigungskosten (Abschnitt 2) aus einer Bau-Excel. */
export async function leseBauGruen(excel: ArrayBuffer | Uint8Array): Promise<BauGruen> {
  const zip = await JSZip.loadAsync(excel)
  const geteilt = await sharedStrings(zip)
  const blatt = async (name: string, standard: string) => zip.file(await blattPfadNachName(zip, name, standard))?.async('string')
  const [aussen, aufI, aufII, besei] = await Promise.all([
    blatt('Außenanlagen', SHEET_PATHS.aussenanlagen),
    blatt('Aufwuchs I', SHEET_PATHS.aufwuchsI),
    blatt('Aufwuchs II', SHEET_PATHS.aufwuchsII),
    blatt('Beseitigungskosten', SHEET_PATHS.beseitigungskosten),
  ])
  const beseitigungAA: BauGruenBeseitigung[] = []
  if (besei) {
    for (let zeile = BESEITIGUNG_AA.ersteZeile; zeile <= BESEITIGUNG_AA.letzteZeile; zeile++) {
      const gegenstand = zellenWert(besei, `B${zeile}`, geteilt)?.replace(/\s+/g, ' ').trim()
      if (!gegenstand) continue // die Vorlage hat hier nur Menge 1 / Faktor 1 vorbelegt
      const menge = zahlAus(zellenWert(besei, `F${zeile}`, geteilt))
      const faktor = zahlAus(zellenWert(besei, `J${zeile}`, geteilt))
      const preis = zahlAus(zellenWert(besei, `H${zeile}`, geteilt))
      beseitigungAA.push({
        gegenstand,
        menge: menge !== undefined && menge > 0 ? menge : 1,
        einheit: zellenWert(besei, `G${zeile}`, geteilt)?.replace(/\s+/g, ' ').trim() || 'Stück',
        einzelpreis: preis !== undefined && preis > 0 ? preis : 0,
        faktor: faktor !== undefined && faktor > 0 ? faktor : 1,
      })
    }
  }
  const begruendung = besei ? zellenWert(besei, 'F53', geteilt)?.trim() : undefined
  return {
    aussenanlagen: lesePositionen(aussen, AUSSENANLAGEN.ersteZeile, AUSSENANLAGEN.letzteZeile, geteilt),
    aufwuchs: [
      ...lesePositionen(aufI, AUFWUCHS_I.ersteZeile, AUFWUCHS_I.letzteZeile, geteilt),
      ...lesePositionen(aufII, AUFWUCHS_II.ersteZeile, AUFWUCHS_II.letzteZeile, geteilt),
    ],
    beseitigungAA,
    ...(begruendung ? { beseitigungBegruendung: begruendung } : {}),
  }
}

/**
 * Baubeschreibung im Blatt „Baulichkeiten“ (Zeilen 83–99): Eine Zeile steht oft in zwei Teilen (links in B, rechts in E
 * oder F, z. B. „Typ: …“, „Entwässerung: …“, „WC: …“). Die Teile einer Zeile werden mit Abstand verbunden; die Spalten L
 * und rechts davon sind die Ausfüllhilfe der Vorlage und gehören nicht dazu.
 */
export function leseBeschreibung(blattXml: string, geteilt: string[]): string {
  const spalten = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
  const zeilen: string[] = []
  for (let zeile = 83; zeile <= 99; zeile++) {
    const teile = spalten.map((s) => zellenWert(blattXml, `${s}${zeile}`, geteilt)?.replace(/\s+/g, ' ').trim()).filter((t): t is string => !!t)
    zeilen.push(teile.join('   '))
  }
  return zeilen.join('\n').replace(/\n+$/, '')
}
