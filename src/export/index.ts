/**
 * Excel-Export-Modul der WEP-App.
 *
 * Nimmt ein Wep-Objekt und optional eine Bau-Excel (WEP_Vorlage.xlsx,
 * vom Bau-Wertermittler bereits ausgefüllt). Schreibt ausschließlich die
 * Grün-Zellen und gibt ein fertig befülltes XLSX als Blob zurück.
 *
 * Unterstützte Umgebungen: Browser und Node.js (vitest-Tests).
 */

import JSZip from 'jszip'
import type { Wep, Position, BeseitigungsPosition, Formalien } from '../model'
import {
  FORMALIEN_MAP,
  AUSSENANLAGEN,
  AUFWUCHS_I,
  AUFWUCHS_II,
  BESEITIGUNG_AA,
  formalienWertAlsString,
  type PositionsBereich,
} from './cellMapper'
import {
  patchCells,
  readCellRawValue,
  type CellPatch,
} from './xmlPatcher'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/**
 * Hinweis: Formalien-Feld war in der Bau-Excel bereits gefüllt und wurde
 * nicht überschrieben.
 */
export interface FormalienKonflikt {
  /** Schlüssel aus Formalien-Interface */
  feld: keyof Formalien
  zelle: string
  /** Wert, der in der Bau-Excel steht */
  bauExcelWert: string
  /** Wert, den die App schreiben würde */
  appWert: string
}

export interface ExportResult {
  /** Das fertige XLSX als Blob (zum Download) */
  blob: Blob
  /** Vorgeschlagener Dateiname, z. B. "2026-999_WEP.xlsx" */
  filename: string
  /**
   * Formalien-Felder, die in der Bau-Excel bereits gefüllt waren und
   * die App einen abweichenden Wert hat.  Leer = alles OK.
   */
  konflikte: FormalienKonflikt[]
  /**
   * true wenn Aufwuchs-Positionen auf Aufwuchs II überlaufen sind
   * (mehr als 28 Positionen in Aufwuchs I)
   */
  aufwuchsUeberlauf: boolean
  /**
   * true wenn die maximale Gesamtzahl an Aufwuchs-Positionen (64)
   * überschritten wurde und Positionen verloren gehen.
   */
  aufwuchsAbgeschnitten: boolean
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Exportiert ein WEP als XLSX.
 *
 * @param wep          - Das Wep-Objekt mit allen Grün-Daten
 * @param sourceExcel  - Basis-XLSX als ArrayBuffer.
 *                       Entweder die leere WEP_Vorlage oder eine Bau-Excel.
 */
export async function exportWep(
  wep: Wep,
  sourceExcel: ArrayBuffer,
): Promise<ExportResult> {
  const zip = await JSZip.loadAsync(sourceExcel)
  const konflikte: FormalienKonflikt[] = []
  let aufwuchsUeberlauf = false
  let aufwuchsAbgeschnitten = false

  // 1. Formalien-Blatt patchen
  await patchFormalien(zip, wep, konflikte)

  // 2. Außenanlagen-Blatt patchen
  await patchPositionen(zip, AUSSENANLAGEN, wep.gruen.aussenanlagen, wep.gruen.beschreibungAussen)

  // 3. Aufwuchs I/II patchen (mit Überlauf)
  const aufwuchsErgebnis = await patchAufwuchs(zip, wep)
  aufwuchsUeberlauf = aufwuchsErgebnis.ueberlauf
  aufwuchsAbgeschnitten = aufwuchsErgebnis.abgeschnitten

  // 4. Beseitigungskosten Abschnitt 2 patchen
  await patchBeseitigung(zip, wep)

  // 5. calcChain.xml entfernen → Excel baut die Berechnungskette neu auf
  //    (verhindert Probleme mit veralteten Berechungsreihenfolgen)
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml')
  }

  // 6. Als Blob erzeugen
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const filename = `${wep.formalien.vorgangsNr || wep.id}_WEP.xlsx`

  return { blob, filename, konflikte, aufwuchsUeberlauf, aufwuchsAbgeschnitten }
}

// ---------------------------------------------------------------------------
// Formalien
// ---------------------------------------------------------------------------

async function patchFormalien(
  zip: JSZip,
  wep: Wep,
  konflikte: FormalienKonflikt[],
): Promise<void> {
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const file = zip.file(sheetPath)
  if (!file) throw new Error(`Formalien-Blatt nicht gefunden: ${sheetPath}`)

  let xml = await file.async('string')
  const patches: CellPatch[] = []

  for (const key of Object.keys(FORMALIEN_MAP) as (keyof Formalien)[]) {
    const def = FORMALIEN_MAP[key]
    const appWert = formalienWertAlsString(key, wep)

    if (!appWert) continue // Kein Wert in der App → nichts schreiben

    if (def.bauExcelHasPriority) {
      // Prüfen ob Bau-Excel dieses Feld bereits gefüllt hat
      const vorhandenerWert = readCellRawValue(xml, def.cell)
      if (vorhandenerWert && vorhandenerWert.trim() !== '') {
        // Bau-Excel hat einen Wert → nur als Konflikt melden, nicht überschreiben
        if (vorhandenerWert !== appWert) {
          konflikte.push({
            feld: key,
            zelle: def.cell,
            bauExcelWert: vorhandenerWert,
            appWert,
          })
        }
        continue
      }
    }

    // Zelle patchen
    if (def.typ === 'number') {
      const num = Number(wep.formalien[key])
      if (!isNaN(num)) {
        patches.push({ cell: def.cell, value: num })
      }
    } else {
      patches.push({ cell: def.cell, value: appWert })
    }
  }

  xml = patchCells(xml, patches)
  zip.file(sheetPath, xml)
}

// ---------------------------------------------------------------------------
// Positionen (Außenanlagen / Aufwuchs I / Aufwuchs II)
// ---------------------------------------------------------------------------

async function patchPositionen(
  zip: JSZip,
  bereich: PositionsBereich,
  positionen: Position[],
  beschreibung?: string,
): Promise<void> {
  const file = zip.file(bereich.sheetPath)
  if (!file)
    throw new Error(`Blatt nicht gefunden: ${bereich.sheetPath}`)

  let xml = await file.async('string')
  const patches: CellPatch[] = []

  // Beschreibungstext (verbundene Zelle)
  if (beschreibung && bereich.beschreibungZelle) {
    patches.push({ cell: bereich.beschreibungZelle, value: beschreibung })
  }

  // Positionen eintragen (max. maxPositionen)
  const zuSchreiben = positionen.slice(0, bereich.maxPositionen)

  for (let i = 0; i < zuSchreiben.length; i++) {
    const pos = zuSchreiben[i]
    const row = bereich.ersteZeile + i

    patches.push({ cell: `A${row}`, value: pos.anzahl })
    patches.push({ cell: `B${row}`, value: pos.einheit })
    patches.push({ cell: `C${row}`, value: pos.bezeichnung })
    patches.push({ cell: `K${row}`, value: pos.einzelpreis })
  }

  // Restliche Zeilen leeren (für den Fall, dass vorher Werte standen)
  for (let i = zuSchreiben.length; i < bereich.maxPositionen; i++) {
    const row = bereich.ersteZeile + i
    patches.push({ cell: `A${row}`, value: null })
    patches.push({ cell: `B${row}`, value: null })
    patches.push({ cell: `C${row}`, value: null })
    patches.push({ cell: `K${row}`, value: null })
  }

  xml = patchCells(xml, patches)
  zip.file(bereich.sheetPath, xml)
}

// ---------------------------------------------------------------------------
// Aufwuchs mit Überlauf I → II
// ---------------------------------------------------------------------------

interface AufwuchsErgebnis {
  ueberlauf: boolean
  abgeschnitten: boolean
}

async function patchAufwuchs(
  zip: JSZip,
  wep: Wep,
): Promise<AufwuchsErgebnis> {
  const alle = wep.gruen.aufwuchs
  const maxGesamt = AUFWUCHS_I.maxPositionen + AUFWUCHS_II.maxPositionen // 28 + 36 = 64

  const abgeschnitten = alle.length > maxGesamt
  const ueberlauf = alle.length > AUFWUCHS_I.maxPositionen

  const aufwuchsI = alle.slice(0, AUFWUCHS_I.maxPositionen)
  const aufwuchsII = alle.slice(AUFWUCHS_I.maxPositionen, maxGesamt)

  // Aufwuchs I
  await patchPositionen(
    zip,
    AUFWUCHS_I,
    aufwuchsI,
    wep.gruen.beschreibungAufwuchs,
  )

  // Aufwuchs II
  await patchPositionen(zip, AUFWUCHS_II, aufwuchsII)

  return { ueberlauf, abgeschnitten }
}

// ---------------------------------------------------------------------------
// Beseitigungskosten Abschnitt 2
// ---------------------------------------------------------------------------

async function patchBeseitigung(zip: JSZip, wep: Wep): Promise<void> {
  const file = zip.file(BESEITIGUNG_AA.sheetPath)
  if (!file)
    throw new Error(
      `Beseitigungskosten-Blatt nicht gefunden: ${BESEITIGUNG_AA.sheetPath}`,
    )

  let xml = await file.async('string')
  const patches: CellPatch[] = []

  const positionen: BeseitigungsPosition[] = wep.gruen.beseitigungAA

  const zuSchreiben = positionen.slice(0, BESEITIGUNG_AA.maxPositionen)

  for (let i = 0; i < zuSchreiben.length; i++) {
    const pos = zuSchreiben[i]
    const row = BESEITIGUNG_AA.ersteZeile + i

    patches.push({ cell: `B${row}`, value: pos.gegenstand })
    patches.push({ cell: `F${row}`, value: pos.menge })
    patches.push({ cell: `G${row}`, value: pos.einheit })
    patches.push({ cell: `H${row}`, value: pos.einzelpreis })
    patches.push({ cell: `J${row}`, value: pos.faktor })

    // Begründung bei Faktor > 1 (Zelle F53 laut ARCHITEKTUR)
    if (pos.faktor > 1 && pos.begruendung) {
      patches.push({ cell: 'F53', value: pos.begruendung })
    }
  }

  // Restliche Zeilen leeren
  for (
    let i = zuSchreiben.length;
    i < BESEITIGUNG_AA.maxPositionen;
    i++
  ) {
    const row = BESEITIGUNG_AA.ersteZeile + i
    patches.push({ cell: `B${row}`, value: null })
    patches.push({ cell: `F${row}`, value: null })
    patches.push({ cell: `G${row}`, value: null })
    patches.push({ cell: `H${row}`, value: null })
  }

  xml = patchCells(xml, patches)
  zip.file(BESEITIGUNG_AA.sheetPath, xml)
}
