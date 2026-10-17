/**
 * Fügt die Parzellenskizze (PNG) in das Blatt „Skizze Außenanlage-Aufwuchs“ ein.
 *
 * Arbeitet wie der übrige Export direkt auf dem XLSX-Zip:
 * - Bild nach xl/media/ legen
 * - im Drawing des Blatts (drawing9.xml in der Vorlage) einen Bild-Anker
 *   ergänzen; vorhandene Formen (Textfeld der Vorlage) bleiben erhalten
 * - Beziehungen und [Content_Types].xml ergänzen
 *
 * Das Bild wird im umrandeten Zeichenbereich B7:G48 zentriert und unter
 * Beibehaltung des Seitenverhältnisses eingepasst. Ein Bild aus einem
 * früheren App-Export (Name „WEP-App Skizze“) wird vorher entfernt, damit
 * sich beim erneuten Export nichts stapelt.
 */

import type JSZip from 'jszip'

export const SKIZZE_BLATTNAME = 'Skizze Außenanlage-Aufwuchs'
export const SKIZZE_BILDNAME = 'WEP-App Skizze'

const EMU_PRO_PX = 9525
const EMU_PRO_PT = 12700

/** Spaltenbreiten B–G der Vorlage (Zeichen) → EMU (Excel: 1 Zeichen ≈ 7 px). */
const SPALTEN_EMU = [6.42578125, 18.28515625, 27.85546875, 13.85546875, 9.7109375, 11.7109375].map(
  (w) => Math.round(w * 7) * EMU_PRO_PX,
)
/** Zeilenhöhen 7–48 der Vorlage (pt) → EMU. */
const ZEILEN_EMU = [...Array<number>(41).fill(15), 15.75].map((h) => Math.round(h * EMU_PRO_PT))

/** Zeichenbereich B7:G48 (umrandet) in EMU. */
const BEREICH = {
  /** 0-basierte Spalte B */
  col: 1,
  /** 0-basierte Zeile 7 */
  row: 6,
  breite: SPALTEN_EMU.reduce((a, b) => a + b, 0),
  hoehe: ZEILEN_EMU.reduce((a, b) => a + b, 0),
  /** Innenabstand, damit der Rahmen der Vorlage sichtbar bleibt */
  rand: 6 * EMU_PRO_PX,
}

/**
 * Rechnet einen Abstand vom Bereichsanfang in (Zelle, Versatz innerhalb der
 * Zelle) um – Excel erwartet Versätze kleiner als die Zellgröße.
 */
export function zelleUndVersatz(abstand: number, groessen: number[], start: number): [number, number] {
  let rest = abstand
  for (let i = 0; i < groessen.length; i++) {
    if (rest < groessen[i] || i === groessen.length - 1) return [start + i, Math.min(rest, groessen[i])]
    rest -= groessen[i]
  }
  return [start, 0]
}

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL_DRAWING = `${NS_REL}/drawing`
const REL_IMAGE = `${NS_REL}/image`

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Liest Breite/Höhe aus dem IHDR-Block einer PNG-Datei. */
export function pngGroesse(png: Uint8Array): { breite: number; hoehe: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.length < 24 || sig.some((b, i) => png[i] !== b)) {
    throw new Error('Skizze ist keine gültige PNG-Datei')
  }
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { breite: dv.getUint32(16), hoehe: dv.getUint32(20) }
}

/** Passt ein Bild ins Rechteck ein (Seitenverhältnis bleibt) und zentriert es. */
export function einpassen(
  bildBreite: number,
  bildHoehe: number,
  boxBreite: number,
  boxHoehe: number,
): { x: number; y: number; cx: number; cy: number } {
  const faktor = Math.min(boxBreite / bildBreite, boxHoehe / bildHoehe)
  const cx = Math.round(bildBreite * faktor)
  const cy = Math.round(bildHoehe * faktor)
  return { x: Math.round((boxBreite - cx) / 2), y: Math.round((boxHoehe - cy) / 2), cx, cy }
}

function verzeichnis(pfad: string): string {
  return pfad.slice(0, pfad.lastIndexOf('/'))
}

function relsPfad(teilPfad: string): string {
  const i = teilPfad.lastIndexOf('/')
  return `${teilPfad.slice(0, i)}/_rels/${teilPfad.slice(i + 1)}.rels`
}

/** Löst ein relatives Target („../drawings/drawing9.xml“) gegen ein Verzeichnis auf. */
function aufloesen(basisVerzeichnis: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const teile = basisVerzeichnis.split('/').filter(Boolean)
  for (const t of target.split('/')) {
    if (t === '..') teile.pop()
    else if (t !== '.') teile.push(t)
  }
  return teile.join('/')
}

function xmlAttr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m?.[1]
}

function xmlEntschaerfen(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

interface Beziehung {
  id: string
  type: string
  target: string
}

function leseBeziehungen(xml: string): Beziehung[] {
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({
    id: xmlAttr(m[0], 'Id') ?? '',
    type: xmlAttr(m[0], 'Type') ?? '',
    target: xmlAttr(m[0], 'Target') ?? '',
  }))
}

function neueRelId(xml: string): string {
  const ids = [...xml.matchAll(/\bId="rId(\d+)"/g)].map((m) => Number(m[1]))
  return `rId${Math.max(0, ...ids) + 1}`
}

const LEERE_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'

function fuegeBeziehungHinzu(xml: string, type: string, target: string): { xml: string; id: string } {
  const id = neueRelId(xml)
  const eintrag = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`
  return { xml: xml.replace('</Relationships>', `${eintrag}</Relationships>`), id }
}

/** Findet den Pfad des Blatts mit dem angegebenen Namen (über workbook.xml + rels). */
export async function findeBlattPfad(zip: JSZip, blattName: string): Promise<string | undefined> {
  const wb = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!wb || !rels) return undefined
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    if (xmlEntschaerfen(xmlAttr(m[0], 'name') ?? '') !== blattName) continue
    const rid = xmlAttr(m[0], 'r:id')
    const rel = leseBeziehungen(rels).find((r) => r.id === rid)
    return rel ? aufloesen('xl', rel.target) : undefined
  }
  return undefined
}

/** Position des <drawing>-Elements laut Schema-Reihenfolge von CT_Worksheet. */
function fuegeDrawingElementEin(blattXml: string, relId: string): string {
  const element = `<drawing r:id="${relId}"/>`
  const nachfolger = [
    '<legacyDrawing',
    '<legacyDrawingHF',
    '<drawingHF',
    '<picture',
    '<oleObjects',
    '<controls',
    '<webPublishItems',
    '<tableParts',
    '<extLst',
    '</worksheet>',
  ]
  for (const n of nachfolger) {
    const i = blattXml.indexOf(n)
    if (i >= 0) return blattXml.slice(0, i) + element + blattXml.slice(i)
  }
  throw new Error('Blatt-XML ohne </worksheet>')
}

const LEERES_DRAWING =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>'

/** Entfernt Anker, die ein früherer App-Export eingefügt hat. */
function entferneAltesSkizzenbild(drawingXml: string): string {
  return drawingXml.replace(
    /<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b(?:(?!<\/xdr:\1>)[\s\S])*?<\/xdr:\1>/g,
    (anker) => (anker.includes(`name="${SKIZZE_BILDNAME}"`) ? '' : anker),
  )
}

function bildAnker(relId: string, shapeId: number, breite: number, hoehe: number): string {
  const innenB = BEREICH.breite - 2 * BEREICH.rand
  const innenH = BEREICH.hoehe - 2 * BEREICH.rand
  const p = einpassen(breite, hoehe, innenB, innenH)
  const [col, colOff] = zelleUndVersatz(BEREICH.rand + p.x, SPALTEN_EMU, BEREICH.col)
  const [row, rowOff] = zelleUndVersatz(BEREICH.rand + p.y, ZEILEN_EMU, BEREICH.row)
  return (
    '<xdr:oneCellAnchor>' +
    `<xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff>` +
    `<xdr:row>${row}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${p.cx}" cy="${p.cy}"/>` +
    '<xdr:pic>' +
    `<xdr:nvPicPr><xdr:cNvPr id="${shapeId}" name="${SKIZZE_BILDNAME}" descr="Parzellenskizze"/>` +
    '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    `<xdr:blipFill><a:blip xmlns:r="${NS_REL}" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${p.cx}" cy="${p.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>'
  )
}

// ---------------------------------------------------------------------------
// Öffentliche Funktion
// ---------------------------------------------------------------------------

/**
 * Fügt das PNG in das Skizzen-Blatt ein. Gibt false zurück, wenn das Blatt in
 * der Datei nicht existiert (dann bleibt die Datei unverändert).
 */
export async function fuegeSkizzeEin(zip: JSZip, png: Uint8Array): Promise<boolean> {
  const { breite, hoehe } = pngGroesse(png)
  const blattPfad = await findeBlattPfad(zip, SKIZZE_BLATTNAME)
  const blattDatei = blattPfad ? zip.file(blattPfad) : null
  if (!blattPfad || !blattDatei) return false

  // 1. Drawing des Blatts finden oder anlegen
  const blattRelsPfad = relsPfad(blattPfad)
  let blattRels = (await zip.file(blattRelsPfad)?.async('string')) ?? LEERE_RELS
  let blattXml = await blattDatei.async('string')
  let drawingPfad: string
  const drawingRef = /<drawing\b[^>]*>/.exec(blattXml)
  const drawingRel = drawingRef
    ? leseBeziehungen(blattRels).find((r) => r.id === xmlAttr(drawingRef[0], 'r:id'))
    : undefined

  if (drawingRel) {
    drawingPfad = aufloesen(verzeichnis(blattPfad), drawingRel.target)
  } else {
    let n = 1
    while (zip.file(`xl/drawings/drawing${n}.xml`)) n++
    drawingPfad = `xl/drawings/drawing${n}.xml`
    zip.file(drawingPfad, LEERES_DRAWING)
    const neu = fuegeBeziehungHinzu(blattRels, REL_DRAWING, `../drawings/drawing${n}.xml`)
    blattRels = neu.xml
    blattXml = fuegeDrawingElementEin(blattXml, neu.id)
    zip.file(blattRelsPfad, blattRels)
    zip.file(blattPfad, blattXml)
    await ergaenzeContentType(
      zip,
      `<Override PartName="/${drawingPfad}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    )
  }

  // 2. Bild ablegen
  let m = 1
  while (zip.file(`xl/media/wep-skizze${m}.png`)) m++
  const mediaName = `wep-skizze${m}.png`
  zip.file(`xl/media/${mediaName}`, png)
  await ergaenzeContentType(zip, '<Default Extension="png" ContentType="image/png"/>')

  // 3. Beziehung Drawing → Bild
  const drawingRelsPfad = relsPfad(drawingPfad)
  const drawingRels = (await zip.file(drawingRelsPfad)?.async('string')) ?? LEERE_RELS
  const bildRel = fuegeBeziehungHinzu(drawingRels, REL_IMAGE, `../media/${mediaName}`)
  zip.file(drawingRelsPfad, bildRel.xml)

  // 4. Anker ins Drawing (alte App-Skizze vorher entfernen)
  let drawingXml = entferneAltesSkizzenbild(
    (await zip.file(drawingPfad)?.async('string')) ?? LEERES_DRAWING,
  )
  const shapeIds = [...drawingXml.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((x) => Number(x[1]))
  const anker = bildAnker(bildRel.id, Math.max(1, ...shapeIds) + 1, breite, hoehe)
  drawingXml = drawingXml.replace('</xdr:wsDr>', `${anker}</xdr:wsDr>`)
  zip.file(drawingPfad, drawingXml)

  return true
}

async function ergaenzeContentType(zip: JSZip, eintrag: string): Promise<void> {
  const pfad = '[Content_Types].xml'
  const xml = await zip.file(pfad)?.async('string')
  if (!xml) return
  const schluessel = eintrag.startsWith('<Default')
    ? /Extension="([^"]+)"/.exec(eintrag)![0]
    : /PartName="([^"]+)"/.exec(eintrag)![0]
  if (new RegExp(schluessel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i').test(xml)) return
  zip.file(pfad, xml.replace('</Types>', `${eintrag}</Types>`))
}
