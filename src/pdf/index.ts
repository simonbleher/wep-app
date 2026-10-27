/**
 * PDF-Export (Beta 5, Paket 4): sieht aus wie die Blätter der BV-Vorlage.
 *
 * Das PDF entsteht aus derselben Arbeitsmappe, die auch der Excel-Export erzeugt (`exportWep`); die Zahlen sind
 * also die der Excel-Datei. Siehe `docs/ENTSCHEIDUNGEN.md` (Eintrag zum PDF).
 */
import { exportWep, mitLeerenBauDaten, type ExportOptionen, type ExportResult } from '../export'
import type { Rolle, Wep } from '../model'
import { erzeugePdf, type PdfErgebnis, type PdfOptionen } from './erzeugen'
import { erzeugeUebersichtPdf, type UebersichtErgebnis } from './uebersicht/erzeugen'
import { leseProtokoll, type Protokoll } from './uebersicht/daten'
import { leseMappe } from './mappe'
import { Rechenwerk } from './formeln'

export { erzeugePdf, waehleBlaetter, unterschriftsFelder, BLATT } from './erzeugen'
export type { PdfErgebnis, PdfOptionen, PdfSkizzen, PdfBlattErgebnis } from './erzeugen'
export type { PdfFoto } from './fotos'
export { erzeugeUebersichtPdf } from './uebersicht/erzeugen'
export type { UebersichtErgebnis } from './uebersicht/erzeugen'
export type { Protokoll } from './uebersicht/daten'

export const PDF_TYP = 'application/pdf'

export interface WepPdfEingabe {
  /** Das WEP, wie es der Excel-Export bekommt (bei Bau-Rolle schon mit `bauFuerExport`). */
  wep: Wep
  /** Basis-Excel: die am WEP gemerkte Bau-Excel, sonst die leere Vorlage. */
  quelle: ArrayBuffer
  /** `quelle` ist eine Bau-Excel (und nicht die leere Vorlage). */
  hatBauExcel: boolean
  rolle: Rolle
  /** Wie beim Excel-Export: Index aus dem Profil, abgeglichene Formalien. */
  exportOptionen?: Pick<ExportOptionen, 'profilIndex' | 'formalienAbgeglichen' | 'vorlagenfehlerKorrigieren'>
}

export interface WepPdfAusgabe {
  /** Dateiname, z. B. „2026-007_WEP.pdf“ (Bau: „…_WEP_Bau.pdf“). */
  name: string
  pdf: PdfErgebnis
  /** Ergebnis des Excel-Exports, aus dem das PDF entstand. */
  export: ExportResult
}

/**
 * Erzeugt das PDF eines WEP: erst der Excel-Export (ohne Skizzen-Formen, die gehören nur in die Excel-Datei),
 * dann die Seiten. Hat das WEP keine Bau-Daten und keine Bau-Excel, werden die Beispielwerte der Vorlage im
 * Bau-Teil (nicht beräumt, Fäkalienabfuhr) durch leere Bau-Daten ersetzt, damit sie nicht auf dem Deckblatt landen.
 */
export async function erzeugeWepPdf(eingabe: WepPdfEingabe, optionen: Omit<PdfOptionen, 'rolle'>): Promise<WepPdfAusgabe> {
  const { wep, rolle } = eingabe
  const fuerExport = mitLeerenBauDaten(wep, rolle, eingabe.hatBauExcel)
  const exportErg = await exportWep(fuerExport.wep, eingabe.quelle, { ...eingabe.exportOptionen, teil: fuerExport.teil })
  const xlsx = await exportErg.blob.arrayBuffer()
  const pdf = await erzeugePdf(xlsx, { ...optionen, rolle })
  return { name: exportErg.filename.replace(/\.xlsx$/i, '.pdf'), pdf, export: exportErg }
}

export interface WepUebersichtAusgabe {
  /** Dateiname, z. B. „2026-007_WEP_uebersichtlich.pdf“ (Bau: „…_WEP_Bau_uebersichtlich.pdf“). */
  name: string
  pdf: UebersichtErgebnis
  export: ExportResult
}

/**
 * Das zweite, übersichtliche PDF: gleicher Excel-Export und gleiches Rechenwerk wie `erzeugeWepPdf` (die Zahlen sind
 * dieselben), aber als schlichtes Protokoll statt der Blätter der Vorlage.
 */
export async function erzeugeWepUebersichtPdf(eingabe: WepPdfEingabe, optionen: Omit<PdfOptionen, 'rolle'>): Promise<WepUebersichtAusgabe> {
  const { wep, rolle } = eingabe
  const fuerExport = mitLeerenBauDaten(wep, rolle, eingabe.hatBauExcel)
  const exportErg = await exportWep(fuerExport.wep, eingabe.quelle, { ...eingabe.exportOptionen, teil: fuerExport.teil })
  const xlsx = await exportErg.blob.arrayBuffer()
  const pdf = await erzeugeUebersichtPdf(xlsx, { ...optionen, rolle, wep: fuerExport.wep })
  return { name: exportErg.filename.replace(/\.xlsx$/i, '_uebersichtlich.pdf'), pdf, export: exportErg }
}

/**
 * Die Zahlen des übersichtlichen PDF ohne das PDF: gleicher Excel-Export, gleiches Rechenwerk, gleiches `leseProtokoll`.
 * Grundlage des Reiters „Übersicht“ (Wertermittler) und der Detailansicht der BV-Kontrollseite – beide zeigen also
 * genau die Zahlen, die auch im PDF stehen.
 */
export async function erzeugeWepProtokoll(eingabe: WepPdfEingabe): Promise<Protokoll> {
  const { wep, rolle } = eingabe
  const fuerExport = mitLeerenBauDaten(wep, rolle, eingabe.hatBauExcel)
  const exportErg = await exportWep(fuerExport.wep, eingabe.quelle, { ...eingabe.exportOptionen, teil: fuerExport.teil })
  const mappe = await leseMappe(await exportErg.blob.arrayBuffer())
  return leseProtokoll(new Rechenwerk(mappe), fuerExport.wep, rolle)
}
