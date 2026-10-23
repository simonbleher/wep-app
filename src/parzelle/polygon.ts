// Kleine Polygon-Hilfen für die Parzelle (Meter).
import type { GPunkt } from './geometrie'

/** Abstand eines Punktes von der Strecke a–b. */
function abstandZuStrecke(p: GPunkt, a: GPunkt, b: GPunkt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Liegt der Punkt im Polygon (Strahlverfahren), den Rand mit `spiel` Metern Toleranz eingeschlossen? */
export function punktImPolygon(p: GPunkt, punkte: readonly GPunkt[], spiel = 0): boolean {
  for (let i = 0; i < punkte.length; i++) {
    if (abstandZuStrecke(p, punkte[i], punkte[(i + 1) % punkte.length]) <= spiel) return true
  }
  let innen = false
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[i]
    const b = punkte[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) innen = !innen
  }
  return innen
}

/** Flächenschwerpunkt (bei entartetem Polygon der Mittelwert der Ecken). */
export function schwerpunkt(punkte: readonly GPunkt[]): GPunkt {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i]
    const q = punkte[(i + 1) % punkte.length]
    const k = p.x * q.y - q.x * p.y
    a += k
    cx += (p.x + q.x) * k
    cy += (p.y + q.y) * k
  }
  if (Math.abs(a) < 1e-9) return { x: punkte.reduce((s, p) => s + p.x, 0) / punkte.length, y: punkte.reduce((s, p) => s + p.y, 0) / punkte.length }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}
