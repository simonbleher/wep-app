/**
 * Ein Canvas-2D-ähnlicher Zeichenkontext, der in eine PDF-Seite zeichnet – als Vektor.
 *
 * Die Skizze wird vom App-Code (`skizzeAufContext`, `zeichnePrims`) auf einen Canvas-2D-Kontext gezeichnet.
 * Dieser Kontext nimmt dieselben Aufrufe entgegen (nur die, die die Skizze braucht) und schreibt Pfade, Flächen und
 * Text ins PDF. So sieht die Skizze im PDF aus wie im Editor, bleibt aber scharf in jeder Vergrößerung.
 */
import type { PDFPage } from 'pdf-lib'
import { farbeAusHex } from './schreiber'
import { kodierbar, schriftFuer, type Schriften } from './schrift'

type Lib = typeof import('pdf-lib')

interface Stand {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  textAlign: 'left' | 'center' | 'right' | 'start' | 'end'
  textBaseline: string
  dash: number[]
  lineCap: string
  lineJoin: string
  tx: number
  ty: number
  winkel: number
}

type Teil =
  | { k: 'M'; x: number; y: number }
  | { k: 'L'; x: number; y: number }
  | { k: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { k: 'Z' }

const KAPPA = 0.5522847498

/** CSS-Farbe → Hex ohne „#“, `null` = nichts zeichnen. */
export function cssFarbe(f: string): string | null {
  const s = f.trim().toLowerCase()
  if (!s || s === 'transparent' || s === 'none') return null
  const kurz = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)
  if (kurz) return kurz[1] + kurz[1] + kurz[2] + kurz[2] + kurz[3] + kurz[3]
  const lang = /^#([0-9a-f]{6})/.exec(s)
  if (lang) return lang[1]
  const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s)
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  const namen: Record<string, string> = { black: '000000', white: 'ffffff', red: 'ff0000', gray: '808080', grey: '808080' }
  return namen[s] ?? '000000'
}

export class PdfKontext {
  // Eigenschaften wie beim Canvas (die Skizze setzt sie direkt)
  fillStyle = '#000000'
  strokeStyle = '#000000'
  lineWidth = 1
  font = '10px sans-serif'
  textAlign: Stand['textAlign'] = 'left'
  textBaseline = 'alphabetic'
  lineCap = 'butt'
  lineJoin = 'miter'
  private dash: number[] = []
  /** Verschiebung und Drehung (Bogenmaß, Uhrzeigersinn) – gelten nur für Text (`fillText`), mehr braucht die Skizze nicht. */
  private tx = 0
  private ty = 0
  private winkel = 0

  private pfad: Teil[] = []
  private readonly stapel: Stand[] = []

  /**
   * @param ox,oy  linke obere Ecke der Zeichenfläche auf der Seite (pt, von oben)
   * @param s      Maßstab: Einheiten der Skizze → pt
   */
  constructor(
    private readonly lib: Lib,
    private readonly seite: PDFPage,
    private readonly schriften: Schriften,
    private readonly ox: number,
    private readonly oy: number,
    private readonly s: number,
  ) {}

  private X = (x: number) => this.ox + x * this.s
  private Y = (y: number) => this.seite.getHeight() - (this.oy + y * this.s)

  save(): void {
    this.stapel.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      dash: this.dash,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      tx: this.tx,
      ty: this.ty,
      winkel: this.winkel,
    })
  }
  translate(x: number, y: number): void {
    this.tx += x
    this.ty += y
  }
  rotate(winkel: number): void {
    this.winkel += winkel
  }
  restore(): void {
    const st = this.stapel.pop()
    if (!st) return
    this.fillStyle = st.fillStyle
    this.strokeStyle = st.strokeStyle
    this.lineWidth = st.lineWidth
    this.font = st.font
    this.textAlign = st.textAlign
    this.textBaseline = st.textBaseline
    this.dash = st.dash
    this.lineCap = st.lineCap
    this.lineJoin = st.lineJoin
    this.tx = st.tx
    this.ty = st.ty
    this.winkel = st.winkel
  }
  setLineDash(d: number[]): void {
    this.dash = d
  }

  beginPath(): void {
    this.pfad = []
  }
  moveTo(x: number, y: number): void {
    this.pfad.push({ k: 'M', x, y })
  }
  lineTo(x: number, y: number): void {
    if (!this.pfad.length) return this.moveTo(x, y)
    this.pfad.push({ k: 'L', x, y })
  }
  closePath(): void {
    this.pfad.push({ k: 'Z' })
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y)
    this.lineTo(x + w, y)
    this.lineTo(x + w, y + h)
    this.lineTo(x, y + h)
    this.closePath()
  }
  /** Ellipse als vier Bézierkurven (ohne Drehung). */
  ellipse(cx: number, cy: number, rx: number, ry: number, _rot: number, von: number, bis: number): void {
    const voll = Math.abs(bis - von) >= 2 * Math.PI - 1e-9
    if (voll) {
      const kx = rx * KAPPA
      const ky = ry * KAPPA
      this.moveTo(cx + rx, cy)
      this.kurve(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
      this.kurve(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
      this.kurve(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
      this.kurve(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
      this.closePath()
      return
    }
    // Teilbogen: in Schritten von höchstens 90° mit je einer Kurve
    const n = Math.max(1, Math.ceil(Math.abs(bis - von) / (Math.PI / 2)))
    const d = (bis - von) / n
    const t = (4 / 3) * Math.tan(d / 4)
    const P = (w: number) => ({ x: cx + rx * Math.cos(w), y: cy + ry * Math.sin(w) })
    const Q = (w: number) => ({ x: -rx * Math.sin(w), y: ry * Math.cos(w) })
    const a0 = P(von)
    if (this.pfad.length) this.lineTo(a0.x, a0.y)
    else this.moveTo(a0.x, a0.y)
    for (let i = 0; i < n; i++) {
      const w1 = von + i * d
      const w2 = w1 + d
      const p1 = P(w1)
      const p2 = P(w2)
      const q1 = Q(w1)
      const q2 = Q(w2)
      this.kurve(p1.x + t * q1.x, p1.y + t * q1.y, p2.x - t * q2.x, p2.y - t * q2.y, p2.x, p2.y)
    }
  }
  arc(cx: number, cy: number, r: number, von: number, bis: number): void {
    this.ellipse(cx, cy, r, r, 0, von, bis)
  }
  private kurve(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.pfad.push({ k: 'C', x1, y1, x2, y2, x, y })
  }

  private zeichnePfad(fuellen: boolean, strichen: boolean): void {
    const L = this.lib
    const fuell = fuellen ? cssFarbe(this.fillStyle) : null
    const strich = strichen ? cssFarbe(this.strokeStyle) : null
    if (!fuell && !strich) return
    const ops = [L.pushGraphicsState()]
    if (fuell) ops.push(L.setFillingColor(farbeAusHex(L, fuell)))
    if (strich) {
      ops.push(L.setStrokingColor(farbeAusHex(L, strich)), L.setLineWidth(Math.max(0.1, this.lineWidth * this.s)))
      if (this.dash.length) ops.push(L.setDashPattern(this.dash.map((d) => Math.max(0.1, d * this.s)), 0))
      ops.push(L.setLineCap(this.lineCap === 'round' ? 1 : this.lineCap === 'square' ? 2 : 0), L.setLineJoin(this.lineJoin === 'round' ? 1 : this.lineJoin === 'bevel' ? 2 : 0))
    }
    for (const t of this.pfad) {
      if (t.k === 'M') ops.push(L.moveTo(this.X(t.x), this.Y(t.y)))
      else if (t.k === 'L') ops.push(L.lineTo(this.X(t.x), this.Y(t.y)))
      else if (t.k === 'C') ops.push(L.appendBezierCurve(this.X(t.x1), this.Y(t.y1), this.X(t.x2), this.Y(t.y2), this.X(t.x), this.Y(t.y)))
      else ops.push(L.closePath())
    }
    ops.push(fuell && strich ? L.fillAndStroke() : fuell ? L.fill() : L.stroke(), L.popGraphicsState())
    this.seite.pushOperators(...ops)
  }
  fill(): void {
    this.zeichnePfad(true, false)
  }
  stroke(): void {
    this.zeichnePfad(false, true)
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const alt = this.pfad
    this.pfad = []
    this.rect(x, y, w, h)
    this.fill()
    this.pfad = alt
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    const alt = this.pfad
    this.pfad = []
    this.rect(x, y, w, h)
    this.stroke()
    this.pfad = alt
  }

  private schrift(): { groesse: number; fett: boolean; kursiv: boolean } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font)
    return { groesse: m ? Number(m[1]) : 10, fett: /bold/.test(this.font), kursiv: /italic|oblique/.test(this.font) }
  }

  measureText(text: string): { width: number } {
    const f = this.schrift()
    return { width: schriftFuer(this.schriften, f.fett, f.kursiv).widthOfTextAtSize(kodierbar(text), f.groesse) }
  }

  fillText(text: string, x: number, y: number, maxBreite?: number): void {
    const farbe = cssFarbe(this.fillStyle)
    if (!farbe || !text) return
    const f = this.schrift()
    const font = schriftFuer(this.schriften, f.fett, f.kursiv)
    const t = kodierbar(text)
    let groesse = f.groesse
    let breite = font.widthOfTextAtSize(t, groesse)
    if (maxBreite && breite > maxBreite) {
      groesse *= maxBreite / breite
      breite = maxBreite
    }
    // Position: Ausrichtung waagerecht, Grundlinie je nach `textBaseline`
    let px = x
    if (this.textAlign === 'center') px = x - breite / 2
    else if (this.textAlign === 'right' || this.textAlign === 'end') px = x - breite
    let py = y
    if (this.textBaseline === 'middle') py = y + groesse * 0.32
    else if (this.textBaseline === 'top' || this.textBaseline === 'hanging') py = y + groesse * 0.8
    else if (this.textBaseline === 'bottom') py = y - groesse * 0.2
    // Mit Drehung: Textanfang um den Ursprung (translate) drehen; Canvas dreht im Uhrzeigersinn, PDF gegen den Uhrzeigersinn
    const c = Math.cos(this.winkel)
    const sn = Math.sin(this.winkel)
    const wx = this.tx + px * c - py * sn
    const wy = this.ty + px * sn + py * c
    this.seite.drawText(t, {
      x: this.X(wx),
      y: this.Y(wy),
      size: groesse * this.s,
      font,
      color: farbeAusHex(this.lib, farbe),
      ...(this.winkel ? { rotate: this.lib.degrees((-this.winkel * 180) / Math.PI) } : {}),
    })
  }
}
