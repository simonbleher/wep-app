// Wer darf welches WEP in welchem Zustand lesen und schreiben (docs/PLAN-V2.md, „Ablauf und Zustände“).
// Reine Logik ohne Abhängigkeiten: Server (functions/) und App nutzen dieselbe Datei, damit Anzeige und Prüfung nie
// auseinanderlaufen. Keine Importe über „@/“ – die Functions bündeln diese Datei mit.

export type Zustand = 'bau_in_arbeit' | 'gruen_in_arbeit' | 'beim_bv' | 'rueckfrage' | 'geprueft'
export const ZUSTAENDE: Zustand[] = ['bau_in_arbeit', 'gruen_in_arbeit', 'beim_bv', 'rueckfrage', 'geprueft']

export type KontoRolle = 'bau' | 'gruen' | 'bv' | 'admin'

export interface RechteKonto {
  id: string
  rollen: KontoRolle[]
}

/** Was der Server über ein WEP weiß, ohne den Inhalt zu lesen. */
export interface WepKopf {
  zustand: Zustand
  bauKonto?: string | null
  gruenKonto?: string | null
  geloeschtAm?: string | null
}

/** Ab der Abgabe an den BV sieht der BV (und ein Admin) das WEP; vorher nur die Beteiligten. */
const BEIM_BV_ODER_SPAETER: Zustand[] = ['beim_bv', 'rueckfrage', 'geprueft']

export const istBeteiligt = (kopf: WepKopf, konto: RechteKonto) => kopf.bauKonto === konto.id || kopf.gruenKonto === konto.id

export function darfLesen(kopf: WepKopf, konto: RechteKonto): boolean {
  if (istBeteiligt(kopf, konto)) return true
  if (kopf.geloeschtAm) return false
  return BEIM_BV_ODER_SPAETER.includes(kopf.zustand) && (konto.rollen.includes('bv') || konto.rollen.includes('admin'))
}

/** Neue WEPs legt der Bau-Wertermittler an (Beginn des Ablaufs). */
export const darfAnlegen = (konto: RechteKonto) => konto.rollen.includes('bau')

/**
 * Was die Person am WEP ändern darf: 'alles', nur den Grün-Teil ('gruen') oder nichts (null).
 * Paket 2 kennt nur „bau_in_arbeit“; die übrigen Zustände bringt Paket 3 (Abgabe) und Paket 4 (Rückfrage).
 */
export function schreibrecht(kopf: WepKopf, konto: RechteKonto): 'alles' | 'gruen' | null {
  if (kopf.geloeschtAm) return null
  if (kopf.zustand === 'bau_in_arbeit' && kopf.bauKonto === konto.id && konto.rollen.includes('bau')) return 'alles'
  return null
}

/** In den Papierkorb legen und zurückholen: nur der Besitzer, solange das WEP bei ihm in Bearbeitung ist. */
export const darfLoeschen = (kopf: WepKopf, konto: RechteKonto) => kopf.zustand === 'bau_in_arbeit' && kopf.bauKonto === konto.id
