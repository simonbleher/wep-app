// Brücke zwischen Canvas (Browser) und den reinen Bildfunktionen: Striche oder Foto → transparentes PNG.
import { schneideAufSchrift, verkleinere, type Bild } from './bild'
import { malStriche, type Strich, type Zeichner } from './striche'

/** Höchstgröße der gespeicherten Unterschrift in Pixeln (reicht für ein Feld im PDF bei 300 dpi). */
export const MAX_BREITE = 600
export const MAX_HOEHE = 240
/** Zeichenfläche beim Rendern der Striche (3 : 1, groß genug für glatte Kanten nach dem Verkleinern). */
export const RENDER_BREITE = 1500
export const RENDER_HOEHE = 500

/** Die kleine Canvas-Schnittstelle, die wir brauchen – im Browser ein HTMLCanvasElement. */
export interface LeinwandLike {
  width: number
  height: number
  getContext(art: '2d'): (Zeichner & {
    getImageData(x: number, y: number, b: number, h: number): { data: Uint8ClampedArray }
    putImageData(d: unknown, x: number, y: number): void
    clearRect(x: number, y: number, b: number, h: number): void
  }) | null
  toDataURL(typ?: string): string
}
export type LeinwandFabrik = (breite: number, hoehe: number) => LeinwandLike

export const browserLeinwand: LeinwandFabrik = (breite, hoehe) => {
  const c = document.createElement('canvas')
  c.width = breite
  c.height = hoehe
  return c as unknown as LeinwandLike
}

export function leseBild(c: LeinwandLike): Bild {
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Keine Zeichenfläche verfügbar')
  return { breite: c.width, hoehe: c.height, daten: new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data) }
}

/** PNG-Data-URL eines Bildes (mit Durchsichtigkeit). */
export function bildAlsPngUrl(b: Bild, fabrik: LeinwandFabrik = browserLeinwand): string {
  const c = fabrik(b.breite, b.hoehe)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Keine Zeichenfläche verfügbar')
  const bild = new (globalThis as { ImageData?: new (d: Uint8ClampedArray, w: number, h: number) => unknown }).ImageData!(b.daten, b.breite, b.hoehe)
  ctx.putImageData(bild, 0, 0)
  return c.toDataURL('image/png')
}

/** Fertige Unterschrift aus dem Bild: eng zugeschnitten, auf die Höchstgröße verkleinert, als PNG. */
export function bildZuUnterschriftUrl(b: Bild, fabrik: LeinwandFabrik = browserLeinwand): string {
  return bildAlsPngUrl(verkleinere(schneideAufSchrift(b), MAX_BREITE, MAX_HOEHE), fabrik)
}

/** Gezeichnete Striche (normiert auf die Breite) → Unterschrift als PNG-Data-URL. */
export function stricheZuUnterschriftUrl(striche: Strich[], fabrik: LeinwandFabrik = browserLeinwand): string {
  const c = fabrik(RENDER_BREITE, RENDER_HOEHE)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Keine Zeichenfläche verfügbar')
  ctx.clearRect(0, 0, RENDER_BREITE, RENDER_HOEHE)
  malStriche(ctx, striche, RENDER_BREITE)
  return bildZuUnterschriftUrl(leseBild(c), fabrik)
}
