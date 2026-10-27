// @vitest-environment node
// Beta 4, Paket 1: Rolle schaltet Reiter frei; Marke für den bearbeiteten Teil.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { bereicheFuerRolle } from '../WepDetail'
import { TeilMarke } from '../ui'

const ids = (r: Parameters<typeof bereicheFuerRolle>[0]) => bereicheFuerRolle(r).map((b) => b.id)

describe('Reiter je Rolle', () => {
  it('Grün: Außenanlagen, Aufwuchs, Beseitigung, Skizze, Fotos, Formalien, Übersicht', () => {
    expect(ids('gruen')).toEqual(['formalien', 'aussenanlagen', 'aufwuchs', 'beseitigung', 'fotos', 'skizze', 'uebersicht'])
  })
  it('Bau: Baulichkeiten, Mängel, Abwasser, Beseitigung Bau, Skizze Bau, Rechner, Fotos, Formalien, Übersicht', () => {
    expect(ids('bau')).toEqual(['formalien', 'baulichkeiten', 'maengel', 'abwasser', 'beseitigungBau', 'fotos', 'skizzeBau', 'rechner', 'uebersicht'])
  })
  it('Beides: alles, ohne doppelte Reiter', () => {
    const alle = ids('beides')
    expect(alle).toHaveLength(13)
    expect(new Set(alle).size).toBe(13)
    expect(alle).toEqual(expect.arrayContaining([...ids('gruen'), ...ids('bau')]))
  })
  it('Marke zeigt den Teil', () => {
    expect(renderToStaticMarkup(createElement(TeilMarke, { rolle: 'bau' }))).toContain('>Bau<')
    expect(renderToStaticMarkup(createElement(TeilMarke, { rolle: 'beides' }))).toContain('Grün + Bau')
  })
})
