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

/** Trefferradius in Skizzen-Einheiten (Standard, ohne Zoom-Umrechnung). */
const TREFFERRADIUS = 8
/** Kleiner Rand um Symbole im Standard (ohne Zoom-Umrechnung). */
const SYMBOL_RAND = 2

/**
 * Prüft, ob ein Punkt auf einem Skizze-Element liegt (Treffertest).
 * `toleranz` = Greifradius in Skizzen-Einheiten; der Editor rechnet ihn aus Bildschirmpixeln und Zoom
 * um, damit auch kleine Formen mit dem Finger zu treffen sind. Ohne Angabe gilt der Standardwert.
 */
export function trifftElement(element: SkizzeElement, p: Punkt, toleranz?: number): boolean {
  const t = toleranz ?? TREFFERRADIUS
  switch (element.typ) {
    case 'symbol': {
      const rand = toleranz ?? SYMBOL_RAND
      return (
        p.x >= element.x - rand &&
        p.x <= element.x + element.breite + rand &&
        p.y >= element.y - rand &&
        p.y <= element.y + element.hoehe + rand
      )
    }
    case 'rechteck': {
      const { x, y, breite, hoehe } = element
      // Trifft Rand oder Innenfläche
      return p.x >= x - t && p.x <= x + breite + t && p.y >= y - t && p.y <= y + hoehe + t
    }
    case 'linie':
    case 'massangabe':
      return abstandPunktZuStrecke(p, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <= t
    case 'kreis': {
      const d = abstand(p, { x: element.cx, y: element.cy })
      return Math.abs(d - element.radius) <= t || d <= element.radius + t
    }
    case 'text':
      // Trefferbereich: kleines Rechteck um den Ankerpunkt
      return p.x >= element.x - t && p.x <= element.x + 120 && p.y >= element.y - 20 && p.y <= element.y + t
  }
}

/**
 * Gibt das oberste (zuletzt gezeichnete) Element zurück, das den Punkt trifft.
 * Die Liste sollte von unten nach oben sortiert sein (letztes = ganz oben).
 */
export function trefferSuchen(
  elemente: ReadonlyArray<SkizzeElement>,
  p: Punkt,
  toleranz?: number,
): SkizzeElement | null {
  // Von hinten iterieren (oberstes zuerst)
  for (let i = elemente.length - 1; i >= 0; i--) {
    if (trifftElement(elemente[i], p, toleranz)) return elemente[i]
  }
  return null
}

/** Fläche des umgebenden Kastens (Linien und Maße zählen als dünn: 0). */
export function elementFlaeche(element: SkizzeElement): number {
  switch (element.typ) {
    case 'symbol':
    case 'rechteck':
      return element.breite * element.hoehe
    case 'kreis':
      return (2 * element.radius) ** 2
    case 'linie':
    case 'massangabe':
      return 0
    case 'text':
      return 120 * 20
  }
}

/**
 * Alle Elemente an dieser Stelle, in Auswahl-Reihenfolge: kleine Formen vor großen (ein Pfosten auf dem
 * Grundstück vor dem Grundstück), bei gleicher Größe das obere zuerst. So bleiben kleine Formen unter großen
 * erreichbar; `naechsterTreffer` wechselt beim erneuten Antippen durch diese Liste.
 */
export function alleTreffer(
  elemente: ReadonlyArray<SkizzeElement>,
  p: Punkt,
  toleranz?: number,
): SkizzeElement[] {
  const treffer: { el: SkizzeElement; flaeche: number; oben: number }[] = []
  elemente.forEach((el, i) => {
    if (trifftElement(el, p, toleranz)) treffer.push({ el, flaeche: elementFlaeche(el), oben: i })
  })
  treffer.sort((a, b) => a.flaeche - b.flaeche || b.oben - a.oben)
  return treffer.map((t) => t.el)
}

/**
 * Wechselt bei Überlagerung durch: nach dem aktuell gewählten Element kommt das nächste der Liste, nach dem
 * letzten wieder das erste. Ist nichts oder etwas anderes gewählt, kommt das erste. Leere Liste → null.
 */
export function naechsterTreffer(treffer: ReadonlyArray<SkizzeElement>, aktuellId: string | null): SkizzeElement | null {
  if (treffer.length === 0) return null
  const i = treffer.findIndex((t) => t.id === aktuellId)
  return treffer[(i + 1) % treffer.length]
}

/** Verschiebt ein Element um den Vektor (dx, dy). */
export function elementVerschieben(element: SkizzeElement, dx: number, dy: number): SkizzeElement {
  switch (element.typ) {
    case 'symbol':
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
