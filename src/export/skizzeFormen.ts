/**
 * Schreibt die Grün-Skizze als native, bearbeitbare Excel-Formen ins Blatt
 * „Skizze Außenanlage-Aufwuchs“ (statt als PNG).
 *
 * Arbeitet wie der übrige Export direkt auf dem XLSX-Zip (JSZip):
 * - `FormElement` → DrawingML (`xdr:sp`, `xdr:cxnSp`, `xdr:pic` mit SVG + PNG-Fallback)
 * - die Formen werden an das vorhandene Drawing angehängt; fremde Formen
 *   (kopierte Bau-Skizze, Textfelder der Vorlage) bleiben byte-gleich
 * - alle eigenen Formen tragen `descr="wep-app"`; ein erneuter Export ersetzt nur
 *   diese (samt ihrer Bilddateien), nie fremde
 *
 * Stil nach Skill `docs/skills/parzellen-skizze.md`. Positionen sind absolute
 * EMU ab der Blattecke (so liefert sie die Ausrichtung an den Bau-Formen); der
 * Export rechnet sie mit den Spaltenbreiten/Zeilenhöhen des Blatts in
 * `twoCellAnchor editAs="oneCell"` um.
 */

import JSZip from 'jszip'
import {
  EMU_PRO_PT,
  EMU_PRO_PX,
  LEERES_DRAWING,
  LEERE_RELS,
  NS_REL,
  REL_IMAGE,
  SKIZZE_BLATTNAME,
  ANKER_REGEX,
  WEP_APP_MARKER,
  einpassen,
  istEigenerAnker,
  entferneEigeneFormen,
  ergaenzeContentType,
  fuegeBeziehungHinzu,
  findeBlattPfad,
  findeOderLegeDrawingAn,
  relsPfad,
  xmlAttr,
  zaehleFremdeFormen,
} from './skizzeBild'
import type { SkizzeDaten } from '../skizze/types'
import { istPflanze, symbolSvg } from '../skizze/symbole'

// ---------------------------------------------------------------------------
// Eingabe-Modell
// ---------------------------------------------------------------------------

/** Rechteck in EMU ab Blattecke. */
export interface Kasten {
  x: number
  y: number
  w: number
  h: number
}

/** Punkt in EMU ab Blattecke. */
export interface Punkt {
  x: number
  y: number
}

export type FormTyp =
  // allgemeine Formen (Editor der App)
  | 'rechteck'
  | 'linie'
  | 'kreis'
  | 'text'
  | 'massangabe'
  // Lageplan-Elemente nach Skill
  | 'gras'
  | 'weg'
  | 'tor'
  | 'hecke'
  | 'baum'
  | 'strauch'
  | 'beet'
  | 'hochbeet'
  | 'kompost'
  | 'schacht'
  | 'brunnen'
  | 'entfernen'
  | 'mangelhinweis'
  // weitere Lageplan-Elemente (Skizzen-Chat)
  | 'blumenbeet'
  | 'gegenstand'
  | 'holzpferd'
  | 'schaukel'
  | 'wildling'
  | 'kletterpflanze'
  | 'rasen'
  // Grundlage der Grün-Skizze (Beta 5, Paket 1): Wiese und Zaunpfosten
  | 'grundstueck'
  | 'pfosten'
  // Grundriss „Skizze Bau“ (Beta 4, Paket 3)
  | 'bauteil'
  | 'massenberechnung'

/**
 * Ein Element der Grün-Skizze. Welche Felder gebraucht werden, hängt vom Typ ab:
 * - `linie`, `massangabe`: `von` + `nach` (`massangabe`: `text` = „4 m“)
 * - `mangelhinweis`: `kasten` = Hinweisfeld, `text`, optional `nach` = Pfeilziel
 * - `entfernen`: `kasten` = Lage der Pflanze, `text` = Hinweistext („Holzpferd entfernen“)
 * - alle übrigen: `kasten`; `text` = Beschriftung
 */
export interface FormElement {
  typ: FormTyp
  /** Sprechender Namensstamm („Hochbeet_0“, „Holzpferd“, „Maß_Laube_Breite“). */
  name: string
  kasten?: Kasten
  von?: Punkt
  nach?: Punkt
  text?: string
  /** hecke: „flieder“ | „gruen“; baum: „bergahorn“ | „buche“. */
  variante?: string
  /**
   * entfernen: Pflanze (Baum, Strauch, Hecke, Konifere) → Stern mit rotem X.
   * Sonst (Holzpferd, Schuppen, Platte …) nur Hinweis + Pfeil auf die Stelle mit kleinem rotem X.
   */
  pflanze?: boolean
  /** Schriftgröße in pt (Standard 9). */
  schriftPt?: number
  /**
   * Gruppe (z. B. „Hochbeet“ für 4 Hochbeete): wird beim Ausweichen gemeinsam versetzt/verkleinert,
   * Reihenfolge und relative Lage bleiben erhalten.
   */
  gruppe?: string
  /** bauteil: Eckpunkte des Grundrisses (Freiform; Rechtecke werden normale Rechtecke). */
  punkte?: Punkt[]
  /** bauteil: gestrichelt ohne Füllung (Keller, Hauswasser). */
  gestrichelt?: boolean
  /** Teil der Grundlage (Bau-Skizze): Linien liegen unter dem Grün, nicht darüber. */
  grundlage?: boolean
  /** massangabe: Text bei waagerechter Linie unter statt über der Linie (Maßketten unter dem Grundriss). */
  textUnten?: boolean
}

/** Wandelt SVG in PNG (Fallback für Excel-Versionen ohne SVG). Im Browser: `svgZuPngBrowser`. */
export type SvgRaster = (svg: string, breitePx: number, hoehePx: number) => Promise<Uint8Array>

export interface SkizzeFormenOptionen {
  /** Elemente oder eine Funktion, die sie erst nach Blick auf das Blatt erzeugt. */
  elemente: FormElement[] | ((ctx: SkizzeFormenKontext) => FormElement[])
  /** Ohne Rasterisierer werden Piktogramme (Baum, Strauch, Tor, Gras) aus einfachen Formen gezeichnet. */
  rasterisiere?: SvgRaster
  /** Grundstück + Gras zeichnen, wenn das Blatt noch leer ist (Standard: ja). */
  graswiese?: boolean
  /** Zielblatt (Standard: „Skizze Außenanlage-Aufwuchs“; der Grundriss schreibt in „Skizze Bau“). */
  blatt?: string
}

export interface SkizzeFormenKontext {
  /** Blatt enthält fremde Formen (z. B. kopierte Bau-Skizze). */
  hatFormen: boolean
  /** Innerer Zeichenbereich B7:G48 in EMU ab Blattecke. */
  zeichenbereich: Kasten
}

export interface SkizzeFormenErgebnis {
  /** Anzahl geschriebener Excel-Formen (inkl. Linien, Bilder). */
  anzahlFormen: number
  /** Anzahl entfernter eigener Formen aus einem früheren Export. */
  entfernt: number
  /** Grundstück + Gras wurden ergänzt (Blatt war leer). */
  graswiese: boolean
  /** Piktogramme als SVG-Bild mit PNG-Fallback (sonst einfache Formen). */
  svgBilder: number
  /** Beschriftungen, die wegen vorhandener Beschriftungen verschoben wurden (Formnamen). */
  verschoben: string[]
  /** Gruppen/Elemente, die eine Bau-Beschriftung oder Bau-Form überdeckt haben und minimal versetzt wurden. */
  versetzt: string[]
  /** davon zusätzlich leicht verkleinert (max. 20 %) */
  verkleinert: string[]
  /** Formen, die eine vorhandene Beschriftung oder Bau-Form überdecken und nicht verschoben werden konnten. */
  ueberdeckt: string[]
  /** Anzahl fremder Formen, die das Blatt schon vor dem Export hatte (z. B. von Hand gezeichnete Skizze). */
  fremdeFormen: number
}

// ---------------------------------------------------------------------------
// Blatt-Geometrie (Spaltenbreiten, Zeilenhöhen)
// ---------------------------------------------------------------------------

export interface BlattGeometrie {
  /** Breite von Spalte `i` (0-basiert) in EMU. */
  spalte(i: number): number
  /** Höhe von Zeile `i` (0-basiert) in EMU. */
  zeile(i: number): number
  /** Absolute Position → Zelle + Versatz. */
  spaltePos(x: number): { index: number; versatz: number }
  zeilePos(y: number): { index: number; versatz: number }
  /** Linke Kante von Spalte `i` / obere Kante von Zeile `i`. */
  spalteStart(i: number): number
  zeileStart(i: number): number
}

const MAX_SPALTEN = 16384
const MAX_ZEILEN = 1048576

/** Excel-Pixelbreite einer Spalte (Zeichenbreite, Maximum Digit Width 7 px). */
function spaltePx(zeichen: number): number {
  return Math.trunc(((256 * zeichen + Math.trunc(128 / 7)) / 256) * 7)
}

export function leseBlattGeometrie(blattXml: string): BlattGeometrie {
  const fmt = /<sheetFormatPr\b[^>]*>/.exec(blattXml)?.[0] ?? ''
  const baseColWidth = Number(xmlAttr(fmt, 'baseColWidth') ?? 8)
  const stdBreite = xmlAttr(fmt, 'defaultColWidth')
    ? Number(xmlAttr(fmt, 'defaultColWidth'))
    : Math.trunc(((baseColWidth * 7 + 5) / 7) * 256) / 256
  const stdHoehe = Number(xmlAttr(fmt, 'defaultRowHeight') ?? 15)

  const spalten: { min: number; max: number; emu: number }[] = []
  for (const m of blattXml.matchAll(/<col\b[^>]*>/g)) {
    const min = Number(xmlAttr(m[0], 'min'))
    const max = Number(xmlAttr(m[0], 'max'))
    const w = Number(xmlAttr(m[0], 'width'))
    if (!min || !max || !isFinite(w)) continue
    spalten.push({ min, max, emu: xmlAttr(m[0], 'hidden') === '1' ? 0 : spaltePx(w) * EMU_PRO_PX })
  }
  const stdSpalteEmu = spaltePx(stdBreite) * EMU_PRO_PX

  const zeilen = new Map<number, number>()
  for (const m of blattXml.matchAll(/<row\b[^>]*>/g)) {
    const r = Number(xmlAttr(m[0], 'r'))
    if (!r) continue
    if (xmlAttr(m[0], 'hidden') === '1') zeilen.set(r - 1, 0)
    else if (xmlAttr(m[0], 'ht')) zeilen.set(r - 1, Math.round(Number(xmlAttr(m[0], 'ht')) * EMU_PRO_PT))
  }
  const stdZeileEmu = Math.round(stdHoehe * EMU_PRO_PT)

  const spalte = (i: number) => spalten.find((s) => i + 1 >= s.min && i + 1 <= s.max)?.emu ?? stdSpalteEmu
  const zeile = (i: number) => zeilen.get(i) ?? stdZeileEmu

  const suche = (pos: number, groesse: (i: number) => number, max: number) => {
    let rest = Math.max(0, pos)
    for (let i = 0; i < max; i++) {
      const g = groesse(i)
      if (rest < g) return { index: i, versatz: Math.round(rest) }
      rest -= g
    }
    return { index: max - 1, versatz: 0 }
  }
  const start = (i: number, groesse: (i: number) => number) => {
    let summe = 0
    for (let k = 0; k < i; k++) summe += groesse(k)
    return summe
  }
  return {
    spalte,
    zeile,
    spaltePos: (x) => suche(x, spalte, MAX_SPALTEN),
    zeilePos: (y) => suche(y, zeile, MAX_ZEILEN),
    spalteStart: (i) => start(i, spalte),
    zeileStart: (i) => start(i, zeile),
  }
}

/** Zeichenbereich B7:G48 abzüglich Innenrand, damit der Rahmen der Vorlage sichtbar bleibt. */
export function zeichenbereichVon(geo: BlattGeometrie): Kasten {
  const rand = 6 * EMU_PRO_PX
  const x = geo.spalteStart(1)
  const y = geo.zeileStart(6)
  const w = geo.spalteStart(7) - x
  const h = geo.zeileStart(48) - y
  return { x: x + rand, y: y + rand, w: w - 2 * rand, h: h - 2 * rand }
}

// ---------------------------------------------------------------------------
// Konstanten (Stil nach Skill)
// ---------------------------------------------------------------------------

const PT = EMU_PRO_PT

const FARBE = {
  wiese: 'C5E0B4',
  grundstueckLinie: '595959',
  gras: '70AD47',
  weg: 'EDE4D3',
  wegLinie: 'A6A6A6',
  holz: '8B5A2B',
  holzHell: 'D9C3A5',
  rot: 'C00000',
  schwarz: '000000',
  weiss: 'FFFFFF',
  schacht: 'BFBFBF',
  schachtLinie: '7F7F7F',
  sternFuellung: '70AD47',
  sternLinie: '548235',
  fliederFuellung: 'B4A7D6',
  fliederLinie: '7030A0',
  heckeFuellung: 'A9D18E',
  heckeLinie: '548235',
  brunnenFuellung: 'DDEBF7',
  brunnenLinie: '2E75B6',
  linieDunkel: '262626',
  gebaeude: 'E7E6E6',
  tabelleLinie: '7F7F7F',
}

/** Ebenen von unten nach oben (Skill, Schritt 3). */
const EBENE = {
  wiese: 0,
  gras: 1,
  pfosten: 2,
  weg: 3,
  gebaeude: 4,
  gruen: 5,
  kleinteile: 6,
  entfernen: 7,
  beschriftung: 8,
  hinweis: 9,
  mass: 10,
} as const

// ---------------------------------------------------------------------------
// Zwischenmodell: einzelne Excel-Formen
// ---------------------------------------------------------------------------

interface Linienstil {
  farbe: string
  /** Strichstärke in EMU */
  breite: number
  gestrichelt?: boolean
}

interface SpForm {
  art: 'sp'
  name: string
  ebene: number
  /** Herkunft: Index des Elements, Gruppe und Typ (für das gemeinsame Versetzen) */
  elem?: number
  gruppe?: string
  quelle?: FormTyp
  /** Name des Elements (Meldungen) */
  ename?: string
  kasten: Kasten
  prst: string
  fuellung?: string
  linie?: Linienstil
  text?: string
  schriftPt?: number
  schriftFarbe?: string
  /** Textfeld ohne Füllung und Rand (`txBox`) */
  textfeld?: boolean
  /** Text umbrechen (Standard: nein) */
  umbruch?: boolean
  /** Freiform statt `prst`: Eckpunkte in EMU ab Blattecke (Grundriss mit schrägen Kanten, L-Form …). */
  pfad?: Punkt[]
  /** Textfläche der Freiform (EMU ab Blattecke); Standard: umgebendes Rechteck. */
  textKasten?: Kasten
  /** Text linksbündig (Massenberechnung). */
  links?: boolean
}

interface CxnForm {
  art: 'cxn'
  name: string
  ebene: number
  /** Herkunft: Index des Elements, Gruppe und Typ (für das gemeinsame Versetzen) */
  elem?: number
  gruppe?: string
  quelle?: FormTyp
  /** Name des Elements (Meldungen) */
  ename?: string
  von: Punkt
  nach: Punkt
  linie: Linienstil
  pfeil?: boolean
}

interface PicForm {
  art: 'pic'
  name: string
  ebene: number
  /** Herkunft: Index des Elements, Gruppe und Typ (für das gemeinsame Versetzen) */
  elem?: number
  gruppe?: string
  quelle?: FormTyp
  /** Name des Elements (Meldungen) */
  ename?: string
  kasten: Kasten
  svg: string
}

type Form = SpForm | CxnForm | PicForm

const linie = (farbe: string, pt = 1, gestrichelt = false): Linienstil => ({ farbe, breite: Math.round(pt * PT), gestrichelt })

// ---------------------------------------------------------------------------
// SVG-Piktogramme
// ---------------------------------------------------------------------------

function svgRahmen(inhalt: string, b: number, h: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b} ${h}" width="${b}" height="${h}" ` +
    `preserveAspectRatio="xMidYMid meet">${inhalt}</svg>`
  )
}

export function baumSvg(variante?: string): string {
  const krone = variante === 'bergahorn' ? '#70AD47' : '#548235'
  const rand = variante === 'bergahorn' ? '#548235' : '#385723'
  return svgRahmen(
    `<rect x="17" y="30" width="6" height="18" fill="#7F5A2E"/>` +
      `<g fill="${krone}" stroke="${rand}" stroke-width="1">` +
      `<circle cx="11" cy="24" r="10"/><circle cx="29" cy="24" r="10"/><circle cx="20" cy="14" r="13"/></g>`,
    40,
    50,
  )
}

export function strauchSvg(): string {
  return svgRahmen(
    `<g fill="#70AD47" stroke="#548235" stroke-width="1"><circle cx="12" cy="24" r="10"/>` +
      `<circle cx="28" cy="24" r="10"/><circle cx="20" cy="14" r="11"/></g>` +
      `<g fill="#FFFFFF" stroke="#A6A6A6" stroke-width=".6"><circle cx="14" cy="12" r="2"/><circle cx="25" cy="10" r="2"/>` +
      `<circle cx="8" cy="24" r="2"/><circle cx="20" cy="24" r="2"/><circle cx="32" cy="23" r="2"/><circle cx="18" cy="17" r="2"/></g>`,
    40,
    36,
  )
}

/** Tor (Skill): senkrechte Linie + Viertelbogen. */
export function torSvg(): string {
  return svgRahmen(
    `<path d="M57 2 L57 39" stroke="#262626" stroke-width="2" fill="none"/>` +
      `<path d="M3 39 A54 37 0 0 1 57 2" stroke="#262626" stroke-width="1" fill="none"/>`,
    60,
    40,
  )
}

/** Gras: ca. 20–25 kleine „v“-Häkchen, deterministisch verteilt. */
export function grasSvg(breite: number, hoehe: number): string {
  let z = 12345
  const zufall = () => {
    z = (z * 1664525 + 1013904223) % 4294967296
    return z / 4294967296
  }
  const anzahl = 22
  let pfade = ''
  for (let i = 0; i < anzahl; i++) {
    const x = 8 + zufall() * (breite - 22)
    const y = 8 + zufall() * (hoehe - 20)
    pfade += `M${x.toFixed(1)} ${y.toFixed(1)} l3 6 l3 -6 `
  }
  return svgRahmen(
    `<path d="${pfade.trim()}" stroke="#70AD47" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    Math.round(breite),
    Math.round(hoehe),
  )
}

// ---------------------------------------------------------------------------
// Elemente → Formen
// ---------------------------------------------------------------------------

const mitte = (k: Kasten): Punkt => ({ x: k.x + k.w / 2, y: k.y + k.h / 2 })

function textBreite(text: string, pt: number, min = 0): number {
  const laengste = Math.max(1, ...text.split('\n').map((z) => z.length))
  return Math.max(min, Math.round(laengste * pt * 0.55 * PT + 8 * PT))
}

/** Transparentes Textfeld, mittig auf `xMitte`, Oberkante `y`. */
function beschriftung(name: string, text: string, xMitte: number, y: number, pt = 9, mindestBreite = 0): SpForm {
  const w = textBreite(text, pt, mindestBreite)
  const h = Math.round((pt + 6) * PT)
  return {
    art: 'sp',
    name,
    ebene: EBENE.beschriftung,
    kasten: { x: Math.round(xMitte - w / 2), y: Math.round(y), w, h },
    prst: 'rect',
    text,
    schriftPt: pt,
    schriftFarbe: FARBE.schwarz,
    textfeld: true,
  }
}

/** Punkt auf dem Rand von `k` in Richtung `ziel` (Strahl von der Mitte). */
function randPunkt(k: Kasten, ziel: Punkt): Punkt {
  const m = mitte(k)
  const dx = ziel.x - m.x
  const dy = ziel.y - m.y
  if (dx === 0 && dy === 0) return m
  const t = Math.min(
    dx === 0 ? Infinity : k.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : k.h / 2 / Math.abs(dy),
  )
  return { x: m.x + dx * t, y: m.y + dy * t }
}

function pfeil(name: string, von: Punkt, nach: Punkt, farbe: string, ebene: number): CxnForm {
  return { art: 'cxn', name, ebene, von, nach, linie: linie(farbe, 1), pfeil: true }
}

function mindestens(k: Kasten, minW: number, minH: number): Kasten {
  const m = mitte(k)
  const w = Math.max(k.w, minW)
  const h = Math.max(k.h, minH)
  return { x: Math.round(m.x - w / 2), y: Math.round(m.y - h / 2), w: Math.round(w), h: Math.round(h) }
}

function formenFuer(el: FormElement, mitSvg: boolean): Form[] {
  const k = el.kasten
  const text = el.text ?? ''
  const n = el.name
  const pt = el.schriftPt ?? 9
  switch (el.typ) {
    case 'rechteck':
    case 'kreis': {
      if (!k) return []
      const f: Form[] = [
        {
          art: 'sp',
          name: n,
          ebene: EBENE.kleinteile,
          kasten: k,
          prst: el.typ === 'kreis' ? 'ellipse' : 'rect',
          linie: linie(FARBE.linieDunkel),
        },
      ]
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(k).x, k.y + k.h + 2 * PT, pt))
      return f
    }

    case 'linie':
      return el.von && el.nach
        ? [{ art: 'cxn', name: n, ebene: EBENE.kleinteile, von: el.von, nach: el.nach, linie: linie(FARBE.linieDunkel) }]
        : []

    case 'text':
      return k && text ? [{ ...beschriftung(n, text, mitte(k).x, k.y, pt, k.w), kasten: k }] : []

    case 'massangabe': {
      if (!el.von || !el.nach) return []
      const { von, nach } = el
      const dx = nach.x - von.x
      const dy = nach.y - von.y
      const laenge = Math.hypot(dx, dy) || 1
      const nx = (-dy / laenge) * 4 * PT
      const ny = (dx / laenge) * 4 * PT
      const f: Form[] = [
        { art: 'cxn', name: n, ebene: EBENE.mass, von, nach, linie: linie(FARBE.rot) },
        {
          art: 'cxn', name: `${n}_Strich1`, ebene: EBENE.mass,
          von: { x: von.x - nx, y: von.y - ny }, nach: { x: von.x + nx, y: von.y + ny }, linie: linie(FARBE.rot),
        },
        {
          art: 'cxn', name: `${n}_Strich2`, ebene: EBENE.mass,
          von: { x: nach.x - nx, y: nach.y - ny }, nach: { x: nach.x + nx, y: nach.y + ny }, linie: linie(FARBE.rot),
        },
      ]
      if (text) {
        const t = beschriftung(`${n}_Text`, text, (von.x + nach.x) / 2, 0, pt)
        // Text neben die Linie: bei (fast) waagerechter Linie darüber, sonst rechts daneben
        const waagerecht = Math.abs(dx) >= Math.abs(dy)
        const unten = waagerecht && el.textUnten
        t.kasten.y = Math.round((von.y + nach.y) / 2 - (waagerecht ? (unten ? -1 * PT : t.kasten.h + 1 * PT) : t.kasten.h / 2))
        if (!waagerecht) t.kasten.x = Math.round((von.x + nach.x) / 2 + 3 * PT)
        t.schriftFarbe = FARBE.rot
        t.ebene = EBENE.mass
        f.push(t)
      }
      return f
    }

    case 'gras': {
      if (!k) return []
      return mitSvg
        ? [{ art: 'pic', name: n, ebene: EBENE.gras, kasten: k, svg: grasSvg(k.w / PT, k.h / PT) }]
        : []
    }

    case 'grundstueck':
      return k
        ? [{ art: 'sp', name: n, ebene: EBENE.wiese, kasten: k, prst: 'rect', fuellung: FARBE.wiese, linie: linie(FARBE.grundstueckLinie) }]
        : []

    case 'pfosten':
      return k
        ? [{ art: 'sp', name: n, ebene: EBENE.pfosten, kasten: k, prst: 'rect', fuellung: FARBE.weiss, linie: linie(FARBE.grundstueckLinie, 0.75) }]
        : []

    case 'weg':
      return k
        ? [
            {
              art: 'sp', name: n, ebene: EBENE.weg, kasten: k, prst: 'rect',
              fuellung: FARBE.weg, linie: linie(FARBE.wegLinie), text: text || 'Weg', schriftPt: pt, schriftFarbe: FARBE.schwarz,
            },
          ]
        : []

    case 'tor':
      if (!k) return []
      return mitSvg
        ? [{ art: 'pic', name: n, ebene: EBENE.weg, kasten: k, svg: torSvg() }]
        : [
            { art: 'cxn', name: n, ebene: EBENE.weg, von: { x: k.x + k.w, y: k.y + k.h }, nach: { x: k.x + k.w, y: k.y }, linie: linie(FARBE.linieDunkel, 2) },
            { art: 'sp', name: `${n}_Bogen`, ebene: EBENE.weg, kasten: { x: k.x - k.w, y: k.y, w: 2 * k.w, h: 2 * k.h }, prst: 'arc', linie: linie(FARBE.linieDunkel) },
          ]

    case 'hecke': {
      if (!k) return []
      const flieder = el.variante === 'flieder' || /flieder/i.test(text)
      const waagerecht = k.w >= k.h
      const lang = waagerecht ? k.w : k.h
      const kurz = waagerecht ? k.h : k.w
      const d = Math.round(Math.min(30 * PT, Math.max(20 * PT, kurz)))
      const schritt0 = d * 0.7
      const anzahl = Math.max(1, Math.ceil((lang - d) / schritt0) + 1)
      const schritt = anzahl > 1 ? (lang - d) / (anzahl - 1) : 0
      const m = mitte(k)
      const f: Form[] = []
      for (let i = 0; i < anzahl; i++) {
        const versatz = (i % 2 === 0 ? -1 : 1) * d * 0.12
        const hauptachse = (waagerecht ? k.x : k.y) + i * schritt
        const querachse = (waagerecht ? m.y : m.x) - d / 2 + versatz
        f.push({
          art: 'sp',
          name: `${n}_${i}`,
          ebene: EBENE.gruen,
          kasten: waagerecht
            ? { x: Math.round(hauptachse), y: Math.round(querachse), w: d, h: d }
            : { x: Math.round(querachse), y: Math.round(hauptachse), w: d, h: d },
          prst: 'ellipse',
          fuellung: flieder ? FARBE.fliederFuellung : FARBE.heckeFuellung,
          linie: linie(flieder ? FARBE.fliederLinie : FARBE.heckeLinie),
        })
      }
      if (text) f.push(beschriftung(`${n}_Text`, text, m.x, Math.max(k.y + k.h, m.y + d / 2) + 3 * PT, pt))
      return f
    }

    case 'baum':
    case 'strauch': {
      if (!k) return []
      const b = mindestens(k, 28 * PT, el.typ === 'baum' ? 34 * PT : 28 * PT)
      const f: Form[] = mitSvg
        ? [{ art: 'pic', name: n, ebene: EBENE.gruen, kasten: b, svg: el.typ === 'baum' ? baumSvg(el.variante) : strauchSvg() }]
        : einfachBaum(n, b, el.typ === 'baum', el.variante)
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(b).x, b.y + b.h + 1 * PT, pt))
      return f
    }

    case 'beet':
    case 'hochbeet': {
      if (!k) return []
      const f: Form[] = [
        {
          art: 'sp',
          name: n,
          ebene: EBENE.gruen,
          kasten: k,
          prst: el.typ === 'hochbeet' ? 'ellipse' : 'rect',
          fuellung: FARBE.holzHell,
          linie: linie(FARBE.holz),
        },
      ]
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(k).x, k.y + k.h + 2 * PT, pt))
      return f
    }

    case 'blumenbeet': {
      if (!k) return []
      const f: Form[] = mitSvg
        ? [{ art: 'pic', name: n, ebene: EBENE.gruen, kasten: k, svg: symbolSvg('blumenbeet', k.w / PT, k.h / PT) }]
        : [{ art: 'sp', name: n, ebene: EBENE.gruen, kasten: k, prst: 'roundRect', fuellung: 'EBDDC7', linie: linie(FARBE.holz) }]
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(k).x, k.y + k.h + 2 * PT, pt))
      return f
    }

    case 'wildling':
    case 'kletterpflanze':
    case 'holzpferd':
    case 'schaukel': {
      if (!k) return []
      const minimum: Record<string, [number, number]> = {
        wildling: [22, 32], kletterpflanze: [24, 32], holzpferd: [32, 28], schaukel: [40, 34],
      }
      const b = mindestens(k, minimum[el.typ][0] * PT, minimum[el.typ][1] * PT)
      const f: Form[] = mitSvg
        ? [{ art: 'pic', name: n, ebene: EBENE.gruen, kasten: b, svg: symbolSvg(el.typ, b.w / PT, b.h / PT) }]
        : [
            {
              art: 'sp', name: n, ebene: EBENE.gruen, kasten: b,
              prst: el.typ === 'wildling' || el.typ === 'kletterpflanze' ? 'ellipse' : 'rect',
              fuellung: el.typ === 'wildling' || el.typ === 'kletterpflanze' ? FARBE.gras : 'C9A27A',
              linie: linie(el.typ === 'wildling' || el.typ === 'kletterpflanze' ? FARBE.sternLinie : FARBE.holz),
            },
          ]
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(b).x, b.y + b.h + 1 * PT, pt))
      return f
    }

    case 'gegenstand': {
      if (!k) return []
      const f: Form[] = [
        { art: 'sp', name: n, ebene: EBENE.kleinteile, kasten: k, prst: 'rect', fuellung: 'F2F2F2', linie: linie(FARBE.schachtLinie) },
      ]
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(k).x, k.y + k.h + 2 * PT, pt))
      return f
    }

    case 'rasen':
      // nur Beschriftung, kein Symbol
      return k && text ? [{ ...beschriftung(n, text, mitte(k).x, mitte(k).y - ((pt + 6) * PT) / 2, pt, k.w), kasten: { ...k, y: Math.round(mitte(k).y - ((pt + 6) * PT) / 2), h: Math.round((pt + 6) * PT) }, schriftFarbe: FARBE.heckeLinie }] : []

    case 'kompost': {
      if (!k) return []
      const f: Form[] = [
        { art: 'sp', name: n, ebene: EBENE.kleinteile, kasten: k, prst: 'rect', fuellung: FARBE.holzHell, linie: linie(FARBE.holz) },
      ]
      const breiteLatte = Math.round(2.5 * PT)
      const quer = k.w >= k.h
      for (let i = 0; i < 3; i++) {
        const anteil = (i + 1) / 4
        f.push({
          art: 'sp',
          name: `${n}_Latte_${i}`,
          ebene: EBENE.kleinteile,
          kasten: quer
            ? { x: Math.round(k.x + k.w * anteil - breiteLatte / 2), y: k.y + PT, w: breiteLatte, h: k.h - 2 * PT }
            : { x: k.x + PT, y: Math.round(k.y + k.h * anteil - breiteLatte / 2), w: k.w - 2 * PT, h: breiteLatte },
          prst: 'rect',
          fuellung: FARBE.holz,
        })
      }
      f.push(beschriftung(`${n}_Text`, text || 'Kompost', mitte(k).x, k.y - (pt + 6 + 1) * PT, pt))
      return f
    }

    case 'schacht': {
      if (!k) return []
      const b = mindestens({ ...mitte(k), w: 0, h: 0 }, 18 * PT, 18 * PT)
      const f: Form[] = [
        { art: 'sp', name: n, ebene: EBENE.kleinteile, kasten: b, prst: 'rect', fuellung: FARBE.schacht, linie: linie(FARBE.schachtLinie) },
      ]
      if (text) {
        const t = beschriftung(`${n}_Text`, text, mitte(b).x, b.y + b.h + 16 * PT, pt)
        f.push(t, pfeil(`${n}_Pfeil`, { x: mitte(t.kasten).x, y: t.kasten.y }, { x: mitte(b).x, y: b.y + b.h }, FARBE.schwarz, EBENE.beschriftung))
      }
      return f
    }

    case 'brunnen': {
      if (!k) return []
      const b = mindestens(k, 16 * PT, 16 * PT)
      const f: Form[] = [
        { art: 'sp', name: n, ebene: EBENE.kleinteile, kasten: b, prst: 'ellipse', fuellung: FARBE.brunnenFuellung, linie: linie(FARBE.brunnenLinie) },
      ]
      if (text) f.push(beschriftung(`${n}_Text`, text, mitte(b).x, b.y + b.h + 1 * PT, pt))
      return f
    }

    case 'entfernen': {
      if (!k) return []
      const m = mitte(k)
      const f: Form[] = []
      let oben: number // Oberkante der Markierung (Stern bzw. X)
      const kreuz = (r: number) => {
        f.push(
          { art: 'cxn', name: `${n}_X1`, ebene: EBENE.entfernen, von: { x: m.x - r, y: m.y - r }, nach: { x: m.x + r, y: m.y + r }, linie: linie(FARBE.rot, 2) },
          { art: 'cxn', name: `${n}_X2`, ebene: EBENE.entfernen, von: { x: m.x + r, y: m.y - r }, nach: { x: m.x - r, y: m.y + r }, linie: linie(FARBE.rot, 2) },
        )
      }
      if (el.pflanze) {
        const d = Math.round(Math.min(44 * PT, Math.max(30 * PT, Math.min(k.w, k.h))))
        const stern: Kasten = { x: Math.round(m.x - d / 2), y: Math.round(m.y - d / 2), w: d, h: d }
        f.push({ art: 'sp', name: n, ebene: EBENE.entfernen, kasten: stern, prst: 'star16', fuellung: FARBE.sternFuellung, linie: linie(FARBE.sternLinie) })
        kreuz(d * 0.3)
        oben = stern.y
      } else {
        // kein Pflanzen-Stern: nur ein kleines rotes X als Marker auf der Stelle
        kreuz(5 * PT)
        oben = Math.round(m.y - 7 * PT)
      }
      if (text) {
        const h = Math.round(16 * PT)
        const w = textBreite(text, pt)
        const hinweis: Kasten = { x: Math.round(m.x - w / 2), y: Math.max(0, Math.round(oben - h - 12 * PT)), w, h }
        f.push(
          hinweisFeld(`${n}_Hinweis`, hinweis, text, pt),
          pfeil(`${n}_Pfeil`, { x: m.x, y: hinweis.y + hinweis.h }, { x: m.x, y: oben }, FARBE.rot, EBENE.hinweis),
        )
      }
      return f
    }

    case 'bauteil': {
      const pts = el.punkte
      if (!pts || pts.length < 3) return []
      const box = umgebendes(pts)
      const rechteck =
        pts.length === 4 &&
        pts.every((p, i) => {
          const q = pts[(i + 1) % 4]
          return Math.abs(p.x - q.x) < PT / 10 || Math.abs(p.y - q.y) < PT / 10
        })
      return [
        {
          art: 'sp',
          name: n,
          ebene: EBENE.gebaeude,
          kasten: box,
          prst: 'rect',
          ...(rechteck ? {} : { pfad: pts, textKasten: textFlaeche(pts, box, text, el.schriftPt ?? 11) }),
          ...(el.gestrichelt ? {} : { fuellung: FARBE.gebaeude }),
          linie: linie(FARBE.linieDunkel, 1.5, el.gestrichelt),
          text,
          schriftPt: el.schriftPt ?? 11,
          schriftFarbe: FARBE.schwarz,
        },
      ]
    }

    case 'massenberechnung': {
      if (!k || !text) return []
      return [
        {
          art: 'sp',
          name: n,
          ebene: EBENE.beschriftung,
          kasten: k,
          prst: 'rect',
          fuellung: FARBE.weiss,
          linie: linie(FARBE.tabelleLinie, 0.75),
          text,
          schriftPt: el.schriftPt ?? 8,
          schriftFarbe: FARBE.schwarz,
          links: true,
        },
      ]
    }

    case 'mangelhinweis': {
      if (!k) return []
      const f: Form[] = [hinweisFeld(n, k, text, pt)]
      if (el.nach) f.push(pfeil(`${n}_Pfeil`, randPunkt(k, el.nach), el.nach, FARBE.rot, EBENE.hinweis))
      return f
    }
  }
}

function umgebendes(pts: Punkt[]): Kasten {
  const x1 = Math.min(...pts.map((p) => p.x))
  const y1 = Math.min(...pts.map((p) => p.y))
  const x2 = Math.max(...pts.map((p) => p.x))
  const y2 = Math.max(...pts.map((p) => p.y))
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) }
}

function imPolygon(p: Punkt, pts: Punkt[]): boolean {
  let innen = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) innen = !innen
  }
  return innen
}

/**
 * Textfläche einer Freiform (z. B. L-Form): ein Rechteck in der Größe des Textes, das ganz im Polygon liegt und dem
 * Schwerpunkt am nächsten ist – damit der Text nicht in der Aussparung oder auf der Kante steht. Ausgemessen wird in
 * absoluten EMU; passt der Text nirgends hinein, steht er am Schwerpunkt.
 */
function textFlaeche(pts: Punkt[], box: Kasten, text: string, pt: number): Kasten {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const k = p.x * q.y - q.x * p.y
    a += k
    cx += (p.x + q.x) * k
    cy += (p.y + q.y) * k
  }
  const m = Math.abs(a) < 1e-6 ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: cx / (3 * a), y: cy / (3 * a) }
  const zeilen = text.split('\n')
  const w = Math.round(Math.max(...zeilen.map((z) => z.length), 1) * pt * 0.6 * PT + 4 * PT)
  const h = Math.round(zeilen.length * (pt + 3) * PT)
  const passt = (x: number, y: number) => {
    for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) if (!imPolygon({ x: x - w / 2 + fx * w, y: y - h / 2 + fy * h }, pts)) return false
    return true
  }
  let best: { x: number; y: number } | undefined
  let bestD = Infinity
  const schritte = 28
  for (let i = 0; i <= schritte; i++) {
    for (let j = 0; j <= schritte; j++) {
      const x = box.x + (box.w * i) / schritte
      const y = box.y + (box.h * j) / schritte
      const d = Math.hypot(x - m.x, y - m.y)
      if (d < bestD && passt(x, y)) {
        best = { x, y }
        bestD = d
      }
    }
  }
  const c = best ?? m
  return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h }
}

function hinweisFeld(name: string, kasten: Kasten, text: string, pt: number): SpForm {
  return {
    art: 'sp',
    name,
    ebene: EBENE.hinweis,
    kasten,
    prst: 'roundRect',
    fuellung: FARBE.weiss,
    linie: linie(FARBE.rot),
    text,
    schriftPt: pt,
    schriftFarbe: FARBE.rot,
  }
}

/** Baum/Strauch ohne SVG: Krone aus drei Kreisen, Stamm als Rechteck. */
function einfachBaum(n: string, b: Kasten, baum: boolean, variante?: string): Form[] {
  const krone = baum ? (variante === 'bergahorn' ? FARBE.gras : FARBE.sternLinie) : FARBE.gras
  const rand = baum ? '385723' : FARBE.sternLinie
  const d = Math.round(b.w * 0.55)
  const kreis = (name: string, x: number, y: number): SpForm => ({
    art: 'sp', name, ebene: EBENE.gruen, kasten: { x: Math.round(x), y: Math.round(y), w: d, h: d },
    prst: 'ellipse', fuellung: krone, linie: linie(rand),
  })
  const krH = baum ? b.h * 0.8 : b.h
  const f: Form[] = []
  if (baum) {
    f.push({
      art: 'sp', name: `${n}_Stamm`, ebene: EBENE.gruen,
      kasten: { x: Math.round(b.x + b.w * 0.42), y: Math.round(b.y + b.h * 0.6), w: Math.round(b.w * 0.16), h: Math.round(b.h * 0.4) },
      prst: 'rect', fuellung: '7F5A2E',
    })
  }
  f.push(
    kreis(`${n}_Krone_0`, b.x, b.y + krH - d),
    kreis(`${n}_Krone_1`, b.x + b.w - d, b.y + krH - d),
    kreis(`${n}_Krone_2`, b.x + (b.w - d) / 2, b.y),
  )
  return f
}

// ---------------------------------------------------------------------------
// Excel-Formen → DrawingML
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const r = Math.round

function lnXml(l: Linienstil | undefined, pfeil = false): string {
  if (!l) return '<a:ln><a:noFill/></a:ln>'
  return (
    `<a:ln w="${l.breite}"><a:solidFill><a:srgbClr val="${l.farbe}"/></a:solidFill>` +
    (l.gestrichelt ? '<a:prstDash val="dash"/>' : '') +
    (pfeil ? '<a:tailEnd type="triangle" w="med" len="med"/>' : '') +
    '</a:ln>'
  )
}

/** Anker (twoCellAnchor, editAs=oneCell) für ein Rechteck in absoluten EMU. */
export function ankerAuf(geo: BlattGeometrie, k: Kasten, inhalt: string): string {
  const von = { c: geo.spaltePos(Math.max(0, k.x)), z: geo.zeilePos(Math.max(0, k.y)) }
  const bis = { c: geo.spaltePos(Math.max(0, k.x + k.w)), z: geo.zeilePos(Math.max(0, k.y + k.h)) }
  return (
    '<xdr:twoCellAnchor editAs="oneCell">' +
    `<xdr:from><xdr:col>${von.c.index}</xdr:col><xdr:colOff>${von.c.versatz}</xdr:colOff><xdr:row>${von.z.index}</xdr:row><xdr:rowOff>${von.z.versatz}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${bis.c.index}</xdr:col><xdr:colOff>${bis.c.versatz}</xdr:colOff><xdr:row>${bis.z.index}</xdr:row><xdr:rowOff>${bis.z.versatz}</xdr:rowOff></xdr:to>` +
    inhalt +
    '<xdr:clientData/></xdr:twoCellAnchor>'
  )
}

/** Freiform (custGeom) aus Eckpunkten; Pfadkoordinaten relativ zur Form `k`. Der Text sitzt über die Innenränder (`bodyPr`). */
function freiform(pfad: Punkt[], k: Kasten): string {
  const pt = (p: Punkt) => `<a:pt x="${Math.max(0, r(p.x - k.x))}" y="${Math.max(0, r(p.y - k.y))}"/>`
  return (
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/>' +
    `<a:pathLst><a:path w="${k.w}" h="${k.h}"><a:moveTo>${pt(pfad[0])}</a:moveTo>` +
    pfad.slice(1).map((p) => `<a:lnTo>${pt(p)}</a:lnTo>`).join('') +
    '<a:close/></a:path></a:pathLst></a:custGeom>'
  )
}

/** Innenränder (EMU), die den Text einer Freiform in die Textfläche `text` schieben (links, oben, rechts, unten). */
function textRaender(k: Kasten, text: Kasten): [number, number, number, number] {
  const l = Math.max(0, r(text.x - k.x))
  const t = Math.max(0, r(text.y - k.y))
  return [l, t, Math.max(0, r(k.x + k.w - (text.x + text.w))), Math.max(0, r(k.y + k.h - (text.y + text.h)))]
}

function spXml(f: SpForm, id: number, geo: BlattGeometrie): string {
  const k = { x: Math.max(0, r(f.kasten.x)), y: Math.max(0, r(f.kasten.y)), w: Math.max(1, r(f.kasten.w)), h: Math.max(1, r(f.kasten.h)) }
  const fill = f.fuellung ? `<a:solidFill><a:srgbClr val="${f.fuellung}"/></a:solidFill>` : '<a:noFill/>'
  const pt = f.schriftPt ?? 9
  const raender: [number, number, number, number] = f.pfad && f.textKasten ? textRaender(k, f.textKasten) : f.links ? [50800, 25400, 12700, 0] : [12700, 0, 12700, 0]
  const body = f.text
    ? '<xdr:txBody>' +
      `<a:bodyPr vertOverflow="${f.pfad ? 'overflow' : 'clip'}" horzOverflow="${f.pfad ? 'overflow' : 'clip'}" wrap="${f.umbruch ? 'square' : 'none'}" lIns="${raender[0]}" tIns="${raender[1]}" rIns="${raender[2]}" bIns="${raender[3]}" rtlCol="0" anchor="${f.links ? 't' : 'ctr'}"/>` +
      '<a:lstStyle/>' +
      f.text
        .split('\n')
        .map(
          (z) =>
            `<a:p><a:pPr algn="${f.links ? 'l' : 'ctr'}"/>` +
            `<a:r><a:rPr lang="de-DE" sz="${r(pt * 100)}"><a:solidFill><a:srgbClr val="${f.schriftFarbe ?? FARBE.schwarz}"/></a:solidFill><a:latin typeface="+mn-lt"/></a:rPr><a:t>${esc(z)}</a:t></a:r></a:p>`,
        )
        .join('') +
      '</xdr:txBody>'
    : ''
  return ankerAuf(
    geo,
    k,
    `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}" descr="${WEP_APP_MARKER}"/>` +
      `<xdr:cNvSpPr${f.textfeld ? ' txBox="1"' : ''}/></xdr:nvSpPr>` +
      `<xdr:spPr><a:xfrm><a:off x="${k.x}" y="${k.y}"/><a:ext cx="${k.w}" cy="${k.h}"/></a:xfrm>` +
      `${f.pfad ? freiform(f.pfad, k) : `<a:prstGeom prst="${f.prst}"><a:avLst/></a:prstGeom>`}${fill}${lnXml(f.linie)}</xdr:spPr>${body}</xdr:sp>`,
  )
}

function cxnXml(f: CxnForm, id: number, geo: BlattGeometrie): string {
  const x = Math.max(0, r(Math.min(f.von.x, f.nach.x)))
  const y = Math.max(0, r(Math.min(f.von.y, f.nach.y)))
  const w = r(Math.abs(f.nach.x - f.von.x))
  const h = r(Math.abs(f.nach.y - f.von.y))
  const flip = (f.nach.x < f.von.x ? ' flipH="1"' : '') + (f.nach.y < f.von.y ? ' flipV="1"' : '')
  return ankerAuf(
    geo,
    { x, y, w, h },
    `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}" descr="${WEP_APP_MARKER}"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr>` +
      `<xdr:spPr><a:xfrm${flip}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
      `<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>${lnXml(f.linie, f.pfeil)}</xdr:spPr></xdr:cxnSp>`,
  )
}

function picXml(f: PicForm, id: number, geo: BlattGeometrie, pngRel: string, svgRel: string): string {
  const k = { x: Math.max(0, r(f.kasten.x)), y: Math.max(0, r(f.kasten.y)), w: Math.max(1, r(f.kasten.w)), h: Math.max(1, r(f.kasten.h)) }
  return ankerAuf(
    geo,
    k,
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${esc(f.name)}" descr="${WEP_APP_MARKER}"/>` +
      '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
      `<xdr:blipFill><a:blip xmlns:r="${NS_REL}" r:embed="${pngRel}"><a:extLst>` +
      '<a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">' +
      `<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgRel}"/></a:ext>` +
      '</a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
      `<xdr:spPr><a:xfrm><a:off x="${k.x}" y="${k.y}"/><a:ext cx="${k.w}" cy="${k.h}"/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>',
  )
}

// ---------------------------------------------------------------------------
// Öffentliche Bausteine
// ---------------------------------------------------------------------------

/**
 * Wandelt Elemente in Excel-Formen (Reihenfolge = Ebenen von unten nach oben).
 * Mit `mitSvg=false` entstehen nur einfache Formen ohne Bilder.
 */
export function elementeZuFormen(elemente: FormElement[], mitSvg: boolean): Form[] {
  const alle = elemente.flatMap((e, i) =>
    formenFuer(e, mitSvg).map((f): Form => ({
      ...f,
      // Linien der Grundlage (Bau-Skizze) liegen mit den Gebäuden unter dem Grün
      ...(e.grundlage && f.art === 'cxn' ? { ebene: Math.min(f.ebene, EBENE.gebaeude) } : {}),
      elem: i,
      gruppe: e.gruppe ?? `#${i}`,
      quelle: e.typ,
      ename: e.name,
    })),
  )
  // stabil nach Ebene sortieren (Array.sort ist stabil)
  return alle.sort((a, b) => a.ebene - b.ebene)
}

/** Namen aller Formen, die `elementeZuFormen` erzeugt (für Tests und Berichte). */
export function formNamen(elemente: FormElement[], mitSvg = true): string[] {
  return elementeZuFormen(elemente, mitSvg).map((f) => f.name)
}

/** Namensbestandteil: Leerzeichen → „_“, nur Buchstaben, Ziffern, „_“ und „-“. */
const identOf = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')

/**
 * Übersetzt die Elemente des einfachen Skizzen-Editors (Pixel) in `FormElement`e
 * und passt sie in `bereich` ein (Seitenverhältnis bleibt, zentriert).
 * Ohne Bau-Excel ist `bereich` der Zeichenbereich B7:G48.
 */
export function skizzeDatenZuFormen(daten: SkizzeDaten, bereich: Kasten, optionen: { grundlage?: boolean } = {}): FormElement[] {
  const breite = daten.breite ?? 800
  const hoehe = daten.hoehe ?? 600
  const p = einpassen(breite, hoehe, bereich.w, bereich.h)
  const faktor = p.cx / breite
  const X = (x: number) => Math.round(bereich.x + p.x + x * faktor)
  const Y = (y: number) => Math.round(bereich.y + p.y + y * faktor)
  const zaehler: Record<string, number> = {}
  const nummer = (basis: string) => `${basis}_${(zaehler[basis] = (zaehler[basis] ?? -1) + 1)}`
  // Gebäude der Grundlage heißen wie im Skill einfach „L“, „A1“, „K1_HW“; erst ein zweites gleiches bekommt „_2“
  const gebaeude = new Map<string, number>()
  const gebaeudeName = (basis: string) => {
    const n = (gebaeude.get(basis) ?? 0) + 1
    gebaeude.set(basis, n)
    return n === 1 ? basis : `${basis}_${n}`
  }
  const out: FormElement[] = []
  for (const e of daten.elemente) {
    // Die Grundlage entfällt, wenn das Blatt schon eine Bau-Skizze enthält (sie läge doppelt)
    if (e.ebene === 'grundlage' && optionen.grundlage === false) continue
    const gl = e.ebene === 'grundlage' ? { grundlage: true } : {}
    switch (e.typ) {
      case 'bauform': {
        const pts = e.punkte.map((q) => ({ x: X(q.x), y: Y(q.y) }))
        if (pts.length < 3) break
        const box = umgebendes(pts)
        if (e.art === 'grundstueck') out.push({ typ: 'grundstueck', name: 'Grundstück', kasten: box, ...gl })
        else if (e.art === 'pfosten') out.push({ typ: 'pfosten', name: nummer('Pfosten'), kasten: box, ...gl })
        else {
          const kopf = (e.beschriftung ?? '').split('\n')[0]
          out.push({
            typ: 'bauteil',
            name: gebaeudeName(identOf(kopf) || 'Gebäude'),
            punkte: pts,
            ...(e.beschriftung ? { text: e.beschriftung } : {}),
            ...(e.gestrichelt ? { gestrichelt: true } : {}),
            ...gl,
          })
        }
        break
      }
      case 'symbol': {
        const text = e.beschriftung ?? ''
        out.push({
          typ: e.art,
          name: nummer(identOf(text) || e.art[0].toUpperCase() + e.art.slice(1)),
          kasten: { x: X(e.x), y: Y(e.y), w: Math.round(e.breite * faktor), h: Math.round(e.hoehe * faktor) },
          text,
          ...(e.art === 'entfernen' ? { pflanze: istPflanze(text) } : {}),
          ...(e.art === 'hecke' && /flieder/i.test(text) ? { variante: 'flieder' } : {}),
        })
        break
      }
      case 'rechteck':
        out.push({ typ: 'rechteck', name: nummer('Rechteck'), kasten: { x: X(e.x), y: Y(e.y), w: Math.round(e.breite * faktor), h: Math.round(e.hoehe * faktor) } })
        break
      case 'linie':
        out.push({ typ: 'linie', name: nummer('Linie'), von: { x: X(e.x1), y: Y(e.y1) }, nach: { x: X(e.x2), y: Y(e.y2) }, ...gl })
        break
      case 'kreis':
        out.push({
          typ: 'kreis',
          name: nummer('Kreis'),
          kasten: { x: X(e.cx - e.radius), y: Y(e.cy - e.radius), w: Math.round(2 * e.radius * faktor), h: Math.round(2 * e.radius * faktor) },
          text: e.beschriftung,
        })
        break
      case 'text': {
        const pt = Math.min(14, Math.max(8, Math.round(((e.schriftgroesse ?? 14) * faktor) / PT)))
        const w = textBreite(e.inhalt, pt)
        out.push({ typ: 'text', name: nummer('Text'), kasten: { x: X(e.x), y: Y(e.y), w, h: Math.round((pt + 6) * PT) }, text: e.inhalt, schriftPt: pt })
        break
      }
      case 'massangabe':
        out.push({
          typ: 'massangabe',
          name: nummer('Maß'),
          von: { x: X(e.x1), y: Y(e.y1) },
          nach: { x: X(e.x2), y: Y(e.y2) },
          text: e.beschriftung,
        })
        break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Einfügen ins Zip
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Beschriftungen nicht über vorhandene Beschriftungen legen
// ---------------------------------------------------------------------------

export interface Hindernis {
  /** Text der Form (Beschriftung) oder ihr Name */
  name: string
  kasten: Kasten
  /** Form enthält sichtbaren Text (Beschriftung) */
  beschriftung: boolean
}

/**
 * Rechtecke fremder Formen (Lage aus `a:xfrm`): Beschriftungen mit sichtbarem Text und
 * Körper-Formen (Gebäude …). Linien/Verbinder und leere Textfelder zählen nicht.
 */
export function fremdeHindernisse(drawingXml: string): Hindernis[] {
  const out: Hindernis[] = []
  for (const m of drawingXml.matchAll(ANKER_REGEX)) {
    const anker = m[0]
    if (istEigenerAnker(anker) || anker.includes('<xdr:cxnSp')) continue
    const texte = [...anker.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((t) => t[1].trim()).filter(Boolean)
    if (!texte.length && /<xdr:cNvSpPr\b[^>]*\btxBox="1"/.test(anker)) continue
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(anker)
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(anker)
    if (!off || !ext) continue
    out.push({
      name: texte.join(' ') || /<xdr:cNvPr\b[^>]*\sname="([^"]*)"/.exec(anker)?.[1] || 'Bau-Form',
      kasten: { x: Number(off[1]), y: Number(off[2]), w: Number(ext[1]), h: Number(ext[2]) },
      beschriftung: texte.length > 0,
    })
  }
  return out
}

/** Überlappen sich die Rechtecke (mit 1 pt Toleranz am Rand)? */
function ueberlappt(a: Kasten, b: Kasten): boolean {
  const t = PT
  return a.x + t < b.x + b.w && b.x + t < a.x + a.w && a.y + t < b.y + b.h && b.y + t < a.y + a.h
}

const kastenVon = (f: Form): Kasten =>
  f.art === 'cxn'
    ? { x: Math.min(f.von.x, f.nach.x), y: Math.min(f.von.y, f.nach.y), w: Math.abs(f.nach.x - f.von.x), h: Math.abs(f.nach.y - f.von.y) }
    : f.kasten

/**
 * Verschiebt eigene Beschriftungen (Textfelder), die vorhandene Beschriftungen, eigene
 * Formen oder bereits gesetzte Beschriftungen überdecken würden – bevorzugt nach rechts,
 * dann unten, links, oben. Vorhandene Formen werden nie angefasst. Gibt die Namen der
 * verschobenen Beschriftungen zurück.
 */
export function weicheBeschriftungenAus(formen: Form[], fremd: Kasten[]): string[] {
  const verschoben: string[] = []
  const gesetzt: Kasten[] = []
  const koerper = formen.filter((f) => !(f.art === 'sp' && f.textfeld) && f.ebene > EBENE.gras && f.art !== 'cxn').map(kastenVon)
  for (const f of formen) {
    if (f.art !== 'sp' || !f.textfeld) continue
    const hindernisse = [...fremd, ...koerper, ...gesetzt]
    const frei = (k: Kasten) => k.x >= 0 && k.y >= 0 && !hindernisse.some((h) => ueberlappt(k, h))
    if (!frei(f.kasten)) {
      const { w, h } = f.kasten
      const luecke = 2 * PT
      const kandidat = (dx: number, dy: number): Kasten => ({ ...f.kasten, x: f.kasten.x + dx, y: f.kasten.y + dy })
      const versuche: Kasten[] = []
      for (const stufe of [1, 2, 3]) {
        const sx = (w + luecke) * stufe
        const sy = (h + luecke) * stufe
        versuche.push(kandidat(sx, 0), kandidat(0, sy), kandidat(-sx, 0), kandidat(0, -sy), kandidat(sx, sy), kandidat(-sx, sy), kandidat(sx, -sy), kandidat(-sx, -sy))
      }
      const neu = versuche.find(frei)
      if (neu) {
        f.kasten = neu
        verschoben.push(f.name)
      }
    }
    gesetzt.push(f.kasten)
  }
  return verschoben
}

/** Typen, die der Export versetzen/verkleinern darf (Bäume, Hecken, Sträucher nur melden). */
const BEWEGLICH = new Set<FormTyp>(['hochbeet', 'beet', 'blumenbeet', 'kompost', 'schacht', 'brunnen', 'gegenstand', 'holzpferd', 'schaukel', 'rechteck', 'kreis', 'text'])

const enthaelt = (aussen: Kasten, innen: Kasten) =>
  aussen.x <= innen.x && aussen.y <= innen.y && aussen.x + aussen.w >= innen.x + innen.w && aussen.y + aussen.h >= innen.y + innen.h

const istKoerper = (f: Form) => !(f.art === 'sp' && f.textfeld) && f.art !== 'cxn' && f.ebene > EBENE.gras

const vereinigung = (ks: Kasten[]): Kasten => {
  const x1 = Math.min(...ks.map((k) => k.x))
  const y1 = Math.min(...ks.map((k) => k.y))
  const x2 = Math.max(...ks.map((k) => k.x + k.w))
  const y2 = Math.max(...ks.map((k) => k.y + k.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/**
 * Bau-Hindernisse, die ein Körper `k` überdeckt. Eine Bau-Form, die den ganzen Körper
 * umschließt (Grundstück/Wiese), zählt nicht.
 */
function ueberdecktVon(k: Kasten, hindernisse: Hindernis[], umschliessend: Kasten = k): Hindernis[] {
  return hindernisse.filter((h) => ueberlappt(k, h.kasten) && !enthaelt(h.kasten, umschliessend))
}

/**
 * Körper-Formen (Beete, Hochbeete, Kompost, Gegenstände …), die eine Bau-Beschriftung oder
 * Bau-Form überdecken, minimal versetzen. Eine Gruppe wird gemeinsam bewegt (Reihenfolge und
 * relative Lage bleiben): zuerst in freie Fläche, bevorzugt weg vom Hindernis, höchstens
 * eine Elementhöhe weit; reicht das nicht, wird die Gruppe um bis zu 20 % verkleinert
 * (um ihre Mitte) und erneut versetzt. Geht beides nicht, bleibt sie stehen. Beschriftungen
 * der Elemente wandern mit. Bäume, Hecken, Sträucher werden nie bewegt.
 */
export function versetzeGruppen(formen: Form[], hindernisse: Hindernis[]): { versetzt: string[]; verkleinert: string[] } {
  const versetzt: string[] = []
  const verkleinert: string[] = []
  const gruppen = new Map<string, Form[]>()
  for (const f of formen) gruppen.set(f.gruppe ?? f.name, [...(gruppen.get(f.gruppe ?? f.name) ?? []), f])

  for (const [id, fs] of gruppen) {
    const koerper = fs.filter(istKoerper) as (SpForm | PicForm)[]
    if (!koerper.length || !fs.every((f) => f.quelle && BEWEGLICH.has(f.quelle))) continue
    const bbox = vereinigung(koerper.map((f) => f.kasten))
    const stoert = [...new Set(koerper.flatMap((f) => ueberdecktVon(f.kasten, hindernisse, bbox)))]
    if (!stoert.length) continue

    const andere = formen.filter((f) => istKoerper(f) && !fs.includes(f)).map(kastenVon)
    const vorher = koerper.map((f) => new Set(andere.map((a, i) => (ueberlappt(f.kasten, a) ? i : -1)).filter((i) => i >= 0)))
    const relevant = hindernisse.filter((h) => !enthaelt(h.kasten, bbox))
    const m = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 }
    const hoehe = Math.max(...koerper.map((f) => f.kasten.h))

    // „weg vom Hindernis“: Richtung vom Schwerpunkt der überdeckten Hindernisse zur Gruppenmitte
    const hx = stoert.reduce((s, h) => s + h.kasten.x + h.kasten.w / 2, 0) / stoert.length
    const hy = stoert.reduce((s, h) => s + h.kasten.y + h.kasten.h / 2, 0) / stoert.length
    const weg = { x: m.x - hx, y: m.y - hy }
    const richtungen = Array.from({ length: 8 }, (_, k) => ({ x: Math.cos((k * Math.PI) / 4), y: Math.sin((k * Math.PI) / 4) })).sort(
      (a, b) => b.x * weg.x + b.y * weg.y - (a.x * weg.x + a.y * weg.y),
    )

    const proben = (faktor: number, dx: number, dy: number): Kasten[] | undefined => {
      const neu = koerper.map((f) => ({
        x: Math.round(m.x + (f.kasten.x - m.x) * faktor + dx),
        y: Math.round(m.y + (f.kasten.y - m.y) * faktor + dy),
        w: Math.round(f.kasten.w * faktor),
        h: Math.round(f.kasten.h * faktor),
      }))
      const ok = neu.every(
        (k, i) =>
          k.x >= 0 &&
          k.y >= 0 &&
          !relevant.some((h) => ueberlappt(k, h.kasten)) &&
          !andere.some((a, j) => ueberlappt(k, a) && !vorher[i].has(j)),
      )
      return ok ? neu : undefined
    }

    let treffer: { faktor: number; dx: number; dy: number; neu: Kasten[] } | undefined
    for (const faktor of [1, 0.9, 0.8]) {
      const kandidaten: [number, number][] = faktor === 1 ? [] : [[0, 0]]
      for (let j = 1; j <= 8; j++) for (const r of richtungen) kandidaten.push([r.x * ((hoehe * j) / 8), r.y * ((hoehe * j) / 8)])
      for (const [dx, dy] of kandidaten) {
        const neu = proben(faktor, dx, dy)
        if (neu) {
          treffer = { faktor, dx, dy, neu }
          break
        }
      }
      if (treffer) break
    }
    if (!treffer) continue

    // anwenden: Körper setzen, Beschriftungen um die Verschiebung ihres Elements mitnehmen
    const delta = new Map<number | undefined, { x: number; y: number }>()
    koerper.forEach((f, i) => {
      const alt = f.kasten
      const neu = treffer!.neu[i]
      if (!delta.has(f.elem)) delta.set(f.elem, { x: neu.x + neu.w / 2 - (alt.x + alt.w / 2), y: neu.y + neu.h / 2 - (alt.y + alt.h / 2) })
      f.kasten = neu
    })
    for (const f of fs) {
      if (f.art !== 'sp' || !f.textfeld) continue
      const d = delta.get(f.elem) ?? { x: treffer.dx, y: treffer.dy }
      f.kasten = { ...f.kasten, x: Math.max(0, Math.round(f.kasten.x + d.x)), y: Math.max(0, Math.round(f.kasten.y + d.y)) }
    }
    const anzeige = id.startsWith('#') ? koerper[0].name : id
    versetzt.push(anzeige)
    if (treffer.faktor < 1) verkleinert.push(anzeige)
  }
  return { versetzt, verkleinert }
}

function naechsterMediaName(zip: JSZip, stamm: string, endung: string): string {
  let n = 1
  while (zip.file(`xl/media/${stamm}${n}.${endung}`)) n++
  return `${stamm}${n}.${endung}`
}

/**
 * Hängt die Elemente als Excel-Formen an das Drawing des Skizzen-Blatts.
 * Gibt `undefined` zurück, wenn das Blatt in der Datei nicht existiert
 * (die Datei bleibt dann unverändert).
 */
export async function fuegeSkizzeFormenEin(
  zip: JSZip,
  optionen: SkizzeFormenOptionen,
): Promise<SkizzeFormenErgebnis | undefined> {
  const blattPfad = await findeBlattPfad(zip, optionen.blatt ?? SKIZZE_BLATTNAME)
  const blattXml = blattPfad ? await zip.file(blattPfad)?.async('string') : undefined
  if (!blattPfad || !blattXml) return undefined
  const geo = leseBlattGeometrie(blattXml)

  const drawingPfad = (await findeOderLegeDrawingAn(zip, blattPfad))!
  const entfernt = await entferneEigeneFormen(zip, drawingPfad)

  let drawingXml = (await zip.file(drawingPfad)?.async('string')) ?? LEERES_DRAWING
  const fremdeFormen = zaehleFremdeFormen(drawingXml)
  const hatFormen = fremdeFormen > 0
  const zeichenbereich = zeichenbereichVon(geo)
  let elemente =
    typeof optionen.elemente === 'function' ? optionen.elemente({ hatFormen, zeichenbereich }) : [...optionen.elemente]

  // Wiese + Gras nur auf einem noch leeren Blatt (sonst deckt die Bau-Skizze den Hintergrund ab)
  elemente = elemente.filter((e) => e.typ !== 'gras')
  const graswiese = !hatFormen && optionen.graswiese !== false
  const mitSvg = Boolean(optionen.rasterisiere)
  const formen: Form[] = []
  // Grundstück der Grundlage (Bau-Skizze): bestimmt die Fläche der Wiese; ohne Wiese zeichnet es sich selbst
  const grundstueck = elemente.find((e) => e.typ === 'grundstueck')
  if (graswiese) elemente = elemente.filter((e) => e.typ !== 'grundstueck')
  if (graswiese) {
    const z = grundstueck?.kasten ?? zeichenbereich
    formen.push({
      art: 'sp', name: 'Grundstück', ebene: EBENE.wiese, kasten: z, prst: 'rect',
      fuellung: FARBE.wiese, linie: linie(FARBE.grundstueckLinie),
    })
    formen.push(...formenFuer({ typ: 'gras', name: 'Gras', kasten: z }, mitSvg))
  }
  formen.push(...elementeZuFormen(elemente, mitSvg))
  formen.sort((a, b) => a.ebene - b.ebene)

  // Bau-Beschriftungen und Bau-Formen nie überdecken: Körper-Formen minimal versetzen
  // (Gruppen gemeinsam, notfalls leicht verkleinert), danach eigene Beschriftungen verschieben.
  // Was nicht ausweichen kann (z. B. Bäume), bleibt stehen und wird gemeldet.
  const hindernisse = fremdeHindernisse(drawingXml)
  const { versetzt, verkleinert } = versetzeGruppen(formen, hindernisse)
  const verschoben = weicheBeschriftungenAus(
    formen,
    hindernisse.filter((h) => h.beschriftung).map((h) => h.kasten),
  )
  const ueberdeckt = formen
    .filter(istKoerper)
    .flatMap((f) => ueberdecktVon(kastenVon(f), hindernisse).map((h) => `${f.ename ?? f.name} überdeckt „${h.name}“`))
    .filter((m, i, alle) => alle.indexOf(m) === i)

  // Bilder (SVG + PNG-Fallback) ablegen und verknüpfen
  const relsDatei = relsPfad(drawingPfad)
  let rels = (await zip.file(relsDatei)?.async('string')) ?? LEERE_RELS
  const ids = [...drawingXml.matchAll(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g)].map((m) => Number(m[1]))
  let naechsteId = Math.max(1, ...ids) + 1

  let svgBilder = 0
  let anker = ''
  for (const f of formen) {
    const id = naechsteId++
    if (f.art === 'sp') anker += spXml(f, id, geo)
    else if (f.art === 'cxn') anker += cxnXml(f, id, geo)
    else {
      const bPx = Math.max(16, Math.min(512, Math.round((f.kasten.w / EMU_PRO_PX) * 2)))
      const hPx = Math.max(16, Math.min(512, Math.round((f.kasten.h / EMU_PRO_PX) * 2)))
      const png = await optionen.rasterisiere!(f.svg, bPx, hPx)
      const pngName = naechsterMediaName(zip, 'wep-skizze-form', 'png')
      zip.file(`xl/media/${pngName}`, png)
      const svgName = naechsterMediaName(zip, 'wep-skizze-form', 'svg')
      zip.file(`xl/media/${svgName}`, f.svg)
      const pngRel = fuegeBeziehungHinzu(rels, REL_IMAGE, `../media/${pngName}`)
      const svgRel = fuegeBeziehungHinzu(pngRel.xml, REL_IMAGE, `../media/${svgName}`)
      rels = svgRel.xml
      anker += picXml(f, id, geo, pngRel.id, svgRel.id)
      svgBilder++
    }
  }
  if (svgBilder) {
    await ergaenzeContentType(zip, '<Default Extension="png" ContentType="image/png"/>')
    await ergaenzeContentType(zip, '<Default Extension="svg" ContentType="image/svg+xml"/>')
    zip.file(relsDatei, rels)
  }

  drawingXml = drawingXml.replace('</xdr:wsDr>', `${anker}</xdr:wsDr>`)
  zip.file(drawingPfad, drawingXml)
  return { anzahlFormen: formen.length, entfernt, graswiese, svgBilder, verschoben, versetzt, verkleinert, ueberdeckt, fremdeFormen }
}
