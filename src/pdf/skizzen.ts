/**
 * Skizzen als Vektorgrafik ins PDF.
 *
 * - Grün-Skizze („Skizze Außenanlage-Aufwuchs“): dieselben Zeichenbefehle wie Editor und PNG-Export
 *   (`skizzeAufContext`), nur auf einen PDF-Kontext statt auf einen Canvas.
 * - Grundriss („Skizze Bau“): dieselben Formen wie der Excel-Export, gezeichnet von `grundrissAufContext`.
 */
import type { PDFPage } from 'pdf-lib'
import { EMU_PRO_PT, grundrissAufContext } from '../skizze/grundrissZeichnen'
import { skizzeAufContext } from '../skizze/skizzePng'
import type { SkizzeDaten } from '../skizze/types'
import type { GrundrissDaten } from '../skizze/grundriss'
import type { ParzellenLage } from '../parzelle/lage'
import type { Rechteck } from './blatt'
import { PdfKontext } from './kontext'
import type { Schriften } from './schrift'

type Lib = typeof import('pdf-lib')

/** Abstand der Zeichnung vom Rand des Rahmens (pt). */
const RAND = 6

export interface SkizzeLage {
  /** Wo die Zeichnung liegt (Seitenkoordinaten) – für Prüfungen. */
  rechteck: Rechteck
  /** Maßstab Skizzeneinheit → pt. */
  massstab: number
}

/** Grün-Skizze in den Rahmen `r` zeichnen (Seitenseitenkoordinaten, von oben). */
export function zeichneGruenSkizze(lib: Lib, seite: PDFPage, schriften: Schriften, skizze: SkizzeDaten, r: Rechteck): SkizzeLage {
  const bw = skizze.breite ?? 800
  const bh = skizze.hoehe ?? 600
  const s = Math.min((r.w - 2 * RAND) / bw, (r.h - 2 * RAND) / bh)
  const ox = r.x + (r.w - bw * s) / 2
  const oy = r.y + (r.h - bh * s) / 2
  const ctx = new PdfKontext(lib, seite, schriften, ox, oy, s)
  // Ohne Hintergrund und ohne Raster: Rahmen und Fläche kommen vom Blatt bzw. von der Grundlage
  skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, skizze, bw, bh, { transparent: true })
  return { rechteck: { x: ox, y: oy, w: bw * s, h: bh * s }, massstab: s }
}

/** Grundriss samt Maßketten und Massenberechnung in den Rahmen `r` zeichnen. */
export function zeichneGrundriss(
  lib: Lib,
  seite: PDFPage,
  schriften: Schriften,
  daten: GrundrissDaten,
  bauteile: ReadonlyArray<{ id: string; kuerzel: string }>,
  r: Rechteck,
  parzelle?: ParzellenLage,
): SkizzeLage | undefined {
  const innen: Rechteck = { x: r.x + RAND, y: r.y + RAND, w: r.w - 2 * RAND, h: r.h - 2 * RAND }
  // Einheit des Kontexts: EMU; Maßstab 1/12700 macht daraus pt
  const ctx = new PdfKontext(lib, seite, schriften, innen.x, innen.y, 1 / EMU_PRO_PT)
  if (!grundrissAufContext(ctx as unknown as CanvasRenderingContext2D, daten, bauteile, innen.w, innen.h, parzelle)) return undefined
  return { rechteck: innen, massstab: 1 }
}
