// Grundriss („Skizze Bau“) auf einen Zeichenkontext mit der Canvas-API: dieselben Formen wie der Excel-Export
// (`grundrissZuFormen`) als Flächen, Linien und Text. Genutzt vom PDF (über `PdfKontext`) und als Bild in der App
// (Übersicht, BV-Kontrollseite) über einen echten Canvas.
import { grundrissZuFormen } from '../export/grundrissFormen'
import type { GrundrissDaten } from './grundriss'
import type { ParzellenLage } from '../parzelle/lage'

export const EMU_PRO_PT = 12700
const FARBE = { grundstueck: '#E2F0D9', grundstueckLinie: '#595959', gebaeude: '#E7E6E6', dunkel: '#262626', rot: '#C00000', tabelleLinie: '#7F7F7F', schwarz: '#000000' }

/**
 * Zeichnet den Grundriss in eine Fläche von `breitePt` × `hoehePt` (Ursprung oben links). Der Kontext muss in EMU
 * rechnen (1 pt = 12700 EMU), also vorher entsprechend skaliert sein. `false`, wenn es nichts zu zeichnen gibt.
 */
export function grundrissAufContext(
  ctx: CanvasRenderingContext2D,
  daten: GrundrissDaten,
  bauteile: ReadonlyArray<{ id: string; kuerzel: string }>,
  breitePt: number,
  hoehePt: number,
  parzelle?: ParzellenLage,
): boolean {
  const formen = grundrissZuFormen(daten, { x: 0, y: 0, w: Math.round(breitePt * EMU_PRO_PT), h: Math.round(hoehePt * EMU_PRO_PT) }, bauteile, { parzelle })
  if (!formen.length) return false
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
  return true
}

/**
 * Canvas-Kontext, der in EMU gerufen wird und in Pixeln zeichnet. Rechnet Koordinaten, Linienbreiten, Strichmuster und
 * Schriftgrößen selbst um, statt den Canvas zu skalieren (Schriftgrößen in EMU wären riesig).
 */
class EmuKontext {
  constructor(
    private readonly c: CanvasRenderingContext2D,
    private readonly k: number,
  ) {}
  set fillStyle(v: string) { this.c.fillStyle = v }
  set strokeStyle(v: string) { this.c.strokeStyle = v }
  set lineWidth(v: number) { this.c.lineWidth = v * this.k }
  set textAlign(v: CanvasTextAlign) { this.c.textAlign = v }
  set textBaseline(v: CanvasTextBaseline) { this.c.textBaseline = v }
  set font(v: string) { this.c.font = v.replace(/([\d.]+)px/, (_, n: string) => `${Number(n) * this.k}px`) }
  save() { this.c.save() }
  restore() { this.c.restore() }
  beginPath() { this.c.beginPath() }
  closePath() { this.c.closePath() }
  moveTo(x: number, y: number) { this.c.moveTo(x * this.k, y * this.k) }
  lineTo(x: number, y: number) { this.c.lineTo(x * this.k, y * this.k) }
  rect(x: number, y: number, w: number, h: number) { this.c.rect(x * this.k, y * this.k, w * this.k, h * this.k) }
  fill() { this.c.fill() }
  stroke() { this.c.stroke() }
  setLineDash(d: number[]) { this.c.setLineDash(d.map((x) => x * this.k)) }
  fillRect(x: number, y: number, w: number, h: number) { this.c.fillRect(x * this.k, y * this.k, w * this.k, h * this.k) }
  strokeRect(x: number, y: number, w: number, h: number) { this.c.strokeRect(x * this.k, y * this.k, w * this.k, h * this.k) }
  fillText(t: string, x: number, y: number) { this.c.fillText(t, x * this.k, y * this.k) }
}

/** Grundriss als PNG (weißer Hintergrund), z. B. für die Übersicht. `undefined`, wenn es nichts zu zeichnen gibt. */
export async function grundrissAlsPng(
  daten: GrundrissDaten,
  bauteile: ReadonlyArray<{ id: string; kuerzel: string }>,
  parzelle: ParzellenLage | undefined,
  breitePx: number,
  verhaeltnis: number,
): Promise<Blob | undefined> {
  const breitePt = 500
  const hoehePt = breitePt * verhaeltnis
  const pxProPt = breitePx / breitePt
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(breitePx)
  canvas.height = Math.round(hoehePt * pxProPt)
  const c = canvas.getContext('2d')
  if (!c) return undefined
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, canvas.width, canvas.height)
  const ctx = new EmuKontext(c, pxProPt / EMU_PRO_PT) as unknown as CanvasRenderingContext2D
  if (!grundrissAufContext(ctx, daten, bauteile, breitePt, hoehePt, parzelle)) return undefined
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? undefined), 'image/png'))
}
