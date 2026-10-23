/**
 * Grundriss (Beta 4, Paket 3) → Excel-Formen für das Blatt „Skizze Bau“.
 *
 * Maße in Metern werden in EMU ab Blattecke umgerechnet und in den Zeichenbereich eingepasst (Seitenverhältnis bleibt,
 * Maßstab einheitlich). Jedes Bauteil wird eine bearbeitbare Form (Rechteck, bei L-Form usw. Freiform), die Maßketten
 * rote Maßlinien, darunter steht die Massenberechnung als Tabelle. Alles trägt `descr="wep-app"`; ein erneuter Export
 * ersetzt nur diese Formen (siehe `fuegeSkizzeFormenEin`). Stil: `docs/skills/parzellen-skizze.md`, Modus Bau.
 */

import { EMU_PRO_PT } from './skizzeBild'
import { leinwandAbbildung, skizzeDatenZuFormen, type FormElement, type Kasten, type Punkt } from './skizzeFormen'
import { LEINWAND, type ParzellenLage } from '../parzelle/lage'
import { parzellenElemente } from '../parzelle/umlegen'
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

export interface GrundrissFormenOptionen {
  /**
   * Parzelle (Beta 6, Paket 1): Grundriss in echten Metern auf der Parzelle, die den Kasten füllt – mit demselben Maßstab und an
   * derselben Stelle wie in „Skizze Außenanlage-Aufwuchs“. Ohne Parzelle wird der Grundriss in den Kasten eingepasst (wie bisher).
   */
  parzelle?: ParzellenLage
  /** Das Blatt hat schon eigene Formen (von Hand gezeichnetes Grundstück): Grundstück und Pfosten der Parzelle entfallen. */
  hatFormen?: boolean
}

/**
 * Wandelt den Grundriss in Formen, die in `bereich` (EMU ab Blattecke) passen.
 * `bauteile` liefert die Kürzel der verknüpften Bauteile (sonst gilt das gespeicherte Kürzel des Teils).
 */
export function grundrissZuFormen(
  daten: GrundrissDaten,
  bereich: Kasten,
  bauteile: ReadonlyArray<{ id: string; kuerzel: string }> = [],
  optionen: GrundrissFormenOptionen = {},
): FormElement[] {
  if (optionen.parzelle) return grundrissAufParzelle(daten, bereich, bauteile, optionen.parzelle, optionen.hatFormen === true)
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


// ---------------------------------------------------------------------------
// Mit Parzelle (Beta 6, Paket 1)
// ---------------------------------------------------------------------------

const umgebend = (a: Punkt[]) => ({
  x1: Math.min(...a.map((p) => p.x)),
  y1: Math.min(...a.map((p) => p.y)),
  x2: Math.max(...a.map((p) => p.x)),
  y2: Math.max(...a.map((p) => p.y)),
})

/** Linke und rechte Grenze der Fläche auf der Höhe `y` (EMU): Schnitte der waagerechten Linie mit den Kanten. */
function spanne(ecken: readonly Punkt[], y: number): [number, number] {
  const xs: number[] = []
  ecken.forEach((a, i) => {
    const b = ecken[(i + 1) % ecken.length]
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
  })
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [Number.NaN, Number.NaN]
}

/**
 * Grundstück, Pfosten und Seitenmaße kommen aus denselben Elementen wie die Grundlage der Grün-Skizze (`parzellenElemente`) und gehen
 * durch dieselbe Leinwand-zu-Kasten-Abbildung (`skizzeDatenZuFormen`): beide Blätter zeigen die Parzelle an derselben Stelle in derselben
 * Größe. Der Grundriss liegt in denselben Metern, die Maßketten und die Massenberechnung stehen wie bisher darauf bzw. unten.
 */
function grundrissAufParzelle(
  daten: GrundrissDaten,
  bereich: Kasten,
  bauteile: ReadonlyArray<{ id: string; kuerzel: string }>,
  lage: ParzellenLage,
  hatFormen: boolean,
): FormElement[] {
  const out: FormElement[] = []
  // 1. Parzelle (Grundstück hell wie im Skill „Modus Bau“, Pfosten, auf Wunsch Seitenmaße)
  if (!hatFormen) {
    const parzelle = skizzeDatenZuFormen({ elemente: parzellenElemente(lage), breite: LEINWAND.breite, hoehe: LEINWAND.hoehe }, bereich)
    for (const f of parzelle) out.push(f.typ === 'grundstueck' ? { ...f, variante: 'bau' } : f)
  }

  const teile = daten.teile.filter((t) => t.punkte.length >= 3)
  if (!teile.length) return out
  const gefiltert: GrundrissDaten = { ...daten, teile }
  const { faktor, X, Y } = leinwandAbbildung(LEINWAND.breite, LEINWAND.hoehe, bereich)
  const emuProM = lage.abb.pxProM * faktor
  const P = (p: GPunkt): Punkt => ({ x: X(lage.abb.ox + p.x * lage.abb.pxProM), y: Y(lage.abb.oy + p.y * lage.abb.pxProM) })

  // 2. Bauteile
  const berechnung = massenberechnung(gefiltert, bauteile)
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

  // 3. Maßketten: Abstände in pt des Blatts, in Metern aus dem festen Maßstab
  const mitKetten = daten.massketten !== false
  const abstaende: Kettenabstaende = { kette: (KETTE_PT * PT) / emuProM, gesamt: (GESAMT_PT * PT) / emuProM, gesamtY: (GESAMT_Y_PT * PT) / emuProM }
  const ketten = mitKetten ? masskette(gefiltert, abstaende) : []
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

  // 4. Massenberechnung: unten im Kasten, bei Überdeckung mit dem Grundriss oben
  const zeilen = [
    'Massenberechnung (Außenmaße, Kubatur nach Dachform)',
    ...berechnung.zeilen.map(massenZeileText),
    `Summe: ${zahl2Text(berechnung.flaecheSumme)} m²${berechnung.kubaturSumme > 0 ? ` · ${zahl2Text(berechnung.kubaturSumme)} m³` : ''}`,
  ]
  const tabelleH = Math.round((zeilen.length * ZEILE_PT + 6) * PT)
  const plan = umgebend([...teile.flatMap((t) => t.punkte.map(P)), ...ketten.flatMap((m) => [P(m.von), P(m.nach)])])
  // Mit Seitenmaßen der Parzelle liegen Maßlinien innen am Rand: Die Tabelle bleibt davon fern (Abstand oben/unten, innerhalb der Seiten)
  const abstand = lage.massketten ? 30 * PT : 0
  const unten = Math.round(bereich.y + bereich.h - tabelleH - abstand)
  const oben = Math.round(bereich.y + abstand)
  const ueberdeckt = (y1: number, y2: number) => plan.y2 + 18 * PT > y1 && plan.y1 - 4 * PT < y2
  const tabelleY = ueberdeckt(unten, unten + tabelleH) && !ueberdeckt(oben, oben + tabelleH) ? oben : unten
  let tabelleX = bereich.x
  let tabelleB = bereich.w
  if (lage.massketten) {
    // schräge Seiten: zwischen den Seiten der Parzelle auf Höhe der Tabelle, mit Platz für die Maßlinien und ihre Zahlen
    const ecken = lage.punkte.map(P)
    const links = Math.max(spanne(ecken, tabelleY)[0], spanne(ecken, tabelleY + tabelleH)[0])
    const rechts = Math.min(spanne(ecken, tabelleY)[1], spanne(ecken, tabelleY + tabelleH)[1])
    const rand = 36 * PT
    if (Number.isFinite(links) && Number.isFinite(rechts) && rechts - links - 2 * rand >= 200 * PT) {
      tabelleX = Math.round(links + rand)
      tabelleB = Math.round(rechts - links - 2 * rand)
    }
  }
  out.push({
    typ: 'massenberechnung',
    name: 'Massenberechnung',
    kasten: { x: tabelleX, y: tabelleY, w: tabelleB, h: tabelleH },
    text: zeilen.join('\n'),
    schriftPt: 8,
  })
  return out
}
