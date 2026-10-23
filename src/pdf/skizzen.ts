/**
 * Skizzen als Vektorgrafik ins PDF.
 *
 * - Grün-Skizze („Skizze Außenanlage-Aufwuchs“): dieselben Zeichenbefehle wie Editor und PNG-Export
 *   (`skizzeAufContext`), nur auf einen PDF-Kontext statt auf einen Canvas.
 * - Grundriss („Skizze Bau“): dieselben Formen wie der Excel-Export (`grundrissZuFormen`), als Flächen, Linien und Text.
 */
import type { PDFPage } from 'pdf-lib'
import { grundrissZuFormen } from '../export/grundrissFormen'
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

const EMU_PRO_PT = 12700
const FARBE = { grundstueck: '#E2F0D9', grundstueckLinie: '#595959', gebaeude: '#E7E6E6', dunkel: '#262626', rot: '#C00000', tabelleLinie: '#7F7F7F', schwarz: '#000000' }

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
  const formen = grundrissZuFormen(daten, { x: 0, y: 0, w: Math.round(innen.w * EMU_PRO_PT), h: Math.round(innen.h * EMU_PRO_PT) }, bauteile, { parzelle })
  if (!formen.length) return undefined
  // Einheit des Kontexts: EMU; Maßstab 1/12700 macht daraus pt
  const ctx = new PdfKontext(lib, seite, schriften, innen.x, innen.y, 1 / EMU_PRO_PT)
  const pt = (n: number) => n * EMU_PRO_PT
  const schrift = (groessePt: number, fett = false) => `${fett ? 'bold ' : ''}${pt(groessePt)}px Arial`

  for (const f of formen) {
    if ((f.typ === 'grundstueck' || f.typ === 'pfosten') && (f.kasten || f.punkte)) {
      // Parzelle (Beta 6, Paket 1): Grundstück hell, Pfosten weiß – wie im Excel-Blatt
      ctx.save()
      ctx.beginPath()
      if (f.punkte && f.punkte.length >= 3) {
        f.punkte.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.closePath()
      } else {
        const k = f.kasten!
        ctx.rect(k.x, k.y, k.w, k.h)
      }
      ctx.fillStyle = f.typ === 'pfosten' ? '#FFFFFF' : FARBE.grundstueck
      ctx.fill()
      ctx.strokeStyle = FARBE.grundstueckLinie
      ctx.lineWidth = pt(f.typ === 'pfosten' ? 0.75 : 1)
      ctx.stroke()
      ctx.restore()
    } else if (f.typ === 'bauteil' && f.punkte && f.punkte.length >= 3) {
      ctx.save()
      ctx.beginPath()
      f.punkte.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      if (!f.gestrichelt) {
        ctx.fillStyle = FARBE.gebaeude
        ctx.fill()
      }
      ctx.strokeStyle = FARBE.dunkel
      ctx.lineWidth = pt(1.5)
      if (f.gestrichelt) ctx.setLineDash([pt(5), pt(3.5)])
      ctx.stroke()
      ctx.restore()
      const xs = f.punkte.map((p) => p.x)
      const ys = f.punkte.map((p) => p.y)
      const zeilen = (f.text ?? '').split('\n')
      const gr = f.schriftPt ?? 11
      ctx.save()
      ctx.fillStyle = FARBE.schwarz
      ctx.font = schrift(gr)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const mx = (Math.min(...xs) + Math.max(...xs)) / 2
      const my = (Math.min(...ys) + Math.max(...ys)) / 2
      zeilen.forEach((z, i) => ctx.fillText(z, mx, my + (i - (zeilen.length - 1) / 2) * pt(gr * 1.2)))
      ctx.restore()
    } else if (f.typ === 'massangabe' && f.von && f.nach) {
      ctx.save()
      ctx.strokeStyle = FARBE.rot
      ctx.lineWidth = pt(0.75)
      const dx = f.nach.x - f.von.x
      const dy = f.nach.y - f.von.y
      const laenge = Math.hypot(dx, dy) || 1
      const nx = (-dy / laenge) * pt(4)
      const ny = (dx / laenge) * pt(4)
      for (const [a, b] of [
        [f.von, f.nach],
        [
          { x: f.von.x - nx, y: f.von.y - ny },
          { x: f.von.x + nx, y: f.von.y + ny },
        ],
        [
          { x: f.nach.x - nx, y: f.nach.y - ny },
          { x: f.nach.x + nx, y: f.nach.y + ny },
        ],
      ] as const) {
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      if (f.text) {
        const gr = f.schriftPt ?? 9
        ctx.fillStyle = FARBE.rot
        ctx.font = schrift(gr)
        const mx = (f.von.x + f.nach.x) / 2
        const my = (f.von.y + f.nach.y) / 2
        if (Math.abs(dx) >= Math.abs(dy)) {
          ctx.textAlign = 'center'
          ctx.textBaseline = 'alphabetic'
          ctx.fillText(f.text, mx, f.textUnten ? my + pt(gr + 1) : my - pt(2))
        } else {
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillText(f.text, mx + pt(4), my)
        }
      }
      ctx.restore()
    } else if (f.typ === 'massenberechnung' && f.kasten) {
      const k = f.kasten
      ctx.save()
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(k.x, k.y, k.w, k.h)
      ctx.strokeStyle = FARBE.tabelleLinie
      ctx.lineWidth = pt(0.75)
      ctx.strokeRect(k.x, k.y, k.w, k.h)
      const gr = f.schriftPt ?? 8
      ctx.fillStyle = FARBE.schwarz
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ;(f.text ?? '').split('\n').forEach((z, i) => {
        ctx.font = schrift(gr, i === 0)
        ctx.fillText(z, k.x + pt(4), k.y + pt(3 + gr) + i * pt(11))
      })
      ctx.restore()
    }
  }
  return { rechteck: innen, massstab: 1 }
}
