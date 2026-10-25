// Gemeinsame Datentypen der WEP-App.
//
// Ein WEP ist intern ein JSON-Objekt (nicht die Excel-Datei). Die hier
// definierten Typen sind für alle Bereiche verbindlich (siehe
// docs/ARCHITEKTUR.md). Änderungen nur per PR mit Begründung.

// SkizzeDaten wird im Bereich `skizze` (Aufgabe S1) vollständig definiert und
// hier importiert, damit der Wep-Typ es referenzieren kann. Außerdem wird es
// re-exportiert, damit bestehende Importpfade über src/model/types.ts weiterhin
// funktionieren (kein Breaking Change für andere Bereiche).
import type { SkizzeDaten } from '../skizze/types.js'
export type { SkizzeDaten } from '../skizze/types.js'
import type { BauDaten } from './bau.js'
import type { GrundrissDaten } from '../skizze/grundriss.js'
import type { Parzelle } from '../parzelle/types.js'
export type { Parzelle, ParzelleTeil } from '../parzelle/types.js'
export type { GrundrissDaten, GrundrissTeil, Dachform } from '../skizze/grundriss.js'
export * from './bau.js'

/** Teil des WEP, den ein Wertermittler bearbeitet: Grün, Bau oder beides. */
export type Rolle = 'gruen' | 'bau' | 'beides'

/** Gibt es den Grün-Teil (Außenanlagen, Aufwuchs, Beseitigung Grün, Skizze Grün)? */
export const hatGruenTeil = (rolle: Rolle): boolean => rolle !== 'bau'
/** Gibt es den Bau-Teil (Baulichkeiten, Mängel, Abwasser, Beseitigung Bau, Skizze Bau)? */
export const hatBauTeil = (rolle: Rolle): boolean => rolle !== 'gruen'

/**
 * Rolle für dieses WEP. Neue WEPs bekommen sie beim Anlegen fest aus dem Profil (ein späterer
 * Rollenwechsel im Profil ändert bestehende WEPs nicht). WEPs von vor Beta 4 haben keine Rolle und
 * sind Grün-WEPs. `_profilRolle` bleibt für die Aufrufer, wird aber nicht mehr benutzt.
 */
export function wepRolle(wep: Pick<Wep, 'rolle'>, _profilRolle?: Rolle): Rolle {
  return wep.rolle ?? 'gruen'
}

/** Rolle aus den beiden Teilen. */
export function rolleAusTeilen(gruen: boolean, bau: boolean): Rolle {
  return gruen && bau ? 'beides' : bau ? 'bau' : 'gruen'
}

/**
 * Ein vollständiges Wertermittlungsprotokoll.
 * `id` entspricht der Vorgangs-Nr., z. B. "2026-999".
 */
export interface Wep {
  id: string // Vorgangs-Nr., z. B. "2026-999"
  formalien: Formalien
  gruen: {
    beschreibungAussen: string
    beschreibungAufwuchs: string
    aussenanlagen: Position[]
    aufwuchs: Position[]
    beseitigungAA: BeseitigungsPosition[]
  }
  /** Bau-Teil (Baulichkeiten, Mängel, Abwasser, Beseitigung Bau); fehlt, solange nichts erfasst ist. */
  bau?: BauDaten
  /**
   * Welche Teile dieses WEP bearbeitet werden (Grün / Bau / Beides). Fehlt = Rolle aus dem Profil.
   * Wird nur gesetzt, wenn dieses WEP vom Profil abweicht („Dieses WEP auch als Bau/Grün bearbeiten“).
   */
  rolle?: Rolle
  skizze?: SkizzeDaten
  /**
   * Parzelle (Beta 6, Paket 1): die Form des Grundstücks, eine je WEP für Bau- und Grün-Skizze. Angelegt von dem, der das
   * WEP zuerst bearbeitet; beide Teile können sie korrigieren (`src/parzelle/`). Fehlt bei WEPs von vor Beta 6.
   */
  parzelle?: Parzelle
  /**
   * Grundriss mit echten Maßen für „Skizze Bau“ (Beta 4, Paket 3). Getrennt von der Grün-Skizze `skizze`.
   * Fläche und Kubatur der verknüpften Bauteile kommen von hier (`src/bau/grundriss.ts`).
   */
  grundriss?: GrundrissDaten
  /** Bearbeitungsstand; fehlt = „in Arbeit“. Wird mit OneDrive abgeglichen. */
  status?: WepStatus
  /**
   * Fotos (nur die Angaben; die Bilddateien liegen in IndexedDB bzw. in OneDrive unter
   * `daten/fotos/<Vorgangs-Nr>/<id>.jpg`, siehe src/fotos).
   */
  fotos?: Foto[]
  /**
   * Die Bau-Excel dieses WEP (nur die Angaben; die Datei liegt in IndexedDB bzw. in OneDrive unter
   * `daten/bau/<Vorgangs-Nr>.xlsx`, siehe src/bauexcel). Der Export nimmt sie automatisch.
   */
  bauExcel?: BauExcel
}

/** Angaben zur Bau-Excel am WEP. */
export interface BauExcel {
  /** Dateiname, wie ihn der Nutzer gewählt hat (nur zur Anzeige). */
  name: string
  /** Größe in Bytes. */
  groesse: number
  /** Kennung des Inhalts (Hash), erkennt auf anderen Geräten, ob die lokale Datei die aktuelle ist. */
  version: string
  hinzugefuegtAm: string
  /** Die Formalien wurden mit dieser Fassung abgeglichen (übernommen oder bewusst behalten). */
  abgeglichen?: boolean
  /** Der Bau-Teil (Baulichkeiten, Mängel, Beseitigung) dieser Fassung wurde dem Nutzer schon zur Übernahme angeboten. */
  bauTeilGefragt?: boolean
}

/** Angaben zu einem Foto am WEP. */
export interface Foto {
  /** Kennung, zugleich Dateiname (<id>.jpg) in OneDrive. */
  id: string
  /** Position (Außenanlage, Aufwuchs oder Beseitigung), an der das Foto hängt; fehlt = WEP allgemein. */
  positionId?: string
  /** Kurzer Text zum Foto (optional). */
  text?: string
  aufgenommenAm: string
  breite: number
  hoehe: number
  /** Größe der Bilddatei in Bytes. */
  groesse: number
}

/** in Arbeit (Standard) · fertig (manuell) · exportiert (automatisch nach dem Excel- oder PDF-Export). */
export type WepStatus = 'in Arbeit' | 'fertig' | 'exportiert'
export const WEP_STATUS: readonly WepStatus[] = ['in Arbeit', 'fertig', 'exportiert']

/** Status eines WEP; ältere WEPs ohne Angabe sind „in Arbeit“. */
export function wepStatus(wep: Pick<Wep, 'status'>): WepStatus {
  return wep.status ?? 'in Arbeit'
}

/**
 * Komplette Kopie eines WEP (Formalien, Positionen, Beschreibungen, Beseitigung, Skizze)
 * unter einer neuen Vorgangs-Nr.; Status „in Arbeit“. Fotos und Bau-Excel werden nicht kopiert
 * (docs/ENTSCHEIDUNGEN.md, Beta 3 Paket 4 und 5).
 */
export function dupliziereWep(wep: Wep, neueId: string): Wep {
  const kopie = JSON.parse(JSON.stringify(wep)) as Wep
  delete kopie.fotos
  delete kopie.bauExcel
  return { ...kopie, id: neueId, formalien: { ...kopie.formalien, vorgangsNr: neueId }, status: 'in Arbeit' }
}

/** Nächste Vorgangs-Nr. der Form "<Jahr>-<lfd. Nummer>" aus den vorhandenen WEPs des Jahres. */
export function naechsteVorgangsNr(vorhandene: Pick<Wep, 'id'>[], jahr = new Date().getFullYear()): string {
  const prefix = `${jahr}-`
  const nummern = vorhandene
    .filter((w) => w.id.startsWith(prefix))
    .map((w) => Number.parseInt(w.id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
  const naechste = (nummern.length ? Math.max(...nummern) : 0) + 1
  return `${prefix}${String(naechste).padStart(3, '0')}`
}

/**
 * Ein Hinweis zu einer Position (Regel-Warnung oder Information).
 * Entspricht dem Grundsatz „Nichts sperren, nur warnen“: Regelverstöße
 * (z. B. Hecke > 1,25 m, invasive Art) erzeugen Hinweise, keine Blockaden.
 * `schwere` unterscheidet reine Info von einer Warnung; `regel` kann optional
 * auf die zugrunde liegende Regel verweisen (z. B. Katalog-Regeltext).
 */
export interface Hinweis {
  schwere: 'info' | 'warnung'
  text: string
  regel?: string
  /** Vorschlag „Beseitigung“: die Oberfläche kann daraus eine Beseitigungsposition vorbelegen. */
  beseitigung?: { gegenstand: string; einheit: string; menge: number }
}

/**
 * Eine bewertete Position (Außenanlage oder Aufwuchs).
 * Die Spaltenangaben beziehen sich auf das Zellen-Mapping der Vorlage.
 */
export interface Position {
  id: string
  katalogId?: string // Verweis auf data/katalog.json, fehlt bei eigener Pflanze
  bezeichnung: string // wird in Spalte C geschrieben, z. B. "Apfel, Halbstamm, 5–30 J."
  anzahl: number // Spalte A
  einheit: 'Stück' | 'm' | 'm²' | 'lfdm' | string // Spalte B
  zustand?: 'sehr gut' | 'gut' | 'mittel' | 'schlecht'
  hoechstwert?: number // aus Katalog
  einzelpreis: number // Spalte K – Vorschlag, frei überschreibbar
  preisManuell: boolean
  hinweise: Hinweis[] // Regel-Warnungen
}

// OFFENE FRAGE: `Formalien` wird in docs/ARCHITEKTUR.md referenziert, aber nicht
// als Typ definiert. Die Felder sind aus dem Zellen-Mapping E3–E17 hergeleitet.
// Benennung und Datumsformat (ISO-String) müssen vom BV bestätigt werden.
export interface Formalien {
  kleingartenanlage: string // E3
  parzelle: string // E4
  weg?: string // E5 (optional)
  unterpaechter: string // E6
  auftraggeber: string // E7
  vertretenDurchRA: string // E8  – vertreten durch Rechtsanwalt
  anwesendVerein: string // E9  – anwesend für den Verein
  anwesendUnterpaechter: string // E10 – anwesend für den Unterpächter
  anwesendAuftraggeber: string // E11 – anwesend für den Auftraggeber
  wertermittlerBaulichkeiten: string // E12
  wertermittlerAussenAufwuchs: string // E13 – Außenanlagen & Aufwuchs
  wertermittlungAm: string // E14 – Datum (ISO-String)
  protokollerstellungAm: string // E15 – Datum (ISO-String)
  parzellenflaecheM2: number // E16 – Parzellenfläche lt. Vertrag (m²)
  vorgangsNr: string // E17 – Vorgangs-Nr.
}

// OFFENE FRAGE: `BeseitigungsPosition` wird in docs/ARCHITEKTUR.md referenziert,
// aber nicht als Typ definiert. Die Felder sind aus dem Zellen-Mapping der
// Beseitigungskosten (Anlage 4, Zeilen 34–44) hergeleitet. Muss bestätigt werden.
export interface BeseitigungsPosition {
  id: string
  gegenstand: string // Spalte B (verbunden B:E)
  menge: number // Spalte F
  einheit: 'Stück' | 'm' | 'm²' | 'lfdm' | string // Spalte G (ME)
  einzelpreis: number // Spalte H
  faktor: number // Spalte J (Standard 1); Begründung bei > 1 in F53
  begruendung?: string // F53 – Begründung bei Faktor > 100 %
}

// OFFENE FRAGE: Die Zuordnung Zustand → Faktor ist vorläufig. Die BewRL nennt nur
// Höchstwerte ("bis €") und "bei schlechtem Zustand Abwertung bis 1,00 €". Diese
// Staffel (sehr gut 100 %, gut 75 %, mittel 50 %, schlecht = 1 € Sonderfall) muss
// vom BV bestätigt werden.
export const ZUSTANDSSTUFEN: Record<
  NonNullable<Position['zustand']>,
  { faktor: number; festpreis?: number }
> = {
  'sehr gut': { faktor: 1.0 },
  gut: { faktor: 0.75 },
  mittel: { faktor: 0.5 },
  // Sonderfall: schlechter Zustand → fester Erinnerungswert von 1,00 €
  schlecht: { faktor: 0, festpreis: 1 },
}

/**
 * Erzeugt ein leeres, aber gültiges Wep-Objekt mit der angegebenen id.
 * Alle Pflichtfelder sind vorbelegt (leere Strings / leere Arrays),
 * damit die Erfassung sofort beginnen kann.
 */
export function neuerWep(id: string): Wep {
  return {
    id,
    formalien: {
      kleingartenanlage: '',
      parzelle: '',
      weg: '',
      unterpaechter: '',
      auftraggeber: '',
      vertretenDurchRA: '',
      anwesendVerein: '',
      anwesendUnterpaechter: '',
      anwesendAuftraggeber: '',
      wertermittlerBaulichkeiten: '',
      wertermittlerAussenAufwuchs: '',
      wertermittlungAm: '',
      protokollerstellungAm: '',
      parzellenflaecheM2: 0,
      vorgangsNr: id,
    },
    gruen: {
      beschreibungAussen: '',
      beschreibungAufwuchs: '',
      aussenanlagen: [],
      aufwuchs: [],
      beseitigungAA: [],
    },
    skizze: undefined,
  }
}
