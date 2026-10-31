// Bäume: Vorschlag aus dem Maß – Stufen, Grenzen, Umrechnung, alte Daten. Erfundene Daten („Erika Musterfrau“).
import { describe, expect, it } from 'vitest'
import { neuerWep, type BeseitigungsPosition, type Position } from '@/model'
import {
  BAUM_BESEITIGUNG,
  alterHinweise,
  baumFaellenPreis,
  baumFaellenText,
  baumHinweise,
  durchmesserAusUmfang,
  fehlendeMasse,
  formAusBezeichnung,
  obstAltersstufe,
  obstBezeichnung,
  obstFormVarianten,
  obstHoechstwert,
  stammumfangVon,
  umfangAusDurchmesser,
} from '../baumMass'
import { berechnePreisvorschlag } from '../preisvorschlag'
import katalog from '../../../data/katalog.json'

const obst = katalog.positionen.find((p) => p.id === 'aw-obstgehoelz')!.varianten!

const pos = (teil: Partial<Position>): Position => ({
  id: 'p1',
  bezeichnung: 'Apfel',
  anzahl: 1,
  einheit: 'Stück',
  zustand: 'gut',
  einzelpreis: 0,
  preisManuell: false,
  hinweise: [],
  ...teil,
})
const bes = (teil: Partial<BeseitigungsPosition>): BeseitigungsPosition => ({ id: 'b1', gegenstand: 'Baum fällen', menge: 1, einheit: 'Stück', einzelpreis: 0, faktor: 1, ...teil })

describe('Staffel „Baum fällen“ (BewRL S. 20–21)', () => {
  it('steht im Katalog wie in der Richtlinie: 13 Stufen von 75 € bis 1.250 €', () => {
    expect(BAUM_BESEITIGUNG.seite).toBe(20)
    expect(BAUM_BESEITIGUNG.stufen.map((s) => [s.bis ?? `>${s.ueber}`, s.hoechstwert])).toEqual([
      [30, 75], [40, 160], [50, 245], [60, 330], [70, 415], [80, 500], [90, 600],
      [100, 700], [110, 800], [120, 900], [130, 1000], [140, 1100], ['>140', 1250],
    ])
  })

  it('jede Stufe: Mitte und Grenze', () => {
    expect(baumFaellenPreis(1)).toBe(75)
    expect(baumFaellenPreis(25)).toBe(75)
    expect(baumFaellenPreis(85)).toBe(600)
    expect(baumFaellenPreis(135)).toBe(1100)
    expect(baumFaellenPreis(300)).toBe(1250)
  })

  it('Grenzfälle nach Wortlaut: „bis 30 cm“ schließt 30 ein, „größer 140 cm“ beginnt über 140', () => {
    expect(baumFaellenPreis(30)).toBe(75)
    expect(baumFaellenPreis(30.1)).toBe(160)
    expect(baumFaellenPreis(140)).toBe(1100)
    expect(baumFaellenPreis(140.1)).toBe(1250)
  })

  it('ohne gültiges Maß kein Vorschlag', () => {
    for (const m of [undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(baumFaellenPreis(m)).toBeUndefined()
  })

  it('Durchmesser → Umfang = π × d, auf 0,1 cm gerundet; die Stufe folgt dem angezeigten Umfang', () => {
    expect(umfangAusDurchmesser(27)).toBe(84.8)
    expect(durchmesserAusUmfang(84.8)).toBe(27)
    // 9,55 cm → 30,0 cm (gerundet) → noch „bis 30 cm“
    expect(umfangAusDurchmesser(9.55)).toBe(30)
    expect(stammumfangVon(bes({ baum: { durchmesserCm: 9.55 } }))).toBe(30)
    expect(baumFaellenPreis(stammumfangVon(bes({ baum: { durchmesserCm: 9.55 } })))).toBe(75)
    expect(baumFaellenPreis(stammumfangVon(bes({ baum: { durchmesserCm: 9.6 } })))).toBe(160)
    // Gespeicherter Umfang hat Vorrang vor dem Durchmesser
    expect(stammumfangVon(bes({ baum: { stammumfangCm: 85, durchmesserCm: 27 } }))).toBe(85)
  })

  it('Gegenstand trägt das Maß für Protokoll, PDF und Excel', () => {
    expect(baumFaellenText('Birke', 85)).toBe('Birke fällen inkl. Wurzelstock, StU 85 cm')
    expect(baumFaellenText(' ', 84.8)).toBe('Baum fällen inkl. Wurzelstock, StU 84,8 cm')
    expect(baumFaellenText('Birke', undefined)).toBe('Birke fällen inkl. Wurzelstock, StU fehlt')
  })

  it('Hinweise: „Maß fehlt“ als Warnung, sonst Stufe als Info; andere Positionen ohne Hinweis', () => {
    expect(baumHinweise(bes({ baum: {} }))[0]).toMatchObject({ schwere: 'warnung' })
    expect(baumHinweise(bes({ baum: {} }))[0]!.text).toMatch(/Maß fehlt/)
    expect(baumHinweise(bes({ baum: { stammumfangCm: 85 } }))[0]).toMatchObject({ schwere: 'info' })
    expect(baumHinweise(bes({ baum: { stammumfangCm: 85 } }))[0]!.text).toMatch(/bis 90 cm.*600/)
    expect(baumHinweise(bes({}))).toEqual([])
  })
})

describe('Obstgehölze nach Alter (BewRL S. 16)', () => {
  it('Altersstufen in vollen Jahren; genau 30 Jahre = „5 bis 30“ (vom BV bestätigt)', () => {
    expect(obstAltersstufe(0)).toBe('bis 4 Jahre')
    expect(obstAltersstufe(4)).toBe('bis 4 Jahre')
    expect(obstAltersstufe(4.9)).toBe('bis 4 Jahre')
    expect(obstAltersstufe(5)).toBe('5 bis 30 Jahre')
    expect(obstAltersstufe(30)).toBe('5 bis 30 Jahre')
    expect(obstAltersstufe(31)).toBe('über 30 Jahre')
    expect(obstAltersstufe(undefined)).toBeUndefined()
    expect(obstAltersstufe(-1)).toBeUndefined()
  })

  it('Höchstwert aus Baumform und Alter', () => {
    expect(obstHoechstwert(obst, 'Halbstamm', 3)).toBe(35)
    expect(obstHoechstwert(obst, 'Halbstamm', 12)).toBe(85)
    expect(obstHoechstwert(obst, 'Halbstamm', 40)).toBe(150)
    expect(obstHoechstwert(obst, 'Spalier', 31)).toBe(180)
    expect(obstHoechstwert(obst, 'Halbstamm', undefined)).toBeUndefined()
    expect(obstHoechstwert(obst, undefined, 12)).toBeUndefined()
  })

  it('Suche zeigt je Baumform eine Zeile (bis größter Wert); Form aus alter Bezeichnung', () => {
    expect(obstFormVarianten(obst)).toEqual([
      { form: 'Buschbaum', hoechstwert: 85 },
      { form: 'Halbstamm', hoechstwert: 150 },
      { form: 'Hochstamm', hoechstwert: 170 },
      { form: 'Säule', hoechstwert: 85 },
      { form: 'Spalier', hoechstwert: 180 },
    ])
    expect(formAusBezeichnung(obst, 'Apfel, Halbstamm, 5–30 J.')).toBe('Halbstamm')
    expect(formAusBezeichnung(obst, 'Kirschbaum, alt')).toBeUndefined()
    expect(obstBezeichnung('Apfel', 'Halbstamm', 12.6)).toBe('Apfel, Halbstamm, 12 J.')
    expect(obstBezeichnung('Apfel', 'Halbstamm', undefined)).toBe('Apfel, Halbstamm')
  })

  it('Pflichtmaß: neue Position ohne Alter → kein Vorschlag und Warnung; mit Alter → Höchstwert × Zustand', () => {
    const ohne = pos({ katalogId: 'aw-obstgehoelz', baumform: 'Halbstamm' })
    expect(berechnePreisvorschlag(ohne)).toBe(0)
    expect(berechnePreisvorschlag({ ...ohne, zustand: 'schlecht' })).toBe(0)
    expect(alterHinweise(ohne)[0]).toMatchObject({ schwere: 'warnung' })
    const mit = pos({ katalogId: 'aw-obstgehoelz', baumform: 'Halbstamm', alterJahre: 12, hoechstwert: 85 })
    expect(berechnePreisvorschlag(mit)).toBe(63.75)
    expect(alterHinweise(mit)[0]).toMatchObject({ schwere: 'info' })
    expect(alterHinweise({ ...mit, alterJahre: 30 })).toEqual([{ schwere: 'info', text: 'Alter 30 Jahre → Altersstufe „5 bis 30 Jahre“ (BewRL S. 16).' }])
  })

  it('alte Positionen ohne Baumform bleiben unverändert (Vorschlag aus der Variante), nur Info-Hinweis', () => {
    const alt = pos({ katalogId: 'aw-obstgehoelz', bezeichnung: 'Apfel, Halbstamm, 5–30 J.', hoechstwert: 85 })
    expect(berechnePreisvorschlag(alt)).toBe(63.75)
    expect(alterHinweise(alt)).toEqual([expect.objectContaining({ schwere: 'info' })])
  })
})

describe('Geschützter Baum (BewRL S. 16)', () => {
  it('fest 1,00 € je Stück, unabhängig vom Zustand', () => {
    for (const zustand of ['sehr gut', 'gut', 'mittel', 'schlecht', undefined] as const) {
      expect(berechnePreisvorschlag(pos({ katalogId: 'aw-baum-geschuetzt', hoechstwert: 1, zustand }))).toBe(1)
    }
  })
})

describe('Vor der Abgabe', () => {
  it('listet Bäume ohne Pflichtmaß; alte Positionen und Bäume mit Maß nicht', () => {
    const w = neuerWep('2026-901')
    w.formalien.unterpaechter = 'Erika Musterfrau'
    w.gruen.aufwuchs = [
      pos({ id: 'a1', katalogId: 'aw-obstgehoelz', bezeichnung: 'Apfel, Halbstamm', baumform: 'Halbstamm' }),
      pos({ id: 'a2', katalogId: 'aw-obstgehoelz', bezeichnung: 'Birne, Halbstamm, 5–30 J.', hoechstwert: 85 }),
      pos({ id: 'a3', katalogId: 'aw-obstgehoelz', bezeichnung: 'Pflaume, Busch, 7 J.', baumform: 'Buschbaum', alterJahre: 7 }),
    ]
    w.gruen.beseitigungAA = [
      bes({ id: 'b1', gegenstand: 'Birke fällen inkl. Wurzelstock, StU fehlt', baum: { art: 'Birke' } }),
      bes({ id: 'b2', gegenstand: 'Fichte fällen inkl. Wurzelstock, StU 85 cm', baum: { stammumfangCm: 85 } }),
      bes({ id: 'b3', gegenstand: 'Japanischer Knöterich entfernen' }),
    ]
    expect(fehlendeMasse(w)).toEqual(['Aufwuchs: „Apfel, Halbstamm“ – Alter fehlt', 'Beseitigung: „Birke fällen inkl. Wurzelstock, StU fehlt“ – Stammumfang fehlt'])
    expect(fehlendeMasse(neuerWep('leer'))).toEqual([])
  })
})
