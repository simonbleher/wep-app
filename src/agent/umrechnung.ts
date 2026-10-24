/**
 * Umrechnung zwischen Skizzenpixeln und Metern auf der Parzelle für die Agent-Schnittstelle.
 *
 * Die Skizze liegt mit Parzelle auf `SkizzeDaten.massstab` (`px = ox + Meter · pxProM`). Ohne Parzelle gilt – wie überall in
 * der App – eine Zeichenfläche von 20 × 15 m (bei 800 × 600 px also 40 px je Meter).
 */
import type { Wep } from '../model/types'
import type { Abbildung } from '../parzelle/lage'
import { pxZuMeter } from '../parzelle/lage'
import { STANDARD_GROESSE } from '../skizze/szene'
import type { SkizzeDaten, SkizzeElement, SymbolArt } from '../skizze/types'
import { SYMBOL_ARTEN, istGrundlage } from '../skizze/types'
import { lageVon } from '../parzelle'
import type { FormatElement, MPunkt } from './format'

/** Breite der Standardleinwand in Metern, wenn keine Parzelle gilt. */
export const STANDARD_BREITE_M = 20

/** Pt des Excel-Blatts je Meter, auf die die Standardgrößen der Symbole bezogen sind (445 pt ≙ 20 m). */
const PT_PRO_M = 445 / STANDARD_BREITE_M

export interface SkizzenAbbildung {
  abb: Abbildung
  /** Die Skizze liegt auf der Parzelle (sonst gilt die Standardleinwand 20 × 15 m). */
  mitParzelle: boolean
  /** Größe der Zeichenfläche in Metern. */
  flaecheM: { breite: number; hoehe: number }
}

export const r2 = (n: number): number => Math.round(n * 100) / 100
export const r1 = (n: number): number => Math.round(n * 10) / 10

export function abbildungFuer(wep: Pick<Wep, 'parzelle'>, skizze: SkizzeDaten | undefined): SkizzenAbbildung {
  const breite = skizze?.breite ?? 800
  const hoehe = skizze?.hoehe ?? 600
  if (skizze?.massstab) {
    const abb = skizze.massstab
    return { abb, mitParzelle: true, flaecheM: { breite: r2(breite / abb.pxProM), hoehe: r2(hoehe / abb.pxProM) } }
  }
  // Ohne Maßstab in der Skizze, aber mit Parzelle: die leere Skizze würde auf die Parzelle gelegt (siehe skizzeMitParzelle)
  const lage = lageVon(wep)
  if (lage && (!skizze || skizze.elemente.length === 0)) {
    return { abb: lage.abb, mitParzelle: true, flaecheM: { breite: r2(breite / lage.abb.pxProM), hoehe: r2(hoehe / lage.abb.pxProM) } }
  }
  const pxProM = breite / STANDARD_BREITE_M
  return { abb: { pxProM, ox: 0, oy: 0 }, mitParzelle: false, flaecheM: { breite: STANDARD_BREITE_M, hoehe: r2(hoehe / pxProM) } }
}

export const mZuPx = (a: Abbildung, m: MPunkt): { x: number; y: number } => ({ x: r1(a.ox + m.x * a.pxProM), y: r1(a.oy + m.y * a.pxProM) })
export const pxZuM = (a: Abbildung, p: { x: number; y: number }): MPunkt => {
  const m = pxZuMeter(a, p)
  return { x: r2(m.x), y: r2(m.y) }
}

/** Standardgröße eines Symbols in Metern. */
export function standardgroesseM(art: SymbolArt): { breite: number; hoehe: number } {
  const [b, h] = STANDARD_GROESSE[art]
  return { breite: r2(b / PT_PRO_M), hoehe: r2(h / PT_PRO_M) }
}

const istSymbolArt = (t: string): t is SymbolArt => (SYMBOL_ARTEN as readonly string[]).includes(t)

/** Ein vorhandenes Grün-Element im Format `wep-skizze/2` (Meter, Mittelpunkt); Bau-Formen der Grundlage geben `null`. */
export function elementZuFormat(el: SkizzeElement, a: Abbildung, pxPt = 1): FormatElement | null {
  const L = (px: number) => r2(px / a.pxProM)
  const mitte = (x: number, y: number, b: number, h: number) => pxZuM(a, { x: x + b / 2, y: y + h / 2 })
  const stil = (e: { fuellung?: string; linie?: string; linienart?: string; linienbreite?: number; name?: string }) => ({
    ...(e.name ? { name: e.name } : {}),
    ...(e.fuellung ? { fuellung: e.fuellung } : {}),
    ...(e.linie ? { linie: e.linie } : {}),
    ...(e.linienart ? { linienart: e.linienart as FormatElement['linienart'] } : {}),
    ...(e.linienbreite ? { linienbreite: e.linienbreite } : {}),
  })
  const bezug = (e: SkizzeElement) => (e.bezug ? { bezug: { liste: e.bezug.liste, id: e.bezug.id } } : {})
  switch (el.typ) {
    case 'bauform':
      return null
    case 'symbol': {
      const m = mitte(el.x, el.y, el.breite, el.hoehe)
      return {
        typ: 'symbol',
        art: el.art,
        id: el.id,
        ...m,
        breite: L(el.breite),
        hoehe: L(el.hoehe),
        ...(el.beschriftung ? { beschriftung: el.beschriftung } : {}),
        ...bezug(el),
      }
    }
    case 'rechteck': {
      const m = mitte(el.x, el.y, el.breite, el.hoehe)
      return { typ: 'rechteck', id: el.id, ...m, breite: L(el.breite), hoehe: L(el.hoehe), ...(el.beschriftung ? { beschriftung: el.beschriftung } : {}), ...stil(el), ...bezug(el) }
    }
    case 'kreis': {
      const ry = el.radiusY ?? el.radius
      const m = pxZuM(a, { x: el.cx, y: el.cy })
      return { typ: 'ellipse', id: el.id, ...m, breite: L(2 * el.radius), hoehe: L(2 * ry), ...(el.beschriftung ? { beschriftung: el.beschriftung } : {}), ...stil(el), ...bezug(el) }
    }
    case 'vieleck':
      return {
        typ: 'vieleck',
        id: el.id,
        punkte: el.punkte.map((p) => pxZuM(a, p)),
        ...(el.offen ? { offen: true } : {}),
        ...(el.beschriftung ? { beschriftung: el.beschriftung } : {}),
        ...stil(el),
        ...bezug(el),
      }
    case 'linie':
      return {
        typ: 'linie',
        id: el.id,
        von: pxZuM(a, { x: el.x1, y: el.y1 }),
        nach: pxZuM(a, { x: el.x2, y: el.y2 }),
        ...(el.name ? { name: el.name } : {}),
        ...(el.farbe ? { farbe: el.farbe } : {}),
        ...(el.linienart ? { linienart: el.linienart } : {}),
        ...(el.linienbreite ? { linienbreite: el.linienbreite } : {}),
        ...(el.pfeil ? { pfeil: true } : {}),
        ...bezug(el),
      }
    case 'massangabe':
      return {
        typ: 'massangabe',
        id: el.id,
        von: pxZuM(a, { x: el.x1, y: el.y1 }),
        nach: pxZuM(a, { x: el.x2, y: el.y2 }),
        beschriftung: el.beschriftung,
        ...(el.name ? { name: el.name } : {}),
        ...(el.farbe ? { farbe: el.farbe } : {}),
      }
    case 'text': {
      const gr = el.schriftgroesse ?? 14
      const m = pxZuM(a, { x: el.x + (el.inhalt.length * gr * 0.55) / 2, y: el.y + (gr + 4) / 2 })
      return {
        typ: 'text',
        id: el.id,
        ...m,
        inhalt: el.inhalt,
        ...(el.name ? { name: el.name } : {}),
        ...(el.farbe ? { farbe: el.farbe } : {}),
        ...(el.schriftgroesse ? { groesse: Math.round((el.schriftgroesse / pxPt) * 10) / 10 } : {}),
        ...bezug(el),
      }
    }
  }
}

/** Alle Grün-Elemente (ohne Grundlage) der Skizze im Vorschlagsformat. */
export function gruenZuFormat(skizze: SkizzeDaten | undefined, a: Abbildung): FormatElement[] {
  const pxPt = (skizze?.breite ?? 800) / 452
  return (skizze?.elemente ?? []).filter((e) => !istGrundlage(e)).flatMap((e) => elementZuFormat(e, a, pxPt) ?? [])
}

export { istSymbolArt }
