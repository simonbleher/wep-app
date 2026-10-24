/**
 * `window.wep`: die JavaScript-Schnittstelle für einen Browser-Agenten (Claude in Chrome) – siehe docs/WEP-SCHNITTSTELLE.md.
 *
 * Sie steht zur Verfügung, solange ein WEP geöffnet ist (Browser, Android-App, Windows-Programm: derselbe Web-Teil), und ist
 * nur lesend – bis auf den Skizzen-Vorschlag, der in der Skizze angezeigt wird und erst nach „Übernehmen“ des Nutzers
 * gespeichert wird. Keine Netzwerkzugriffe, keine Änderung am WEP ohne den Nutzer.
 *
 * Der Vorschlag lebt in einem kleinen Speicher (`vorschlagSpeicher`), den der Editor über `useVorschlag` anzeigt.
 */
import { useSyncExternalStore } from 'react'
import { wepRolle, type Wep } from '../model/types'
import { skizzeMitParzelle } from '../parzelle'
import type { VorschlagAnzeige } from '../skizze/SkizzeEditor'
import type { SkizzeDaten } from '../skizze/types'
import type { Modus, StatusErgebnis, VorschlagErgebnis, VorschlagZustand } from './format'
import { SCHNITTSTELLE_VERSION } from './format'
import { baustein, type BausteinErgebnis } from './bausteine'
import { leseWep } from './lesen'
import { schema } from './schema'
import { pruefeVorschlag } from './vorschlag'
import {
  katalogSuchen,
  pruefePositionen,
  type KatalogTrefferInfo,
  type PositionenErgebnis,
  type PositionenListe,
  type VorschauZeile,
} from './positionen'
import type { BeseitigungsPosition, Position } from '../model/types'

interface Quellen {
  /** Das geöffnete WEP (immer der aktuelle Stand). */
  holeWep: () => Wep
  /** Zeigt dem Nutzer die Grün-Skizze (Reiter „Skizze“). */
  zeigeSkizze: () => void
  /** Zeigt dem Nutzer die Liste (Reiter Außenanlagen, Aufwuchs bzw. Beseitigung Grün). */
  zeigeListe: (liste: PositionenListe) => void
}

// ---------------------------------------------------------------------------
// Vorschlag-Speicher
// ---------------------------------------------------------------------------

interface Gespeichert {
  nr: number
  zustand: VorschlagZustand
  anzeige: VorschlagAnzeige | null
  modus: Modus | null
  anzahl: number | null
  entschiedenAm: string | null
}

const START: Gespeichert = { nr: 0, zustand: 'kein-vorschlag', anzeige: null, modus: null, anzahl: null, entschiedenAm: null }

class VorschlagSpeicher {
  private stand: Gespeichert = START
  private hoerer = new Set<() => void>()
  schaue = (): Gespeichert => this.stand
  abonniere = (f: () => void): (() => void) => {
    this.hoerer.add(f)
    return () => this.hoerer.delete(f)
  }
  private setze(neu: Gespeichert) {
    this.stand = neu
    this.hoerer.forEach((f) => f())
  }
  /** Neuer Vorschlag; ein noch offener wird dadurch ersetzt. */
  zeige(anzeige: VorschlagAnzeige, modus: Modus): number {
    const nr = this.stand.nr + 1
    this.setze({ nr, zustand: 'offen', anzeige, modus, anzahl: anzeige.elemente.length, entschiedenAm: null })
    return nr
  }
  entscheide(zustand: 'uebernommen' | 'verworfen'): void {
    if (this.stand.zustand !== 'offen') return
    this.setze({ ...this.stand, zustand, anzeige: null, entschiedenAm: new Date().toISOString() })
  }
  /** Das WEP wurde geschlossen: ein offener Vorschlag verfällt, nichts wird gespeichert. */
  zuruecksetzen(): void {
    this.setze(START)
  }
}

export const vorschlagSpeicher = new VorschlagSpeicher()

/** Offener Vorschlag für den Editor (null, wenn keiner wartet). */
export function useVorschlag(): VorschlagAnzeige | null {
  return useSyncExternalStore(vorschlagSpeicher.abonniere, () => vorschlagSpeicher.schaue().anzeige, () => null)
}

// ---------------------------------------------------------------------------
// Positions-Vorschlag-Speicher
// ---------------------------------------------------------------------------

export type PositionenZustand = 'kein-vorschlag' | 'offen' | 'uebernommen' | 'verworfen' | 'zurueckgenommen'

/** Ein offener Positions-Vorschlag, wie ihn der Balken in der App zeigt. */
export interface PositionenAnzeige {
  liste: PositionenListe
  positionen: Position[]
  beseitigung: BeseitigungsPosition[]
  vorschau: VorschauZeile[]
  summe: number
  hinweise: string[]
}

interface PositionenStand {
  nr: number
  zustand: PositionenZustand
  anzeige: PositionenAnzeige | null
  /** Zuletzt übernommener Vorschlag (für „Rückgängig“). */
  uebernommen: PositionenAnzeige | null
  liste: PositionenListe | null
  anzahl: number | null
  entschiedenAm: string | null
}

const POS_START: PositionenStand = { nr: 0, zustand: 'kein-vorschlag', anzeige: null, uebernommen: null, liste: null, anzahl: null, entschiedenAm: null }

class PositionenSpeicher {
  private stand: PositionenStand = POS_START
  private hoerer = new Set<() => void>()
  schaue = (): PositionenStand => this.stand
  abonniere = (f: () => void): (() => void) => {
    this.hoerer.add(f)
    return () => this.hoerer.delete(f)
  }
  private setze(neu: PositionenStand) {
    this.stand = neu
    this.hoerer.forEach((f) => f())
  }
  zeige(anzeige: PositionenAnzeige): number {
    const nr = this.stand.nr + 1
    this.setze({ nr, zustand: 'offen', anzeige, uebernommen: null, liste: anzeige.liste, anzahl: anzeige.vorschau.length, entschiedenAm: null })
    return nr
  }
  entscheide(zustand: 'uebernommen' | 'verworfen'): void {
    const a = this.stand.anzeige
    if (this.stand.zustand !== 'offen' || !a) return
    this.setze({ ...this.stand, zustand, anzeige: null, uebernommen: zustand === 'uebernommen' ? a : null, entschiedenAm: new Date().toISOString() })
  }
  /** Der Nutzer hat die Übernahme zurückgenommen. */
  zurueckgenommen(): void {
    if (this.stand.zustand !== 'uebernommen') return
    this.setze({ ...this.stand, zustand: 'zurueckgenommen', uebernommen: null, entschiedenAm: new Date().toISOString() })
  }
  /** „Rückgängig“ wird nach dem Verlassen der Liste oder neuem Vorschlag nicht mehr angeboten. */
  vergiss(): void {
    if (this.stand.uebernommen) this.setze({ ...this.stand, uebernommen: null })
  }
  zuruecksetzen(): void {
    this.setze(POS_START)
  }
}

export const positionenSpeicher = new PositionenSpeicher()

/** Offener bzw. zuletzt übernommener Positions-Vorschlag für die Oberfläche. */
export function usePositionenStand(): PositionenStand {
  return useSyncExternalStore(positionenSpeicher.abonniere, positionenSpeicher.schaue, () => POS_START)
}

// ---------------------------------------------------------------------------
// Skizze, auf die sich ein Vorschlag bezieht
// ---------------------------------------------------------------------------

type SkizzenQuelle = () => SkizzeDaten | undefined
let skizzenQuelle: SkizzenQuelle | null = null

/** Der geöffnete Skizzen-Reiter meldet seinen Stand (damit Vorschläge sich auf die ungespeicherte Skizze beziehen). */
export function meldeSkizzenQuelle(q: SkizzenQuelle | null): () => void {
  skizzenQuelle = q
  return () => {
    if (skizzenQuelle === q) skizzenQuelle = null
  }
}

const aktuelleSkizze = (wep: Wep): SkizzeDaten | undefined => skizzenQuelle?.() ?? skizzeMitParzelle(wep)

// ---------------------------------------------------------------------------
// window.wep
// ---------------------------------------------------------------------------

export interface WepSchnittstelle {
  version: typeof SCHNITTSTELLE_VERSION
  schema: () => ReturnType<typeof schema>
  lesen: () => ReturnType<typeof leseWep>
  skizze: {
    vorschlagen: (vorschlag: unknown) => VorschlagErgebnis
    status: () => StatusErgebnis
    baustein: (name: string, parameter: unknown) => BausteinErgebnis
  }
  positionen: {
    katalogSuchen: (begriff: string, liste?: 'aufwuchs' | 'aussenanlagen') => KatalogTrefferInfo[]
    vorschlagen: (vorschlag: unknown) => PositionenErgebnis
    status: () => PositionenStatus
  }
}

export interface PositionenStatus {
  offen: boolean
  zustand: PositionenZustand
  nr: number
  liste: PositionenListe | null
  anzahl: number | null
  entschiedenAm: string | null
}

export function baueSchnittstelle(q: Quellen): WepSchnittstelle {
  return Object.freeze({
    version: SCHNITTSTELLE_VERSION,
    schema: () => JSON.parse(JSON.stringify(schema())),
    lesen: () => {
      const wep = q.holeWep()
      return leseWep(wep, aktuelleSkizze(wep))
    },
    skizze: Object.freeze({
      vorschlagen: (vorschlag: unknown): VorschlagErgebnis => {
        const wep = q.holeWep()
        const g = pruefeVorschlag(vorschlag, wep, aktuelleSkizze(wep))
        const { elemente, modus, ...ergebnis } = g
        if (g.ok && modus && wepRolle(wep) !== 'bau') {
          vorschlagSpeicher.zeige({ elemente, modus }, modus)
          q.zeigeSkizze()
        }
        return ergebnis
      },
      baustein: (name: string, parameter: unknown): BausteinErgebnis => baustein(name, parameter),
      status: (): StatusErgebnis => {
        const s = vorschlagSpeicher.schaue()
        return {
          offen: s.zustand === 'offen',
          zustand: s.zustand,
          nr: s.nr,
          anzahl: s.anzahl,
          modus: s.modus,
          entschiedenAm: s.entschiedenAm,
        }
      },
    }),
    positionen: Object.freeze({
      katalogSuchen: (begriff: string, liste: 'aufwuchs' | 'aussenanlagen' = 'aufwuchs'): KatalogTrefferInfo[] =>
        typeof begriff === 'string' && (liste === 'aufwuchs' || liste === 'aussenanlagen') ? katalogSuchen(begriff, liste) : [],
      vorschlagen: (vorschlag: unknown): PositionenErgebnis => {
        const wep = q.holeWep()
        const g = pruefePositionen(vorschlag, wep)
        const { liste, positionen, beseitigung, ...ergebnis } = g
        if (g.ok && liste) {
          positionenSpeicher.zeige({ liste, positionen, beseitigung, vorschau: g.vorschau, summe: g.summe, hinweise: g.hinweise })
          q.zeigeListe(liste)
        }
        return ergebnis
      },
      status: (): PositionenStatus => {
        const s = positionenSpeicher.schaue()
        return { offen: s.zustand === 'offen', zustand: s.zustand, nr: s.nr, liste: s.liste, anzahl: s.anzahl, entschiedenAm: s.entschiedenAm }
      },
    }),
  })
}

declare global {
  interface Window {
    wep?: WepSchnittstelle
  }
}

/** Macht `window.wep` verfügbar, solange das WEP geöffnet ist; der Rückgabewert baut sie wieder ab. */
export function installiereSchnittstelle(q: Quellen): () => void {
  if (typeof window === 'undefined') return () => {}
  const api = baueSchnittstelle(q)
  window.wep = api
  return () => {
    if (window.wep === api) delete window.wep
    vorschlagSpeicher.zuruecksetzen()
    positionenSpeicher.zuruecksetzen()
  }
}
