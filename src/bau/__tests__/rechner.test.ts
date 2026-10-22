// Beta 4, Paket 4: Rechen-Tools. Die Tests prüfen vor allem, dass der Rechner dasselbe liefert wie die Bewertung
// (`berechneBau`) und die Massenberechnung des Grundrisses (`massenVon`) – nichts wird doppelt gerechnet. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { neuerWep, neueBauDaten, type Bauteil, type Wep } from '../../model'
import { massenVon, rechteckPunkte } from '../../skizze/grundriss'
import {
  altersRechnung,
  berechneBau,
  bewerteEinzeln,
  indexUmrechnung,
  kubaturFlaeche,
  pruefeZulaessigeFlaeche,
  rechneFlaechen,
  rechneKubatur,
  setzeZulaessigeFlaeche,
  teilflaecheM2,
  uebernehmeAlter,
  uebernehmeMasse,
} from '..'

const bt = (o: Partial<Bauteil> & Pick<Bauteil, 'id' | 'art' | 'kuerzel'>): Bauteil => ({ flaeche: 0, maengel: [], ...o })

function wepMit(bauteile: Bauteil[], jahr = 2025): Wep {
  const w = neuerWep('2026-901')
  w.formalien.wertermittlungAm = `${jahr}-06-01`
  w.bau = { ...neueBauDaten(), bauteile }
  return w
}
const laube = bt({ id: 'l', art: 'laube', kuerzel: 'L', laenge: 5, breite: 4, flaeche: 20, baujahr: 1998, material: 'holz', wanddickeCm: 12, maengel: [{ gruppe: 'dach', maengel: [], abzug: 10, begruendung: 'x' }] })

describe('Flächenrechner', () => {
  it('Rechteck, Dreieck, Trapez', () => {
    expect(teilflaecheM2({ id: '1', art: 'rechteck', a: 4, b: 2.5 })).toBe(10)
    expect(teilflaecheM2({ id: '1', art: 'dreieck', a: 3, h: 2 })).toBe(3)
    expect(teilflaecheM2({ id: '1', art: 'trapez', a: 4, b: 2, h: 3 })).toBe(9)
  })
  it('Dreieck aus drei Seiten (3-4-5 = 6 m²), unmögliches Dreieck meldet', () => {
    expect(teilflaecheM2({ id: '1', art: 'dreieck3', a: 3, b: 4, c: 5 })).toBeCloseTo(6, 10)
    const e = rechneFlaechen([{ id: '1', art: 'dreieck3', a: 1, b: 1, c: 5 }])
    expect(e.zeilen[0].flaeche).toBeUndefined()
    expect(e.hinweise[0]).toMatch(/gibt es nicht/)
  })
  it('L-Form: Rechteck minus Einschnitt; Abzüge, fehlende Maße zählen nicht', () => {
    const e = rechneFlaechen([
      { id: '1', art: 'rechteck', a: 6, b: 4 },
      { id: '2', art: 'rechteck', a: 2, b: 1.5, abzug: true },
      { id: '3', art: 'rechteck', a: 3 },
    ])
    expect(e.summe).toBe(21)
    expect(e.hinweise).toEqual([])
  })
  it('Abzüge über der Fläche: Summe 0 mit Hinweis', () => {
    const e = rechneFlaechen([{ id: '1', art: 'rechteck', a: 1, b: 1 }, { id: '2', art: 'rechteck', a: 2, b: 2, abzug: true }])
    expect(e.summe).toBe(0)
    expect(e.hinweise).toHaveLength(1)
  })
})

describe('Kubatur wie die Massenberechnung des Grundrisses', () => {
  const faelle: [string, 'flach' | 'pult' | 'sattel', number, number | undefined][] = [
    ['Flachdach', 'flach', 2.4, undefined],
    ['Pultdach', 'pult', 2.2, 3],
    ['Satteldach', 'sattel', 2.3, 3.4],
  ]
  it.each(faelle)('%s: gleiches Ergebnis wie massenVon', (_n, dachform, hoehe, hoeheOben) => {
    const r = rechneKubatur({ laenge: 5, breite: 4, dachform, hoehe, hoeheOben })!
    const g = massenVon({ punkte: rechteckPunkte(0, 0, 5, 4), dachform, hoehe, hoeheOben })
    expect(r.kubaturM3).toBe(g.kubaturM3)
    expect(r.mittlereHoehe).toBe(g.mittlereHoehe)
    expect(r.hinweise).toEqual(g.hinweise)
  })
  it('Beispielwerte: Satteldach 20 m² × 2,3 + 20 × 1,1 ÷ 2 = 57 m³', () => {
    expect(rechneKubatur({ laenge: 5, breite: 4, dachform: 'sattel', hoehe: 2.3, hoeheOben: 3.4 })!.kubaturM3).toBe(57)
  })
  it('eingegebene Fläche geht vor Länge × Breite; ohne Fläche und ohne Maße kein Ergebnis; fehlende Höhe nur Hinweis', () => {
    expect(kubaturFlaeche({ flaeche: 17.5, laenge: 5, breite: 4, dachform: 'flach' })).toBe(17.5)
    expect(rechneKubatur({ dachform: 'flach', hoehe: 2 })).toBeUndefined()
    const m = rechneKubatur({ laenge: 2, breite: 3, dachform: 'flach' })!
    expect(m.kubaturM3).toBeUndefined()
    expect(m.hinweise[0]).toMatch(/Höhe fehlt/)
  })
  it('Fläche ohne Rechteck bei geneigtem Dach: Näherungshinweis', () => {
    expect(rechneKubatur({ flaeche: 20, dachform: 'sattel', hoehe: 2.3, hoeheOben: 3.4 })!.hinweise.join(' ')).toMatch(/Näherung/)
  })
})

describe('Altersabzug wie die Bewertung', () => {
  it('Laube: Rechner = berechneBau (Abzug, €/m², Wert)', () => {
    const w = wepMit([laube])
    const e = altersRechnung(laube, w, {})!
    const h = berechneBau(w)!.laube!
    expect(e.altersabzugProzent).toBe(h.altersabzugProzent)
    expect(e.wertProM2).toBe(h.wertProM2)
    expect(e.wert).toBe(h.wert)
    expect(e.alter).toBe(2025 - 1998 + 1)
    expect(e.rnVorschlag).toBe(h.restnutzungsjahre)
  })
  it('Probewerte ändern das Bauteil nicht; eigene Restnutzung gilt', () => {
    const w = wepMit([laube])
    const vorher = JSON.stringify(laube)
    const mit10 = altersRechnung(laube, w, { restnutzungsjahre: 10 })!
    expect(mit10.restnutzungsjahre).toBe(10)
    expect(mit10.altersabzugProzent).toBeGreaterThan(altersRechnung(laube, w, {})!.altersabzugProzent)
    expect(JSON.stringify(laube)).toBe(vorher)
  })
  it('anderes Baujahr im Rechner: anderes Alter', () => {
    expect(altersRechnung(laube, wepMit([laube]), { baujahr: 2015 })!.alter).toBe(11)
  })
  it('Gewächshaus: Jahre × Minderung wie berechneBau', () => {
    const g = bt({ id: 'g', art: 'gewaechshaus', kuerzel: 'GWH', flaeche: 8, baujahr: 2015, nhk: 160, minderungProJahr: 5 })
    const w = wepMit([g])
    const e = altersRechnung(g, w, {})!
    expect(e.verfahren).toBe('linear')
    expect(e.altersabzugProzent).toBe(11 * 5)
    expect(e.wert).toBe(berechneBau(w)!.gewaechshaus!.wert)
    expect(altersRechnung(g, w, { minderungProJahr: 10 })!.abgeschrieben).toBe(true)
  })
  it('nicht bewertetes Bauteil: kein Ergebnis', () => {
    const w = wepMit([{ ...laube, nichtBewerten: true }])
    expect(bewerteEinzeln({ ...laube, nichtBewerten: true }, w).erg.laube?.wert).toBe(0)
  })
  it('Übernehmen setzt Baujahr und Restnutzung (von Hand) mit Begründung; leere Angaben ändern nichts', () => {
    const neu = uebernehmeAlter(laube, { baujahr: 2001, restnutzungsjahre: 12, rnBegruendung: ' neues Dach ' })
    expect(neu).toMatchObject({ baujahr: 2001, restnutzungsjahre: 12, rnManuell: true, rnBegruendung: 'neues Dach' })
    expect(uebernehmeAlter(laube, {})).toEqual(laube)
  })
})

describe('Ins Bauteil übernehmen', () => {
  it('Fläche und Kubatur von Hand; mit Grundriss-Verknüpfung wird ausGrundriss false', () => {
    const b = bt({ id: 'a', art: 'anbau', kuerzel: 'A1', flaeche: 3, ausGrundriss: true })
    const neu = uebernehmeMasse(b, { flaeche: 4.567, hoehe: 2.5, kubaturM3: 11.4 })
    expect(neu).toMatchObject({ flaeche: 4.57, flaecheManuell: true, hoehe: 2.5, kubaturM3: 11.4, ausGrundriss: false })
    expect(uebernehmeMasse({ ...b, ausGrundriss: undefined }, { kubaturM3: 5 }).ausGrundriss).toBeUndefined()
    expect(uebernehmeMasse(b, { flaeche: 0 }).flaeche).toBe(3)
  })
  it('übernommene Fläche fließt in die Bewertung', () => {
    const w = wepMit([laube])
    const neu = uebernehmeMasse(laube, { flaeche: 15 })
    expect(berechneBau({ ...w, bau: { ...w.bau!, bauteile: [neu] } })!.laube!.flaeche).toBe(15)
  })
})

describe('Baupreisindex', () => {
  it('rechnet mit dem Verhältnis der Indizes; Profil überschreibt; Ersatzjahre werden gemeldet', () => {
    const u = indexUmrechnung(1000, 2018, 2025)!
    expect(u.von).toBe(107.6)
    expect(u.nach).toBe(179.2)
    expect(u.betrag).toBe(1665.43)
    expect(indexUmrechnung(1000, 2018, 2025, { 2025: 200 })!.betrag).toBe(1858.74)
    expect(indexUmrechnung(1000, 2018, 2026)!.hinweise[0]).toMatch(/2026/)
    expect(indexUmrechnung(1000, 1900, 2025)).toBeUndefined()
  })
})

describe('24-m²-Check', () => {
  const anbau = bt({ id: 'a', art: 'anbau', kuerzel: 'A1', flaeche: 8, baujahr: 2004, material: 'holz', wanddickeCm: 6 })
  const vor = bt({ id: 'v', art: 'vorplatz', kuerzel: 'Ü1', flaeche: 6, baujahr: 2004 })
  const schuppen = bt({ id: 's', art: 'schuppen', kuerzel: 'S', flaeche: 5, baujahr: 2004 })
  it('Reihenfolge Laube, Anbau, Vorplatz; Rest wird nicht berechnet; Schuppen zählt nicht', () => {
    const w = wepMit([laube, anbau, vor, schuppen])
    const c = pruefeZulaessigeFlaeche(w)
    expect(c.zulaessig).toBe(24)
    expect(c.summe).toBe(34)
    expect(c.bewertet).toBe(24)
    expect(c.nichtBerechnet).toBe(10)
    expect(c.zeilen.map((z) => [z.bauteil.kuerzel, z.bewertet, z.nichtBerechnet])).toEqual([['L', 20, 0], ['A1', 4, 4], ['Ü1', 0, 6]])
    expect(c.ausgenommen.map((a) => a.bauteil.kuerzel)).toEqual(['S'])
    // gleiche Zahlen wie die Bewertung
    const erg = berechneBau(w)!
    const ohneVorplatz = c.zeilen.filter((z) => z.bauteil.art !== 'vorplatz').reduce((s, z) => s + z.nichtBerechnet, 0)
    expect(ohneVorplatz).toBe(erg.nichtBerechneteFlaeche) // die Vorlage (I38) summiert den Vorplatz nicht mit
    expect(c.hinweise.join(' ')).toMatch(/Vorplatz/)
    expect(c.wertverlust).toBeGreaterThan(0)
  })
  it('höhere zulässige Fläche (Vertragslage) probeweise und dauerhaft', () => {
    const w = wepMit([laube, anbau, vor])
    expect(pruefeZulaessigeFlaeche(w, {}, 40).nichtBerechnet).toBe(0)
    expect(pruefeZulaessigeFlaeche(w, {}, 40).frei).toBe(6)
    const neu = setzeZulaessigeFlaeche(w, 30)
    expect(neu.bau!.zulaessigeFlaeche).toBe(30)
    expect(pruefeZulaessigeFlaeche(neu).nichtBerechnet).toBe(4)
    expect(setzeZulaessigeFlaeche(neu, 24).bau!.zulaessigeFlaeche).toBeUndefined()
  })
  it('ohne Bau-Teil: leer, ohne Fehler', () => {
    const w = neuerWep('2026-902')
    expect(pruefeZulaessigeFlaeche(w).zeilen).toEqual([])
  })
})
