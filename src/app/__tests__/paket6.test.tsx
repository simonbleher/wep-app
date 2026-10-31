// @vitest-environment node
// Beta 3, Paket 6: Oberfläche – Vorschau der Sicherung, Texte, Warnung mit Knopf „Zur Beseitigung“.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Hinweis } from '@/model'
import type { Vorschau } from '@/sicherung'
import { standardEntscheidungen } from '@/sicherung'
import { WarnListe } from '../Positionen'
import { VorschauAnsicht, ergebnisText, inhaltText } from '../Sicherung'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const nichts = () => {}

const vorschau: Vorschau = {
  erstelltAm: '2026-10-20T12:00:00.000Z',
  appVersion: '0.1.0',
  hatAenderungen: true,
  weps: [
    { schluessel: 'wep:2026-001', titel: '2026-001 · KGA Musterwiese · 42', detail: 'Weicht ab. Hier geändert: 20.10.26. Der Stand hier ist neuer.', status: 'anders', optionen: ['behalten', 'uebernehmen', 'kopie'], standard: 'behalten' },
    { schluessel: 'wep:2026-002', titel: '2026-002 · KGA Hügelblick', detail: 'Neu auf diesem Gerät.', status: 'neu', optionen: ['uebernehmen', 'ueberspringen'], standard: 'uebernehmen' },
    { schluessel: 'wep:2026-003', titel: '2026-003', detail: 'Schon genau so vorhanden.', status: 'gleich', optionen: [], standard: 'ueberspringen' },
  ],
  papierkorb: [],
  eigene: [],
}

describe('Vorschau beim Einspielen', () => {
  const html = (wahl = standardEntscheidungen(vorschau)) =>
    render(createElement(VorschauAnsicht, { vorschau, wahl, onWahl: nichts, onEinspielen: nichts, onAbbrechen: nichts }))

  it('zeigt abweichende und neue Einträge mit Auswahl, Gleiches nur als Zahl', () => {
    const h = html()
    expect(h).toContain('Vorschau')
    expect(h).toContain('2026-001 · KGA Musterwiese · 42')
    expect(h).toContain('Weicht ab')
    expect(h).toContain('Stand auf diesem Gerät behalten')
    expect(h).toContain('Aus der Sicherung übernehmen (ersetzt den Stand hier)')
    expect(h).toContain('Als neues WEP mit neuer Nummer anlegen')
    expect(h).toContain('Entscheidung für 2026-002 · KGA Hügelblick')
    expect(h).not.toContain('Entscheidung für 2026-003')
    expect(h).toContain('1 Eintrag ist schon genau so vorhanden')
    expect(h).toContain('Es wird nichts überschrieben, was du nicht ausdrücklich wählst')
  })

  it('Standard: „behalten“ ist vorgewählt, Einspielen zählt nur das Übernommene', () => {
    const h = html()
    expect(h).toMatch(/<option value="behalten" selected/)
    expect(h).toContain('Einspielen (1)')
  })

  it('ohne Auswahl ist „Einspielen“ gesperrt', () => {
    const h = html({ 'wep:2026-001': 'behalten', 'wep:2026-002': 'ueberspringen' })
    expect(h).toMatch(/<button type="button" class="knopf knopf-primaer" disabled=""[^>]*>Einspielen<\/button>/)
  })

  it('nichts Neues: sagt es deutlich', () => {
    const leer: Vorschau = { ...vorschau, weps: [vorschau.weps[2]!], hatAenderungen: false }
    const h = render(createElement(VorschauAnsicht, { vorschau: leer, wahl: {}, onWahl: nichts, onEinspielen: nichts, onAbbrechen: nichts }))
    expect(h).toContain('schon vorhanden. Es gibt nichts einzuspielen')
  })

  it('kommt ohne Emojis aus', () => {
    expect(html()).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('Texte zur Sicherung', () => {
  it('Ergebnis', () => {
    expect(ergebnisText({ weps: [{ id: 'a', ersetzt: false }, { id: 'b', ersetzt: true }], papierkorb: 1, eigene: 3, profil: true, fotos: 1, fotosFehlen: 0, bauExcel: 2, fehler: [] })).toBe(
      'Eingespielt: 2 WEPs, 1 WEP im Papierkorb, 3 eigene Positionen, Profil, 1 Foto, 2 Bau-Excel-Dateien.',
    )
    expect(ergebnisText({ weps: [], papierkorb: 0, eigene: 0, profil: false, fotos: 0, fotosFehlen: 0, bauExcel: 0, fehler: [] })).toBe('Es wurde nichts eingespielt.')
  })

  it('Inhalt', () => {
    expect(inhaltText({ weps: 1, papierkorb: 0, eigenePositionen: 2, fotos: 0, fotosOhneDatei: 0, bauExcel: 0, bauExcelOhneDatei: 0 })).toBe('1 WEP, 2 eigene Positionen')
  })
})

describe('Problempflanzen: Warnung mit Knopf „Zur Beseitigung“', () => {
  const h: Hinweis[] = [
    { schwere: 'info', text: 'Regeltext' },
    { schwere: 'warnung', text: 'Staudenknöterich gilt als problematisch.', beseitigung: { gegenstand: 'Staudenknöterich', einheit: 'm²', menge: 3 } },
  ]

  it('mit Rückruf: Knopf neben der Warnung; Info-Hinweise bleiben außen vor', () => {
    const html = render(createElement(WarnListe, { hinweise: h, onBeseitigung: nichts }))
    expect(html).toContain('Staudenknöterich gilt als problematisch.')
    expect(html).toContain('Zur Beseitigung')
    expect(html).not.toContain('Regeltext')
  })

  it('ohne Rückruf (Formular): nur die Warnung, kein Knopf', () => {
    const html = render(createElement(WarnListe, { hinweise: h }))
    expect(html).toContain('Staudenknöterich gilt als problematisch.')
    expect(html).not.toContain('Zur Beseitigung')
  })
})

describe('Baum im Aufwuchs: Knopf „Baum fällen erfassen“ öffnet die Vorlage mit der Art', () => {
  it('Knopf heißt „Baum fällen erfassen“; das Formular startet als „Baum fällen“ mit Art, ohne Maß', async () => {
    const { BeseitigungFormular } = await import('../BeseitigungFormular')
    const h: Hinweis[] = [{ schwere: 'warnung', text: '„Birke" wird entfernt', beseitigung: { gegenstand: 'Birke', einheit: 'Stück', menge: 1, baum: { art: 'Birke' } } }]
    expect(render(createElement(WarnListe, { hinweise: h, onBeseitigung: nichts }))).toContain('Baum fällen erfassen')
    const form = render(createElement(BeseitigungFormular, { vorlage: h[0]!.beseitigung, baumVorlage: true, onAbbrechen: nichts, onFertig: nichts }))
    expect(form).toContain('value="Birke"')
    expect(form).toContain('value="Birke fällen inkl. Wurzelstock, StU fehlt"')
    expect(form).toContain('Stammumfang in 1,30 m Höhe (cm, Pflichtangabe)')
  })
})
