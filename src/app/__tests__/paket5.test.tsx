// @vitest-environment node
// Beta 3, Paket 5: Karte „Bau-Excel“ am WEP und der Abgleich der Formalien (Auswahl je Feld).
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BauExcel } from '@/model'
import type { FormalienAbgleich } from '@/bauexcel/abgleich'
import { AbgleichDialog, BauExcelKarte, PositionenUebernehmenDialog, BAU_EXCEL_ACCEPT, bauStatusText, type BauNachladeStand, type BauStand } from '../BauExcel'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const nichts = () => {}
const bau: BauExcel = { name: 'WEP Bau Testgarten.xlsx', groesse: 181_000, version: 'v1', hinzugefuegtAm: '2026-10-20T08:00:00.000Z' }
const keinNachladen: BauNachladeStand = { laeuft: false, netz: 'ok', fehlt: false, veraltet: false, jetztLaden: nichts }
const lokal: BauStand = { record: { wepId: '2026-007', version: 'v1', hatDatei: true, hochgeladen: true, erstelltAm: 'x' } }

const karte = (p: Partial<Parameters<typeof BauExcelKarte>[0]> = {}) =>
  render(
    createElement(BauExcelKarte, {
      bauExcel: bau,
      stand: lokal,
      nachladen: keinNachladen,
      offeneAngaben: 0,
      onWaehlen: nichts,
      onAustauschen: nichts,
      onEntfernen: nichts,
      onAbgleichen: nichts,
      ...p,
    }),
  )

describe('Karte „Bau-Excel“', () => {
  it('ohne Datei: Erklärung und „Bau-Excel auswählen“', () => {
    const h = karte({ bauExcel: undefined, stand: {} })
    expect(h).toContain('Bau-Excel auswählen')
    expect(h).toContain('Außenanlagen, Aufwuchs und Beseitigungen werden daraus übernommen')
    expect(h).not.toContain('Austauschen')
  })

  it('mit Datei: Name, Größe, Stand und Austauschen/Entfernen', () => {
    const h = karte()
    expect(h).toContain('WEP Bau Testgarten.xlsx')
    expect(h).toContain('177 KB')
    expect(h).toContain('auf diesem Gerät · in OneDrive')
    expect(h).toContain('Austauschen')
    expect(h).toContain('Entfernen')
  })

  it('Stände: wartet auf Upload, noch nicht auf diesem Gerät, im Mobilfunk, veraltet', () => {
    const wartet: BauStand = { record: { ...lokal.record!, hochgeladen: false } }
    expect(bauStatusText(bau, wartet, keinNachladen)).toBe('auf diesem Gerät · wartet auf Upload')
    expect(bauStatusText(bau, {}, { ...keinNachladen, fehlt: true, laeuft: true })).toBe('wird aus OneDrive geladen …')
    expect(bauStatusText(bau, {}, { ...keinNachladen, fehlt: true, netz: 'nur-wlan' })).toContain('im WLAN geladen')
    expect(bauStatusText(bau, {}, { ...keinNachladen, fehlt: true, netz: 'offline' })).toContain('mit Netz geladen')
    expect(bauStatusText(bau, {}, { ...keinNachladen, fehlt: true, veraltet: true })).toContain('alte Fassung')
    // eine Datei in anderer Fassung zählt nicht als „auf diesem Gerät“
    const alt: BauStand = { record: { ...lokal.record!, version: 'v0' } }
    expect(bauStatusText(bau, alt, { ...keinNachladen, fehlt: true })).toBe('noch nicht auf diesem Gerät')
  })

  it('im Mobilfunk mit „nur WLAN“ gibt es „Jetzt laden“', () => {
    expect(karte({ stand: {}, nachladen: { ...keinNachladen, fehlt: true, netz: 'nur-wlan' } })).toContain('Jetzt laden')
    expect(karte()).not.toContain('Jetzt laden')
  })

  it('fehlende Positionen: Hinweis mit „Positionen übernehmen“; Dialog zeigt je Liste die Zeilen', () => {
    const gruen = { aussenanlagen: [], aufwuchs: [], beseitigungAA: [] }
    expect(karte({ stand: { ...lokal, gruen }, offenePositionen: 0, onPositionen: nichts })).not.toContain('Positionen übernehmen')
    const h = karte({ stand: { ...lokal, gruen }, offenePositionen: 3, onPositionen: nichts })
    expect(h).toContain('noch 3 Zeilen')
    expect(h).toContain('Positionen übernehmen')
    const d = render(
      createElement(PositionenUebernehmenDialog, {
        abgleich: [
          { liste: 'aufwuchs', name: 'Aufwuchs', neu: [{ text: 'Magnolie', detail: '1 Stück · 3 €' }], gleich: 2, wepLeer: false },
          { liste: 'aussenanlagen', name: 'Außenanlagen', neu: [], gleich: 1, wepLeer: false },
        ],
        dateiName: 'Bau.xlsx',
        onUebernehmen: nichts,
        onSpaeter: nichts,
      }),
    )
    expect(d).toContain('Aufwuchs: 1 Zeile hinzufügen')
    expect(d).toContain('Magnolie – 1 Stück · 3 €')
    expect(d).toContain('2 schon im WEP')
    expect(d).not.toContain('Außenanlagen: ')
  })

  it('offene Angaben: Hinweis mit „Formalien abgleichen“; abgeglichen: leiser Knopf zum erneuten Vergleich', () => {
    const offen = karte({ stand: { ...lokal, formalien: { parzelle: 'Parzelle 42' } }, offeneAngaben: 2 })
    expect(offen).toContain('2 Angaben für die Formalien, die noch nicht abgeglichen sind')
    expect(offen).toContain('Formalien abgleichen')
    const fertig = karte({ bauExcel: { ...bau, abgeglichen: true }, stand: { ...lokal, formalien: {} }, offeneAngaben: 0 })
    expect(fertig).not.toContain('noch nicht abgeglichen')
    expect(fertig).toContain('erneut vergleichen')
  })

  it('die Dateiauswahl erlaubt .xlsx (auf Android erscheinen dort OneDrive und Downloads)', () => {
    expect(BAU_EXCEL_ACCEPT).toContain('.xlsx')
    expect(BAU_EXCEL_ACCEPT).toContain('spreadsheetml.sheet')
  })
})

describe('Abgleich-Dialog', () => {
  const abgleich: FormalienAbgleich = {
    neu: [{ feld: 'weg', name: 'Weg', bau: 'Rosenweg', wep: '' }],
    unterschiede: [
      { feld: 'parzelle', name: 'Parzelle', bau: 'Parzelle 42', wep: 'Parzelle 17' },
      { feld: 'unterpaechter', name: 'Unterpächter', bau: 'Erika Musterfrau', wep: 'Max Beispielmann' },
    ],
    gleich: 3,
  }
  const h = render(createElement(AbgleichDialog, { abgleich, dateiName: 'Bau.xlsx', onUebernehmen: nichts, onSpaeter: nichts }))

  it('zeigt je Feld „Bau-Excel sagt …“ und „Im WEP steht …“', () => {
    expect(h).toContain('Formalien abgleichen')
    expect(h).toContain('Parzelle')
    expect(h).toContain('Bau-Excel sagt')
    expect(h).toContain('Parzelle 42')
    expect(h).toContain('Im WEP steht')
    expect(h).toContain('Parzelle 17')
    expect(h).toContain('Erika Musterfrau')
    expect(h).toContain('Max Beispielmann')
    expect(h.match(/type="radio"/g)).toHaveLength(4)
  })

  it('voreingestellt ist der Wert im WEP – nichts wird ohne Auswahl überschrieben', () => {
    // pro Feld ist genau die zweite Option („Im WEP steht“) angekreuzt
    const radios = [...h.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => /checked/.test(m[0]))
    expect(radios).toEqual([false, true, false, true])
  })

  it('bietet „Alle aus der Bau-Excel“, „Alle im WEP lassen“, „Später“ und „Übernehmen“; erwähnt ergänzte leere Felder', () => {
    for (const t of ['Alle aus der Bau-Excel', 'Alle im WEP lassen', 'Später', 'Übernehmen']) expect(h).toContain(t)
    expect(h).toContain('1 leeres Feld wird aus der Bau-Excel ergänzt')
    expect(h).toContain('bei 2 Feldern')
  })
})
