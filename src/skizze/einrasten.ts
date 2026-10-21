/**
 * Einrasten in der Skizze: Ecken und Kanten benachbarter Formen, Rand des Grundstücks
 * (= Rand der Zeichenfläche) und gerade Linien (0°/45°/90°).
 *
 * Reine Rechnung ohne DOM. Es wird nur der Wert vorgeschlagen, den der Editor übernimmt; die Skizzendaten
 * bleiben unverändert (nichts wird gesperrt, der Schalter „Einrasten“ schaltet alles ab).
 */

import type { SkizzeElement } from './types.js'
import type { Punkt } from './geometrie.js'
import { elementVerschieben } from './geometrie.js'

/** Senkrechte (xs) und waagerechte (ys) Linien, an denen etwas einrasten kann. */
export interface ZielLinien {
  xs: number[]
  ys: number[]
}

/** Welche Zielgeraden getroffen wurden – der Editor zeichnet sie als Hilfslinien. */
export interface Treffer {
  x?: number
  y?: number
}

/** Fangbereich in Bildschirmpixeln (wird mit dem Zoom in Skizzen-Einheiten umgerechnet). */
export const FANG_PIXEL = 10
/** Winkeltoleranz für gerade Linien in Grad. */
export const WINKEL_TOLERANZ = 6

/** Ecken, Endpunkte und Mitte(n) einer Form – diese Punkte rasten ein bzw. dienen als Ziel. */
export function schluesselPunkte(el: SkizzeElement): Punkt[] {
  switch (el.typ) {
    case 'rechteck':
    case 'symbol':
      return [
        { x: el.x, y: el.y },
        { x: el.x + el.breite, y: el.y },
        { x: el.x, y: el.y + el.hoehe },
        { x: el.x + el.breite, y: el.y + el.hoehe },
        { x: el.x + el.breite / 2, y: el.y + el.hoehe / 2 },
      ]
    case 'linie':
    case 'massangabe':
      return [
        { x: el.x1, y: el.y1 },
        { x: el.x2, y: el.y2 },
      ]
    case 'kreis':
      return [
        { x: el.cx, y: el.cy },
        { x: el.cx - el.radius, y: el.cy },
        { x: el.cx + el.radius, y: el.cy },
        { x: el.cx, y: el.cy - el.radius },
        { x: el.cx, y: el.cy + el.radius },
      ]
    case 'text':
      return [{ x: el.x, y: el.y }]
  }
}

/** Sammelt die Zielgeraden aller Formen außer `ausschluss` plus den Grundstücksrand. */
export function zielLinien(
  elemente: ReadonlyArray<SkizzeElement>,
  ausschluss: ReadonlySet<string>,
  breite: number,
  hoehe: number,
): ZielLinien {
  const xs = new Set<number>([0, breite])
  const ys = new Set<number>([0, hoehe])
  for (const el of elemente) {
    if (ausschluss.has(el.id)) continue
    for (const p of schluesselPunkte(el)) {
      xs.add(p.x)
      ys.add(p.y)
    }
  }
  return { xs: [...xs], ys: [...ys] }
}

/** Nächste Zielgerade zu `wert` innerhalb `schwelle`, sonst undefined. */
function naechste(wert: number, ziele: number[], schwelle: number): number | undefined {
  let best: number | undefined
  let bestAbstand = schwelle
  for (const z of ziele) {
    const d = Math.abs(z - wert)
    if (d <= bestAbstand) {
      best = z
      bestAbstand = d
    }
  }
  return best
}

/** Rastet einen einzelnen Punkt (z. B. Anfang/Ende einer Form) je Achse auf die Zielgeraden ein. */
export function rastePunkt(p: Punkt, ziele: ZielLinien, schwelle: number): { punkt: Punkt; treffer: Treffer } {
  const x = naechste(p.x, ziele.xs, schwelle)
  const y = naechste(p.y, ziele.ys, schwelle)
  return { punkt: { x: x ?? p.x, y: y ?? p.y }, treffer: { x, y } }
}

/**
 * Rastet das Ende einer Linie ein: erst auf gerade Richtung (0°/45°/90° zum Anfang), dann auf die
 * Zielgeraden – dabei bleibt die gerade Richtung erhalten.
 */
export function rasteLinienEnde(
  start: Punkt,
  ende: Punkt,
  ziele: ZielLinien,
  schwelle: number,
  winkelToleranz: number = WINKEL_TOLERANZ,
  mitWinkel = true,
): { punkt: Punkt; treffer: Treffer; gerade: boolean } {
  const dx = ende.x - start.x
  const dy = ende.y - start.y
  const laenge = Math.hypot(dx, dy)
  if (laenge > 0 && mitWinkel) {
    const grad = (Math.atan2(dy, dx) * 180) / Math.PI
    const raster = Math.round(grad / 45) * 45
    if (Math.abs(grad - raster) <= winkelToleranz) {
      const rad = (raster * Math.PI) / 180
      const waagerecht = Math.abs(Math.sin(rad)) < 1e-9
      const senkrecht = Math.abs(Math.cos(rad)) < 1e-9
      if (waagerecht) {
        const x = naechste(ende.x, ziele.xs, schwelle)
        return { punkt: { x: x ?? start.x + Math.sign(Math.cos(rad)) * laenge, y: start.y }, treffer: { x }, gerade: true }
      }
      if (senkrecht) {
        const y = naechste(ende.y, ziele.ys, schwelle)
        return { punkt: { x: start.x, y: y ?? start.y + Math.sign(Math.sin(rad)) * laenge }, treffer: { y }, gerade: true }
      }
      // Diagonale: Länge halten, dann auf eine Zielgerade ziehen (die andere Koordinate folgt)
      const sx = Math.sign(Math.cos(rad))
      const sy = Math.sign(Math.sin(rad))
      let kante = (laenge * Math.SQRT1_2)
      const zx = naechste(start.x + sx * kante, ziele.xs, schwelle)
      const zy = naechste(start.y + sy * kante, ziele.ys, schwelle)
      let treffer: Treffer = {}
      if (zx !== undefined && (zy === undefined || Math.abs(zx - (start.x + sx * kante)) <= Math.abs(zy - (start.y + sy * kante)))) {
        kante = Math.abs(zx - start.x)
        treffer = { x: zx }
      } else if (zy !== undefined) {
        kante = Math.abs(zy - start.y)
        treffer = { y: zy }
      }
      return { punkt: { x: start.x + sx * kante, y: start.y + sy * kante }, treffer, gerade: true }
    }
  }
  const frei = rastePunkt(ende, ziele, schwelle)
  return { ...frei, gerade: false }
}

/**
 * Rastet das Verschieben einer Form ein: Die Ecken/Mitten der verschobenen Form rasten je Achse auf die
 * Zielgeraden. Gibt die (angepasste) Verschiebung gegenüber dem Ausgangszustand zurück.
 */
export function rasteVerschiebung(
  ausgang: SkizzeElement,
  dx: number,
  dy: number,
  ziele: ZielLinien,
  schwelle: number,
): { dx: number; dy: number; treffer: Treffer } {
  const verschoben = schluesselPunkte(elementVerschieben(ausgang, dx, dy))
  let bestX: { delta: number; ziel: number } | undefined
  let bestY: { delta: number; ziel: number } | undefined
  for (const p of verschoben) {
    for (const z of ziele.xs) {
      const d = z - p.x
      if (Math.abs(d) <= schwelle && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, ziel: z }
    }
    for (const z of ziele.ys) {
      const d = z - p.y
      if (Math.abs(d) <= schwelle && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, ziel: z }
    }
  }
  return {
    dx: dx + (bestX?.delta ?? 0),
    dy: dy + (bestY?.delta ?? 0),
    treffer: { x: bestX?.ziel, y: bestY?.ziel },
  }
}
