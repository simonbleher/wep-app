/**
 * PNG-Export der Parzellenskizze.
 *
 * Die reine Rendering-Logik (`skizzeAufContext`) ist von der DOM-abhängigen
 * Blob-Erzeugung (`skizzeAlsPng`) getrennt, sodass die Rendering-Logik in
 * Node.js-Tests mit einem gemockten 2D-Kontext getestet werden kann.
 */

import type { SkizzeDaten, SkizzeElement } from './types.js'
import { symbolPrims, zeichnePrims } from './symbole.js'
import { LINIE_STANDARD, STRICH_MUSTER, pxProPt } from './stile.js'

/** Optionen für den PNG-Export. */
export interface PngOptionen {
  /**
   * Transparenter Hintergrund und kein Raster – für Excel-Blätter, die schon
   * eigene Formen haben (z. B. die kopierte Bau-Skizze), damit das Bild sie
   * nicht verdeckt.
   */
  transparent?: boolean
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/**
 * Rendert die Skizze auf einen vorhandenen Canvas-2D-Kontext.
 * Diese Funktion ist rein (keine DOM-Seiteneffekte) und gut testbar.
 *
 * @param ctx    - Canvas-2D-Rendering-Kontext
 * @param daten  - Skizze-Daten
 * @param breite - Breite der Zeichenfläche in Pixeln
 * @param hoehe  - Höhe der Zeichenfläche in Pixeln
 * @param optionen - transparent: ohne Hintergrund und ohne Raster
 */
export function skizzeAufContext(
  ctx: CanvasRenderingContext2D,
  daten: SkizzeDaten,
  breite: number,
  hoehe: number,
  optionen: PngOptionen = {},
): void {
  // Hintergrund (transparent: Canvas bleibt leer → Alpha 0)
  if (!optionen.transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, breite, hoehe)
  }

  // Optional: Raster einzeichnen (nie beim transparenten Export)
  if (daten.raster && !optionen.transparent) {
    const g = daten.rasterGroesse ?? 40
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= breite; x += g) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, hoehe)
      ctx.stroke()
    }
    for (let y = 0; y <= hoehe; y += g) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(breite, y)
      ctx.stroke()
    }
  }

  // Elemente zeichnen
  const pt = pxProPt(breite)
  for (const el of daten.elemente) {
    zeichneElement(ctx, el, pt)
  }
}

/**
 * Rendert die Skizze auf einem Off-Screen-Canvas und gibt einen PNG-Blob zurück.
 * Benötigt eine Browser-Umgebung (document, canvas.toBlob).
 *
 * @param daten  - Skizze-Daten
 * @param breite - Breite des Ausgabebilds in Pixeln (überschreibt daten.breite)
 * @param hoehe  - Höhe des Ausgabebilds in Pixeln (überschreibt daten.hoehe)
 * @param optionen - transparent: ohne Hintergrund und ohne Raster
 */
export async function skizzeAlsPng(
  daten: SkizzeDaten,
  breite?: number,
  hoehe?: number,
  optionen: PngOptionen = {},
): Promise<Blob> {
  const w = breite ?? daten.breite ?? 800
  const h = hoehe ?? daten.hoehe ?? 600

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar')

  skizzeAufContext(ctx, daten, w, h, optionen)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('canvas.toBlob gab null zurück'))
    }, 'image/png')
  })
}

// ---------------------------------------------------------------------------
// Interne Zeichenfunktionen
// ---------------------------------------------------------------------------

function zeichneElement(ctx: CanvasRenderingContext2D, el: SkizzeElement, pt: number): void {
  ctx.save()
  ctx.strokeStyle = '#1a1a1a'
  ctx.fillStyle = 'transparent'
  ctx.lineWidth = 'linienbreite' in el && el.linienbreite ? el.linienbreite * pt : 2
  ctx.font = `${14}px sans-serif`

  switch (el.typ) {
    case 'symbol':
      zeichnePrims(ctx, symbolPrims(el.art, { x: el.x, y: el.y, w: el.breite, h: el.hoehe }, el.beschriftung ?? '', { schrift: 12, ziel: el.ziel }))
      break

    case 'rechteck':
      if (el.fuellung || el.linie || el.linienart || el.linienbreite) {
        ctx.beginPath()
        ctx.rect(el.x, el.y, el.breite, el.hoehe)
        fuelleUndRahmen(ctx, el.fuellung, el.linie, el.linienart, ctx.lineWidth)
      } else {
        ctx.strokeRect(el.x, el.y, el.breite, el.hoehe)
      }
      if (el.beschriftung) beschrifteMitte(ctx, el.beschriftung, el.x + el.breite / 2, el.y + el.hoehe / 2)
      break

    case 'vieleck': {
      if (el.punkte.length < (el.offen ? 2 : 3)) break
      ctx.beginPath()
      el.punkte.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)))
      if (el.offen) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        fuelleUndRahmen(ctx, undefined, el.linie, el.linienart, ctx.lineWidth)
        break
      }
      ctx.closePath()
      fuelleUndRahmen(ctx, el.fuellung, el.linie, el.linienart, ctx.lineWidth)
      if (el.beschriftung) {
        const xs = el.punkte.map((q) => q.x)
        const ys = el.punkte.map((q) => q.y)
        beschrifteMitte(ctx, el.beschriftung, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)
      }
      break
    }

    case 'bauform': {
      if (el.punkte.length < 3) break
      ctx.beginPath()
      el.punkte.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)))
      ctx.closePath()
      const fuellung = el.fuellung ?? (el.art === 'grundstueck' ? '#C5E0B4' : el.art === 'pfosten' ? '#ffffff' : el.gestrichelt ? null : '#E7E6E6')
      if (fuellung) {
        ctx.fillStyle = fuellung
        ctx.fill()
      }
      ctx.strokeStyle = el.linie ?? (el.art === 'bauteil' ? '#262626' : '#595959')
      ctx.lineWidth = el.art === 'pfosten' ? 1 : 1.5
      if (el.gestrichelt) ctx.setLineDash([6, 4])
      ctx.stroke()
      if (el.beschriftung && el.art === 'bauteil') {
        const xs = el.punkte.map((q) => q.x)
        const ys = el.punkte.map((q) => q.y)
        ctx.setLineDash([])
        ctx.fillStyle = '#000000'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const zeilen = el.beschriftung.split('\n')
        zeilen.forEach((z, i) => ctx.fillText(z, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 + (i - (zeilen.length - 1) / 2) * 14))
      }
      break
    }

    case 'linie': {
      if (el.farbe) {
        ctx.strokeStyle = el.farbe
        ctx.fillStyle = el.farbe
      }
      if (el.linienart === 'gestrichelt') ctx.setLineDash(STRICH_MUSTER)
      ctx.beginPath()
      ctx.moveTo(el.x1, el.y1)
      ctx.lineTo(el.x2, el.y2)
      ctx.stroke()
      if (el.pfeil) {
        if (el.linienart === 'gestrichelt') ctx.setLineDash([])
        ctx.fillStyle = el.farbe ?? '#1a1a1a'
        const w = Math.atan2(el.y2 - el.y1, el.x2 - el.x1)
        ctx.beginPath()
        ctx.moveTo(el.x2, el.y2)
        ctx.lineTo(el.x2 - 9 * Math.cos(w - 0.4), el.y2 - 9 * Math.sin(w - 0.4))
        ctx.lineTo(el.x2 - 9 * Math.cos(w + 0.4), el.y2 - 9 * Math.sin(w + 0.4))
        ctx.closePath()
        ctx.fill()
      }
      break
    }

    case 'kreis': {
      const ry = el.radiusY ?? el.radius
      ctx.beginPath()
      if (ry === el.radius) ctx.arc(el.cx, el.cy, el.radius, 0, 2 * Math.PI)
      else ctx.ellipse(el.cx, el.cy, Math.max(0.01, el.radius), Math.max(0.01, ry), 0, 0, 2 * Math.PI)
      if (el.fuellung || el.linie || el.linienart || el.linienbreite) fuelleUndRahmen(ctx, el.fuellung, el.linie, el.linienart, ctx.lineWidth)
      else ctx.stroke()
      if (el.beschriftung) {
        ctx.fillStyle = '#1a1a1a'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(el.beschriftung, el.cx, el.cy + ry + 2)
      }
      break
    }

    case 'text': {
      const groesse = el.schriftgroesse ?? 14
      ctx.font = `${groesse}px sans-serif`
      ctx.fillStyle = el.farbe ?? '#1a1a1a'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(el.inhalt, el.x, el.y)
      break
    }

    case 'massangabe': {
      if (el.farbe) ctx.strokeStyle = el.farbe
      // Hauptlinie
      ctx.beginPath()
      ctx.moveTo(el.x1, el.y1)
      ctx.lineTo(el.x2, el.y2)
      ctx.stroke()

      // Senkrechte Endhaken
      const dx = el.x2 - el.x1
      const dy = el.y2 - el.y1
      const laenge = Math.sqrt(dx * dx + dy * dy)
      if (laenge > 0) {
        const nx = (-dy / laenge) * 6
        const ny = (dx / laenge) * 6
        ctx.beginPath()
        ctx.moveTo(el.x1 - nx, el.y1 - ny)
        ctx.lineTo(el.x1 + nx, el.y1 + ny)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(el.x2 - nx, el.y2 - ny)
        ctx.lineTo(el.x2 + nx, el.y2 + ny)
        ctx.stroke()
      }

      // Beschriftung in der Mitte
      const mx = (el.x1 + el.x2) / 2
      const my = (el.y1 + el.y2) / 2
      ctx.fillStyle = el.farbe ?? '#1a1a1a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(el.beschriftung, mx, my - 2)
      break
    }
  }

  ctx.restore()
}

/** Füllung (falls gewählt) und Rahmen des aktuellen Pfads; ohne Angaben das bisherige Aussehen (nur dunkler Rahmen). */
function fuelleUndRahmen(ctx: CanvasRenderingContext2D, fuellung?: string, linie?: string, linienart?: string, breite = 2): void {
  if (fuellung) {
    ctx.fillStyle = fuellung
    ctx.fill()
  }
  ctx.strokeStyle = linie ?? LINIE_STANDARD
  ctx.lineWidth = breite
  ctx.setLineDash(linienart === 'gestrichelt' ? STRICH_MUSTER : [])
  ctx.stroke()
  ctx.setLineDash([])
}

function beschrifteMitte(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = '#1a1a1a'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}
