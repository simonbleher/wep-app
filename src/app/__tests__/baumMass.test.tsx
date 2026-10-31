// @vitest-environment node
// Bäume: Formular zeigt das Pflichtmaß (Alter bzw. Stammumfang/Durchmesser), den Vorschlag aus der Staffel und
// „Maß fehlt“; alte Positionen bleiben unverändert. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, type BeseitigungsPosition, type Position } from '@/model'
import { PositionFormular } from '../PositionFormular'
import { BeseitigungFormular } from '../BeseitigungFormular'
import { MassFehltHinweis } from '../MassFehltHinweis'
import { KATALOG_POSITIONEN } from '../katalogDaten'

const obst = KATALOG_POSITIONEN.find((p) => p.id === 'aw-obstgehoelz')!
const geschuetzt = KATALOG_POSITIONEN.find((p) => p.id === 'aw-baum-geschuetzt')!
const wep = neuerWep('2026-903')
const pos = (p: Partial<Position>): Position => ({ id: 'p', bezeichnung: '', anzahl: 1, einheit: 'Stück', zustand: 'gut', einzelpreis: 0, preisManuell: false, hinweise: [], ...p })
const formular = (props: Partial<Parameters<typeof PositionFormular>[0]>) =>
  renderToStaticMarkup(createElement(PositionFormular, { auswahl: {}, wep, onFertig: () => {}, ...props }))
const beseitigung = (props: Partial<Parameters<typeof BeseitigungFormular>[0]>) =>
  renderToStaticMarkup(createElement(BeseitigungFormular, { onAbbrechen: () => {}, onFertig: () => {}, ...props }))

describe('Obstgehölz: Alter als Pflichtangabe', () => {
  it('neu: Feld „Alter in Jahren“, ohne Alter kein Vorschlag', () => {
    const html = formular({ auswahl: { position: obst, variante: { form: 'Halbstamm', hoechstwert: 150 }, art: 'Apfel' } })
    expect(html).toContain('Alter in Jahren (Pflichtangabe)')
    expect(html).toContain('value="Apfel, Halbstamm"')
    expect(html).toContain('Maß fehlt: Alter eintragen')
    expect(html).toMatch(/Maß fehlt: Alter in Jahren eintragen/)
  })

  it('mit Alter: Stufe und Höchstwert direkt (12 J. → bis 85 €, × 0,75 = 63,75 €)', () => {
    const html = formular({ bearbeiten: pos({ katalogId: obst.id, bezeichnung: 'Apfel, Halbstamm, 12 J.', baumform: 'Halbstamm', alterJahre: 12, hoechstwert: 85, einzelpreis: 63.75 }) })
    expect(html).toContain('Halbstamm, 12 Jahre → bis 85,00')
    expect(html).toContain('63,75')
    expect(html).not.toContain('Maß fehlt')
  })

  it('alte Position ohne Alter: Vorschlag aus der Variante bleibt, Alter lässt sich nachtragen', () => {
    const html = formular({ bearbeiten: pos({ katalogId: obst.id, bezeichnung: 'Birne, Halbstamm, 5–30 J.', hoechstwert: 85, einzelpreis: 63.75 }) })
    expect(html).toContain('Alter in Jahren (Pflichtangabe)')
    expect(html).toContain('Höchstwert 85,00')
    expect(html).not.toContain('Maß fehlt: Alter eintragen')
  })

  it('geschützter Baum: fest 1,00 €', () => {
    const html = formular({ auswahl: { position: geschuetzt } })
    expect(html).toContain('fest 1,00 € je Stück')
    expect(html).not.toContain('Alter in Jahren')
  })
})

describe('Beseitigung: Vorlage „Baum fällen“', () => {
  it('Grün bietet die Vorlage an, Bau nicht', () => {
    expect(beseitigung({ baumVorlage: true })).toContain('Vorlage „Baum fällen“')
    expect(beseitigung({})).not.toContain('Baum fällen')
  })

  it('mit Maß: Umfang, Durchmesser, Stufe und Satz', () => {
    const b: BeseitigungsPosition = { id: 'b', gegenstand: 'Birke fällen inkl. Wurzelstock, StU 85 cm', menge: 1, einheit: 'Stück', einzelpreis: 600, faktor: 1, baum: { art: 'Birke', stammumfangCm: 85 } }
    const html = beseitigung({ baumVorlage: true, bearbeiten: b })
    expect(html).toContain('Stammumfang in 1,30 m Höhe (cm, Pflichtangabe)')
    expect(html).toContain('value="85"')
    expect(html).toMatch(/Stammumfang 85 cm · Durchmesser 27,1 cm → Stufe „bis 90 cm“: bis 600,00/)
    expect(html).toContain('value="600"')
  })

  it('als Durchmesser eingegeben: Feld zeigt den Durchmesser', () => {
    const b: BeseitigungsPosition = { id: 'b', gegenstand: 'Baum fällen inkl. Wurzelstock, StU 84,8 cm', menge: 1, einheit: 'Stück', einzelpreis: 600, faktor: 1, baum: { stammumfangCm: 84.8, durchmesserCm: 27 } }
    const html = beseitigung({ baumVorlage: true, bearbeiten: b })
    expect(html).toContain('Durchmesser in 1,30 m Höhe (cm, Pflichtangabe)')
    expect(html).toContain('value="27"')
    expect(html).toContain('Stammumfang 84,8 cm · Durchmesser 27 cm')
  })

  it('ohne Maß: Hinweis, speicherbar', () => {
    const b: BeseitigungsPosition = { id: 'b', gegenstand: 'Birke fällen inkl. Wurzelstock, StU fehlt', menge: 1, einheit: 'Stück', einzelpreis: 0, faktor: 1, baum: { art: 'Birke' } }
    const html = beseitigung({ baumVorlage: true, bearbeiten: b })
    expect(html).toContain('Maß fehlt – ohne Maß kein Vorschlag. Speichern geht trotzdem.')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Speichern/)
  })
})

describe('Warnung vor der Abgabe', () => {
  it('nennt die Positionen ohne Maß, sonst nichts', () => {
    const w = neuerWep('2026-904')
    expect(renderToStaticMarkup(createElement(MassFehltHinweis, { wep: w }))).toBe('')
    w.gruen.beseitigungAA = [{ id: 'b', gegenstand: 'Birke fällen inkl. Wurzelstock, StU fehlt', menge: 1, einheit: 'Stück', einzelpreis: 0, faktor: 1, baum: { art: 'Birke' } }]
    const html = renderToStaticMarkup(createElement(MassFehltHinweis, { wep: w }))
    expect(html).toContain('Maß fehlt')
    expect(html).toContain('Stammumfang fehlt')
  })
})
