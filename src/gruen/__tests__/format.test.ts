import { describe, expect, it } from 'vitest'
import katalogRaw from '../../../data/katalog.json'
import type { Katalog, Position as KatalogPosition } from '@/katalog'
import { sucheKatalog } from '@/katalog'
import {
  gefundeneArt,
  kurzeAltersstufe,
  kurzeBezeichnung,
  leseZahl,
  leseZahlOder,
  variantenMerkmale,
  zahlDe,
  zahlFuerEingabe,
} from '../format'

const pos = (katalogRaw as unknown as Katalog).positionen
const nachId = (id: string) => pos.find((p) => p.id === id) as KatalogPosition

describe('deutsche Zahlen', () => {
  it('liest Komma und Punkt', () => {
    expect(leseZahl('0,75')).toBe(0.75)
    expect(leseZahl('0.75')).toBe(0.75)
    expect(leseZahl(' 12 ')).toBe(12)
    expect(leseZahl('1.234,5')).toBe(1234.5)
    expect(leseZahl('3,5 €')).toBe(3.5)
    expect(leseZahl(',5')).toBe(0.5)
  })
  it('ungültig → NaN bzw. Ersatzwert', () => {
    expect(leseZahl('')).toBeNaN()
    expect(leseZahl('abc')).toBeNaN()
    expect(leseZahl('1,2,3')).toBeNaN()
    expect(leseZahlOder('', 1)).toBe(1)
    expect(leseZahlOder('2,5', 1)).toBe(2.5)
  })
  it('formatiert deutsch', () => {
    expect(zahlDe(0.75)).toBe('0,75')
    expect(zahlDe(1)).toBe('1')
    expect(zahlFuerEingabe(63.75)).toBe('63,75')
    expect(zahlFuerEingabe(1234.5)).toBe('1234,5')
  })
})

describe('Bezeichnungen', () => {
  it('kürzt Altersstufen', () => {
    expect(kurzeAltersstufe('5 bis 30 Jahre')).toBe('5–30 J.')
    expect(kurzeAltersstufe('bis 4 Jahre')).toBe('bis 4 J.')
    expect(kurzeAltersstufe('über 30 Jahre')).toBe('über 30 J.')
    expect(kurzeAltersstufe('1 Jahr')).toBe('1 J.')
  })

  it('Apfel Halbstamm → „Apfel, Halbstamm, 5–30 J.“', () => {
    const obst = nachId('aw-obstgehoelz')
    const v = obst.varianten!.find((x) => x.form === 'Halbstamm' && x.altersstufe === '5 bis 30 Jahre')
    expect(gefundeneArt(obst, 'Apfel')).toBe('Apfel')
    expect(kurzeBezeichnung(obst, v, 'Apfel')).toBe('Apfel, Halbstamm, 5–30 J.')
    expect(kurzeBezeichnung(obst, v)).toBe('Obstgehölz, Halbstamm, 5–30 J.')
  })

  it('Liguster → „Liguster-Hecke (Laub, einfache Art)“', () => {
    const hecke = nachId('aw-hecke')
    const v = hecke.varianten![0]
    expect(variantenMerkmale(v)).toBe('Laub, einfache Art')
    expect(gefundeneArt(hecke, 'liguster')).toBe('Liguster')
    expect(kurzeBezeichnung(hecke, v, 'Liguster')).toBe('Liguster-Hecke (Laub, einfache Art)')
    expect(kurzeBezeichnung(hecke, v)).toBe('Hecke, Laub, einfache Art')
  })

  it('Thuja/Lebensbaum liefert den gesuchten Teil', () => {
    const hecke = nachId('aw-hecke')
    expect(gefundeneArt(hecke, 'Lebensbaum')).toBe('Lebensbaum')
    expect(gefundeneArt(hecke, 'Thuja')).toBe('Thuja')
  })

  it('Synonyme zählen auch, fremde Begriffe nicht', () => {
    const regen = nachId('aa-regenwasserbehaelter')
    expect(gefundeneArt(regen, 'Regentonne')).toBe('Regentonne')
    expect(gefundeneArt(nachId('aw-obstgehoelz'), 'Hecke')).toBeUndefined()
    expect(gefundeneArt(nachId('aw-obstgehoelz'), '')).toBeUndefined()
  })

  it('Suche nach dem Positionsnamen behält den Namen („Rasen“ → nicht „Rasengräser“)', () => {
    const rasen = nachId('aw-rasen')
    expect(gefundeneArt(rasen, 'Rasen')).toBeUndefined()
    expect(gefundeneArt(rasen, 'rase')).toBeUndefined()
    expect(kurzeBezeichnung(rasen, undefined, gefundeneArt(rasen, 'Rasen'))).toBe('Rasen')
    // Wer die Art selbst nennt, bekommt sie weiterhin
    expect(gefundeneArt(rasen, 'Rasengräser')).toBe('Rasengräser')
    // Name plus Art: Name zählt nicht, die Art schon
    expect(gefundeneArt(nachId('aw-hecke'), 'Hecke Liguster')).toBe('Liguster')
    expect(gefundeneArt(nachId('aw-hecke'), 'Hecke')).toBeUndefined()
  })

  it('ohne Varianten bleibt die Grundbezeichnung', () => {
    const rasen = nachId('aw-rasen')
    expect(kurzeBezeichnung(rasen)).toBe(rasen.bezeichnung.replace(/\s*\(z\.\s*B\.[^)]*\)/g, ''))
  })

  it('Suche „Apfel Halbstamm“ liefert die Variante, die sich übernehmen lässt', () => {
    const t = sucheKatalog(pos, 'Apfel Halbstamm', { limit: 1 })[0]
    expect(t.position.id).toBe('aw-obstgehoelz')
    expect(t.variante?.form).toBe('Halbstamm')
  })
})
