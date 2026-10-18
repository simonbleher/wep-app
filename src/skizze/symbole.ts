/**
 * Piktogramme der Skizze als einfache Zeichenbefehle („Prims“).
 *
 * Eine Beschreibung pro Symbol, drei Abnehmer: der Editor (SVG), der PNG-Export
 * (Canvas) und die SVG-Bilder im Excel-Export. So sehen Editor, PNG und Excel
 * gleich aus (Stil nach Skill `docs/skills/parzellen-skizze.md`), und niemand
 * muss ein Symbol dreimal zeichnen.
 */

import type { SymbolArt } from './types'

export type Prim =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; sw?: number }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; sw?: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw?: number; pfeil?: boolean }
  | { k: 'poly'; pts: [number, number][]; closed?: boolean; fill?: string; stroke?: string; sw?: number }
  | { k: 'text'; x: number; y: number; s: string; size: number; fill: string; anchor?: 'middle' | 'start' }

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface SymbolOptionen {
  /** Schriftgröße der Beschriftung (Standard 11). */
  schrift?: number
}

const FARBE = {
  rot: '#C00000',
  holz: '#8B5A2B',
  holzHell: '#D9C3A5',
  gras: '#70AD47',
  grasDunkel: '#548235',
  stamm: '#7F5A2E',
  weg: '#EDE4D3',
  wegLinie: '#A6A6A6',
  schacht: '#BFBFBF',
  schachtLinie: '#7F7F7F',
  wasser: '#DDEBF7',
  wasserLinie: '#2E75B6',
  flieder: '#B4A7D6',
  fliederLinie: '#7030A0',
  hecke: '#A9D18E',
  dunkel: '#262626',
}

/** Pflanzen (Stern + rotes X beim Entfernen); alles andere nur kleines X und Hinweis. */
const PFLANZE =
  /baum|bäume|strauch|sträucher|busch|hecke|konifere|nadelbaum|wacholder|thuja|zypresse|fichte|tanne|kiefer|flieder|jasmin|ahorn|buche|birke|eiche|linde|obst|apfel|birne|kirsche|pflaume|rose|hortensie|bambus|forsythie|liguster|hainbuche|lebensbaum|wildling|walnuss|nuss|wein|kletter|pflanze|efeu|brombeere|himbeere/i
export const istPflanze = (...texte: string[]): boolean => PFLANZE.test(texte.join(' '))

/** Mittelpunkt eines Kastens. */
const mitte = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** Zeichenfläche (lx, ly) → Kasten, Seitenverhältnis `lw:lh` bleibt, zentriert. */
function rahmen(b: Box, lw: number, lh: number) {
  const s = Math.min(b.w / lw, b.h / lh)
  const ox = b.x + (b.w - lw * s) / 2
  const oy = b.y + (b.h - lh * s) / 2
  return {
    s,
    x: (lx: number) => ox + lx * s,
    y: (ly: number) => oy + ly * s,
    w: (l: number) => l * s,
  }
}

/** Zeichenbefehle für ein Kreis-Cluster, z. B. Baumkrone. */
function kreise(g: ReturnType<typeof rahmen>, liste: [number, number, number][], fill: string, stroke: string): Prim[] {
  return liste.map(([cx, cy, r]) => ({
    k: 'ellipse', cx: g.x(cx), cy: g.y(cy), rx: g.w(r), ry: g.w(r), fill, stroke, sw: 1,
  }))
}

export function sternPunkte(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < 32; i++) {
    const rr = i % 2 === 0 ? r : r * 0.78
    const w = (Math.PI * i) / 16 - Math.PI / 2
    pts.push([cx + rr * Math.cos(w), cy + rr * Math.sin(w)])
  }
  return pts
}

/** Bogenpunkte (Grad, Uhrzeigersinn ab 3 Uhr, y nach unten). */
function bogen(cx: number, cy: number, rx: number, ry: number, von: number, bis: number, n = 10): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const w = ((von + ((bis - von) * i) / n) * Math.PI) / 180
    pts.push([cx + rx * Math.cos(w), cy + ry * Math.sin(w)])
  }
  return pts
}

function beschriftungUnten(b: Box, text: string, size: number): Prim[] {
  return text ? [{ k: 'text', x: mitte(b).x, y: b.y + b.h + size + 1, s: text, size, fill: '#000000', anchor: 'middle' }] : []
}

/** Rote Hinweis-Box (abgerundet, weiß) mit Text; Rückgabe: Prims und Box. */
function hinweisBox(mx: number, unten: number, text: string, size: number): { prims: Prim[]; box: Box } {
  const w = Math.max(24, text.length * size * 0.55 + 8)
  const h = size + 6
  const box: Box = { x: mx - w / 2, y: unten - h, w, h }
  return {
    box,
    prims: [
      { k: 'rect', x: box.x, y: box.y, w, h, r: 3, fill: '#FFFFFF', stroke: FARBE.rot, sw: 1 },
      { k: 'text', x: mx, y: box.y + h - 4, s: text, size, fill: FARBE.rot, anchor: 'middle' },
    ],
  }
}

/** Seitenverhältnis der festen Piktogramme (Breite : Höhe), damit sie nicht verzerren. */
const PIKTO: Partial<Record<SymbolArt, [number, number]>> = {
  baum: [40, 50],
  strauch: [40, 36],
  wildling: [30, 44],
  kletterpflanze: [34, 44],
  holzpferd: [50, 44],
  schaukel: [50, 44],
}

export function symbolSeitenverhaeltnis(art: SymbolArt): number | undefined {
  const p = PIKTO[art]
  return p ? p[0] / p[1] : undefined
}

/**
 * Zeichenbefehle für ein Symbol im Kasten `b` (beliebige Einheit, meist px oder pt).
 * `beschriftung` ist der Anzeigetext (bei `gegenstand` der Name, bei `entfernen`
 * z. B. „Holzpferd entfernen“).
 */
export function symbolPrims(art: SymbolArt, b: Box, beschriftung = '', opt: SymbolOptionen = {}): Prim[] {
  const size = opt.schrift ?? 11
  const m = mitte(b)
  const text = beschriftung.trim()
  switch (art) {
    case 'baum': {
      const g = rahmen(b, 40, 50)
      return [
        { k: 'rect', x: g.x(17), y: g.y(30), w: g.w(6), h: g.w(18), fill: FARBE.stamm },
        ...kreise(g, [[11, 24, 10], [29, 24, 10], [20, 14, 13]], '#548235', '#385723'),
        ...beschriftungUnten(b, text, size),
      ]
    }
    case 'strauch': {
      const g = rahmen(b, 40, 36)
      const bluete = [[14, 12], [25, 10], [8, 24], [20, 24], [32, 23], [18, 17]] as const
      return [
        ...kreise(g, [[12, 24, 10], [28, 24, 10], [20, 14, 11]], FARBE.gras, FARBE.grasDunkel),
        ...bluete.map(([x, y]): Prim => ({ k: 'ellipse', cx: g.x(x), cy: g.y(y), rx: g.w(2), ry: g.w(2), fill: '#FFFFFF', stroke: FARBE.wegLinie, sw: 0.6 })),
        ...beschriftungUnten(b, text, size),
      ]
    }
    case 'wildling': {
      // junger Baum: dünner Stamm mit Pfahl, kleine helle Krone
      const g = rahmen(b, 30, 44)
      return [
        { k: 'line', x1: g.x(22), y1: g.y(6), x2: g.x(22), y2: g.y(44), stroke: FARBE.holz, sw: 1 },
        { k: 'line', x1: g.x(15), y1: g.y(42), x2: g.x(15), y2: g.y(44), stroke: FARBE.stamm, sw: 1 },
        { k: 'rect', x: g.x(13), y: g.y(22), w: g.w(4), h: g.w(22), fill: FARBE.stamm },
        ...kreise(g, [[9, 17, 7], [21, 17, 7], [15, 9, 8]], '#8FCB6B', FARBE.grasDunkel),
        ...beschriftungUnten(b, text, size),
      ]
    }
    case 'kletterpflanze': {
      // Rankgitter mit Blättern und Trauben (Wein)
      const g = rahmen(b, 34, 44)
      const gitter: Prim[] = []
      for (let i = 0; i <= 4; i++) {
        gitter.push({ k: 'line', x1: g.x(4), y1: g.y(4 + i * 9), x2: g.x(30), y2: g.y(4 + i * 9), stroke: FARBE.wegLinie, sw: 1 })
        gitter.push({ k: 'line', x1: g.x(4 + i * 6.5), y1: g.y(4), x2: g.x(4 + i * 6.5), y2: g.y(40), stroke: FARBE.wegLinie, sw: 1 })
      }
      return [
        ...gitter,
        { k: 'poly', pts: [[17, 42], [12, 32], [20, 24], [13, 15], [19, 5]].map(([x, y]) => [g.x(x), g.y(y)] as [number, number]), stroke: FARBE.grasDunkel, sw: 1.5 },
        ...kreise(g, [[11, 30, 5], [22, 26, 5], [12, 17, 5], [22, 10, 5], [17, 38, 4]], FARBE.gras, FARBE.grasDunkel),
        ...kreise(g, [[24, 35, 2.5], [27, 38, 2.5], [22, 38, 2.5]], '#7030A0', '#4B1E6B'),
        ...beschriftungUnten(b, text, size),
      ]
    }
    case 'hecke': {
      // Reihe überlappender, versetzter Ellipsen entlang der Längsachse
      const flieder = /flieder/i.test(text)
      const waagerecht = b.w >= b.h
      const lang = waagerecht ? b.w : b.h
      const kurz = waagerecht ? b.h : b.w
      const d = Math.max(6, kurz)
      const anzahl = Math.max(1, Math.ceil((lang - d) / (d * 0.7)) + 1)
      const schritt = anzahl > 1 ? (lang - d) / (anzahl - 1) : 0
      const prims: Prim[] = []
      for (let i = 0; i < anzahl; i++) {
        const versatz = (i % 2 === 0 ? -1 : 1) * d * 0.1
        const haupt = (waagerecht ? b.x : b.y) + d / 2 + i * schritt
        const quer = (waagerecht ? m.y : m.x) + versatz
        prims.push({
          k: 'ellipse',
          cx: waagerecht ? haupt : quer,
          cy: waagerecht ? quer : haupt,
          rx: d / 2,
          ry: d / 2,
          fill: flieder ? FARBE.flieder : FARBE.hecke,
          stroke: flieder ? FARBE.fliederLinie : FARBE.grasDunkel,
          sw: 1,
        })
      }
      if (text) {
        prims.push(
          waagerecht
            ? { k: 'text', x: m.x, y: b.y + b.h + size + 1, s: text, size, fill: '#000000', anchor: 'middle' }
            : { k: 'text', x: b.x + b.w + 3, y: m.y + size / 3, s: text, size, fill: '#000000', anchor: 'start' },
        )
      }
      return prims
    }
    case 'beet':
    case 'hochbeet':
    case 'blumenbeet': {
      const rund = art === 'hochbeet'
      const prims: Prim[] = [
        rund
          ? { k: 'ellipse', cx: m.x, cy: m.y, rx: b.w / 2, ry: b.h / 2, fill: FARBE.holzHell, stroke: FARBE.holz, sw: 1 }
          : { k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, r: art === 'blumenbeet' ? 4 : 0, fill: art === 'blumenbeet' ? '#EBDDC7' : FARBE.holzHell, stroke: FARBE.holz, sw: 1 },
      ]
      if (art === 'blumenbeet') {
        const farben = ['#E06666', '#F1C232', '#8E7CC3', '#FFFFFF']
        const spalten = Math.max(2, Math.round(b.w / 14))
        const zeilen = Math.max(1, Math.round(b.h / 14))
        const r = Math.max(1.6, Math.min(b.w / spalten, b.h / zeilen) * 0.18)
        for (let i = 0; i < spalten; i++) {
          for (let j = 0; j < zeilen; j++) {
            prims.push({
              k: 'ellipse',
              cx: b.x + ((i + 0.5) * b.w) / spalten + (j % 2 ? b.w / spalten / 4 : -b.w / spalten / 4),
              cy: b.y + ((j + 0.5) * b.h) / zeilen,
              rx: r, ry: r,
              fill: farben[(i + j) % farben.length],
              stroke: FARBE.grasDunkel,
              sw: 0.6,
            })
          }
        }
      }
      return [...prims, ...beschriftungUnten(b, text, size)]
    }
    case 'rasen':
      // nur Beschriftung, kein Symbol
      return text ? [{ k: 'text', x: m.x, y: m.y + size / 3, s: text, size, fill: FARBE.grasDunkel, anchor: 'middle' }] : []
    case 'kompost': {
      const quer = b.w >= b.h
      const prims: Prim[] = [{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: FARBE.holzHell, stroke: FARBE.holz, sw: 1 }]
      for (let i = 1; i <= 3; i++) {
        prims.push(
          quer
            ? { k: 'line', x1: b.x + (b.w * i) / 4, y1: b.y + 1, x2: b.x + (b.w * i) / 4, y2: b.y + b.h - 1, stroke: FARBE.holz, sw: 2.5 }
            : { k: 'line', x1: b.x + 1, y1: b.y + (b.h * i) / 4, x2: b.x + b.w - 1, y2: b.y + (b.h * i) / 4, stroke: FARBE.holz, sw: 2.5 },
        )
      }
      prims.push({ k: 'text', x: m.x, y: b.y - 2, s: text || 'Kompost', size, fill: '#000000', anchor: 'middle' })
      return prims
    }
    case 'brunnen':
      return [
        { k: 'ellipse', cx: m.x, cy: m.y, rx: b.w / 2, ry: b.h / 2, fill: FARBE.wasser, stroke: FARBE.wasserLinie, sw: 1 },
        { k: 'ellipse', cx: m.x, cy: m.y, rx: b.w * 0.25, ry: b.h * 0.25, fill: '#FFFFFF', stroke: FARBE.wasserLinie, sw: 0.8 },
        ...beschriftungUnten(b, text, size),
      ]
    case 'schacht':
      return [
        { k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: FARBE.schacht, stroke: FARBE.schachtLinie, sw: 1 },
        ...beschriftungUnten(b, text, size),
      ]
    case 'weg':
      return [
        { k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: FARBE.weg, stroke: FARBE.wegLinie, sw: 1 },
        { k: 'text', x: m.x, y: m.y + size / 3, s: text || 'Weg', size, fill: '#000000', anchor: 'middle' },
      ]
    case 'tor': {
      // senkrechte Linie + Viertelbogen (Skill)
      const prims: Prim[] = [
        { k: 'line', x1: b.x + b.w, y1: b.y, x2: b.x + b.w, y2: b.y + b.h, stroke: FARBE.dunkel, sw: 2 },
        { k: 'poly', pts: bogen(b.x + b.w, b.y + b.h, b.w, b.h, 180, 270), stroke: FARBE.dunkel, sw: 1 },
      ]
      if (text) prims.push({ k: 'text', x: m.x, y: b.y + b.h + size + 1, s: text, size, fill: '#000000', anchor: 'middle' })
      return prims
    }
    case 'holzpferd': {
      // Schaukelpferd von der Seite: Körper, Hals, Kopf, Beine auf Kufen
      const g = rahmen(b, 50, 44)
      const P = (pts: [number, number][]) => pts.map(([x, y]) => [g.x(x), g.y(y)] as [number, number])
      return [
        { k: 'poly', pts: P(bogen(25, 34, 22, 8, 0, 180)), stroke: FARBE.holz, sw: 2 },
        ...[[14, 38], [20, 38], [32, 38], [38, 38]].map(([x, y]): Prim => ({ k: 'line', x1: g.x(x), y1: g.y(y - 10), x2: g.x(x), y2: g.y(y + 1), stroke: FARBE.holz, sw: 1.5 })),
        { k: 'ellipse', cx: g.x(25), cy: g.y(22), rx: g.w(16), ry: g.w(8), fill: '#C9A27A', stroke: FARBE.holz, sw: 1 },
        { k: 'poly', pts: P([[35, 20], [40, 8], [46, 10], [46, 17], [43, 19], [40, 20]]), closed: true, fill: '#C9A27A', stroke: FARBE.holz, sw: 1 },
        { k: 'poly', pts: P([[9, 20], [4, 26]]), stroke: FARBE.holz, sw: 1.5 },
        { k: 'ellipse', cx: g.x(43), cy: g.y(12), rx: g.w(1), ry: g.w(1), fill: '#000000' },
        ...beschriftungUnten(b, text, size),
      ]
    }
    case 'schaukel': {
      // Schaukelgestell von vorn: A-Rahmen, Querbalken, Seile, Sitz mit Dach
      const g = rahmen(b, 50, 44)
      return [
        { k: 'line', x1: g.x(8), y1: g.y(4), x2: g.x(2), y2: g.y(42), stroke: FARBE.holz, sw: 2 },
        { k: 'line', x1: g.x(8), y1: g.y(4), x2: g.x(14), y2: g.y(42), stroke: FARBE.holz, sw: 2 },
        { k: 'line', x1: g.x(42), y1: g.y(4), x2: g.x(36), y2: g.y(42), stroke: FARBE.holz, sw: 2 },
        { k: 'line', x1: g.x(42), y1: g.y(4), x2: g.x(48), y2: g.y(42), stroke: FARBE.holz, sw: 2 },
        { k: 'line', x1: g.x(8), y1: g.y(4), x2: g.x(42), y2: g.y(4), stroke: FARBE.holz, sw: 3 },
        { k: 'line', x1: g.x(16), y1: g.y(5), x2: g.x(16), y2: g.y(26), stroke: FARBE.wegLinie, sw: 1 },
        { k: 'line', x1: g.x(34), y1: g.y(5), x2: g.x(34), y2: g.y(26), stroke: FARBE.wegLinie, sw: 1 },
        { k: 'rect', x: g.x(13), y: g.y(26), w: g.w(24), h: g.w(6), r: 2, fill: '#C9A27A', stroke: FARBE.holz, sw: 1 },
        ...beschriftungUnten(b, text, size),
      ]
    }
    case 'gegenstand':
      // beliebiger Gegenstand: schlichter Quader mit Namen darunter
      return [
        { k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: '#F2F2F2', stroke: FARBE.schachtLinie, sw: 1 },
        { k: 'line', x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h, stroke: FARBE.schacht, sw: 1 },
        { k: 'line', x1: b.x + b.w, y1: b.y, x2: b.x, y2: b.y + b.h, stroke: FARBE.schacht, sw: 1 },
        ...beschriftungUnten(b, text, size),
      ]
    case 'entfernen': {
      const pflanze = istPflanze(text)
      const prims: Prim[] = []
      let oben = m.y - 7
      const kreuz = (r: number) =>
        prims.push(
          { k: 'line', x1: m.x - r, y1: m.y - r, x2: m.x + r, y2: m.y + r, stroke: FARBE.rot, sw: 2 },
          { k: 'line', x1: m.x + r, y1: m.y - r, x2: m.x - r, y2: m.y + r, stroke: FARBE.rot, sw: 2 },
        )
      if (pflanze) {
        const r = Math.max(10, Math.min(b.w, b.h) / 2)
        prims.push({ k: 'poly', pts: sternPunkte(m.x, m.y, r), closed: true, fill: '#70AD47', stroke: FARBE.grasDunkel, sw: 1 })
        kreuz(r * 0.6)
        oben = m.y - r
      } else {
        kreuz(5)
      }
      if (text) {
        const h = hinweisBox(m.x, oben - 8, text, size)
        prims.push(...h.prims, {
          k: 'line', x1: m.x, y1: h.box.y + h.box.h, x2: m.x, y2: oben, stroke: FARBE.rot, sw: 1, pfeil: true,
        })
      }
      return prims
    }
    case 'mangelhinweis':
      return [
        { k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, r: 3, fill: '#FFFFFF', stroke: FARBE.rot, sw: 1 },
        { k: 'text', x: m.x, y: m.y + size / 3, s: text, size, fill: FARBE.rot, anchor: 'middle' },
      ]
  }
}

// ---------------------------------------------------------------------------
// Abnehmer: SVG und Canvas
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const f = (n: number) => String(Math.round(n * 100) / 100)

/** SVG-Markup (ohne `<svg>`-Hülle) für die Zeichenbefehle. */
export function primsZuSvg(prims: Prim[]): string {
  return prims
    .map((p) => {
      switch (p.k) {
        case 'rect':
          return `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"${p.r ? ` rx="${f(p.r)}"` : ''} fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.sw ?? 1}"/>`
        case 'ellipse':
          return `<ellipse cx="${f(p.cx)}" cy="${f(p.cy)}" rx="${f(p.rx)}" ry="${f(p.ry)}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.sw ?? 1}"/>`
        case 'line': {
          const pf = p.pfeil ? pfeilspitze(p) : ''
          return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" stroke="${p.stroke}" stroke-width="${p.sw ?? 1}" stroke-linecap="round"/>${pf}`
        }
        case 'poly': {
          const pts = p.pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
          return p.closed
            ? `<polygon points="${pts}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.sw ?? 1}" stroke-linejoin="round"/>`
            : `<polyline points="${pts}" fill="none" stroke="${p.stroke ?? 'none'}" stroke-width="${p.sw ?? 1}" stroke-linejoin="round" stroke-linecap="round"/>`
        }
        case 'text':
          return `<text x="${f(p.x)}" y="${f(p.y)}" font-size="${p.size}" fill="${p.fill}" text-anchor="${p.anchor ?? 'middle'}" font-family="Arial, sans-serif">${esc(p.s)}</text>`
      }
    })
    .join('')
}

function pfeilspitze(p: Extract<Prim, { k: 'line' }>): string {
  const w = Math.atan2(p.y2 - p.y1, p.x2 - p.x1)
  const l = 6
  const a = [p.x2 - l * Math.cos(w - 0.4), p.y2 - l * Math.sin(w - 0.4)]
  const c = [p.x2 - l * Math.cos(w + 0.4), p.y2 - l * Math.sin(w + 0.4)]
  return `<polygon points="${f(p.x2)},${f(p.y2)} ${f(a[0])},${f(a[1])} ${f(c[0])},${f(c[1])}" fill="${p.stroke}"/>`
}

/** Eigenständiges SVG-Bild (Breite × Höhe) für den Excel-Export: Symbol ohne Beschriftung. */
export function symbolSvg(art: SymbolArt, breite: number, hoehe: number): string {
  const prims = symbolPrims(art, { x: 0, y: 0, w: breite, h: hoehe }, '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(breite)} ${f(hoehe)}" width="${f(breite)}" height="${f(hoehe)}">` +
    primsZuSvg(prims) +
    '</svg>'
  )
}

/** Zeichnet die Befehle auf einen Canvas-2D-Kontext (Browser oder @napi-rs/canvas). */
export function zeichnePrims(ctx: CanvasRenderingContext2D, prims: Prim[]): void {
  for (const p of prims) {
    ctx.save()
    switch (p.k) {
      case 'rect': {
        ctx.beginPath()
        if (p.r && 'roundRect' in ctx) (ctx as any).roundRect(p.x, p.y, p.w, p.h, p.r)
        else ctx.rect(p.x, p.y, p.w, p.h)
        fuelleUndStrichle(ctx, p.fill, p.stroke, p.sw)
        break
      }
      case 'ellipse':
        ctx.beginPath()
        ctx.ellipse(p.cx, p.cy, Math.max(0.01, p.rx), Math.max(0.01, p.ry), 0, 0, 2 * Math.PI)
        fuelleUndStrichle(ctx, p.fill, p.stroke, p.sw)
        break
      case 'line':
        ctx.beginPath()
        ctx.moveTo(p.x1, p.y1)
        ctx.lineTo(p.x2, p.y2)
        ctx.lineCap = 'round'
        fuelleUndStrichle(ctx, undefined, p.stroke, p.sw)
        if (p.pfeil) {
          const w = Math.atan2(p.y2 - p.y1, p.x2 - p.x1)
          ctx.beginPath()
          ctx.moveTo(p.x2, p.y2)
          ctx.lineTo(p.x2 - 6 * Math.cos(w - 0.4), p.y2 - 6 * Math.sin(w - 0.4))
          ctx.lineTo(p.x2 - 6 * Math.cos(w + 0.4), p.y2 - 6 * Math.sin(w + 0.4))
          ctx.closePath()
          ctx.fillStyle = p.stroke
          ctx.fill()
        }
        break
      case 'poly':
        ctx.beginPath()
        p.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
        if (p.closed) ctx.closePath()
        ctx.lineJoin = 'round'
        fuelleUndStrichle(ctx, p.closed ? p.fill : undefined, p.stroke, p.sw)
        break
      case 'text':
        ctx.font = `${p.size}px Arial, sans-serif`
        ctx.fillStyle = p.fill
        ctx.textAlign = p.anchor === 'start' ? 'left' : 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(p.s, p.x, p.y)
        break
    }
    ctx.restore()
  }
}

function fuelleUndStrichle(ctx: CanvasRenderingContext2D, fill?: string, stroke?: string, sw = 1) {
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke && stroke !== 'none') {
    ctx.strokeStyle = stroke
    ctx.lineWidth = sw
    ctx.stroke()
  }
}
