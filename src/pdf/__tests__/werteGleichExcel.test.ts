// Wichtigster Test des PDF-Exports (Beta 5, Paket 4): Die Werte im PDF sind die Werte der Excel-Datei.
// Jeder Fall (erfundene Daten) wird exportiert, mit LibreOffice neu berechnet, und jede Formelzelle der gedruckten
// Blätter wird verglichen: (1) Rechenwerk der App = LibreOffice, (2) der im PDF gedruckte Text = der LibreOffice-Wert
// im Zahlenformat der Zelle. Ohne LibreOffice wird der Test übersprungen (wie die übrigen LibreOffice-Tests).
import { beforeAll, describe, expect, it } from 'vitest'
import { leseMappe, schluessel, type Mappe, type Zellwert } from '../mappe'
import { blattBereich } from '../blatt'
import { zeigeWert } from '../zahlformat'
import { testFaelle } from '../testFaelle'
import { erzeugeAlleFaelle, libreOfficeDa, rechneMitLibreOffice, type FallErgebnis } from './hilfen'

const LO = libreOfficeDa()

let faelle: FallErgebnis[] = []
let lo: Mappe[] = []

beforeAll(async () => {
  if (!LO) return
  faelle = await erzeugeAlleFaelle()
  const neu = rechneMitLibreOffice(faelle.map((f) => f.xlsx))
  lo = await Promise.all(neu.map((b) => leseMappe(b)))
}, 300000)

const leer = (v: Zellwert | undefined) => v === null || v === undefined || v === '' || v === 0

/** „1.234,50 €“ → 1234.5 (nur für die Prüfung der gedruckten Zahlen). */
function zahlAusText(t: string): number | undefined {
  const m = /(-?\s*\d[\d.]*(?:,\d+)?)/.exec(t.replace(/\s/g, ''))
  if (!m) return undefined
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

describe.skipIf(!LO)('PDF-Werte = Excel-Werte (LibreOffice)', () => {
  it('alle Fälle wurden gerechnet', () => {
    expect(faelle.length).toBeGreaterThanOrEqual(8)
    expect(lo).toHaveLength(faelle.length)
  })

  for (let i = 0; i < testFaelle().length; i++) {
    it(`Fall ${i + 1}: Rechenwerk = LibreOffice, gedruckter Text = LibreOffice-Wert`, () => {
      const f = faelle[i]
      const loMappe = lo[i]
      const rechen = f.ausgabe.pdf.rechenwerk
      expect(rechen.bericht.unbekannt, 'Formeln, die das Rechenwerk nicht kennt').toEqual([])
      let verglichen = 0
      let gedruckt = 0
      const abweichungen: string[] = []

      for (const b of f.ausgabe.pdf.blaetter) {
        const blatt = rechen.blatt(b.blatt)!
        const loBlatt = loMappe.blaetter.find((x) => x.name === blatt.name)!
        const bereich = blattBereich(blatt)
        // gedruckter Text je Zelle
        const text = new Map<string, string>()
        for (const s of b.seiten) for (const op of s.ops) if (op.t === 'text' && op.zelle) text.set(op.zelle, (text.get(op.zelle) ?? '') + (text.has(op.zelle) ? '\n' : '') + op.s)

        for (const [k, zelle] of blatt.zellen) {
          const z = Math.floor(k / 20000)
          const s = k % 20000
          if (z < bereich.z1 || z > bereich.z2 || s < bereich.s1 || s > bereich.s2) continue
          if (!zelle.formel) continue
          const mein = rechen.wert(blatt.name, z, s)
          const loWert = loBlatt.zellen.get(schluessel(z, s))?.wert
          verglichen++
          const ok =
            leer(mein as Zellwert) && leer(loWert as Zellwert)
              ? true
              : typeof mein === 'number' && typeof loWert === 'number'
                ? Math.abs(mein - loWert) <= 1e-6 * Math.max(1, Math.abs(loWert))
                : typeof mein === 'string' && typeof loWert === 'string'
                  ? mein.trim() === loWert.trim()
                  : false
          if (!ok) abweichungen.push(`${blatt.name}!${z}:${s} Rechenwerk=${JSON.stringify(mein)} LibreOffice=${JSON.stringify(loWert)} Formel=${zelle.formel}`)

          // Gedruckter Text: Zahl im Zahlenformat der Zelle
          if (typeof loWert === 'number' && loWert !== 0) {
            const st = f.ausgabe.pdf.rechenwerk.mappe.stile[zelle.stil]
            const soll = zeigeWert(loWert, st.format)
            const ist = text.get(`${blatt.name}!${z}:${s}`)
            if (soll && ist !== undefined) {
              gedruckt++
              const a = zahlAusText(soll.rechts ?? soll.links)
              const c = zahlAusText(ist)
              if (a !== undefined && c !== undefined && Math.abs(a - c) > 1e-9) abweichungen.push(`${blatt.name}!${z}:${s} gedruckt „${ist}“, erwartet „${soll.rechts ?? soll.links}“`)
            }
          }
        }
      }
      expect(abweichungen).toEqual([])
      expect(verglichen).toBeGreaterThan(20)
      expect(gedruckt).toBeGreaterThan(0)
    })
  }
})
