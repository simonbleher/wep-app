// Stilprobe: alle Elementtypen des Formen-Exports auf einem leeren Blatt
// (Wiese + Gras werden vom Export ergänzt). Nur für den Vergleich mit dem Skill.

import type { FormElement, Kasten } from '../../../src/export/skizzeFormen'

const PT = 12700

export function stilprobe(z: Kasten): FormElement[] {
  const X = (f: number) => Math.round(z.x + z.w * f)
  const Y = (f: number) => Math.round(z.y + z.h * f)
  const box = (fx: number, fy: number, fw: number, fh: number): Kasten => ({ x: X(fx), y: Y(fy), w: Math.round(z.w * fw), h: Math.round(z.h * fh) })
  return [
    { typ: 'weg', name: 'Weg', kasten: box(0.42, 0.55, 0.16, 0.36) },
    { typ: 'tor', name: 'Tor', kasten: { x: X(0.5) - 30 * PT, y: Y(0.91), w: 60 * PT, h: 40 * PT } },
    { typ: 'hecke', name: 'Fliederhecke', kasten: box(0.08, 0.1, 0.45, 0.04), text: 'Flieder', variante: 'flieder' },
    { typ: 'hecke', name: 'Hecke', kasten: box(0.8, 0.2, 0.04, 0.3), text: 'Hainbuche' },
    { typ: 'baum', name: 'Bergahorn', kasten: box(0.62, 0.2, 0.1, 0.1), text: 'Bergahorn', variante: 'bergahorn' },
    { typ: 'baum', name: 'Buche', kasten: box(0.76, 0.28, 0.1, 0.1), text: 'Buche' },
    { typ: 'strauch', name: 'Jasmin', kasten: box(0.1, 0.3, 0.1, 0.07), text: 'Jasmin' },
    { typ: 'kompost', name: 'Kompost', kasten: box(0.25, 0.28, 0.14, 0.09) },
    { typ: 'beet', name: 'Beet', kasten: box(0.1, 0.5, 0.15, 0.08), text: 'Gemüsebeet' },
    { typ: 'hochbeet', name: 'Hochbeet', kasten: box(0.1, 0.65, 0.12, 0.07), text: 'Hochbeet' },
    { typ: 'brunnen', name: 'Brunnen', kasten: box(0.28, 0.66, 0.05, 0.035), text: 'Brunnen' },
    { typ: 'schacht', name: 'HW_Schacht_alt', kasten: box(0.3, 0.5, 0.05, 0.03), text: 'HW-Schacht alt' },
    { typ: 'entfernen', name: 'Wacholder', kasten: box(0.65, 0.5, 0.08, 0.06), text: 'Wacholder entfernen' },
    { typ: 'mangelhinweis', name: 'Rueckschnitt', kasten: box(0.3, 0.04, 0.2, 0.035), text: 'Rückschnitt', nach: { x: X(0.3), y: Y(0.12) } },
    { typ: 'massangabe', name: 'Maß_Weg_Breite', von: { x: X(0.42), y: Y(0.5) }, nach: { x: X(0.58), y: Y(0.5) }, text: '4 m' },
    { typ: 'massangabe', name: 'Maß_Hecke_Laenge', von: { x: X(0.88), y: Y(0.2) }, nach: { x: X(0.88), y: Y(0.5) }, text: '1,5 m' },
    { typ: 'text', name: 'Hinweis_Text', kasten: box(0.1, 0.8, 0.3, 0.03), text: 'Freitext auf der Skizze' },
  ]
}
