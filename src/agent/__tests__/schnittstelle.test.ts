// @vitest-environment node
/**
 * Agent-Schnittstelle `window.wep`: lesen() vollständig und schema-konform, Vorschlag prüfen, Fehler mit Pfad,
 * Bezug zu Positionen, Grundlage unantastbar. Testdaten ausschließlich erfunden.
 */
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { editorReducer, wendeVorschlagAn } from '../../skizze/editorZustand'
import { neuerVerlauf } from '../../skizze/verlauf'
import { istGrundlage, type SkizzeElement } from '../../skizze/types'
import { leseWep } from '../lesen'
import { schema } from '../schema'
import { pruefeVorschlag } from '../vorschlag'
import { BEISPIEL_VORSCHLAG } from './beispiel'
import { testWep } from './testwep'

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true })
const pruefer = (name: string) => {
  const s = schema() as { $defs: Record<string, unknown> }
  return ajv.compile({ $schema: 'https://json-schema.org/draft/2020-12/schema', $defs: s.$defs, $ref: `#/$defs/${name}` })
}
const lesenPruefer = pruefer('lesen')
const vorschlagPruefer = pruefer('vorschlag')
const ergebnisPruefer = pruefer('vorschlagErgebnis')
const statusPruefer = pruefer('status')

const gueltig = (v: ReturnType<typeof pruefer>, daten: unknown) => {
  const ok = v(daten)
  expect(ok, JSON.stringify(v.errors, null, 1)).toBe(true)
}

describe('schema()', () => {
  it('ist ein gültiges JSON-Schema mit Beschreibung an jedem Feld', () => {
    const s = schema() as { $defs: Record<string, unknown> }
    expect(Object.keys(s.$defs)).toEqual(expect.arrayContaining(['lesen', 'vorschlag', 'vorschlagErgebnis', 'status', 'element']))
    // jede Eigenschaft hat eine Beschreibung
    const ohne: string[] = []
    const gehe = (n: unknown, pfad: string) => {
      if (Array.isArray(n)) return n.forEach((x, i) => gehe(x, `${pfad}[${i}]`))
      if (typeof n !== 'object' || n === null) return
      const o = n as Record<string, unknown>
      if (o.properties && typeof o.properties === 'object') {
        for (const [k, v] of Object.entries(o.properties as Record<string, Record<string, unknown>>)) {
          if (!v.description && !v.$ref) ohne.push(`${pfad}.${k}`)
        }
      }
      for (const [k, v] of Object.entries(o)) gehe(v, `${pfad}.${k}`)
    }
    gehe(s.$defs, '$defs')
    expect(ohne).toEqual([])
  })
})

describe('lesen()', () => {
  const wep = testWep()
  const r = leseWep(wep, wep.skizze)

  it('entspricht dem Schema', () => {
    gueltig(lesenPruefer, r)
  })

  it('ist reines JSON (überlebt JSON.stringify unverändert)', () => {
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })

  it('enthält Formalien, Rolle, Parzelle in Metern und Vertragsfläche', () => {
    expect(r.wepId).toBe('2026-777')
    expect(r.rolle).toBe('gruen')
    expect(r.formalien).toMatchObject({ parzelle: '123', weg: 'Birkenweg', parzellenflaecheM2: 470 })
    expect(r.parzelle.vorhanden).toBe(true)
    expect(r.parzelle.breiteM).toBe(18)
    expect(r.parzelle.hoeheM).toBe(26)
    expect(r.parzelle.flaecheM2).toBe(468)
    expect(r.parzelle.vertragsflaecheM2).toBe(470)
    expect(r.parzelle.ecken).toEqual([
      { x: 0, y: 0 },
      { x: 18, y: 0 },
      { x: 18, y: 26 },
      { x: 0, y: 26 },
    ])
  })

  it('enthält den Bau-Teil mit Kürzeln, Maßen und Dachform', () => {
    expect(r.bau.vorhanden).toBe(true)
    expect(r.bau.bauteile.map((b) => b.kuerzel)).toEqual(['L', 'A1'])
    expect(r.bau.bauteile[0]).toMatchObject({ laengeM: 6, breiteM: 4, flaecheM2: 24 })
    const laube = r.bau.grundriss.find((t) => t.kuerzel === 'L')!
    expect(laube).toMatchObject({ dachform: 'sattel', traufhoeheM: 2.2, firsthoeheM: 3.1, flaecheM2: 24 })
    expect(laube.punkte[0]).toEqual({ x: 5, y: 10 })
    expect(r.bau.grundriss.find((t) => t.kuerzel === 'K')?.gestrichelt).toBe(true)
  })

  it('enthält die Grundlage (Bau-Elemente der Grün-Skizze) in Metern', () => {
    expect(r.grundlage.vorhanden).toBe(true)
    expect(r.grundlage.quelle).toBe('bau')
    expect(r.grundlage.gesperrt).toBe(true)
    expect(r.grundlage.pfostenAnzahl).toBeGreaterThan(4)
    const l = r.grundlage.elemente.find((e) => e.beschriftung === 'L')!
    expect(l.art).toBe('bauteil')
    expect(l.punkte[0].x).toBeCloseTo(5, 1)
    expect(l.punkte[0].y).toBeCloseTo(10, 1)
    expect(l.punkte[2].x - l.punkte[0].x).toBeCloseTo(6, 1)
    expect(r.grundlage.elemente.filter((e) => e.art === 'grundstueck')).toHaveLength(1)
  })

  it('enthält Aufwuchs mit Art, Menge, Einheit, Höhe und Hinweisen (invasiv, Problempflanze)', () => {
    const [apfel, , hecke, fichte, goetter] = r.gruen.aufwuchs
    expect(apfel).toMatchObject({ id: 'p-apfel', nr: 1, art: 'Apfel', menge: 2, einheit: 'Stück', zustand: 'gut', invasiv: false, problempflanze: false })
    expect(hecke).toMatchObject({ art: 'Liguster-Hecke', einheit: 'm', menge: 9, hoeheM: 1.2 })
    expect(fichte.problempflanze).toBe(true)
    expect(fichte.hinweise[0]).toMatchObject({ schwere: 'warnung' })
    expect(goetter.invasiv).toBe(true)
    expect(r.gruen.aufwuchs).toHaveLength(5)
    expect(r.gruen.aussenanlagen.map((a) => a.id)).toEqual(['a-kompost', 'a-weg', 'a-tuer'])
    expect(r.gruen.beseitigung[0]).toMatchObject({ id: 'b-fichte', gegenstand: 'Blaufichte entfernen' })
  })

  it('enthält die vorhandene Grün-Skizze im Vorschlagsformat (Meter, Mittelpunkt) und die Stile', () => {
    expect(r.skizzeGruen.mitParzelle).toBe(true)
    expect(r.skizzeGruen.elemente).toHaveLength(1)
    const s = r.skizzeGruen.elemente[0]
    expect(s).toMatchObject({ typ: 'strauch', id: 'alt-strauch', beschriftung: 'Flieder' })
    expect(s.x).toBeCloseTo(3, 1)
    expect(s.y).toBeCloseTo(5, 1)
    expect(r.stile.vorgaben.find((v) => v.id === 'wiese')).toMatchObject({ fuellung: '#C5E0B4' })
    expect(r.stile.vorgaben.find((v) => v.id === 'kompost')).toMatchObject({ fuellung: '#D9C3A5', linie: '#8B5A2B' })
    expect(r.stile.vorgaben.find((v) => v.id === 'flieder')).toMatchObject({ fuellung: '#B4A7D6', linie: '#7030A0' })
    expect(r.stile.vorgaben.find((v) => v.id === 'hinweis')).toMatchObject({ linie: '#C00000' })
    expect(r.stile.linienarten).toEqual(['durchgezogen', 'gestrichelt'])
    expect(r.stile.elementtypen.map((t) => t.typ)).toEqual(expect.arrayContaining(['baum', 'hecke', 'weg', 'tor', 'kompost', 'mangelhinweis', 'rechteck', 'ellipse', 'vieleck', 'linie', 'massangabe', 'text']))
  })

  it('ohne Parzelle gilt die Standardfläche 20 × 15 m und sagt das', () => {
    const w = testWep()
    delete w.parzelle
    const r2 = leseWep({ ...w, skizze: undefined }, undefined)
    gueltig(lesenPruefer, r2)
    expect(r2.parzelle.vorhanden).toBe(false)
    expect(r2.parzelle.hinweis).toMatch(/20 × 15 m/)
    expect(r2.skizzeGruen.mitParzelle).toBe(false)
    expect(r2.skizzeGruen.flaecheM).toEqual({ breite: 20, hoehe: 15 })
  })
})

describe('Beispielvorschlag', () => {
  it('entspricht dem Eingabe-Schema', () => {
    gueltig(vorschlagPruefer, BEISPIEL_VORSCHLAG)
  })

  it('wird geprüft und in Skizzenelemente umgerechnet (Meter → Pixel)', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    expect(g.fehler).toEqual([])
    expect(g.ok).toBe(true)
    gueltig(ergebnisPruefer, { ok: g.ok, fehler: g.fehler, hinweise: g.hinweise, zusammenfassung: g.zusammenfassung, anzahl: g.anzahl })
    expect(g.anzahl).toBe(BEISPIEL_VORSCHLAG.elemente.length)
    expect(g.elemente).toHaveLength(BEISPIEL_VORSCHLAG.elemente.length)
    expect(g.zusammenfassung).toMatch(/12 Elemente/)
    expect(g.zusammenfassung).toMatch(/3 Bäume/)
    expect(g.zusammenfassung).toMatch(/gespeichert wird erst/)
  })

  it('Bäume mit Bezug übernehmen Namen/Art der Position', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const baeume = g.elemente.filter((e) => e.typ === 'symbol' && e.art === 'baum')
    expect(baeume.map((e) => (e.typ === 'symbol' ? e.beschriftung : ''))).toEqual(['Apfel', 'Apfel', 'Birne'])
    expect(baeume[0].bezug).toEqual({ liste: 'aufwuchs', id: 'p-apfel' })
    const hecke = g.elemente.find((e) => e.typ === 'symbol' && e.art === 'hecke')
    expect(hecke).toMatchObject({ beschriftung: 'Liguster-Hecke', bezug: { liste: 'aufwuchs', id: 'p-hecke' } })
    const entf = g.elemente.find((e) => e.typ === 'symbol' && e.art === 'entfernen')
    expect(entf).toMatchObject({ beschriftung: 'Blaufichte entfernen' })
  })

  it('Wiese ist ein gefülltes Vieleck (#C5E0B4), Mängelhinweis hat einen Pfeil, Maßlinie trägt ihren Text', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const wiese = g.elemente.find((e) => e.typ === 'vieleck')
    expect(wiese).toMatchObject({ fuellung: '#C5E0B4', linie: '#70AD47', beschriftung: 'Wiese' })
    const hinweis = g.elemente.find((e) => e.typ === 'symbol' && e.art === 'mangelhinweis')
    expect(hinweis?.typ === 'symbol' && hinweis.ziel).toBeTruthy()
    const mass = g.elemente.find((e) => e.typ === 'massangabe')
    expect(mass).toMatchObject({ beschriftung: '16 m' })
    const pfeil = g.elemente.find((e) => e.typ === 'linie')
    expect(pfeil).toMatchObject({ farbe: '#C00000', pfeil: true })
  })

  it('Lage: Mittelpunkt in Metern ergibt die richtige Pixelposition (Maßstab der Parzelle)', () => {
    const wep = testWep()
    const g = pruefeVorschlag({ format: 'wep-skizze/1', elemente: [{ typ: 'rechteck', x: 9, y: 13, breite: 4, hoehe: 2 }] }, wep, wep.skizze)
    const r = g.elemente[0]
    if (r.typ !== 'rechteck') throw new Error('Rechteck erwartet')
    const m = wep.skizze!.massstab!
    expect(r.breite / m.pxProM).toBeCloseTo(4, 1)
    expect(r.hoehe / m.pxProM).toBeCloseTo(2, 1)
    expect((r.x + r.breite / 2 - m.ox) / m.pxProM).toBeCloseTo(9, 1)
    expect((r.y + r.hoehe / 2 - m.oy) / m.pxProM).toBeCloseTo(13, 1)
  })

  it('Rückweg: lesen() liefert Elemente, die als Vorschlag wieder gültig sind (gleiche Lage)', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const mitVorschlag = { ...wep, skizze: { ...wep.skizze!, elemente: wendeVorschlagAn(wep.skizze!.elemente, { elemente: g.elemente, modus: 'ergaenzen' }) } }
    const gelesen = leseWep(mitVorschlag, mitVorschlag.skizze)
    gueltig(lesenPruefer, gelesen)
    expect(gelesen.skizzeGruen.elemente).toHaveLength(1 + g.elemente.length)
    const wieder = pruefeVorschlag({ format: 'wep-skizze/1', modus: 'gruen-ersetzen', elemente: gelesen.skizzeGruen.elemente }, mitVorschlag, mitVorschlag.skizze)
    expect(wieder.fehler).toEqual([])
    expect(wieder.ok).toBe(true)
    const mitte = (e: SkizzeElement) => (e.typ === 'symbol' || e.typ === 'rechteck' ? [e.x + e.breite / 2, e.y + e.hoehe / 2] : null)
    const vorher = mitVorschlag.skizze!.elemente.filter((e) => !istGrundlage(e))
    vorher.forEach((e, i) => {
      const a = mitte(e)
      const b = mitte(wieder.elemente[i])
      if (a && b) {
        expect(b[0]).toBeCloseTo(a[0], 0)
        expect(b[1]).toBeCloseTo(a[1], 0)
      }
    })
  })

  it('gibt Hinweise (kein Fehler): außerhalb der Parzelle, Baum auf dem Gebäude, Positionen ohne Element', () => {
    const wep = testWep()
    const g = pruefeVorschlag(
      {
        format: 'wep-skizze/1',
        elemente: [
          { typ: 'baum', x: 30, y: 5, beschriftung: 'Eiche' },
          { typ: 'baum', x: 8, y: 12, beschriftung: 'Linde' },
          { typ: 'baum', x: 14, y: 5, bezug: { liste: 'aufwuchs', id: 'p-apfel' } },
        ],
      },
      wep,
      wep.skizze,
    )
    expect(g.ok).toBe(true)
    expect(g.hinweise.some((h) => /außerhalb der Parzelle/.test(h))).toBe(true)
    expect(g.hinweise.some((h) => /Bauteil „L“/.test(h))).toBe(true)
    expect(g.hinweise.some((h) => /Aufwuchs-Positionen ohne Element/.test(h) && /Birne/.test(h))).toBe(true)
  })
})

describe('Prüfung: verständliche Fehler mit Pfad', () => {
  const wep = testWep()
  const fehler = (v: unknown) => pruefeVorschlag(v, wep, wep.skizze)
  const mit = (e: unknown, extra: Record<string, unknown> = {}) => fehler({ format: 'wep-skizze/1', elemente: [e], ...extra })

  it('Format und Modus', () => {
    expect(fehler({ elemente: [{ typ: 'baum', x: 1, y: 1 }] }).fehler[0]).toMatchObject({ pfad: 'format' })
    expect(mit({ typ: 'baum', x: 1, y: 1 }, { modus: 'loeschen' }).fehler[0]).toMatchObject({ pfad: 'modus' })
    expect(fehler('{kaputt').fehler[0].meldung).toMatch(/kein gültiges JSON/)
    expect(fehler(null).fehler[0].meldung).toMatch(/ist ein Objekt/)
    expect(fehler({ format: 'wep-skizze/1', elemente: [] }).fehler[0]).toMatchObject({ pfad: 'elemente' })
  })

  it('unbekannter Typ, fehlende und falsche Zahlen, unbekannte Felder', () => {
    const f1 = mit({ typ: 'palme', x: 1, y: 1 })
    expect(f1.ok).toBe(false)
    expect(f1.fehler[0]).toMatchObject({ pfad: 'elemente[0].typ' })
    expect(f1.fehler[0].meldung).toMatch(/Unbekannter Typ „palme“/)
    expect(f1.elemente).toEqual([])
    expect(f1.anzahl).toBe(0)

    const f2 = fehler({ format: 'wep-skizze/1', elemente: [{ typ: 'baum', x: 1, y: 1 }, { typ: 'baum', x: '3', y: 1 }, { typ: 'rechteck', x: 1, y: 1, breite: 2 }] })
    expect(f2.fehler.map((f) => f.pfad)).toEqual(['elemente[1].x', 'elemente[2].hoehe'])
    expect(f2.fehler[0].meldung).toMatch(/Zahl in Metern/)

    const f3 = mit({ typ: 'baum', x: 1, y: 1, farbe: 'rot' })
    expect(f3.fehler[0]).toMatchObject({ pfad: 'elemente[0].farbe' })
    expect(f3.fehler[0].meldung).toMatch(/Erlaubt:/)

    expect(mit({ typ: 'rechteck', x: 1, y: 1, breite: -2, hoehe: 1 }).fehler[0].pfad).toBe('elemente[0].breite')
    expect(mit({ typ: 'baum', x: 5000, y: 1 }).fehler[0].meldung).toMatch(/außerhalb des erlaubten Bereichs/)
  })

  it('Farben, Linienart, Vorgaben', () => {
    expect(mit({ typ: 'rechteck', x: 1, y: 1, breite: 2, hoehe: 2, fuellung: 'blau-ish' }).fehler[0].pfad).toBe('elemente[0].fuellung')
    expect(mit({ typ: 'rechteck', x: 1, y: 1, breite: 2, hoehe: 2, linienart: 'punktiert' }).fehler[0].pfad).toBe('elemente[0].linienart')
    expect(mit({ typ: 'rechteck', x: 1, y: 1, breite: 2, hoehe: 2, stil: 'neon' }).fehler[0].pfad).toBe('elemente[0].stil')
    const ok = mit({ typ: 'rechteck', x: 5, y: 5, breite: 2, hoehe: 2, stil: 'kompost', linienart: 'gestrichelt', linie: '#112233' })
    expect(ok.fehler).toEqual([])
    expect(ok.elemente[0]).toMatchObject({ fuellung: '#D9C3A5', linie: '#112233', linienart: 'gestrichelt' })
    // keine Füllung
    expect(mit({ typ: 'rechteck', x: 5, y: 5, breite: 2, hoehe: 2, stil: 'wiese', fuellung: null }).elemente[0]).not.toHaveProperty('fuellung')
    // Farben in Kleinbuchstaben ohne # werden angenommen
    expect(mit({ typ: 'ellipse', x: 5, y: 5, breite: 2, hoehe: 1, fuellung: 'c5e0b4' }).elemente[0]).toMatchObject({ fuellung: '#C5E0B4' })
  })

  it('Bezug auf Positionen', () => {
    const f = mit({ typ: 'baum', x: 1, y: 1, bezug: { liste: 'aufwuchs', id: 'gibt-es-nicht' } })
    expect(f.fehler[0].pfad).toBe('elemente[0].bezug.id')
    expect(f.fehler[0].meldung).toMatch(/Keine Position „gibt-es-nicht“ in „aufwuchs“\. Vorhanden: p-apfel/)
    expect(mit({ typ: 'baum', x: 1, y: 1, bezug: { liste: 'garten', id: 'x' } }).fehler[0].pfad).toBe('elemente[0].bezug.liste')
    expect(mit({ typ: 'baum', x: 1, y: 1, bezug: 'p-apfel' }).fehler[0].pfad).toBe('elemente[0].bezug')
  })

  it('Vieleck, Linie, Maß, Text, Mängelhinweis', () => {
    expect(mit({ typ: 'vieleck', punkte: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }).fehler[0]).toMatchObject({ pfad: 'elemente[0].punkte' })
    expect(mit({ typ: 'vieleck', punkte: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3 }] }).fehler[0].pfad).toBe('elemente[0].punkte[2].y')
    expect(mit({ typ: 'linie', von: { x: 1, y: 1 } }).fehler[0].pfad).toBe('elemente[0].nach')
    expect(mit({ typ: 'linie', von: { x: 1, y: 1 }, nach: { x: 2, y: 2 }, pfeil: 'ja' }).fehler[0].pfad).toBe('elemente[0].pfeil')
    expect(mit({ typ: 'massangabe', von: { x: 1, y: 1 }, nach: { x: 1, y: 1 } }).fehler[0].meldung).toMatch(/aufeinander/)
    expect(mit({ typ: 'text', x: 1, y: 1 }).fehler[0].pfad).toBe('elemente[0].inhalt')
    expect(mit({ typ: 'mangelhinweis', x: 1, y: 1 }).fehler[0]).toMatchObject({ pfad: 'elemente[0].beschriftung' })
    expect(mit({ typ: 'baum', x: 1, y: 1, ziel: { x: 2, y: 2 } }).fehler[0].pfad).toBe('elemente[0].ziel')
    // Maßlinie ohne Text: berechnete Länge mit Komma
    const m = mit({ typ: 'massangabe', von: { x: 1, y: 1 }, nach: { x: 5.5, y: 1 } })
    expect(m.elemente[0]).toMatchObject({ beschriftung: '4,5 m' })
  })

  it('alles oder nichts: ein Fehler verhindert die Anzeige der übrigen Elemente', () => {
    const f = fehler({ format: 'wep-skizze/1', elemente: [{ typ: 'baum', x: 1, y: 1 }, { typ: 'baum', y: 1 }] })
    expect(f.ok).toBe(false)
    expect(f.elemente).toEqual([])
    expect(f.zusammenfassung).toMatch(/Nichts angezeigt: 1 Fehler/)
  })

  it('ohne Grün-Teil (Rolle bau) gibt es keine Grün-Skizze', () => {
    const w = { ...testWep(), rolle: 'bau' as const }
    const f = pruefeVorschlag(BEISPIEL_VORSCHLAG, w, w.skizze)
    expect(f.ok).toBe(false)
    expect(f.fehler[0].meldung).toMatch(/keinen Grün-Teil/)
  })
})

describe('Übernehmen, Verwerfen, Rückgängig; Grundlage bleibt unangetastet', () => {
  const wep = testWep()
  const vorher = wep.skizze!.elemente
  const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
  const start = { elemente: vorher, ausgewaehlt: null, verlauf: neuerVerlauf() }
  const grundlage = (els: readonly SkizzeElement[]) => JSON.stringify(els.filter(istGrundlage))

  it('Verwerfen ändert nichts (der Vorschlag ist nie Teil der Skizze)', () => {
    expect(vorher.some((e) => g.elemente.some((n) => n.id === e.id))).toBe(false)
    expect(start.elemente).toBe(vorher)
  })

  it('Übernehmen (ergänzen): Elemente kommen dazu, Grundlage unverändert, ein Rückgängig-Schritt', () => {
    const neu = editorReducer(start, { typ: 'elemente-ersetzen', elemente: wendeVorschlagAn(start.elemente, { elemente: g.elemente, modus: 'ergaenzen' }) })
    expect(neu.elemente).toHaveLength(vorher.length + g.elemente.length)
    expect(grundlage(neu.elemente)).toBe(grundlage(vorher))
    expect(neu.elemente.some((e) => e.id === 'alt-strauch')).toBe(true)
    // ein einziger Schritt zurück stellt den Stand davor her
    const zurueck = editorReducer(neu, { typ: 'undo' })
    expect(zurueck.elemente).toEqual(vorher)
    // und wieder vor
    expect(editorReducer(zurueck, { typ: 'redo' }).elemente).toHaveLength(vorher.length + g.elemente.length)
  })

  it('Übernehmen (gruen-ersetzen): bisheriges Grün weg, Grundlage unverändert, rückgängig machbar', () => {
    const neu = editorReducer(start, { typ: 'elemente-ersetzen', elemente: wendeVorschlagAn(start.elemente, { elemente: g.elemente, modus: 'gruen-ersetzen' }) })
    expect(neu.elemente.some((e) => e.id === 'alt-strauch')).toBe(false)
    expect(neu.elemente.filter((e) => !istGrundlage(e))).toHaveLength(g.elemente.length)
    expect(grundlage(neu.elemente)).toBe(grundlage(vorher))
    expect(editorReducer(neu, { typ: 'undo' }).elemente).toEqual(vorher)
  })

  it('Der Vorschlag kann keine Grundlage-Elemente erzeugen oder verändern', () => {
    expect(g.elemente.every((e) => !istGrundlage(e) && !e.fest)).toBe(true)
    const f = pruefeVorschlag({ format: 'wep-skizze/1', elemente: [{ typ: 'baum', x: 1, y: 1, ebene: 'grundlage' }] }, wep, wep.skizze)
    expect(f.ok).toBe(false)
    expect(f.fehler[0].pfad).toBe('elemente[0].ebene')
  })
})

describe('status()-Schema', () => {
  it('Beispielwerte entsprechen dem Schema', () => {
    gueltig(statusPruefer, { offen: false, zustand: 'kein-vorschlag', nr: 0, anzahl: null, modus: null, entschiedenAm: null })
    gueltig(statusPruefer, { offen: true, zustand: 'offen', nr: 2, anzahl: 12, modus: 'ergaenzen', entschiedenAm: null })
    gueltig(statusPruefer, { offen: false, zustand: 'uebernommen', nr: 2, anzahl: 12, modus: 'gruen-ersetzen', entschiedenAm: '2026-10-23T10:00:00.000Z' })
  })
})
