/**
 * PDF-Export (Beta 5, Paket 4): sieht aus wie die Blätter der BV-Vorlage.
 *
 * Das PDF entsteht aus derselben Arbeitsmappe, die auch der Excel-Export erzeugt (`exportWep`); die Zahlen sind
 * also die der Excel-Datei. Siehe `docs/ENTSCHEIDUNGEN.md` (Eintrag zum PDF).
 */
import { exportWep, type ExportOptionen, type ExportResult } from '../export'
import { neueBauDaten, type Rolle, type Wep } from '../model'
import { erzeugePdf, type PdfErgebnis, type PdfOptionen } from './erzeugen'

export { erzeugePdf, waehleBlaetter, unterschriftsFelder, BLATT } from './erzeugen'
export type { PdfErgebnis, PdfOptionen, PdfSkizzen, PdfBlattErgebnis } from './erzeugen'
export type { PdfFoto } from './fotos'

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
  const ohneBau = !wep.bau && !eingabe.hatBauExcel
  const fuerExport: Wep = ohneBau ? { ...wep, bau: neueBauDaten() } : wep
  const exportErg = await exportWep(fuerExport, eingabe.quelle, {
    ...eingabe.exportOptionen,
    teil: ohneBau && rolle === 'gruen' ? 'beides' : rolle,
  })
  const xlsx = await exportErg.blob.arrayBuffer()
  const pdf = await erzeugePdf(xlsx, { ...optionen, rolle })
  return { name: exportErg.filename.replace(/\.xlsx$/i, '.pdf'), pdf, export: exportErg }
}
