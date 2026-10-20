// @vitest-environment node
// Umbau im Entwurfs-Stil, Teil B (Beta 2, Schritt 4): Positionen ändern (Formular mit „Löschen“),
// Richtlinien-Erläuterungen nur im Formular, Beseitigung, Dialoge, Skizzen-Werkzeugleiste, keine Emojis.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { neuerWep, type BeseitigungsPosition, type Position } from '@/model'
import { PositionenAbschnitt } from '../Positionen'
import { PositionBearbeiten } from '../PositionBearbeiten'
import { PositionFormular, auswahlFuerPosition } from '../PositionFormular'
import { BeseitigungFormular } from '../BeseitigungFormular'
import { Dialog, LeerZustand, Rueckfrage } from '../ui'
import { KATALOG_POSITIONEN } from '../katalogDaten'
import { leereSkizze } from '@/skizze/types'
import { SkizzeEditor } from '@/skizze/SkizzeEditor'

const pos = (p: Partial<Position>): Position => ({
  id: 'p',
  bezeichnung: '',
  anzahl: 1,
  einheit: 'Stück',
  zustand: 'gut',
  einzelpreis: 0,
  preisManuell: false,
  hinweise: [],
  ...p,
})

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const rasenRegeln = KATALOG_POSITIONEN.find((p) => p.id === 'aw-rasen')!.regeln!

describe('Positionsliste: nur Warnungen, keine Richtlinien-Erläuterungen', () => {
  const wep = neuerWep('2026-001')
  wep.gruen.aufwuchs = [
    pos({
      id: 'a',
      katalogId: 'aw-rasen',
      bezeichnung: 'Rasen',
      anzahl: 120,
      einheit: 'm²',
      einzelpreis: 0.38,
      hinweise: [{ schwere: 'info', text: rasenRegeln }],
    }),
  ]
  const html = render(
    createElement(PositionenAbschnitt, {
      wep,
      abschnitt: 'aufwuchs',
      onSpeichern: async () => {},
      onHinzufuegen: () => {},
      onBearbeiten: () => {},
    }),
  )

  it('Warnung bleibt sichtbar', () => {
    expect(html).toContain('Nur bis max. 100')
    expect(html).toContain('class="warnung"')
  })

  it('der Richtlinientext steht nicht in der Liste, keine „Hinweise zur Richtlinie“-Aufklappung', () => {
    expect(rasenRegeln.length).toBeGreaterThan(10)
    expect(html).not.toContain(rasenRegeln.slice(0, 40))
    expect(html).not.toMatch(/Richtlinie</)
    expect(html).not.toContain('<details')
  })

  it('Zeile ist antippbar (Zeile = Knopf), ohne eigenen Löschen-Knopf', () => {
    expect(html).toMatch(/<button[^>]*class="pos"[^>]*role="row"/)
    expect(html).not.toMatch(/löschen/i)
  })

  it('leerer Abschnitt zeigt einen Leerzustand mit Erklärung', () => {
    const leer = render(
      createElement(PositionenAbschnitt, {
        wep: neuerWep('2026-002'),
        abschnitt: 'aufwuchs',
        onSpeichern: async () => {},
        onHinzufuegen: () => {},
        onBearbeiten: () => {},
      }),
    )
    expect(leer).toContain('Noch keine Positionen')
    expect(leer).toContain('class="leerzustand"')
  })
})

describe('Position ändern', () => {
  const wep = neuerWep('2026-001')
  const vorhanden = pos({
    id: 'r',
    katalogId: 'aw-rasen',
    bezeichnung: 'Rasen vor der Laube',
    anzahl: 80.5,
    einheit: 'm²',
    zustand: 'mittel',
    hoechstwert: 0.5,
    einzelpreis: 0.25,
  })
  const html = render(
    createElement(PositionFormular, {
      auswahl: auswahlFuerPosition(vorhanden),
      wep,
      bearbeiten: vorhanden,
      onFertig: () => {},
      onLoeschen: () => {},
    }),
  )

  it('füllt Bezeichnung, Anzahl (deutsches Komma), Einheit und Zustand vor', () => {
    expect(html).toContain('value="Rasen vor der Laube"')
    expect(html).toContain('value="80,5"')
    expect(html).toMatch(/<option value="m²" selected/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>mittel</)
  })

  it('zeigt den Vorschlag (Höchstwert × Zustand) mit „Überschreiben“', () => {
    expect(html).toContain('0,25')
    expect(html).toContain('Überschreiben')
    expect(html).toContain('Höchstwert')
  })

  it('hat „Speichern“ und unten „Löschen“; die Rückfrage erscheint erst nach dem Antippen', () => {
    expect(html).toContain('>Speichern<')
    expect(html).not.toContain('>Hinzufügen<')
    expect(html).toMatch(/knopf-loeschen[^>]*>.*Löschen<\/button>/)
    expect(html).not.toContain('alertdialog')
  })

  it('Richtlinie steht im Formular (eingeklappt unter „Richtlinie“)', () => {
    expect(html).toMatch(/<details class="details"><summary>Richtlinie<\/summary>/)
    expect(html).toContain(rasenRegeln.slice(0, 40))
  })

  it('Warnung der Position erscheint auch im Formular (Rasen über 100 m²)', () => {
    const viel = render(
      createElement(PositionFormular, {
        auswahl: auswahlFuerPosition(vorhanden),
        wep,
        bearbeiten: { ...vorhanden, anzahl: 150 },
        onFertig: () => {},
        onLoeschen: () => {},
      }),
    )
    expect(viel).toContain('Nur bis max. 100')
  })

  it('ein vom Vorschlag abweichender Preis bleibt als eigener Preis stehen', () => {
    const eigen = render(
      createElement(PositionFormular, {
        auswahl: auswahlFuerPosition(vorhanden),
        wep,
        bearbeiten: { ...vorhanden, einzelpreis: 0.4, preisManuell: false },
        onFertig: () => {},
        onLoeschen: () => {},
      }),
    )
    expect(eigen).toContain('value="0,4"')
    expect(eigen).toContain('wird im WEP als „manuell“ vermerkt')
  })

  it('Freitext-Position ohne Katalogeintrag: keine Richtlinie, Quelle „Eigene Position“', () => {
    const frei = pos({ id: 'z', bezeichnung: 'Zaubernuss', einzelpreis: 40, preisManuell: true })
    const h = render(
      createElement(PositionFormular, {
        auswahl: auswahlFuerPosition(frei),
        wep,
        bearbeiten: frei,
        onFertig: () => {},
        onLoeschen: () => {},
      }),
    )
    expect(h).toContain('Eigene Position (Freitext)')
    expect(h).not.toContain('<details')
    expect(h).toContain('value="40"')
  })

  it('Neue Position hat „Hinzufügen“ und keinen Löschen-Knopf', () => {
    const neu = render(createElement(PositionFormular, { auswahl: {}, wep, onFertig: () => {} }))
    expect(neu).toContain('>Hinzufügen<')
    expect(neu).not.toMatch(/Löschen/)
  })

  it('eigener Bildschirm mit Kopfzeile „Position ändern“ und Abbrechen', () => {
    const seite = render(
      createElement(PositionBearbeiten, {
        abschnitt: 'aufwuchs',
        pos: vorhanden,
        wep,
        onAbbrechen: () => {},
        onSpeichern: () => {},
        onLoeschen: () => {},
      }),
    )
    expect(seite).toContain('Position ändern')
    expect(seite).toContain('Abbrechen')
    expect(seite).toContain('data-schritt="formular"')
  })
})

describe('Beseitigung ändern', () => {
  const vorhanden: BeseitigungsPosition = {
    id: 'b1',
    gegenstand: 'Japanischer Knöterich entfernen',
    menge: 2,
    einheit: 'Pauschale',
    einzelpreis: 90,
    faktor: 1.5,
    begruendung: 'schwer zugänglich',
  }
  const html = render(createElement(BeseitigungFormular, { bearbeiten: vorhanden, onAbbrechen: () => {}, onFertig: () => {}, onLoeschen: () => {} }))

  it('füllt alle Felder vor, inkl. Begründung bei Faktor > 1', () => {
    expect(html).toContain('value="Japanischer Knöterich entfernen"')
    expect(html).toContain('value="90"')
    expect(html).toContain('value="1,5"')
    expect(html).toContain('value="schwer zugänglich"')
    expect(html).toMatch(/<option value="Pauschale" selected/)
  })

  it('zeigt die Gesamtsumme (2 × 90 € × 1,5 = 270 €), „Speichern“ und „Löschen“', () => {
    expect(html).toMatch(/270,00/)
    expect(html).toContain('>Speichern<')
    expect(html).toMatch(/knopf-loeschen[^>]*>.*Löschen<\/button>/)
  })

  it('Neu: „Hinzufügen“, kein Löschen', () => {
    const neu = render(createElement(BeseitigungFormular, { onAbbrechen: () => {}, onFertig: () => {} }))
    expect(neu).toContain('>Hinzufügen<')
    expect(neu).not.toContain('Löschen')
  })
})

describe('Dialoge einheitlich', () => {
  it('Rückfrage ist ein alertdialog mit Abbrechen und rotem Löschen', () => {
    const h = render(
      createElement(Rueckfrage, { titel: 'Position löschen?', text: 'Weg.', onAbbrechen: () => {}, onBestaetigen: () => {} }),
    )
    expect(h).toContain('role="alertdialog"')
    expect(h).toContain('aria-modal="true"')
    expect(h).toContain('Position löschen?')
    expect(h).toContain('knopf-gefahr')
    expect(h).toContain('>Abbrechen<')
  })

  it('Dialog ohne Rückfrage hat role=dialog und eine Beschriftung', () => {
    const h = render(createElement(Dialog, { titel: 'Text einfügen', onSchliessen: () => {} }, 'Inhalt'))
    expect(h).toContain('role="dialog"')
    expect(h).toMatch(/aria-labelledby="[^"]+-t"/)
  })

  it('Leerzustand: Icon, Titel, Erklärung', () => {
    const h = render(createElement(LeerZustand, { icon: () => null, titel: 'Leer', text: 'Nichts da.' }))
    expect(h).toContain('leer-titel')
    expect(h).toContain('Nichts da.')
  })
})

describe('Skizzen-Editor: Werkzeugleiste', () => {
  const html = render(createElement(SkizzeEditor, { wert: leereSkizze(), onAenderung: () => {} }))

  it('alle Werkzeuge sind Icon-Knöpfe mit Namen (lucide, keine Zeichen)', () => {
    for (const name of ['Auswählen', 'Rechteck', 'Linie', 'Kreis', 'Text', 'Maßangabe', 'Symbol', 'Rückgängig', 'Wiederholen', 'Raster']) {
      expect(html).toContain(`aria-label="${name}"`)
    }
    expect((html.match(/class="werkzeug[ "]/g) ?? []).length).toBeGreaterThanOrEqual(10)
    expect((html.match(/lucide/g) ?? []).length).toBeGreaterThanOrEqual(10)
    expect(html).toContain('role="toolbar"')
  })

  it('keine Zeichen-Symbole als Beschriftung', () => {
    expect(html).not.toMatch(/[↖▭╱○↔↩↪✕⊞]/u)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('Keine Emojis und Zeichen-Symbole in der Oberfläche', () => {
  const dateien = [
    ...readdirSync(join(__dirname, '..'))
      .filter((d) => d.endsWith('.tsx'))
      .map((d) => join(__dirname, '..', d)),
    ...readdirSync(join(__dirname, '../../skizze'))
      .filter((d) => d.endsWith('.tsx'))
      .map((d) => join(__dirname, '../../skizze', d)),
  ]
  it('findet die Dateien', () => expect(dateien.length).toBeGreaterThan(12))
  for (const datei of dateien) {
    it(datei.split('/src/')[1], () => {
      expect(readFileSync(datei, 'utf-8')).not.toMatch(/[\p{Extended_Pictographic}✓✕✗⊞▭╱○]/u)
    })
  }
})
