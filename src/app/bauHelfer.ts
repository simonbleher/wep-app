// Hilfen für die Bau-Oberfläche (reine Funktionen, getestet in __tests__/bau.test.tsx):
// neue Bauteile mit sinnvollen Vorgaben, Änderungen am WEP, Index am WEP merken.
import { neueBauDaten, type BauDaten, type Bauteil, type BauteilArt, type MangelAbzug, type Wep } from '@/model'
import { GEWAECHSHAUS, MINDERUNG_REGEL, kuerzelFuer, flaecheAusMassen, indexFuer, schlageBaubeschreibungVor, wertjahrVon } from '@/bau'

export const BAUTEIL_ARTEN: { art: BauteilArt; text: string; kurz: string }[] = [
  { art: 'laube', text: 'Laube', kurz: 'L' },
  { art: 'anbau', text: 'Anbau', kurz: 'A1, A2' },
  { art: 'schuppen', text: 'Schuppen / Unterstand', kurz: 'S, U' },
  { art: 'gewaechshaus', text: 'Gewächshaus', kurz: 'GWH' },
  { art: 'vorplatz', text: 'Überdachter Laubenvorplatz', kurz: 'Ü1' },
  { art: 'keller', text: 'Keller', kurz: 'K' },
]

export const artText = (art: BauteilArt): string => BAUTEIL_ARTEN.find((a) => a.art === art)!.text

export function neueBauteilId(): string {
  return `bt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Neues Bauteil mit den Vorgaben der Richtlinie (Gewächshaus 160 €/m² und 5 % je Jahr, Keller aus Stein usw.). */
export function neuesBauteil(art: BauteilArt, bisher: readonly Bauteil[]): Bauteil {
  const b: Bauteil = { id: neueBauteilId(), art, kuerzel: kuerzelFuer(art, [...bisher]), flaeche: 0, maengel: [] }
  if (art === 'gewaechshaus') return { ...b, nhk: GEWAECHSHAUS.nhk, minderungProJahr: MINDERUNG_REGEL }
  if (art === 'vorplatz') return { ...b, vorplatzLage: 'integriert', vorplatzGuete: 'ohne', minderungProJahr: MINDERUNG_REGEL }
  if (art === 'keller') return { ...b, material: 'stein' }
  return b
}

/** Fläche aus den Außenmaßen, solange der Wertermittler sie nicht selbst gesetzt hat. */
export function mitFlaeche(b: Bauteil): Bauteil {
  if (b.flaecheManuell) return b
  const f = flaecheAusMassen(b.laenge, b.breite)
  return f === undefined ? b : { ...b, flaeche: f }
}

/** Ändert den Bau-Teil des WEP (legt ihn bei Bedarf an). */
export function aendereBauTeil(wep: Wep, fn: (bau: BauDaten) => BauDaten): Wep {
  return { ...wep, bau: fn(wep.bau ?? neueBauDaten()) }
}

export function ersetzeBauteil(bau: BauDaten, b: Bauteil): BauDaten {
  const vorhanden = bau.bauteile.some((x) => x.id === b.id)
  return { ...bau, bauteile: vorhanden ? bau.bauteile.map((x) => (x.id === b.id ? b : x)) : [...bau.bauteile, b] }
}

export function entferneBauteil(bau: BauDaten, id: string): BauDaten {
  return { ...bau, bauteile: bau.bauteile.filter((x) => x.id !== id) }
}

/**
 * Das WEP merkt sich den verwendeten Baupreisindex (Wert, Jahr, Quelle). Liefert das geänderte WEP, wenn sich
 * dabei etwas ändert (kein Wert gemerkt, anderes Jahr, anderer Profilwert), sonst `null`.
 */
export function merkeIndex(wep: Wep, profilIndex?: Record<string, number>): Wep | null {
  if (!wep.bau) return null
  const jahr = wertjahrVon(wep)
  const alt = wep.bau.index
  if (alt?.manuell) return null // von Hand am WEP gesetzt: bleibt
  const neu = indexFuer({ ...wep.bau, index: undefined }, jahr, profilIndex)
  if (!neu) return alt ? { ...wep, bau: { ...wep.bau, index: undefined } } : null
  if (alt && alt.jahr === jahr && alt.wert === neu.wert && alt.quelle === neu.quelle) return null
  return { ...wep, bau: { ...wep.bau, index: { jahr, wert: neu.wert, quelle: neu.quelle } } }
}

/** Eintrag einer Gruppe der Mängeltabelle (ohne eigene Mängel). */
export function mangelDerGruppe(b: Bauteil, gruppe: string): MangelAbzug | undefined {
  return b.maengel.find((m) => m.gruppe === gruppe)
}

export function setzeMangel(b: Bauteil, gruppe: string, aenderung: Partial<MangelAbzug>): Bauteil {
  const alt = mangelDerGruppe(b, gruppe)
  const neu: MangelAbzug = { gruppe, maengel: [], abzug: 0, begruendung: '', ...alt, ...aenderung }
  const leer = neu.abzug === 0 && neu.maengel.length === 0 && !neu.begruendung.trim()
  const rest = b.maengel.filter((m) => m.gruppe !== gruppe)
  return { ...b, maengel: leer ? rest : [...b.maengel.filter((m) => m !== alt), neu] }
}

/**
 * Stand des Bau-Teils für den Export: Index am WEP gemerkt, Baubeschreibung aus den Bauteilen, solange der Wertermittler
 * sie nicht selbst geschrieben hat (so ist sie auch dann aktuell, wenn er nach einer Änderung nicht mehr im Reiter war).
 */
export function bauFuerExport(wep: Wep, profilIndex?: Record<string, number>): Wep {
  let w = merkeIndex(wep, profilIndex) ?? wep
  if (w.bau && !w.bau.beschreibungManuell) {
    const text = schlageBaubeschreibungVor(w, { profilIndex })
    if (text !== w.bau.beschreibung) w = { ...w, bau: { ...w.bau, beschreibung: text } }
  }
  return w
}
