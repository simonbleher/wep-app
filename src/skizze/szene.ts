/**
 * Szene-Modell für den Skizzen-Chat.
 *
 * Die KI sieht und ändert nicht die Pixel des Editors, sondern eine kompakte Szene:
 * Elemente mit stabiler id, Typ, Kasten und Beschriftung. Alle Koordinaten sind
 * Promille (0–1000) des Grundstücks, x/y = linke obere Ecke, b/h = Breite/Höhe.
 * Die Geometrie rechnet der Code (`operationen.ts`), nie die KI.
 *
 * - Grün-Elemente (Symbole) sind änderbar.
 * - Alles Übrige (Bau-Formen der Bau-Excel, vom Nutzer gezeichnete Rechtecke,
 *   Kreise, Linien, Texte) ist `fest` und wird nie verändert.
 */

import type { SkizzeDaten, SkizzeElement, SkizzeSymbol, SymbolArt } from './types'
import { SYMBOL_ARTEN } from './types'

export type FestTyp = 'bau' | 'bau-ellipse' | 'bau-text' | 'bau-linie'
export type SzenenTyp = SymbolArt | FestTyp

export const FEST_TYPEN: FestTyp[] = ['bau', 'bau-ellipse', 'bau-text', 'bau-linie']

export interface SzenenElement {
  id: string
  typ: SzenenTyp
  x: number
  y: number
  b: number
  h: number
  beschriftung: string
  fest?: boolean
  /** Elemente einer Reihe („drei Beete nebeneinander“) tragen dieselbe Gruppe. */
  gruppe?: string
  /** Nur feste Linien: Richtung und Aussehen. */
  flipH?: boolean
  flipV?: boolean
  gestrichelt?: boolean
  pfeil?: boolean
}

export interface Szene {
  /** Größe des Grundstücks in pt (Maß für Standardgrößen der Symbole). */
  masse: { b: number; h: number }
  elemente: SzenenElement[]
}

export const istSymbol = (typ: string): typ is SymbolArt => (SYMBOL_ARTEN as readonly string[]).includes(typ)

/** Standardgröße der Symbole in pt (Breite, Höhe) – wie im Excel-Export. */
export const STANDARD_GROESSE: Record<SymbolArt, [number, number]> = {
  baum: [34, 42],
  strauch: [32, 28],
  wildling: [24, 34],
  kletterpflanze: [26, 34],
  hecke: [110, 24],
  beet: [60, 30],
  hochbeet: [30, 38],
  blumenbeet: [60, 34],
  rasen: [90, 20],
  kompost: [42, 24],
  brunnen: [20, 20],
  schacht: [18, 18],
  weg: [30, 100],
  tor: [30, 30],
  holzpferd: [40, 36],
  schaukel: [50, 44],
  gegenstand: [30, 24],
  entfernen: [30, 30],
  mangelhinweis: [90, 22],
}

/** Kurzbeschreibung je Typ für den Prompt. */
export const TYP_BESCHREIBUNG: Record<SymbolArt, string> = {
  baum: 'Baum (Krone aus Kreisen); Beschriftung = Art, z. B. „Apfel“',
  strauch: 'Strauch / Busch',
  wildling: 'Wildling (junger, ungewollter Baum), Beschriftung = Art',
  kletterpflanze: 'Kletterpflanze am Rankgitter, auch Wein',
  hecke: 'Hecke als Linie aus Ellipsen; lang und schmal (Länge = längere Seite)',
  beet: 'Beet (Rechteck)',
  hochbeet: 'Hochbeet (Ellipse)',
  blumenbeet: 'Blumenbeet (Rechteck mit Blüten)',
  rasen: 'Rasenfläche – nur Beschriftung, kein Symbol',
  kompost: 'Kompost (Rahmen mit Latten, Beschriftung darüber)',
  brunnen: 'Brunnen (Kreis)',
  schacht: 'Schacht / Schornstein (graues Quadrat)',
  weg: 'Weg (Rechteck, Beschriftung „Weg“)',
  tor: 'Tor / Zugang (senkrechte Linie mit Viertelbogen)',
  holzpferd: 'Holzpferd (Schaukelpferd)',
  schaukel: 'Schaukel / Hollywoodschaukel',
  gegenstand: 'beliebiger Gegenstand – Beschriftung = Name',
  entfernen: 'Markierung „zu entfernen“; Beschriftung = „<Name> entfernen“ (Pflanzen: Stern mit rotem X)',
  mangelhinweis: 'roter Mängelhinweis (Textfeld), Beschriftung = Hinweistext',
}

export const rund = (n: number) => Math.round(n * 10) / 10

/** Standardgröße in Promille. */
export function standardKasten(typ: SymbolArt, masse: Szene['masse']): { b: number; h: number } {
  const [bw, hh] = STANDARD_GROESSE[typ]
  return { b: rund((bw / masse.b) * 1000), h: rund((hh / masse.h) * 1000) }
}

/** Nächste freie id mit Präfix („e1“, „e2“ …). */
export function neueSzenenId(szene: Szene, praefix = 'e'): string {
  let max = 0
  for (const e of szene.elemente) {
    const m = new RegExp(`^${praefix}(\\d+)$`).exec(e.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${praefix}${max + 1}`
}

export const findeElement = (szene: Szene, id: string): SzenenElement | undefined =>
  szene.elemente.find((e) => e.id === id)

/** Mitte eines Elements in Promille. */
export const mitteVon = (e: Pick<SzenenElement, 'x' | 'y' | 'b' | 'h'>) => ({ x: e.x + e.b / 2, y: e.y + e.h / 2 })

// ---------------------------------------------------------------------------
// Kompakte Darstellung für die KI
// ---------------------------------------------------------------------------

/**
 * Kompakte JSON-Darstellung: ein Element pro Zeile, ganze Promille.
 * Feste Linien und Textfelder ohne Text fehlen (nur Bildrauschen, im PNG sieht die KI sie).
 */
export function szeneKompakt(szene: Szene): string {
  const z = (n: number) => Math.round(n)
  const zeilen = szene.elemente
    .filter((e) => e.typ !== 'bau-linie' && !(e.typ === 'bau-text' && !e.beschriftung))
    .map((e) => {
      const o: Record<string, unknown> = { id: e.id, typ: e.typ, x: z(e.x), y: z(e.y), b: z(e.b), h: z(e.h) }
      if (e.beschriftung) o.t = e.beschriftung
      if (e.fest) o.fest = 1
      return '  ' + JSON.stringify(o)
    })
  return `{"masse_pt":[${z(szene.masse.b)},${z(szene.masse.h)}],"elemente":[\n${zeilen.join(',\n')}\n]}`
}

// ---------------------------------------------------------------------------
// SkizzeDaten (Editor, Pixel) ⇄ Szene
// ---------------------------------------------------------------------------

/** Maße der Editor-Fläche in pt-Äquivalenten: Breite wie das Excel-Grundstück, Höhe nach Seitenverhältnis. */
export function masseFuerFlaeche(breite: number, hoehe: number): Szene['masse'] {
  return { b: 445, h: Math.round((445 * hoehe) / breite) }
}

function festAusElement(el: SkizzeElement, bw: number, bh: number): SzenenElement | null {
  const px = (x: number, y: number, w: number, h: number) => ({
    x: rund((Math.min(x, x + w) / bw) * 1000),
    y: rund((Math.min(y, y + h) / bh) * 1000),
    b: rund((Math.abs(w) / bw) * 1000),
    h: rund((Math.abs(h) / bh) * 1000),
  })
  switch (el.typ) {
    case 'symbol':
      return null
    case 'vieleck':
    case 'bauform': {
      const xs = el.punkte.map((q) => q.x)
      const ys = el.punkte.map((q) => q.y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return {
        id: el.id, typ: 'bau', ...px(x, y, Math.max(...xs) - x, Math.max(...ys) - y),
        beschriftung: (el.beschriftung ?? '').replace(/\n/g, ' '), fest: true,
      }
    }
    case 'rechteck':
      return { id: el.id, typ: 'bau', ...px(el.x, el.y, el.breite, el.hoehe), beschriftung: el.beschriftung ?? '', fest: true }
    case 'kreis':
      return {
        id: el.id, typ: 'bau-ellipse', ...px(el.cx - el.radius, el.cy - (el.radiusY ?? el.radius), 2 * el.radius, 2 * (el.radiusY ?? el.radius)),
        beschriftung: el.beschriftung ?? '', fest: true,
      }
    case 'text': {
      const gr = el.schriftgroesse ?? 14
      return {
        id: el.id, typ: 'bau-text', ...px(el.x, el.y, el.inhalt.length * gr * 0.55, gr + 4),
        beschriftung: el.inhalt, fest: true,
      }
    }
    case 'linie':
    case 'massangabe':
      return {
        id: el.id, typ: 'bau-linie', ...px(el.x1, el.y1, el.x2 - el.x1, el.y2 - el.y1),
        beschriftung: el.typ === 'massangabe' ? el.beschriftung : '', fest: true,
        flipH: el.x2 < el.x1, flipV: el.y2 < el.y1,
      }
  }
}

export function skizzeZuSzene(daten: SkizzeDaten): Szene {
  const bw = daten.breite ?? 800
  const bh = daten.hoehe ?? 600
  const elemente: SzenenElement[] = []
  for (const el of daten.elemente) {
    if (el.typ === 'symbol') {
      elemente.push({
        id: el.id, typ: el.art,
        x: rund((el.x / bw) * 1000), y: rund((el.y / bh) * 1000),
        b: rund((el.breite / bw) * 1000), h: rund((el.hoehe / bh) * 1000),
        beschriftung: el.beschriftung ?? '', ...(el.fest ? { fest: true } : {}),
      })
    } else {
      const f = festAusElement(el, bw, bh)
      if (f) elemente.push(f)
    }
  }
  return { masse: masseFuerFlaeche(bw, bh), elemente }
}

/**
 * Schreibt die geänderten Symbole der Szene zurück. Alles Nicht-Symbolische bleibt
 * unverändert; neue Symbole kommen ans Ende, gelöschte verschwinden.
 */
export function szeneZuSkizze(szene: Szene, daten: SkizzeDaten): SkizzeDaten {
  const bw = daten.breite ?? 800
  const bh = daten.hoehe ?? 600
  const symbole = new Map<string, SkizzeSymbol>()
  for (const e of szene.elemente) {
    if (!istSymbol(e.typ)) continue
    symbole.set(e.id, {
      id: e.id, typ: 'symbol', art: e.typ,
      x: (e.x / 1000) * bw, y: (e.y / 1000) * bh,
      breite: (e.b / 1000) * bw, hoehe: (e.h / 1000) * bh,
      ...(e.beschriftung ? { beschriftung: e.beschriftung } : {}),
      ...(e.fest ? { fest: true } : {}),
    })
  }
  const benutzt = new Set<string>()
  const elemente: SkizzeElement[] = []
  for (const el of daten.elemente) {
    if (el.typ !== 'symbol') {
      elemente.push(el)
    } else if (symbole.has(el.id)) {
      elemente.push(symbole.get(el.id)!)
      benutzt.add(el.id)
    }
  }
  for (const [id, s] of symbole) if (!benutzt.has(id)) elemente.push(s)
  return { ...daten, elemente }
}
