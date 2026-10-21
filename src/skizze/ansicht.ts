/**
 * Ansicht (Zoomen und Verschieben) der Skizze.
 *
 * Reine Rechnung ohne DOM. Die Ansicht ist nur ein Ausschnitt der Zeichenfläche (SVG-viewBox) und
 * gehört nicht zu den Skizzendaten: Koordinaten der Elemente und der Excel-Export bleiben davon
 * unberührt. `zoom` 1 = ganze Skizze; `x`/`y` = linke obere Ecke des Ausschnitts in Skizzen-Koordinaten.
 */

import type { Punkt } from './geometrie.js'

export interface Ansicht {
  zoom: number
  x: number
  y: number
}

/** Größe der Zeichenfläche in Skizzen-Koordinaten. */
export interface Flaeche {
  breite: number
  hoehe: number
}

/** Position und Größe der Zeichenfläche auf dem Bildschirm (wie getBoundingClientRect). */
export interface BildschirmKasten {
  left: number
  top: number
  width: number
  height: number
}

export const ZOOM_MIN = 1
export const ZOOM_MAX = 8
/** Schrittfaktor der Plus-/Minus-Knöpfe. */
export const ZOOM_SCHRITT = 1.5

export const GANZE_SKIZZE: Ansicht = { zoom: 1, x: 0, y: 0 }

/** Hält Zoom und Ausschnitt in den erlaubten Grenzen (Ausschnitt bleibt in der Zeichenfläche). */
export function ansichtBegrenzen(a: Ansicht, f: Flaeche): Ansicht {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, a.zoom))
  const maxX = f.breite - f.breite / zoom
  const maxY = f.hoehe - f.hoehe / zoom
  return { zoom, x: Math.min(maxX, Math.max(0, a.x)), y: Math.min(maxY, Math.max(0, a.y)) }
}

/** Wert für das viewBox-Attribut. */
export function viewBoxText(a: Ansicht, f: Flaeche): string {
  return `${a.x} ${a.y} ${f.breite / a.zoom} ${f.hoehe / a.zoom}`
}

/** Bildschirmpixel je Skizzen-Einheit bei dieser Ansicht. */
export function pixelProEinheit(a: Ansicht, f: Flaeche, kasten: BildschirmKasten): number {
  return (kasten.width * a.zoom) / f.breite
}

/** Bildschirmpunkt (clientX/clientY) → Skizzen-Koordinaten. */
export function bildschirmZuSkizze(p: Punkt, a: Ansicht, f: Flaeche, kasten: BildschirmKasten): Punkt {
  const ppe = pixelProEinheit(a, f, kasten)
  return { x: a.x + (p.x - kasten.left) / ppe, y: a.y + (p.y - kasten.top) / ppe }
}

/** Ansicht, bei der der Skizzenpunkt `s` unter dem Bildschirmpunkt `b` liegt – mit neuem Zoom. */
function ansichtUnterPunkt(zoom: number, s: Punkt, b: Punkt, f: Flaeche, kasten: BildschirmKasten): Ansicht {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
  const ppe = (kasten.width * z) / f.breite
  return ansichtBegrenzen({ zoom: z, x: s.x - (b.x - kasten.left) / ppe, y: s.y - (b.y - kasten.top) / ppe }, f)
}

/** Zoomt um den Faktor `faktor`; der Punkt unter `fokus` (Bildschirm) bleibt an Ort und Stelle. */
export function zoomUmPunkt(a: Ansicht, faktor: number, fokus: Punkt, f: Flaeche, kasten: BildschirmKasten): Ansicht {
  const s = bildschirmZuSkizze(fokus, a, f, kasten)
  return ansichtUnterPunkt(a.zoom * faktor, s, fokus, f, kasten)
}

/** Zoomt um die Mitte der Zeichenfläche (Plus-/Minus-Knöpfe). */
export function zoomUmMitte(a: Ansicht, faktor: number, f: Flaeche, kasten: BildschirmKasten): Ansicht {
  return zoomUmPunkt(a, faktor, { x: kasten.left + kasten.width / 2, y: kasten.top + kasten.height / 2 }, f, kasten)
}

/** Verschiebt den Ausschnitt um (dx, dy) Bildschirmpixel (Inhalt folgt dem Finger). */
export function verschiebeUmPixel(a: Ansicht, dx: number, dy: number, f: Flaeche, kasten: BildschirmKasten): Ansicht {
  const ppe = pixelProEinheit(a, f, kasten)
  return ansichtBegrenzen({ ...a, x: a.x - dx / ppe, y: a.y - dy / ppe }, f)
}

/** Zwei-Finger-Geste: Zoom nach Fingerabstand, Verschieben nach Bewegung der Mitte. */
export function zweiFingerAnsicht(
  start: Ansicht,
  startFinger: [Punkt, Punkt],
  jetztFinger: [Punkt, Punkt],
  f: Flaeche,
  kasten: BildschirmKasten,
): Ansicht {
  const mitte = (p: [Punkt, Punkt]): Punkt => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
  const dist = (p: [Punkt, Punkt]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y)
  const d0 = dist(startFinger)
  const verhaeltnis = d0 > 1 ? dist(jetztFinger) / d0 : 1
  const unter = bildschirmZuSkizze(mitte(startFinger), start, f, kasten)
  return ansichtUnterPunkt(start.zoom * verhaeltnis, unter, mitte(jetztFinger), f, kasten)
}

/** Faktor für ein Mausrad-Ereignis (deltaY > 0 = herauszoomen). */
export function radFaktor(deltaY: number): number {
  return Math.exp(-Math.max(-200, Math.min(200, deltaY)) * 0.002)
}
