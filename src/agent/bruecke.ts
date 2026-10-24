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
import { leseWep } from './lesen'
import { schema } from './schema'
import { pruefeVorschlag } from './vorschlag'

interface Quellen {
  /** Das geöffnete WEP (immer der aktuelle Stand). */
  holeWep: () => Wep
  /** Zeigt dem Nutzer die Grün-Skizze (Reiter „Skizze“). */
  zeigeSkizze: () => void
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
  }
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
  }
}
