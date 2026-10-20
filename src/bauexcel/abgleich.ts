// Formalien aus der Bau-Excel in das WEP übernehmen (Beta 3, Paket 5).
//
// Regeln:
// - Ist ein Feld im WEP leer, wird der Wert aus der Bau-Excel einfach eingetragen.
// - Ist es im WEP schon ausgefüllt und gleich, passiert nichts.
// - Ist es im WEP ausgefüllt und anders, wird nichts überschrieben: Es entsteht ein Unterschied
//   („Bau-Excel sagt … / im WEP steht …“), und der Nutzer wählt je Feld.
import { vergleichsWert, type BauFormalien } from '@/export/bauExcelLesen'
import { FORMALIEN_MAP } from '@/export/cellMapper'
import type { Formalien, Wep } from '@/model'

export const FELD_NAMEN: Record<keyof Formalien, string> = {
  kleingartenanlage: 'Kleingartenanlage',
  parzelle: 'Parzelle',
  weg: 'Weg',
  unterpaechter: 'Unterpächter',
  auftraggeber: 'Auftraggeber',
  vertretenDurchRA: 'Vertreten durch Rechtsanwalt',
  anwesendVerein: 'Anwesend für den Verein',
  anwesendUnterpaechter: 'Anwesend für den Unterpächter',
  anwesendAuftraggeber: 'Anwesend für den Auftraggeber',
  wertermittlerBaulichkeiten: 'Wertermittler Baulichkeiten',
  wertermittlerAussenAufwuchs: 'Wertermittler Außenanlagen & Aufwuchs',
  wertermittlungAm: 'Wertermittlung am',
  protokollerstellungAm: 'Protokollerstellung am',
  parzellenflaecheM2: 'Parzellenfläche (m²)',
  vorgangsNr: 'Vorgangs-Nr.',
}

export interface FormalienFeld {
  feld: keyof Formalien
  name: string
  /** Wert aus der Bau-Excel, lesbar (Datum als TT.MM.JJJJ). */
  bau: string
  /** Wert im WEP, lesbar; leer, wenn das Feld noch leer ist. */
  wep: string
}

export interface FormalienAbgleich {
  /** Felder, die im WEP leer sind und aus der Bau-Excel gefüllt werden. */
  neu: FormalienFeld[]
  /** Felder, die in beiden ausgefüllt und verschieden sind (Auswahl nötig). */
  unterschiede: FormalienFeld[]
  /** Felder, die in beiden gleich ausgefüllt sind. */
  gleich: number
}

/** Anzeige eines Werts: Datum als TT.MM.JJJJ, Fläche mit Einheit. */
export function feldAnzeige(feld: keyof Formalien, wert: string | number | undefined): string {
  const v = vergleichsWert(feld, wert)
  if (!v) return ''
  const typ = FORMALIEN_MAP[feld].typ
  if (typ === 'datum') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    return m ? `${m[3]}.${m[2]}.${m[1]}` : v
  }
  if (typ === 'number') return `${v.replace('.', ',')} m²`
  return v
}

const FELDER = Object.keys(FORMALIEN_MAP) as (keyof Formalien)[]

export function pruefeFormalien(formalien: Formalien, bau: BauFormalien): FormalienAbgleich {
  const erg: FormalienAbgleich = { neu: [], unterschiede: [], gleich: 0 }
  for (const feld of FELDER) {
    const bauWert = vergleichsWert(feld, bau[feld] as string | number | undefined)
    if (!bauWert) continue // in der Bau-Excel nicht ausgefüllt: nichts zu übernehmen
    const wepWert = vergleichsWert(feld, formalien[feld] as string | number | undefined)
    const eintrag: FormalienFeld = {
      feld,
      name: FELD_NAMEN[feld],
      bau: feldAnzeige(feld, bau[feld] as string | number),
      wep: feldAnzeige(feld, formalien[feld] as string | number | undefined),
    }
    if (!wepWert) erg.neu.push(eintrag)
    else if (wepWert === bauWert) erg.gleich++
    else erg.unterschiede.push(eintrag)
  }
  return erg
}

/**
 * Übernimmt die Bau-Excel-Werte: alle leeren Felder des WEP und die Felder aus `waehleBau`
 * (die Unterschiede, bei denen der Nutzer die Bau-Excel gewählt hat). Alles andere bleibt.
 */
export function uebernimmFormalien(formalien: Formalien, bau: BauFormalien, waehleBau: ReadonlySet<keyof Formalien>): Formalien {
  const ab = pruefeFormalien(formalien, bau)
  const neu: Record<string, unknown> = { ...formalien }
  for (const f of [...ab.neu.map((x) => x.feld), ...ab.unterschiede.map((x) => x.feld).filter((x) => waehleBau.has(x))]) {
    neu[f] = FORMALIEN_MAP[f].typ === 'number' ? Number(bau[f]) : (bau[f] as string)
  }
  return neu as unknown as Formalien
}

/** WEP nach dem Abgleich: Formalien übernommen, Bau-Excel als „abgeglichen“ markiert. */
export function wendeAbgleichAn(wep: Wep, bau: BauFormalien, waehleBau: ReadonlySet<keyof Formalien>): Wep {
  return {
    ...wep,
    formalien: uebernimmFormalien(wep.formalien, bau, waehleBau),
    ...(wep.bauExcel ? { bauExcel: { ...wep.bauExcel, abgeglichen: true } } : {}),
  }
}

/**
 * Trägt nur die Angaben ein, die im WEP noch leer sind. Gibt es keine Unterschiede, gilt die Bau-Excel als
 * abgeglichen; sonst bleibt sie „offen“, bis der Nutzer je Feld gewählt hat (`wendeAbgleichAn`).
 */
export function fuelleLeereFelder(wep: Wep, bau: BauFormalien): Wep {
  const ab = pruefeFormalien(wep.formalien, bau)
  return {
    ...wep,
    formalien: uebernimmFormalien(wep.formalien, bau, new Set()),
    ...(wep.bauExcel ? { bauExcel: { ...wep.bauExcel, abgeglichen: ab.unterschiede.length === 0 } } : {}),
  }
}
