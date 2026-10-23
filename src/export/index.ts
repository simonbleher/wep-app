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
import type { Wep, Position, BeseitigungsPosition, Formalien, Rolle } from '../model'
import {
  FORMALIEN_MAP,
  AUSSENANLAGEN,
  AUFWUCHS_I,
  AUFWUCHS_II,
  BESEITIGUNG_AA,
  formalienWertAlsString,
  isoDateToExcelSerial,
  type PositionsBereich,
} from './cellMapper'
import {
  patchCell,
  patchCells,
  type CellPatch,
} from './xmlPatcher'
import { schreibeDeckblattText } from './deckblatt'
import { blattPfadNachName, formalienBlattPfad, sharedStrings, vergleichsWert, zellenWert } from './bauExcelLesen'
import { fuegeSkizzeEin, skizzeBlattHatFormen } from './skizzeBild'
import { schreibeBau, BAULICHKEITEN_BLATT, MAENGEL_BLATT, BESEITIGUNG_BLATT, TABELLE1_BLATT, type BauExportErgebnis } from './exportBau'
import { fuegeSkizzeFormenEin, type SkizzeFormenErgebnis, type SkizzeFormenOptionen } from './skizzeFormen'

export { skizzeBlattHatFormen } from './skizzeBild'
export { grundrissZuFormen } from './grundrissFormen'
export { VORLAGEN_KORREKTUREN, type BauExportErgebnis, type VorlagenKorrektur } from './exportBau'
export * from './skizzeFormen'
export { DECKBLATT_ABSAETZE, absatzText, type DeckblattAbsatz, type TextLauf } from './deckblattText'
export { mitLeerenBauDaten } from './ohneBau'
export { leseBauFormalien, vergleichsWert, type BauFormalien } from './bauExcelLesen'

/** Blatt, dessen Überschrift in der Vorlage fälschlich „Skizze – Baulichkeiten“ lautet. */
export const SKIZZE_AA_BLATT = 'Skizze Außenanlage-Aufwuchs'
/** Blatt für den Grundriss mit echten Maßen (Bau-Teil, Beta 4, Paket 3). */
export const SKIZZE_BAU_BLATT = 'Skizze Bau'
/** Neue Überschrift für das Skizzen-Blatt Außenanlage-Aufwuchs (statt „Skizze – Baulichkeiten“). */
export const SKIZZE_AA_UEBERSCHRIFT = 'Skizze – Außenanlagen und Aufwuchs'

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

export interface ExportOptionen {
  /**
   * Parzellenskizze als native, bearbeitbare Excel-Formen (Standard-Weg).
   * Die Formen werden an das vorhandene Drawing des Blatts „Skizze
   * Außenanlage-Aufwuchs“ angehängt; fremde Formen (Bau-Skizze) bleiben
   * unverändert, eigene Formen eines früheren Exports werden ersetzt.
   * Siehe `skizzeFormen.ts`.
   */
  skizzeFormen?: SkizzeFormenOptionen
  /**
   * Grundriss (Beta 4, Paket 3) als bearbeitbare Excel-Formen ins Blatt „Skizze Bau“, nur bei Teil `'bau'` oder `'beides'`.
   * Gebäude, Maßketten und Massenberechnung kommen aus `grundrissZuFormen`; Formen eines früheren Exports werden ersetzt,
   * fremde Formen des Blatts (z. B. eine von Hand gezeichnete Skizze) bleiben unverändert.
   */
  grundrissFormen?: Omit<SkizzeFormenOptionen, 'blatt' | 'graswiese'>
  /**
   * Fallback: Skizze statt als Formen als Bild einfügen, auch wenn `skizzeFormen`
   * übergeben wurde (z. B. wenn die Formen in einer Excel-Version Probleme machen).
   */
  skizzeAlsBild?: boolean
  /**
   * Parzellenskizze als PNG (z. B. aus skizzeAlsPng). Wird in das Blatt
   * „Skizze Außenanlage-Aufwuchs“ in den Bereich B7:G48 eingepasst.
   *
   * Als Funktion übergeben, entscheidet der Export über den Hintergrund: Hat
   * das Blatt schon eigene Formen (z. B. die kopierte Bau-Skizze), wird sie mit
   * `transparent: true` aufgerufen – das PNG darf dann weder Hintergrund noch
   * Raster haben, damit es die Formen nicht verdeckt.
   */
  skizzePng?:
    | ArrayBuffer
    | Uint8Array
    | ((optionen: { transparent: boolean }) => Promise<ArrayBuffer | Uint8Array>)
  /**
   * Die Formalien wurden schon mit der Bau-Excel abgeglichen (der Nutzer hat je Feld gewählt):
   * Die Werte aus dem WEP gelten und werden auch in Zellen geschrieben, die in der Bau-Excel
   * anders belegt sind; es gibt keine Konflikt-Meldung. Standard: Bau-Excel-Zellen bleiben, abweichende
   * Werte kommen als `konflikte` zurück.
   */
  formalienAbgeglichen?: boolean
  /**
   * Welcher Teil exportiert wird. `'bau'`: nur Bau-Blätter + Formalien (keine Grün-Blätter, keine
   * Grün-Skizze, Formalien-Zelle E13 bleibt unberührt), Dateiname `<Nr>_WEP_Bau.xlsx`.
   * `'gruen'` oder `'beides'` (Standard): wie bisher, auch mit eingelesener Bau-Excel.
   * Bau-Inhalte kommen mit Beta 4, Paket 2; bis dahin bleiben die Bau-Blätter der Quelle unverändert.
   */
  teil?: Rolle
  /**
   * Bau-Teil schreiben (Teil `'bau'` oder `'beides'` und `wep.bau` vorhanden): Index-Werte aus dem Profil (Jahr → Wert).
   */
  profilIndex?: Record<string, number>
  /** Offensichtliche Fehler in den Formeln der Vorlage im Export korrigieren (Standard: ja), siehe `VORLAGEN_KORREKTUREN`. */
  vorlagenfehlerKorrigieren?: boolean
}

export interface ExportResult {
  /** Ergebnis des Formen-Exports (undefined: keine Formen geschrieben) */
  skizzeFormen?: SkizzeFormenErgebnis
  /** true, wenn die Überschrift des Skizzen-Blatts „Außenanlage-Aufwuchs“ von „Baulichkeiten“ geändert wurde */
  skizzeUeberschriftGeaendert: boolean
  /** true, wenn eine Skizze ins Skizzen-Blatt eingefügt wurde */
  skizzeEingefuegt: boolean
  /** true, wenn das Skizzen-Blatt schon eigene Formen hatte (PNG transparent angefordert) */
  skizzeTransparent: boolean
  /** Ergebnis des Bau-Exports (undefined: Bau-Blätter wurden nicht geschrieben) */
  bau?: BauExportErgebnis
  /** Ergebnis des Grundriss-Exports ins Blatt „Skizze Bau“ (undefined: nichts geschrieben) */
  grundriss?: SkizzeFormenErgebnis
  /** Das fertige XLSX als Blob (zum Download) */
  blob: Blob
  /** Vorgeschlagener Dateiname, z. B. "2026-999_WEP.xlsx" (nur Bau: "2026-999_WEP_Bau.xlsx") */
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
  optionen: ExportOptionen = {},
): Promise<ExportResult> {
  const zip = await JSZip.loadAsync(sourceExcel)
  const konflikte: FormalienKonflikt[] = []
  let aufwuchsUeberlauf = false
  let aufwuchsAbgeschnitten = false

  const nurBau = optionen.teil === 'bau'

  // 1. Formalien-Blatt patchen (Bau: ohne E13, das ist eine Grün-Zelle)
  await patchFormalien(zip, wep, konflikte, optionen.formalienAbgeglichen === true, nurBau)

  // 1a. Deckblatt: Text A31–A40 (alle Teile; `deckblattText.ts`)
  await schreibeDeckblattText(zip)

  // 1b. Überschrift des Skizzen-Blatts Außenanlage-Aufwuchs (Vorlage: „Skizze – Baulichkeiten“)
  const skizzeUeberschriftGeaendert = nurBau ? false : await korrigiereSkizzeUeberschrift(zip)

  if (!nurBau) {
    // 2. Außenanlagen-Blatt patchen
    await patchPositionen(zip, AUSSENANLAGEN, wep.gruen.aussenanlagen, wep.gruen.beschreibungAussen)

    // 3. Aufwuchs I/II patchen (mit Überlauf)
    const aufwuchsErgebnis = await patchAufwuchs(zip, wep)
    aufwuchsUeberlauf = aufwuchsErgebnis.ueberlauf
    aufwuchsAbgeschnitten = aufwuchsErgebnis.abgeschnitten

    // 4. Beseitigungskosten Abschnitt 2 patchen
    await patchBeseitigung(zip, wep)
  }

  // 3b. Bau-Teil (Beta 4, Paket 2): Baulichkeiten, Mängelliste, Beseitigungskosten Abschnitt 1
  const schreibeBauTeil = (optionen.teil === 'bau' || optionen.teil === 'beides') && Boolean(wep.bau)
  const bauErgebnis = schreibeBauTeil
    ? await schreibeBau(zip, wep, { profilIndex: optionen.profilIndex, vorlagenfehlerKorrigieren: optionen.vorlagenfehlerKorrigieren })
    : undefined

  // 3c. Grundriss mit echten Maßen als Formen ins Blatt „Skizze Bau“ (Beta 4, Paket 3)
  const grundrissErgebnis =
    (optionen.teil === 'bau' || optionen.teil === 'beides') && optionen.grundrissFormen
      ? await fuegeSkizzeFormenEin(zip, { ...optionen.grundrissFormen, blatt: SKIZZE_BAU_BLATT, graswiese: false })
      : undefined

  // 4b. Parzellenskizze als Bild ins Blatt „Skizze Außenanlage-Aufwuchs“
  //     (das PNG erzeugt die App im Browser mit skizzeAlsPng)
  //     Vorhandene Formen im Blatt (Bau-Skizze) → PNG transparent anfordern.
  //     Standard sind native Formen (`skizzeFormen`); das PNG ist nur Fallback.
  let skizzeFormen: SkizzeFormenErgebnis | undefined
  const alsFormen = !nurBau && Boolean(optionen.skizzeFormen) && !optionen.skizzeAlsBild
  if (alsFormen) skizzeFormen = await fuegeSkizzeFormenEin(zip, optionen.skizzeFormen!)
  const pngNutzen = !nurBau && Boolean(optionen.skizzePng) && !alsFormen
  const skizzeTransparent = pngNutzen ? await skizzeBlattHatFormen(zip) : false
  let skizzeEingefuegt = Boolean(skizzeFormen)
  if (pngNutzen && optionen.skizzePng) {
    const png =
      typeof optionen.skizzePng === 'function'
        ? await optionen.skizzePng({ transparent: skizzeTransparent })
        : optionen.skizzePng
    skizzeEingefuegt = await fuegeSkizzeEin(zip, png instanceof Uint8Array ? png : new Uint8Array(png))
  }

  // 5. calcChain.xml entfernen und alle Querverweise bereinigen.
  //    Wenn nur die Datei gelöscht wird, bleiben Einträge in
  //    [Content_Types].xml und xl/_rels/workbook.xml.rels übrig, was Excel
  //    mit „Problem mit Inhalten, reparieren?" quittiert.
  await bereinigCalcChain(zip)

  // 6. fullCalcOnLoad="1" in xl/workbook.xml setzen, damit Excel/LibreOffice
  //    beim Öffnen alle Formeln neu berechnet und keine gecachten Summen zeigt.
  await setzeFullCalcOnLoad(zip)

  // 6b. Veraltete Zwischenwerte (<v>) von Formelzellen in den Grün-Blättern
  //     und den Deckblättern entfernen. LibreOffice ignoriert fullCalcOnLoad in
  //     der Standardeinstellung und zeigt sonst die alten Summen (z. B. 0 €).
  //     Formelzellen ohne Zwischenwert werden von Excel und LibreOffice beim
  //     Öffnen immer berechnet. Bau-Blätter bleiben unangetastet.
  await entferneZwischenwerte(zip, [
    'xl/worksheets/sheet1.xml', // Formalien
    ...(nurBau ? [] : [AUSSENANLAGEN.sheetPath, AUFWUCHS_I.sheetPath, AUFWUCHS_II.sheetPath, BESEITIGUNG_AA.sheetPath]),
    ...(schreibeBauTeil
      ? [
          await blattPfadNachName(zip, BAULICHKEITEN_BLATT, 'xl/worksheets/sheet3.xml'),
          await blattPfadNachName(zip, MAENGEL_BLATT, 'xl/worksheets/sheet4.xml'),
          await blattPfadNachName(zip, BESEITIGUNG_BLATT, BESEITIGUNG_AA.sheetPath),
          await blattPfadNachName(zip, TABELLE1_BLATT, 'xl/worksheets/sheet21.xml'),
        ]
      : []),
    ...(await deckblattPfade(zip)),
  ])

  // 7. Als Blob erzeugen
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const filename = `${wep.formalien.vorgangsNr || wep.id}_WEP${nurBau ? '_Bau' : ''}.xlsx`

  return {
    bau: bauErgebnis,
    grundriss: grundrissErgebnis,
    blob,
    filename,
    konflikte,
    aufwuchsUeberlauf,
    aufwuchsAbgeschnitten,
    skizzeEingefuegt,
    skizzeTransparent,
    skizzeFormen,
    skizzeUeberschriftGeaendert,
  }
}

// ---------------------------------------------------------------------------
// Formalien
// ---------------------------------------------------------------------------

async function patchFormalien(
  zip: JSZip,
  wep: Wep,
  konflikte: FormalienKonflikt[],
  abgeglichen: boolean,
  ohneGruenZellen = false,
): Promise<void> {
  const sheetPath = await formalienBlattPfad(zip)
  const file = zip.file(sheetPath)
  if (!file) throw new Error(`Formalien-Blatt nicht gefunden: ${sheetPath}`)

  let xml = await file.async('string')
  const geteilt = await sharedStrings(zip)
  const patches: CellPatch[] = []

  for (const key of Object.keys(FORMALIEN_MAP) as (keyof Formalien)[]) {
    const def = FORMALIEN_MAP[key]
    if (ohneGruenZellen && key === 'wertermittlerAussenAufwuchs') continue // E13 gehört zum Grün-Teil
    const appWert = formalienWertAlsString(key, wep)

    if (!appWert) continue // Kein Wert in der App → nichts schreiben

    if (def.bauExcelHasPriority && !abgeglichen) {
      // Prüfen ob Bau-Excel dieses Feld bereits gefüllt hat (Texte aus sharedStrings aufgelöst)
      const vorhandenerWert = zellenWert(xml, def.cell, geteilt)
      if (vorhandenerWert && vorhandenerWert.trim() !== '') {
        // Bau-Excel hat einen Wert → nur als Konflikt melden, nicht überschreiben
        if (vergleichsWert(key, vorhandenerWert) !== vergleichsWert(key, wep.formalien[key] as string | number)) {
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
    } else if (def.typ === 'datum') {
      // Datum als echte Excel-Seriennummer speichern (nicht als Text).
      // Das Datums-Format (s-Attribut) bleibt durch patchCell erhalten.
      const roherWert = wep.formalien[key]
      if (typeof roherWert === 'string' && roherWert) {
        const serial = isoDateToExcelSerial(roherWert)
        if (serial > 0) {
          patches.push({ cell: def.cell, value: serial })
        }
      }
    } else {
      patches.push({ cell: def.cell, value: appWert })
    }
  }

  xml = patchCells(xml, patches)
  zip.file(sheetPath, xml)
}

// ---------------------------------------------------------------------------
// Überschrift des Skizzen-Blatts Außenanlage-Aufwuchs
// ---------------------------------------------------------------------------

/**
 * Die Vorlage nennt das Blatt „Skizze Außenanlage-Aufwuchs“ in A1 „Skizze – Baulichkeiten“ (Kopie
 * des Bau-Blatts, beide zeigen auf denselben Shared String). Steht dort „Baulichkeiten“, wird nur A1
 * dieses Blatts durch `SKIZZE_AA_UEBERSCHRIFT` ersetzt (als eigener Text, Format bleibt); der Shared
 * String und das Bau-Blatt „Skizze Bau“ bleiben unverändert. Eine andere Überschrift bleibt stehen.
 */
async function korrigiereSkizzeUeberschrift(zip: JSZip): Promise<boolean> {
  const pfad = await blattPfadNachName(zip, SKIZZE_AA_BLATT, 'xl/worksheets/sheet19.xml')
  const file = zip.file(pfad)
  if (!file) return false
  const xml = await file.async('string')
  const aktuell = zellenWert(xml, 'A1', await sharedStrings(zip))
  if (!aktuell || !/baulichkeit/i.test(aktuell)) return false
  zip.file(pfad, patchCell(xml, 'A1', SKIZZE_AA_UEBERSCHRIFT))
  return true
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

// ---------------------------------------------------------------------------
// Bug-Fix 1: calcChain.xml vollständig entfernen
// ---------------------------------------------------------------------------

/**
 * Entfernt calcChain.xml aus dem ZIP und bereinigt gleichzeitig alle
 * Querverweise in [Content_Types].xml und xl/_rels/workbook.xml.rels.
 *
 * Hintergrund: Wird nur die Datei gelöscht, bleiben dangling Referenzen
 * übrig, die Excel beim Öffnen mit „Problem mit Inhalten, reparieren?"
 * meldet.
 */
async function bereinigCalcChain(zip: JSZip): Promise<void> {
  if (!zip.file('xl/calcChain.xml')) return

  // 1. Datei löschen
  zip.remove('xl/calcChain.xml')

  // 2. Eintrag in [Content_Types].xml entfernen
  const ctFile = zip.file('[Content_Types].xml')
  if (ctFile) {
    let ctXml = await ctFile.async('string')
    ctXml = ctXml.replace(
      /<Override\s[^>]*calcChain[^>]*\/>/g,
      '',
    )
    zip.file('[Content_Types].xml', ctXml)
  }

  // 3. Relationship in xl/_rels/workbook.xml.rels entfernen
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (relsFile) {
    let relsXml = await relsFile.async('string')
    relsXml = relsXml.replace(
      /<Relationship\s[^>]*calcChain[^>]*\/>/g,
      '',
    )
    zip.file('xl/_rels/workbook.xml.rels', relsXml)
  }
}

// ---------------------------------------------------------------------------
// Bug-Fix 2: fullCalcOnLoad="1" in workbook.xml setzen
// ---------------------------------------------------------------------------

/**
 * Setzt `fullCalcOnLoad="1"` am `<calcPr>`-Element in xl/workbook.xml.
 *
 * Ohne dieses Attribut zeigen Excel und LibreOffice beim Öffnen der Datei
 * unter Umständen gecachte (veraltete) Summenwerte an, statt alle Formeln
 * neu zu berechnen.
 */
async function setzeFullCalcOnLoad(zip: JSZip): Promise<void> {
  const wbFile = zip.file('xl/workbook.xml')
  if (!wbFile) return

  let xml = await wbFile.async('string')

  // <calcPr .../> patchen: fullCalcOnLoad hinzufügen oder aktualisieren.
  // Erfasst self-closing Tags mit beliebigen Attributen.
  xml = xml.replace(/<calcPr\b([^/]*)\s*\/>/g, (_match, attrs: string) => {
    // Vorhandenes fullCalcOnLoad-Attribut entfernen, dann neu setzen
    const saubereAttrs = attrs.replace(/\s*fullCalcOnLoad="[^"]*"/, '')
    return `<calcPr${saubereAttrs} fullCalcOnLoad="1"/>`
  })

  zip.file('xl/workbook.xml', xml)
}

// ---------------------------------------------------------------------------
// Zwischenwerte von Formelzellen entfernen (LibreOffice-Neuberechnung)
// ---------------------------------------------------------------------------

/**
 * Entfernt in den angegebenen Blättern das `<v>`-Element aller Formelzellen.
 * Ohne Zwischenwert müssen Excel und LibreOffice die Formel beim Öffnen
 * berechnen – unabhängig von deren Neuberechnungs-Einstellungen.
 */
export async function entferneZwischenwerte(
  zip: JSZip,
  pfade: string[],
): Promise<void> {
  for (const pfad of new Set(pfade)) {
    const file = zip.file(pfad)
    if (!file) continue
    const xml = await file.async('string')
    const neu = xml.replace(
      /(<c\b[^>]*>\s*<f\b[^>]*?(?:\/>|>[^<]*<\/f>))\s*<v>[^<]*<\/v>/g,
      '$1',
    )
    if (neu !== xml) zip.file(pfad, neu)
  }
}

/**
 * Findet die Blätter, deren Name mit „Deckbl" beginnt (Zusammenfassungen,
 * die auf die Grün-Summen verweisen), und liefert ihre Pfade im ZIP.
 */
export async function deckblattPfade(zip: JSZip): Promise<string[]> {
  const wb = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!wb || !rels) return []
  const pfade: string[] = []
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0]
    const name = /\bname="([^"]*)"/.exec(tag)?.[1] ?? ''
    const rid = /\br:id="([^"]*)"/.exec(tag)?.[1]
    if (!rid || !name.startsWith('Deckbl')) continue
    const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels)?.[0]
    const target = rel && /\bTarget="([^"]*)"/.exec(rel)?.[1]
    if (target) pfade.push(target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  return pfade
}
