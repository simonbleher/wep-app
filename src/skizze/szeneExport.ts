/**
 * Szene → Excel-Formen (`FormElement`) für `src/export/skizzeFormen.ts`.
 *
 * Nur die änderbaren Grün-Elemente werden zu Excel-Formen; feste Elemente (Bau-Formen)
 * stecken schon im Blatt und werden nie noch einmal geschrieben.
 */

import type { FormElement, Kasten } from '../export/skizzeFormen'
import { istPflanze } from './symbole'
import { istSymbol, type Szene } from './szene'

/** Namensbestandteil: Leerzeichen → „_“, nur Buchstaben, Ziffern, „_“ und „-“. */
const ident = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')

const GROSS = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** `grundstueck` = Grundstücksrahmen in EMU (gleiche Einheit wie die Bau-Formen im Blatt). */
export function szeneZuFormen(szene: Szene, grundstueck: Kasten): FormElement[] {
  const zaehler = new Map<string, number>()
  const nummer = (basis: string) => {
    const n = zaehler.get(basis) ?? 0
    zaehler.set(basis, n + 1)
    return `${basis}_${n}`
  }
  const out: FormElement[] = []
  for (const e of szene.elemente) {
    if (e.fest || !istSymbol(e.typ)) continue
    const kasten: Kasten = {
      x: Math.round(grundstueck.x + (e.x / 1000) * grundstueck.w),
      y: Math.round(grundstueck.y + (e.y / 1000) * grundstueck.h),
      w: Math.round((e.b / 1000) * grundstueck.w),
      h: Math.round((e.h / 1000) * grundstueck.h),
    }
    out.push({
      typ: e.typ,
      name: nummer(ident(e.beschriftung) || GROSS(e.typ)),
      kasten,
      text: e.beschriftung,
      ...(e.gruppe ? { gruppe: e.gruppe } : {}),
      ...(e.typ === 'entfernen' ? { pflanze: istPflanze(e.beschriftung) } : {}),
      ...(e.typ === 'hecke' && /flieder/i.test(e.beschriftung) ? { variante: 'flieder' } : {}),
      ...(e.typ === 'baum' && /ahorn/i.test(e.beschriftung) ? { variante: 'bergahorn' } : {}),
    })
  }
  return out
}
