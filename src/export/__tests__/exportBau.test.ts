// Beta 4, Paket 1: Export je Teil. Bau schreibt nur Bau-Blätter + Formalien (Bau-Blätter sind bis
// Paket 2 noch leer), Grün/Beides wie bisher. Erfundene Testdaten.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep } from '../index'
import { neuerWep, type Wep } from '../../model'
import { SHEET_PATHS } from '../cellMapper'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
let vorlage: ArrayBuffer

beforeAll(() => {
  const b = fs.readFileSync(VORLAGE)
  vorlage = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
})

function wep(): Wep {
  const w = neuerWep('2026-777')
  w.formalien.kleingartenanlage = 'KGA Testhain'
  w.formalien.parzelle = '7'
  w.formalien.wertermittlerBaulichkeiten = 'Hans Mustermann'
  w.formalien.wertermittlerAussenAufwuchs = 'Erika Musterfrau'
  w.gruen.aussenanlagen = [
    { id: 'a', bezeichnung: 'Gartenweg, Kies', anzahl: 10, einheit: 'm²', einzelpreis: 12, preisManuell: false, hinweise: [] },
  ]
  return w
}

const text = async (z: JSZip, p: string) => (await z.file(p)!.async('string'))

describe('exportWep – Teil', () => {
  it('Bau: Dateiname mit _Bau, Formalien ohne E13, Grün-Blätter unverändert', async () => {
    const r = await exportWep(wep(), vorlage, { teil: 'bau' })
    expect(r.filename).toBe('2026-777_WEP_Bau.xlsx')
    const neu = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const alt = await JSZip.loadAsync(vorlage)

    const f = await text(neu, SHEET_PATHS.formalien)
    expect(f).toMatch(/r="E12"/)
    // E12 trägt den Namen des Bau-Wertermittlers, E13 bleibt wie in der Vorlage
    const e13 = (x: string) => /<c r="E13"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/.exec(x)?.[0]
    expect(e13(f)).toBe(e13(await text(alt, SHEET_PATHS.formalien)))

    for (const p of [SHEET_PATHS.aussenanlagen, SHEET_PATHS.aufwuchsI, SHEET_PATHS.aufwuchsII, SHEET_PATHS.beseitigungskosten]) {
      expect(await text(neu, p), p).toBe(await text(alt, p))
    }
    expect(await text(neu, SHEET_PATHS.aussenanlagen)).not.toContain('Gartenweg')
    expect(r.skizzeEingefuegt).toBe(false)
    expect(r.aufwuchsUeberlauf).toBe(false)
  })

  it('Bau: Skizze-Optionen werden ignoriert', async () => {
    const r = await exportWep(wep(), vorlage, { teil: 'bau', skizzePng: new Uint8Array([1, 2, 3]) })
    expect(r.skizzeEingefuegt).toBe(false)
    expect(r.skizzeUeberschriftGeaendert).toBe(false)
  })

  it.each([undefined, 'gruen', 'beides'] as const)('Grün/Beides (%s): wie bisher, Dateiname _WEP', async (teil) => {
    const r = await exportWep(wep(), vorlage, { teil })
    expect(r.filename).toBe('2026-777_WEP.xlsx')
    const neu = await JSZip.loadAsync(await r.blob.arrayBuffer())
    expect(await text(neu, SHEET_PATHS.aussenanlagen)).toContain('Gartenweg, Kies')
  })
})
