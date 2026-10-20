// @vitest-environment node
// Beta 3, Paket 3: eigene Positionen in der Suche, im Formular („als eigene Position merken“)
// und in der Verwaltung im Profil.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EigenePosition } from '@/katalog'
import { neuerWep } from '@/model'
import { EigenePositionen } from '../EigenePositionen'
import { PositionFormular } from '../PositionFormular'
import { gruppiere } from '../PositionHinzufuegen'
import { KATALOG_POSITIONEN } from '../katalogDaten'

const aufwuchs = KATALOG_POSITIONEN.filter((p) => p.abschnitt === 'III. Aufwuchs')
const meine = (bezeichnung: string, teil: Partial<EigenePosition> = {}): EigenePosition => ({
  id: bezeichnung.toLowerCase(),
  abschnitt: 'aufwuchs',
  bezeichnung,
  einheit: 'Stück',
  geaendertAm: '2026-10-20T08:00:00.000Z',
  ...teil,
})
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const wep = neuerWep('2026-001')

describe('Suche mit eigenen Positionen', () => {
  it('eigene Position steht vor dem gleich guten Katalogtreffer und hat keine Katalog-Position', () => {
    const gruppen = gruppiere(aufwuchs, 'rasen', [], [meine('Rasen', { einzelpreis: 0.4 })])
    expect(gruppen[0].eintraege).toHaveLength(1)
    expect(gruppen[0].eintraege[0].eigene?.bezeichnung).toBe('Rasen')
    expect(gruppen[0].eintraege[0].position).toBeUndefined()
    expect(gruppen[1].position.id).toBe('aw-rasen')
  })

  it('ohne Suchbegriff erscheinen die eigenen Positionen nach „zuletzt verwendet“', () => {
    const gruppen = gruppiere(aufwuchs, '', ['aw-rasen'], [meine('Zaubernuss')])
    expect(gruppen[0].position.id).toBe('aw-rasen')
    expect(gruppen[1].eintraege[0].eigene?.bezeichnung).toBe('Zaubernuss')
  })

  it('eine eigene Position ist auch über die gemerkte „zuletzt verwendet“-ID auffindbar', () => {
    const gruppen = gruppiere(aufwuchs, '', ['eigen-zaubernuss'], [meine('Zaubernuss')])
    expect(gruppen[0].eintraege[0].eigene?.bezeichnung).toBe('Zaubernuss')
  })
})

describe('Formular: als eigene Position merken', () => {
  it('neue Freitext-Position: Schalter „Als eigene Position merken“ ist standardmäßig an', () => {
    const h = render(createElement(PositionFormular, { auswahl: {}, wep, onFertig: () => {} }))
    expect(h).toContain('Als eigene Position merken')
    expect(h).toMatch(/role="switch"[^>]*checked=""/)
  })

  it('Katalog-Position, Ändern und bereits gemerkte Position: kein Schalter', () => {
    const katalog = render(createElement(PositionFormular, { auswahl: { position: aufwuchs[0] }, wep, onFertig: () => {} }))
    expect(katalog).not.toContain('Als eigene Position merken')
    const gemerkt = render(
      createElement(PositionFormular, { auswahl: { eigene: meine('Zaubernuss') }, wep, onFertig: () => {} }),
    )
    expect(gemerkt).not.toContain('Als eigene Position merken')
  })

  it('gemerkte Position füllt Bezeichnung, Einheit und Preis vor', () => {
    const h = render(
      createElement(PositionFormular, {
        auswahl: { eigene: meine('Zaubernuss', { einheit: 'm', einzelpreis: 40 }) },
        wep,
        onFertig: () => {},
      }),
    )
    expect(h).toContain('value="Zaubernuss"')
    expect(h).toContain('value="40"')
    expect(h).toContain('<option value="m" selected="">m</option>')
    expect(h).toContain('Eigene Position (gemerkt)')
  })
})

describe('Profil: Verwaltung', () => {
  it('ohne gemerkte Positionen steht ein Hinweis da', () => {
    const h = render(createElement(EigenePositionen, { id: 'x', konto: false }))
    expect(h).toContain('Eigene Positionen')
    expect(h).toContain('Noch keine')
    expect(h).toContain('Ohne Konto bleiben eigene Positionen auf diesem Gerät')
  })
})
