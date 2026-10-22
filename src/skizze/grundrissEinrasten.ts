/**
 * Einrasten im Grundriss (Beta 4, Paket 3): Ecken und Kanten anderer Teile, gerade Richtungen und – wo nichts
 * einrastet – ein 5-cm-Raster, damit gezeichnete Maße nicht auf Millimeter genau „krumm“ werden.
 *
 * Baut auf `einrasten.ts` (Beta 3, Paket 7) auf: gleiche Zielgeraden und Fangbereiche, gerechnet wird in Metern.
 * Reine Rechnung; der Schalter „Einrasten“ des Editors schaltet alles ab.
 */

import type { GPunkt, GrundrissTeil } from './grundriss.js'
import { cm } from './grundriss.js'
import { rastePunkt, rasteLinienEnde, type Treffer, type ZielLinien } from './einrasten.js'

/** Raster in m für freie Punkte. */
export const RASTER_M = 0.05

/** Zielgeraden: Ecken aller Teile außer `ausschluss`. */
export function zielLinienTeile(teile: readonly GrundrissTeil[], ausschluss: ReadonlySet<string> = new Set()): ZielLinien {
  const xs = new Set<number>()
  const ys = new Set<number>()
  for (const t of teile) {
    if (ausschluss.has(t.id)) continue
    for (const p of t.punkte) {
      xs.add(p.x)
      ys.add(p.y)
    }
  }
  return { xs: [...xs], ys: [...ys] }
}

const aufRaster = (v: number) => cm(Math.round(v / RASTER_M) * RASTER_M)

/** Punkt einrasten: je Achse auf eine Zielgerade, sonst auf das 5-cm-Raster. */
export function rastePunktM(p: GPunkt, ziele: ZielLinien, schwelle: number): { punkt: GPunkt; treffer: Treffer } {
  const r = rastePunkt(p, ziele, schwelle)
  return {
    punkt: { x: r.treffer.x !== undefined ? r.punkt.x : aufRaster(p.x), y: r.treffer.y !== undefined ? r.punkt.y : aufRaster(p.y) },
    treffer: r.treffer,
  }
}

/** Nächste Ecke eines Polygons nach `ende`: gerade Richtung zum Anfang (0°/45°/90°), dann Zielgeraden, dann Raster. */
export function rasteEckeM(start: GPunkt, ende: GPunkt, ziele: ZielLinien, schwelle: number): { punkt: GPunkt; treffer: Treffer } {
  const r = rasteLinienEnde(start, ende, ziele, schwelle)
  if (r.gerade) {
    // gerade Richtung bleibt erhalten: nur die freie Koordinate aufs Raster, wenn nichts einrastet
    const dx = r.punkt.x - start.x
    const dy = r.punkt.y - start.y
    const waagerecht = Math.abs(dy) < 1e-9
    const senkrecht = Math.abs(dx) < 1e-9
    if (waagerecht && r.treffer.x === undefined) return { punkt: { x: aufRaster(r.punkt.x), y: r.punkt.y }, treffer: r.treffer }
    if (senkrecht && r.treffer.y === undefined) return { punkt: { x: r.punkt.x, y: aufRaster(r.punkt.y) }, treffer: r.treffer }
    return { punkt: { x: cm(r.punkt.x), y: cm(r.punkt.y) }, treffer: r.treffer }
  }
  return rastePunktM(ende, ziele, schwelle)
}

/**
 * Verschieben eines Teils einrasten: Die Ecken des verschobenen Teils rasten je Achse auf die Zielgeraden ein.
 * Gibt die angepasste Verschiebung zurück; ohne Treffer bleibt die Verschiebung auf dem 5-cm-Raster.
 */
export function rasteVerschiebungM(
  punkte: readonly GPunkt[],
  dx: number,
  dy: number,
  ziele: ZielLinien,
  schwelle: number,
): { dx: number; dy: number; treffer: Treffer } {
  let bestX: { delta: number; ziel: number } | undefined
  let bestY: { delta: number; ziel: number } | undefined
  for (const p of punkte) {
    const x = p.x + dx
    const y = p.y + dy
    for (const z of ziele.xs) {
      const d = z - x
      if (Math.abs(d) <= schwelle && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, ziel: z }
    }
    for (const z of ziele.ys) {
      const d = z - y
      if (Math.abs(d) <= schwelle && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, ziel: z }
    }
  }
  return {
    dx: cm(bestX ? dx + bestX.delta : aufRaster(dx)),
    dy: cm(bestY ? dy + bestY.delta : aufRaster(dy)),
    treffer: { x: bestX?.ziel, y: bestY?.ziel },
  }
}
