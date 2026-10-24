// Bau-Teil aus der Bau-Excel übernehmen (Grün-Wertermittler bekommt die Bau-Excel): lesen, nichts doppelt,
// nichts überschrieben, Rundlauf in den Export.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { exportWep } from '@/export'
import { leseBauTeil, type BauTeil } from '@/export/bauTeilLesen'
import { neuerWep } from '@/model'
import { offeneBauZeilen, pruefeBau, uebernimmBau } from '../bauAbgleich'
import { erzeugeTestBauExcel } from '../testBauExcel'

let bytes: Uint8Array
let teil: BauTeil
const alle = new Set(['bauteile', 'beschreibung', 'beseitigung', 'nichtBeraeumt'] as const)
beforeAll(async () => {
  bytes = await erzeugeTestBauExcel({ bau: true })
  teil = await leseBauTeil(bytes)
})

describe('leseBauTeil', () => {
  it('liest Bauteile, Mängel, Beschreibung, nicht beräumt und Beseitigung', () => {
    expect(teil.bauteile.map((b) => [b.art, b.kuerzel, b.typ, b.baujahr, b.flaeche])).toEqual([
      ['laube', 'L', 'Doppelwand 8,01 - 10,00 cm', 1982, 19.43],
      ['anbau', 'A1', 'Stein 24,00 - 35,99 cm', 1983, 3.73],
      ['schuppen', 'S1+S2', 'Doppelwand bis 4,00 cm', 2000, 6.41],
    ])
    expect(teil.bauteile[0]).toMatchObject({ baujahrQuelle: 'lt. Bauschein', restnutzungsjahre: 10 })
    expect(teil.bauteile[0].maengel).toEqual([{ gruppe: 'dach', abzug: 8 }, { gruppe: 'fundament', abzug: 5 }])
    expect(teil.bauteile[1].maengel).toEqual([{ gruppe: 'eigen', abzug: 13 }]) // nur Gesamtabzug
    expect(teil.beschreibung).toBe('Laube L: Baujahr 1982\nDach: Pultdach mit Bitumenschweißbahn')
    expect(teil.nichtBeraeumt).toEqual({ m3: 3, preis: 100 })
    expect(teil.beseitigung).toEqual([
      { gegenstand: 'Rückbau Schuppen S1', menge: 3.93, einheit: 'm³', einzelpreis: 80, faktor: 1 },
      { gegenstand: 'Rückbau Schuppen S2', menge: 2.08, einheit: 'm³', einzelpreis: 50, faktor: 1.2 },
    ])
  })

  it('die leere Vorlage hat nichts zu übernehmen (Beispielwerte zählen nicht)', async () => {
    const leer = await leseBauTeil(readFileSync('docs/WEP_Vorlage.xlsx'))
    expect(leer).toEqual({ bauteile: [], beschreibung: '', beseitigung: [] })
  })
})

describe('Abgleich', () => {
  it('WEP ohne Bau-Teil: alles ist neu; Übernehmen legt den Bau-Teil an', () => {
    const w = neuerWep('2026-007')
    expect(offeneBauZeilen(pruefeBau(w, teil))).toBe(3 + 1 + 2 + 1)
    const neu = uebernimmBau(w, teil, alle)
    expect(neu.bau?.bauteile).toHaveLength(3)
    expect(neu.bau?.bauteile[0]).toMatchObject({ art: 'laube', typ: 'Doppelwand 8,01 - 10,00 cm', typManuell: true, flaeche: 19.43, flaecheManuell: true, restnutzungsjahre: 10, rnManuell: true })
    expect(neu.bau?.beseitigung).toHaveLength(2)
    expect(neu.bau?.nichtBeraeumt).toEqual({ aktiv: true, m3: 3, preis: 100 })
    expect(neu.bau?.beschreibungManuell).toBe(true)
    expect(offeneBauZeilen(pruefeBau(neu, teil))).toBe(0)
  })

  it('nur gewählte Gruppen; zweites Übernehmen ändert nichts; Vorhandenes bleibt', () => {
    const w = neuerWep('x')
    const nurBauteile = uebernimmBau(w, teil, new Set(['bauteile']))
    expect(nurBauteile.bau?.beseitigung).toEqual([])
    expect(uebernimmBau(nurBauteile, teil, new Set(['bauteile']))).toBe(nurBauteile)
    const eigen = { ...nurBauteile, bau: { ...nurBauteile.bau!, beschreibung: 'Meine Beschreibung' } }
    const mit = uebernimmBau(eigen, teil, alle)
    expect(mit.bau?.beschreibung).toBe('Meine Beschreibung')
    expect(mit.bau?.bauteile).toHaveLength(3)
  })
})

describe('Export', () => {
  it('Rundlauf: Bau-Excel → WEP → Export schreibt den Bau-Teil in dieselben Zellen zurück', async () => {
    const wep = uebernimmBau(neuerWep('2026-007'), teil, alle)
    const erg = await exportWep(wep, bytes.slice().buffer, { teil: 'beides' })
    const nachher = await leseBauTeil(await erg.blob.arrayBuffer())
    expect(nachher.bauteile.map((b) => [b.kuerzel, b.typ, b.baujahr, b.flaeche])).toEqual(teil.bauteile.map((b) => [b.kuerzel, b.typ, b.baujahr, b.flaeche]))
    expect(nachher.beseitigung).toEqual(teil.beseitigung)
    expect(nachher.beschreibung).toBe(teil.beschreibung)
  })
})
