/**
 * Geometrie-Hilfsfunktionen für den SkizzeEditor.
 *
 * Reine Logik (keine DOM-Abhängigkeiten), gut testbar.
 */

import type { SkizzeElement } from './types.js'

/** 2D-Punkt. */
export interface Punkt {
  x: number
  y: number
}

/** Abstand zweier Punkte. */
export function abstand(a: Punkt, b: Punkt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Abstand eines Punktes von einer Strecke (Linie von p1 zu p2).
 * Gibt den senkrechten Abstand zurück, falls der Fußpunkt auf der Strecke liegt;
 * andernfalls den Abstand zum nächstgelegenen Endpunkt.
 */
export function abstandPunktZuStrecke(p: Punkt, p1: Punkt, p2: Punkt): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const laenge2 = dx * dx + dy * dy
  if (laenge2 === 0) return abstand(p, p1)
  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / laenge2))
  return abstand(p, { x: p1.x + t * dx, y: p1.y + t * dy })
}

/** Trefferradius in logischen Pixeln für Klick/Touch auf ein Element. */
const TREFFERRADIUS = 8

/**
 * Prüft, ob ein Punkt auf einem Skizze-Element liegt (Treffertest).
 * Gibt `true` zurück, wenn der Punkt innerhalb des Trefferbereichs liegt.
 */
export function trifftElement(element: SkizzeElement, p: Punkt): boolean {
  switch (element.typ) {
    case 'rechteck': {
      const { x, y, breite, hoehe } = element
      const toleranz = TREFFERRADIUS
      // Trifft Rand oder Innenfläche
      return (
        p.x >= x - toleranz &&
        p.x <= x + breite + toleranz &&
        p.y >= y - toleranz &&
        p.y <= y + hoehe + toleranz
      )
    }
    case 'linie':
      return (
        abstandPunktZuStrecke(p, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <=
        TREFFERRADIUS
      )
    case 'kreis': {
      const d = abstand(p, { x: element.cx, y: element.cy })
      return Math.abs(d - element.radius) <= TREFFERRADIUS || d <= element.radius + TREFFERRADIUS
    }
    case 'text':
      // Trefferbereich: kleines Rechteck um den Ankerpunkt
      return (
        p.x >= element.x - TREFFERRADIUS &&
        p.x <= element.x + 120 &&
        p.y >= element.y - 20 &&
        p.y <= element.y + TREFFERRADIUS
      )
    case 'massangabe':
      return (
        abstandPunktZuStrecke(p, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <=
        TREFFERRADIUS
      )
  }
}

/**
 * Gibt das oberste (zuletzt gezeichnete) Element zurück, das den Punkt trifft.
 * Die Liste sollte von unten nach oben sortiert sein (letztes = ganz oben).
 */
export function trefferSuchen(
  elemente: ReadonlyArray<SkizzeElement>,
  p: Punkt,
): SkizzeElement | null {
  // Von hinten iterieren (oberstes zuerst)
  for (let i = elemente.length - 1; i >= 0; i--) {
    if (trifftElement(elemente[i], p)) return elemente[i]
  }
  return null
}

/** Verschiebt ein Element um den Vektor (dx, dy). */
export function elementVerschieben(element: SkizzeElement, dx: number, dy: number): SkizzeElement {
  switch (element.typ) {
    case 'rechteck':
      return { ...element, x: element.x + dx, y: element.y + dy }
    case 'linie':
      return {
        ...element,
        x1: element.x1 + dx,
        y1: element.y1 + dy,
        x2: element.x2 + dx,
        y2: element.y2 + dy,
      }
    case 'kreis':
      return { ...element, cx: element.cx + dx, cy: element.cy + dy }
    case 'text':
      return { ...element, x: element.x + dx, y: element.y + dy }
    case 'massangabe':
      return {
        ...element,
        x1: element.x1 + dx,
        y1: element.y1 + dy,
        x2: element.x2 + dx,
        y2: element.y2 + dy,
      }
  }
}
