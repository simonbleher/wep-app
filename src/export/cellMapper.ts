/**
 * Zellen-Mapping: WEP-Modell → Excel-Zellen
 *
 * Nur die hier definierten Zellen werden beschrieben. Alle anderen Zellen
 * (insbesondere Formeln in Spalte L) bleiben unberührt.
 *
 * Quelldaten: docs/ARCHITEKTUR.md, Abschnitt „Zellen-Mapping der Vorlage"
 */

import type { Wep, Formalien } from '../model'

// ---------------------------------------------------------------------------
// Sheet-Dateinamen (aus xl/_rels/workbook.xml.rels + xl/workbook.xml)
// ---------------------------------------------------------------------------

/** Dateipfade innerhalb des XLSX-ZIP (relativ zu xl/) */
export const SHEET_PATHS = {
  formalien: 'xl/worksheets/sheet1.xml',
  aussenanlagen: 'xl/worksheets/sheet5.xml',
  aufwuchsI: 'xl/worksheets/sheet6.xml',
  aufwuchsII: 'xl/worksheets/sheet7.xml',
  beseitigungskosten: 'xl/worksheets/sheet17.xml',
} as const

/**
 * Bau-Blätter, die niemals verändert werden dürfen.
 * Byte-genaue Gleichheit mit dem Original ist Pflicht (Testfall).
 */
export const BAU_SHEET_PATHS = [
  'xl/worksheets/sheet2.xml', // Deckbl UPV
  'xl/worksheets/sheet3.xml', // Baulichkeiten
  'xl/worksheets/sheet4.xml', // Mängelliste
  'xl/worksheets/sheet8.xml', // AnlIV (Blatt 3)ASG
  'xl/worksheets/sheet9.xml', // Anl IV Schuppen
  'xl/worksheets/sheet10.xml', // Anl IV Dach
  'xl/worksheets/sheet11.xml', // Deckbl UPV neu (Sicherheit)
  'xl/worksheets/sheet12.xml', // Deckbl UPV (alt)
  'xl/worksheets/sheet13.xml', // Deckbl Auftragsgutachten
  'xl/worksheets/sheet14.xml', // Beseitigungsauflagen
  'xl/worksheets/sheet15.xml', // Bewertung Aufwuchs
  'xl/worksheets/sheet16.xml', // Bewertung Außenanlagen
  'xl/worksheets/sheet18.xml', // Skizze Bau
  'xl/worksheets/sheet20.xml', // Abkürzungsverzeichnis
  'xl/worksheets/sheet21.xml', // Tabelle1
] as const

// ---------------------------------------------------------------------------
// Formalien (Blatt „Formalien", Zellen E3–E17)
// ---------------------------------------------------------------------------

/**
 * Mapping von Formalien-Feldern auf Zell-Adressen und Typ.
 * `bauExcelHasPriority` = true → Bau-Wertermittler füllt dieses Feld;
 * wenn in der Bau-Excel bereits ein Wert steht, nicht überschreiben.
 */
export interface FormalienZelleDef {
  cell: string
  typ: 'string' | 'number' | 'datum'
  /** Wenn true: Wert aus Bau-Excel gewinnt, App-Wert nur als Hinweis */
  bauExcelHasPriority: boolean
}

export const FORMALIEN_MAP: Record<keyof Formalien, FormalienZelleDef> = {
  kleingartenanlage: { cell: 'E3', typ: 'string', bauExcelHasPriority: true },
  parzelle: { cell: 'E4', typ: 'string', bauExcelHasPriority: true },
  weg: { cell: 'E5', typ: 'string', bauExcelHasPriority: true },
  unterpaechter: { cell: 'E6', typ: 'string', bauExcelHasPriority: true },
  auftraggeber: { cell: 'E7', typ: 'string', bauExcelHasPriority: true },
  vertretenDurchRA: { cell: 'E8', typ: 'string', bauExcelHasPriority: true },
  anwesendVerein: { cell: 'E9', typ: 'string', bauExcelHasPriority: true },
  anwesendUnterpaechter: {
    cell: 'E10',
    typ: 'string',
    bauExcelHasPriority: true,
  },
  anwesendAuftraggeber: {
    cell: 'E11',
    typ: 'string',
    bauExcelHasPriority: true,
  },
  wertermittlerBaulichkeiten: {
    cell: 'E12',
    typ: 'string',
    bauExcelHasPriority: true,
  },
  /** E13 ist eine Grün-Zelle – wird IMMER überschrieben */
  wertermittlerAussenAufwuchs: {
    cell: 'E13',
    typ: 'string',
    bauExcelHasPriority: false,
  },
  wertermittlungAm: { cell: 'E14', typ: 'datum', bauExcelHasPriority: true },
  protokollerstellungAm: {
    cell: 'E15',
    typ: 'datum',
    bauExcelHasPriority: true,
  },
  parzellenflaecheM2: {
    cell: 'E16',
    typ: 'number',
    bauExcelHasPriority: true,
  },
  vorgangsNr: { cell: 'E17', typ: 'string', bauExcelHasPriority: true },
}

// ---------------------------------------------------------------------------
// Positionen (Außenanlagen / Aufwuchs I / Aufwuchs II)
// ---------------------------------------------------------------------------

export interface PositionsBereich {
  sheetPath: string
  /** Erste Zeile für Positionen */
  ersteZeile: number
  /** Letzte Zeile für Positionen */
  letzteZeile: number
  /** Zelle für den Beschreibungstext (Freitext, verbundene Zelle) */
  beschreibungZelle: string
  /** Maximale Anzahl Positionen */
  maxPositionen: number
}

export const AUSSENANLAGEN: PositionsBereich = {
  sheetPath: SHEET_PATHS.aussenanlagen,
  ersteZeile: 15,
  letzteZeile: 45,
  beschreibungZelle: 'A8',
  maxPositionen: 31,
}

export const AUFWUCHS_I: PositionsBereich = {
  sheetPath: SHEET_PATHS.aufwuchsI,
  ersteZeile: 18,
  letzteZeile: 45,
  beschreibungZelle: 'A8',
  maxPositionen: 28,
}

export const AUFWUCHS_II: PositionsBereich = {
  sheetPath: SHEET_PATHS.aufwuchsII,
  ersteZeile: 10,
  letzteZeile: 45,
  beschreibungZelle: undefined as unknown as string, // kein Beschreibungsfeld
  maxPositionen: 36,
}

// ---------------------------------------------------------------------------
// Beseitigungskosten (Anlage 4), Abschnitt 2 – Außenanlagen/Aufwuchs
// ---------------------------------------------------------------------------

export interface BeseitigungsBereich {
  sheetPath: string
  ersteZeile: number
  letzteZeile: number
  maxPositionen: number
}

export const BESEITIGUNG_AA: BeseitigungsBereich = {
  sheetPath: SHEET_PATHS.beseitigungskosten,
  ersteZeile: 34,
  letzteZeile: 44,
  maxPositionen: 11,
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Konvertiert einen ISO-8601-Datumsstring (YYYY-MM-DD) in ein deutsches
 * Datumsformat (DD.MM.YYYY) für die Anzeige in Excel (nur als Fallback).
 */
export function formatDatumDe(iso: string): string {
  if (!iso) return ''
  // Unterstütze sowohl "2026-10-16" als auch "2026-10-16T..."
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return iso
  return `${match[3]}.${match[2]}.${match[1]}`
}

/**
 * Konvertiert einen ISO-8601-Datumsstring (YYYY-MM-DD) in eine serielle
 * Excel-Datumszahl (1900-Datumssystem).
 *
 * Excel-Epoche: 1. Januar 1900 = 1.
 * Wegen des historischen 1900-Schaltjahres-Bugs in Excel wird als
 * Referenzpunkt der 30. Dezember 1899 (UTC) verwendet – dadurch liegen
 * alle Daten ab dem 1. März 1900 korrekt.
 *
 * Gibt 0 zurück, wenn der String kein gültiges Datum ist.
 */
export function isoDateToExcelSerial(iso: string): number {
  if (!iso) return 0
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return 0
  const utc = Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10))
  const excelEpoch = Date.UTC(1899, 11, 30) // 30. Dezember 1899
  const serial = Math.round((utc - excelEpoch) / 86400000)
  return serial > 0 ? serial : 0
}

/**
 * Gibt den Wert zurück, der für ein Formalien-Feld in die Excel-Zelle
 * geschrieben wird (als String für inline-String oder Zahl).
 */
export function formalienWertAlsString(
  feld: keyof Formalien,
  wep: Wep,
): string {
  const formalien = wep.formalien
  const def = FORMALIEN_MAP[feld]
  const roherWert = formalien[feld]

  if (roherWert === null || roherWert === undefined) return ''

  if (def.typ === 'datum' && typeof roherWert === 'string') {
    return formatDatumDe(roherWert)
  }
  // Eine Fläche von 0 heißt „noch nicht eingetragen“ (neues WEP), nicht „0 m²“
  if (def.typ === 'number' && !(Number(roherWert) > 0)) return ''
  return String(roherWert)
}

/** Umkehrung von `isoDateToExcelSerial`: Seriennummer (1900-System) → "YYYY-MM-DD"; null bei Unsinn. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
  return d.toISOString().slice(0, 10)
}
