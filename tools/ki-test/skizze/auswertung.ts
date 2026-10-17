// Vergleich KI-Antwort ↔ soll.json für den Skizzen-Testlauf.
//
// Zuordnung Soll ↔ Ist gierig nach Mittelpunkt-Abstand im Foto (0–1000), Typ muss
// passen (LVP = Terrasse, Zugang = Weg, Beet = Hochbeet zählen als „Typ ähnlich“).
// Zusätzlich: Wird ein neues Element nach der Ausrichtung an derselben Stelle im
// Excel-Blatt gesetzt wie mit dem Soll? (Lagefehler in % der Grundstücksgröße)

import type { Ausrichtung, Rechteck } from './ausrichtung'
import type { Box2d, ElementTyp, SkizzenElement, SkizzenSoll } from './schema'

const GRUPPEN: ElementTyp[][] = [
  ['lvp', 'terrasse'],
  ['zugang', 'weg', 'tor'],
  ['beet', 'hochbeet'],
  ['baum', 'strauch'],
  ['entfernen', 'mangelhinweis', 'text'],
]
const aehnlich = (a: ElementTyp, b: ElementTyp) => a === b || GRUPPEN.some((g) => g.includes(a) && g.includes(b))

const mitte = (b: Box2d) => ({ x: (b[1] + b[3]) / 2, y: (b[0] + b[2]) / 2 })
const abstand = (a: Box2d, b: Box2d) => Math.hypot(mitte(a).x - mitte(b).x, mitte(a).y - mitte(b).y)

export function iou(a: Box2d, b: Box2d): number {
  const ix = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const iy = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const schnitt = ix * iy
  const fl = (r: Box2d) => (r[3] - r[1]) * (r[2] - r[0])
  return schnitt ? schnitt / (fl(a) + fl(b) - schnitt) : 0
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
const beschriftungOk = (soll: string, ist: string) => {
  const a = norm(soll)
  const b = norm(ist)
  return !a || (!!b && (a.includes(b) || b.includes(a)))
}

export interface Paar {
  soll: SkizzenSoll['elemente'][number]
  ist: SkizzenElement
  abstand: number
  iou: number
  typGleich: boolean
  beschriftungOk: boolean
  /** neu laut Ausrichtung der KI-Antwort */
  istNeu?: boolean
  /** Lagefehler im Blatt in % (nur neue Elemente mit beiden Ausrichtungen) */
  lagefehlerProzent?: number
}

export interface SkizzenBewertung {
  soll: number
  ist: number
  treffer: number
  recall: number
  precision: number
  typGleich: number
  beschriftungOk: number
  mittelAbstand: number
  mittelIou: number
  unsicherIst: number
  unsicherSoll: number
  unsicherGetroffen: number
  neuSoll: number
  neuRichtig: number
  mittelLagefehlerNeu: number | null
  paare: Paar[]
  fehlend: SkizzenSoll['elemente']
  zusaetzlich: SkizzenElement[]
}

function emuMitte(r: Rechteck) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function bewerteSkizze(
  soll: SkizzenSoll,
  ist: SkizzenElement[],
  istAusrichtung: Ausrichtung | null,
  sollAusrichtung: Ausrichtung | null,
): SkizzenBewertung {
  const kandidaten: { s: number; i: number; d: number }[] = []
  soll.elemente.forEach((s, si) => {
    const grenze = 60 + 0.5 * Math.max(s.box_2d[2] - s.box_2d[0], s.box_2d[3] - s.box_2d[1])
    ist.forEach((e, ii) => {
      if (!aehnlich(s.typ, e.typ)) return
      const d = abstand(s.box_2d, e.box_2d)
      if (d <= grenze) kandidaten.push({ s: si, i: ii, d: d + (s.typ === e.typ ? 0 : 15) })
    })
  })
  kandidaten.sort((a, b) => a.d - b.d)
  const sBelegt = new Set<number>()
  const iBelegt = new Set<number>()
  const paare: Paar[] = []
  for (const k of kandidaten) {
    if (sBelegt.has(k.s) || iBelegt.has(k.i)) continue
    sBelegt.add(k.s)
    iBelegt.add(k.i)
    const s = soll.elemente[k.s]
    const e = ist[k.i]
    const p: Paar = {
      soll: s,
      ist: e,
      abstand: abstand(s.box_2d, e.box_2d),
      iou: iou(s.box_2d, e.box_2d),
      typGleich: s.typ === e.typ,
      beschriftungOk: beschriftungOk(s.beschriftung, e.beschriftung),
    }
    const zi = istAusrichtung?.zuordnungen.find((z) => z.element === e)
    const zs = sollAusrichtung?.zuordnungen.find((z) => z.element === s)
    if (zi) p.istNeu = zi.neu
    if (zi && zs && s.neu && sollAusrichtung) {
      const gs = sollAusrichtung.grundstueck
      const a = emuMitte(zi.emu)
      const b = emuMitte(zs.emu)
      p.lagefehlerProzent = (Math.hypot((a.x - b.x) / gs.w, (a.y - b.y) / gs.h) / Math.SQRT2) * 100
    }
    paare.push(p)
  }
  const n = paare.length
  const mittel = (f: (p: Paar) => number) => (n ? paare.reduce((s, p) => s + f(p), 0) / n : 0)
  const lage = paare.filter((p) => p.lagefehlerProzent !== undefined)
  return {
    soll: soll.elemente.length,
    ist: ist.length,
    treffer: n,
    recall: soll.elemente.length ? n / soll.elemente.length : 1,
    precision: ist.length ? n / ist.length : 1,
    typGleich: paare.filter((p) => p.typGleich).length,
    beschriftungOk: paare.filter((p) => p.beschriftungOk).length,
    mittelAbstand: mittel((p) => p.abstand),
    mittelIou: mittel((p) => p.iou),
    unsicherIst: ist.filter((e) => e.unsicher).length,
    unsicherSoll: soll.elemente.filter((e) => e.unsicher).length,
    unsicherGetroffen: paare.filter((p) => p.soll.unsicher && p.ist.unsicher).length,
    neuSoll: soll.elemente.filter((e) => e.neu).length,
    neuRichtig: paare.filter((p) => p.soll.neu !== undefined && p.istNeu === p.soll.neu).length,
    mittelLagefehlerNeu: lage.length ? lage.reduce((s, p) => s + p.lagefehlerProzent!, 0) / lage.length : null,
    paare,
    fehlend: soll.elemente.filter((_, i) => !sBelegt.has(i)),
    zusaetzlich: ist.filter((_, i) => !iBelegt.has(i)),
  }
}
