/**
 * Deckblatt „Deckbl UPV“: Texte der Zellen A31–A40 mit `DECKBLATT_ABSAETZE` überschreiben.
 *
 * Die Texte kommen als neue Einträge in `sharedStrings.xml` (mit Fettdruck als Rich Text), die Zellen zeigen auf
 * sie; die alten Einträge bleiben unberührt (andere Blätter können sie verwenden). Alles andere im Blatt bleibt.
 * `docs/WEP_Vorlage.xlsx` selbst wird nie verändert – der Export arbeitet auf einer Kopie.
 */
import type JSZip from 'jszip'
import { blattPfadNachName } from './bauExcelLesen'
import { DECKBLATT_ABSAETZE, type DeckblattAbsatz } from './deckblattText'
import { xmlEscape } from './xmlPatcher'

export const DECKBLATT_BLATT = 'Deckbl UPV'

/** Zelle → Absätze, die dort stehen (leer = Zelle leeren); optional neue Zeilenhöhe in pt. */
interface Platz {
  zelle: string
  absaetze: number[]
  hoehe?: number
}

/** Zeilen der Vorlage: 31 Titel, 33 Erklärung (fett) mit Mängeln, 34 Momentaufnahme, 36–38 Hinweise, 40 Kontakt. */
export const DECKBLATT_PLAETZE: readonly Platz[] = [
  { zelle: 'A31', absaetze: [0] },
  { zelle: 'A33', absaetze: [1, 2], hoehe: 92 },
  { zelle: 'A34', absaetze: [3], hoehe: 64 },
  { zelle: 'A35', absaetze: [], hoehe: 6 },
  { zelle: 'A36', absaetze: [4] },
  { zelle: 'A37', absaetze: [5] },
  { zelle: 'A38', absaetze: [6] },
  { zelle: 'A40', absaetze: [7] },
]

const RPR = '<sz val="11"/><color theme="1"/><rFont val="Calibri"/><family val="2"/><scheme val="minor"/>'

/** `<si>`-Eintrag aus Absätzen (mit Zeilenumbruch dazwischen); Fettdruck als eigener Lauf. */
function siXml(absaetze: DeckblattAbsatz[]): string {
  const laeufe: { text: string; fett?: boolean }[] = []
  absaetze.forEach((a, i) => {
    if (i) laeufe.push({ text: '\n' })
    laeufe.push(...a)
  })
  const hatFett = laeufe.some((l) => l.fett)
  const t = (s: string) => `<t xml:space="preserve">${xmlEscape(s)}</t>`
  if (!hatFett) return `<si>${t(laeufe.map((l) => l.text).join(''))}</si>`
  return `<si>${laeufe.map((l) => `<r><rPr>${l.fett ? '<b/>' : ''}${RPR}</rPr>${t(l.text)}</r>`).join('')}</si>`
}

/** Indizes in `xl/sharedStrings.xml`: schon vorhandene gleiche Einträge (zweiter Export) werden wiederverwendet, neue hinten angehängt. */
async function haengeGeteilteTexteAn(zip: JSZip, eintraege: string[]): Promise<number[] | undefined> {
  const datei = zip.file('xl/sharedStrings.xml')
  if (!datei) return undefined
  let xml = await datei.async('string')
  const vorhanden: string[] = xml.match(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g) ?? []
  const neu: string[] = []
  const indizes = eintraege.map((e) => {
    const i = vorhanden.indexOf(e)
    if (i >= 0) return i
    neu.push(e)
    return vorhanden.length + neu.length - 1
  })
  if (neu.length) {
    xml = xml.replace('</sst>', `${neu.join('')}</sst>`)
    for (const name of ['count', 'uniqueCount']) {
      xml = xml.replace(new RegExp(`(<sst\\b[^>]*\\b${name}=")(\\d+)(")`), (_m, a: string, n: string, b: string) => `${a}${Number(n) + neu.length}${b}`)
    }
    zip.file('xl/sharedStrings.xml', xml)
  }
  return indizes
}

/** Zelle auf einen geteilten Text (oder leer) setzen; Stil bleibt. */
function setzeZelle(xml: string, zelle: string, index: number | null): string {
  const muster = new RegExp(`<c\\s[^>]*\\br="${zelle}"[^>]*(?<!/)>[\\s\\S]*?</c>|<c\\s[^>]*\\br="${zelle}"[^>]*/>`)
  return xml.replace(muster, (alt) => {
    const stil = /\bs="(\d+)"/.exec(alt)
    const s = stil ? ` s="${stil[1]}"` : ''
    return index === null ? `<c r="${zelle}"${s}/>` : `<c r="${zelle}"${s} t="s"><v>${index}</v></c>`
  })
}

function setzeZeilenhoehe(xml: string, zeile: number, hoehe: number): string {
  return xml.replace(new RegExp(`<row\\b[^>]*\\br="${zeile}"[^>]*>`), (tag) => {
    let neu = /\bht="[^"]*"/.test(tag) ? tag.replace(/\bht="[^"]*"/, `ht="${hoehe}"`) : tag.replace(/>$/, ` ht="${hoehe}">`)
    neu = /\bcustomHeight="[^"]*"/.test(neu) ? neu.replace(/\bcustomHeight="[^"]*"/, 'customHeight="1"') : neu.replace(/>$/, ' customHeight="1">')
    return neu
  })
}

/** Schreibt den Deckblatt-Text ins Blatt „Deckbl UPV“ (wenn es die Datei hat). */
export async function schreibeDeckblattText(zip: JSZip): Promise<void> {
  const pfad = await blattPfadNachName(zip, DECKBLATT_BLATT, 'xl/worksheets/sheet2.xml')
  const blatt = zip.file(pfad)
  if (!blatt) return
  const mitText = DECKBLATT_PLAETZE.filter((p) => p.absaetze.length)
  const indizes = await haengeGeteilteTexteAn(zip, mitText.map((p) => siXml(p.absaetze.map((i) => DECKBLATT_ABSAETZE[i]))))
  if (!indizes) return
  let xml = await blatt.async('string')
  let k = 0
  for (const p of DECKBLATT_PLAETZE) {
    xml = setzeZelle(xml, p.zelle, p.absaetze.length ? indizes[k++] : null)
    if (p.hoehe) xml = setzeZeilenhoehe(xml, Number(p.zelle.slice(1)), p.hoehe)
  }
  zip.file(pfad, xml)
}
