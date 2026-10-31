// Bäume: Das Maß steht in der Bezeichnung – im Excel-Export, in beiden PDFs und damit auch in der Übersicht.
// Erfundene Daten („Erika Musterfrau“).
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { neuerWep, type Wep } from '../../model'
import { exportWep } from '../../export'
import { erzeugeWepPdf, erzeugeWepUebersichtPdf } from '../index'
import { liesPdf } from './pdfLesen'
import { vorlageBytes } from './hilfen'

function testWep(): Wep {
  const w = neuerWep('2026-905')
  w.formalien.vorgangsNr = '2026-905'
  w.formalien.kleingartenanlage = 'KGA Testhain e. V.'
  w.formalien.unterpaechter = 'Erika Musterfrau'
  w.formalien.parzellenflaecheM2 = 350
  w.gruen.aufwuchs = [
    { id: 'a1', katalogId: 'aw-obstgehoelz', bezeichnung: 'Apfel, Halbstamm, 12 J.', anzahl: 1, einheit: 'Stück', zustand: 'gut', hoechstwert: 85, einzelpreis: 63.75, preisManuell: false, hinweise: [], baumform: 'Halbstamm', alterJahre: 12 },
  ]
  w.gruen.beseitigungAA = [
    { id: 'b1', gegenstand: 'Birke fällen inkl. Wurzelstock, StU 85 cm', menge: 1, einheit: 'Stück', einzelpreis: 600, faktor: 1, baum: { art: 'Birke', stammumfangCm: 85 }, preisManuell: false },
  ]
  return w
}

const norm = (s: string) => s.replace(/\s+/g, ' ')

describe('Maß in Excel und PDF', () => {
  let excelText = ''
  beforeAll(async () => {
    const erg = await exportWep(testWep(), vorlageBytes())
    const zip = await JSZip.loadAsync(erg.blob)
    const teile = await Promise.all(Object.keys(zip.files).filter((n) => /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')))
    excelText = teile.join('\n')
  })

  it('Excel: Bezeichnung mit Alter, Gegenstand mit Stammumfang, Satz 600 €', () => {
    expect(excelText).toContain('Apfel, Halbstamm, 12 J.')
    expect(excelText).toContain('Birke fällen inkl. Wurzelstock, StU 85 cm')
    expect(excelText).toContain('<v>600</v>')
  })

  it('PDF übersichtlich und wie Vorlage: beide nennen das Maß', async () => {
    const eingabe = { wep: testWep(), quelle: vorlageBytes(), hatBauExcel: false, rolle: 'gruen' as const }
    for (const pdf of [(await erzeugeWepUebersichtPdf(eingabe, { unterschrift: null })).pdf, (await erzeugeWepPdf(eingabe, { unterschrift: null })).pdf]) {
      const text = norm((await liesPdf(pdf.bytes)).map((s) => s.text).join(' '))
      expect(text).toContain('StU 85 cm')
      expect(text).toContain('12 J.')
    }
  })
})
