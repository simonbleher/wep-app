// Beta 4, Paket 2: Tabellen, Assistent, Rechenregeln, Index, Hinweise. Erfundene Daten.
// Der Vergleich App = Excel steht in src/export/__tests__/exportBauRechnung.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { neuerWep, neueBauDaten, type Bauteil, type Wep } from '../../model'
import {
  BAUPREISINDEX,
  NHK_TABELLE,
  RESTNUTZUNG,
  MAENGEL_GRUPPEN,
  abzugRestnutzung,
  alterInJahren,
  bauklasseAusAngaben,
  beseitigungsVorschlaege,
  berechneBau,
  ermittleBaupreisindex,
  hinweiseBau,
  kuerzelFuer,
  rund2,
  schlageBaubeschreibungVor,
  schlageRestnutzungVor,
  tabellenEnde,
  umbrechen,
  weisePlaetzeZu,
  altersabzugVomRestwert,
} from '..'
import { blattPfadNachName, sharedStrings, zellenWert } from '../../export/bauExcelLesen'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')

function bt(art: Bauteil['art'], bisher: Bauteil[], o: Partial<Bauteil> = {}): Bauteil {
  return { id: `t${bisher.length}-${art}`, art, kuerzel: kuerzelFuer(art, bisher), flaeche: 0, maengel: [], ...o }
}
function wepMit(f: (l: Bauteil[], w: Wep) => void, jahr = 2025): Wep {
  const w = neuerWep('2026-801')
  w.formalien.wertermittlungAm = `${jahr}-06-01`
  w.bau = neueBauDaten()
  f(w.bau.bauteile, w)
  return w
}

describe('Tabellen stimmen mit der Vorlage überein (Blatt Tabelle1)', () => {
  let zip: JSZip
  let xml: string
  let geteilt: string[]
  beforeAll(async () => {
    zip = await JSZip.loadAsync(fs.readFileSync(VORLAGE))
    xml = await zip.file(await blattPfadNachName(zip, 'Tabelle1', 'xl/worksheets/sheet21.xml'))!.async('string')
    geteilt = await sharedStrings(zip)
  })
  const z = (c: string) => zellenWert(xml, c, geteilt)

  it('Restnutzungstabelle (nelke, B3:E83) Zeile für Zeile', () => {
    expect(RESTNUTZUNG).toHaveLength(81)
    RESTNUTZUNG.forEach((zeile, rn) => {
      expect(z(`B${3 + rn}`)).toBe(String(rn))
      ;['C', 'D', 'E'].forEach((spalte, i) => {
        const v = z(`${spalte}${3 + rn}`)
        if (zeile[i] !== null) expect(zeile[i], `RN ${rn}, Spalte ${spalte}`).toBeCloseTo(v === null || v === '' ? NaN : Number(v), 9)
        if (zeile[i] === null) expect(v === null || v === '', `RN ${rn}, Spalte ${spalte} leer`).toBe(true)
      })
    })
  })

  it('NHK-Tabelle (uwe, J54:N75): Text, Bauklasse, NHK, Spalte', () => {
    const zeilen = Array.from({ length: 22 }, (_, i) => 54 + i).map((r) => [z(`J${r}`), z(`K${r}`), z(`L${r}`), z(`N${r}`)])
    for (const e of NHK_TABELLE) {
      const zeile = zeilen.find((x) => x[0] === e.typ)
      expect(zeile, e.typ).toBeDefined()
      expect(zeile![1]).toBe(e.bauklasse)
      expect(Number(zeile![2])).toBe(e.nhk)
      expect(Number(zeile![3])).toBe(e.spalte)
    }
  })

  it('die Einträge entsprechen der Bewertungstabelle der Richtlinie (S. 5)', () => {
    const nhk = (k: string) => [...new Set(NHK_TABELLE.filter((e) => e.bauklasse === k).map((e) => e.nhk))]
    expect(nhk('I.1')).toEqual([515])
    expect(nhk('I.2')).toEqual([595])
    expect(nhk('I.3')).toEqual([704])
    expect(nhk('II.1')).toEqual([350])
    expect(nhk('II.3')).toEqual([490])
    expect(nhk('III.1')).toEqual([420])
    expect(nhk('III.2')).toEqual([555])
    expect(nhk('III.3')).toEqual([672])
    expect(nhk('IV.1')).toEqual([265])
    expect(nhk('IV.2')).toEqual([325])
    expect(nhk('IV.3')).toEqual([420])
  })

  it('Höchstabzüge der Mängeltabelle (Richtlinie S. 6–8)', () => {
    const max = Object.fromEntries(MAENGEL_GRUPPEN.map((g) => [g.id, g.max]))
    expect(max).toMatchObject({ dach: 20, decken: 10, waende: 13, fussboden: 10, fundament: 20, ausbauAussen: 5, ausbauInnen: 7, bauelemente: 5, schaedlinge: 10, sonderabfall: 10, beraeumt: 10 })
  })
})

describe('Bauklasse-Assistent', () => {
  const k = (material: Bauteil['material'], d: number, extra: Partial<Bauteil> = {}) => bauklasseAusAngaben({ art: 'laube', material, wanddickeCm: d, ...extra })?.bauklasse
  it('Stein', () => {
    expect(k('stein', 9.99)).toBeUndefined()
    expect(k('stein', 10)).toBe('II.1')
    expect(k('stein', 12)).toBe('II.1')
    expect(k('stein', 12.01)).toBe('II.3')
    expect(k('stein', 17.49)).toBe('II.3')
    expect(k('stein', 17.5)).toBe('I.1')
    expect(k('stein', 23.99)).toBe('I.1')
    expect(k('stein', 24)).toBe('I.2')
    expect(k('stein', 35.99)).toBe('I.2')
    expect(k('stein', 36)).toBe('I.3')
  })
  it('Holz doppelwandig: bis 4 / 8 / 10 cm Bauklasse IV, darüber III', () => {
    expect(k('holz-doppelwandig', 3)).toBe('IV.1')
    expect(k('holz-doppelwandig', 4)).toBe('IV.1')
    expect(k('holz-doppelwandig', 4.01)).toBe('IV.2')
    expect(k('holz-doppelwandig', 8)).toBe('IV.2')
    expect(k('holz-doppelwandig', 8.01)).toBe('IV.3')
    expect(k('holz-doppelwandig', 10)).toBe('IV.3')
    expect(k('holz-doppelwandig', 10.01)).toBe('III.1')
    expect(k('holz-doppelwandig', 14.99)).toBe('III.1')
    expect(k('holz-doppelwandig', 15)).toBe('III.2')
    expect(k('holz-doppelwandig', 20)).toBe('III.3')
  })
  it('Blockhaus', () => {
    expect(k('blockhaus', 3)).toBe('IV.1')
    expect(k('blockhaus', 3.01)).toBe('IV.2')
    expect(k('blockhaus', 4.99)).toBe('IV.2')
    expect(k('blockhaus', 5)).toBe('IV.3')
    expect(k('blockhaus', 5.99)).toBe('IV.3')
    expect(k('blockhaus', 6)).toBe('III.1')
    expect(k('blockhaus', 7.5)).toBe('III.2')
    expect(k('blockhaus', 9)).toBe('III.3')
  })
  it('Sonderregeln: Typenlaube GL 10–19 → IV.1, Blech → IV, einwandig über 10 cm → IV.3 mit Hinweis', () => {
    expect(k('holz-doppelwandig', 12, { typenlaube: true })).toBe('IV.1')
    expect(k('blech', undefined as unknown as number)).toMatch(/^IV/)
    const e = bauklasseAusAngaben({ art: 'laube', material: 'holz-einwandig', wanddickeCm: 12 })
    expect(e?.bauklasse).toBe('IV.3')
    expect(e?.hinweis).toBeTruthy()
  })
  it('ohne Material oder Dicke kein Vorschlag', () => {
    expect(bauklasseAusAngaben({ art: 'laube' })).toBeUndefined()
    expect(bauklasseAusAngaben({ art: 'laube', material: 'stein' })).toBeUndefined()
  })
})

describe('Rechenregeln', () => {
  it('rund2 wie Excel (halb weg von null, kein Gleitkomma-Rauschen)', () => {
    expect(rund2(1.005)).toBe(1.01)
    expect(rund2(2.675)).toBe(2.68)
    expect(rund2(-1.005)).toBe(-1.01)
    expect(rund2(0.1 + 0.2)).toBe(0.3)
  })
  it('Alter zählt das Baujahr als vollen Kalenderjahr mit (Richtlinie S. 8)', () => {
    expect(alterInJahren(2025, 2025)).toBe(1)
    expect(alterInJahren(2000, 2025)).toBe(26)
    expect(alterInJahren(undefined, 2025)).toBeUndefined()
  })
  it('Restnutzungstabelle: abgerundet, 0 Jahre = 100 %, Tabellenende wie in Excel', () => {
    expect(abzugRestnutzung(4, 0)).toBe(100)
    expect(abzugRestnutzung(4, undefined)).toBe(100)
    expect(abzugRestnutzung(4, 10)).toBe(71)
    expect(abzugRestnutzung(4, 10.9)).toBe(71)
    expect(abzugRestnutzung(3, 25)).toBe(49)
    expect(abzugRestnutzung(2, 80)).toBe(10)
    expect(abzugRestnutzung(2, 500)).toBe(10)
    expect(abzugRestnutzung(4, 41)).toBe(0) // Tabelle für Bauklasse IV endet bei 40
    expect(abzugRestnutzung(5, 10)).toBe(0)
    expect([tabellenEnde(2), tabellenEnde(3), tabellenEnde(4)]).toEqual([80, 60, 40])
  })
  it('Vorschlag Restnutzung = Tabellenende minus Alter, nicht unter 0', () => {
    expect(schlageRestnutzungVor(4, 2000, 2025)).toBe(40 - 26)
    expect(schlageRestnutzungVor(4, 1960, 2025)).toBe(0)
    expect(schlageRestnutzungVor(2, 2025, 2025)).toBe(79)
    expect(schlageRestnutzungVor(4, undefined, 2025)).toBeUndefined()
  })
  it('Plätze der Vorlage: eine Laube, zwei Anbauten, ein Schuppen oder Keller, Rest hat keinen Platz', () => {
    const l: Bauteil[] = []
    l.push(bt('laube', l), bt('anbau', l), bt('anbau', l), bt('anbau', l), bt('schuppen', l), bt('keller', l), bt('gewaechshaus', l), bt('vorplatz', l))
    const p = weisePlaetzeZu(l)
    expect(p.anbauten).toHaveLength(2)
    expect(p.schuppen?.art).toBe('schuppen')
    expect(p.ueberzaehlig.map((b) => b.art).sort()).toEqual(['anbau', 'keller'])
    expect(kuerzelFuer('anbau', [l[1], l[2]])).toBe('A3')
  })
  it('24-m²-Regel: Laube und Anbauten zusammen, Rest nicht berechnet', () => {
    const w = wepMit((l) => {
      l.push(bt('laube', l, { flaeche: 20, material: 'stein', wanddickeCm: 20, baujahr: 2000 }))
      l.push(bt('anbau', l, { flaeche: 6, material: 'stein', wanddickeCm: 20, baujahr: 2000 }))
    })
    const e = berechneBau(w)!
    expect(e.laube!.flaeche).toBe(20)
    expect(e.anbauten[0].flaeche).toBe(4)
    expect(e.anbauten[0].nichtBerechnet).toBe(2)
    expect(e.nichtBerechneteFlaeche).toBe(2)
    // zulässige Fläche nach Vertragslage anhebbar
    w.bau!.zulaessigeFlaeche = 30
    expect(berechneBau(w)!.nichtBerechneteFlaeche).toBe(0)
  })
  it('ohne Index ist alles 0 (und es gibt einen Hinweis)', () => {
    const w = wepMit((l) => l.push(bt('laube', l, { flaeche: 10, material: 'stein', wanddickeCm: 20, baujahr: 2000 })), 1990)
    const e = berechneBau(w)!
    expect(e.index).toBeNull()
    expect(e.insgesamt).toBe(0)
    expect(hinweiseBau(w).some((h) => h.bereich === 'index')).toBe(true)
  })
  it('Beispielrechnung von Hand: Stein 20 cm (I.1), 20 m², Baujahr 2000, Index 179,2', () => {
    const w = wepMit((l) => l.push(bt('laube', l, { flaeche: 20, material: 'stein', wanddickeCm: 20, baujahr: 2000, maengel: [{ gruppe: 'dach', maengel: [], abzug: 10, begruendung: 'x' }] })))
    const e = berechneBau(w)!.laube!
    // NHK 515, Mängel 10 % → 463,50; Restnutzung 80 − 26 = 54 Jahre → Abzug nach Tabelle I
    expect(e.nhk).toBe(515)
    expect(e.nachMaengeln).toBe(463.5)
    expect(e.restnutzungsjahre).toBe(54)
    expect(e.altersabzugProzent).toBe(RESTNUTZUNG[54][0])
    expect(e.wertProM2).toBe(rund2(rund2(463.5 - (463.5 * RESTNUTZUNG[54][0]!) / 100) * 1.792))
    expect(e.wert).toBe(rund2(20 * e.wertProM2))
  })
})

describe('Baupreisindex', () => {
  it('Werte je Jahr mit Quelle (IV. Quartal = November des Vorjahres)', () => {
    expect(BAUPREISINDEX.every((e) => e.quelle.length > 20)).toBe(true)
    expect(ermittleBaupreisindex(2024)?.wert).toBe(170.7)
    expect(ermittleBaupreisindex(2023)?.wert).toBe(162.1)
    expect(ermittleBaupreisindex(2025)?.wert).toBe(179.2)
    expect(ermittleBaupreisindex(2024)?.quelle).toContain('November 2023')
  })
  it('Profil überschreibt die Tabelle', () => {
    const i = ermittleBaupreisindex(2024, { '2024': 171.1 })!
    expect(i.wert).toBe(171.1)
    expect(i.manuell).toBe(true)
  })
  it('fehlt das Jahr, kommt der letzte bekannte Wert als Ersatz (mit Kennzeichen)', () => {
    const i = ermittleBaupreisindex(2027)!
    expect(i.ersatz).toBe(true)
    expect(i.ersatzJahr).toBe(2025)
    expect(i.wert).toBe(179.2)
    expect(ermittleBaupreisindex(2027, { '2026': 185 })!.wert).toBe(185)
    expect(ermittleBaupreisindex(1990)).toBeNull()
  })
  it('das WEP merkt sich den verwendeten Wert', () => {
    const w = wepMit((l) => l.push(bt('laube', l, { flaeche: 10, material: 'stein', wanddickeCm: 20, baujahr: 2000 })))
    w.bau!.index = { jahr: 2025, wert: 180, quelle: 'Eingabe', manuell: true }
    expect(berechneBau(w)!.indexFaktor).toBeCloseTo(1.8)
    w.bau!.index = { jahr: 2020, wert: 120, quelle: 'alt' } // anderes Jahr, nicht von Hand: neu ermitteln
    expect(berechneBau(w)!.indexFaktor).toBeCloseTo(1.792)
  })
})

describe('Abwassergrube: Altersabzug jährlich 3 % vom Restwert', () => {
  it('(1 − 0,97^Alter) × 100: 16 Jahre 38,57 % statt 48 %', () => {
    expect(altersabzugVomRestwert(0)).toBe(0)
    expect(altersabzugVomRestwert(1)).toBeCloseTo(3, 10)
    expect(altersabzugVomRestwert(16)).toBeCloseTo(38.5746, 4)
  })
  it('Tank 16 Jahre gedeckelt, Schachtringe ohne Grenze (nie 100 %)', () => {
    const tank = wepMit((_, wep) => { wep.bau!.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'kunststoff', inhaltM3: 5, baujahr: 2000, dichtheitAm: '2025-01-03' } } })
    const g = berechneBau(tank)!.grube!
    expect(g.wirksamesAlter).toBe(16)
    expect(g.altersabzugProzent).toBeCloseTo(38.5746, 4)
    expect(g.wertProM3).toBe(288.7) // 470 − 470 × 38,57 %
    expect(g.wert).toBe(1443.5)
    const alt = wepMit((_, wep) => { wep.bau!.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'schachtringe', inhaltM3: 3, baujahr: 1965, dichtheitAm: '2025-01-03' } } })
    const s = berechneBau(alt)!.grube!
    expect(s.wirksamesAlter).toBe(s.alter)
    expect(s.altersabzugProzent).toBeLessThan(100)
    expect(s.wert).toBeGreaterThan(0)
  })
})

describe('Kanalanschluss: Altersabzug jährlich 3 % vom Restwert', () => {
  it('Abzug 1 − 0,97^Alter vom Erstellungspreis (höchstens 2.200 €), auch nach über 33 Jahren nicht 0 €', () => {
    const w = wepMit((_, wep) => { wep.bau!.abwasser = { art: 'kanal', grube: {}, kanal: { baujahr: 2006, kosten: 3000 } } })
    const k = berechneBau(w)!.kanal!
    expect(k.alter).toBeGreaterThan(0)
    expect(k.abzug).toBeCloseTo(1 - 0.97 ** k.alter!, 10)
    expect(k.wert).toBe(Math.round(2200 * 0.97 ** k.alter! * 100) / 100)
    const alt = wepMit((_, wep) => { wep.bau!.abwasser = { art: 'kanal', grube: {}, kanal: { baujahr: 1960, kosten: 1500 } } })
    const ka = berechneBau(alt)!.kanal!
    expect(ka.alter).toBeGreaterThan(33)
    expect(ka.wert).toBeGreaterThan(0)
  })
})

describe('Hinweise (nur warnen, nie sperren)', () => {
  const texte = (w: Wep) => hinweiseBau(w).map((h) => h.text)
  it('Laube über 24 m², Anbauten, Gewächshaus, Keller, widerrechtlich, Abwasser', () => {
    const w = wepMit((l, wep) => {
      l.push(bt('laube', l, { flaeche: 26, material: 'stein', wanddickeCm: 20, baujahr: 2000 }))
      l.push(bt('anbau', l, { flaeche: 3, material: 'stein', wanddickeCm: 20, baujahr: 2000 }))
      l.push(bt('gewaechshaus', l, { flaeche: 14, hoehe: 2.5, baujahr: 2018, minderungProJahr: 2 }))
      l.push(bt('keller', l, { flaeche: 8, material: 'stein', wanddickeCm: 20, baujahr: 2000 }))
      l.push(bt('schuppen', l, { flaeche: 5, baujahr: 2000, nichtBewerten: true }))
      wep.bau!.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'beton', inhaltM3: 4, baujahr: 1990, nichtGeleert: true } }
    })
    const t = texte(w).join('\n')
    expect(t).toMatch(/größer als 24 m²: 2 m² werden nicht berechnet/)
    expect(t).toMatch(/Anbauten dürfen nur bewertet werden/)
    expect(t).toMatch(/nur Gewächshäuser bis 12 m²/)
    expect(t).toMatch(/Firsthöhe über 2,2 m/)
    expect(t).toMatch(/mindestens 3 % jährlich/)
    expect(t).toMatch(/Kellerräume sind nur zu bewerten/)
    expect(t).toMatch(/nicht bewertet \(widerrechtlich/)
    expect(t).toMatch(/Dichtheitsnachweis/)
    expect(t).toMatch(/Genehmigungsdatum fehlt/)
    // Rückbau-Vorschlag am widerrechtlichen Bauteil
    expect(hinweiseBau(w).some((h) => h.beseitigung?.gegenstand.includes('Rückbau'))).toBe(true)
    // Quellen stehen bei den Regeln
    expect(hinweiseBau(w).filter((h) => h.schwere === 'warnung').every((h) => h.regel)).toBe(true)
  })
  it('fehlende Bauklasse, fehlende Restnutzung und Mängel über Höchstwert', () => {
    const w = wepMit((l) => l.push(bt('laube', l, { flaeche: 10, baujahr: 2000, maengel: [{ gruppe: 'dach', maengel: [], abzug: 25, begruendung: '' }] })))
    const t = texte(w).join('\n')
    expect(t).toMatch(/Bauklasse fehlt/)
    expect(t).toMatch(/Höchstwert von 20 %/)
  })
  it('Vorlage hat keinen Platz für ein drittes Bauteil dieser Art', () => {
    const w = wepMit((l) => {
      l.push(bt('anbau', l, { flaeche: 1 }), bt('anbau', l, { flaeche: 1 }), bt('anbau', l, { flaeche: 1 }))
    })
    expect(texte(w).join('\n')).toMatch(/keinen Platz/)
  })
})

describe('Baubeschreibung und Beseitigung', () => {
  it('Vorschlag nennt Maße, Bauklasse, Baujahr, Mängel, Ausstattung und Abwasser', () => {
    const w = wepMit((l, wep) => {
      l.push(bt('laube', l, { laenge: 4, breite: 5, flaeche: 20, baujahr: 1998, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 12, maengel: [{ gruppe: 'dach', maengel: ['Dachoberfläche beschädigt'], abzug: 8, begruendung: 'Pappe gerissen' }] }))
      wep.bau!.ausstattung = { wasser: 'fehlt', wc: 'trockentoilette', strom: 'vorhanden' }
      wep.bau!.abwasser = { art: 'grube', kanal: {}, grube: { inhaltM3: 5, dichtheitFehlt: true } }
    })
    const t = schlageBaubeschreibungVor(w)
    expect(t).toContain('Laube L: 4 × 5 m (Außenmaße) = 20 m²')
    expect(t).toContain('Bauklasse III.1')
    expect(t).toContain('Baujahr 1998 (geschätzt)')
    expect(t).toContain('Mängelabzug 8 %: Dach 8 % (Dachoberfläche beschädigt), Pappe gerissen')
    expect(t).toContain('Wasseranschluss fehlt')
    expect(t).toContain('Trockentoilette vorhanden')
    expect(t).toContain('Dichtheitsnachweis fehlt, keine Bewertung')
  })
  it('Umbruch in Zeilen für das Textfeld der Vorlage', () => {
    const zeilen = umbrechen('eins zwei drei vier fünf sechs', 12)
    expect(zeilen.every((z) => z.length <= 12)).toBe(true)
    expect(zeilen.join(' ')).toBe('eins zwei drei vier fünf sechs')
    expect(umbrechen('a\n\nb', 10)).toEqual(['a', '', 'b'])
  })
  it('Vorschläge: Rückbau widerrechtlicher Bauteile mit Preis nach Bauklasse, Grube mit Abfuhr', () => {
    const w = wepMit((l, wep) => {
      l.push(bt('anbau', l, { flaeche: 6, hoehe: 2.5, material: 'stein', wanddickeCm: 20, nichtBewerten: true }))
      wep.bau!.abwasser = { art: 'grube', kanal: {}, grube: { inhaltM3: 4, zuBeseitigen: true, nichtGeleert: true } }
    })
    const v = beseitigungsVorschlaege(w)
    expect(v[0].gegenstand).toContain('Rückbau')
    expect(v[0].einzelpreis).toBe(120) // typ „fehlt“ bei nichtBewerten → Bauklasse IV
    expect(v[0].menge).toBe(15)
    expect(v.find((p) => /entfernen/.test(p.gegenstand))?.einzelpreis).toBe(250)
    expect(v.find((p) => /Fäkalien/.test(p.gegenstand))?.einzelpreis).toBe(150)
    w.bau!.beseitigung = [v[0]]
    expect(beseitigungsVorschlaege(w).some((p) => p.gegenstand === v[0].gegenstand)).toBe(false)
  })
})
