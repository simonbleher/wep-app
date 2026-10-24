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
import { baustein, bausteinInfos } from '../bausteine'
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
const bausteinPruefer = pruefer('bausteinErgebnis')

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
    expect(s).toMatchObject({ typ: 'symbol', art: 'strauch', id: 'alt-strauch', beschriftung: 'Flieder' })
    expect(s.x).toBeCloseTo(3, 1)
    expect(s.y).toBeCloseTo(5, 1)
    expect(r.stile.vorgaben.find((v) => v.id === 'wiese')).toMatchObject({ fuellung: '#C5E0B4' })
    expect(r.stile.vorgaben.find((v) => v.id === 'kompost')).toMatchObject({ fuellung: '#D9C3A5', linie: '#8B5A2B' })
    expect(r.stile.vorgaben.find((v) => v.id === 'flieder')).toMatchObject({ fuellung: '#B4A7D6', linie: '#7030A0' })
    expect(r.stile.vorgaben.find((v) => v.id === 'hinweis')).toMatchObject({ linie: '#C00000' })
    expect(r.stile.linienarten).toEqual(['durchgezogen', 'gestrichelt'])
    expect(r.stile.elementtypen.map((t) => t.typ)).toEqual(['rechteck', 'ellipse', 'vieleck', 'bogen', 'linie', 'massangabe', 'text'])
    expect(r.stile.bausteine.map((b) => b.name)).toEqual(expect.arrayContaining(['baum', 'hecke', 'weg', 'tor', 'kompost', 'entfernen', 'mangelhinweis']))
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

const N = BEISPIEL_VORSCHLAG.elemente.length

describe('Beispielvorschlag (nur Grundformen)', () => {
  it('entspricht dem Eingabe-Schema', () => {
    gueltig(vorschlagPruefer, BEISPIEL_VORSCHLAG)
  })

  it('besteht nur aus Grundformen', () => {
    const typen = new Set(BEISPIEL_VORSCHLAG.elemente.map((e) => e.typ))
    expect([...typen].every((t) => ['rechteck', 'ellipse', 'vieleck', 'bogen', 'linie', 'massangabe', 'text'].includes(t))).toBe(true)
    expect(typen).toEqual(new Set(['vieleck', 'rechteck', 'linie', 'bogen', 'ellipse', 'text', 'massangabe']))
  })

  it('wird geprüft und in Skizzenelemente umgerechnet (Meter → Pixel)', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    expect(g.fehler).toEqual([])
    expect(g.ok).toBe(true)
    gueltig(ergebnisPruefer, { ok: g.ok, fehler: g.fehler, hinweise: g.hinweise, zusammenfassung: g.zusammenfassung, anzahl: g.anzahl })
    expect(g.anzahl).toBe(N)
    expect(g.elemente).toHaveLength(N)
    expect(g.zusammenfassung).toMatch(new RegExp(`${N} Elemente`))
    expect(g.zusammenfassung).toMatch(/Dreieck/)
    expect(g.zusammenfassung).toMatch(/Linienzug/)
    expect(g.zusammenfassung).toMatch(/gespeichert wird erst/)
    // alles ist frei gezeichnet (Reihenfolge der Liste zählt) und nie ein Symbol
    expect(g.elemente.every((e) => e.frei === true && e.typ !== 'symbol')).toBe(true)
  })

  it('Dreieck, eigene Linienfarbe und -stärke unabhängig von der Füllung', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const dreieck = g.elemente.find((e) => e.typ === 'vieleck' && e.name === 'Dreieckbeet')
    expect(dreieck).toMatchObject({ typ: 'vieleck', fuellung: '#EBDDC7', linie: '#7030A0', linienbreite: 2 })
    expect(dreieck?.typ === 'vieleck' && dreieck.punkte).toHaveLength(3)
    const wiese = g.elemente.find((e) => e.typ === 'vieleck' && e.name === 'Wiese')
    expect(wiese).toMatchObject({ fuellung: '#C5E0B4', linie: '#70AD47', beschriftung: 'Wiese' })
  })

  it('Bezug zu Aufwuchs-Positionen: nur am ersten Element je Baum, keine Überzählung', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const mitBezug = g.elemente.filter((e) => e.bezug)
    expect(mitBezug.map((e) => e.bezug?.id)).toEqual(['p-apfel', 'p-apfel', 'p-birne', 'p-hecke', 'p-fichte'])
    expect(g.hinweise.some((h) => /Zur Position .* gehören/.test(h))).toBe(false)
    expect(g.hinweise.some((h) => /Aufwuchs-Positionen ohne Element/.test(h) && /Götterbaum/.test(h))).toBe(true)
  })

  it('der Bogen wird zu einem offenen Linienzug; das Tor hat Linie und Viertelbogen', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const bogen = g.elemente.find((e) => e.typ === 'vieleck' && e.name === 'Tor_Bogen')
    expect(bogen).toMatchObject({ offen: true, linie: '#262626' })
    if (bogen?.typ !== 'vieleck') throw new Error('Vieleck erwartet')
    expect(bogen.punkte.length).toBeGreaterThan(8)
    const m = wep.skizze!.massstab!
    const mm = (p: { x: number; y: number }) => ({ x: (p.x - m.ox) / m.pxProM, y: (p.y - m.oy) / m.pxProM })
    // 180° bis 270°, Mittelpunkt (10,4 | 25,8), Radius 1,2: Anfang links vom Mittelpunkt, Ende darüber
    expect(mm(bogen.punkte[0]).x).toBeCloseTo(9.2, 1)
    expect(mm(bogen.punkte[0]).y).toBeCloseTo(25.8, 1)
    expect(mm(bogen.punkte[bogen.punkte.length - 1]).x).toBeCloseTo(10.4, 1)
    expect(mm(bogen.punkte[bogen.punkte.length - 1]).y).toBeCloseTo(24.6, 1)
  })

  it('Lage: Mittelpunkt in Metern ergibt die richtige Pixelposition (Maßstab der Parzelle)', () => {
    const wep = testWep()
    const g = pruefeVorschlag({ format: 'wep-skizze/2', elemente: [{ typ: 'rechteck', x: 9, y: 13, breite: 4, hoehe: 2 }] }, wep, wep.skizze)
    const r = g.elemente[0]
    if (r.typ !== 'rechteck') throw new Error('Rechteck erwartet')
    const m = wep.skizze!.massstab!
    expect(r.breite / m.pxProM).toBeCloseTo(4, 1)
    expect(r.hoehe / m.pxProM).toBeCloseTo(2, 1)
    expect((r.x + r.breite / 2 - m.ox) / m.pxProM).toBeCloseTo(9, 1)
    expect((r.y + r.hoehe / 2 - m.oy) / m.pxProM).toBeCloseTo(13, 1)
  })

  it('Text: Farbe und Größe in pt; Text ohne Inhalt mit Bezug nimmt den Kurznamen', () => {
    const wep = testWep()
    const g = pruefeVorschlag(
      { format: 'wep-skizze/2', elemente: [{ typ: 'text', x: 5, y: 5, inhalt: 'Laube', farbe: '#C00000', groesse: 12 }, { typ: 'text', x: 5, y: 7, bezug: { liste: 'aufwuchs', id: 'p-apfel' } }] },
      wep,
      wep.skizze,
    )
    expect(g.ok).toBe(true)
    expect(g.elemente[0]).toMatchObject({ typ: 'text', farbe: '#C00000' })
    const px = (g.elemente[0] as { schriftgroesse: number }).schriftgroesse
    expect(px / ((wep.skizze!.breite ?? 800) / 452)).toBeCloseTo(12, 0)
    expect(g.elemente[1]).toMatchObject({ typ: 'text', inhalt: 'Apfel' })
  })

  it('Rückweg: lesen() liefert Grundformen, die als Vorschlag wieder gültig sind', () => {
    const wep = testWep()
    const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
    const mitVorschlag = { ...wep, skizze: { ...wep.skizze!, elemente: wendeVorschlagAn(wep.skizze!.elemente, { elemente: g.elemente, modus: 'ergaenzen' }) } }
    const gelesen = leseWep(mitVorschlag, mitVorschlag.skizze)
    gueltig(lesenPruefer, gelesen)
    expect(gelesen.skizzeGruen.elemente).toHaveLength(1 + N)
    // das Symbol des Nutzers kommt als „symbol“ (nur lesend), die übrigen als Grundformen
    const grund = gelesen.skizzeGruen.elemente.filter((e) => e.typ !== 'symbol')
    expect(grund).toHaveLength(N)
    const wieder = pruefeVorschlag({ format: 'wep-skizze/2', modus: 'gruen-ersetzen', elemente: grund }, mitVorschlag, mitVorschlag.skizze)
    expect(wieder.fehler).toEqual([])
    expect(wieder.ok).toBe(true)
    // gleiche Lage (Mittelpunkte der Rechtecke und Kreise)
    const mitte = (e: SkizzeElement) => (e.typ === 'rechteck' ? [e.x + e.breite / 2, e.y + e.hoehe / 2] : e.typ === 'kreis' ? [e.cx, e.cy] : null)
    const vorher = g.elemente
    vorher.forEach((e, i) => {
      const a = mitte(e)
      const b = mitte(wieder.elemente[i])
      if (a && b) {
        expect(b[0]).toBeCloseTo(a[0], 0)
        expect(b[1]).toBeCloseTo(a[1], 0)
      }
    })
    // der Hinweis nennt, dass das Symbol des Nutzers wegfällt
    expect(wieder.hinweise.some((h) => /ersetzt .* Grün-Elemente.*1 Symbole/.test(h))).toBe(true)
  })

  it('gibt Hinweise (kein Fehler): Mitte außerhalb der Parzelle', () => {
    const wep = testWep()
    const g = pruefeVorschlag({ format: 'wep-skizze/2', elemente: [{ typ: 'ellipse', name: 'Krone', x: 30, y: 5, breite: 2, hoehe: 2 }] }, wep, wep.skizze)
    expect(g.ok).toBe(true)
    expect(g.hinweise.some((h) => /Krone/.test(h) && /außerhalb der Parzelle/.test(h))).toBe(true)
  })
})

describe('Prüfung: verständliche Fehler mit Pfad', () => {
  const wep = testWep()
  const fehler = (v: unknown) => pruefeVorschlag(v, wep, wep.skizze)
  const mit = (e: unknown, extra: Record<string, unknown> = {}) => fehler({ format: 'wep-skizze/2', elemente: [e], ...extra })
  const kreis = { typ: 'ellipse', x: 1, y: 1, breite: 1, hoehe: 1 }

  it('Format und Modus', () => {
    expect(fehler({ elemente: [kreis] }).fehler[0]).toMatchObject({ pfad: 'format' })
    expect(fehler({ format: 'wep-skizze/1', elemente: [kreis] }).fehler[0]).toMatchObject({ pfad: 'format' })
    expect(mit(kreis, { modus: 'loeschen' }).fehler[0]).toMatchObject({ pfad: 'modus' })
    expect(fehler('{kaputt').fehler[0].meldung).toMatch(/kein gültiges JSON/)
    expect(fehler(null).fehler[0].meldung).toMatch(/ist ein Objekt/)
    expect(fehler({ format: 'wep-skizze/2', elemente: [] }).fehler[0]).toMatchObject({ pfad: 'elemente' })
  })

  it('Symbole und fertige Formen sind keine Grundformen: Fehler verweist auf Grundformen und baustein()', () => {
    const f = mit({ typ: 'baum', x: 3, y: 4 })
    expect(f.ok).toBe(false)
    expect(f.fehler[0].pfad).toBe('elemente[0].typ')
    expect(f.fehler[0].meldung).toMatch(/keine Grundform/)
    expect(f.fehler[0].meldung).toMatch(/baustein\('baum'/)
    expect(mit({ typ: 'symbol', x: 3, y: 4 }).fehler[0].meldung).toMatch(/keine Grundform/)
    const f2 = mit({ typ: 'palme', x: 1, y: 1 })
    expect(f2.fehler[0].meldung).toMatch(/Unbekannter Typ „palme“/)
    expect(f2.elemente).toEqual([])
  })

  it('fehlende und falsche Zahlen, unbekannte Felder', () => {
    const f2 = fehler({ format: 'wep-skizze/2', elemente: [kreis, { ...kreis, x: '3' }, { typ: 'rechteck', x: 1, y: 1, breite: 2 }] })
    expect(f2.fehler.map((f) => f.pfad)).toEqual(['elemente[1].x', 'elemente[2].hoehe'])
    expect(f2.fehler[0].meldung).toMatch(/Zahl in Metern/)
    const f3 = mit({ ...kreis, drehung: 45 })
    expect(f3.fehler[0]).toMatchObject({ pfad: 'elemente[0].drehung' })
    expect(f3.fehler[0].meldung).toMatch(/Erlaubt:/)
    expect(mit({ typ: 'rechteck', x: 1, y: 1, breite: -2, hoehe: 1 }).fehler[0].pfad).toBe('elemente[0].breite')
    expect(mit({ ...kreis, x: 5000 }).fehler[0].meldung).toMatch(/außerhalb des erlaubten Bereichs/)
    expect(mit({ ...kreis, ebene: 'grundlage' }).fehler[0].pfad).toBe('elemente[0].ebene')
  })

  it('Farben, Linienart, Linienstärke, Vorgaben', () => {
    expect(mit({ ...kreis, fuellung: 'blau-ish' }).fehler[0].pfad).toBe('elemente[0].fuellung')
    expect(mit({ ...kreis, linienart: 'punktiert' }).fehler[0].pfad).toBe('elemente[0].linienart')
    expect(mit({ ...kreis, linienbreite: 50 }).fehler[0].pfad).toBe('elemente[0].linienbreite')
    expect(mit({ ...kreis, linienbreite: 'dick' }).fehler[0].meldung).toMatch(/Linienstärke in pt/)
    expect(mit({ ...kreis, stil: 'neon' }).fehler[0].pfad).toBe('elemente[0].stil')
    const ok = mit({ typ: 'rechteck', x: 5, y: 5, breite: 2, hoehe: 2, stil: 'kompost', linienart: 'gestrichelt', linie: '#112233', linienbreite: 3 })
    expect(ok.fehler).toEqual([])
    // Linienfarbe unabhängig von der Füllung
    expect(ok.elemente[0]).toMatchObject({ fuellung: '#D9C3A5', linie: '#112233', linienart: 'gestrichelt', linienbreite: 3 })
    expect(mit({ typ: 'rechteck', x: 5, y: 5, breite: 2, hoehe: 2, stil: 'wiese', fuellung: null }).elemente[0]).not.toHaveProperty('fuellung')
    expect(mit({ ...kreis, fuellung: 'c5e0b4' }).elemente[0]).toMatchObject({ fuellung: '#C5E0B4' })
    expect(mit({ ...kreis, name: 'Krone' }).elemente[0]).toMatchObject({ name: 'Krone' })
  })

  it('Bezug auf Positionen', () => {
    const f = mit({ ...kreis, bezug: { liste: 'aufwuchs', id: 'gibt-es-nicht' } })
    expect(f.fehler[0].pfad).toBe('elemente[0].bezug.id')
    expect(f.fehler[0].meldung).toMatch(/Keine Position „gibt-es-nicht“ in „aufwuchs“\. Vorhanden: p-apfel/)
    expect(mit({ ...kreis, bezug: { liste: 'garten', id: 'x' } }).fehler[0].pfad).toBe('elemente[0].bezug.liste')
    expect(mit({ ...kreis, bezug: 'p-apfel' }).fehler[0].pfad).toBe('elemente[0].bezug')
  })

  it('Vieleck, Linienzug, Bogen, Linie, Maß, Text', () => {
    expect(mit({ typ: 'vieleck', punkte: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }).fehler[0]).toMatchObject({ pfad: 'elemente[0].punkte' })
    expect(mit({ typ: 'vieleck', punkte: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3 }] }).fehler[0].pfad).toBe('elemente[0].punkte[2].y')
    const zickzack = mit({ typ: 'vieleck', offen: true, punkte: [{ x: 1, y: 1 }, { x: 2, y: 2 }], fuellung: '#FF0000' })
    expect(zickzack.ok).toBe(true)
    expect(zickzack.elemente[0]).toMatchObject({ offen: true })
    expect(zickzack.elemente[0]).not.toHaveProperty('fuellung')
    expect(mit({ typ: 'bogen', x: 1, y: 1, breite: 2, hoehe: 2, startWinkel: 10, endWinkel: 10 }).fehler[0].pfad).toBe('elemente[0].endWinkel')
    expect(mit({ typ: 'bogen', x: 1, y: 1, breite: 2, hoehe: 2, startWinkel: 0 }).fehler[0].pfad).toBe('elemente[0].endWinkel')
    expect(mit({ typ: 'linie', von: { x: 1, y: 1 } }).fehler[0].pfad).toBe('elemente[0].nach')
    expect(mit({ typ: 'linie', von: { x: 1, y: 1 }, nach: { x: 2, y: 2 }, pfeil: 'ja' }).fehler[0].pfad).toBe('elemente[0].pfeil')
    expect(mit({ typ: 'massangabe', von: { x: 1, y: 1 }, nach: { x: 1, y: 1 } }).fehler[0].meldung).toMatch(/aufeinander/)
    expect(mit({ typ: 'text', x: 1, y: 1 }).fehler[0].pfad).toBe('elemente[0].inhalt')
    expect(mit({ typ: 'text', x: 1, y: 1, inhalt: 'a', groesse: 99 }).fehler[0].pfad).toBe('elemente[0].groesse')
    const m = mit({ typ: 'massangabe', von: { x: 1, y: 1 }, nach: { x: 5.5, y: 1 } })
    expect(m.elemente[0]).toMatchObject({ beschriftung: '4,5 m' })
  })

  it('alles oder nichts: ein Fehler verhindert die Anzeige der übrigen Elemente', () => {
    const f = fehler({ format: 'wep-skizze/2', elemente: [kreis, { typ: 'ellipse', y: 1, breite: 1, hoehe: 1 }] })
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
    const zurueck = editorReducer(neu, { typ: 'undo' })
    expect(zurueck.elemente).toEqual(vorher)
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
  })
})

describe('baustein(): fertige Grundformen', () => {
  const wep = testWep()
  const bauen = (name: string, p: Record<string, unknown>) => baustein(name, p)

  it('jeder Baustein besteht nur aus Grundformen, entspricht dem Schema und ist als Vorschlag gültig', () => {
    for (const info of bausteinInfos()) {
      const extra = info.name === 'mangelhinweis' ? { beschriftung: 'Hinweis', ziel: { x: 9, y: 9 } } : {}
      const r = bauen(info.name, { x: 8, y: 8, ...extra })
      expect(r.ok, `${info.name}: ${JSON.stringify(r.fehler)}`).toBe(true)
      gueltig(bausteinPruefer, r)
      if (info.name !== 'rasen') expect(r.elemente.length, info.name).toBeGreaterThan(0)
      if (!r.elemente.length) continue // „rasen“ ohne Beschriftung zeichnet nichts
      const g = pruefeVorschlag({ format: 'wep-skizze/2', elemente: r.elemente }, wep, wep.skizze)
      expect(g.fehler, info.name).toEqual([])
      expect(g.ok, info.name).toBe(true)
    }
  })

  it('Baum: Stamm (Rechteck, braun) und drei Kronenkreise (dunkelgrün) – wie im Skill parzellen-skizze', () => {
    const r = bauen('baum', { x: 10, y: 10 })
    expect(r.elemente.map((e) => e.typ)).toEqual(['rechteck', 'ellipse', 'ellipse', 'ellipse'])
    expect(r.elemente[0]).toMatchObject({ fuellung: '#7F5A2E' })
    expect(r.elemente[1]).toMatchObject({ fuellung: '#548235', linie: '#385723' })
    // Lage: um den Mittelpunkt, Größe etwa die Standardgröße 1,5 × 1,9 m
    const xs = r.elemente.flatMap((e) => (typeof e.x === 'number' && typeof e.breite === 'number' ? [e.x - e.breite / 2, e.x + e.breite / 2] : []))
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(10, 1)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.2)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1.6)
  })

  it('Hecke: überlappende Kreise entlang der langen Seite; „Flieder“ in der Beschriftung färbt lila', () => {
    const waag = bauen('hecke', { x: 10, y: 10, breite: 6, hoehe: 1 }).elemente.filter((e) => e.typ === 'ellipse')
    expect(waag.length).toBeGreaterThan(5)
    expect(Math.max(...waag.map((e) => e.x!)) - Math.min(...waag.map((e) => e.x!))).toBeGreaterThan(4)
    expect(waag[0]).toMatchObject({ fuellung: '#A9D18E' })
    const fl = bauen('hecke', { x: 10, y: 10, breite: 6, hoehe: 1, beschriftung: 'Fliederhecke' }).elemente.find((e) => e.typ === 'ellipse')
    expect(fl).toMatchObject({ fuellung: '#B4A7D6', linie: '#7030A0' })
  })

  it('Tor: Linie mit Viertelbogen; Entfernen einer Pflanze: Stern mit rotem X; Mängelhinweis mit Pfeil', () => {
    const tor = bauen('tor', { x: 10, y: 10 }).elemente
    expect(tor.map((e) => e.typ)).toEqual(['linie', 'vieleck'])
    expect(tor[1]).toMatchObject({ offen: true })
    const stern = bauen('entfernen', { x: 5, y: 5, beschriftung: 'Wacholder entfernen' }).elemente
    expect(stern.some((e) => e.typ === 'vieleck' && !e.offen && e.fuellung === '#70AD47')).toBe(true)
    expect(stern.filter((e) => e.typ === 'linie' && e.farbe === '#C00000').length).toBeGreaterThanOrEqual(2)
    const hinweis = bauen('mangelhinweis', { x: 5, y: 5, beschriftung: 'Rückschnitt', ziel: { x: 8, y: 8 } }).elemente
    expect(hinweis.find((e) => e.typ === 'linie')).toMatchObject({ pfeil: true, farbe: '#C00000' })
    expect(hinweis.find((e) => e.typ === 'text')).toMatchObject({ inhalt: 'Rückschnitt', farbe: '#C00000' })
  })

  it('Fehler: unbekannter Baustein, fehlende Lage, ziel nur beim Mängelhinweis', () => {
    expect(bauen('palme', { x: 1, y: 1 }).fehler[0]).toMatchObject({ pfad: 'name' })
    expect(bauen('baum', {}).fehler.map((f) => f.pfad)).toEqual(['x', 'y'])
    expect(bauen('baum', { x: 1, y: 1, ziel: { x: 2, y: 2 } }).fehler[0].pfad).toBe('ziel')
    expect(bauen('mangelhinweis', { x: 1, y: 1 }).fehler[0].pfad).toBe('beschriftung')
    expect(bauen('baum', { x: 1, y: 1, farbe: 'rot' }).fehler[0].pfad).toBe('farbe')
    expect(bauen('baum', { x: 1, y: 1 }).elemente.length).toBeGreaterThan(0)
  })
})

describe('status()-Schema', () => {
  it('Beispielwerte entsprechen dem Schema', () => {
    gueltig(statusPruefer, { offen: false, zustand: 'kein-vorschlag', nr: 0, anzahl: null, modus: null, entschiedenAm: null })
    gueltig(statusPruefer, { offen: true, zustand: 'offen', nr: 2, anzahl: 12, modus: 'ergaenzen', entschiedenAm: null })
    gueltig(statusPruefer, { offen: false, zustand: 'uebernommen', nr: 2, anzahl: 12, modus: 'gruen-ersetzen', entschiedenAm: '2026-10-23T10:00:00.000Z' })
  })
})
