/**
 * Tests für src/export/
 *
 * Testdaten ausschließlich mit erfundenen Personen (keine echten Daten).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import os from 'node:os'
import JSZip from 'jszip'

import { exportWep, deckblattPfade, type ExportResult } from '../index'
import { neuerWep } from '../../model'
import type { Wep, Position, BeseitigungsPosition } from '../../model'
import { BAU_SHEET_PATHS, isoDateToExcelSerial } from '../cellMapper'
import { patchCell, readCellRawValue, xmlEscape } from '../xmlPatcher'

// ---------------------------------------------------------------------------
// Pfad zur Vorlage (relativ zum Repo-Root)
// ---------------------------------------------------------------------------

const VORLAGE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/WEP_Vorlage.xlsx',
)

let vorlageBuffer: ArrayBuffer

beforeAll(() => {
  const buf = fs.readFileSync(VORLAGE_PATH)
  vorlageBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

// ---------------------------------------------------------------------------
// Hilfsfunktionen für Tests
// ---------------------------------------------------------------------------

function bauPosition(
  bezeichnung: string,
  anzahl = 1,
  einheit = 'Stück',
  einzelpreis = 100,
): Position {
  return {
    id: crypto.randomUUID(),
    bezeichnung,
    anzahl,
    einheit,
    einzelpreis,
    preisManuell: false,
    hinweise: [],
  }
}

function bauBeseitigung(gegenstand: string): BeseitigungsPosition {
  return {
    id: crypto.randomUUID(),
    gegenstand,
    menge: 2,
    einheit: 'm',
    einzelpreis: 50,
    faktor: 1,
  }
}

function testWep(id = '2026-999'): Wep {
  const wep = neuerWep(id)
  wep.formalien = {
    kleingartenanlage: 'KGA Testhain e. V.',
    parzelle: '42',
    weg: 'A',
    unterpaechter: 'Erika Musterfrau',
    auftraggeber: 'Bezirksverband Pankow der Gartenfreunde',
    vertretenDurchRA: '',
    anwesendVerein: 'Max Mustermann',
    anwesendUnterpaechter: 'Erika Musterfrau',
    anwesendAuftraggeber: '',
    wertermittlerBaulichkeiten: 'Hans Mustermann',
    wertermittlerAussenAufwuchs: 'Simon Grünwart',
    wertermittlungAm: '2026-10-16',
    protokollerstellungAm: '2026-10-20',
    parzellenflaecheM2: 350,
    vorgangsNr: id,
  }
  wep.gruen = {
    beschreibungAussen:
      'Gepflegter Kleingarten mit Obstbäumen und Gemüsebeeten.',
    beschreibungAufwuchs: 'Diverse Obstgehölze und Sträucher.',
    aussenanlagen: [
      bauPosition('Rasen/Wiese', 80, 'm²', 3.5),
      bauPosition('Gartenweg, Kies', 15, 'm²', 12),
      bauPosition('Kompostanlage', 1, 'Stück', 30),
    ],
    aufwuchs: [
      bauPosition('Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 120),
      bauPosition('Liguster, Hecke 1,0 m', 5, 'lfdm', 20),
    ],
    beseitigungAA: [bauBeseitigung('Hecke auf zul. Höhe schneiden')],
  }
  return wep
}

// ---------------------------------------------------------------------------
// Unit-Tests isoDateToExcelSerial
// ---------------------------------------------------------------------------

describe('isoDateToExcelSerial', () => {
  it('2026-10-16 ergibt 46311', () => {
    expect(isoDateToExcelSerial('2026-10-16')).toBe(46311)
  })

  it('2026-10-20 ergibt 46315', () => {
    expect(isoDateToExcelSerial('2026-10-20')).toBe(46315)
  })

  it('leerer String ergibt 0', () => {
    expect(isoDateToExcelSerial('')).toBe(0)
  })

  it('ungültiges Format ergibt 0', () => {
    expect(isoDateToExcelSerial('16.10.2026')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Unit-Tests xmlPatcher
// ---------------------------------------------------------------------------

describe('xmlPatcher', () => {
  it('patchCell – Zahl in leere Zelle', () => {
    const xml = '<row r="1"><c r="A1" s="100"/></row>'
    const result = patchCell(xml, 'A1', 42)
    expect(result).toContain('<c r="A1" s="100"><v>42</v></c>')
  })

  it('patchCell – String als inlineStr', () => {
    const xml = '<row r="3"><c r="E3" s="809"/></row>'
    const result = patchCell(xml, 'E3', 'Pankow')
    expect(result).toContain('t="inlineStr"')
    expect(result).toContain('<t>Pankow</t>')
    expect(result).toContain('s="809"')
  })

  it('patchCell – XML-Sonderzeichen werden maskiert', () => {
    const xml = '<row r="1"><c r="C1" s="10"/></row>'
    const result = patchCell(xml, 'C1', 'Müller & Co. <GmbH>')
    // Ü ist gültiges Unicode, wird nicht maskiert; & und < > werden maskiert
    expect(result).toContain('Müller &amp; Co. &lt;GmbH&gt;')
    expect(result).toContain('&amp;')
    expect(result).toContain('&lt;GmbH&gt;')
  })

  it('patchCell – null leert die Zelle', () => {
    const xml = '<row r="1"><c r="A1" s="5"><v>99</v></c></row>'
    const result = patchCell(xml, 'A1', null)
    expect(result).toContain('<c r="A1" s="5"/>')
    expect(result).not.toContain('<v>')
  })

  it('patchCell – vorhandenen Wert überschreiben', () => {
    const xml =
      '<row r="5"><c r="K5" s="20"><v>100</v></c></row>'
    const result = patchCell(xml, 'K5', 250.5)
    expect(result).toContain('<v>250.5</v>')
  })

  it('patchCell – InlineStr überschreiben', () => {
    const xml =
      '<row r="3"><c r="E3" s="809" t="inlineStr"><is><t>Alt</t></is></c></row>'
    const result = patchCell(xml, 'E3', 'Neu')
    expect(result).toContain('<t>Neu</t>')
    expect(result).not.toContain('<t>Alt</t>')
  })

  it('readCellRawValue – leere Zelle', () => {
    const xml = '<row r="1"><c r="A1" s="5"/></row>'
    expect(readCellRawValue(xml, 'A1')).toBeNull()
  })

  it('readCellRawValue – Zahlenwert', () => {
    const xml = '<row r="1"><c r="B2" s="5"><v>42</v></c></row>'
    expect(readCellRawValue(xml, 'B2')).toBe('42')
  })

  it('readCellRawValue – InlineStr', () => {
    const xml =
      '<row r="1"><c r="C3" t="inlineStr"><is><t>Hallo</t></is></c></row>'
    expect(readCellRawValue(xml, 'C3')).toBe('Hallo')
  })

  it('xmlEscape – Sonderzeichen', () => {
    expect(xmlEscape('a & b')).toBe('a &amp; b')
    expect(xmlEscape('<tag>')).toBe('&lt;tag&gt;')
  })
})

// ---------------------------------------------------------------------------
// Export ohne Bau-Excel (direkt aus Vorlage)
// ---------------------------------------------------------------------------

describe('exportWep – ohne Bau-Excel', () => {
  let result: ExportResult
  let zip: JSZip

  beforeAll(async () => {
    const wep = testWep()
    result = await exportWep(wep, vorlageBuffer)
    zip = await JSZip.loadAsync(result.blob)
  })

  it('gibt einen Blob zurück', () => {
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.size).toBeGreaterThan(0)
  })

  it('Dateiname enthält die Vorgangs-Nr', () => {
    expect(result.filename).toBe('2026-999_WEP.xlsx')
  })

  it('keine Konflikte (Vorlage ist leer)', () => {
    expect(result.konflikte).toHaveLength(0)
  })

  it('Formalien E3 (Kleingartenanlage) ist korrekt', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheetXml).toContain('KGA Testhain e. V.')
  })

  it('Formalien E6 (Unterpächter) ist korrekt', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheetXml).toContain('Erika Musterfrau')
  })

  it('Formalien E13 (Wertermittler Grün) ist korrekt', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheetXml).toContain('Simon Grünwart')
  })

  it('Formalien E14 (Datum) ist als echte Excel-Seriennummer gespeichert', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    // Erwartete Seriennummer für 2026-10-16 im 1900-Datumssystem
    const erwartetSerial = isoDateToExcelSerial('2026-10-16')
    expect(erwartetSerial).toBeGreaterThan(0)
    expect(sheetXml).toContain(`<v>${erwartetSerial}</v>`)
    // Als Text (DD.MM.YYYY) darf das Datum NICHT mehr erscheinen
    expect(sheetXml).not.toContain('16.10.2026')
  })

  it('Formalien E16 (Parzellenfläche) ist eine Zahl', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheetXml).toContain('<v>350</v>')
  })

  it('Außenanlagen: erste Position in Zeile 15', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet5.xml')!.async('string')
    // Anzahl
    expect(sheetXml).toContain('<v>80</v>')
    // Einheit
    expect(sheetXml).toContain('m²')
    // Bezeichnung
    expect(sheetXml).toContain('Rasen/Wiese')
  })

  it('Aufwuchs I: erste Position in Zeile 18', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet6.xml')!.async('string')
    expect(sheetXml).toContain('Apfel, Halbstamm')
  })

  it('Beseitigungskosten: erste Position in Zeile 34', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet17.xml')!.async('string')
    expect(sheetXml).toContain('Hecke auf zul. H')
  })

  it('Formeln in Spalte L der Außenanlagen sind erhalten', async () => {
    const sheetXml = await zip.file('xl/worksheets/sheet5.xml')!.async('string')
    expect(sheetXml).toContain('ROUND(A15*K15,2)')
  })

  it('Bug 1: calcChain.xml ist nicht im Export-ZIP', () => {
    expect(zip.file('xl/calcChain.xml')).toBeNull()
  })

  it('Bug 1: [Content_Types].xml enthält keinen calcChain-Verweis', async () => {
    const ctXml = await zip.file('[Content_Types].xml')!.async('string')
    expect(ctXml).not.toContain('calcChain')
  })

  it('Bug 1: xl/_rels/workbook.xml.rels enthält keinen calcChain-Verweis', async () => {
    const relsFile = zip.file('xl/_rels/workbook.xml.rels')
    // Wenn die Datei existiert, darf sie keinen calcChain-Eintrag haben
    if (relsFile) {
      const relsXml = await relsFile.async('string')
      expect(relsXml).not.toContain('calcChain')
    }
  })

  it('Bug 2: workbook.xml hat fullCalcOnLoad="1"', async () => {
    const wbXml = await zip.file('xl/workbook.xml')!.async('string')
    expect(wbXml).toContain('fullCalcOnLoad="1"')
  })
})

// ---------------------------------------------------------------------------
// Export mit Bau-Excel
// ---------------------------------------------------------------------------

describe('exportWep – mit Bau-Excel', () => {
  /**
   * Erzeugt eine synthetische „Bau-Excel": Vorlage, in der die Bau-relevanten
   * Formalien-Felder bereits gefüllt sind (E3, E4, E6, E12, E14).
   * Testdaten sind erfunden (Musterfrau, Mustermann).
   */
  async function erstelleBauExcel(
    overrides: Record<string, string>,
  ): Promise<ArrayBuffer> {
    const bauZip = await JSZip.loadAsync(vorlageBuffer)
    const path = 'xl/worksheets/sheet1.xml'
    let xml = await bauZip.file(path)!.async('string')

    for (const [cell, val] of Object.entries(overrides)) {
      // Direktes Patching für den Testaufbau
      const cellEsc = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(
        `<c\\s[^>]*r="${cellEsc}"[^>]*>[\\s\\S]*?<\\/c>|<c\\s[^>]*r="${cellEsc}"[^>]*/>`,
        'g',
      )
      const styleMatch = xml.match(
        new RegExp(`<c\\s[^>]*r="${cellEsc}"[^>]*\\bs="(\\d+)"`),
      )
      const style = styleMatch ? ` s="${styleMatch[1]}"` : ''
      xml = xml.replace(
        pattern,
        `<c r="${cell}"${style} t="inlineStr"><is><t>${xmlEscape(val)}</t></is></c>`,
      )
    }

    bauZip.file(path, xml)
    const blob = await bauZip.generateAsync({ type: 'arraybuffer' })
    return blob
  }

  let result: ExportResult
  let zip: JSZip
  let bauExcelXmlVorher: Record<string, string>

  beforeAll(async () => {
    // Bau-Wertermittler hat E3, E4, E6, E12, E14 bereits ausgefüllt
    const bauExcel = await erstelleBauExcel({
      E3: 'KGA Testhain e. V.',   // gleich wie App → kein Konflikt
      E4: '42',                   // gleich wie App
      E6: 'Anna Musterfrau',      // ABWEICHEND (App: Erika Musterfrau) → Konflikt
      E12: 'Klaus Baumeister',    // Bau-Wertermittler → kein App-Wert dafür
      E14: '15.10.2026',          // ABWEICHEND (App: 16.10.2026) → Konflikt
    })

    // Bau-Blatt-XMLs VOR dem Export sichern (für Byte-Vergleich)
    const bauZipVorher = await JSZip.loadAsync(bauExcel)
    bauExcelXmlVorher = {}
    for (const p of BAU_SHEET_PATHS) {
      const f = bauZipVorher.file(p)
      if (f) bauExcelXmlVorher[p] = await f.async('string')
    }

    const wep = testWep()
    result = await exportWep(wep, bauExcel)
    zip = await JSZip.loadAsync(result.blob)
  })

  it('gibt einen Blob zurück', () => {
    expect(result.blob.size).toBeGreaterThan(0)
  })

  it('E13 (Wertermittler Grün) wird immer geschrieben', async () => {
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain('Simon Grünwart')
  })

  it('E6 (Unterpächter): Bau-Wert bleibt, App-Wert als Konflikt', async () => {
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    // Bau-Wert (Anna Musterfrau) bleibt in E6 erhalten
    expect(xml).toContain('Anna Musterfrau')
    // App-Wert (Erika Musterfrau) darf NICHT in E6 stehen.
    // Hinweis: Erika Musterfrau kann in E10 (anwesendUnterpaechter) erscheinen,
    // weil E10 in der Bau-Excel leer war und daher vom App-Wert überschrieben wird.
    // Daher prüfen wir gezielt, dass der Konflikt korrekt gemeldet wurde.
    const konflikt = result.konflikte.find((k) => k.feld === 'unterpaechter')
    expect(konflikt).toBeDefined()
    expect(konflikt?.zelle).toBe('E6')
    expect(konflikt?.bauExcelWert).toBe('Anna Musterfrau')
    expect(konflikt?.appWert).toBe('Erika Musterfrau')
  })

  it('E3 (Kleingartenanlage): gleicher Wert → kein Konflikt', () => {
    const konflikt = result.konflikte.find((k) => k.feld === 'kleingartenanlage')
    expect(konflikt).toBeUndefined()
  })

  it('E14 (Wertermittlungsdatum): Bau-Wert bleibt, Konflikt gemeldet', () => {
    const konflikt = result.konflikte.find((k) => k.feld === 'wertermittlungAm')
    expect(konflikt).toBeDefined()
    expect(konflikt?.bauExcelWert).toBe('15.10.2026')
  })

  it('Grün-Daten (Außenanlagen) werden korrekt geschrieben', async () => {
    const xml = await zip.file('xl/worksheets/sheet5.xml')!.async('string')
    expect(xml).toContain('Rasen/Wiese')
    expect(xml).toContain('Gartenweg, Kies')
  })

  it('Bau-Blatt-XMLs sind byte-gleich (sheet3 Baulichkeiten)', async () => {
    // Deckblätter fassen Bau und Grün zusammen: Dort werden nur die veralteten
    // Zwischenwerte (<v>) von Formelzellen entfernt, Inhalte bleiben gleich.
    const deckblaetter = new Set(await deckblattPfade(zip))
    const ohneZwischenwerte = (xml: string) =>
      xml.replace(/(<c\b[^>]*>\s*<f\b[^>]*?(?:\/>|>[^<]*<\/f>))\s*<v>[^<]*<\/v>/g, '$1')
    for (const sheetPath of BAU_SHEET_PATHS) {
      const vorher = bauExcelXmlVorher[sheetPath]
      if (!vorher) continue // Nicht in diesem XLSX vorhanden
      const nachher = await zip.file(sheetPath)?.async('string')
      if (!nachher) continue
      if (deckblaetter.has(sheetPath)) {
        expect(nachher, sheetPath).toBe(ohneZwischenwerte(vorher))
      } else {
        expect(nachher, sheetPath).toBe(vorher)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Aufwuchs-Überlauf
// ---------------------------------------------------------------------------

describe('exportWep – Aufwuchs-Überlauf', () => {
  it('mehr als 28 Aufwuchs-Positionen → Überlauf nach Aufwuchs II', async () => {
    const wep = testWep()
    // 30 Positionen erzeugen (mehr als Aufwuchs I max. 28)
    wep.gruen.aufwuchs = Array.from({ length: 30 }, (_, i) =>
      bauPosition(`Obstgehölz Nr. ${i + 1}`, 1, 'Stück', 100),
    )

    const result = await exportWep(wep, vorlageBuffer)
    expect(result.aufwuchsUeberlauf).toBe(true)
    expect(result.aufwuchsAbgeschnitten).toBe(false)

    const zip = await JSZip.loadAsync(result.blob)

    // Aufwuchs I: Positionen 1–28
    const aufwuchsI = await zip.file('xl/worksheets/sheet6.xml')!.async('string')
    expect(aufwuchsI).toContain('Obstgehölz Nr. 1')
    expect(aufwuchsI).toContain('Obstgehölz Nr. 28')
    expect(aufwuchsI).not.toContain('Obstgehölz Nr. 29')

    // Aufwuchs II: Positionen 29–30
    const aufwuchsII = await zip.file('xl/worksheets/sheet7.xml')!.async('string')
    expect(aufwuchsII).toContain('Obstgehölz Nr. 29')
    expect(aufwuchsII).toContain('Obstgehölz Nr. 30')
  })

  it('mehr als 64 Aufwuchs-Positionen → abgeschnitten=true', async () => {
    const wep = testWep()
    wep.gruen.aufwuchs = Array.from({ length: 70 }, (_, i) =>
      bauPosition(`Gehölz ${i + 1}`, 1, 'Stück', 50),
    )
    const result = await exportWep(wep, vorlageBuffer)
    expect(result.aufwuchsAbgeschnitten).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// LibreOffice-Test (nur wenn verfügbar)
// ---------------------------------------------------------------------------

async function isLibreOfficeAvailable(): Promise<boolean> {
  try {
    execSync('libreoffice --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

describe('LibreOffice-Neuberechnung', () => {
  it('LibreOffice kann die erzeugte XLSX-Datei öffnen und die Formalien sind lesbar', async () => {
    const loCurrent = await isLibreOfficeAvailable()
    if (!loCurrent) {
      console.log('LibreOffice nicht gefunden – Test wird übersprungen')
      return
    }

    const wep = testWep()

    const result = await exportWep(wep, vorlageBuffer)
    const bytes = await result.blob.arrayBuffer()
    const buf = Buffer.from(bytes)

    // In temporäres Verzeichnis schreiben
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wep-test-'))
    const xlsxPath = path.join(tmpDir, 'test.xlsx')
    const csvDir = path.join(tmpDir, 'csv')
    fs.mkdirSync(csvDir)
    fs.writeFileSync(xlsxPath, buf)

    try {
      // LibreOffice konvertiert das erste Blatt (Formalien) zu CSV.
      // Exitcode 0 = Datei ist gültiges XLSX, Formeln werden neu berechnet.
      execSync(
        `libreoffice --headless --convert-to csv --outdir "${csvDir}" "${xlsxPath}"`,
        { stdio: 'pipe', timeout: 30000 },
      )

      const csvFiles = fs.readdirSync(csvDir)
      const csvFile = csvFiles.find((f) => f.endsWith('.csv'))
      if (!csvFile) {
        console.log('CSV nicht erzeugt – Test übersprungen')
        return
      }

      const csv = fs.readFileSync(path.join(csvDir, csvFile), 'utf-8')

      // Formalien-Daten aus dem ersten Blatt prüfen
      // Vorgangs-Nr (E17) und Wertermittler Grün (E13) sollten im CSV stehen
      expect(csv).toContain('2026-999')
      expect(csv).toContain('Simon Grünwart')
    } finally {
      // Aufräumen
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 60000) // 60s Timeout für LibreOffice

  it('LibreOffice: Formelzellen L46, K45, J3 haben nach Neuberechnung korrekte Werte', async () => {
    const loCurrent = await isLibreOfficeAvailable()
    if (!loCurrent) {
      console.log('LibreOffice nicht gefunden – Test wird übersprungen')
      return
    }

    const wep = testWep()
    // Testwerte:
    // Außenanlagen (sheet5):
    //   Zeile 15: A=80 m², K=3.50 → L15 = ROUND(80*3.50,2) = 280
    //   Zeile 16: A=15 m², K=12  → L16 = ROUND(15*12,2) = 180
    //   Zeile 17: A=1,  K=30     → L17 = ROUND(1*30,2) = 30
    //   L46 = Summe aller L-Zellen → 280 + 180 + 30 = 490

    const result = await exportWep(wep, vorlageBuffer)
    const bytes = await result.blob.arrayBuffer()
    const buf = Buffer.from(bytes)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wep-lo-'))
    try {
      const xlsxPath = path.join(tmpDir, 'test.xlsx')
      fs.writeFileSync(xlsxPath, buf)

      // Als XLSX neu speichern lassen: LibreOffice schreibt dabei die
      // frisch berechneten Werte als Zwischenwerte in die Datei.
      const outDir = path.join(tmpDir, 'out')
      fs.mkdirSync(outDir)
      execSync(
        `libreoffice --headless --calc --convert-to xlsx --outdir "${outDir}" "${xlsxPath}"`,
        { stdio: 'pipe', timeout: 60000 },
      )
      const outZip = await JSZip.loadAsync(fs.readFileSync(path.join(outDir, 'test.xlsx')))
      const wert = async (sheet: string, zelle: string) => {
        const xml = await outZip.file(`xl/worksheets/${sheet}.xml`)!.async('string')
        const m = new RegExp(`<c r="${zelle}"[^>]*>[\\s\\S]*?<v>([^<]*)</v>`).exec(xml)
        return m ? Number(m[1]) : NaN
      }
      // Erwartete Summen direkt aus den Testdaten berechnen
      const summe = (ps: { anzahl: number; einzelpreis: number }[]) =>
        Math.round(ps.reduce((s, p) => s + Math.round(p.anzahl * p.einzelpreis * 100) / 100, 0) * 100) / 100
      expect(await wert('sheet5', 'L46')).toBeCloseTo(summe(wep.gruen.aussenanlagen), 2)
      expect(await wert('sheet6', 'L46')).toBeCloseTo(summe(wep.gruen.aufwuchs.slice(0, 28)), 2)
      const flaeche = wep.formalien.parzellenflaecheM2
      expect(await wert('sheet5', 'J3')).toBeCloseTo(((flaeche - 24) / 100) * 6, 2)
      const bes = wep.gruen.beseitigungAA.reduce((s, b) => s + b.menge * b.einzelpreis * b.faktor, 0)
      expect(await wert('sheet17', 'K45')).toBeCloseTo(bes, 2)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 60000)
})

describe('exportWep – Zwischenwerte', () => {
  it('Formelzellen der Grün-Blätter und Deckblätter haben keine veralteten Zwischenwerte', async () => {
    const result = await exportWep(testWep(), vorlageBuffer)
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
    for (const sheet of ['sheet1', 'sheet2', 'sheet5', 'sheet6', 'sheet7', 'sheet17']) {
      const xml = await zip.file(`xl/worksheets/${sheet}.xml`)!.async('string')
      expect(xml, sheet).not.toMatch(/<f\b[^>]*(?:\/>|>[^<]*<\/f>)\s*<v>/)
    }
  })
})
