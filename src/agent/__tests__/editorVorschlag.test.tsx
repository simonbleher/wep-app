// @vitest-environment node
/** Vorschlagsbalken, hervorgehobene Formen und Beschriftungen (aria) im Skizzen-Editor – statisch gerendert. Erfundene Daten. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AussehenPanel, SkizzeEditor } from '../../skizze/SkizzeEditor'
import { pruefeVorschlag } from '../vorschlag'
import { BEISPIEL_VORSCHLAG } from './beispiel'
import { testWep } from './testwep'

const wep = testWep()
const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
const html = (vorschlag: boolean) =>
  renderToStaticMarkup(
    createElement(SkizzeEditor, { wert: wep.skizze!, onAenderung: () => {}, vorschlag: vorschlag ? { elemente: g.elemente, modus: 'ergaenzen' } : null }),
  )

describe('Vorschlagsbalken', () => {
  it('zeigt „Vorschlag: N Elemente“ mit Übernehmen und Verwerfen als beschriftete Knöpfe in einer benannten Region', () => {
    const h = html(true)
    expect(h).toMatch(/<div role="region" aria-label="Vorschlag für die Skizze"[^>]*>/)
    expect(h).toContain('Vorschlag: 12 Elemente')
    expect(h).toMatch(/aria-label="Vorschlag übernehmen"/)
    expect(h).toMatch(/aria-label="Vorschlag verwerfen"/)
    expect(h).toContain('role="status"')
  })

  it('hebt die Formen des Vorschlags hervor (orange gestrichelter Rahmen je Element), ohne sie zur Skizze zu zählen', () => {
    const h = html(true)
    expect(h.match(/skizze-vorschlag-rahmen/g)).toHaveLength(12)
    expect(h).toContain('data-testid="skizze-vorschlag-formen"')
    // die Zeichenfläche zählt nur gespeicherte Elemente (1 vorhandener Strauch)
    expect(h).toContain('aria-label="Zeichenfläche der Skizze, 1 Elemente"')
  })

  it('ohne Vorschlag gibt es weder Balken noch Hervorhebung', () => {
    const h = html(false)
    expect(h).not.toContain('Vorschlag für die Skizze')
    expect(h).not.toContain('skizze-vorschlag-rahmen')
  })
})

describe('Beschriftungen und Rollen', () => {
  it('alle Werkzeuge, Schalter und Ansicht-Knöpfe haben klare Namen', () => {
    const h = html(false)
    expect(h).toContain('role="toolbar" aria-label="Zeichenwerkzeuge"')
    for (const label of ['Auswählen', 'Rechteck', 'Linie', 'Kreis', 'Text', 'Maßangabe', 'Symbol', 'Rückgängig', 'Wiederholen', 'Raster', 'Einrasten', 'Hineinzoomen', 'Herauszoomen', 'Ganze Skizze']) {
      expect(h, label).toContain(`aria-label="${label}"`)
    }
    expect(h).toMatch(/aria-label="Auswählen"[^>]*aria-pressed="true"/)
    expect(h).toContain('role="group" aria-label="Ansicht"')
    expect(h).toContain('role="img" aria-label="Zeichenfläche der Skizze')
  })

  it('Aussehen-Auswahl: Gruppen, Füllfarben mit Namen, „keine Füllung“, Linienart, Beschriftung', () => {
    const el = { id: 'r', typ: 'rechteck' as const, x: 1, y: 1, breite: 10, hoehe: 10, fuellung: '#C5E0B4', linienart: 'gestrichelt' as const }
    const h = renderToStaticMarkup(createElement(AussehenPanel, { el, onAendern: () => {} }))
    expect(h).toContain('role="group" aria-label="Aussehen: Rechteck"')
    expect(h).toContain('role="group" aria-label="Füllfarbe"')
    expect(h).toMatch(/aria-label="Füllfarbe: keine Füllung"[^>]*aria-pressed="false"/)
    expect(h).toMatch(/aria-label="Füllfarbe: Wiese"[^>]*aria-pressed="true"/)
    expect(h).toMatch(/aria-label="Füllfarbe: Weg"[^>]*aria-pressed="false"/)
    expect(h).toContain('aria-label="Linienfarbe: Hinweis rot"')
    expect(h).toMatch(/aria-label="Linienart: gestrichelt"[^>]*aria-pressed="true"/)
    expect(h).toMatch(/aria-label="Linienart: durchgezogen"[^>]*aria-pressed="false"/)
    expect(h).toContain('Beschriftung')
    // Vorgaben: Wiese erkennt man am Namen
    expect(h).toContain('>Wiese<')
  })

  it('Aussehen-Auswahl für Linien: Farbe, Linienart, Pfeilspitze', () => {
    const el = { id: 'l', typ: 'linie' as const, x1: 0, y1: 0, x2: 10, y2: 10, farbe: '#C00000', pfeil: true }
    const h = renderToStaticMarkup(createElement(AussehenPanel, { el, onAendern: () => {} }))
    expect(h).toContain('aria-label="Aussehen der Linie"')
    expect(h).toMatch(/aria-label="Linienfarbe: Hinweis rot"[^>]*aria-pressed="true"/)
    expect(h).toMatch(/aria-label="Pfeilspitze am Ende"[^>]*aria-pressed="true"/)
  })
})
