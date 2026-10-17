/**
 * Fall 1 (anonymisiert) end-to-end: soll.json → Ausrichtung → Excel-Formen im
 * Drawing mit den Bau-Formen aus aussen-vorher.json. Nur Geometrie, keine Personendaten.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep } from '../../../../src/export'
import { ANKER_REGEX } from '../../../../src/export/skizzeBild'
import { neuerWep } from '../../../../src/model'
import { richteAus, type BauForm } from '../ausrichtung'
import { bauFormenDrawing, ident, svgZuPngNode, vorlageMitBauFormen, zuordnungenZuFormen } from '../formen'
import { bereinigeAntwort } from '../schema'

const HIER = dirname(fileURLToPath(import.meta.url))
const FALL = join(HIER, '../../faelle-skizze/fall1')
const formen = (JSON.parse(readFileSync(join(FALL, 'aussen-vorher.json'), 'utf8')) as { formen: BauForm[] }).formen
const { antwort } = bereinigeAntwort(JSON.parse(readFileSync(join(FALL, 'soll.json'), 'utf8')))
const vorlageDatei = readFileSync(join(HIER, '../../../../docs/WEP_Vorlage.xlsx'))
const vorlage = vorlageDatei.buffer.slice(vorlageDatei.byteOffset, vorlageDatei.byteOffset + vorlageDatei.byteLength)

const ausrichtung = richteAus(antwort.elemente, antwort.grundstueck, formen)
const elemente = zuordnungenZuFormen(ausrichtung)

describe('ident', () => {
  it('macht Namen aus Beschriftungen', () => {
    expect(ident('Holz pferd')).toBe('Holz_pferd')
    expect(ident('HW-Schacht (alt)')).toBe('HW-Schacht_alt')
  })
})

describe('Fall 1 → Formen', () => {
  it('übernimmt nur neue Elemente: 4 Hochbeete + Holzpferd-Hinweis, nicht Laube/Brunnen/Zugang', () => {
    const namen = elemente.map((e) => e.name)
    expect(namen).toEqual(['Holzpferd', 'Hochbeet_0', 'Hochbeet_1', 'Hochbeet_2', 'Hochbeet_3', 'Hochbeete_Text'])
    expect(elemente[0]).toMatchObject({ typ: 'entfernen', text: 'Holzpferd entfernen' })
  })

  it('die Hochbeete liegen unter der Laube, im Grundstück und links vom Pavillon-Bereich nicht außerhalb', () => {
    const gs = ausrichtung.grundstueck
    const laube = formen.find((f) => f.name === 'Rechteck 8')!
    for (const e of elemente.filter((e) => e.typ === 'hochbeet')) {
      const k = e.kasten!
      expect(k.y).toBeGreaterThan(laube.y + laube.h)
      expect(k.x).toBeGreaterThan(gs.x)
      expect(k.x + k.w).toBeLessThan(gs.x + gs.w)
      expect(k.y + k.h).toBeLessThan(gs.y + gs.h)
    }
  })
})

describe('Fall 1: Export in das Blatt mit den Bau-Formen', () => {
  const wep = neuerWep('fall1')
  wep.formalien.unterpaechter = 'Erika Musterfrau'

  it('Bau-Formen bleiben byte-gleich, neue Formen liegen darüber, LibreOffice-fest', async () => {
    const basis = await vorlageMitBauFormen(vorlage, formen)
    const vorher = await (await JSZip.loadAsync(basis)).file('xl/drawings/drawing9.xml')!.async('string')
    expect([...vorher.matchAll(ANKER_REGEX)]).toHaveLength(formen.length)

    const r = await exportWep(wep, basis, { skizzeFormen: { elemente, rasterisiere: svgZuPngNode } })
    expect(r.skizzeFormen!.graswiese).toBe(false) // Blatt hat Bau-Formen
    // Hochbeete überdeckten das Bau-Label „Brunnen“ → gemeinsam versetzt/verkleinert, nichts überdeckt
    expect(r.skizzeFormen!.versetzt).toEqual(['Hochbeet'])
    expect(r.skizzeFormen!.ueberdeckt).toEqual([])
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const nachher = await zip.file('xl/drawings/drawing9.xml')!.async('string')
    expect(nachher.startsWith(vorher.slice(0, vorher.indexOf('</xdr:wsDr>')))).toBe(true)
    const neu = nachher.slice(vorher.indexOf('</xdr:wsDr>'), nachher.lastIndexOf('</xdr:wsDr>'))
    expect(neu).toContain('name="Hochbeet_3"')
    expect(neu).toContain('name="Holzpferd_Hinweis"')
  })

  it('bauFormenDrawing schreibt jede Form als Anker', async () => {
    const xml = bauFormenDrawing(formen, '<worksheet/>')
    expect([...xml.matchAll(ANKER_REGEX)]).toHaveLength(formen.length)
  })
})
