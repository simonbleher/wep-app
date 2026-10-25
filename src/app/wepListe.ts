// Suche, Filter und Sortierung der WEP-Liste (reine Funktionen, getestet).
import { vorgangsNrVon, wepStatus, type Wep, type WepStatus } from '@/model'
import { normalisiere } from '@/katalog/util'

export type Sortierung = 'geaendert' | 'nummer'

export const SORTIERUNGEN: { wert: Sortierung; text: string }[] = [
  { wert: 'geaendert', text: 'Zuletzt geändert' },
  { wert: 'nummer', text: 'Nummer' },
]

/** Alles, was die Suche durchsucht: Vorgangs-Nr., Anlage, Parzelle, Weg (Ort), Unterpächter, Auftraggeber. */
export function wepSuchtext(wep: Wep): string {
  const f = wep.formalien
  return normalisiere([wep.id, f.vorgangsNr, f.kleingartenanlage, f.parzelle, f.weg ?? '', f.unterpaechter, f.auftraggeber].join(' '))
}

/** Jedes eingegebene Wort muss irgendwo vorkommen (Groß-/Kleinschreibung und Umlaute egal). */
export function passtZurSuche(wep: Wep, suchbegriff: string): boolean {
  const worte = normalisiere(suchbegriff).split(' ').filter(Boolean)
  if (worte.length === 0) return true
  const text = wepSuchtext(wep)
  return worte.every((w) => text.includes(w))
}

export interface ListenAuswahl {
  suchbegriff: string
  status: WepStatus | 'alle'
  sortierung: Sortierung
  /** Letzte lokale Änderung je WEP-id (ISO), aus den Sync-Metadaten. */
  geaendertAm: ReadonlyMap<string, string>
}

/** Zeitpunkt für „zuletzt geändert“: lokale Änderung, sonst Datum der Wertermittlung, sonst 0. */
function zeitpunkt(wep: Wep, geaendertAm: ReadonlyMap<string, string>): number {
  const t = Date.parse(geaendertAm.get(wep.id) ?? wep.formalien.wertermittlungAm ?? '')
  return Number.isFinite(t) ? t : 0
}

/** Höchste Vorgangs-Nr. zuerst; WEPs ohne Vorgangs-Nr. stehen am Ende (die interne Kennung ist eine UUID, keine Nummer). */
const nachNummer = (a: Wep, b: Wep) => {
  const x = vorgangsNrVon(a)
  const y = vorgangsNrVon(b)
  if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1)
  return y.localeCompare(x, 'de', { numeric: true })
}

/** Wendet Suche, Status-Filter und Sortierung an; die Eingabeliste bleibt unverändert. */
export function waehleWeps(weps: readonly Wep[], a: ListenAuswahl): Wep[] {
  const treffer = weps.filter(
    (w) => (a.status === 'alle' || wepStatus(w) === a.status) && passtZurSuche(w, a.suchbegriff),
  )
  return treffer.sort(
    a.sortierung === 'nummer'
      ? nachNummer
      : (x, y) => zeitpunkt(y, a.geaendertAm) - zeitpunkt(x, a.geaendertAm) || nachNummer(x, y),
  )
}
