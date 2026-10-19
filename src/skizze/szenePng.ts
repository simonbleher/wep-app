/**
 * Bild der Szene für die KI (und die Vorher/Nachher-Bilder des Testlaufs).
 *
 * `szeneAufContext` zeichnet auf einen beliebigen Canvas-2D-Kontext; im Browser
 * erzeugt `szeneAlsPngBase64` daraus ein PNG, der Testlauf nutzt @napi-rs/canvas.
 */

import { symbolPrims, zeichnePrims } from './symbole'
import { istSymbol, type Szene, type SzenenElement } from './szene'

const WIESE = '#C5E0B4'

/** Bildgröße passend zum Grundstück (Breite vorgegeben). */
export function bildGroesse(szene: Szene, breite = 800): { breite: number; hoehe: number } {
  return { breite, hoehe: Math.round((breite * szene.masse.h) / szene.masse.b) }
}

export function szeneAufContext(ctx: CanvasRenderingContext2D, szene: Szene, breite: number, hoehe: number): void {
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, breite, hoehe)
  ctx.fillStyle = WIESE
  ctx.fillRect(1, 1, breite - 2, hoehe - 2)
  ctx.strokeStyle = '#595959'
  ctx.lineWidth = 1.5
  ctx.strokeRect(1, 1, breite - 2, hoehe - 2)

  const schrift = Math.max(10, Math.round(breite / 40))
  // feste Elemente zuerst (Bau), darüber die Symbole
  const reihenfolge = [...szene.elemente.filter((e) => e.fest || !istSymbol(e.typ)), ...szene.elemente.filter((e) => !e.fest && istSymbol(e.typ))]
  for (const e of reihenfolge) zeichneElement(ctx, e, breite, hoehe, schrift)
}

function zeichneElement(ctx: CanvasRenderingContext2D, e: SzenenElement, breite: number, hoehe: number, schrift: number): void {
  const x = (e.x / 1000) * breite
  const y = (e.y / 1000) * hoehe
  const w = (e.b / 1000) * breite
  const h = (e.h / 1000) * hoehe
  if (istSymbol(e.typ)) {
    zeichnePrims(ctx, symbolPrims(e.typ, { x, y, w, h }, e.beschriftung, { schrift }))
    return
  }
  ctx.save()
  ctx.strokeStyle = '#262626'
  ctx.fillStyle = '#E7E6E6'
  ctx.lineWidth = 1
  switch (e.typ) {
    case 'bau-linie': {
      const ax = e.flipH ? x + w : x
      const bx = e.flipH ? x : x + w
      const ay = e.flipV ? y + h : y
      const by = e.flipV ? y : y + h
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      break
    }
    case 'bau-ellipse':
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      beschrifte(ctx, e.beschriftung, x + w / 2, y + h / 2, w, schrift)
      break
    case 'bau-text':
      beschrifte(ctx, e.beschriftung, x + w / 2, y + h / 2, w * 1.4, schrift)
      break
    default:
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      beschrifte(ctx, e.beschriftung, x + w / 2, y + h / 2, w, schrift)
  }
  ctx.restore()
}

function beschrifte(ctx: CanvasRenderingContext2D, text: string, mx: number, my: number, maxBreite: number, schrift: number) {
  if (!text) return
  ctx.fillStyle = '#000000'
  ctx.font = `${schrift}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, mx, my, Math.max(30, maxBreite))
}

/** Browser: PNG als Base64 (ohne `data:`-Vorspann). */
export async function szeneAlsPngBase64(szene: Szene, breite = 800): Promise<string> {
  const g = bildGroesse(szene, breite)
  const canvas = document.createElement('canvas')
  canvas.width = g.breite
  canvas.height = g.hoehe
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar')
  szeneAufContext(ctx, szene, g.breite, g.hoehe)
  const blob = await new Promise<Blob>((ok, fehler) =>
    canvas.toBlob((b) => (b ? ok(b) : fehler(new Error('canvas.toBlob gab null zurück'))), 'image/png'),
  )
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
