// Grundriss („Skizze Bau“, Beta 4, Paket 3) → Bauteile (Paket 2): Fläche, Maße, Höhe und Kubatur fließen in die Bewertung.
//
// Ein Teil des Grundrisses, das mit einem Bauteil verknüpft ist, liefert dessen Grundfläche (Außenmaße, Richtlinie S. 3 Nr. 2)
// und den umbauten Raum (S. 4 Nr. 9, Beseitigungskosten). Wie überall: Der Wertermittler kann alles überschreiben –
// setzt er die Fläche in der Bauteil-Maske von Hand, steht `ausGrundriss` auf false und der Grundriss lässt sie in Ruhe.
import type { Bauteil, Wep } from '@/model'
import { massenJeBauteil, type BauteilMassen, type GrundrissDaten, type GrundrissTeil } from '@/skizze/grundriss'
import { GEWAECHSHAUS, MINDERUNG_REGEL } from './tabellen'

/** Das Bauteil mit den Werten aus dem Grundriss (unverändert, wenn nichts zu übernehmen ist). */
export function bauteilMitGrundriss(b: Bauteil, m: BauteilMassen): Bauteil {
  if (b.ausGrundriss === false) return b
  const neu: Bauteil = { ...b, ausGrundriss: true, flaeche: m.flaeche, flaecheManuell: true }
  if (m.laenge !== undefined && m.breite !== undefined) {
    neu.laenge = m.laenge
    neu.breite = m.breite
  }
  // Gewächshaus: Höhe = Firsthöhe (Warnung ab 2,20 m); sonst mittlere Höhe, damit Fläche × Höhe = Kubatur bleibt
  const hoehe = b.art === 'gewaechshaus' ? m.hoeheMax : m.hoeheMittel
  if (hoehe !== undefined) neu.hoehe = hoehe
  if (m.kubaturM3 !== undefined) neu.kubaturM3 = m.kubaturM3
  const gleich =
    neu.flaeche === b.flaeche && neu.laenge === b.laenge && neu.breite === b.breite && neu.hoehe === b.hoehe &&
    neu.kubaturM3 === b.kubaturM3 && b.ausGrundriss === true && b.flaecheManuell === true
  return gleich ? b : neu
}

/**
 * Bauteil, das nur aus der Skizze kommt: außer Art, Kürzel und Maßen hat der Wertermittler nichts eingetragen
 * (Voreinstellungen wie beim Anlegen zählen nicht). Solche Bauteile ergänzt der Abgleich mit der Bau-Excel.
 */
export function nurGezeichnet(b: Bauteil): boolean {
  const vorgabe = (wert: number | string | undefined, standard: number | string | undefined) => wert === undefined || wert === standard
  return (
    !b.typ && b.baujahr === undefined && b.restnutzungsjahre === undefined && b.maengel.length === 0 && !b.bezeichnung?.trim() &&
    !b.rnBegruendung?.trim() && b.wanddickeCm === undefined && !b.typenlaube &&
    vorgabe(b.material, b.art === 'keller' ? 'stein' : undefined) &&
    vorgabe(b.nhk, b.art === 'gewaechshaus' ? GEWAECHSHAUS.nhk : undefined) &&
    vorgabe(b.minderungProJahr, b.art === 'gewaechshaus' || b.art === 'vorplatz' ? MINDERUNG_REGEL : undefined)
  )
}

/**
 * Bauteil, dessen Teil im Grundriss gelöscht (oder getrennt) wurde: Fläche und Maße stammten aus der Form und gelten nicht
 * mehr. Das Bauteil bleibt mit Fläche 0 stehen und erscheint als „noch nicht gezeichnet“; gelöscht wird nichts.
 */
function ohneGrundriss(b: Bauteil): Bauteil {
  const { laenge: _l, breite: _b, hoehe: _h, kubaturM3: _k, ausGrundriss: _a, flaecheManuell: _f, ...rest } = b
  return { ...rest, flaeche: 0 }
}

/**
 * Übernimmt Fläche, Maße, Höhe und Kubatur aus dem Grundriss in die verknüpften Bauteile; Bauteile, deren Teil gelöscht
 * wurde, verlieren die Werte aus der Form (`ohneGrundriss`). Gibt dasselbe WEP zurück, wenn sich nichts ändert (so löst es
 * kein Speichern aus).
 */
export function uebernehmeGrundriss(wep: Wep, grundriss: GrundrissDaten | undefined = wep.grundriss): Wep {
  if (!wep.bau || !grundriss) return wep
  const massen = new Map(massenJeBauteil(grundriss).map((m) => [m.bauteilId, m]))
  const verknuepft = new Set(grundriss.teile.map((t) => t.bauteilId).filter(Boolean))
  let geaendert = false
  const bauteile = wep.bau.bauteile.map((b) => {
    if (b.ausGrundriss === true && !verknuepft.has(b.id)) {
      geaendert = true
      return ohneGrundriss(b)
    }
    const m = massen.get(b.id)
    if (!m) return b
    const neu = bauteilMitGrundriss(b, m)
    if (neu !== b) geaendert = true
    return neu
  })
  return geaendert ? { ...wep, bau: { ...wep.bau, bauteile } } : wep
}

/** Teile des Grundrisses, die zu einem Bauteil gehören. */
export const teileVon = (grundriss: GrundrissDaten | undefined, bauteilId: string): GrundrissTeil[] =>
  (grundriss?.teile ?? []).filter((t) => t.bauteilId === bauteilId)

/** Bauteile ohne Teil im Grundriss (für den Hinweis „noch nicht gezeichnet“). */
export function bauteileOhneGrundriss(wep: Wep): Bauteil[] {
  const verknuepft = new Set((wep.grundriss?.teile ?? []).map((t) => t.bauteilId).filter(Boolean))
  return (wep.bau?.bauteile ?? []).filter((b) => !verknuepft.has(b.id))
}
