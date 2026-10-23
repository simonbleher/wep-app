/**
 * Parzelle am WEP setzen und die Skizzen mitnehmen (Beta 6, Paket 1) – reine Rechnung, keine Oberfläche.
 *
 * Eine Parzelle je WEP: Angelegt vom Ersten, der das WEP bearbeitet, von beiden Teilen korrigierbar. Beim Ändern behalten
 * Bauteile (Meter im Grundriss) und Grün-Elemente (Meter über den Maßstab der Skizze) ihre Lage und Größe in Metern.
 */
import type { Wep } from '../model/types'
import type { SkizzeDaten } from '../skizze/types'
import { istGrundlage, leereSkizze } from '../skizze/types'
import type { GrundrissDaten } from '../skizze/grundriss'
import { punktImPolygon, schwerpunkt } from './polygon'
import { parzellenLage, type ParzellenLage } from './lage'
import { legeSkizzeAufParzelle, liegtAufParzelle } from './umlegen'
import { loese, vergleicheFlaeche, type FlaechenVergleich, type Loesung } from './geometrie'
import type { Parzelle, ParzelleTeil } from './types'

/** Lage und Berechnung der Parzelle eines WEP (undefined, solange keine Parzelle da oder noch nicht berechenbar). */
export const lageVon = (wep: Pick<Wep, 'parzelle'>): ParzellenLage | undefined => parzellenLage(wep.parzelle)

/** Fläche und Vergleich mit der Vertragsfläche aus den Formalien. */
export function flaecheUndVergleich(parzelle: Parzelle | undefined, vertragM2: number | undefined): { loesung?: Loesung; vergleich?: FlaechenVergleich } {
  if (!parzelle) return {}
  const loesung = loese(parzelle)
  return { loesung, vergleich: vergleicheFlaeche(loesung.flaeche, vertragM2) }
}

export interface WasLiegtDarauf {
  /** Teile im Grundriss des Bau-Teils. */
  bauteile: number
  /** Elemente der Grün-Skizze ohne die Grundlage (Parzelle, Pfosten, Bau-Formen). */
  gruen: number
  /** Formen der Grundlage, die aus dem Bau-Teil oder der Bau-Excel kommen (ohne Parzelle selbst). */
  grundlage: number
}

/** Was liegt schon auf der Parzelle? Davon hängt die Rückfrage vor dem Ändern ab. */
export function wasLiegtDarauf(wep: Pick<Wep, 'grundriss' | 'skizze'>): WasLiegtDarauf {
  const els = wep.skizze?.elemente ?? []
  return {
    bauteile: (wep.grundriss?.teile ?? []).filter((t) => t.punkte.length >= 3).length,
    gruen: els.filter((e) => !istGrundlage(e)).length,
    grundlage: els.filter((e) => istGrundlage(e) && e.typ === 'bauform' && e.art === 'bauteil').length,
  }
}

export const liegtEtwasDarauf = (w: WasLiegtDarauf): boolean => w.bauteile + w.gruen + w.grundlage > 0

/**
 * Setzt (oder entfernt) die Parzelle des WEP. Eine vorhandene Grün-Skizze wird auf die neue Parzelle gelegt:
 * Elemente behalten ihre Lage und Größe in Metern, das Grundstück und die Pfosten der Grundlage kommen aus der Parzelle.
 * Ohne Grün-Skizze bleibt `skizze` leer (sie entsteht, wenn der Reiter „Skizze“ sie braucht, siehe `skizzeMitParzelle`).
 * Ist die Parzelle (noch) nicht berechenbar, bleibt die Skizze, wie sie ist.
 */
export function setzeParzelle(wep: Wep, parzelle: Parzelle | undefined, jetzt: string = new Date().toISOString()): Wep {
  const neu: Wep = { ...wep }
  if (parzelle) neu.parzelle = parzelle
  else delete neu.parzelle
  const lage = parzellenLage(parzelle)
  if (neu.skizze) {
    if (lage) neu.skizze = legeSkizzeAufParzelle(neu.skizze, lage, jetzt)
    else if (neu.skizze.massstab) {
      const { massstab: _weg, ...rest } = neu.skizze
      neu.skizze = rest
    }
  }
  return neu
}

/** Stempel für „angelegt von … / geändert von …“. */
export function mitStempel(neu: Parzelle, alt: Parzelle | undefined, teil: ParzelleTeil, jetzt: string): Parzelle {
  return alt
    ? { ...neu, angelegtVon: alt.angelegtVon, angelegtAm: alt.angelegtAm, geaendertVon: teil, geaendertAm: jetzt }
    : { ...neu, angelegtVon: teil, angelegtAm: jetzt }
}

export type SkizzeLage = 'keine-parzelle' | 'passt' | 'leer' | 'umlegen'

/**
 * Wie liegt die Grün-Skizze zur Parzelle?
 * - `keine-parzelle`: es gibt keine berechenbare Parzelle (alter Stand, die Skizze zeigt sich wie bisher)
 * - `passt`: Maßstab und Lage stimmen
 * - `leer`: die Skizze fehlt oder hat nur die Grundlage – kann ohne Rückfrage auf die Parzelle gelegt werden
 * - `umlegen`: Grün-Elemente liegen noch nach altem Maßstab – erst nach Rückfrage auf die Parzelle legen
 */
export function skizzeLage(wep: Pick<Wep, 'parzelle' | 'skizze'>): SkizzeLage {
  const lage = parzellenLage(wep.parzelle)
  if (!lage) return 'keine-parzelle'
  if (liegtAufParzelle(wep.skizze, lage)) return 'passt'
  const gruen = (wep.skizze?.elemente ?? []).filter((e) => !istGrundlage(e)).length
  return gruen === 0 ? 'leer' : 'umlegen'
}

/**
 * Die Skizze, mit der Reiter, Export und PDF arbeiten: bei Parzelle ohne Grün-Elemente die Skizze mit der Parzelle als Grundlage
 * (wird nicht gespeichert), sonst die gespeicherte Skizze. Liegen Grün-Elemente noch nach altem Maßstab, bleibt sie, wie sie ist.
 */
export function skizzeMitParzelle(wep: Pick<Wep, 'parzelle' | 'skizze'>, jetzt: string = new Date().toISOString()): SkizzeDaten | undefined {
  const lage = parzellenLage(wep.parzelle)
  if (!lage) return wep.skizze
  const stand = skizzeLage(wep)
  if (stand === 'passt' || stand === 'umlegen') return wep.skizze
  return legeSkizzeAufParzelle(wep.skizze ?? leereSkizze(), lage, jetzt)
}

/** Teile des Grundrisses, die (teilweise) außerhalb der Parzelle liegen: Kürzel nur zur Anzeige (Index im Grundriss). */
export function teileAusserhalb(grundriss: GrundrissDaten | undefined, lage: ParzellenLage | undefined): number[] {
  if (!grundriss || !lage) return []
  const aus: number[] = []
  grundriss.teile.forEach((t, i) => {
    if (t.punkte.length < 3) return
    if (!t.punkte.every((p) => punktImPolygon(p, lage.punkte, 0.02))) aus.push(i)
  })
  return aus
}

/**
 * Verschiebt den ganzen Grundriss so, dass er (wenn er hineinpasst) in der Parzelle liegt; die Teile behalten ihre Lage zueinander.
 * Passt er nicht hinein, wird er mittig auf den Schwerpunkt der Parzelle gesetzt.
 */
export function schiebeGrundrissInParzelle(grundriss: GrundrissDaten, lage: ParzellenLage): GrundrissDaten {
  const alle = grundriss.teile.flatMap((t) => t.punkte)
  if (!alle.length) return grundriss
  const x1 = Math.min(...alle.map((p) => p.x))
  const y1 = Math.min(...alle.map((p) => p.y))
  const x2 = Math.max(...alle.map((p) => p.x))
  const y2 = Math.max(...alle.map((p) => p.y))
  const sp = schwerpunkt(lage.punkte)
  const versuche = [
    // möglichst wenig verschieben: gerade so weit, dass der Grundriss in den Grenzen der Parzelle liegt
    { dx: x1 < 0 ? -x1 : x2 > lage.breiteM ? lage.breiteM - x2 : 0, dy: y1 < 0 ? -y1 : y2 > lage.hoeheM ? lage.hoeheM - y2 : 0 },
    { dx: sp.x - (x1 + x2) / 2, dy: sp.y - (y1 + y2) / 2 },
  ]
  const ok = (v: { dx: number; dy: number }) =>
    grundriss.teile.every((t) => t.punkte.every((p) => punktImPolygon({ x: p.x + v.dx, y: p.y + v.dy }, lage.punkte, 0.02)))
  const v = versuche.find(ok) ?? versuche[1]
  const cm = (n: number) => Math.round(n * 100) / 100
  return { ...grundriss, teile: grundriss.teile.map((t) => ({ ...t, punkte: t.punkte.map((p) => ({ x: cm(p.x + v.dx), y: cm(p.y + v.dy) })) })) }
}
