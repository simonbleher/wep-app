// @vitest-environment node
// Umbau im Entwurfs-Stil (Beta 2, Schritt 4, Teil A): Positionsliste, Varianten in den
// Suchtreffern, Löschen nicht mehr in der WEP-Liste, keine Emojis.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, type Position } from '@/model'
import { PositionenAbschnitt } from '../Positionen'
import { gruppiere } from '../PositionHinzufuegen'
import { Startseite } from '../Startseite'
import { KATALOG_POSITIONEN } from '../katalogDaten'

const pos = (p: Partial<Position>): Position => ({
  id: 'p',
  bezeichnung: '',
  anzahl: 1,
  einheit: 'Stück',
  zustand: 'gut',
  einzelpreis: 0,
  preisManuell: false,
  hinweise: [],
  ...p,
})

describe('Positionsliste Aufwuchs', () => {
  const wep = neuerWep('2026-001')
  wep.gruen.aufwuchs = [
    pos({ id: 'a', katalogId: 'aw-rasen', bezeichnung: 'Rasen', anzahl: 120, einheit: 'm²', einzelpreis: 0.38 }),
    pos({ id: 'b', bezeichnung: 'Zaubernuss', anzahl: 1, einzelpreis: 40, preisManuell: true }),
  ]
  const html = renderToStaticMarkup(
    createElement(PositionenAbschnitt, { wep, abschnitt: 'aufwuchs', onSpeichern: async () => {}, onHinzufuegen: () => {}, onBearbeiten: () => {} }),
  )

  it('zeigt Positionen, Warnung, „manuell“ und die Summe', () => {
    expect(html).toContain('2 Positionen')
    expect(html).toContain('Rasen/Wiese: Nur bis max. 100')
    expect(html).toContain('class="warnung"')
    expect(html).toContain('manuell')
    // 120 × 0,38 + 40 = 85,60
    expect(html).toMatch(/Summe Aufwuchs<\/span><span role="cell" class="zahl">85,60/)
  })

  it('Löschen steht nicht in der Liste, sondern im Formular der Position (umbauB.test.tsx)', () => {
    expect(html).not.toMatch(/löschen/i)
  })
})

describe('Position hinzufügen: Varianten direkt in den Suchtreffern', () => {
  const aufwuchs = KATALOG_POSITIONEN.filter((p) => p.abschnitt === 'III. Aufwuchs')

  it('„apfel“ listet alle Varianten des Obstgehölzes einzeln', () => {
    const gruppen = gruppiere(aufwuchs, 'apfel', [])
    const obst = gruppen.find((g) => g.position.varianten && g.eintraege.length > 1)
    expect(obst).toBeDefined()
    expect(obst!.art).toBe('Apfel')
    expect(obst!.eintraege.every((e) => e.variante)).toBe(true)
    expect(obst!.eintraege.length).toBe(obst!.position.varianten!.length)
  })

  it('ohne Varianten gibt es genau einen Eintrag', () => {
    const rasen = gruppiere(aufwuchs, 'rasen', []).find((g) => g.position.id === 'aw-rasen')
    expect(rasen?.eintraege).toHaveLength(1)
    expect(rasen?.eintraege[0].variante).toBeUndefined()
  })
})

describe('WEP-Liste', () => {
  it('hat keinen Löschen-Knopf mehr', () => {
    const html = renderToStaticMarkup(
      createElement(Startseite, { konto: null, verfuegbar: true, onProfil: () => {}, onOeffnen: () => {} }),
    )
    expect(html).toContain('Protokolle')
    expect(html).toContain('Neues WEP')
    expect(html).not.toMatch(/löschen/i)
  })
})

describe('Keine Emojis in der App', () => {
  const ordner = join(__dirname, '..')
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith('.tsx'))) {
    it(datei, () => {
      expect(readFileSync(join(ordner, datei), 'utf-8')).not.toMatch(/\p{Extended_Pictographic}/u)
    })
  }
})
