// @vitest-environment node
// Beta 4, Paket 3: Grundriss → Bauteile (Fläche, Maße, Höhe, Kubatur fließen in die Bewertung). Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { neuerWep, neueBauDaten, type Bauteil, type Wep } from '@/model'
import { berechneBau, bauteileOhneGrundriss, bauteilMitGrundriss, hinweiseBau, kubaturVon, nurGezeichnet, teileVon, uebernehmeGrundriss } from '..'
import { neuesBauteil } from '@/app/bauHelfer'
import { rechteckPunkte, type GrundrissDaten } from '@/skizze/grundriss'

function wep(): Wep {
  const w = neuerWep('2026-853')
  w.formalien.wertermittlungAm = '2025-06-10'
  w.bau = neueBauDaten()
  const laube: Bauteil = {
    ...neuesBauteil('laube', []), id: 'l1', laenge: 4, breite: 5, flaeche: 20, baujahr: 1998, material: 'holz-doppelwandig', wanddickeCm: 12,
  }
  const anbau: Bauteil = { ...neuesBauteil('anbau', [laube]), id: 'a1', flaeche: 0 }
  w.bau.bauteile.push(laube, anbau)
  return w
}

const grundriss: GrundrissDaten = {
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteckPunkte(0, 0, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteckPunkte(6, 1, 2, 3), hoehe: 2.3 },
    { id: 'g3', kuerzel: 'Terrasse', punkte: rechteckPunkte(0, 4, 6, 2) },
  ],
}

describe('Grundriss → Bauteile', () => {
  it('übernimmt Fläche, Länge × Breite, mittlere Höhe und Kubatur', () => {
    const w = uebernehmeGrundriss({ ...wep(), grundriss }, grundriss)
    const l = w.bau!.bauteile.find((b) => b.id === 'l1')!
    expect(l).toMatchObject({ flaeche: 24, laenge: 6, breite: 4, kubaturM3: 63.6, hoehe: 2.65, ausGrundriss: true, flaecheManuell: true })
    const a = w.bau!.bauteile.find((b) => b.id === 'a1')!
    expect(a).toMatchObject({ flaeche: 6, laenge: 3, breite: 2, kubaturM3: 13.8, hoehe: 2.3 })
    // Fläche × Höhe = Kubatur bleibt stimmig, auch wenn kubaturM3 später fehlt
    expect(kubaturVon({ ...l, kubaturM3: undefined })).toBeCloseTo(63.6, 1)
  })

  it('die Fläche fließt in die Bewertung (Laube 24 m² statt 20 m²)', () => {
    const vorher = berechneBau(wep())!
    const w = uebernehmeGrundriss({ ...wep(), grundriss })
    const nachher = berechneBau(w)!
    const flaeche = (e: ReturnType<typeof berechneBau>) => e!.laube!.flaeche
    expect(flaeche(vorher)).toBe(20)
    expect(flaeche(nachher)).toBe(24)
    expect(nachher.laube!.herstellungswert ?? nachher.laube!.wert).not.toBe(vorher.laube!.herstellungswert ?? vorher.laube!.wert)
  })

  it('Teile ohne Bauteil (Terrasse) ändern nichts; das WEP bleibt dasselbe Objekt, wenn nichts zu tun ist', () => {
    const w = uebernehmeGrundriss({ ...wep(), grundriss })
    expect(uebernehmeGrundriss(w)).toBe(w)
    expect(uebernehmeGrundriss({ ...wep(), grundriss: { teile: [grundriss.teile[2]] } }).bau!.bauteile[0].flaeche).toBe(20)
    expect(uebernehmeGrundriss(wep())).toEqual(wep()) // ohne Grundriss
    const ohneBau = neuerWep('x')
    expect(uebernehmeGrundriss({ ...ohneBau, grundriss })).toEqual({ ...ohneBau, grundriss })
  })

  it('Form gelöscht: Bauteil bleibt, verliert aber Fläche und Maße aus der Form (kein Phantom mehr)', () => {
    const w1 = uebernehmeGrundriss({ ...wep(), grundriss })
    expect(w1.bau!.bauteile.map((b) => b.flaeche)).toEqual([24, 6])
    const w2 = uebernehmeGrundriss({ ...w1, grundriss: { teile: [grundriss.teile[2]] } })
    expect(w2.bau!.bauteile.map((b) => [b.id, b.flaeche])).toEqual([['l1', 0], ['a1', 0]])
    const l = w2.bau!.bauteile[0]
    expect(l.baujahr).toBe(1998)
    expect(l.ausGrundriss).toBeUndefined()
    expect(l.laenge).toBeUndefined()
    expect(l.kubaturM3).toBeUndefined()
    expect(berechneBau(w2)!.laube!.flaeche).toBe(0)
    expect(bauteileOhneGrundriss(w2).map((b) => b.id)).toEqual(['l1', 'a1'])
    expect(uebernehmeGrundriss(w2)).toBe(w2)
    // von Hand gesetzte Fläche (ausGrundriss false) bleibt auch ohne Form
    const w3 = wep()
    w3.bau!.bauteile[0] = { ...w3.bau!.bauteile[0], flaeche: 22.5, flaecheManuell: true, ausGrundriss: false }
    expect(uebernehmeGrundriss({ ...w3, grundriss: { teile: [] } }).bau!.bauteile[0].flaeche).toBe(22.5)
  })

  it('nurGezeichnet: Voreinstellungen zählen nicht, jede eigene Angabe schon', () => {
    expect(nurGezeichnet(neuesBauteil('gewaechshaus', []))).toBe(true)
    expect(nurGezeichnet(neuesBauteil('keller', []))).toBe(true)
    expect(nurGezeichnet({ ...neuesBauteil('gewaechshaus', []), nhk: 120 })).toBe(false)
    expect(nurGezeichnet({ ...neuesBauteil('laube', []), typ: 'Stein 10,00 - 12,00 cm' })).toBe(false)
    expect(nurGezeichnet({ ...neuesBauteil('laube', []), maengel: [{ gruppe: 'dach', maengel: [], abzug: 5, begruendung: '' }] })).toBe(false)
  })

  it('der Wertermittler kann überschreiben: ausGrundriss=false schützt die Handeingabe', () => {
    const w = wep()
    w.bau!.bauteile[0] = { ...w.bau!.bauteile[0], flaeche: 22.5, flaecheManuell: true, ausGrundriss: false }
    const neu = uebernehmeGrundriss({ ...w, grundriss })
    expect(neu.bau!.bauteile[0].flaeche).toBe(22.5)
    expect(neu.bau!.bauteile[1].flaeche).toBe(6) // Anbau übernimmt weiter
    // wieder freigeben
    w.bau!.bauteile[0] = { ...w.bau!.bauteile[0], ausGrundriss: undefined }
    expect(uebernehmeGrundriss({ ...w, grundriss }).bau!.bauteile[0].flaeche).toBe(24)
  })

  it('Maße im Grundriss ändern → Bauteil folgt', () => {
    const w1 = uebernehmeGrundriss({ ...wep(), grundriss })
    const g2: GrundrissDaten = { teile: [{ ...grundriss.teile[0], punkte: rechteckPunkte(0, 0, 7, 4) }, grundriss.teile[1]] }
    const w2 = uebernehmeGrundriss({ ...w1, grundriss: g2 })
    expect(w2.bau!.bauteile[0]).toMatchObject({ flaeche: 28, laenge: 7, breite: 4 })
  })

  it('Gewächshaus: Höhe = Firsthöhe (für die Warnung ab 2,20 m)', () => {
    const w = wep()
    const gwh: Bauteil = { ...neuesBauteil('gewaechshaus', []), id: 'gw', flaeche: 0 }
    w.bau!.bauteile.push(gwh)
    const g: GrundrissDaten = { teile: [{ id: 'g', kuerzel: 'GWH', bauteilId: 'gw', punkte: rechteckPunkte(0, 0, 3, 3), hoehe: 1.8, dachform: 'sattel', hoeheOben: 2.5 }] }
    const neu = uebernehmeGrundriss({ ...w, grundriss: g })
    const b = neu.bau!.bauteile.find((x) => x.id === 'gw')!
    expect(b.hoehe).toBe(2.5)
    expect(b.flaeche).toBe(9)
    expect(hinweiseBau(neu).some((h) => /Firsthöhe|2,20/.test(h.text))).toBe(true)
  })

  it('ohne Höhe kommt nur die Fläche; vorhandene Höhe/Kubatur bleibt', () => {
    const w = wep()
    w.bau!.bauteile[0] = { ...w.bau!.bauteile[0], hoehe: 2.4, kubaturM3: 50 }
    const g: GrundrissDaten = { teile: [{ id: 'g', kuerzel: 'L', bauteilId: 'l1', punkte: rechteckPunkte(0, 0, 6, 4) }] }
    const b = uebernehmeGrundriss({ ...w, grundriss: g }).bau!.bauteile[0]
    expect(b).toMatchObject({ flaeche: 24, hoehe: 2.4, kubaturM3: 50 })
  })

  it('bauteilMitGrundriss ist ohne Änderung dasselbe Objekt', () => {
    const w = uebernehmeGrundriss({ ...wep(), grundriss })
    const b = w.bau!.bauteile[0]
    expect(bauteilMitGrundriss(b, { bauteilId: 'l1', flaeche: 24, laenge: 6, breite: 4, hoeheMittel: 2.65, kubaturM3: 63.6 })).toBe(b)
  })

  it('Hilfen: Teile eines Bauteils, Bauteile ohne Grundriss', () => {
    const w = { ...wep(), grundriss }
    expect(teileVon(grundriss, 'l1').map((t) => t.id)).toEqual(['g1'])
    expect(bauteileOhneGrundriss({ ...w, grundriss: { teile: [grundriss.teile[0]] } }).map((b) => b.kuerzel)).toEqual(['A1'])
    expect(bauteileOhneGrundriss(wep()).map((b) => b.id)).toEqual(['l1', 'a1'])
  })
})
