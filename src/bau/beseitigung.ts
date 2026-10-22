// Vorschläge für die Beseitigungskosten Bau (Anlage 4, Teil 1; Richtlinie S. 19–20).
// Die App schlägt Positionen mit den Höchstwerten vor; der Wertermittler kann alles ändern oder weglassen.
import type { Bauteil, BeseitigungsPosition, Wep } from '../model'
import {
  BESEITIGUNG_GRUBE_ABFUHR,
  BESEITIGUNG_GRUBE_JE_M3,
  BESEITIGUNG_JE_M3,
  BESEITIGUNG_VORPLATZ_JE_M2,
} from './tabellen'
import { nhkEintrag, typFuer } from './rechnen'

/** Bauklasse I–IV ohne Stufe, für den Preis je m³ umbauten Raumes (II und III getrennt). */
export function beseitigungsKlasse(b: Bauteil): keyof typeof BESEITIGUNG_JE_M3 | undefined {
  if (b.material === 'blech') return 'IV'
  const e = nhkEintrag(typFuer(b))
  const k = e?.bauklasse.split('.')[0]
  return k === 'I' || k === 'II' || k === 'III' || k === 'IV' ? k : undefined
}

/** Umbauter Raum in m³: Eingabe, sonst Fläche × Höhe. */
export function kubaturVon(b: Bauteil): number | undefined {
  if (b.kubaturM3 && b.kubaturM3 > 0) return b.kubaturM3
  if (b.flaeche > 0 && b.hoehe && b.hoehe > 0) return Math.round(b.flaeche * b.hoehe * 100) / 100
  return undefined
}

const neueId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `b-${Math.random().toString(36).slice(2)}`)

/** Rückbau eines Bauteils (Textbausteine der Vorlage: „Rückbau Anbau1 s. - Skizze Bau“ usw.). */
export function rueckbauPosition(b: Bauteil): BeseitigungsPosition {
  const name = b.bezeichnung ? `${b.kuerzel} ${b.bezeichnung}` : b.kuerzel
  if (b.art === 'vorplatz') {
    return { id: neueId(), gegenstand: `Rückbau LVP komplett ${b.kuerzel} ohne Bodenplatte  s. -Skizze Bau`, menge: b.flaeche, einheit: 'm²', einzelpreis: BESEITIGUNG_VORPLATZ_JE_M2, faktor: 1 }
  }
  const klasse = beseitigungsKlasse(b) ?? 'IV'
  const text = b.art === 'keller' ? 'Rückbau Keller s. - Skizze Bau' : b.art === 'anbau' ? `Rückbau Anbau ${b.kuerzel.replace(/^A/, '')} s. - Skizze Bau` : `Rückbau ${name} s. - Skizze Bau`
  return { id: neueId(), gegenstand: text, menge: kubaturVon(b) ?? 0, einheit: 'm³', einzelpreis: BESEITIGUNG_JE_M3[klasse], faktor: 1 }
}

/** Vorschläge aus dem Stand des WEP. Schon vorhandene Positionen (gleicher Gegenstand) werden nicht noch einmal vorgeschlagen. */
export function beseitigungsVorschlaege(wep: Pick<Wep, 'bau'>): BeseitigungsPosition[] {
  const bau = wep.bau
  if (!bau) return []
  const v: BeseitigungsPosition[] = []
  for (const b of bau.bauteile) {
    if (b.nichtBewerten || (b.art === 'keller' && !b.genehmigt)) v.push(rueckbauPosition(b))
  }
  const g = bau.abwasser.grube
  if (bau.abwasser.art === 'grube' && g.zuBeseitigen) {
    v.push({ id: neueId(), gegenstand: 'Abwassergrube entfernen und verfüllen', menge: g.inhaltM3 ?? 0, einheit: 'm³', einzelpreis: BESEITIGUNG_GRUBE_JE_M3, faktor: 1 })
    if (g.nichtGeleert) {
      v.push({ id: neueId(), gegenstand: 'Einbehalt für Fäkalienabfuhr, wenn Grube bei der WE nicht geleert ist', menge: 1, einheit: 'pauschal', einzelpreis: BESEITIGUNG_GRUBE_ABFUHR, faktor: 1 })
    }
  }
  // Die Entsorgung des Inventars nicht beräumter Lauben läuft über „Kosten nicht beräumter Baulichkeiten“ (Deckblatt), nicht hierüber.
  const vorhanden = new Set(bau.beseitigung.map((p) => p.gegenstand.trim()))
  return v.filter((p) => !vorhanden.has(p.gegenstand.trim()))
}
