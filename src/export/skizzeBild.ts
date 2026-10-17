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
 *
 * Bau-Excel: Der Bau-Wertermittler kopiert seine Skizze oft schon als
 * Excel-Formen in dieses Blatt. Dann darf das PNG sie nicht verdecken –
 * `skizzeBlattHatFormen` erkennt das, und die App rendert das PNG mit
 * transparentem Hintergrund und ohne Raster.
 */

import JSZip from 'jszip'

export const SKIZZE_BLATTNAME = 'Skizze Außenanlage-Aufwuchs'
export const SKIZZE_BILDNAME = 'WEP-App Skizze'
/** Marker (`descr`) aller Formen, die die App selbst ins Drawing schreibt. */
export const WEP_APP_MARKER = 'wep-app'

/** Regex für einen Anker (oneCell/twoCell/absolute) im Drawing. */
export const ANKER_REGEX = /<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b(?:(?!<\/xdr:\1>)[\s\S])*?<\/xdr:\1>/g

/** true, wenn der Anker von der App stammt (Formen mit descr="wep-app" oder das alte PNG). */
export function istEigenerAnker(anker: string): boolean {
  return (
    anker.includes(`name="${SKIZZE_BILDNAME}"`) ||
    new RegExp(`<xdr:cNvPr\\b[^>]*\\sdescr="${WEP_APP_MARKER}"`).test(anker)
  )
}

export const EMU_PRO_PX = 9525
export const EMU_PRO_PT = 12700

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

export const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const REL_DRAWING = `${NS_REL}/drawing`
export const REL_IMAGE = `${NS_REL}/image`

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

export function verzeichnis(pfad: string): string {
  return pfad.slice(0, pfad.lastIndexOf('/'))
}

export function relsPfad(teilPfad: string): string {
  const i = teilPfad.lastIndexOf('/')
  return `${teilPfad.slice(0, i)}/_rels/${teilPfad.slice(i + 1)}.rels`
}

/** Löst ein relatives Target („../drawings/drawing9.xml“) gegen ein Verzeichnis auf. */
export function aufloesen(basisVerzeichnis: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const teile = basisVerzeichnis.split('/').filter(Boolean)
  for (const t of target.split('/')) {
    if (t === '..') teile.pop()
    else if (t !== '.') teile.push(t)
  }
  return teile.join('/')
}

export function xmlAttr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m?.[1]
}

export function xmlEntschaerfen(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export interface Beziehung {
  id: string
  type: string
  target: string
}

export function leseBeziehungen(xml: string): Beziehung[] {
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({
    id: xmlAttr(m[0], 'Id') ?? '',
    type: xmlAttr(m[0], 'Type') ?? '',
    target: xmlAttr(m[0], 'Target') ?? '',
  }))
}

export function neueRelId(xml: string): string {
  const ids = [...xml.matchAll(/\bId="rId(\d+)"/g)].map((m) => Number(m[1]))
  return `rId${Math.max(0, ...ids) + 1}`
}

export const LEERE_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'

export function fuegeBeziehungHinzu(xml: string, type: string, target: string): { xml: string; id: string } {
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
export function fuegeDrawingElementEin(blattXml: string, relId: string): string {
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

export const LEERES_DRAWING =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>'

/**
 * Entfernt alle eigenen Formen der App (altes PNG, Formen mit descr="wep-app") aus dem
 * Drawing – samt ihren Bilddateien. Fremde Formen bleiben unberührt. Gibt die Anzahl zurück.
 */
export async function entferneEigeneFormen(zip: JSZip, drawingPfad: string): Promise<number> {
  const drawingXml = (await zip.file(drawingPfad)?.async('string')) ?? LEERES_DRAWING
  const relsDatei = relsPfad(drawingPfad)
  let rels = await zip.file(relsDatei)?.async('string')
  const freigegeben = new Set<string>()
  let entfernt = 0
  const neu = drawingXml.replace(ANKER_REGEX, (anker) => {
    if (!anker.includes(`descr="${WEP_APP_MARKER}"`) && !anker.includes('name="WEP-App Skizze"')) return anker
    entfernt++
    for (const m of anker.matchAll(/r:embed="([^"]+)"/g)) freigegeben.add(m[1])
    return ''
  })
  if (entfernt === 0) return 0

  // Bilder dieser Formen aufräumen: Beziehung entfernen und – nur bei App-Dateien – die Datei löschen
  if (rels && freigegeben.size) {
    const verbleibend = new Set([...neu.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]))
    for (const b of leseBeziehungen(rels)) {
      if (!freigegeben.has(b.id) || verbleibend.has(b.id)) continue
      rels = rels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${b.id}"[^>]*/>`), '')
      const datei = b.target.replace(/^\.\.\//, 'xl/')
      if (/\/wep-skizze[^/]*$/.test(datei)) zip.remove(datei)
    }
    zip.file(relsDatei, rels)
  }
  zip.file(drawingPfad, neu)
  return entfernt
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

/**
 * Findet das Drawing eines Blatts (über <drawing r:id> und die Blatt-Beziehungen)
 * oder legt ein leeres an und verknüpft es (Beziehung, <drawing>-Element,
 * Content-Type). Gibt den Pfad im ZIP zurück.
 */
export async function findeOderLegeDrawingAn(zip: JSZip, blattPfad: string): Promise<string | undefined> {
  const blattDatei = zip.file(blattPfad)
  if (!blattDatei) return undefined
  const blattRelsPfad = relsPfad(blattPfad)
  let blattRels = (await zip.file(blattRelsPfad)?.async('string')) ?? LEERE_RELS
  let blattXml = await blattDatei.async('string')
  const drawingRef = /<drawing\b[^>]*>/.exec(blattXml)
  const drawingRel = drawingRef
    ? leseBeziehungen(blattRels).find((r) => r.id === xmlAttr(drawingRef[0], 'r:id'))
    : undefined
  if (drawingRel) return aufloesen(verzeichnis(blattPfad), drawingRel.target)

  let n = 1
  while (zip.file(`xl/drawings/drawing${n}.xml`)) n++
  const drawingPfad = `xl/drawings/drawing${n}.xml`
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
  return drawingPfad
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
  const drawingPfad = (await findeOderLegeDrawingAn(zip, blattPfad))!

  // 1b. Eigene Formen/PNG eines früheren Exports entfernen
  await entferneEigeneFormen(zip, drawingPfad)

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
  let drawingXml = (await zip.file(drawingPfad)?.async('string')) ?? LEERES_DRAWING
  const shapeIds = [...drawingXml.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((x) => Number(x[1]))
  const anker = bildAnker(bildRel.id, Math.max(1, ...shapeIds) + 1, breite, hoehe)
  drawingXml = drawingXml.replace('</xdr:wsDr>', `${anker}</xdr:wsDr>`)
  zip.file(drawingPfad, drawingXml)

  return true
}

/** Leeres Textfeld der Vorlage („Textfeld 1/2“, „TextBox 8“ …) ohne sichtbaren Text. */
function istLeeresTextfeld(anker: string): boolean {
  if (!/<xdr:cNvSpPr\b[^>]*\btxBox="1"/.test(anker)) return false
  const texte = [...anker.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => m[1].trim())
  return texte.every((t) => t === '')
}

/**
 * Zählt die Formen im Drawing, die weder ein früheres App-Bild noch ein leeres
 * Textfeld der Vorlage sind – also z. B. die kopierte Bau-Skizze.
 */
export function zaehleFremdeFormen(drawingXml: string): number {
  let n = 0
  for (const m of drawingXml.matchAll(
    /<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b(?:(?!<\/xdr:\1>)[\s\S])*?<\/xdr:\1>/g,
  )) {
    const anker = m[0]
    if (istEigenerAnker(anker) || istLeeresTextfeld(anker)) continue
    n++
  }
  return n
}

/**
 * true, wenn das Blatt „Skizze Außenanlage-Aufwuchs“ schon eigene Formen hat
 * (außer den leeren Textfeldern der Vorlage). Dann muss das Skizzen-PNG
 * transparent und ohne Raster sein, damit es nichts verdeckt.
 */
export async function skizzeBlattHatFormen(quelle: JSZip | ArrayBuffer | Uint8Array): Promise<boolean> {
  const zip = quelle instanceof ArrayBuffer || quelle instanceof Uint8Array ? await JSZip.loadAsync(quelle) : quelle
  const blattPfad = await findeBlattPfad(zip, SKIZZE_BLATTNAME)
  const blattXml = blattPfad ? await zip.file(blattPfad)?.async('string') : undefined
  if (!blattPfad || !blattXml) return false
  const drawingRef = /<drawing\b[^>]*>/.exec(blattXml)
  if (!drawingRef) return false
  const rels = (await zip.file(relsPfad(blattPfad))?.async('string')) ?? LEERE_RELS
  const rel = leseBeziehungen(rels).find((r) => r.id === xmlAttr(drawingRef[0], 'r:id'))
  if (!rel) return false
  const drawingXml = await zip.file(aufloesen(verzeichnis(blattPfad), rel.target))?.async('string')
  return drawingXml ? zaehleFremdeFormen(drawingXml) > 0 : false
}

export async function ergaenzeContentType(zip: JSZip, eintrag: string): Promise<void> {
  const pfad = '[Content_Types].xml'
  const xml = await zip.file(pfad)?.async('string')
  if (!xml) return
  const schluessel = eintrag.startsWith('<Default')
    ? /Extension="([^"]+)"/.exec(eintrag)![0]
    : /PartName="([^"]+)"/.exec(eintrag)![0]
  if (new RegExp(schluessel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i').test(xml)) return
  zip.file(pfad, xml.replace('</Types>', `${eintrag}</Types>`))
}
