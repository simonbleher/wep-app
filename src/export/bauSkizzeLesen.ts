/**
 * Liest die Formen aus dem Blatt „Skizze Bau“ einer Bau-Excel (Beta 5, Paket 1).
 *
 * Nur lesend: Position und Größe (aus dem Anker, in EMU ab Blattecke), Typ, Text und Linienart der
 * DrawingML-Formen. Daraus macht `src/skizze/grundlage.ts` die Grundlage der Grün-Skizze. Bilder und Formen,
 * die sich nicht umrechnen lassen, werden gezählt und als Hinweis gemeldet (nichts bricht ab).
 *
 * Wie der übrige Export arbeitet der Leser mit Regex statt DOMParser, damit er auch in Node-Tests läuft.
 */
import JSZip from 'jszip'
import {
  ANKER_REGEX,
  EMU_PRO_PT,
  WEP_APP_MARKER,
  aufloesen,
  findeBlattPfad,
  leseBeziehungen,
  relsPfad,
  verzeichnis,
  xmlAttr,
  xmlEntschaerfen,
} from './skizzeBild'
import { leseBlattGeometrie, zeichenbereichVon, type BlattGeometrie, type Kasten, type Punkt } from './skizzeFormen'

export const BAU_SKIZZE_BLATTNAME = 'Skizze Bau'

export type BauFormArt = 'vieleck' | 'linie' | 'text' | 'bild'

/** Eine Form aus der Bau-Excel, in EMU ab Blattecke. */
export interface BauSkizzeForm {
  art: BauFormArt
  name: string
  /** Von uns (App) geschrieben (`descr="wep-app"`). */
  eigen: boolean
  /** Umgebender Kasten. */
  kasten: Kasten
  /** vieleck: Eckpunkte (Rechteck = 4 Punkte, im Uhrzeigersinn). */
  punkte?: Punkt[]
  /** linie: Anfang und Ende. */
  von?: Punkt
  nach?: Punkt
  text?: string
  gestrichelt?: boolean
  /** Form ist gefüllt (sonst nur Rahmen). */
  gefuellt?: boolean
  /** Form hat einen sichtbaren Rahmen. */
  rahmen?: boolean
  /** Ursprüngliche Formart, wenn sie nur angenähert wurde (z. B. „triangle“ als Rechteck). */
  angenaehert?: string
  /** Füllfarbe (`#RRGGBB`), falls als feste Farbe gesetzt (Designfarben aus dem Thema werden nicht aufgelöst). */
  fuellungFarbe?: string
  /** Linienfarbe (`#RRGGBB`), falls als feste Farbe gesetzt. */
  linieFarbe?: string
  /** linie: Pfeilspitze am Ende `nach` (Anfang und Ende sind dafür ggf. vertauscht). */
  pfeil?: boolean
  /** text: Drehung in Grad im Uhrzeigersinn (0 < d < 360), fehlt = waagerecht. */
  drehung?: number
}

export interface BauSkizzeLesen {
  /** Das Blatt „Skizze Bau“ gibt es in der Datei. */
  blattVorhanden: boolean
  formen: BauSkizzeForm[]
  /** Zeichenbereich B7:G48 des Blatts (EMU) – Bezugsrahmen der Umrechnung. */
  bereich: Kasten
  hinweise: string[]
}

const RAD = Math.PI / 180

/** Standard-Zeichenbereich, wenn das Blatt fehlt (Vorlage, Spaltenbreiten/Zeilenhöhen wie in der Vorlage). */
const LEERER_BEREICH: Kasten = { x: 0, y: 0, w: 0, h: 0 }

function zahl(tag: string, name: string): number {
  const v = Number(xmlAttr(tag, name))
  return Number.isFinite(v) ? v : 0
}

/** `mc:AlternateContent` durch den Inhalt von `mc:Choice` ersetzen (neuere Excel-Formen). */
function ohneAlternativen(xml: string): string {
  return xml.replace(
    /<mc:AlternateContent\b[^>]*>\s*<mc:Choice\b[^>]*>([\s\S]*?)<\/mc:Choice>(?:\s*<mc:Fallback>[\s\S]*?<\/mc:Fallback>)?\s*<\/mc:AlternateContent>/g,
    '$1',
  )
}

/** Anker → Kasten in EMU ab Blattecke. */
function ankerKasten(anker: string, geo: BlattGeometrie): Kasten | undefined {
  const punktAus = (teil: string): Punkt | undefined => {
    const m = new RegExp(`<xdr:${teil}>([\\s\\S]*?)</xdr:${teil}>`).exec(anker)
    if (!m) return undefined
    const wert = (n: string) => Number(new RegExp(`<xdr:${n}>(-?\\d+)</xdr:${n}>`).exec(m[1])?.[1] ?? 0)
    return { x: geo.spalteStart(wert('col')) + wert('colOff'), y: geo.zeileStart(wert('row')) + wert('rowOff') }
  }
  const art = /<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b/.exec(anker)?.[1]
  if (art === 'twoCellAnchor') {
    const a = punktAus('from')
    const b = punktAus('to')
    if (!a || !b) return undefined
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
  }
  const ext = /<xdr:ext\b[^>]*>/.exec(anker)?.[0]
  if (!ext) return undefined
  const w = zahl(ext, 'cx')
  const h = zahl(ext, 'cy')
  if (art === 'oneCellAnchor') {
    const a = punktAus('from')
    return a ? { x: a.x, y: a.y, w, h } : undefined
  }
  const pos = /<xdr:pos\b[^>]*>/.exec(anker)?.[0]
  return pos ? { x: zahl(pos, 'x'), y: zahl(pos, 'y'), w, h } : undefined
}

/** Der Teil einer Form im Zeichnungs-XML, den wir auswerten. */
interface RohForm {
  tag: 'sp' | 'cxnSp' | 'pic'
  xml: string
  kasten: Kasten
}

/** Zerlegt einen Anker in seine Formen; Gruppen werden aufgelöst (Kinder in die Ankerfläche umgerechnet). */
function formenImAnker(anker: string, kasten: Kasten): RohForm[] {
  const gruppe = /<xdr:grpSp>([\s\S]*)<\/xdr:grpSp>/.exec(anker)
  if (!gruppe) {
    const t = /<xdr:(sp|cxnSp|pic)\b/.exec(anker)?.[1] as RohForm['tag'] | undefined
    return t ? [{ tag: t, xml: anker, kasten }] : []
  }
  const kopf = /<xdr:grpSpPr>([\s\S]*?)<\/xdr:grpSpPr>/.exec(gruppe[1])?.[1] ?? ''
  const wert = (tag: string, a: string) => zahl(new RegExp(`<a:${tag}\\b[^>]*>`).exec(kopf)?.[0] ?? '', a)
  const chW = wert('chExt', 'cx') || kasten.w || 1
  const chH = wert('chExt', 'cy') || kasten.h || 1
  const chX = wert('chOff', 'x')
  const chY = wert('chOff', 'y')
  const innen = gruppe[1].slice(kopf ? gruppe[1].indexOf('</xdr:grpSpPr>') + '</xdr:grpSpPr>'.length : 0)
  const out: RohForm[] = []
  for (const m of innen.matchAll(/<xdr:(sp|cxnSp|pic)\b[\s\S]*?<\/xdr:\1>/g)) {
    const xfrm = /<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(m[0])?.[1] ?? /<xdr:xfrm\b[^>]*>([\s\S]*?)<\/xdr:xfrm>/.exec(m[0])?.[1]
    if (!xfrm) continue
    const off = /<a:off\b[^>]*>/.exec(xfrm)?.[0] ?? ''
    const ext = /<a:ext\b[^>]*>/.exec(xfrm)?.[0] ?? ''
    out.push({
      tag: m[1] as RohForm['tag'],
      xml: m[0],
      kasten: {
        x: kasten.x + ((zahl(off, 'x') - chX) * kasten.w) / chW,
        y: kasten.y + ((zahl(off, 'y') - chY) * kasten.h) / chH,
        w: (zahl(ext, 'cx') * kasten.w) / chW,
        h: (zahl(ext, 'cy') * kasten.h) / chH,
      },
    })
  }
  return out
}

function textVonForm(xml: string): string {
  const koerper = /<xdr:txBody>([\s\S]*?)<\/xdr:txBody>/.exec(xml)?.[1]
  if (!koerper) return ''
  const absaetze = [...koerper.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map((p) =>
    [...p[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => xmlEntschaerfen(t[1])).join(''),
  )
  return absaetze.join('\n').replace(/^\n+|\n+$/g, '').trim()
}

/** Rechteck-Eckpunkte, ggf. gedreht um die Mitte (Winkel in Grad). */
function rechteckPunkte(k: Kasten, grad: number): Punkt[] {
  const ecken: Punkt[] = [
    { x: k.x, y: k.y },
    { x: k.x + k.w, y: k.y },
    { x: k.x + k.w, y: k.y + k.h },
    { x: k.x, y: k.y + k.h },
  ]
  if (!grad) return ecken
  const cx = k.x + k.w / 2
  const cy = k.y + k.h / 2
  const c = Math.cos(grad * RAD)
  const s = Math.sin(grad * RAD)
  return ecken.map((p) => ({ x: Math.round(cx + (p.x - cx) * c - (p.y - cy) * s), y: Math.round(cy + (p.x - cx) * s + (p.y - cy) * c) }))
}

function ellipsePunkte(k: Kasten, grad: number): Punkt[] {
  const cx = k.x + k.w / 2
  const cy = k.y + k.h / 2
  const c = Math.cos(grad * RAD)
  const s = Math.sin(grad * RAD)
  return Array.from({ length: 24 }, (_, i) => {
    const w = (i / 24) * 2 * Math.PI
    const px = (Math.cos(w) * k.w) / 2
    const py = (Math.sin(w) * k.h) / 2
    return { x: Math.round(cx + px * c - py * s), y: Math.round(cy + px * s + py * c) }
  })
}

/** Freiform (`custGeom`): Linienzüge des ersten Pfads, in den Kasten skaliert; null = nicht als Vieleck lesbar. */
function freiformPunkte(xml: string, k: Kasten, grad: number): Punkt[] | null {
  const pfad = /<a:path\b([^>]*)>([\s\S]*?)<\/a:path>/.exec(xml)
  if (!pfad) return null
  const pw = zahl(pfad[1], 'w') || k.w
  const ph = zahl(pfad[1], 'h') || k.h
  const punkte: Punkt[] = []
  for (const m of pfad[2].matchAll(/<a:(moveTo|lnTo|cubicBezTo|quadBezTo)>([\s\S]*?)<\/a:\1>/g)) {
    const pts = [...m[2].matchAll(/<a:pt\b[^>]*>/g)].map((p) => ({ x: zahl(p[0], 'x'), y: zahl(p[0], 'y') }))
    const letzter = pts[pts.length - 1]
    if (letzter) punkte.push(letzter)
  }
  if (punkte.length < 3) return null
  const skaliert = punkte.map((p) => ({ x: k.x + (p.x / (pw || 1)) * k.w, y: k.y + (p.y / (ph || 1)) * k.h }))
  if (!grad) return skaliert.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
  const cx = k.x + k.w / 2
  const cy = k.y + k.h / 2
  const c = Math.cos(grad * RAD)
  const s = Math.sin(grad * RAD)
  return skaliert.map((p) => ({ x: Math.round(cx + (p.x - cx) * c - (p.y - cy) * s), y: Math.round(cy + (p.x - cx) * s + (p.y - cy) * c) }))
}

/** Feste RGB-Farbe aus einem Füll-/Linien-Block (`<a:solidFill><a:srgbClr val="C00000"/>`), sonst undefined. */
function festeFarbe(block: string): string | undefined {
  const m = /<a:solidFill>\s*<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/.exec(block)
  return m ? `#${m[1].toUpperCase()}` : undefined
}

/** Zeigt die Linie an diesem Ende (`headEnd` = Anfang, `tailEnd` = Ende) eine Pfeilspitze? */
function hatPfeilspitze(lnInhalt: string, ende: 'headEnd' | 'tailEnd'): boolean {
  const t = new RegExp(`<a:${ende}\\b[^>]*\\btype="([^"]+)"`).exec(lnInhalt)?.[1]
  return Boolean(t && t !== 'none')
}

const LINIEN_PRST = /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/
const RECHTECK_PRST = /^(rect|roundRect|round1Rect|round2SameRect|snip\w*|flowChartProcess|flowChartAlternateProcess|plaque|frame)$/

/**
 * Drehung eines Textfelds in Grad (Uhrzeigersinn): Drehung der Form (`xfrm rot`) plus Textrichtung des Textkörpers
 * (`bodyPr rot` und `vert`, z. B. „vert270“ = von unten nach oben). 0 = waagerecht.
 */
export function textDrehung(xml: string, formGrad: number): number {
  const body = /<a:bodyPr\b([^>]*)>/.exec(xml)?.[1] ?? ''
  const bodyGrad = (zahl(body, 'rot') / 60000) % 360
  const vert = xmlAttr(body, 'vert')
  const vertGrad = vert === 'vert' || vert === 'eaVert' ? 90 : vert === 'vert270' ? 270 : 0
  const summe = (((formGrad + bodyGrad + vertGrad) % 360) + 360) % 360
  return Math.round(summe * 10) / 10
}

/** Eine Roh-Form → Bau-Form (null = leer/ohne Bedeutung). */
function wertAus(roh: RohForm): BauSkizzeForm | null {
  const { xml, kasten } = roh
  const kopf = /<xdr:cNvPr\b[^>]*>/.exec(xml)?.[0] ?? ''
  const name = xmlEntschaerfen(xmlAttr(kopf, 'name') ?? '')
  const eigen = xmlAttr(kopf, 'descr') === WEP_APP_MARKER
  const grund = { name, eigen, kasten: { ...kasten } }
  if (roh.tag === 'pic') return { ...grund, art: 'bild' }

  const xfrm = /<a:xfrm\b([^>]*)>/.exec(xml)?.[1] ?? ''
  const grad = (zahl(xfrm, 'rot') / 60000) % 360
  const spPr = /<xdr:spPr\b[^>]*>([\s\S]*?)<\/xdr:spPr>/.exec(xml)?.[1] ?? ''
  const ln = /<a:ln\b[^>]*\/>|<a:ln\b[^>]*>([\s\S]*?)<\/a:ln>/.exec(spPr)
  const ohneLn = ln ? spPr.replace(ln[0], '') : spPr
  const stil = /<xdr:style>([\s\S]*?)<\/xdr:style>/.exec(xml)?.[1] ?? ''
  const stilIdx = (n: string) => Number(new RegExp(`<a:${n}\\s+idx="(\\d+)"`).exec(stil)?.[1] ?? 0)
  const gefuellt = /<a:noFill\s*\/>/.test(ohneLn) ? false : /<a:(solidFill|gradFill|pattFill|blipFill)\b/.test(ohneLn) ? true : stilIdx('fillRef') > 0
  const lnInhalt = ln?.[1] ?? ''
  const rahmen = /^\s*<a:noFill\s*\/>/.test(lnInhalt) ? false : lnInhalt.trim() !== '' ? true : stilIdx('lnRef') > 0
  const dash = /<a:prstDash\s+val="([^"]+)"/.exec(lnInhalt)?.[1]
  const gestrichelt = Boolean(dash && dash !== 'solid')
  const text = textVonForm(xml)
  const fuellungFarbe = gefuellt ? festeFarbe(ohneLn) : undefined
  const linieFarbe = rahmen ? festeFarbe(lnInhalt) : undefined
  const farben = { ...(fuellungFarbe ? { fuellungFarbe } : {}), ...(linieFarbe ? { linieFarbe } : {}) }

  const prst = /<a:prstGeom\s+prst="([^"]+)"/.exec(xml)?.[1] ?? ''
  const istTextfeld = /<xdr:cNvSpPr\b[^>]*\btxBox="1"/.test(xml)

  if (roh.tag === 'cxnSp' || LINIEN_PRST.test(prst)) {
    const flipH = /\bflipH="1"/.test(xfrm)
    const flipV = /\bflipV="1"/.test(xfrm)
    const a: Punkt = { x: kasten.x + (flipH ? kasten.w : 0), y: kasten.y + (flipV ? kasten.h : 0) }
    const b: Punkt = { x: kasten.x + (flipH ? 0 : kasten.w), y: kasten.y + (flipV ? 0 : kasten.h) }
    // Pfeilspitze nur am Anfang: Anfang und Ende tauschen, damit sie am Ende `nach` sitzt
    const pfeilAmEnde = hatPfeilspitze(lnInhalt, 'tailEnd')
    const pfeilAmAnfang = hatPfeilspitze(lnInhalt, 'headEnd')
    const tausch = pfeilAmAnfang && !pfeilAmEnde
    return {
      ...grund,
      art: 'linie',
      von: tausch ? b : a,
      nach: tausch ? a : b,
      gestrichelt,
      rahmen: true,
      ...(pfeilAmEnde || pfeilAmAnfang ? { pfeil: true } : {}),
      ...(linieFarbe ? { linieFarbe } : {}),
      ...(text ? { text } : {}),
    }
  }

  // Textfeld (oder Form ohne Füllung und Rahmen): nur der Text zählt
  if (istTextfeld || (!gefuellt && !rahmen)) {
    const drehung = textDrehung(xml, grad)
    return text ? { ...grund, art: 'text', text, gefuellt: false, rahmen: false, ...(drehung ? { drehung } : {}) } : null
  }

  const gemeinsam = { ...grund, text, gestrichelt, gefuellt, rahmen, ...farben }
  if (/<a:custGeom\b/.test(xml)) {
    const punkte = freiformPunkte(xml, kasten, grad)
    if (punkte) return { ...gemeinsam, art: 'vieleck', punkte }
    return { ...gemeinsam, art: 'vieleck', punkte: rechteckPunkte(kasten, grad), angenaehert: 'Freiform' }
  }
  if (prst === 'ellipse') return { ...gemeinsam, art: 'vieleck', punkte: ellipsePunkte(kasten, grad) }
  if (prst === '' || RECHTECK_PRST.test(prst)) return { ...gemeinsam, art: 'vieleck', punkte: rechteckPunkte(kasten, grad) }
  return { ...gemeinsam, art: 'vieleck', punkte: rechteckPunkte(kasten, grad), angenaehert: prst }
}

/** Liest die Formen von „Skizze Bau“. Ohne das Blatt oder ohne Zeichnung: leere Liste. */
export async function leseBauSkizze(excel: ArrayBuffer | Uint8Array): Promise<BauSkizzeLesen> {
  const zip = await JSZip.loadAsync(excel)
  const blattPfad = await findeBlattPfad(zip, BAU_SKIZZE_BLATTNAME)
  const blattXml = blattPfad ? await zip.file(blattPfad)?.async('string') : undefined
  if (!blattPfad || !blattXml) return { blattVorhanden: false, formen: [], bereich: LEERER_BEREICH, hinweise: [] }

  const geo = leseBlattGeometrie(blattXml)
  const bereich = zeichenbereichVon(geo)
  const rels = (await zip.file(relsPfad(blattPfad))?.async('string')) ?? ''
  const ref = /<drawing\b[^>]*>/.exec(blattXml)
  const rel = ref ? leseBeziehungen(rels).find((r) => r.id === xmlAttr(ref[0], 'r:id')) : undefined
  const drawingXml = rel ? await zip.file(aufloesen(verzeichnis(blattPfad), rel.target))?.async('string') : undefined
  if (!drawingXml) return { blattVorhanden: true, formen: [], bereich, hinweise: [] }

  const formen: BauSkizzeForm[] = []
  for (const m of ohneAlternativen(drawingXml).matchAll(new RegExp(ANKER_REGEX.source, 'g'))) {
    const kasten = ankerKasten(m[0], geo)
    if (!kasten) continue
    for (const roh of formenImAnker(m[0], kasten)) {
      const form = wertAus(roh)
      if (form) formen.push(form)
    }
  }
  return { blattVorhanden: true, formen, bereich, hinweise: [] }
}

/** Länge in Punkt (Excel) – für Größenvergleiche. */
export const emuZuPt = (emu: number): number => emu / EMU_PRO_PT
