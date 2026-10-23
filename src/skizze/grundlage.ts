/**
 * Grundlage der Grün-Skizze (Beta 5, Paket 1): die Bau-Skizze als eigene Ebene unter dem Grün.
 *
 * Quellen, in dieser Reihenfolge: (a) der Grundriss des Bau-Teils (Meter) · (b) die Formen aus dem Blatt
 * „Skizze Bau“ der eingelesenen Bau-Excel (EMU). Beide werden in Skizzen-Pixel umgerechnet und als Elemente mit
 * `ebene: 'grundlage'` an den Anfang von `SkizzeDaten.elemente` gesetzt – die Grün-Elemente bleiben davon unberührt.
 * Reine Rechnung ohne DOM, damit sie testbar ist.
 */

import type { BauSkizzeForm, BauSkizzeLesen } from '../export/bauSkizzeLesen'
import { LEINWAND, VORLAGE_SEITENVERHAELTNIS, meterZuPx, type ParzellenLage } from '../parzelle/lage'
import { legeSkizzeAufParzelle, liegtAufParzelle, parzellenElemente } from '../parzelle/umlegen'
import type { GrundrissDaten } from './grundriss'
import { kuerzelVon } from './grundriss'
import type { SkizzeBauform, SkizzeDaten, SkizzeElement, SkizzeLinie, SkizzeText } from './types'
import { istGrundlage, neueId } from './types'

/** Breite der Zeichenfläche, wenn die Grundlage eine leere Skizze bekommt (Pixel). */
export const GRUNDLAGE_BREITE = 600
/** Höhe : Breite des Zeichenbereichs B7:G48 der Vorlage („Skizze Außenanlage-Aufwuchs“, 452 × 622 pt). */
export { VORLAGE_SEITENVERHAELTNIS }
/** Rand des Grundstücks zum Rand der Zeichenfläche, als Anteil der Breite (8 pt von 452 pt, Skill parzellen-skizze). */
const RAND_ANTEIL = 8 / 452
/** Kante eines Zaunpfostens in pt (Skill: 5 × 5 pt) und Höchstmaß, bis zu dem eine Excel-Form als Pfosten gilt. */
const PFOSTEN_PT = 5
const PFOSTEN_MAX_PT = 10
const EMU_PRO_PT = 12700

export interface GrundlageErgebnis {
  daten: SkizzeDaten
  /** Anzahl der Elemente der Grundlage. */
  anzahl: number
  /** Was nicht oder nur angenähert übernommen wurde. */
  hinweise: string[]
}

export type GrundlageQuelle =
  | { art: 'bau'; grundriss: GrundrissDaten; bauteile?: ReadonlyArray<{ id: string; kuerzel: string }>; flaecheM2?: number }
  | { art: 'excel'; lesen: BauSkizzeLesen; excelName?: string; lage?: ParzellenLage }
  /** Mit Parzelle (Beta 6, Paket 1): Grundstück und Pfosten aus der Parzelle, Bauteile (falls vorhanden) in echten Metern. */
  | { art: 'parzelle'; lage: ParzellenLage; grundriss?: GrundrissDaten; bauteile?: ReadonlyArray<{ id: string; kuerzel: string }> }

/** Gibt es im Bau-Teil überhaupt etwas zu übernehmen? */
export const grundrissHatTeile = (g: GrundrissDaten | undefined): g is GrundrissDaten => Boolean(g?.teile.some((t) => t.punkte.length >= 3))

export const hatGrundlage = (daten: SkizzeDaten | undefined): boolean => Boolean(daten?.elemente.some(istGrundlage))

/** Elemente, die der Editor zum Auswählen anbietet: bei gesperrter Grundlage nur das Grün. */
export function waehlbareElemente(daten: Pick<SkizzeDaten, 'elemente' | 'grundlage'>): SkizzeElement[] {
  return daten.grundlage?.gesperrt ? daten.elemente.filter((e) => !istGrundlage(e)) : daten.elemente
}

/** Grün-Elemente (alles außer der Grundlage). */
export const gruenElemente = (daten: SkizzeDaten): SkizzeElement[] => daten.elemente.filter((e) => !istGrundlage(e))

/**
 * Größe der Zeichenfläche: Eine Skizze ohne Grün-Elemente bekommt das Seitenverhältnis des Zeichenbereichs im
 * Excel-Blatt (so liegt die Grundlage im Export genau über der Bau-Skizze). Gibt es schon Grün, bleibt die Größe.
 */
export function leinwandFuer(daten: SkizzeDaten, seitenverhaeltnis: number): { breite: number; hoehe: number } {
  if (gruenElemente(daten).length === 0) {
    return { breite: GRUNDLAGE_BREITE, hoehe: Math.round(GRUNDLAGE_BREITE * seitenverhaeltnis) }
  }
  return { breite: daten.breite ?? 800, hoehe: daten.hoehe ?? 600 }
}

const form = (art: SkizzeBauform['art'], punkte: { x: number; y: number }[], extra: Partial<SkizzeBauform> = {}): SkizzeBauform => ({
  id: neueId(),
  typ: 'bauform',
  ebene: 'grundlage',
  art,
  punkte: punkte.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
  ...extra,
})

const rechteck = (x: number, y: number, b: number, h: number) => [
  { x, y },
  { x: x + b, y },
  { x: x + b, y: y + h },
  { x, y: y + h },
]

// ---------------------------------------------------------------------------
// (a) Grundriss des Bau-Teils
// ---------------------------------------------------------------------------

function ausGrundriss(q: Extract<GrundlageQuelle, { art: 'bau' }>, breite: number, hoehe: number): { elemente: SkizzeElement[]; hinweise: string[] } {
  const teile = q.grundriss.teile.filter((t) => t.punkte.length >= 3)
  const faktor = breite / 452 // px je pt des Excel-Blatts
  const rand = breite * RAND_ANTEIL
  const gs = { x: rand, y: rand, b: breite - 2 * rand, h: hoehe - 2 * rand }

  const xs = teile.flatMap((t) => t.punkte.map((p) => p.x))
  const ys = teile.flatMap((t) => t.punkte.map((p) => p.y))
  const x1 = Math.min(...xs)
  const y1 = Math.min(...ys)
  const bm = Math.max(0.5, Math.max(...xs) - x1)
  const hm = Math.max(0.5, Math.max(...ys) - y1)

  // Maßstab (px je m): passend in das Grundstück; mit bekannter Parzellenfläche höchstens so groß, wie es der Fläche entspricht
  const passend = Math.min((gs.b * 0.8) / bm, (gs.h * 0.55) / hm)
  const nachFlaeche = q.flaecheM2 && q.flaecheM2 > 0 ? gs.b / Math.sqrt(q.flaecheM2 * (gs.b / gs.h)) : Infinity
  const massstab = Math.min(passend, nachFlaeche)
  const ox = gs.x + (gs.b - bm * massstab) / 2
  const oy = gs.y + Math.min(gs.h * 0.12, Math.max(0, (gs.h * 0.7 - hm * massstab) / 2))
  const P = (p: { x: number; y: number }) => ({ x: ox + (p.x - x1) * massstab, y: oy + (p.y - y1) * massstab })

  const elemente: SkizzeElement[] = [form('grundstueck', rechteck(gs.x, gs.y, gs.b, gs.h))]

  // Zaunpfosten: Ecken und gleichmäßig am Rand
  const kante = PFOSTEN_PT * faktor
  const nx = Math.max(2, Math.round(gs.b / (110 * faktor)))
  const ny = Math.max(2, Math.round(gs.h / (110 * faktor)))
  const pfosten: { x: number; y: number }[] = []
  for (let i = 0; i <= nx; i++) for (const y of [gs.y, gs.y + gs.h]) pfosten.push({ x: gs.x + (gs.b * i) / nx, y })
  for (let j = 1; j < ny; j++) for (const x of [gs.x, gs.x + gs.b]) pfosten.push({ x, y: gs.y + (gs.h * j) / ny })
  for (const p of pfosten) elemente.push(form('pfosten', rechteck(p.x - kante / 2, p.y - kante / 2, kante, kante)))

  for (const t of teile) {
    elemente.push(
      form('bauteil', t.punkte.map(P), {
        beschriftung: kuerzelVon(t, q.bauteile ?? []),
        ...(t.gestrichelt ? { gestrichelt: true } : {}),
      }),
    )
  }
  return { elemente, hinweise: [] }
}

// ---------------------------------------------------------------------------
// (a2) Parzelle + Grundriss in echten Metern (Beta 6, Paket 1)
// ---------------------------------------------------------------------------

function ausParzelle(q: Extract<GrundlageQuelle, { art: 'parzelle' }>): { elemente: SkizzeElement[]; hinweise: string[] } {
  const elemente = parzellenElemente(q.lage)
  const hinweise: string[] = []
  const teile = (q.grundriss?.teile ?? []).filter((t) => t.punkte.length >= 3)
  // Pfosten liegen unter den Gebäuden, das Grundstück ganz unten (Reihenfolge wie im Excel-Blatt)
  for (const t of teile) {
    elemente.push(
      form('bauteil', t.punkte.map((p) => meterZuPx(q.lage.abb, p)), {
        beschriftung: kuerzelVon(t, q.bauteile ?? []),
        ...(t.gestrichelt ? { gestrichelt: true } : {}),
      }),
    )
  }
  const aussen = teile.filter((t) => t.punkte.some((p) => p.x < -0.01 || p.y < -0.01 || p.x > q.lage.breiteM + 0.01 || p.y > q.lage.hoeheM + 0.01))
  if (aussen.length) {
    hinweise.push(`${aussen.map((t) => kuerzelVon(t, q.bauteile ?? [])).join(', ')} liegt im Grundriss außerhalb der Parzelle – im Reiter „Skizze Bau“ in die Parzelle schieben.`)
  }
  return { elemente, hinweise }
}

// ---------------------------------------------------------------------------
// (b) Formen aus „Skizze Bau“ der Bau-Excel
// ---------------------------------------------------------------------------

/** Beschriftung einer eigenen Grundriss-Form („L\n24,00 m²“) auf das Kürzel kürzen. */
function beschriftungVon(text: string | undefined, eigen: boolean): string | undefined {
  if (!text) return undefined
  const zeilen = text.split('\n').map((z) => z.trim()).filter(Boolean)
  const kurz = eigen ? zeilen.filter((z) => !/m²$/.test(z)) : zeilen
  return kurz.length ? kurz.join('\n') : undefined
}

/** Das Grundstück in der Bau-Excel: die Form „Grundstück“, sonst die erste Form, die mindestens 80 % des Zeichenbereichs füllt. */
export function grundstueckForm(lesen: BauSkizzeLesen): BauSkizzeForm | undefined {
  const { bereich, formen } = lesen
  const vielecke = formen.filter((f) => f.art === 'vieleck' && f.punkte && f.punkte.length >= 3)
  return (
    vielecke.find((f) => /^Grundst/i.test(f.name)) ??
    vielecke.find((f) => (f.kasten.w * f.kasten.h) / Math.max(1, bereich.w * bereich.h) >= 0.8)
  )
}

function ausExcel(q: Extract<GrundlageQuelle, { art: 'excel' }>, breite: number, hoehe: number): { elemente: SkizzeElement[]; hinweise: string[] } {
  const { bereich, formen } = q.lesen
  const hinweise: string[] = [...q.lesen.hinweise]
  // Mit Parzelle: das Grundstück der Bau-Excel wird auf die Parzelle gelegt (gleichmäßig eingepasst), das Grundstück selbst und die
  // Pfosten kommen aus der Parzelle. Ohne Parzelle füllt der Zeichenbereich die Leinwand wie bisher.
  const lage = q.lage
  const gs = lage ? grundstueckForm(q.lesen) : undefined
  const ziel = lage
    ? {
        x: lage.abb.ox,
        y: lage.abb.oy,
        w: lage.breiteM * lage.abb.pxProM,
        h: lage.hoeheM * lage.abb.pxProM,
      }
    : { x: 0, y: 0, w: breite, h: hoehe }
  const quellKasten = gs ? gs.kasten : bereich
  const s = Math.min(ziel.w / quellKasten.w, ziel.h / quellKasten.h) // px je EMU
  const ox = ziel.x + (ziel.w - quellKasten.w * s) / 2
  const oy = ziel.y + (ziel.h - quellKasten.h * s) / 2
  const P = (p: { x: number; y: number }) => ({ x: ox + (p.x - quellKasten.x) * s, y: oy + (p.y - quellKasten.y) * s })
  const pxProPt = s * EMU_PRO_PT

  const grundstueck: SkizzeElement[] = []
  const pfosten: SkizzeElement[] = []
  const bauteile: SkizzeElement[] = []
  const linien: SkizzeElement[] = []
  const texte: SkizzeElement[] = []
  const bilder: string[] = []
  const angenaehert: string[] = []

  for (const f of formen) {
    // Eigene Maßketten und die Massenberechnung des Bau-Exports gehören nicht in die Grün-Skizze
    if (f.eigen && (/^Maß/.test(f.name) || f.name === 'Massenberechnung')) continue
    switch (f.art) {
      case 'bild':
        if (!/gras|wiese/i.test(f.name)) bilder.push(f.name || 'Bild')
        break
      case 'linie': {
        if (!f.von || !f.nach) break
        const a = P(f.von)
        const b = P(f.nach)
        if (Math.hypot(a.x - b.x, a.y - b.y) < 1) break
        const l: SkizzeLinie = { id: neueId(), typ: 'linie', ebene: 'grundlage', x1: a.x, y1: a.y, x2: b.x, y2: b.y }
        linien.push(l)
        break
      }
      case 'text': {
        texte.push(...textElemente(f, P, pxProPt))
        break
      }
      case 'vieleck': {
        if (!f.punkte || f.punkte.length < 3) break
        if (f.angenaehert) angenaehert.push(`„${f.name || f.angenaehert}“ (${f.angenaehert}) als Rechteck`)
        const punkte = f.punkte.map(P)
        const breitePt = f.kasten.w / EMU_PRO_PT
        const hoehePt = f.kasten.h / EMU_PRO_PT
        const flaechenAnteil = (f.kasten.w * f.kasten.h) / (bereich.w * bereich.h)
        const istGrundstueck = lage ? f === gs : grundstueck.length === 0 && (/^Grundst/i.test(f.name) || flaechenAnteil >= 0.8)
        const istPfosten = breitePt <= PFOSTEN_MAX_PT && hoehePt <= PFOSTEN_MAX_PT && !f.text
        // Mit Parzelle kommen Grundstück und Pfosten aus der Parzelle
        if (istGrundstueck) {
          if (!lage) grundstueck.push(form('grundstueck', punkte))
        } else if (istPfosten) {
          if (!lage) pfosten.push(form('pfosten', punkte))
        } else {
          bauteile.push(form('bauteil', punkte, { ...(beschriftungVon(f.text, f.eigen) ? { beschriftung: beschriftungVon(f.text, f.eigen) } : {}), ...(f.gestrichelt ? { gestrichelt: true } : {}) }))
        }
        break
      }
    }
  }

  if (bilder.length) hinweise.push(`${bilder.length === 1 ? 'Ein Bild' : `${bilder.length} Bilder`} in „Skizze Bau“ nicht übernommen (${[...new Set(bilder)].slice(0, 4).join(', ')}) – bei Bedarf von Hand ergänzen.`)
  if (angenaehert.length) hinweise.push(`Nur angenähert übernommen: ${angenaehert.slice(0, 4).join(', ')}.`)
  if (lage && !gs) hinweise.push('In „Skizze Bau“ ist kein Grundstück gezeichnet; die Formen sind auf die Parzelle eingepasst, bitte die Lage prüfen.')
  return { elemente: [...(lage ? parzellenElemente(lage) : []), ...grundstueck, ...pfosten, ...bauteile, ...linien, ...texte], hinweise }
}

/** Freies Textfeld → ein Text-Element je Zeile, mittig im Feld. */
function textElemente(f: BauSkizzeForm, P: (p: { x: number; y: number }) => { x: number; y: number }, pxProPt: number): SkizzeText[] {
  const zeilen = (f.text ?? '').split('\n').filter((z) => z.trim())
  if (!zeilen.length) return []
  const gr = Math.max(9, Math.min(16, Math.round(10 * pxProPt)))
  const mitte = P({ x: f.kasten.x + f.kasten.w / 2, y: f.kasten.y + f.kasten.h / 2 })
  return zeilen.map((z, i) => ({
    id: neueId(),
    typ: 'text',
    ebene: 'grundlage',
    inhalt: z,
    schriftgroesse: gr,
    x: Math.round((mitte.x - (z.length * gr * 0.55) / 2) * 10) / 10,
    y: Math.round((mitte.y + (i - zeilen.length / 2) * gr * 1.25) * 10) / 10,
  }))
}

// ---------------------------------------------------------------------------
// Übernehmen
// ---------------------------------------------------------------------------

/**
 * Setzt die Grundlage in die Skizze: bisherige Grundlage ersetzen, Grün-Elemente behalten, die neue Grundlage
 * steht ganz unten. Nach dem Übernehmen ist sie gesperrt. `null`, wenn die Quelle nichts hergibt.
 */
export function uebernehmeGrundlage(daten: SkizzeDaten, quelle: GrundlageQuelle, jetzt: string): GrundlageErgebnis | null {
  if (quelle.art === 'bau' && !grundrissHatTeile(quelle.grundriss)) return null
  if (quelle.art === 'excel' && !quelle.lesen.formen.length) return null
  // Mit Parzelle liegt die Skizze auf deren Maßstab (Grün in Metern mitgenommen), die Grundlage kommt aus der Parzelle
  const lage = quelle.art === 'parzelle' ? quelle.lage : quelle.art === 'excel' ? quelle.lage : undefined
  if (lage) {
    const auf = liegtAufParzelle(daten, lage) ? daten : legeSkizzeAufParzelle(daten, lage, jetzt)
    const erg = quelle.art === 'parzelle' ? ausParzelle(quelle) : ausExcel(quelle as Extract<GrundlageQuelle, { art: 'excel' }>, LEINWAND.breite, LEINWAND.hoehe)
    const neu: SkizzeDaten = {
      ...auf,
      elemente: [...erg.elemente, ...gruenElemente(auf)],
      grundlage: {
        quelle: quelle.art === 'excel' ? 'excel' : quelle.grundriss && grundrissHatTeile(quelle.grundriss) ? 'bau' : 'parzelle',
        uebernommen: jetzt,
        gesperrt: true,
        ...(quelle.art === 'excel' && quelle.excelName ? { excelName: quelle.excelName } : {}),
        ...(erg.hinweise.length ? { hinweise: erg.hinweise } : {}),
      },
    }
    return { daten: neu, anzahl: erg.elemente.length, hinweise: erg.hinweise }
  }
  const verhaeltnis = quelle.art === 'excel' && quelle.lesen.bereich.w > 0 ? quelle.lesen.bereich.h / quelle.lesen.bereich.w : VORLAGE_SEITENVERHAELTNIS
  const { breite, hoehe } = leinwandFuer(daten, verhaeltnis)
  const erg = quelle.art === 'bau' ? ausGrundriss(quelle, breite, hoehe) : ausExcel(quelle as Extract<GrundlageQuelle, { art: 'excel' }>, breite, hoehe)
  if (!erg.elemente.length) return null
  const neu: SkizzeDaten = {
    ...daten,
    breite,
    hoehe,
    elemente: [...erg.elemente, ...gruenElemente(daten)],
    grundlage: {
      quelle: quelle.art === 'bau' ? 'bau' : 'excel',
      uebernommen: jetzt,
      gesperrt: true,
      ...(quelle.art === 'excel' && quelle.excelName ? { excelName: quelle.excelName } : {}),
      ...(erg.hinweise.length ? { hinweise: erg.hinweise } : {}),
    },
  }
  return { daten: neu, anzahl: erg.elemente.length, hinweise: erg.hinweise }
}

/** Sperrt oder entsperrt die Grundlage (ohne Grundlage keine Änderung). */
export function setzeGrundlageGesperrt(daten: SkizzeDaten, gesperrt: boolean): SkizzeDaten {
  if (!daten.grundlage) return daten
  return { ...daten, grundlage: { ...daten.grundlage, gesperrt } }
}
