// @vitest-environment node
// Beta 6, Paket 1: Parzelle in „Skizze Bau“ und „Skizze Grün“ (Anzeige, Hinweise, gemeinsamer Maßstab). Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, neueBauDaten, type Wep } from '@/model'
import { SkizzeBauTab } from '../SkizzeBauTab'
import { SkizzeTab } from '../SkizzeTab'
import { ParzelleBereich } from '../ParzelleBereich'
import { GrundrissEditor } from '@/skizze/GrundrissEditor'
import { lageVon, setzeParzelle, type Parzelle } from '@/parzelle'
import { rechteckPunkte, type GrundrissDaten } from '@/skizze/grundriss'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const nichts = async () => {}
const jetzt = '2026-10-23T10:00:00.000Z'

const rechteck = (laenge: number, breite: number): Parzelle => ({ form: 'rechteck', laenge, breite, angelegtVon: 'bau', angelegtAm: jetzt })
const grundriss = (x = 3, y = 4): GrundrissDaten => ({ teile: [{ id: 'g1', kuerzel: 'L', punkte: rechteckPunkte(x, y, 6, 4), hoehe: 2.2 }] })

function wep(mit: Partial<Wep> = {}): Wep {
  const w = neuerWep('2026-860')
  w.bau = neueBauDaten()
  return { ...w, ...mit }
}

describe('Reiter „Skizze Bau“ mit Parzelle', () => {
  it('ohne Parzelle: Hinweis „Noch keine Parzelle“ und Anlegen-Knopf; vorhandene Skizzen bleiben (Migration)', () => {
    const html = render(createElement(SkizzeBauTab, { wep: wep({ grundriss: grundriss() }), aendere: nichts }))
    expect(html).toContain('Noch keine Parzelle')
    expect(html).toContain('Parzelle anlegen')
    expect(html).toContain('data-testid="parzelle-migration"')
    expect(html).toContain('bleiben, wie sie sind')
    // der Editor ist wie bisher da (20 × 15 m)
    expect(html).not.toContain('data-testid="grundriss-parzelle"')
    expect(html).toContain('viewBox="0 0 800 600"')
  })

  it('mit Parzelle: Form, berechnete Fläche, Rasterkästchen, wer sie angelegt hat; Editor zeigt die Parzelle in ihrem Maßstab', () => {
    const w = setzeParzelle(wep({ grundriss: grundriss() }), rechteck(26, 18), jetzt)
    const html = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(html).toContain('Rechteckig 26 × 18 m')
    expect(html).toContain('468,00 m²')
    expect(html).toContain('(berechnet)')
    expect(html).toContain('1 Kästchen = 1 m')
    expect(html).toContain('Angelegt am 23.10.2026 (Bau-Teil)')
    expect(html).toContain('Parzelle ändern')
    // Zeichenfläche = Parzelle + 2 × 2,5 m Rand, 40 Einheiten je Meter
    expect(html).toContain(`viewBox="0 0 ${(18 + 5) * 40} ${(26 + 5) * 40}"`)
    expect(html).toContain('data-testid="grundriss-parzelle"')
    expect(html).toContain('data-testid="grundriss-massstab"')
    // die Seitenmaße der Parzelle stehen am Rand
    expect(html).toContain('>18 m<')
    expect(html).toContain('>26 m<')
  })

  it('Abweichung zur Vertragsfläche: Hinweis (kein Sperren), bei kleiner Abweichung keiner', () => {
    const w = setzeParzelle(wep(), rechteck(26, 18), jetzt)
    w.formalien.parzellenflaecheM2 = 400
    const html = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(html).toContain('data-testid="parzelle-abweichung"')
    expect(html).toMatch(/Berechnet 468 m², laut Vertrag 400 m² \(\+68 m², 17 %\)/)
    w.formalien.parzellenflaecheM2 = 470
    expect(render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))).not.toContain('parzelle-abweichung')
  })

  it('Bauteil außerhalb der Parzelle: nur ein Hinweis mit Knopf zum Verschieben', () => {
    const w = setzeParzelle(wep({ grundriss: grundriss(16, 4) }), rechteck(26, 18), jetzt)
    const html = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(html).toContain('data-testid="parzelle-ausserhalb"')
    expect(html).toContain('L liegt')
    expect(html).toContain('außerhalb der Parzelle')
    expect(html).toContain('Grundriss in die Parzelle schieben')
    const drin = setzeParzelle(wep({ grundriss: grundriss(3, 4) }), rechteck(26, 18), jetzt)
    expect(render(createElement(SkizzeBauTab, { wep: drin, aendere: nichts }))).not.toContain('parzelle-ausserhalb')
  })

  it('Parzelle ohne Maße (aus der Bau-Excel): die App sagt, was fehlt; die Skizzen zeigen sich wie bisher', () => {
    const p: Parzelle = { form: 'rechteck', ecken: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 140 }, { x: 0, y: 140 }], angelegtVon: 'excel', angelegtAm: jetzt }
    const w = wep({ parzelle: p, grundriss: grundriss() })
    expect(lageVon(w)).toBeUndefined()
    const html = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(html).toContain('aus der Bau-Excel übernommen')
    expect(html).toContain('Maße fehlen noch: Länge, Breite')
    expect(html).toContain('Maße eintragen')
    expect(html).toContain('viewBox="0 0 800 600"')
  })
})

describe('Reiter „Skizze Grün“ mit Parzelle', () => {
  it('beginnt auf der Parzelle: Maßstab wie im Bau-Reiter, Grundlage aus der Parzelle', () => {
    const w = setzeParzelle(wep(), rechteck(26, 18), jetzt)
    const html = render(createElement(SkizzeTab, { wep: w, onSpeichern: nichts }))
    expect(html).toContain('Rechteckig 26 × 18 m')
    expect(html).toContain('data-testid="skizze-massstab"')
    expect(html).toContain('Maßstab: 1 Kästchen = 1 m')
    expect(html).toContain('Aus der Parzelle (Grundstück, Pfosten)')
    expect(html).toContain('Parzelle 18 × 26 m')
    // dieselbe Parzellenangabe wie im Bau-Reiter
    const bau = render(createElement(SkizzeBauTab, { wep: w, aendere: nichts }))
    expect(bau).toContain('1 Kästchen = 1 m')
  })

  it('Skizze von vor der Parzelle: Hinweis, bis sie nach Rückfrage auf die Parzelle gelegt wird', () => {
    const alt = { breite: 800, hoehe: 600, elemente: [{ id: 'k', typ: 'kreis' as const, cx: 100, cy: 100, radius: 20 }] }
    const w = wep({ skizze: alt, parzelle: rechteck(26, 18) })
    const html = render(createElement(SkizzeTab, { wep: w, onSpeichern: nichts }))
    expect(html).toContain('data-testid="skizze-umlegen"')
    expect(html).toContain('Skizze auf die Parzelle legen')
    expect(html).toContain('alter Stand ohne Maßstab')
    // ohne Parzelle keine Meldung
    expect(render(createElement(SkizzeTab, { wep: wep({ skizze: alt }), onSpeichern: nichts }))).not.toContain('skizze-umlegen')
  })

  it('ohne Parzelle: alles wie bisher, nur der Hinweis „Noch keine Parzelle“ ist neu', () => {
    const html = render(createElement(SkizzeTab, { wep: wep(), onSpeichern: nichts }))
    expect(html).toContain('Noch keine Parzelle')
    expect(html).not.toContain('skizze-massstab')
    expect(html).toContain('Erst Bau-Skizze übernehmen')
  })
})

describe('ParzelleBereich: Zusammenfassung', () => {
  const w = setzeParzelle(wep(), rechteck(26, 18), jetzt)
  it('zeigt Änderungen mit Datum und Teil', () => {
    const geaendert: Wep = { ...w, parzelle: { ...w.parzelle!, geaendertVon: 'gruen', geaendertAm: '2026-10-25T08:00:00.000Z' } }
    const html = render(createElement(ParzelleBereich, { wep: geaendert, teil: 'gruen', onUebernehmen: nichts }))
    expect(html).toContain('Angelegt am 23.10.2026 (Bau-Teil)')
    expect(html).toContain('zuletzt geändert am 25.10.2026 (Grün-Teil)')
    expect(html).toContain('Beide Teile können sie korrigieren')
  })
})

describe('Grundriss-Editor mit Parzelle', () => {
  const lage = lageVon(setzeParzelle(wep(), rechteck(26, 18), jetzt))!
  it('Zeichenfläche und Maßstabszeile stimmen; ohne Parzelle bleibt alles beim Alten', () => {
    const mit = render(createElement(GrundrissEditor, { wert: grundriss(), bauteile: [], onAenderung: () => {}, onNeuesBauteil: () => { throw new Error('nein') }, parzelle: lage }))
    expect(mit).toContain('Parzelle 18 m × 26 m')
    expect(mit).toContain('1 Kästchen = 1 m')
    const ohne = render(createElement(GrundrissEditor, { wert: grundriss(), bauteile: [], onAenderung: () => {}, onNeuesBauteil: () => { throw new Error('nein') } }))
    expect(ohne).not.toContain('grundriss-massstab')
    expect(ohne).toContain('viewBox="0 0 800 600"')
  })
})
