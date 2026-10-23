/**
 * Lage der Parzelle im Skizzenkasten – für „Skizze Bau“ und „Skizze Grün“ gleich (Beta 6, Paket 1).
 *
 * Die Parzelle (in Metern, links oben bei (0, 0)) füllt den Skizzenkasten der Vorlage (B7:G48, 452 × 622 pt) mit
 * Rand: ein einziger Maßstab `pxProM` und ein Versatz `ox`/`oy` auf der Leinwand der Grün-Skizze (600 × 825 px, das
 * Seitenverhältnis des Kastens). Der Grundriss des Bau-Teils liegt in denselben Metern, die Grün-Elemente in denselben
 * Pixeln; der Excel-Export rechnet beide Blätter mit derselben Leinwand-zu-Kasten-Abbildung um, die Parzelle landet
 * auf beiden Blättern an derselben Stelle in derselben Größe.
 */
import { loese, seitenLaenge, type GPunkt } from './geometrie'
import type { Parzelle } from './types'

/** Höhe : Breite des Zeichenbereichs B7:G48 der Vorlage (452,25 × 621,75 pt). */
export const VORLAGE_SEITENVERHAELTNIS = 1.3748
/** Leinwand der Grün-Skizze mit Parzelle (Pixel). */
export const LEINWAND = { breite: 600, hoehe: Math.round(600 * VORLAGE_SEITENVERHAELTNIS) } as const
/** Rand der Parzelle zum Rand des Kastens als Anteil der Breite (8 pt von 452 pt, Skill parzellen-skizze). */
export const RAND_ANTEIL = 8 / 452
/** Pixel je Punkt (pt) des Excel-Blatts auf der Leinwand. */
export const PX_PRO_PT = LEINWAND.breite / 452

/** Abbildung Meter → Leinwandpixel: `px = ox + m · pxProM`. */
export interface Abbildung {
  pxProM: number
  ox: number
  oy: number
}

export interface ParzellenLage {
  /** Ecken in Metern, links oben (kleinstes x und y) bei (0, 0). */
  punkte: GPunkt[]
  breiteM: number
  hoeheM: number
  flaecheM2: number
  seiten: number[]
  abb: Abbildung
  /** Seitenlängen als Maßlinien zeichnen. */
  massketten: boolean
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Maßstab und Versatz, mit denen eine Fläche von `breiteM` × `hoeheM` die Leinwand mit Rand füllt (zentriert). */
export function abbildungFuer(breiteM: number, hoeheM: number, leinwand: { breite: number; hoehe: number } = LEINWAND): Abbildung {
  const rand = leinwand.breite * RAND_ANTEIL
  const pxProM = Math.min((leinwand.breite - 2 * rand) / Math.max(0.01, breiteM), (leinwand.hoehe - 2 * rand) / Math.max(0.01, hoeheM))
  return {
    pxProM,
    ox: (leinwand.breite - breiteM * pxProM) / 2,
    oy: (leinwand.hoehe - hoeheM * pxProM) / 2,
  }
}

/** Lage einer fertig berechneten Parzelle; `undefined`, solange Maße fehlen. */
export function parzellenLage(p: Parzelle | undefined): ParzellenLage | undefined {
  if (!p) return undefined
  const l = loese(p)
  if (l.status !== 'fertig' || !l.breite || !l.hoehe) return undefined
  return {
    punkte: l.punkte,
    breiteM: l.breite,
    hoeheM: l.hoehe,
    flaecheM2: l.flaeche ?? 0,
    seiten: l.punkte.map((_q, i) => seitenLaenge(l.punkte, i)),
    abb: abbildungFuer(l.breite, l.hoehe),
    massketten: p.massketten === true,
  }
}

/** Meter → Leinwandpixel (auf 0,1 px gerundet; so liegen Grundlage und Export auf denselben Zahlen). */
export const meterZuPx = (a: Abbildung, p: GPunkt): GPunkt => ({ x: r1(a.ox + p.x * a.pxProM), y: r1(a.oy + p.y * a.pxProM) })
/** Leinwandpixel → Meter. */
export const pxZuMeter = (a: Abbildung, p: GPunkt): GPunkt => ({ x: (p.x - a.ox) / a.pxProM, y: (p.y - a.oy) / a.pxProM })

export const gleicheAbbildung = (a: Abbildung | undefined, b: Abbildung | undefined): boolean =>
  Boolean(a && b && Math.abs(a.pxProM - b.pxProM) < 1e-6 && Math.abs(a.ox - b.ox) < 1e-6 && Math.abs(a.oy - b.oy) < 1e-6)

/**
 * Kantenlänge eines Rasterkästchens in m: das kleinste von 1, 2, 5, 10, 20 m, das auf der Leinwand mindestens 25 px
 * breit ist. Beide Editoren und der Hinweis „1 Kästchen = … m“ benutzen es, dann gilt in beiden derselbe Maßstab.
 */
export function rasterMeter(pxProM: number): number {
  for (const m of [1, 2, 5, 10, 20]) if (m * pxProM >= 25) return m
  return 50
}

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
/** „1 Kästchen = 2 m“ */
export const massstabText = (pxProM: number): string => `1 Kästchen = ${DE.format(rasterMeter(pxProM))} m`

/** Mittelpunkte der Zaunpfosten auf der Leinwand: Ecken und gleichmäßig verteilt (etwa alle 110 pt des Blatts). */
export function pfostenPositionen(polygonPx: readonly GPunkt[]): GPunkt[] {
  const out: GPunkt[] = []
  const n = polygonPx.length
  for (let i = 0; i < n; i++) {
    const a = polygonPx[i]
    const b = polygonPx[(i + 1) % n]
    const laenge = Math.hypot(b.x - a.x, b.y - a.y)
    const teile = Math.max(1, Math.round(laenge / (110 * PX_PRO_PT)))
    for (let k = 0; k < teile; k++) out.push({ x: r1(a.x + ((b.x - a.x) * k) / teile), y: r1(a.y + ((b.y - a.y) * k) / teile) })
  }
  return out
}

/** Kante eines Zaunpfostens in px (5 pt des Blatts). */
export const PFOSTEN_PX = 5 * PX_PRO_PT

export interface SeitenMass {
  von: GPunkt
  nach: GPunkt
  text: string
}

/** Seitenlängen als Maßlinien, 14 pt innerhalb der Parzelle, in Leinwandpixeln. Sehr kurze Seiten entfallen. */
export function seitenMasse(lage: ParzellenLage): SeitenMass[] {
  const px = lage.punkte.map((p) => meterZuPx(lage.abb, p))
  let flaeche2 = 0
  for (let i = 0; i < px.length; i++) {
    const a = px[i]
    const b = px[(i + 1) % px.length]
    flaeche2 += a.x * b.y - b.x * a.y
  }
  const uhrzeiger = flaeche2 > 0 // y nach unten: positiv = im Uhrzeigersinn
  const versatz = 14 * PX_PRO_PT
  const out: SeitenMass[] = []
  px.forEach((a, i) => {
    const b = px[(i + 1) % px.length]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l < 60 * PX_PRO_PT / 1.5) return
    // Innenseite: bei Uhrzeigersinn liegt sie rechts von a→b
    const nx = ((b.y - a.y) / l) * (uhrzeiger ? -1 : 1)
    const ny = ((a.x - b.x) / l) * (uhrzeiger ? -1 : 1)
    out.push({
      von: { x: r1(a.x + nx * versatz), y: r1(a.y + ny * versatz) },
      nach: { x: r1(b.x + nx * versatz), y: r1(b.y + ny * versatz) },
      text: `${DE.format(Math.round(lage.seiten[i] * 100) / 100)} m`,
    })
  })
  return out
}
