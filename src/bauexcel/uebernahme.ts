// Alles, was die Bau-Excel außer den Formalien enthält, in einem Abgleich: Bau-Teil (Baulichkeiten, Mängel, Abwasser,
// Beseitigung …) und Grün-Teil (Außenanlagen, Aufwuchs, Beseitigung Außenanlagen/Aufwuchs). Der Nutzer wählt je Gruppe;
// nichts wird überschrieben, nichts doppelt angelegt (Regeln in `bauAbgleich.ts` und `gruenAbgleich.ts`).
import type { BauGruen } from '@/export/bauExcelLesen'
import type { BauTeil } from '@/export/bauTeilLesen'
import { hatBauTeil, hatGruenTeil, rolleAusTeilen, wepRolle, type Wep } from '@/model'
import { BAU_LISTEN, pruefeBau, uebernimmBau, type BauListe } from './bauAbgleich'
import { GRUEN_LISTEN, pruefeGruen, uebernimmGruen, type GruenListe } from './gruenAbgleich'

export type Liste = BauListe | GruenListe

/** Gelesener Inhalt der Bau-Excel (ohne Formalien). */
export interface BauExcelInhalt {
  teil: BauTeil
  gruen: BauGruen
}

export interface ListenAbgleich {
  liste: Liste
  name: string
  neu: { text: string; detail: string }[]
  gleich: number
}

export const pruefeAlles = (wep: Wep, inhalt: BauExcelInhalt): ListenAbgleich[] => [
  ...pruefeBau(wep, inhalt.teil),
  ...pruefeGruen(wep, inhalt.gruen).map(({ liste, name, neu, gleich }) => ({ liste, name, neu, gleich })),
]

export const offeneZeilen = (ab: readonly ListenAbgleich[]): number => ab.reduce((s, l) => s + l.neu.length, 0)

const istBau = (l: Liste): l is BauListe => (BAU_LISTEN as readonly string[]).includes(l)
const istGruen = (l: Liste): l is GruenListe => (GRUEN_LISTEN as readonly string[]).includes(l)

/**
 * Übernimmt die gewählten Gruppen. Ein WEP, das den jeweiligen Teil noch nicht hatte, bekommt ihn mit
 * (Rolle „beides“), damit Reiter, Excel und PDF ihn enthalten.
 */
export function uebernimmAlles(wep: Wep, inhalt: BauExcelInhalt, listen: ReadonlySet<Liste>): Wep {
  const bau = new Set([...listen].filter(istBau))
  const gruen = new Set([...listen].filter(istGruen))
  const neu = uebernimmGruen(uebernimmBau(wep, inhalt.teil, bau), inhalt.gruen, gruen)
  if (neu === wep) return wep
  const rolle = wepRolle(wep)
  const brauchtBau = bau.size > 0 && !hatBauTeil(rolle)
  const brauchtGruen = gruen.size > 0 && !hatGruenTeil(rolle)
  return brauchtBau || brauchtGruen ? { ...neu, rolle: rolleAusTeilen(hatGruenTeil(rolle) || brauchtGruen, hatBauTeil(rolle) || brauchtBau) } : neu
}
