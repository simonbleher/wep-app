// Wer darf welches WEP in welchem Zustand lesen und schreiben, und welche Schritte im Ablauf Bau → Grün → BV sind
// erlaubt (docs/PLAN-V2.md, „Ablauf und Zustände“). Reine Logik ohne Abhängigkeiten: Server (functions/) und App nutzen
// dieselbe Datei, damit Anzeige und Prüfung nie auseinanderlaufen. Keine Importe über „@/“ – die Functions bündeln
// diese Datei mit.
import type { WepZustand } from '../model/types'

export type Zustand = WepZustand
export const ZUSTAENDE: Zustand[] = ['bau_in_arbeit', 'gruen_in_arbeit', 'beim_bv', 'rueckfrage', 'geprueft']

export const ZUSTAND_TEXT: Record<Zustand, string> = {
  bau_in_arbeit: 'Bau in Arbeit',
  gruen_in_arbeit: 'Grün in Arbeit',
  beim_bv: 'beim BV',
  rueckfrage: 'Rückfrage',
  geprueft: 'geprüft',
}

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
  /** Bei einer Rückfrage: an wen sie ging und wer gerade dran ist. */
  rueckfrageAn?: 'bau' | 'gruen' | 'beide' | null
  rueckfrageBei?: 'bau' | 'gruen' | null
}

/** Ab der Abgabe an den BV sieht der BV (und ein Admin) das WEP; vorher nur die Beteiligten. */
const BEIM_BV_ODER_SPAETER: Zustand[] = ['beim_bv', 'rueckfrage', 'geprueft']

export const istBeteiligt = (kopf: WepKopf, konto: RechteKonto) => kopf.bauKonto === konto.id || kopf.gruenKonto === konto.id
const istBv = (konto: RechteKonto) => konto.rollen.includes('bv')

export function darfLesen(kopf: WepKopf, konto: RechteKonto): boolean {
  if (istBeteiligt(kopf, konto)) return true
  if (kopf.geloeschtAm) return false
  return BEIM_BV_ODER_SPAETER.includes(kopf.zustand) && (istBv(konto) || konto.rollen.includes('admin'))
}

/** Neue WEPs legt der Bau-Wertermittler an (Beginn des Ablaufs). */
export const darfAnlegen = (konto: RechteKonto) => konto.rollen.includes('bau')

/**
 * Teil des WEP, den eine Person gerade ändern darf:
 * - 'alles': Bau, solange noch kein Grün-Wertermittler beteiligt ist (der Grün-Teil darf vorbereitet werden)
 * - 'bau': Bau, wenn Grün beteiligt ist – alles außer dem Grün-Teil
 * - 'gruen': Grün – nur der Grün-Teil (Außenanlagen, Aufwuchs, Beseitigung, Grün-Skizze, Fotos zum Grün-Teil)
 * - null: nur lesen
 */
export type Schreibrecht = 'alles' | 'bau' | 'gruen' | null

export function schreibrecht(kopf: WepKopf, konto: RechteKonto): Schreibrecht {
  if (kopf.geloeschtAm) return null
  const bau = kopf.bauKonto === konto.id && konto.rollen.includes('bau')
  const gruen = kopf.gruenKonto === konto.id && konto.rollen.includes('gruen')
  if (kopf.zustand === 'bau_in_arbeit' && bau) return kopf.gruenKonto ? 'bau' : 'alles'
  if (kopf.zustand === 'gruen_in_arbeit' && gruen) return 'gruen'
  if (kopf.zustand === 'rueckfrage') {
    if (kopf.rueckfrageBei === 'bau' && bau) return 'bau'
    if (kopf.rueckfrageBei === 'gruen' && gruen) return 'gruen'
  }
  return null
}

/** In den Papierkorb legen und zurückholen: nur der Besitzer, solange das WEP bei ihm in Bearbeitung ist und Grün noch nicht beteiligt ist. */
export const darfLoeschen = (kopf: WepKopf, konto: RechteKonto) => kopf.zustand === 'bau_in_arbeit' && kopf.bauKonto === konto.id && !kopf.gruenKonto

// ---------------------------------------------------------------------------
// Ablauf: Abgabe Bau → Grün → BV, Rückfrage, geprüft, wieder öffnen
// ---------------------------------------------------------------------------

export type AblaufAktion =
  | { aktion: 'an_gruen'; gruenKonto?: string }
  | { aktion: 'an_bv' }
  | { aktion: 'rueckfrage'; an: 'bau' | 'gruen' | 'beide'; notiz: string }
  | { aktion: 'geprueft'; notiz?: string }
  | { aktion: 'wiederoeffnen'; begruendung: string }

export type AblaufAktionName = AblaufAktion['aktion']

export const AKTION_TEXT: Record<AblaufAktionName, string> = {
  an_gruen: 'an Grün abgegeben',
  an_bv: 'an den BV abgegeben',
  rueckfrage: 'Rückfrage',
  geprueft: 'geprüft',
  wiederoeffnen: 'wieder geöffnet',
}

/** Welche Schritte die Person jetzt machen kann (für die Knöpfe der Oberfläche; der Server prüft mit `wendeAn`). */
export function moeglicheAktionen(kopf: WepKopf, konto: RechteKonto): AblaufAktionName[] {
  if (kopf.geloeschtAm) return []
  const bau = kopf.bauKonto === konto.id && konto.rollen.includes('bau')
  const gruen = kopf.gruenKonto === konto.id && konto.rollen.includes('gruen')
  const r: AblaufAktionName[] = []
  if (bau && (kopf.zustand === 'bau_in_arbeit' || (kopf.zustand === 'rueckfrage' && kopf.rueckfrageBei === 'bau' && kopf.rueckfrageAn === 'beide'))) r.push('an_gruen')
  if (
    (gruen && (kopf.zustand === 'gruen_in_arbeit' || (kopf.zustand === 'rueckfrage' && kopf.rueckfrageBei === 'gruen'))) ||
    (bau && kopf.zustand === 'rueckfrage' && kopf.rueckfrageBei === 'bau' && kopf.rueckfrageAn === 'bau')
  )
    r.push('an_bv')
  if (istBv(konto) && kopf.zustand === 'beim_bv') r.push('rueckfrage', 'geprueft')
  if ((istBv(konto) || konto.rollen.includes('admin')) && kopf.zustand === 'geprueft') r.push('wiederoeffnen')
  return r
}

export type AblaufErgebnis = { ok: true; kopf: WepKopf; notiz?: string } | { ok: false; status: number; fehler: string }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Wendet einen Schritt an. `gruenKonten`: freigegebene Konten mit Rolle Grün (für die Abgabe an Grün).
 * Liefert den neuen Kopf oder den Grund der Ablehnung.
 */
export function wendeAn(kopf: WepKopf, konto: RechteKonto, a: AblaufAktion, gruenKonten: string[] = []): AblaufErgebnis {
  if (!moeglicheAktionen(kopf, konto).includes(a.aktion)) return { ok: false, status: 403, fehler: 'Dieser Schritt ist für dich gerade nicht möglich.' }
  const ohneRueckfrage = { rueckfrageAn: null, rueckfrageBei: null }
  switch (a.aktion) {
    case 'an_gruen': {
      if (kopf.zustand === 'rueckfrage') return { ok: true, kopf: { ...kopf, rueckfrageBei: 'gruen' } }
      const gruen = a.gruenKonto ?? kopf.gruenKonto ?? ''
      if (!gruen) return { ok: false, status: 400, fehler: 'Bitte einen Grün-Wertermittler wählen.' }
      if (gruen === kopf.bauKonto) return { ok: false, status: 400, fehler: 'An einem WEP sind immer zwei verschiedene Personen beteiligt.' }
      if (!gruenKonten.includes(gruen)) return { ok: false, status: 400, fehler: 'Das gewählte Konto ist kein freigegebener Grün-Wertermittler.' }
      return { ok: true, kopf: { ...kopf, zustand: 'gruen_in_arbeit', gruenKonto: gruen } }
    }
    case 'an_bv':
      return { ok: true, kopf: { ...kopf, ...ohneRueckfrage, zustand: 'beim_bv' } }
    case 'rueckfrage': {
      const notiz = text(a.notiz)
      if (!notiz) return { ok: false, status: 400, fehler: 'Bitte in der Notiz schreiben, was geklärt werden soll.' }
      if (!['bau', 'gruen', 'beide'].includes(a.an)) return { ok: false, status: 400, fehler: 'Bitte wählen, an wen die Rückfrage geht.' }
      return { ok: true, kopf: { ...kopf, zustand: 'rueckfrage', rueckfrageAn: a.an, rueckfrageBei: a.an === 'gruen' ? 'gruen' : 'bau' }, notiz }
    }
    case 'geprueft':
      return { ok: true, kopf: { ...kopf, ...ohneRueckfrage, zustand: 'geprueft' }, notiz: text(a.notiz) || undefined }
    case 'wiederoeffnen': {
      const begruendung = text(a.begruendung)
      if (!begruendung) return { ok: false, status: 400, fehler: 'Bitte begründen, warum das geprüfte WEP wieder geöffnet wird.' }
      return { ok: true, kopf: { ...kopf, ...ohneRueckfrage, zustand: 'beim_bv' }, notiz: begruendung }
    }
  }
}
