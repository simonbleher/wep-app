// @vitest-environment node
// Beta 4, Paket 2: Reiter Baulichkeiten, Mängel, Abwasser, Beseitigung Bau (Anzeige) und Hilfsfunktionen. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, neueBauDaten, type Bauteil, type Wep } from '@/model'
import { BauteilFormular, BaulichkeitenTab } from '../BauBaulichkeiten'
import { MaengelTab } from '../BauMaengel'
import { AbwasserTab } from '../BauAbwasser'
import { BeseitigungBauTab } from '../BauBeseitigung'
import { BaupreisindexProfil } from '../BauIndexProfil'
import { bauFuerExport, merkeIndex, neuesBauteil, setzeMangel, mangelDerGruppe, aendereBauTeil, ersetzeBauteil } from '../bauHelfer'
import { LEERES_PROFIL } from '@/profil'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const nichts = async () => {}

function wep(): Wep {
  const w = neuerWep('2026-851')
  w.formalien.wertermittlungAm = '2025-06-10'
  w.bau = neueBauDaten()
  const laube: Bauteil = {
    ...neuesBauteil('laube', []),
    id: 'l1',
    laenge: 4,
    breite: 5,
    flaeche: 20,
    baujahr: 1998,
    baujahrQuelle: 'lt. Angabe',
    material: 'holz-doppelwandig',
    wanddickeCm: 12,
    maengel: [{ gruppe: 'dach', maengel: ['Dachoberfläche beschädigt'], abzug: 8, begruendung: 'Pappe gerissen' }],
  }
  w.bau.bauteile.push(laube, { ...neuesBauteil('anbau', [laube]), id: 'a1', flaeche: 6, baujahr: 2004, material: 'stein', wanddickeCm: 20 })
  return w
}

describe('Reiter Baulichkeiten', () => {
  it('leer: Hinweis und „Laube anlegen“', () => {
    const w = neuerWep('2026-852')
    const h = render(createElement(BaulichkeitenTab, { wep: w, aendere: nichts, onOeffnen: () => {} }))
    expect(h).toContain('Noch keine Bauteile')
    expect(h).toContain('Laube anlegen')
    expect(h).toContain('Baupreisindex')
  })

  it('Liste mit Bauteilen: Kürzel, Fläche, Bauklasse, Baujahr, Wert, Summe, Index mit Quelle, Warnung über 24 m²', () => {
    const h = render(createElement(BaulichkeitenTab, { wep: wep(), aendere: nichts, onOeffnen: () => {} }))
    expect(h).toContain('L · Laube')
    expect(h).toContain('A1 · Anbau')
    expect(h).toContain('Bauklasse III.1')
    expect(h).toContain('Baujahr 1998')
    expect(h).toContain('179,2')
    expect(h).toContain('WEP-Vorlage des BV Pankow')
    expect(h).toContain('Baulichkeiten insgesamt')
    // 20 m² Laube + 6 m² Anbau: 2 m² über 24 m²
    expect(h).toContain('werden nicht berechnet')
    expect(h).toContain('Richtlinie S. 3 Nr. 3')
    expect(h).toContain('Baubeschreibung')
    expect(h).toContain('Laube L: 4 × 5 m (Außenmaße) = 20 m²')
  })

  it('Formular: Assistent, Vorschlag, Restnutzung, Rechenweg, Mängel, Löschen nur beim Ändern', () => {
    const w = wep()
    const start = w.bau!.bauteile[0]
    const h = render(createElement(BauteilFormular, { wep: w, start, neu: false, onAbbrechen: () => {}, onFertig: () => {}, onLoeschen: () => {}, onMaengel: () => {} }))
    expect(h).toContain('Vorschlag: Bauklasse III.1, NHK')
    expect(h).toContain('Restnutzungsjahre')
    expect(h).toContain('Vorschlag 32 Jahre')
    expect(h).toContain('Rechenweg')
    expect(h).toContain('Löschen')
    expect(h).toContain('8 %')
    const neu = render(createElement(BauteilFormular, { wep: w, start: neuesBauteil('gewaechshaus', []), neu: true, onAbbrechen: () => {}, onFertig: () => {}, onLoeschen: () => {}, onMaengel: () => {} }))
    expect(neu).toContain('Gewächshaus (Richtlinie S. 11 a)')
    expect(neu).toContain('Firsthöhe')
    expect(neu).not.toContain('>Löschen<')
    const vp = render(createElement(BauteilFormular, { wep: w, start: neuesBauteil('vorplatz', []), neu: true, onAbbrechen: () => {}, onFertig: () => {}, onLoeschen: () => {}, onMaengel: () => {} }))
    expect(vp).toContain('Überdachter Laubenvorplatz')
    expect(vp).toContain('verlängertes Dach')
  })
})

describe('Reiter Mängel', () => {
  it('Gruppen mit Höchstwert und Quelle, Gesamtabzug, Begründung, eigene Mängel', () => {
    const h = render(createElement(MaengelTab, { wep: wep(), aendere: nichts }))
    expect(h).toContain('Dach (bis 20 %)')
    expect(h).toContain('Wände (bis 13 %)')
    expect(h).toContain('Fundament (bis 20 %)')
    expect(h).toContain('Gesamtabzug L')
    expect(h).toContain('Pappe gerissen')
    expect(h).toContain('Eigenen Mangel hinzufügen')
    expect(h).toContain('Nicht fertiggestellt')
  })
  it('ohne Bauteil: Hinweis', () => {
    expect(render(createElement(MaengelTab, { wep: neuerWep('2026-853'), aendere: nichts }))).toContain('Noch kein Bauteil')
  })
})

describe('Reiter Abwasser', () => {
  it('Grube: Felder, Rechenweg, nicht beräumt', () => {
    const w = wep()
    w.bau!.abwasser = { art: 'grube', kanal: {}, grube: { typ: 'kunststoff', inhaltM3: 5, baujahr: 2000, dichtheitAm: '2025-01-03', nichtGeleert: true } }
    w.bau!.nichtBeraeumt = { aktiv: true, m3: 3, preis: 100 }
    const h = render(createElement(AbwasserTab, { wep: w, aendere: nichts }))
    expect(h).toContain('Abwassersammelgrube')
    expect(h).toContain('Altersabzug 48 % (16 Jahre × 3 %)') // linear vom Bis-Wert (vom BV bestätigt)
    expect(h).toContain('Grube nicht geleert')
    expect(h).toContain('Genehmigungsdatum fehlt')
    expect(h).toContain('Kosten nicht beräumter Baulichkeiten')
    expect(h).toContain('300,00')
  })
  it('Kanal', () => {
    const w = wep()
    w.bau!.abwasser = { art: 'kanal', grube: {}, kanal: { baujahr: 2010, kosten: 3000 } }
    const h = render(createElement(AbwasserTab, { wep: w, aendere: nichts }))
    expect(h).toContain('Kanalisationsanschluss')
    expect(h).toContain('höchstens 2.200')
  })
})

describe('Reiter Beseitigung Bau', () => {
  it('Vorschläge aus dem WEP, Positionen, Summe, Textbausteine', () => {
    const w = wep()
    w.bau!.bauteile.push({ ...neuesBauteil('anbau', w.bau!.bauteile), id: 'a2', flaeche: 3, hoehe: 2.5, nichtBewerten: true })
    w.bau!.beseitigung = [{ id: 'p1', gegenstand: 'Unrat aus Baulichkeiten entfernen', menge: 2, einheit: 'm³', einzelpreis: 200, faktor: 1 }]
    const h = render(createElement(BeseitigungBauTab, { wep: w, aendere: nichts, onOeffnen: () => {} }))
    expect(h).toContain('1 Vorschlag aus dem WEP')
    expect(h).toContain('Unrat aus Baulichkeiten entfernen')
    expect(h).toContain('Summe Beseitigung Bau')
    expect(h).toContain('400,00')
  })
})

describe('Profil: Baupreisindex', () => {
  it('Werte je Jahr mit Quelle, Eingabe zum Überschreiben', () => {
    const h = render(createElement(BaupreisindexProfil, { profil: { ...LEERES_PROFIL, rolle: 'bau' }, onAendern: () => {} }))
    expect(h).toContain('Baupreisindex (Bau)')
    expect(h).toContain('Amt für Statistik Berlin-Brandenburg')
    expect(h).toContain('Index für ')
  })
})

describe('Hilfsfunktionen', () => {
  it('merkeIndex: Wert, Jahr und Quelle am WEP; Profilwert gewinnt; von Hand gesetzter bleibt', () => {
    const w = wep()
    const m = merkeIndex(w)!
    expect(m.bau!.index).toMatchObject({ jahr: 2025, wert: 179.2 })
    expect(merkeIndex(m)).toBeNull()
    const p = merkeIndex(m, { '2025': 180.5 })!
    expect(p.bau!.index!.wert).toBe(180.5)
    const hand = { ...m, bau: { ...m.bau!, index: { jahr: 2025, wert: 177, quelle: 'Eingabe am WEP', manuell: true } } }
    expect(merkeIndex(hand, { '2025': 180.5 })).toBeNull()
  })
  it('bauFuerExport: Beschreibung aus den Bauteilen, solange sie nicht von Hand geschrieben ist', () => {
    const w = bauFuerExport(wep())
    expect(w.bau!.beschreibung).toContain('Laube L')
    expect(w.bau!.index?.wert).toBe(179.2)
    const hand = wep()
    hand.bau!.beschreibung = 'Mein Text'
    hand.bau!.beschreibungManuell = true
    expect(bauFuerExport(hand).bau!.beschreibung).toBe('Mein Text')
  })
  it('Mängel setzen und entfernen', () => {
    let b = neuesBauteil('laube', [])
    b = setzeMangel(b, 'dach', { abzug: 8, maengel: ['Dach nicht horizontal'] })
    expect(mangelDerGruppe(b, 'dach')?.abzug).toBe(8)
    b = setzeMangel(b, 'dach', { abzug: 0, maengel: [] })
    expect(b.maengel).toEqual([])
  })
  it('Bauteile ersetzen: gleiche Id ersetzt, neue Id hängt an', () => {
    const w = wep()
    const l = { ...w.bau!.bauteile[0], flaeche: 18 }
    expect(ersetzeBauteil(w.bau!, l).bauteile).toHaveLength(2)
    expect(ersetzeBauteil(w.bau!, l).bauteile[0].flaeche).toBe(18)
    expect(aendereBauTeil({ ...w, bau: undefined }, (b) => b).bau).toBeDefined()
  })
})
