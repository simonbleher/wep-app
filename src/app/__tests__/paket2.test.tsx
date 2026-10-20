// @vitest-environment node
// Beta 3, Paket 2: Hinweis bei Konflikten, Papierkorb-Zugang in der Navigation, keine Emojis,
// keine Reste der alten Regel „Löschen wird nicht abgeglichen“ in der Oberfläche.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep } from '@/model'
import type { KonfliktInfo } from '@/sync/types'
import { KonfliktHinweis, fassungInfo } from '../KonfliktHinweis'
import { HauptSeitenleiste } from '../ui'

const wep = neuerWep('2026-001')
wep.formalien.parzelle = 'Parzelle 42'

function hinweis(konflikt: KonfliktInfo): string {
  return renderToStaticMarkup(createElement(KonfliktHinweis, { wepId: '2026-001', wep, konflikt, onGeloest: () => {} }))
}

describe('KonfliktHinweis', () => {
  const andere = neuerWep('2026-001')
  andere.formalien.parzelle = 'Parzelle 43'
  const zwei: KonfliktInfo = {
    art: 'zwei-geraete',
    erkanntAm: '2026-10-20T10:00:00.000Z',
    geraet: 'Tablet',
    fassung: andere,
    fassungGeaendertAm: '2026-10-20T09:00:00.000Z',
    kopien: ['2026-001.konflikt-x.json'],
  }

  it('„Auf zwei Geräten geändert“ mit beiden Auswahlknöpfen und beiden Fassungen', () => {
    const html = hinweis(zwei)
    expect(html).toContain('Auf zwei Geräten geändert')
    expect(html).toContain('Diese Fassung behalten')
    expect(html).toContain('Andere Fassung übernehmen')
    expect(html).toContain('Parzelle 42')
    expect(html).toContain('Parzelle 43')
    expect(html).toContain('role="note"')
  })

  it('zeigt keine Gerätenamen (die sagen dem Nutzer nichts)', () => {
    expect(hinweis(zwei)).not.toContain('Tablet')
  })

  it('Gelöscht und danach geändert: WEP behalten / Doch löschen, Text je nach Seite', () => {
    const hier = hinweis({ art: 'geloescht-geaendert', erkanntAm: 'x', geraet: 'Tablet', geloeschtWo: 'hier', kopien: [] })
    expect(hier).toContain('Gelöscht und danach geändert')
    expect(hier).toContain('Du hast dieses WEP gelöscht')
    expect(hier).toContain('WEP behalten')
    expect(hier).toContain('Doch löschen')
    const anderswo = hinweis({ art: 'geloescht-geaendert', erkanntAm: 'x', geraet: 'Tablet', geloeschtWo: 'anderes-geraet', kopien: [] })
    expect(anderswo).toContain('auf einem anderen Gerät gelöscht')
  })

  it('fassungInfo zählt die Positionen', () => {
    expect(fassungInfo(wep)).toBe('Parzelle 42 · 0 Positionen')
    const eins = neuerWep('x')
    eins.gruen.beseitigungAA = [{ id: 'b', bezeichnung: 'Hecke', anzahl: 1, einheit: 'm', einzelpreis: 1, hinweise: [] } as never]
    expect(fassungInfo(eins)).toBe('1 Position')
  })
})

describe('Navigation', () => {
  it('Seitenleiste bietet den Papierkorb an und markiert ihn als aktiv', () => {
    const html = renderToStaticMarkup(
      createElement(HauptSeitenleiste, { aktiv: 'papierkorb', onProtokolle: () => {}, onPapierkorb: () => {}, onProfil: () => {} }),
    )
    expect(html).toContain('Papierkorb')
    expect(html).toMatch(/aria-current="page"[^>]*>(?:<svg[^>]*>.*?<\/svg>)<span>Papierkorb/)
  })

  it('ohne Papierkorb-Zugang (z. B. im Profil-Test) bleibt die Seitenleiste wie vorher', () => {
    const html = renderToStaticMarkup(createElement(HauptSeitenleiste, { aktiv: 'profil', onProtokolle: () => {}, onProfil: () => {} }))
    expect(html).not.toContain('Papierkorb')
  })
})

describe('Oberflächentexte', () => {
  const dateien = ['Papierkorb.tsx', 'KonfliktHinweis.tsx', 'Startseite.tsx', 'WepDetail.tsx']
  it('enthalten keine Emojis', () => {
    for (const d of dateien) {
      const text = readFileSync(new URL(`../${d}`, import.meta.url), 'utf8')
      expect(text, d).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })

  it('sprechen nicht mehr von „auf diesem Gerät gelöscht“', () => {
    const text = readFileSync(new URL('../WepDetail.tsx', import.meta.url), 'utf8')
    expect(text).not.toContain('auf diesem Gerät gelöscht')
    expect(text).toContain('Papierkorb')
  })
})
