/**
 * Grundriss (Beta 4, Paket 3) → Excel-Formen für das Blatt „Skizze Bau“.
 *
 * Maße in Metern werden in EMU ab Blattecke umgerechnet und in den Zeichenbereich eingepasst (Seitenverhältnis bleibt,
 * Maßstab einheitlich). Jedes Bauteil wird eine bearbeitbare Form (Rechteck, bei L-Form usw. Freiform), die Maßketten
 * rote Maßlinien, darunter steht die Massenberechnung als Tabelle. Alles trägt `descr="wep-app"`; ein erneuter Export
 * ersetzt nur diese Formen (siehe `fuegeSkizzeFormenEin`). Stil: `docs/skills/parzellen-skizze.md`, Modus Bau.
 */

import { EMU_PRO_PT } from './skizzeBild'
import type { FormElement, Kasten, Punkt } from './skizzeFormen'
import {
  ausdehnungMitMassen,
  masskette,
  massenZeileText,
  massenberechnung,
  kuerzelVon,
  zahl2Text,
  type GPunkt,
  type GrundrissDaten,
  type Kettenabstaende,
} from '../skizze/grundriss'

const PT = EMU_PRO_PT

/** Abstand der Maßketten vom Grundriss auf dem Blatt (pt): Kette, Gesamtmaß dahinter. */
const KETTE_PT = 16
const GESAMT_PT = 32
/** Rechts steht die Zahl neben der Kette, das Gesamtmaß liegt dahinter. */
const GESAMT_Y_PT = 52
/** Zeilenhöhe der Massenberechnung (pt bei 8 pt Schrift). */
const ZEILE_PT = 11

const ident = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')

/**
 * Wandelt den Grundriss in Formen, die in `bereich` (EMU ab Blattecke) passen.
 * `bauteile` liefert die Kürzel der verknüpften Bauteile (sonst gilt das gespeicherte Kürzel des Teils).
 */
export function grundrissZuFormen(
  daten: GrundrissDaten,
  bereich: Kasten,
  bauteile: ReadonlyArray<{ id: string; kuerzel: string }> = [],
): FormElement[] {
  const teile = daten.teile.filter((t) => t.punkte.length >= 3)
  if (!teile.length) return []
  const gefiltert: GrundrissDaten = { ...daten, teile }

  const berechnung = massenberechnung(gefiltert, bauteile)
  const zeilen = [
    'Massenberechnung (Außenmaße, Kubatur nach Dachform)',
    ...berechnung.zeilen.map(massenZeileText),
    `Summe: ${zahl2Text(berechnung.flaecheSumme)} m²${berechnung.kubaturSumme > 0 ? ` · ${zahl2Text(berechnung.kubaturSumme)} m³` : ''}`,
  ]
  const tabelleH = Math.round((zeilen.length * ZEILE_PT + 6) * PT)
  const luecke = 8 * PT
  // Platz für die Maßzahlen hinter den Linien (unten unter der Kette, rechts neben der Kette)
  const mitKetten = daten.massketten !== false
  const randUnten = mitKetten ? 16 * PT : 0
  const randRechts = mitKetten ? (GESAMT_Y_PT + 34) * PT : 0
  const planBereich: Kasten = {
    x: bereich.x,
    y: bereich.y,
    w: Math.max(10 * PT, bereich.w - randRechts),
    h: Math.max(10 * PT, bereich.h - tabelleH - luecke - randUnten),
  }

  // Maßstab: die Abstände der Maßketten sind in pt vorgegeben, in Metern hängen sie vom Maßstab ab → kurz iterieren
  let abstaende: Kettenabstaende = { kette: 0.7, gesamt: 1.4 }
  let ausdehnung = ausdehnungMitMassen(gefiltert, abstaende)!
  const passe = () => Math.min(planBereich.w / Math.max(0.5, ausdehnung.x2 - ausdehnung.x1), planBereich.h / Math.max(0.5, ausdehnung.y2 - ausdehnung.y1))
  let massstab = passe()
  for (let i = 0; i < 5 && mitKetten; i++) {
    abstaende = { kette: (KETTE_PT * PT) / massstab, gesamt: (GESAMT_PT * PT) / massstab, gesamtY: (GESAMT_Y_PT * PT) / massstab }
    ausdehnung = ausdehnungMitMassen(gefiltert, abstaende)!
    massstab = passe() // passt zur Ausdehnung dieser Runde: nichts ragt über den Bereich
  }
  const breiteEmu = (ausdehnung.x2 - ausdehnung.x1) * massstab
  const hoeheEmu = (ausdehnung.y2 - ausdehnung.y1) * massstab
  const ox = planBereich.x + (planBereich.w - breiteEmu) / 2
  const oy = planBereich.y + (planBereich.h - hoeheEmu) / 2
  const P = (p: GPunkt): Punkt => ({ x: Math.round(ox + (p.x - ausdehnung.x1) * massstab), y: Math.round(oy + (p.y - ausdehnung.y1) * massstab) })

  const out: FormElement[] = []
  const benutzt = new Map<string, number>()
  const eindeutig = (basis: string) => {
    const n = benutzt.get(basis) ?? 0
    benutzt.set(basis, n + 1)
    return n === 0 ? basis : `${basis}_${n + 1}`
  }

  for (const t of teile) {
    const kuerzel = kuerzelVon(t, bauteile)
    const z = berechnung.zeilen.find((x) => x.teil === t)!
    out.push({
      typ: 'bauteil',
      name: eindeutig(ident(kuerzel) || 'Bauteil'),
      punkte: t.punkte.map(P),
      text: `${kuerzel}\n${zahl2Text(z.flaeche)} m²`,
      ...(t.gestrichelt ? { gestrichelt: true } : {}),
    })
  }

  if (mitKetten) {
    const ketten = masskette(gefiltert, abstaende)
    const zaehler = new Map<string, number>()
    for (const m of ketten) {
      const i = zaehler.get(m.art) ?? 0
      zaehler.set(m.art, i + 1)
      out.push({
        typ: 'massangabe',
        name: `Maß_${m.art.replace('-', '_')}_${i}`,
        von: P(m.von),
        nach: P(m.nach),
        text: m.text,
        textUnten: m.art === 'kette-x' || m.art === 'gesamt-x',
      })
    }
  }

  out.push({
    typ: 'massenberechnung',
    name: 'Massenberechnung',
    kasten: { x: bereich.x, y: Math.round(bereich.y + bereich.h - tabelleH), w: bereich.w, h: tabelleH },
    text: zeilen.join('\n'),
    schriftPt: 8,
  })
  return out
}
