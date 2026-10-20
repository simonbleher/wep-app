/**
 * Liest die Formalien (Blatt „Formalien“, Zellen E3–E17) aus einer Bau-Excel.
 *
 * Das Blatt „Formalien“ der Vorlage legt Texte meist als Shared Strings ab; die Datumsfelder sind
 * Seriennummern mit Datumsformat. Gelesen wird nur, nichts verändert. Leere Zellen ergeben kein Feld.
 */
import JSZip from 'jszip'
import type { Formalien } from '../model'
import { FORMALIEN_MAP, excelSerialToIso } from './cellMapper'

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
function datumAlsIso(text: string): string | null {
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
  if (typ === 'datum') return datumAlsIso(text) ?? text
  return text
}
