/**
 * Skizze auf die Parzelle legen und beim Ändern der Parzelle mitnehmen (Beta 6, Paket 1).
 *
 * Grün-Elemente liegen in Leinwandpixeln; mit der Parzelle gilt `SkizzeDaten.massstab` (Pixel je Meter). Ändert sich die
 * Parzelle (andere Maße, anderer Maßstab), behalten alle Elemente ihre Lage und Größe **in Metern**: Sie werden mit
 * Faktor und Versatz der alten auf die neue Abbildung umgerechnet. Skizzen von vor Beta 6 haben keinen Maßstab; sie werden
 * so auf die Parzelle gelegt, dass ihr Grundstück (sonst die ganze Leinwand) die Parzelle ausfüllt.
 */
import type { SkizzeBauform, SkizzeDaten, SkizzeElement, SkizzeMassangabe, SkizzeMassstab } from '../skizze/types'
import { istGrundlage, neueId } from '../skizze/types'
import { LEINWAND, PFOSTEN_PX, gleicheAbbildung, meterZuPx, pfostenPositionen, rasterMeter, seitenMasse, type Abbildung, type ParzellenLage } from './lage'

const r1 = (n: number) => Math.round(n * 10) / 10

/** Abbildung einer Skizze ohne Maßstab: ihr Grundstück (sonst die ganze Leinwand) steht für die Parzelle, gleichmäßig eingepasst. */
export function altAbbildung(skizze: SkizzeDaten, lage: ParzellenLage): Abbildung {
  const gs = skizze.elemente.find((e): e is SkizzeBauform => e.typ === 'bauform' && e.art === 'grundstueck' && istGrundlage(e))
  const b = skizze.breite ?? 800
  const h = skizze.hoehe ?? 600
  let x = 0
  let y = 0
  let w = b
  let hh = h
  if (gs && gs.punkte.length >= 3) {
    const xs = gs.punkte.map((p) => p.x)
    const ys = gs.punkte.map((p) => p.y)
    x = Math.min(...xs)
    y = Math.min(...ys)
    w = Math.max(...xs) - x
    hh = Math.max(...ys) - y
  }
  const pxProM = Math.min(w / lage.breiteM, hh / lage.hoeheM)
  return { pxProM, ox: x + (w - lage.breiteM * pxProM) / 2, oy: y + (hh - lage.hoeheM * pxProM) / 2 }
}

/** Ein Element von einer Abbildung auf die andere: Lage und Größe in Metern bleiben, Schriftgrößen bleiben. */
export function transformiereElement<T extends SkizzeElement>(el: T, von: Abbildung, nach: Abbildung): T {
  const k = nach.pxProM / von.pxProM
  const X = (x: number) => r1(nach.ox + (x - von.ox) * k)
  const Y = (y: number) => r1(nach.oy + (y - von.oy) * k)
  const L = (v: number) => r1(v * k)
  const e = el as SkizzeElement
  switch (e.typ) {
    case 'rechteck':
    case 'symbol':
      return { ...e, x: X(e.x), y: Y(e.y), breite: L(e.breite), hoehe: L(e.hoehe) } as T
    case 'linie':
    case 'massangabe':
      return { ...e, x1: X(e.x1), y1: Y(e.y1), x2: X(e.x2), y2: Y(e.y2) } as T
    case 'kreis':
      return { ...e, cx: X(e.cx), cy: Y(e.cy), radius: L(e.radius) } as T
    case 'text':
      return { ...e, x: X(e.x), y: Y(e.y) } as T
    case 'bauform':
      return { ...e, punkte: e.punkte.map((p) => ({ x: X(p.x), y: Y(p.y) })) } as T
  }
}

/** Die Elemente der Parzelle als Grundlage: Grundstück, Pfosten und auf Wunsch die Seitenmaße. */
export function parzellenElemente(lage: ParzellenLage): SkizzeElement[] {
  const px = lage.punkte.map((p) => meterZuPx(lage.abb, p))
  const out: SkizzeElement[] = [{ id: neueId(), typ: 'bauform', ebene: 'grundlage', art: 'grundstueck', punkte: px }]
  const h = PFOSTEN_PX / 2
  for (const p of pfostenPositionen(px)) {
    out.push({
      id: neueId(),
      typ: 'bauform',
      ebene: 'grundlage',
      art: 'pfosten',
      punkte: [
        { x: r1(p.x - h), y: r1(p.y - h) },
        { x: r1(p.x + h), y: r1(p.y - h) },
        { x: r1(p.x + h), y: r1(p.y + h) },
        { x: r1(p.x - h), y: r1(p.y + h) },
      ],
    })
  }
  if (lage.massketten) {
    for (const m of seitenMasse(lage)) {
      const el: SkizzeMassangabe = { id: neueId(), typ: 'massangabe', ebene: 'grundlage', x1: m.von.x, y1: m.von.y, x2: m.nach.x, y2: m.nach.y, beschriftung: m.text }
      out.push(el)
    }
  }
  return out
}

/** Gehört das Element zur Parzelle (Grundstück, Pfosten, Seitenmaß der Grundlage)? */
export const istParzellenElement = (e: SkizzeElement): boolean =>
  istGrundlage(e) && (e.typ === 'massangabe' || (e.typ === 'bauform' && (e.art === 'grundstueck' || e.art === 'pfosten')))

/**
 * Skizze auf die Parzelle legen: Elemente in Metern mitnehmen, Leinwand 600 × 825, Maßstab und Raster setzen.
 * Die Elemente der Parzelle selbst (Grundstück, Pfosten, Seitenmaße) werden neu erzeugt; alles andere behält seine Lage in Metern.
 * Ohne Skizze entsteht eine neue mit der Parzelle als Grundlage.
 */
export function legeSkizzeAufParzelle(skizze: SkizzeDaten | undefined, lage: ParzellenLage, jetzt: string): SkizzeDaten {
  const basis: SkizzeDaten = skizze ?? { elemente: [], raster: true }
  const von: Abbildung = basis.massstab ?? altAbbildung(basis, lage)
  const behalten = basis.elemente.filter((e) => !istParzellenElement(e)).map((e) => transformiereElement(e, von, lage.abb))
  const massstab: SkizzeMassstab = { ...lage.abb }
  return {
    ...basis,
    breite: LEINWAND.breite,
    hoehe: LEINWAND.hoehe,
    rasterGroesse: Math.round(rasterMeter(lage.abb.pxProM) * lage.abb.pxProM * 10) / 10,
    raster: basis.raster ?? true,
    massstab,
    elemente: [...parzellenElemente(lage), ...behalten],
    grundlage: basis.grundlage ?? { quelle: 'parzelle', uebernommen: jetzt, gesperrt: true },
  }
}

/** Liegt die Skizze schon auf dieser Parzelle (gleicher Maßstab und gleiche Lage)? */
export const liegtAufParzelle = (skizze: SkizzeDaten | undefined, lage: ParzellenLage): boolean => gleicheAbbildung(skizze?.massstab, lage.abb)
