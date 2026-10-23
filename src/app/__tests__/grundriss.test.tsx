// @vitest-environment node
// Beta 4, Paket 3: Reiter „Skizze Bau“ (Anzeige) und Massenberechnung. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, neueBauDaten, type Bauteil, type Wep } from '@/model'
import { SkizzeBauTab, Massenberechnung } from '../SkizzeBauTab'
import { GrundrissEditor } from '@/skizze/GrundrissEditor'
import { SkizzeEditor } from '@/skizze/SkizzeEditor'
import { leereSkizze } from '@/skizze/types'
import { neuesBauteil, bauFuerExport } from '../bauHelfer'
import { rechteckPunkte, DACHFORMEN, type GrundrissDaten } from '@/skizze/grundriss'
import { DachFelder } from '@/skizze/DachFelder'
import { DachSkizze } from '@/skizze/DachSkizze'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const nichts = async () => {}

const grundriss: GrundrissDaten = {
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteckPunkte(2, 2, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'S', punkte: rechteckPunkte(10, 8, 2.5, 2), hoehe: 2 },
    { id: 'g3', kuerzel: 'K', punkte: rechteckPunkte(2, 8, 3, 3) },
  ],
}

function wep(): Wep {
  const w = neuerWep('2026-854')
  w.bau = neueBauDaten()
  const laube: Bauteil = { ...neuesBauteil('laube', []), id: 'l1', flaeche: 20 }
  w.bau.bauteile.push(laube)
  w.grundriss = grundriss
  return w
}

describe('Reiter Skizze Bau', () => {
  it('leer: Editor mit Werkzeugen, Zoom, Einrasten, Maßketten; keine Massenberechnung', () => {
    const w = neuerWep('2026-855')
    const html = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(html).toContain('Skizze Bau')
    for (const label of ['Auswählen', 'Rechteck', 'Vieleck', 'Rückgängig', 'Wiederholen', 'Raster', 'Maßketten', 'Einrasten', 'Hineinzoomen', 'Herauszoomen', 'Ganze Skizze']) {
      expect(html, label).toContain(`aria-label="${label}"`)
    }
    expect(html).toContain('Noch kein Grundriss')
    expect(html).toContain('viewBox="0 0 800 600"')
    expect(html).not.toContain('Massenberechnung')
  })

  it('mit Grundriss: Kürzel und Fläche auf den Teilen, Maßketten, Massenberechnung mit Summen', () => {
    const html = render(createElement(SkizzeBauTab, { wep: wep(), aendere: nichts }))
    expect(html).toContain('24,00 m²')
    expect(html).toContain('>L<')
    expect(html).toContain('>3 m<') // Maßkette über alle Ecken: 2 → 5 → 8 …
    expect(html).toContain('3 Teile')
    expect(html).toContain('data-testid="massenberechnung"')
    expect(html).toContain('Satteldach · 2,2 m / 3,1 m')
    expect(html).toContain('63,60 m³')
    expect(html).toContain('Summe')
  })

  it('Hinweise der Massenberechnung stehen sichtbar da (Höhe fehlt)', () => {
    const html = render(createElement(Massenberechnung, { daten: grundriss, bauteile: wep().bau!.bauteile }))
    expect(html).not.toContain('S: ') // Schuppen hat Höhe, kein Hinweis
    expect(html).toContain('K: Höhe fehlt')
  })

  it('Rückgängig ist zu Beginn aus, Einrasten an', () => {
    const html = render(createElement(GrundrissEditor, { wert: grundriss, bauteile: [], onAenderung: () => {}, onNeuesBauteil: () => neuesBauteil('laube', []) }))
    expect(html).toMatch(/aria-label="Rückgängig"[^>]*disabled/)
    expect(html).toMatch(/aria-label="Einrasten"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/aria-label="Maßketten"[^>]*aria-pressed="true"/)
  })

  it('Maßketten lassen sich ausblenden', () => {
    const html = render(createElement(GrundrissEditor, { wert: { ...grundriss, massketten: false }, bauteile: [], onAenderung: () => {}, onNeuesBauteil: () => neuesBauteil('laube', []) }))
    expect(html).toMatch(/aria-label="Maßketten"[^>]*aria-pressed="false"/)
    expect(html).not.toContain('>3 m<')
  })
})

describe('Export-Vorbereitung und Grün-Skizze', () => {
  it('bauFuerExport übernimmt den Grundriss in die Bauteile', () => {
    const w = bauFuerExport(wep())
    expect(w.bau!.bauteile[0]).toMatchObject({ flaeche: 24, ausGrundriss: true })
  })

  it('die Grün-Skizze rendert wie vorher: kein Grundriss-Werkzeug, 800 × 600', () => {
    const html = render(createElement(SkizzeEditor, { wert: leereSkizze(), onAenderung: () => {} }))
    expect(html).not.toContain('Vieleck')
    expect(html).not.toContain('grundriss')
    expect(html).toContain('viewBox="0 0 800 600"')
    expect(html).toContain('aria-label="Symbol"')
  })

  it('das Wep-Objekt ohne Grundriss bleibt unverändert (kein neues Feld)', () => {
    expect(Object.keys(neuerWep('x')).sort()).toEqual(['formalien', 'gruen', 'id', 'skizze'])
  })
})

describe('Dachformen: Eingaben mit Erklär-Skizze (Beta 6, Paket 2)', () => {
  it('jede geneigte Form zeigt ihre Skizze mit Legende und genau ihre Felder', () => {
    const erwartet: Record<string, string[]> = {
      pult: ['Hohe Wand'],
      sattel: ['Firsthöhe'],
      walm: ['Firsthöhe', 'Firstlänge'],
      zelt: ['Höhe der Spitze'],
      krueppelwalm: ['Firsthöhe', 'Walmhöhe', 'Walmtiefe'],
      mansard: ['Firsthöhe', 'Knickhöhe', 'Knick-Einzug'],
    }
    for (const [form, felder] of Object.entries(erwartet)) {
      const html = render(createElement(DachFelder, { dachform: form as never, hoeheOben: undefined, dach: {}, onAendern: () => {} }))
      expect(html, form).toContain(`data-dachform="${form}"`)
      expect(html, form).toContain('<svg')
      for (const f of felder) expect(html, `${form}: ${f}`).toContain(`>${f} (m)<`)
      // keine fremden Zusatzfelder
      const alle = ['Firstlänge', 'Walmhöhe', 'Walmtiefe', 'Knickhöhe', 'Knick-Einzug']
      for (const f of alle.filter((x) => !felder.includes(x))) expect(html, `${form}: ${f}`).not.toContain(`>${f} (m)<`)
    }
  })
  it('Flachdach hat keine Dach-Eingaben; jede Form hat eine Skizze', () => {
    expect(render(createElement(DachFelder, { dachform: 'flach', hoeheOben: undefined, dach: {}, onAendern: () => {} }))).toBe('')
    for (const d of DACHFORMEN) {
      const html = render(createElement(DachSkizze, { form: d.id }))
      expect(html, d.id).toContain('<figcaption')
      expect(html, d.id).toContain(d.text)
    }
  })
  it('Skizze Bau zeigt Zusatzmaße der Form in der Massenberechnung', () => {
    const w = wep()
    w.grundriss = { teile: [{ id: 'w1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteckPunkte(0, 0, 8, 6), hoehe: 2.5, hoeheOben: 5, dachform: 'walm', firstLaenge: 2 }] }
    const html = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(html).toContain('Walmdach · 2,5 m / 5 m')
    expect(html).toContain('165,00 m³')
  })
})
