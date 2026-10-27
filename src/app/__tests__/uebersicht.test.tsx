// @vitest-environment node
// Reiter „Übersicht“ und BV-Detailansicht: dieselben Zahlen wie das übersichtliche PDF. Erfundene Daten (testFaelle).
import { beforeAll, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { erzeugeTestBauExcel } from '@/bauexcel/testBauExcel'
import { erzeugeWepProtokoll, erzeugeWepUebersichtPdf, type Protokoll } from '@/pdf'
import { euro } from '@/pdf/uebersicht/format'
import { testFaelle, type TestFall } from '@/pdf/testFaelle'
import { vorlageBytes } from '@/pdf/__tests__/hilfen'
import { ProtokollAnsicht } from '../Uebersicht'

interface Paar {
  fall: TestFall
  uebersicht: Protokoll
  pdf: Protokoll
}
const paare: Paar[] = []

beforeAll(async () => {
  const bx = await erzeugeTestBauExcel({ skizzeBau: true })
  const bau = bx.buffer.slice(bx.byteOffset, bx.byteOffset + bx.byteLength) as ArrayBuffer
  for (const fall of testFaelle()) {
    const eingabe = { wep: fall.wep, quelle: fall.mitBauExcel ? bau : vorlageBytes(), hatBauExcel: Boolean(fall.mitBauExcel), rolle: fall.rolle }
    paare.push({ fall, uebersicht: await erzeugeWepProtokoll(eingabe), pdf: (await erzeugeWepUebersichtPdf(eingabe, {})).pdf.protokoll })
  }
}, 180000)

describe('Übersicht = übersichtliches PDF', () => {
  it('gleiches Protokoll in allen Fällen (Bewertung, Positionen, Bauteile mit Rechenweg)', () => {
    expect(paare.length).toBeGreaterThan(5)
    for (const p of paare) expect(p.uebersicht, p.fall.name).toEqual(p.pdf)
  })

  it('die Seite zeigt Gesamtbetrag, Summen und jede Position', () => {
    for (const { fall, uebersicht: p } of paare) {
      const html = renderToStaticMarkup(createElement(ProtokollAnsicht, { p })).replace(/&nbsp;| /g, ' ')
      const n = (s: string) => s.replace(/ /g, ' ')
      expect(html, fall.name).toContain(n(euro(p.bewertung.at(-1)!.betrag)))
      expect(html).toContain('ueb-gesamt')
      for (const x of [...p.aussenanlagen, ...p.aufwuchs]) expect(html, `${fall.name}: ${x.text}`).toContain(n(euro(x.summe)))
      if (p.aussenanlagen.length) expect(html).toContain(n(euro(p.aussenSumme)))
      for (const b of p.bauteile) expect(html, `${fall.name}: ${b.titel}`).toContain(n(euro(b.wert)))
    }
  })

  it('Bau mit Rechenweg: NHK, Mängel- und Altersabzug, Baupreisindex', () => {
    const { uebersicht: p } = paare.find((x) => x.fall.name === 'Bau normal')!
    const html = renderToStaticMarkup(createElement(ProtokollAnsicht, { p }))
    expect(html).toContain('Rechenschritt')
    expect(html).toContain('Normalherstellungskosten')
    expect(html).toContain('Zusammenstellung Baulichkeiten')
    expect(html).toContain('Abwassersammelgrube')
  })
})
