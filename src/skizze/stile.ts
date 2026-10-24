/**
 * Farben und Linienarten für ausgefüllte Formen der Grün-Skizze.
 *
 * Die Vorgaben stammen aus dem Skill `docs/skills/parzellen-skizze.md` (Wiese #C5E0B4, Weg #EDE4D3, Kompost
 * #D9C3A5/#8B5A2B, Flieder #B4A7D6/#7030A0, Hinweis #C00000 …). Editor, PNG/PDF, Excel-Export und die
 * Agent-Schnittstelle benutzen dieselbe Tabelle.
 */
import type { Linienart, SkizzeStil } from './types'

/** Standard-Linienfarbe der Formen (wie bisher). */
export const LINIE_STANDARD = '#1A1A1A'

export interface StilVorgabe {
  /** Kurzname für die Schnittstelle (`"stil": "wiese"`). */
  id: string
  /** Anzeigename in der Auswahl. */
  name: string
  /** Füllfarbe; fehlt = keine Füllung. */
  fuellung?: string
  linie: string
  linienart?: Linienart
}

export const STIL_VORGABEN: readonly StilVorgabe[] = [
  { id: 'wiese', name: 'Wiese', fuellung: '#C5E0B4', linie: '#70AD47' },
  { id: 'weg', name: 'Weg', fuellung: '#EDE4D3', linie: '#A6A6A6' },
  { id: 'kompost', name: 'Kompost', fuellung: '#D9C3A5', linie: '#8B5A2B' },
  { id: 'flieder', name: 'Flieder', fuellung: '#B4A7D6', linie: '#7030A0' },
  { id: 'hecke', name: 'Hecke', fuellung: '#A9D18E', linie: '#548235' },
  { id: 'beet', name: 'Beet', fuellung: '#D9C3A5', linie: '#8B5A2B' },
  { id: 'wasser', name: 'Wasser', fuellung: '#DDEBF7', linie: '#2E75B6' },
  { id: 'schacht', name: 'Schacht', fuellung: '#BFBFBF', linie: '#7F7F7F' },
  { id: 'gebaeude', name: 'Gebäude', fuellung: '#E7E6E6', linie: '#262626' },
  { id: 'hinweis', name: 'Hinweis (rot)', fuellung: '#FFFFFF', linie: '#C00000' },
  { id: 'entfernen', name: 'Zu entfernen', fuellung: '#70AD47', linie: '#548235' },
  { id: 'rahmen', name: 'Nur Rahmen', linie: LINIE_STANDARD },
  { id: 'gestrichelt', name: 'Gestrichelt', linie: LINIE_STANDARD, linienart: 'gestrichelt' },
]

export const vorgabe = (id: string): StilVorgabe | undefined => STIL_VORGABEN.find((v) => v.id === id)

/** Einzelfarben für die Auswahl: Füllung (mit „keine Füllung“) und Linie. */
export const FUELLFARBEN: readonly { name: string; wert: string }[] = [
  { name: 'Wiese', wert: '#C5E0B4' },
  { name: 'Weg', wert: '#EDE4D3' },
  { name: 'Kompost', wert: '#D9C3A5' },
  { name: 'Flieder', wert: '#B4A7D6' },
  { name: 'Hecke', wert: '#A9D18E' },
  { name: 'Wasser', wert: '#DDEBF7' },
  { name: 'Grau', wert: '#BFBFBF' },
  { name: 'Weiß', wert: '#FFFFFF' },
]

export const LINIENFARBEN: readonly { name: string; wert: string }[] = [
  { name: 'Dunkel', wert: LINIE_STANDARD },
  { name: 'Hinweis rot', wert: '#C00000' },
  { name: 'Kompost braun', wert: '#8B5A2B' },
  { name: 'Flieder lila', wert: '#7030A0' },
  { name: 'Wiese grün', wert: '#548235' },
  { name: 'Wasser blau', wert: '#2E75B6' },
  { name: 'Grau', wert: '#7F7F7F' },
]

export const LINIENARTEN: readonly Linienart[] = ['durchgezogen', 'gestrichelt']

const HEX = /^#?([0-9a-fA-F]{6})$/

/** `#RRGGBB` (groß) aus „#c5e0b4“ oder „C5E0B4“; `undefined`, wenn keine Farbe. */
export function normalisiereFarbe(f: unknown): string | undefined {
  if (typeof f !== 'string') return undefined
  const m = HEX.exec(f.trim())
  return m ? `#${m[1].toUpperCase()}` : undefined
}

/** Skizzenpixel je pt des Excel-Blatts (Breite der Zeichenfläche : 452 pt) – Linienstärken und Schriftgrößen der Schnittstelle sind in pt. */
export const pxProPt = (breite: number): number => breite / 452

/** Strichmuster in Skizzenpixeln für gestrichelte Linien (Editor, PNG/PDF). */
export const STRICH_MUSTER: [number, number] = [6, 4]

/** Das gewählte Aussehen einer Form mit den Standardwerten. */
export function stilFuerAnzeige(el: SkizzeStil): { fuellung: string | undefined; linie: string; gestrichelt: boolean } {
  return { fuellung: el.fuellung, linie: el.linie ?? LINIE_STANDARD, gestrichelt: el.linienart === 'gestrichelt' }
}

/** Passt eine Auswahl-Vorgabe zum aktuellen Stil (für die Hervorhebung in der Auswahl)? */
export function gleicherStil(a: SkizzeStil, b: StilVorgabe): boolean {
  return (a.fuellung ?? '') === (b.fuellung ?? '') && (a.linie ?? LINIE_STANDARD) === b.linie && (a.linienart ?? 'durchgezogen') === (b.linienart ?? 'durchgezogen')
}
