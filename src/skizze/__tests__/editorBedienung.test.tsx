// @vitest-environment node
// Beta 3, Paket 7: Bedienung der Skizze – Knöpfe, Startansicht, Skizzendaten bleiben unberührt.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SkizzeEditor } from '../SkizzeEditor'
import { ZOOM_MAX, zoomUmMitte, verschiebeUmPixel } from '../ansicht'
import { rasteLinienEnde, rasteVerschiebung, zielLinien } from '../einrasten'
import { alleTreffer } from '../geometrie'
import type { SkizzeDaten } from '../types'

const daten: SkizzeDaten = {
  breite: 800,
  hoehe: 600,
  raster: true,
  rasterGroesse: 40,
  elemente: [
    { id: 'a', typ: 'rechteck', x: 100, y: 100, breite: 200, hoehe: 100 },
    { id: 'b', typ: 'symbol', art: 'baum', x: 400, y: 300, breite: 34, hoehe: 42, beschriftung: 'Apfel' },
    { id: 'c', typ: 'linie', x1: 10, y1: 10, x2: 300, y2: 12 },
  ],
}

describe('SkizzeEditor: Bedienung', () => {
  const html = renderToStaticMarkup(createElement(SkizzeEditor, { wert: daten, onAenderung: () => {} }))

  it('zeigt zu Beginn die ganze Skizze', () => {
    expect(html).toContain('viewBox="0 0 800 600"')
  })

  it('bietet Zoomen, „Ganze Skizze“ und Einrasten an', () => {
    expect(html).toContain('aria-label="Hineinzoomen"')
    expect(html).toContain('aria-label="Herauszoomen"')
    expect(html).toContain('aria-label="Ganze Skizze"')
    expect(html).toContain('aria-label="Einrasten"')
  })

  it('Einrasten ist ohne gespeicherte Einstellung an', () => {
    expect(html).toMatch(/aria-label="Einrasten"[^>]*aria-pressed="true"/)
  })

  it('Rückgängig/Wiederholen bleiben aus, solange nichts geändert wurde', () => {
    expect(html).toMatch(/aria-label="Rückgängig"[^>]*disabled/)
  })
})

describe('Ansicht und Einrasten ändern die Skizzendaten nie', () => {
  it('Zoomen, Verschieben, Einrasten und Treffersuche lassen die Daten unverändert', () => {
    const vorher = JSON.stringify(daten)
    const kasten = { left: 0, top: 0, width: 400, height: 300 }
    const f = { breite: 800, hoehe: 600 }
    const a = verschiebeUmPixel(zoomUmMitte({ zoom: 1, x: 0, y: 0 }, 3, f, kasten), 20, 20, f, kasten)
    expect(a.zoom).toBeLessThanOrEqual(ZOOM_MAX)
    const ziele = zielLinien(daten.elemente, new Set(['b']), 800, 600)
    rasteVerschiebung(daten.elemente[1], 5, 5, ziele, 10)
    rasteLinienEnde({ x: 0, y: 0 }, { x: 100, y: 4 }, ziele, 10)
    alleTreffer(daten.elemente, { x: 150, y: 150 }, 20)
    expect(JSON.stringify(daten)).toBe(vorher)
    // und die Ansicht gehört nicht in die Skizzendaten
    expect(Object.keys(daten).sort()).toEqual(['breite', 'elemente', 'hoehe', 'raster', 'rasterGroesse'])
  })
})
