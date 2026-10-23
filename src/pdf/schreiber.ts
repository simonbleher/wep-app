/**
 * Zeichenbefehle (`Op`) in eine PDF-Seite schreiben. Alles bleibt Vektor: Linien, Flächen und Text.
 */
import type { PDFPage, PDFFont } from 'pdf-lib'
import type { Op } from './blatt'
import { kodierbar, schriftFuer, type Schriften } from './schrift'

type Lib = typeof import('pdf-lib')

export function farbeAusHex(lib: Lib, hex: string) {
  const h = hex.replace('#', '').slice(-6).padStart(6, '0')
  return lib.rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)
}

export function zeichneOps(lib: Lib, seite: PDFPage, ops: Op[], schriften: Schriften): void {
  const H = seite.getHeight()
  const Y = (y: number) => H - y
  for (const op of ops) {
    switch (op.t) {
      case 'fuellung':
        seite.drawRectangle({ x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h, color: farbeAusHex(lib, op.farbe), borderWidth: 0 })
        break
      case 'kasten':
        seite.drawRectangle({ x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h, borderColor: farbeAusHex(lib, op.farbe), borderWidth: op.breite })
        break
      case 'linie':
        seite.drawLine({
          start: { x: op.x1, y: Y(op.y1) },
          end: { x: op.x2, y: Y(op.y2) },
          thickness: op.breite,
          color: farbeAusHex(lib, op.farbe),
          ...(op.strich ? { dashArray: op.strich, dashPhase: 0 } : {}),
        })
        break
      case 'text': {
        const font: PDFFont = schriftFuer(schriften, op.fett, op.kursiv)
        const text = kodierbar(op.s)
        const farbe = farbeAusHex(lib, op.farbe)
        const k = op.klammer
        if (k) {
          seite.pushOperators(
            lib.pushGraphicsState(),
            lib.rectangle(k.x, Y(k.y + k.h), k.w, k.h),
            lib.clip(),
            lib.endPath(),
          )
        }
        seite.drawText(text, {
          x: op.x,
          y: Y(op.y),
          size: op.groesse,
          font,
          color: farbe,
          ...(op.drehung ? { rotate: lib.degrees(op.drehung) } : {}),
        })
        if (op.unterstrichen) {
          const b = font.widthOfTextAtSize(text, op.groesse)
          const rad = ((op.drehung ?? 0) * Math.PI) / 180
          const dy = -op.groesse * 0.12
          seite.drawLine({
            start: { x: op.x - Math.sin(rad) * dy, y: Y(op.y) + Math.cos(rad) * dy },
            end: { x: op.x + Math.cos(rad) * b - Math.sin(rad) * dy, y: Y(op.y) + Math.sin(rad) * b + Math.cos(rad) * dy },
            thickness: Math.max(0.4, op.groesse / 20),
            color: farbe,
          })
        }
        if (k) seite.pushOperators(lib.popGraphicsState())
        break
      }
    }
  }
}
