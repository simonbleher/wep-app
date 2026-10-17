// Vergleichsbild je Modell: links das Foto mit den erkannten Kästen, rechts die
// Bau-Formen aus JSON plus die neuen Elemente an der umgerechneten Position.
// Nur für den Testlauf (Node, @napi-rs/canvas) – nicht der Stil der App.

import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import type { Ausrichtung, BauForm, Rechteck, Zuordnung } from './ausrichtung'
import type { Box2d } from './schema'

const FARBE = {
  bezug: '#1f6feb',
  vorhanden: '#6e7781',
  neu: '#1a7f37',
  unsicher: '#bf8700',
  fehlt: '#cf222e',
  bau: '#3d3d3d',
  grundstueck: '#e2f0d9',
  gebaeude: '#e7e6e6',
}

const HOEHE = 860
const KOPF = 64
const RAND = 16

export interface BildInfo {
  titel: string
  zeilen: string[]
}

function art(z: Zuordnung, bezugsElemente: Set<unknown>): keyof typeof FARBE {
  if (bezugsElemente.has(z.element)) return 'bezug'
  return z.neu ? 'neu' : 'vorhanden'
}

/** Bereich des Fotos, der gezeigt wird: Grundstück + alle Kästen + Rand. */
function fotoAusschnitt(boxen: Box2d[]): Box2d {
  if (!boxen.length) return [0, 0, 1000, 1000]
  const r = 40
  return [
    Math.max(0, Math.min(...boxen.map((b) => b[0])) - r),
    Math.max(0, Math.min(...boxen.map((b) => b[1])) - r),
    Math.min(1000, Math.max(...boxen.map((b) => b[2])) + r),
    Math.min(1000, Math.max(...boxen.map((b) => b[3])) + r),
  ]
}

function text(ctx: SKRSContext2D, s: string, x: number, y: number, farbe: string, groesse = 12, fett = false) {
  ctx.font = `${fett ? 'bold ' : ''}${groesse}px Arial, sans-serif`
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.strokeText(s, x, y)
  ctx.fillStyle = farbe
  ctx.fillText(s, x, y)
}

function pfeilspitze(ctx: SKRSContext2D, x1: number, y1: number, x2: number, y2: number) {
  const w = Math.atan2(y2 - y1, x2 - x1)
  const l = 7
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - l * Math.cos(w - 0.4), y2 - l * Math.sin(w - 0.4))
  ctx.lineTo(x2 - l * Math.cos(w + 0.4), y2 - l * Math.sin(w + 0.4))
  ctx.closePath()
  ctx.fill()
}

/** Zeichnet eine Bau-Form (EMU) in den rechten Bereich. */
function zeichneBauForm(ctx: SKRSContext2D, f: BauForm, p: (x: number, y: number) => [number, number], m: number, grundstueck: string) {
  const [x1, y1] = p(f.x, f.y)
  const [x2, y2] = p(f.x + f.w, f.y + f.h)
  ctx.strokeStyle = FARBE.bau
  ctx.fillStyle = FARBE.bau
  ctx.lineWidth = 1
  ctx.setLineDash(f.gestrichelt ? [5, 3] : [])
  if (f.typ === 'line' || f.typ === 'straightConnector1') {
    // Richtung aus flipH/flipV
    const ax = f.flipH ? x2 : x1
    const bx = f.flipH ? x1 : x2
    const ay = f.flipV ? y2 : y1
    const by = f.flipV ? y1 : y2
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    if (f.pfeil) pfeilspitze(ctx, ax, ay, bx, by)
  } else if (f.textfeld) {
    if (f.text) {
      const groesse = Math.max(8, Math.min(13, (y2 - y1) * 0.55))
      ctx.font = `${groesse}px Arial, sans-serif`
      ctx.fillStyle = '#000'
      ctx.textAlign = 'center'
      ctx.fillText(f.text, (x1 + x2) / 2, (y1 + y2) / 2 + groesse / 3, Math.max(20, (x2 - x1) * 1.2))
      ctx.textAlign = 'left'
    }
  } else if (f.typ === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) / 2, (y2 - y1) / 2, 0, 0, 2 * Math.PI)
    ctx.fillStyle = FARBE.gebaeude
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.fillStyle = f.name === grundstueck ? FARBE.grundstueck : FARBE.gebaeude
    if (f.name === grundstueck || m > 0) ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
  }
  ctx.setLineDash([])
}

/** Einfaches Symbol je Typ für neue Elemente (nur zur Kontrolle der Lage). */
function zeichneNeu(ctx: SKRSContext2D, z: Zuordnung, r: [number, number, number, number]) {
  const [x, y, w, h] = r
  const e = z.element
  ctx.lineWidth = 2
  ctx.strokeStyle = FARBE.neu
  ctx.fillStyle = 'rgba(26,127,55,0.18)'
  switch (e.typ) {
    case 'hochbeet':
    case 'beet':
    case 'kompost':
    case 'weg':
      ctx.fillStyle = e.typ === 'weg' ? 'rgba(237,228,211,0.9)' : 'rgba(139,90,43,0.35)'
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      break
    case 'baum':
    case 'strauch':
    case 'brunnen':
    case 'schacht':
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(3, w / 2), Math.max(3, h / 2), 0, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      break
    case 'entfernen': {
      // meist nur Text im Foto → kleines Symbol (Stern-Ersatz + rotes X) in der Mitte
      const mx = x + w / 2
      const my = y + h / 2
      const r = 9
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(112,173,71,0.8)'
      ctx.fill()
      ctx.strokeStyle = FARBE.fehlt
      ctx.beginPath()
      ctx.moveTo(mx - r, my - r)
      ctx.lineTo(mx + r, my + r)
      ctx.moveTo(mx + r, my - r)
      ctx.lineTo(mx - r, my + r)
      ctx.stroke()
      const t = e.beschriftung || e.typ
      text(ctx, t.length > 28 ? t.slice(0, 27) + '…' : t, mx - r, my + r + 12, FARBE.fehlt, 11)
      return
    }
    case 'mangelhinweis':
      ctx.strokeStyle = FARBE.fehlt
      ctx.strokeRect(x, y, w, h)
      break
    default:
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
  }
  if (e.unsicher) {
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = FARBE.unsicher
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6)
    ctx.setLineDash([])
  }
  const t = e.beschriftung || e.typ
  text(ctx, t.length > 28 ? t.slice(0, 27) + '…' : t, x, y + h + 12, FARBE.neu, 11)
}

export async function zeichneVergleich(
  fotoPfad: string,
  ausrichtung: Ausrichtung | null,
  zuordnungen: Zuordnung[],
  fotoRahmen: Box2d | null,
  formen: BauForm[],
  info: BildInfo,
): Promise<Buffer> {
  const foto = await loadImage(fotoPfad)
  const bezugsElemente = new Set<unknown>(ausrichtung?.bezugElemente ?? [])

  // --- links: Foto-Ausschnitt
  const aus = fotoAusschnitt([...(fotoRahmen ? [fotoRahmen] : []), ...zuordnungen.map((z) => z.element.box_2d)])
  const sx = (aus[3] - aus[1]) / 1000 * foto.width
  const sy = (aus[2] - aus[0]) / 1000 * foto.height
  const fotoMass = HOEHE / sy
  const linksB = Math.round(sx * fotoMass)

  // --- rechts: Grundstück + 12 % Rand
  const gs = ausrichtung?.grundstueck
  const bereich: Rechteck | null = gs ? { x: gs.x - gs.w * 0.12, y: gs.y - gs.h * 0.12, w: gs.w * 1.24, h: gs.h * 1.24 } : null
  const rechtsMass = bereich ? HOEHE / bereich.h : 0
  const rechtsB = bereich ? Math.round(bereich.w * rechtsMass) : 300

  const breite = RAND * 3 + linksB + rechtsB
  const canvas = createCanvas(breite, KOPF + HOEHE + RAND * 2 + 18)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Kopf
  text(ctx, info.titel, RAND, 22, '#000', 16, true)
  info.zeilen.forEach((z, i) => text(ctx, z, RAND, 40 + i * 15, '#333', 12))

  const ox = RAND
  const oy = KOPF + RAND
  ctx.drawImage(foto, (aus[1] / 1000) * foto.width, (aus[0] / 1000) * foto.height, sx, sy, ox, oy, linksB, HOEHE)
  const fp = (u: number, v: number): [number, number] => [
    ox + (((u - aus[1]) / 1000) * foto.width) * fotoMass,
    oy + (((v - aus[0]) / 1000) * foto.height) * fotoMass,
  ]
  if (fotoRahmen) {
    const [a, b] = fp(fotoRahmen[1], fotoRahmen[0])
    const [c, d] = fp(fotoRahmen[3], fotoRahmen[2])
    ctx.setLineDash([8, 4])
    ctx.strokeStyle = '#8250df'
    ctx.lineWidth = 2
    ctx.strokeRect(a, b, c - a, d - b)
    ctx.setLineDash([])
    text(ctx, 'Grundstück', a + 4, b - 4, '#8250df', 11)
  }
  for (const z of zuordnungen) {
    const [ymin, xmin, ymax, xmax] = z.element.box_2d
    const [a, b] = fp(xmin, ymin)
    const [c, d] = fp(xmax, ymax)
    const f = FARBE[art(z, bezugsElemente)]
    ctx.lineWidth = 2
    ctx.strokeStyle = f
    ctx.strokeRect(a, b, c - a, d - b)
    if (z.element.unsicher) {
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = FARBE.unsicher
      ctx.strokeRect(a - 3, b - 3, c - a + 6, d - b + 6)
      ctx.setLineDash([])
    }
    const t = `${z.element.typ}${z.element.beschriftung ? ': ' + z.element.beschriftung : ''}${z.element.unsicher ? ' (?)' : ''}`
    text(ctx, t.length > 34 ? t.slice(0, 33) + '…' : t, a, b - 3, f, 11)
  }
  text(ctx, 'Foto + erkannte Kästen', ox, oy + HOEHE + 14, '#555', 11)

  // --- rechts: Bau-Formen + neue Elemente
  const rx = RAND * 2 + linksB
  if (bereich && ausrichtung) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rx, oy, rechtsB, HOEHE)
    ctx.clip()
    const p = (x: number, y: number): [number, number] => [rx + (x - bereich.x) * rechtsMass, oy + (y - bereich.y) * rechtsMass]
    const gsName = formen.filter((f) => f.typ === 'rect' && !f.textfeld).sort((a, b) => b.w * b.h - a.w * a.h)[0]?.name ?? ''
    for (const f of formen.filter((f) => f.name === gsName)) zeichneBauForm(ctx, f, p, 0, gsName)
    for (const f of formen.filter((f) => f.name !== gsName)) zeichneBauForm(ctx, f, p, 1, gsName)
    // Bezüge: Foto-Kasten umgerechnet (gestrichelt) → zeigt die Güte der Ausrichtung
    for (const z of ausrichtung.zuordnungen.filter((z) => bezugsElemente.has(z.element) || !z.neu)) {
      const [a, b] = p(z.emu.x, z.emu.y)
      const [c, d] = p(z.emu.x + z.emu.w, z.emu.y + z.emu.h)
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = bezugsElemente.has(z.element) ? FARBE.bezug : FARBE.vorhanden
      ctx.strokeRect(a, b, c - a, d - b)
      ctx.setLineDash([])
    }
    for (const z of ausrichtung.zuordnungen.filter((z) => z.neu)) {
      const [a, b] = p(z.emu.x, z.emu.y)
      const [c, d] = p(z.emu.x + z.emu.w, z.emu.y + z.emu.h)
      zeichneNeu(ctx, z, [a, b, c - a, d - b])
    }
    ctx.restore()
    ctx.strokeStyle = '#d0d7de'
    ctx.lineWidth = 1
    ctx.strokeRect(rx, oy, rechtsB, HOEHE)
    text(
      ctx,
      `Bau-Formen + neue Elemente (grün) · gestrichelt: Foto-Kasten umgerechnet (blau = Bezug, grau = vorhanden)`,
      rx,
      oy + HOEHE + 14,
      '#555',
      11,
    )
  } else {
    text(ctx, 'keine Bau-Formen / keine Ausrichtung', rx, oy + 20, FARBE.fehlt, 13)
  }

  return canvas.toBuffer('image/png')
}
