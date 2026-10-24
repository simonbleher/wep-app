// Ein WEP „nur Grün“ mit Bau-Daten (geteilt vom Bau-Wertermittler, aus der Bau-Excel übernommen) wird mit beiden Teilen
// exportiert – sonst fehlte die Laube in Excel und PDF.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { exportRolle, exportWep, hatBauDaten, mitLeerenBauDaten } from '../index'
import { blattPfadNachName, sharedStrings, zellenWert } from '../bauExcelLesen'
import { neueBauDaten, neuerWep, type Bauteil, type Wep } from '../../model'

const laube: Bauteil = { id: 'l', art: 'laube', kuerzel: 'L', flaeche: 20, baujahr: 1990, material: 'stein', wanddickeCm: 24, maengel: [] }

function wep(rolle: Wep['rolle'], mitBau: boolean): Wep {
  const w = { ...neuerWep('2026-001'), rolle }
  w.formalien = { ...w.formalien, wertermittlungAm: '2026-10-19' }
  if (mitBau) w.bau = { ...neueBauDaten(), bauteile: [laube] }
  return w
}

describe('exportRolle', () => {
  it('Grün mit Bau-Daten → beides; sonst unverändert', () => {
    expect(exportRolle(wep('gruen', true), 'gruen')).toBe('beides')
    expect(exportRolle(wep('gruen', false), 'gruen')).toBe('gruen')
    expect(exportRolle({ bau: neueBauDaten() }, 'gruen')).toBe('gruen') // leere Bau-Daten zählen nicht
    expect(exportRolle(wep('bau', true), 'bau')).toBe('bau')
    expect(exportRolle(wep('beides', true), 'beides')).toBe('beides')
  })

  it('hatBauDaten erkennt Bauteile, Abwasser, Beschreibung, Beseitigung', () => {
    expect(hatBauDaten(undefined)).toBe(false)
    expect(hatBauDaten(neueBauDaten())).toBe(false)
    expect(hatBauDaten({ ...neueBauDaten(), beschreibung: 'Laube L' })).toBe(true)
    expect(hatBauDaten({ ...neueBauDaten(), abwasser: { art: 'grube', grube: {}, kanal: {} } })).toBe(true)
  })

  it('Excel: die Laube eines Grün-WEP mit Bau-Daten steht im Blatt „Baulichkeiten“', async () => {
    const w = wep('gruen', true)
    const f = mitLeerenBauDaten(w, exportRolle(w, 'gruen'), false)
    const vorlage = readFileSync('docs/WEP_Vorlage.xlsx')
    const r = await exportWep(f.wep, vorlage.buffer.slice(vorlage.byteOffset, vorlage.byteOffset + vorlage.byteLength), { teil: f.teil })
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const xml = await zip.file(await blattPfadNachName(zip, 'Baulichkeiten', 'xl/worksheets/sheet3.xml'))!.async('string')
    const g = await sharedStrings(zip)
    expect(zellenWert(xml, 'B12', g)).toBe('L')
    expect(zellenWert(xml, 'G12', g)).toBe('Stein 24,00 - 35,99 cm')
    expect(zellenWert(xml, 'C13', g)).toBe('1990')
    expect(zellenWert(xml, 'A17', g)).toBe('20')
    expect(r.filename).not.toMatch(/_Bau/)
  })
})
