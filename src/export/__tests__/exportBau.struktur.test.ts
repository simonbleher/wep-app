// Beta 4, Paket 2: Struktur des Bau-Exports (Formeln bleiben, nur Eingabezellen ändern sich, Vorlage unverändert).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { exportWep, VORLAGEN_KORREKTUREN } from '../index'
import { neuerWep, neueBauDaten, type Bauteil, type Wep } from '../../model'
import { kuerzelFuer, schlageBaubeschreibungVor } from '../../bau'
import { BAU_SHEET_PATHS, SHEET_PATHS } from '../cellMapper'
import { readCellRawValue, readCellFormula } from '../xmlPatcher'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
let vorlage: ArrayBuffer
let vorlageHash: string
beforeAll(() => {
  const b = fs.readFileSync(VORLAGE)
  vorlage = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  vorlageHash = crypto.createHash('sha256').update(b).digest('hex')
})

const bt = (art: Bauteil['art'], bisher: Bauteil[], o: Partial<Bauteil> = {}): Bauteil => ({ id: `t${bisher.length}`, art, kuerzel: kuerzelFuer(art, bisher), flaeche: 0, maengel: [], ...o })

function wep(): Wep {
  const w = neuerWep('2026-811')
  w.formalien.wertermittlungAm = '2025-06-01'
  w.formalien.wertermittlerBaulichkeiten = 'Hans Mustermann'
  w.bau = neueBauDaten()
  const l = w.bau.bauteile
  l.push(bt('laube', l, { laenge: 4, breite: 5, flaeche: 20, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'stein', wanddickeCm: 20, maengel: [{ gruppe: 'dach', maengel: ['Dachoberfläche beschädigt'], abzug: 8, begruendung: 'Pappe gerissen' }, { gruppe: 'waende', maengel: ['Risse'], abzug: 5, begruendung: '' }] }))
  l.push(bt('anbau', l, { flaeche: 3, baujahr: 2004, material: 'holz-doppelwandig', wanddickeCm: 6 }))
  w.bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'kunststoff', inhaltM3: 5, baujahr: 2010, genehmigtAm: '2010-04-02', dichtheitAm: '2024-05-03' } }
  w.bau.beschreibung = schlageBaubeschreibungVor(w)
  w.bau.beseitigung = [{ id: 'b1', gegenstand: 'nicht genutzte Baustoffe entfernen', menge: 2, einheit: 'm³', einzelpreis: 200, faktor: 2, begruendung: 'Wegstrecke' }]
  return w
}
const text = (z: JSZip, p: string) => z.file(p)!.async('string')

describe('Bau-Export: Struktur', () => {
  it('Vorlage in docs/ bleibt unverändert (Hash) und wird nicht beschrieben', async () => {
    await exportWep(wep(), vorlage, { teil: 'bau' })
    expect(crypto.createHash('sha256').update(fs.readFileSync(VORLAGE)).digest('hex')).toBe(vorlageHash)
  })

  it('Formeln bleiben erhalten: nur die dokumentierten Korrekturen ändern Formelzellen', async () => {
    const r = await exportWep(wep(), vorlage, { teil: 'bau' })
    const neu = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const alt = await JSZip.loadAsync(vorlage)
    for (const p of ['xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet17.xml']) {
      const formeln = (x: string) => new Map([...x.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f\b[^>]*?(?:\/>|>([^<]*)<\/f>)/g)].map((m) => [m[1], m[2] ?? '<f/>']))
      const a = formeln(await text(alt, p))
      const n = formeln(await text(neu, p))
      const geaendert = [...a.keys()].filter((k) => n.get(k) !== a.get(k))
      const erlaubt = VORLAGEN_KORREKTUREN.filter((k) => k.vorher !== '').map((k) => k.zelle)
      expect(geaendert.filter((k) => !erlaubt.includes(k)), `${p}: unerlaubt geänderte Formeln`).toEqual([])
      // keine Formel ging verloren
      expect([...a.keys()].filter((k) => !n.has(k))).toEqual([])
    }
    expect(r.bau!.korrekturen.map((k) => k.zelle).sort()).toEqual(['C33', 'C64', 'C75', 'J52', 'K21', 'K81'])
  })

  it('Eingabezellen: Typ mit Leerzeichen am Ende, Baujahr, Mängel %, Fläche, Index, Abwasser, Baubeschreibung', async () => {
    const r = await exportWep(wep(), vorlage, { teil: 'bau' })
    const z = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const b = await text(z, 'xl/worksheets/sheet3.xml')
    expect(b).toContain('<t xml:space="preserve">Stein 17,50 - 23,99 cm </t>')
    expect(readCellRawValue(b, 'C13')).toBe('1998')
    expect(readCellRawValue(b, 'E14')).toBe('13')
    expect(readCellRawValue(b, 'A17')).toBe('20')
    expect(readCellRawValue(b, 'H7')).toBe('179.2')
    expect(readCellRawValue(b, 'I7')).toBe('für 2025')
    expect(readCellRawValue(b, 'I75')).toBe('5')
    expect(readCellRawValue(b, 'F104')).toBeNull() // Beispiel 5 m³ der Vorlage ist geleert
    expect(readCellRawValue(b, 'H105')).toBeNull()
    expect(readCellRawValue(b, 'I19')).toBeNull() // Beispiel 1 m² der Vorlage ist geleert
    expect(b).toMatch(/<c r="B83"[^>]*t="inlineStr"><is><t[^>]*>Laube L: 4 × 5 m/)
    expect(readCellFormula(b, 'K81')).toBe('K61+K71+K75+K77+K79')
    expect(readCellFormula(b, 'C33')).toBe('$H$32')
    // Mängelliste: Abzug konkret je Gruppe, Beispielwert 0,05 in F44 geleert
    const m = await text(z, 'xl/worksheets/sheet4.xml')
    expect(readCellRawValue(m, 'F5')).toBe('8')
    expect(readCellRawValue(m, 'F16')).toBe('5')
    expect(readCellRawValue(m, 'F44')).toBeNull()
    // Beseitigungskosten Teil 1
    const k = await text(z, 'xl/worksheets/sheet17.xml')
    expect(k).toContain('nicht genutzte Baustoffe entfernen')
    expect(readCellRawValue(k, 'H12')).toBe('200')
    expect(readCellRawValue(k, 'J12')).toBe('2')
    expect(readCellRawValue(k, 'F25')).toContain('Wegstrecke')
    expect(k).toMatch(/<c r="K21"[^>]*><f t="shared" si="0"\/><\/c>/)
  })

  it('ohne Korrektur bleiben die Formeln der Vorlage, wie sie sind', async () => {
    const r = await exportWep(wep(), vorlage, { teil: 'bau', vorlagenfehlerKorrigieren: false })
    expect(r.bau!.korrekturen).toEqual([])
    const b = await text(await JSZip.loadAsync(await r.blob.arrayBuffer()), 'xl/worksheets/sheet3.xml')
    expect(readCellFormula(b, 'K81')).toBe('K52+K61+K71+K75+K77+K79')
  })

  it('Grün-Export schreibt keine Bau-Blätter, auch wenn am WEP Bau-Daten liegen', async () => {
    const alt = await JSZip.loadAsync(vorlage)
    const r = await exportWep(wep(), vorlage, { teil: 'gruen' })
    expect(r.bau).toBeUndefined()
    const neu = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const deckblaetter = new Set(['xl/worksheets/sheet2.xml', 'xl/worksheets/sheet11.xml', 'xl/worksheets/sheet12.xml', 'xl/worksheets/sheet13.xml'])
    for (const p of BAU_SHEET_PATHS) {
      if (deckblaetter.has(p)) continue
      expect(await text(neu, p), p).toBe(await text(alt, p))
    }
  })

  it('Beides schreibt Bau und Grün; ohne Bau-Daten am WEP bleibt der Bau-Teil unberührt', async () => {
    const w = wep()
    w.gruen.aussenanlagen = [{ id: 'a', bezeichnung: 'Gartenweg, Kies', anzahl: 10, einheit: 'm²', einzelpreis: 12, preisManuell: false, hinweise: [] }]
    const r = await exportWep(w, vorlage, { teil: 'beides' })
    const z = await JSZip.loadAsync(await r.blob.arrayBuffer())
    expect(await text(z, SHEET_PATHS.aussenanlagen)).toContain('Gartenweg, Kies')
    expect(await text(z, 'xl/worksheets/sheet3.xml')).toContain('Laube L')
    const ohne = wep()
    delete ohne.bau
    const r2 = await exportWep(ohne, vorlage, { teil: 'bau' })
    expect(r2.bau).toBeUndefined()
    const alt = await JSZip.loadAsync(vorlage)
    expect(await text(await JSZip.loadAsync(await r2.blob.arrayBuffer()), 'xl/worksheets/sheet3.xml')).toBe(await text(alt, 'xl/worksheets/sheet3.xml'))
  })

  it('Sheet-XML bleibt wohlgeformt, Bauteile ohne Platz und lange Beschreibung werden gemeldet', async () => {
    const w = wep()
    const l = w.bau!.bauteile
    l.push(bt('anbau', l, { flaeche: 1 }), bt('anbau', l, { flaeche: 1 }))
    w.bau!.beschreibung = Array.from({ length: 40 }, (_, i) => `Zeile ${i + 1} mit etwas Text`).join('\n')
    const r = await exportWep(w, vorlage, { teil: 'bau' })
    expect(r.bau!.nichtExportiert).toHaveLength(1)
    expect(r.bau!.beschreibungGekuerzt).toBe(40 - 17)
    const z = await JSZip.loadAsync(await r.blob.arrayBuffer())
    for (const p of ['xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet17.xml']) {
      const fehler: string[] = []
      new DOMParser({ onError: (e: string) => fehler.push(e) }).parseFromString(await text(z, p), 'text/xml')
      expect(fehler, p).toEqual([])
    }
  })
})
