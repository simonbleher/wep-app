// Außenanlagen, Aufwuchs und Beseitigung aus der Bau-Excel übernehmen: lesen, nichts doppelt, nichts überschreiben,
// neue WEPs aus der Bau-Excel sind gleich gefüllt, und der Export schreibt die Zeilen in dieselben Zellen zurück.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { leseBauGruen, type BauGruen } from '@/export/bauExcelLesen'
import { exportWep } from '@/export'
import { neuerWep } from '@/model'
import { LEERES_PROFIL } from '@/profil'
import { fuelleLeereListen, offeneZeilen, pruefeGruen, uebernimmGruen } from '../gruenAbgleich'
import { legeWepAusBauExcelAn } from '../neu'
import { erzeugeTestBauExcel } from '../testBauExcel'

let bytes: Uint8Array
let gruen: BauGruen
beforeAll(async () => {
  bytes = await erzeugeTestBauExcel({ gruen: true })
  gruen = await leseBauGruen(bytes)
})

describe('leseBauGruen', () => {
  it('liest Außenanlagen, Aufwuchs I und II und Beseitigung Abschnitt 2', () => {
    expect(gruen.aussenanlagen).toEqual([
      { anzahl: 12, einheit: 'm', bezeichnung: 'Maschendrahtzaun', einzelpreis: 4 },
      { anzahl: 2, einheit: 'Stück', bezeichnung: 'Regenwassertonne', einzelpreis: 15 },
      { anzahl: 1, einheit: 'Stück', bezeichnung: 'Kompostbehälter', einzelpreis: 20 },
    ])
    expect(gruen.aufwuchs.map((p) => p.bezeichnung)).toEqual(['Apfel, Halbstamm', 'Hecke Liguster', 'Rosen', 'Hochbeet'])
    expect(gruen.aufwuchs[2].einzelpreis).toBe(0) // in der Bau-Excel ohne Preis
    expect(gruen.beseitigungAA).toEqual([
      { gegenstand: 'Blaufichte fällen', menge: 1, einheit: 'Stück', einzelpreis: 120, faktor: 1.2 },
      { gegenstand: 'Wurzelstock roden', menge: 1, einheit: 'Stück', einzelpreis: 60, faktor: 1 },
    ])
    expect(gruen.beseitigungBegruendung).toBe('Fichte am Zaun, schwer erreichbar')
  })

  it('die leere Vorlage hat nichts zu übernehmen (vorbelegte Menge/Faktor sind keine Zeilen)', async () => {
    const leer = await leseBauGruen(readFileSync('docs/WEP_Vorlage.xlsx'))
    expect(leer).toEqual({ aussenanlagen: [], aufwuchs: [], beseitigungAA: [] })
  })
})

describe('Abgleich', () => {
  it('leeres WEP: alles ist neu und die leeren Listen werden gefüllt', () => {
    const w = neuerWep('2026-007')
    expect(offeneZeilen(pruefeGruen(w, gruen))).toBe(3 + 4 + 2)
    const neu = fuelleLeereListen(w, gruen)
    expect(neu.gruen.aussenanlagen).toHaveLength(3)
    expect(neu.gruen.aufwuchs).toHaveLength(4)
    expect(neu.gruen.beseitigungAA).toHaveLength(2)
    expect(neu.gruen.aufwuchs.every((p) => p.preisManuell)).toBe(true)
    expect(neu.gruen.aufwuchs[1]).toMatchObject({ bezeichnung: 'Hecke Liguster', anzahl: 8, einheit: 'm', einzelpreis: 5 })
    expect(neu.gruen.beseitigungAA[0]).toMatchObject({ faktor: 1.2, begruendung: 'Fichte am Zaun, schwer erreichbar' })
    expect(neu.gruen.beseitigungAA[1].begruendung).toBeUndefined()
    expect(offeneZeilen(pruefeGruen(neu, gruen))).toBe(0)
  })

  it('zweites Übernehmen legt nichts doppelt an', () => {
    const einmal = fuelleLeereListen(neuerWep('x'), gruen)
    const zweimal = uebernimmGruen(einmal, gruen, new Set(['aussenanlagen', 'aufwuchs', 'beseitigungAA']))
    expect(zweimal).toBe(einmal)
  })

  it('vorhandene Einträge bleiben; fehlende Zeilen kommen nur auf Wunsch dazu', () => {
    const w = neuerWep('x')
    w.gruen.aufwuchs = [{ id: 'mein', bezeichnung: 'Hecke Liguster', anzahl: 8, einheit: 'm', einzelpreis: 99, preisManuell: true, hinweise: [] }]
    const auto = fuelleLeereListen(w, gruen)
    expect(auto.gruen.aufwuchs).toEqual(w.gruen.aufwuchs) // Aufwuchs war nicht leer: nichts still hinzugefügt
    expect(auto.gruen.aussenanlagen).toHaveLength(3) // leere Liste wird gefüllt
    const ab = pruefeGruen(auto, gruen).find((l) => l.liste === 'aufwuchs')!
    expect(ab.gleich).toBe(1)
    expect(ab.neu.map((z) => z.text)).toEqual(['Apfel, Halbstamm', 'Rosen', 'Hochbeet'])
    const mit = uebernimmGruen(auto, gruen, new Set(['aufwuchs']))
    expect(mit.gruen.aufwuchs).toHaveLength(4)
    expect(mit.gruen.aufwuchs[0]).toBe(w.gruen.aufwuchs[0]) // der Preis 99 € des Nutzers bleibt
  })

  it('zwei gleiche Zeilen in der Bau-Excel gehen nicht verloren', () => {
    const doppelt: BauGruen = { ...gruen, aussenanlagen: [gruen.aussenanlagen[0], gruen.aussenanlagen[0]] }
    expect(fuelleLeereListen(neuerWep('x'), doppelt).gruen.aussenanlagen).toHaveLength(2)
  })
})

describe('Neues WEP aus Bau-Excel und Export', () => {
  it('„Neues WEP aus Bau-Excel“ übernimmt auch die Positionen', async () => {
    let gespeichert = neuerWep('x')
    const wep = await legeWepAusBauExcelAn({
      id: '2026-007',
      datei: new Blob([bytes.slice().buffer]),
      profil: LEERES_PROFIL,
      speichere: async (w) => void (gespeichert = w),
      werkzeuge: {
        ablage: { alleRecords: async () => [], ladeDatei: async () => undefined, setzeRecord: async () => {}, speichere: async () => {}, entferne: async () => {}, markiereGeloescht: async () => {} },
      },
    })
    expect(wep.gruen.aussenanlagen).toHaveLength(3)
    expect(wep.gruen.aufwuchs).toHaveLength(4)
    expect(gespeichert.gruen.beseitigungAA).toHaveLength(2)
  })

  it('Rundlauf: Bau-Excel → WEP → Export schreibt dieselben Zeilen zurück', async () => {
    const wep = fuelleLeereListen(neuerWep('2026-007'), gruen)
    const erg = await exportWep(wep, bytes.slice().buffer)
    const nachher = await leseBauGruen(await erg.blob.arrayBuffer())
    expect(nachher.aussenanlagen).toEqual(gruen.aussenanlagen)
    expect(nachher.aufwuchs).toEqual(gruen.aufwuchs)
    expect(nachher.beseitigungAA).toEqual(gruen.beseitigungAA)
  })
})
