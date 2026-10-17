// Vergleich KI-Antwort ↔ erwartet.json und Preisberechnung über den App-Code.

import { berechnePreisvorschlag } from '@/gruen/preisvorschlag'
import { normalisiere, woerter } from '@/katalog/util'
import type { Position as KatalogPosition } from '@/katalog/types'
import type { Position } from '@/model'
import type { KiAntwort, KiZeile } from './prompt'

/** Erwartete Zeile; `alternativ` erlaubt fachlich gleichwertige Zuordnungen. */
export interface ErwarteteZeile extends KiZeile {
  alternativ?: { katalogId: string | null; varianteIndex: number | null }[]
}

export interface Erwartet {
  positionen: ErwarteteZeile[]
  kurzbeschreibung: string
}

export interface Paar {
  soll: ErwarteteZeile
  ist: KiZeile
  idOk: boolean
  varianteOk: boolean
  anzahlOk: boolean
  zustandOk: boolean
}

export interface Bewertung {
  soll: number
  ist: number
  treffer: number
  recall: number
  precision: number
  idOk: number
  varianteOk: number
  anzahlOk: number
  zustandOk: number
  summeSoll: number
  summeIst: number
  unsicherIst: number
  unsicherSoll: number
  unsicherGetroffen: number
  ungueltig: string[] // Variante außerhalb des Bereichs u. Ä.
  kgnGenannt: boolean
  paare: Paar[]
  fehlend: ErwarteteZeile[]
  zusaetzlich: KiZeile[]
}

/** Höchstwert aus Katalog-ID + Variante, undefined wenn nicht auflösbar. */
export function hoechstwert(katalog: Map<string, KatalogPosition>, z: Pick<KiZeile, 'katalogId' | 'varianteIndex'>): number | undefined {
  if (!z.katalogId) return undefined
  const p = katalog.get(z.katalogId)
  if (!p) return undefined
  if (p.varianten?.length) {
    return z.varianteIndex === null ? undefined : p.varianten[z.varianteIndex]?.hoechstwert
  }
  return p.hoechstwert
}

/** Gesamtpreis einer Zeile wie in der Excel: ROUND(Anzahl × Einzelpreis; 2). */
export function zeilenSumme(katalog: Map<string, KatalogPosition>, z: KiZeile): number {
  const position: Position = {
    id: 'ki-test',
    katalogId: z.katalogId ?? undefined,
    bezeichnung: z.bezeichnung,
    anzahl: z.anzahl,
    einheit: z.einheit,
    zustand: z.zustand,
    hoechstwert: hoechstwert(katalog, z),
    einzelpreis: 0,
    preisManuell: false,
    hinweise: [],
  }
  return Math.round(z.anzahl * berechnePreisvorschlag(position) * 100) / 100
}

function stamm(wort: string): string {
  return wort.slice(0, 5)
}

/** Wortähnlichkeit zweier Bezeichnungen (0–1), tolerant gegen Endungen. */
export function textAehnlichkeit(a: string, b: string): number {
  const wa = new Set(woerter(normalisiere(a)).filter((w) => w.length > 2).map(stamm))
  const wb = new Set(woerter(normalisiere(b)).filter((w) => w.length > 2).map(stamm))
  if (!wa.size || !wb.size) return 0
  let gemeinsam = 0
  for (const w of wa) if (wb.has(w)) gemeinsam++
  return gemeinsam / Math.min(wa.size, wb.size)
}

function zuordnungOk(soll: ErwarteteZeile, ist: KiZeile): { id: boolean; variante: boolean } {
  const moeglich = [{ katalogId: soll.katalogId, varianteIndex: soll.varianteIndex }, ...(soll.alternativ ?? [])]
  const id = moeglich.some((m) => m.katalogId === ist.katalogId)
  const variante = moeglich.some((m) => m.katalogId === ist.katalogId && m.varianteIndex === ist.varianteIndex)
  return { id, variante }
}

export function bewerte(katalog: Map<string, KatalogPosition>, erwartet: Erwartet, antwort: KiAntwort): Bewertung {
  const soll = erwartet.positionen
  const ist = antwort.positionen

  // Kandidatenpaare: gleiche (nicht-leere) Katalog-ID oder ähnliche Bezeichnung.
  const kandidaten: { s: number; i: number; score: number }[] = []
  soll.forEach((s, si) =>
    ist.forEach((z, ii) => {
      const { id, variante } = zuordnungOk(s, z)
      const idGleich = id && z.katalogId !== null
      const sim = textAehnlichkeit(s.bezeichnung, z.bezeichnung)
      if (!idGleich && sim < 0.5) return
      const score = (idGleich ? 3 : 0) + (variante ? 2 : 0) + (s.anzahl === z.anzahl ? 1 : 0) + 2 * sim
      kandidaten.push({ s: si, i: ii, score })
    }),
  )
  kandidaten.sort((a, b) => b.score - a.score)

  const sollFrei = new Set(soll.map((_, i) => i))
  const istFrei = new Set(ist.map((_, i) => i))
  const paare: Paar[] = []
  for (const k of kandidaten) {
    if (!sollFrei.has(k.s) || !istFrei.has(k.i)) continue
    sollFrei.delete(k.s)
    istFrei.delete(k.i)
    const s = soll[k.s]
    const z = ist[k.i]
    const { id, variante } = zuordnungOk(s, z)
    paare.push({
      soll: s,
      ist: z,
      idOk: id,
      varianteOk: variante,
      anzahlOk: Math.abs(s.anzahl - z.anzahl) < 1e-6,
      zustandOk: s.zustand === z.zustand,
    })
  }

  const ungueltig: string[] = []
  for (const z of ist) {
    if (z.katalogId && !katalog.has(z.katalogId)) ungueltig.push(`unbekannte ID ${z.katalogId}`)
    const p = z.katalogId ? katalog.get(z.katalogId) : undefined
    if (p?.varianten?.length && (z.varianteIndex === null || !p.varianten[z.varianteIndex])) {
      ungueltig.push(`${z.katalogId}: Variante ${z.varianteIndex} fehlt/ungültig`)
    }
    if (!(z.anzahl > 0)) ungueltig.push(`${z.bezeichnung}: Anzahl ${z.anzahl}`)
  }

  const summe = (zeilen: KiZeile[]) => Math.round(zeilen.reduce((s, z) => s + zeilenSumme(katalog, z), 0) * 100) / 100
  const anteil = (n: number, von: number) => (von ? n / von : 1)

  return {
    soll: soll.length,
    ist: ist.length,
    treffer: paare.length,
    recall: anteil(paare.length, soll.length),
    precision: anteil(paare.length, ist.length),
    idOk: paare.filter((p) => p.idOk).length,
    varianteOk: paare.filter((p) => p.varianteOk).length,
    anzahlOk: paare.filter((p) => p.anzahlOk).length,
    zustandOk: paare.filter((p) => p.zustandOk).length,
    summeSoll: summe(soll),
    summeIst: summe(ist),
    unsicherIst: ist.filter((z) => z.unsicher).length,
    unsicherSoll: soll.filter((z) => z.unsicher).length,
    unsicherGetroffen: paare.filter((p) => p.soll.unsicher && p.ist.unsicher).length,
    ungueltig,
    kgnGenannt: /\bKGN\b/i.test(antwort.kurzbeschreibung ?? ''),
    paare,
    fehlend: soll.filter((_, i) => sollFrei.has(i)),
    zusaetzlich: ist.filter((_, i) => istFrei.has(i)),
  }
}
