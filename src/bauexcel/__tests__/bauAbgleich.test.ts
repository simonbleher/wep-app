// Bau-Teil aus der Bau-Excel übernehmen (Grün-Wertermittler bekommt die Bau-Excel): lesen, nichts doppelt,
// nichts überschrieben, Rundlauf in den Export.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { exportWep } from '@/export'
import { leseBauTeil, type BauTeil } from '@/export/bauTeilLesen'
import { neuerWep } from '@/model'
import { BAU_LISTEN, offeneBauZeilen, pruefeBau, uebernimmBau } from '../bauAbgleich'
import { erzeugeTestBauExcel } from '../testBauExcel'

let bytes: Uint8Array
let teil: BauTeil
const alle = new Set(BAU_LISTEN)
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
      ['gewaechshaus', 'GWH', '', 2018, 9.5], // Alter 8 Jahre im Wertjahr 2026
      ['vorplatz', 'Ü1', '', 2020, 4],
    ])
    expect(teil.bauteile[3]).toMatchObject({ nhk: 160, minderungProJahr: 5 })
    expect(teil.bauteile[4]).toMatchObject({ vorplatzLage: 'angebaut', vorplatzGuete: 'hochwertig', minderungProJahr: 5 })
    expect(teil.index).toEqual({ jahr: 2026, wert: 181.5 })
    expect(teil.abwasser).toEqual({
      art: 'grube',
      grube: { genehmigungNr: 'GN 12/90', grundwert: 370, typ: 'saniert', inhaltM3: 3, baujahr: 2010 },
      kanal: {},
    })
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
    expect(offeneBauZeilen(pruefeBau(w, teil))).toBe(5 + 1 + 2 + 1 + 1 + 1)
    const neu = uebernimmBau(w, teil, alle)
    expect(neu.bau?.bauteile).toHaveLength(5)
    expect(neu.bau?.bauteile[0]).toMatchObject({ art: 'laube', typ: 'Doppelwand 8,01 - 10,00 cm', typManuell: true, flaeche: 19.43, flaecheManuell: true, restnutzungsjahre: 10, rnManuell: true })
    expect(neu.bau?.beseitigung).toHaveLength(2)
    expect(neu.bau?.abwasser).toMatchObject({ art: 'grube', grube: { inhaltM3: 3, genehmigungNr: 'GN 12/90' } })
    expect(neu.bau?.index).toEqual({ jahr: 2026, wert: 181.5, quelle: 'Bau-Excel', manuell: true })
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
    expect(mit.bau?.bauteile).toHaveLength(5)
  })
})

describe('Export', () => {
  it('Rundlauf: Bau-Excel → WEP → Export schreibt den Bau-Teil in dieselben Zellen zurück', async () => {
    const wep = uebernimmBau(neuerWep('2026-007'), teil, alle)
    const erg = await exportWep(wep, bytes.slice().buffer, { teil: 'beides' })
    const nachher = await leseBauTeil(await erg.blob.arrayBuffer())
    // Laube, Anbau und Schuppen kommen unverändert zurück; Gewächshaus/Vorplatz rechnet der Export nach den Regeln (z. B. 24-m²-Grenze)
    // (Der Schuppen zählt neben der Laube nicht: seine Fläche steht danach nicht mehr in der Bewertung.)
    const haupt = (t: BauTeil) => t.bauteile.filter((b) => ['laube', 'anbau', 'schuppen'].includes(b.art)).map((b) => [b.kuerzel, b.typ, b.baujahr, b.art === 'schuppen' ? 0 : b.flaeche])
    expect(haupt(nachher)).toEqual(haupt(teil))
    expect(nachher.bauteile.map((b) => b.art)).toEqual(teil.bauteile.map((b) => b.art))
    expect(nachher.abwasser?.grube.inhaltM3).toBe(3)
    expect(nachher.beseitigung).toEqual(teil.beseitigung)
    expect(nachher.beschreibung).toBe(teil.beschreibung)
  })
})
