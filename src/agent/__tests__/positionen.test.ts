// @vitest-environment node
/** Positions-Vorschlag (window.wep.positionen): Katalogsuche, Prüfung mit Fehlern, Preise, Hinweise, Ablauf. Erfundene Daten. */
import Ajv2020 from 'ajv/dist/2020'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { neuerWep } from '../../model'
import { baueSchnittstelle, positionenSpeicher, vorschlagSpeicher } from '../bruecke'
import { katalogSuchen, pruefePositionen } from '../positionen'
import { schema } from '../schema'
import { testWep } from './testwep'

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true })
const pruefer = (name: string) => {
  const s = schema() as { $defs: Record<string, unknown> }
  return ajv.compile({ $schema: 'https://json-schema.org/draft/2020-12/schema', $defs: s.$defs, $ref: `#/$defs/${name}` })
}
const gueltig = (name: string, daten: unknown) => {
  const v = pruefer(name)
  expect(v(daten), JSON.stringify(v.errors, null, 1)).toBe(true)
}

const wep = neuerWep('2026-778')
const p = (positionen: unknown[], liste = 'aufwuchs') => pruefePositionen({ format: 'wep-positionen/1', liste, positionen }, wep)

describe('katalogSuchen()', () => {
  it('findet Apfel mit den Preisvarianten und Höchstwerten (Aufwuchs), nur im passenden Abschnitt', () => {
    const t = katalogSuchen('Apfel', 'aufwuchs')
    expect(t.length).toBeGreaterThan(0)
    expect(t[0].varianten.length).toBeGreaterThan(3)
    expect(t[0].varianten.find((v) => /Halbstamm/.test(v.merkmale) && /5–30/.test(v.merkmale))?.hoechstwert).toBe(85)
    gueltig('katalogTreffer', t)
    expect(katalogSuchen('Apfel', 'aussenanlagen').some((x) => /Obst/.test(x.bezeichnung))).toBe(false)
  })
})

describe('Positions-Vorschlag prüfen', () => {
  it('Katalog mit Variante: Bezeichnung und Preisvorschlag wie im Formular (85 € × 0,75)', () => {
    const g = p([{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: 2 }])
    expect(g.fehler).toEqual([])
    expect(g.ok).toBe(true)
    expect(g.positionen[0]).toMatchObject({ bezeichnung: 'Apfel, Halbstamm, 5–30 J.', anzahl: 2, einheit: 'Stück', zustand: 'gut', hoechstwert: 85, einzelpreis: 63.75, preisManuell: false })
    expect(g.positionen[0].katalogId).toBeTruthy()
    expect(g.vorschau[0]).toMatchObject({ summe: 127.5 })
    expect(g.summe).toBe(127.5)
    expect(g.zusammenfassung).toMatch(/1 Position für „Aufwuchs“/)
    gueltig('positionenErgebnis', { ok: g.ok, fehler: g.fehler, hinweise: g.hinweise, zusammenfassung: g.zusammenfassung, anzahl: g.anzahl, vorschau: g.vorschau, summe: g.summe })
  })

  it('Variante als Index, Zustand, eigener Preis (überschreibt den Vorschlag) und Hinweis über Höchstwert', () => {
    const t = katalogSuchen('Apfel', 'aufwuchs')[0]
    const idx = t.varianten.find((v) => /Halbstamm/.test(v.merkmale) && /5–30/.test(v.merkmale))!.index
    const g = p([{ katalogId: t.katalogId, variante: idx, anzahl: 1, zustand: 'sehr gut', einzelpreis: 90 }])
    expect(g.positionen[0]).toMatchObject({ einzelpreis: 90, preisManuell: true, zustand: 'sehr gut' })
    expect(g.hinweise.some((h) => /über dem Höchstwert von 85/.test(h))).toBe(true)
    expect(p([{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: 1, zustand: 'schlecht' }]).positionen[0].einzelpreis).toBe(1)
  })

  it('mehrere Preisvarianten ohne Angabe: Fehler nennt alle zur Auswahl mit Höchstwert', () => {
    const g = p([{ suche: 'Liguster Hecke', anzahl: 9 }])
    expect(g.ok).toBe(false)
    expect(g.fehler[0].pfad).toBe('positionen[0].variante')
    expect(g.fehler[0].meldung).toMatch(/mehrere Preisvarianten/)
    expect(g.fehler[0].meldung).toMatch(/0 = .* \(bis 5 €\)/)
    const ok = p([{ suche: 'Liguster Hecke', variante: 0, anzahl: 9 }])
    expect(ok.ok).toBe(true)
    expect(ok.positionen[0].bezeichnung).toMatch(/Liguster-Hecke/)
    expect(ok.positionen[0].einheit).toBe('m')
  })

  it('Freitext, invasive Art und Problempflanze erzeugen Hinweise, keine Fehler', () => {
    const g = p([
      { bezeichnung: 'Kirschbaum, alt', einheit: 'Stück', anzahl: 1, einzelpreis: 30 },
      { bezeichnung: 'Götterbaum', einheit: 'Stück', anzahl: 1, zustand: 'schlecht' },
      { bezeichnung: 'Blaufichte', einheit: 'Stück', anzahl: 1, zustand: 'schlecht' },
      { bezeichnung: 'Irgendwas', einheit: 'm', anzahl: 3 },
    ])
    expect(g.ok).toBe(true)
    expect(g.positionen[0]).toMatchObject({ bezeichnung: 'Kirschbaum, alt', einzelpreis: 30, preisManuell: true })
    expect(g.positionen[0].katalogId).toBeUndefined()
    expect(g.hinweise.some((h) => /Götterbaum/.test(h) && /Unionsliste/.test(h))).toBe(true)
    expect(g.hinweise.some((h) => /Blaufichte/.test(h))).toBe(true)
    expect(g.hinweise.some((h) => /Irgendwas/.test(h) && /keinen Höchstwert/.test(h))).toBe(true)
    // die Hinweise stehen auch an den Positionen (wie bei Eingabe im Formular)
    expect(g.positionen[1].hinweise.some((h) => h.schwere === 'warnung')).toBe(true)
  })

  it('Außenanlagen aus dem Katalog; vorhandene gleiche Zeile wird gemeldet', () => {
    const w = testWep()
    const g = pruefePositionen({ format: 'wep-positionen/1', liste: 'aussenanlagen', positionen: [{ suche: 'Kompost', anzahl: 2 }] }, w)
    expect(g.ok).toBe(true)
    expect(g.positionen[0].einheit).toBe('m³')
    const doppelt = pruefePositionen({ format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ bezeichnung: 'Blaufichte', einheit: 'Stück', anzahl: 1 }] }, w)
    expect(doppelt.hinweise.some((h) => /gibt es in der Liste schon/.test(h))).toBe(true)
  })

  it('Beseitigung', () => {
    const g = p([{ gegenstand: 'Blaufichte entfernen', menge: 1, einheit: 'Stück', einzelpreis: 80 }, { gegenstand: 'Asbestplatten', menge: 4, einheit: 'm²', einzelpreis: 45, faktor: 1.5 }], 'beseitigung')
    expect(g.ok).toBe(true)
    expect(g.beseitigung).toHaveLength(2)
    expect(g.beseitigung[0]).toMatchObject({ gegenstand: 'Blaufichte entfernen', faktor: 1 })
    expect(g.vorschau[1].summe).toBe(270)
    expect(g.hinweise.some((h) => /Begründung/.test(h))).toBe(true)
    expect(p([{ gegenstand: 'x', menge: 1, einheit: 'kg', einzelpreis: 1 }], 'beseitigung').fehler[0].pfad).toBe('positionen[0].einheit')
  })

  it('Fehler mit Pfad: Format, Liste, Felder, Zahlen, Katalog, Einheit, Zustand', () => {
    const f = (v: unknown) => pruefePositionen(v, wep)
    expect(f({ liste: 'aufwuchs', positionen: [{ suche: 'Apfel', anzahl: 1 }] }).fehler[0].pfad).toBe('format')
    expect(f({ format: 'wep-positionen/1', liste: 'garten', positionen: [{}] }).fehler[0].pfad).toBe('liste')
    expect(f({ format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [] }).fehler[0].pfad).toBe('positionen')
    expect(f('{kaputt').fehler[0].meldung).toMatch(/kein gültiges JSON/)
    expect(p([{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: '2' }]).fehler[0].pfad).toBe('positionen[0].anzahl')
    expect(p([{ suche: 'Apfel', variante: 'Halbstamm 5–30' }]).fehler[0].pfad).toBe('positionen[0].anzahl')
    expect(p([{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: 0 }]).fehler[0].meldung).toMatch(/größer als 0/)
    expect(p([{ suche: 'Raumschiff', anzahl: 1 }]).fehler[0]).toMatchObject({ pfad: 'positionen[0].suche' })
    expect(p([{ katalogId: 'gibt-es-nicht', anzahl: 1 }]).fehler[0].pfad).toBe('positionen[0].katalogId')
    expect(p([{ suche: 'Apfel', katalogId: 'aw-hecke', anzahl: 1 }]).fehler[0].meldung).toMatch(/nicht beides/)
    expect(p([{ bezeichnung: 'Etwas', anzahl: 1 }]).fehler.map((x) => x.pfad)).toEqual(['positionen[0].einheit'])
    expect(p([{ anzahl: 1, einheit: 'Stück' }]).fehler[0].pfad).toBe('positionen[0].bezeichnung')
    expect(p([{ bezeichnung: 'Etwas', einheit: 'kg', anzahl: 1 }]).fehler[0].meldung).toMatch(/Erlaubt: Stück/)
    expect(p([{ bezeichnung: 'Etwas', einheit: 'Stück', anzahl: 1, zustand: 'prima' }]).fehler[0].pfad).toBe('positionen[0].zustand')
    expect(p([{ bezeichnung: 'Etwas', einheit: 'Stück', anzahl: 1, farbe: 'rot' }]).fehler[0].pfad).toBe('positionen[0].farbe')
    expect(p([{ suche: 'Apfel', variante: 'Zwergstamm 99', anzahl: 1 }]).fehler[0].meldung).toMatch(/Unbekannt: „Zwergstamm 99“/)
    // alles oder nichts
    const g = p([{ bezeichnung: 'Gut', einheit: 'Stück', anzahl: 1 }, { bezeichnung: 'Schlecht', einheit: 'kg', anzahl: 1 }])
    expect(g.ok).toBe(false)
    expect(g.positionen).toEqual([])
    expect(g.anzahl).toBe(0)
    expect(g.zusammenfassung).toMatch(/Nichts angezeigt/)
  })

  it('Rolle „bau“: kein Positions-Vorschlag', () => {
    const g = pruefePositionen({ format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ bezeichnung: 'x', einheit: 'Stück', anzahl: 1 }] }, { ...wep, rolle: 'bau' })
    expect(g.ok).toBe(false)
  })

  it('der Eingabe-Vorschlag entspricht dem Schema', () => {
    gueltig('positionenVorschlag', { format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: 2 }, { bezeichnung: 'Kirsche', einheit: 'Stück', anzahl: 1, einzelpreis: 30 }] })
    gueltig('positionenVorschlag', { format: 'wep-positionen/1', liste: 'beseitigung', positionen: [{ gegenstand: 'x', menge: 1, einheit: 'Stück', einzelpreis: 5 }] })
    gueltig('positionenStatus', { offen: true, zustand: 'offen', nr: 1, liste: 'aufwuchs', anzahl: 2, entschiedenAm: null })
  })
})

describe('window.wep.positionen', () => {
  beforeEach(() => {
    positionenSpeicher.zuruecksetzen()
    vorschlagSpeicher.zuruecksetzen()
  })

  it('Ablauf: vorschlagen → Liste wird gezeigt → offen → Entscheidung; nichts im WEP geändert', () => {
    const w = testWep()
    const vorher = JSON.stringify(w)
    const zeige = vi.fn()
    const api = baueSchnittstelle({ holeWep: () => w, zeigeSkizze: () => {}, zeigeListe: zeige })
    expect(api.positionen.status()).toMatchObject({ offen: false, zustand: 'kein-vorschlag', nr: 0 })
    const r = api.positionen.vorschlagen({ format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: 2 }] })
    expect(r.ok).toBe(true)
    expect(Object.keys(r).sort()).toEqual(['anzahl', 'fehler', 'hinweise', 'ok', 'summe', 'vorschau', 'zusammenfassung'])
    expect(zeige).toHaveBeenCalledWith('aufwuchs')
    expect(api.positionen.status()).toMatchObject({ offen: true, zustand: 'offen', nr: 1, liste: 'aufwuchs', anzahl: 1 })
    expect(JSON.stringify(w)).toBe(vorher)
    positionenSpeicher.entscheide('uebernommen')
    const s = api.positionen.status()
    expect(s).toMatchObject({ offen: false, zustand: 'uebernommen' })
    expect(s.entschiedenAm).toMatch(/^\d{4}-/)
    gueltig('positionenStatus', s)
    positionenSpeicher.zurueckgenommen()
    expect(api.positionen.status().zustand).toBe('zurueckgenommen')
  })

  it('Fehler: nichts angezeigt, offener Vorschlag bleibt', () => {
    const zeige = vi.fn()
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: () => {}, zeigeListe: zeige })
    api.positionen.vorschlagen({ format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ bezeichnung: 'A', einheit: 'Stück', anzahl: 1 }] })
    const f = api.positionen.vorschlagen({ format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ suche: 'Raumschiff', anzahl: 1 }] })
    expect(f.ok).toBe(false)
    expect(zeige).toHaveBeenCalledTimes(1)
    expect(api.positionen.status()).toMatchObject({ offen: true, nr: 1 })
  })

  it('katalogSuchen über die Schnittstelle; ungültige Eingaben geben eine leere Liste', () => {
    const api = baueSchnittstelle({ holeWep: testWep, zeigeSkizze: () => {}, zeigeListe: () => {} })
    expect(api.positionen.katalogSuchen('Apfel', 'aufwuchs').length).toBeGreaterThan(0)
    expect(api.positionen.katalogSuchen('Apfel', 'quatsch' as never)).toEqual([])
    expect(api.positionen.katalogSuchen(5 as never)).toEqual([])
    expect(Object.isFrozen(api.positionen)).toBe(true)
  })
})

describe('Bäume: Vorschlag aus dem Maß (wep-positionen/1, abwärtskompatibel)', () => {
  it('Obstgehölz mit „alter“: Baumform in „variante“, die App wählt die Altersstufe', () => {
    const g = p([{ suche: 'Apfel', variante: 'Halbstamm', alter: 40, anzahl: 1 }])
    expect(g.fehler).toEqual([])
    expect(g.positionen[0]).toMatchObject({ bezeichnung: 'Apfel, Halbstamm, 40 J.', baumform: 'Halbstamm', alterJahre: 40, hoechstwert: 150, einzelpreis: 112.5 })
    // Eine Variante mit Altersstufe zählt nur mit ihrer Form – das Alter entscheidet
    expect(p([{ suche: 'Apfel', variante: 'Halbstamm 5–30', alter: 3, anzahl: 1 }]).positionen[0]).toMatchObject({ hoechstwert: 35, alterJahre: 3 })
    expect(p([{ suche: 'Apfel', alter: 3, anzahl: 1 }]).fehler[0].pfad).toBe('positionen[0].variante')
    gueltig('positionenVorschlag', { format: 'wep-positionen/1', liste: 'aufwuchs', positionen: [{ suche: 'Apfel', variante: 'Halbstamm', alter: 12, anzahl: 1 }] })
  })

  it('ohne „alter“ wie bisher, mit Hinweis „Alter fehlt“', () => {
    const g = p([{ suche: 'Apfel', variante: 'Halbstamm 5–30', anzahl: 1 }])
    expect(g.positionen[0]).toMatchObject({ hoechstwert: 85, einzelpreis: 63.75 })
    expect(g.positionen[0].baumform).toBeUndefined()
    expect(g.hinweise.join(' ')).toMatch(/Alter fehlt/)
  })

  it('Geschützter Baum: 1 € auch bei Zustand „mittel“', () => {
    expect(p([{ katalogId: 'aw-baum-geschuetzt', zustand: 'mittel', anzahl: 2 }]).positionen[0]).toMatchObject({ einzelpreis: 1 })
  })

  it('Beseitigung „baum-faellen“: Gegenstand, Einheit und Satz aus Baumart und Maß', () => {
    const g = p([{ vorlage: 'baum-faellen', baumart: 'Birke', stammumfang: 85, menge: 1 }, { vorlage: 'baum-faellen', durchmesser: 27, menge: 2 }], 'beseitigung')
    expect(g.fehler).toEqual([])
    expect(g.beseitigung[0]).toMatchObject({ gegenstand: 'Birke fällen inkl. Wurzelstock, StU 85 cm', einheit: 'Stück', einzelpreis: 600, baum: { art: 'Birke', stammumfangCm: 85 }, preisManuell: false })
    expect(g.beseitigung[1]).toMatchObject({ gegenstand: 'Baum fällen inkl. Wurzelstock, StU 84,8 cm', einzelpreis: 600, baum: { stammumfangCm: 84.8, durchmesserCm: 27 } })
    gueltig('positionenVorschlag', { format: 'wep-positionen/1', liste: 'beseitigung', positionen: [{ vorlage: 'baum-faellen', baumart: 'Birke', stammumfang: 85, menge: 1 }] })
  })

  it('ohne Maß: 0 € und Hinweis, eigener Preis bleibt eigener Preis; Fehler bei Widersprüchen', () => {
    const ohne = p([{ vorlage: 'baum-faellen', baumart: 'Birke', menge: 1 }], 'beseitigung')
    expect(ohne.ok).toBe(true)
    expect(ohne.beseitigung[0]).toMatchObject({ einzelpreis: 0, gegenstand: 'Birke fällen inkl. Wurzelstock, StU fehlt' })
    expect(ohne.hinweise.join(' ')).toMatch(/Maß fehlt/)
    expect(p([{ vorlage: 'baum-faellen', stammumfang: 85, einzelpreis: 450, menge: 1 }], 'beseitigung').beseitigung[0]).toMatchObject({ einzelpreis: 450, preisManuell: true })
    expect(p([{ vorlage: 'baum-faellen', stammumfang: 85, durchmesser: 27, menge: 1 }], 'beseitigung').ok).toBe(false)
    expect(p([{ vorlage: 'hecke', menge: 1 }], 'beseitigung').fehler[0].pfad).toBe('positionen[0].vorlage')
    expect(p([{ gegenstand: 'x', stammumfang: 85, menge: 1, einheit: 'Stück', einzelpreis: 1 }], 'beseitigung').fehler[0].pfad).toBe('positionen[0].stammumfang')
  })
})
