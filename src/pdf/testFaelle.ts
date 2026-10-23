// Erfundene Fälle für Tests und Screenshots des PDF-Exports (Beta 5, Paket 4). Nur erfundene Namen und Werte.
// Bewusst ohne Importe aus „@/“, damit auch `vite-node` in tools/ sie benutzen kann.
import { neuerWep, neueBauDaten, type BauDaten, type Bauteil, type BeseitigungsPosition, type MangelAbzug, type Position, type Rolle, type Wep } from '../model'
import { kuerzelFuer } from '../bau'
import { rechteckPunkte, type GrundrissDaten } from '../skizze/grundriss'
import type { SkizzeDaten, SkizzeElement, SymbolArt } from '../skizze/types'

export interface TestFall {
  name: string
  rolle: Rolle
  wep: Wep
  /** Mit der Test-Bau-Excel aus der Vorlage statt mit der leeren Vorlage. */
  mitBauExcel?: boolean
}

let zaehler = 0
const id = (p: string) => `${p}${++zaehler}`

export function position(bezeichnung: string, anzahl: number, einheit: string, einzelpreis: number): Position {
  return { id: id('p'), bezeichnung, anzahl, einheit, einzelpreis, preisManuell: true, hinweise: [] }
}

const beseitigung = (gegenstand: string, menge: number, einheit: string, einzelpreis: number, faktor = 1, begruendung?: string): BeseitigungsPosition => ({
  id: id('b'),
  gegenstand,
  menge,
  einheit,
  einzelpreis,
  faktor,
  ...(begruendung ? { begruendung } : {}),
})

function formalien(w: Wep, nr: string, o: { bau?: boolean; gruen?: boolean } = {}): void {
  const f = w.formalien
  f.kleingartenanlage = 'KGA Testgarten'
  f.parzelle = '42'
  f.weg = 'Rosenweg'
  f.unterpaechter = 'Erika Musterfrau'
  f.auftraggeber = 'Bezirksverband Beispielstadt'
  f.anwesendVerein = 'Hans Vorstand'
  f.anwesendUnterpaechter = 'Erika Musterfrau'
  f.anwesendAuftraggeber = 'Max Mustermann'
  f.wertermittlerBaulichkeiten = o.bau === false ? '' : 'Bert Bauer'
  f.wertermittlerAussenAufwuchs = o.gruen === false ? '' : 'Gerda Gruen'
  f.wertermittlungAm = '2026-10-14'
  f.protokollerstellungAm = '2026-10-20'
  f.parzellenflaecheM2 = 380
  f.vorgangsNr = nr
}

const symbol = (art: SymbolArt, x: number, y: number, b: number, h: number, beschriftung = ''): SkizzeElement => ({
  id: id('s'),
  typ: 'symbol',
  art,
  x,
  y,
  breite: b,
  hoehe: h,
  ...(beschriftung ? { beschriftung } : {}),
})

/** Grün-Skizze mit Grundlage (Grundstück, Laube) und einigen Symbolen. */
export function testSkizze(): SkizzeDaten {
  const elemente: SkizzeElement[] = [
    { id: id('g'), typ: 'bauform', art: 'grundstueck', ebene: 'grundlage', fest: true, punkte: [{ x: 20, y: 20 }, { x: 780, y: 20 }, { x: 780, y: 580 }, { x: 20, y: 580 }] },
    { id: id('g'), typ: 'bauform', art: 'bauteil', ebene: 'grundlage', fest: true, beschriftung: 'L', punkte: [{ x: 300, y: 80 }, { x: 520, y: 80 }, { x: 520, y: 220 }, { x: 300, y: 220 }] },
    { id: id('g'), typ: 'bauform', art: 'bauteil', ebene: 'grundlage', fest: true, beschriftung: 'K1', gestrichelt: true, punkte: [{ x: 330, y: 100 }, { x: 420, y: 100 }, { x: 420, y: 170 }, { x: 330, y: 170 }] },
    symbol('baum', 80, 300, 70, 84, 'Apfel'),
    symbol('baum', 600, 320, 70, 84, 'Birne'),
    symbol('strauch', 200, 460, 64, 56, 'Johannisbeere'),
    symbol('hecke', 40, 540, 300, 30, 'Liguster'),
    symbol('beet', 380, 330, 140, 70, 'Gemüsebeet'),
    symbol('hochbeet', 560, 460, 60, 76, 'Hochbeet'),
    symbol('kompost', 700, 150, 70, 40, 'Kompost'),
    symbol('weg', 540, 230, 40, 110, 'Weg'),
    symbol('entfernen', 90, 120, 60, 60, 'Thuja entfernen'),
    { id: id('t'), typ: 'text', x: 340, y: 430, inhalt: 'Wiese ca. 60 m²', schriftgroesse: 14 },
  ]
  return { elemente, breite: 800, hoehe: 600, raster: true, rasterGroesse: 40, grundlage: { quelle: 'bau', uebernommen: '2026-10-10T08:00:00Z', gesperrt: true } }
}

/** Grundriss: Laube 4 × 5 m, Anbau 2 × 2,5 m, Schuppen 2,5 × 2 m, Keller gestrichelt. */
export function testGrundriss(bauteile: Bauteil[]): GrundrissDaten {
  const mitId = (k: string) => bauteile.find((b) => b.kuerzel === k)?.id
  return {
    raster: true,
    massketten: true,
    teile: [
      { id: id('t'), kuerzel: 'L', bauteilId: mitId('L'), punkte: rechteckPunkte(6, 4, 5, 4), hoehe: 2.4, dachform: 'sattel', hoeheOben: 3.2 },
      { id: id('t'), kuerzel: 'A1', bauteilId: mitId('A1'), punkte: rechteckPunkte(11, 4.5, 2.5, 2), hoehe: 2.2, dachform: 'flach' },
      { id: id('t'), kuerzel: 'S', bauteilId: mitId('S'), punkte: rechteckPunkte(3, 5, 2.5, 2), hoehe: 2.1, dachform: 'pult', hoeheOben: 2.5 },
      { id: id('t'), kuerzel: 'K1', punkte: rechteckPunkte(6.3, 6.4, 2, 1.4), gestrichelt: true },
    ],
  }
}

const mangel = (gruppe: string, abzug: number, text = 'Beispiel'): MangelAbzug => ({ gruppe, maengel: [text], abzug, begruendung: 'erfundener Befund' })

function bauMit(f: (l: Bauteil[], b: BauDaten) => void): BauDaten {
  const bau = neueBauDaten()
  f(bau.bauteile, bau)
  return bau
}
const bt = (art: Bauteil['art'], bisher: Bauteil[], o: Partial<Bauteil> = {}): Bauteil => ({ id: id('t'), art, kuerzel: kuerzelFuer(art, bisher), flaeche: 0, maengel: [], ...o })

/** Alle Fälle (jeder mit anderen Zahlen, auch Randfälle: Überlauf Aufwuchs, 24-m²-Grenze, abgeschrieben …). */
export function testFaelle(): TestFall[] {
  zaehler = 0
  const faelle: TestFall[] = []

  // 1. Grün, einfach, mit Skizze
  {
    const w = neuerWep('2026-101')
    formalien(w, '2026-101', { bau: false })
    w.gruen.beschreibungAussen = 'Die Parzelle ist gepflegt. Terrasse aus Betonplatten, Gartenweg aus Kies, Regentonne und Gewächshaus-Fundament vorhanden.'
    w.gruen.beschreibungAufwuchs = 'Obstbäume in gutem Zustand, Beerensträucher, Staudenbeet. Eine Thuja ist zu entfernen.'
    w.gruen.aussenanlagen = [
      position('Terrasse, Betonplatten', 12, 'm²', 18.5),
      position('Weg, Kies', 14.5, 'm²', 7.25),
      position('Regentonne', 2, 'Stück', 12),
      position('Zaun, Maschendraht, 1,00 m', 38, 'lfdm', 9.9),
    ]
    w.gruen.aufwuchs = [
      position('Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 60),
      position('Birne, Spindel', 1, 'Stück', 34.5),
      position('Johannisbeere', 5, 'Stück', 8),
      position('Liguster-Hecke (Laub, einfache Art)', 12, 'lfdm', 14.25),
      position('Rasen', 60, 'm²', 1.2),
    ]
    w.gruen.beseitigungAA = [
      beseitigung('Thuja fällen und entsorgen', 1, 'Stück', 180, 1.5, 'Stamm 40 cm, Zufahrt schwierig'),
      beseitigung('Holzpferd entfernen', 1, 'Stück', 45),
    ]
    w.skizze = testSkizze()
    faelle.push({ name: 'Grün einfach', rolle: 'gruen', wep: w })
  }

  // 2. Grün, voll: 31 Außenanlagen, 40 Aufwuchs (Überlauf in Aufwuchs II), hohe Preise (Tausenderpunkt)
  {
    const w = neuerWep('2026-102')
    formalien(w, '2026-102', { bau: false })
    w.gruen.aussenanlagen = Array.from({ length: 31 }, (_, i) => position(`Außenanlage Nr. ${i + 1} mit längerer Bezeichnung zum Testen des Umbruchs`, i + 1, 'm²', 3.5 * (i + 1)))
    w.gruen.aufwuchs = Array.from({ length: 40 }, (_, i) => position(`Pflanze Nr. ${i + 1}`, (i % 7) + 1, 'Stück', 9.99 + i * 7.77))
    w.gruen.aufwuchs[0] = position('Walnuss, Hochstamm', 1, 'Stück', 1234.5)
    faelle.push({ name: 'Grün voll (Überlauf Aufwuchs II)', rolle: 'gruen', wep: w })
  }

  // 3. Bau normal
  {
    const w = neuerWep('2026-103')
    formalien(w, '2026-103', { gruen: false })
    w.bau = bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 20, baujahr: 1998, material: 'holz-doppelwandig', wanddickeCm: 12, maengel: [mangel('dach', 8), mangel('waende', 5)] }))
      l.push(bt('anbau', l, { flaeche: 5, baujahr: 2005, material: 'holz-doppelwandig', wanddickeCm: 6, maengel: [mangel('fussboden', 3)] }))
      l.push(bt('schuppen', l, { flaeche: 5, baujahr: 2010, material: 'blech', rnManuell: true, restnutzungsjahre: 12 }))
      l.push(bt('gewaechshaus', l, { flaeche: 8, hoehe: 2, baujahr: 2018, minderungProJahr: 5, maengel: [mangel('unfertig', 10)] }))
      bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'kunststoff', inhaltM3: 5, baujahr: 2000, genehmigtAm: '2000-05-01', genehmigungNr: 'G-17', dichtheitAm: '2026-03-02', nichtGeleert: true } }
      bau.nichtBeraeumt = { aktiv: true, m3: 4, preis: 100 }
      bau.beschreibung = 'Laube in Holzständerbauweise, Satteldach mit Bitumenschindeln. Der Anbau (Süd) ist als Abstellraum genutzt. Schuppen aus Blech, standsicher.\nDer Zustand ist altersgemäß, kleinere Mängel am Dach.'
      bau.beseitigung = [
        beseitigung('Einbehalt für Fäkalienabfuhr, wenn Grube bei der WE nicht geleert ist', 1, 'pauschal', 150),
        beseitigung('Rückbau Anbau1 s. - Skizze Bau', 12.5, 'm³', 120, 1.5, 'lange Wegstrecke'),
      ]
      bau.ausstattung = { wasser: 'fehlt', wc: 'trockentoilette', strom: 'vorhanden' }
    })
    w.grundriss = testGrundriss(w.bau.bauteile)
    faelle.push({ name: 'Bau normal', rolle: 'bau', wep: w })
  }

  // 4. Beides, Randfall: Laube 30 m² (24-m²-Grenze), Vorplatz, Kanal
  {
    const w = neuerWep('2026-104')
    formalien(w, '2026-104')
    w.gruen.aussenanlagen = [position('Terrasse, Holzdeck', 10, 'm²', 22), position('Hochbeet, Holz', 3, 'Stück', 25)]
    w.gruen.aufwuchs = [position('Kirsche, Halbstamm', 1, 'Stück', 70.5), position('Himbeere', 6, 'Stück', 6.5)]
    w.gruen.beseitigungAA = [beseitigung('Kompostanlage entfernen', 1, 'pauschal', 60)]
    w.bau = bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 30, baujahr: 1990, material: 'holz-doppelwandig', wanddickeCm: 16 }))
      l.push(bt('anbau', l, { flaeche: 4, baujahr: 1995, material: 'holz-doppelwandig', wanddickeCm: 9 }))
      l.push(bt('vorplatz', l, { flaeche: 6, baujahr: 2000, vorplatzLage: 'integriert' }))
      bau.abwasser = { art: 'kanal', grube: {}, kanal: { baujahr: 2006, kosten: 1800 } }
    })
    w.skizze = testSkizze()
    w.grundriss = testGrundriss(w.bau.bauteile)
    faelle.push({ name: 'Beides (Laube über 24 m², Vorplatz, Kanal)', rolle: 'beides', wep: w })
  }

  // 5. Bau abgeschrieben: alte Laube, Gewächshaus 20 Jahre × 5 %, Grube ohne Nachweis
  {
    const w = neuerWep('2026-105')
    formalien(w, '2026-105', { gruen: false })
    w.bau = bauMit((l, bau) => {
      l.push(bt('laube', l, { flaeche: 14, baujahr: 1960, material: 'holz-einwandig', wanddickeCm: 2 }))
      l.push(bt('gewaechshaus', l, { flaeche: 6, baujahr: 2006, minderungProJahr: 5 }))
      bau.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'schachtringe', inhaltM3: 3.5, baujahr: 1995, dichtheitFehlt: true } }
    })
    faelle.push({ name: 'Bau abgeschrieben (Grube ohne Nachweis)', rolle: 'bau', wep: w })
  }

  // 6. Grün mit Bau-Excel
  {
    const w = neuerWep('2026-106')
    formalien(w, '2026-106')
    w.gruen.aussenanlagen = [position('Pergola, Holz', 1, 'Stück', 150)]
    w.gruen.aufwuchs = [position('Weinstock', 2, 'Stück', 18)]
    w.bauExcel = { name: 'Test-Bau-Excel.xlsx', groesse: 1, version: 'x', hinzugefuegtAm: '2026-10-10T08:00:00Z', abgeglichen: true }
    faelle.push({ name: 'Grün mit Bau-Excel', rolle: 'gruen', wep: w, mitBauExcel: true })
  }

  // 7. Rundung: halbe Cent-Beträge (1,005 / 1,125 / 2,675 …) wie in Excel kaufmännisch runden
  {
    const w = neuerWep('2026-108')
    formalien(w, '2026-108', { bau: false })
    w.gruen.aussenanlagen = [position('Rundung 1,005', 3, 'Stück', 0.335), position('Rundung 1,125', 2.5, 'm²', 0.45), position('Rundung 2,675', 1, 'Stück', 2.675), position('Rundung 0,285', 3, 'lfdm', 0.095)]
    w.gruen.aufwuchs = [position('Rundung 8,125', 6.5, 'Stück', 1.25), position('Rundung 14,985', 3, 'Stück', 4.995)]
    w.gruen.beseitigungAA = [beseitigung('Rundung Beseitigung', 3, 'm²', 0.335, 1.5, 'wegen Zufahrt')]
    faelle.push({ name: 'Rundung', rolle: 'gruen', wep: w })
  }

  // 8. Leer
  {
    const w = neuerWep('2026-107')
    faelle.push({ name: 'Leeres WEP', rolle: 'beides', wep: w })
  }

  return faelle
}
