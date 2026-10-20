// @vitest-environment node
// Beta 3, Paket 4: Fotos – Registerkarte, Gruppen je Position, Eingabefelder für Kamera und Galerie.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, type Foto } from '@/model'
import type { FotoRecord } from '@/fotos/types'
import { FotoGruppe, FotosTab, type NachladeStand } from '../Fotos'
import { PositionBearbeiten } from '../PositionBearbeiten'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const foto = (id: string, positionId?: string, text?: string): Foto => ({
  id,
  ...(positionId ? { positionId } : {}),
  ...(text ? { text } : {}),
  aufgenommenAm: '2026-10-20T08:00:00.000Z',
  breite: 2000,
  hoehe: 1500,
  groesse: 300_000,
})
const keinNachladen: NachladeStand = { laeuft: false, fertig: 0, gesamt: 0, netz: 'ok', fehlend: 0, jetztLaden: () => {} }
const nichts = async () => {}

function wepMitFotos() {
  const w = neuerWep('2026-007')
  w.gruen.aufwuchs = [
    { id: 'p1', bezeichnung: 'Apfelbaum', anzahl: 1, einheit: 'Stück', einzelpreis: 10, preisManuell: false, hinweise: [] },
    { id: 'p2', bezeichnung: 'Birnbaum', anzahl: 1, einheit: 'Stück', einzelpreis: 10, preisManuell: false, hinweise: [] },
  ]
  w.fotos = [foto('g1'), foto('a1', 'p1', 'Astbruch'), foto('a2', 'p1')]
  return w
}

describe('Registerkarte „Fotos“', () => {
  it('zeigt Gesamtansicht und Positionen mit Fotos, dazu die Auswahl für weitere Positionen', () => {
    const h = render(createElement(FotosTab, { wep: wepMitFotos(), aendere: nichts, records: new Map(), nachladen: keinNachladen }))
    expect(h).toContain('3 Fotos')
    expect(h).toContain('Gesamtansicht')
    expect(h).toContain('01 Apfelbaum') // Positionsnummer wie im Export
    expect(h).toContain('Astbruch')
    // Position ohne Foto steht nur in der Auswahl
    expect(h).toContain('Foto zu einer Position')
    expect(h).toContain('<option value="p2">02 Birnbaum</option>')
    expect(h).not.toContain('<option value="p1">')
  })

  it('jede Gruppe hat „Foto aufnehmen“ (Kamera) und „Aus Galerie“ (mehrere)', () => {
    const h = render(createElement(FotosTab, { wep: wepMitFotos(), aendere: nichts, records: new Map(), nachladen: keinNachladen }))
    expect(h).toContain('Foto aufnehmen')
    expect(h).toContain('Aus Galerie')
    expect(h).toMatch(/accept="image\/\*" capture="environment"/)
    expect(h).toMatch(/multiple=""[^>]*accept="image\/\*"|accept="image\/\*"[^>]*multiple=""/)
  })

  it('noch nicht geladene Fotos zeigen einen Platzhalter, keine kaputten Bilder', () => {
    const records = new Map<string, FotoRecord>([
      ['a1', { key: '2026-007/a1', wepId: '2026-007', id: 'a1', hatDatei: false, hochgeladen: true, erstelltAm: 'x' }],
    ])
    const h = render(createElement(FotosTab, { wep: wepMitFotos(), aendere: nichts, records, nachladen: keinNachladen }))
    expect(h).toContain('Noch nicht geladen')
    expect(h).not.toContain('<img')
  })

  it('im Mobilfunk mit „nur WLAN“: Hinweis und „Jetzt laden“', () => {
    const h = render(
      createElement(FotosTab, {
        wep: wepMitFotos(),
        aendere: nichts,
        records: new Map(),
        nachladen: { ...keinNachladen, fehlend: 3, netz: 'nur-wlan' },
      }),
    )
    expect(h).toContain('3 Fotos sind nur in OneDrive. Sie werden im WLAN geladen.')
    expect(h).toContain('Jetzt laden')
  })

  it('ohne Positionen: Hinweis, aber die Gesamtansicht geht', () => {
    const h = render(createElement(FotosTab, { wep: neuerWep('2026-008'), aendere: nichts, records: new Map(), nachladen: keinNachladen }))
    expect(h).toContain('Noch keine Positionen')
    expect(h).toContain('Gesamtansicht')
  })
})

describe('Fotogruppe', () => {
  it('nur die Fotos der gewählten Position', () => {
    const h = render(
      createElement(FotoGruppe, { wep: wepMitFotos(), positionId: 'p1', aendere: nichts, records: new Map(), titel: 'Fotos zu dieser Position' }),
    )
    expect(h).toContain('Fotos zu dieser Position')
    expect(h).toContain('Astbruch')
    expect(h.match(/class="foto-kachel"/g)).toHaveLength(2)
  })
})

describe('Position ändern', () => {
  it('zeigt die Fotos der Position vor „Löschen“', () => {
    const w = wepMitFotos()
    const h = render(
      createElement(PositionBearbeiten, {
        abschnitt: 'aufwuchs',
        pos: w.gruen.aufwuchs[0],
        wep: w,
        onAbbrechen: () => {},
        onSpeichern: () => {},
        onLoeschen: () => {},
        fotos: createElement(FotoGruppe, { wep: w, positionId: 'p1', aendere: nichts, records: new Map(), titel: 'Fotos zu dieser Position' }),
      }),
    )
    expect(h.indexOf('Fotos zu dieser Position')).toBeGreaterThan(-1)
    expect(h.indexOf('Fotos zu dieser Position')).toBeLessThan(h.lastIndexOf('Löschen'))
  })
})
