// Beta 3, Paket 6: Problempflanzen – Hinweis mit Vorschlag „Beseitigung“, nur warnen, Quelle je Eintrag.
import { describe, expect, it } from 'vitest'
import invasiveRaw from '../../../data/invasive.json'
import problemRaw from '../../../data/problempflanzen.json'
import type { InvasiveListe, Problempflanze, ProblempflanzenListe } from '@/katalog'
import { findeProblempflanze } from '@/katalog'
import { neuerWep, type Position } from '@/model'
import { berechneRegelhinweise } from '../regelhinweise'

const invasive = (invasiveRaw as unknown as InvasiveListe).arten
const liste = (problemRaw as unknown as ProblempflanzenListe).eintraege

function pos(bezeichnung: string, anzahl = 1, einheit = 'Stück'): Position {
  return { id: 'p', bezeichnung, anzahl, einheit, einzelpreis: 10, preisManuell: false, hinweise: [] }
}
const hinweise = (p: Position) => berechneRegelhinweise(p, neuerWep('2026-001'), [], invasive, liste)

describe('Datenliste data/problempflanzen.json', () => {
  it('jeder Eintrag nennt seine Quelle', () => {
    expect(liste.length).toBeGreaterThan(5)
    for (const e of liste) {
      expect(e.quelle.text.length, e.id).toBeGreaterThan(10)
      expect(['richtlinie', 'praxis']).toContain(e.quelle.art)
      if (e.quelle.art === 'richtlinie') {
        expect(e.quelle.seite, e.id).toBeGreaterThan(0)
        expect(e.quelle.bestaetigt, e.id).toBe(true)
      } else {
        // Praxis-Einträge stehen nicht in der Richtlinie und sind noch nicht bestätigt
        expect(e.quelle.seite, e.id).toBeUndefined()
        expect(e.quelle.bestaetigt, e.id).toBe(false)
      }
    }
  })

  it('Ids sind eindeutig; kein Eintrag steht schon in der Unionsliste (keine doppelte Warnung)', () => {
    const ids = liste.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of liste) {
      for (const art of invasive) {
        expect(art.wissenschaftlich, e.id).not.toBe(e.wissenschaftlich)
      }
    }
  })

  it('Seitenangaben der Richtlinie stimmen mit dem Katalog überein (Nadelgehölze S. 17)', () => {
    for (const e of liste.filter((x) => x.regel === 'nadel-gross')) expect(e.quelle.seite).toBe(17)
  })
})

describe('Hinweis bei Problempflanzen', () => {
  it('Japanischer Staudenknöterich: Warnung mit Vorschlag Beseitigung, Menge und Einheit übernommen', () => {
    const h = hinweise(pos('Japanischer Staudenknöterich', 3, 'm²'))
    const w = h.find((x) => x.beseitigung)
    expect(w?.schwere).toBe('warnung')
    expect(w?.text).toContain('Staudenknöterich')
    expect(w?.text).toContain('Beseitigung')
    expect(w?.beseitigung).toEqual({ gegenstand: 'Japanischer Staudenknöterich', einheit: 'm²', menge: 3 })
  })

  it('findet auch wissenschaftlichen Namen, Synonym und leichten Tippfehler', () => {
    expect(findeProblempflanze(liste, 'Reynoutria japonica')?.id).toBe('japan-staudenknoeterich')
    expect(findeProblempflanze(liste, 'Fallopia japonica')?.id).toBe('japan-staudenknoeterich')
    expect(findeProblempflanze(liste, 'Staudenknöterich')?.id).toBe('japan-staudenknoeterich')
    expect(findeProblempflanze(liste, 'Japanischer Staudenknoeterich')?.id).toBe('japan-staudenknoeterich')
    expect(findeProblempflanze(liste, 'Japanischer Staudenknöterisch')?.id).toBe('japan-staudenknoeterich')
  })

  it('Nadelgehölz, das zu groß wird (Richtlinie S. 17): nennt die Regel, auch in Klammern und Teilen der Bezeichnung', () => {
    for (const b of ['Fichte', 'Blaufichte', 'Nadelgehölz, Solitär (Fichte)', 'Waldkiefer', 'Kiefer']) {
      const w = hinweise(pos(b)).find((x) => x.beseitigung)
      expect(w, b).toBeDefined()
      expect(w!.schwere).toBe('warnung')
      expect(w!.text).toContain('muss entfernt werden')
      expect(w!.text).toContain('S. 17')
    }
  })

  it('warnt nicht bei harmlosen Pflanzen und Hecken', () => {
    for (const b of ['Apfel, Halbstamm, 5–30 J.', 'Liguster-Hecke (Laub, einfache Art)', 'Lebensbaum (Hecke)', 'Rasen', 'Zaubernuss', 'Tannenbaum', 'Staudenbeet']) {
      expect(hinweise(pos(b)).filter((x) => x.beseitigung), b).toEqual([])
    }
  })

  it('Art der Unionsliste: genau eine Warnung (kein doppelter Hinweis), ebenfalls mit Vorschlag', () => {
    const h = hinweise(pos('Götterbaum', 2))
    expect(h.filter((x) => x.schwere === 'warnung')).toHaveLength(1)
    expect(h[0]?.beseitigung).toEqual({ gegenstand: 'Götterbaum', einheit: 'Stück', menge: 2 })
  })

  it('nur warnen, nie sperren: der Hinweis ist Text und Vorschlag, die Position bleibt unverändert', () => {
    const p = pos('Japanischer Staudenknöterich', 5, 'm²')
    const vorher = JSON.stringify(p)
    const h = hinweise(p)
    expect(h.every((x) => x.schwere === 'warnung' || x.schwere === 'info')).toBe(true)
    expect(JSON.stringify(p)).toBe(vorher)
  })

  it('ohne Liste (alte Aufrufer) verhält sich alles wie bisher', () => {
    const h = berechneRegelhinweise(pos('Fichte'), neuerWep('2026-001'), [], invasive)
    expect(h).toEqual([])
  })

  it('Praxis-Hinweis sagt, dass die Richtlinie die Art nicht nennt', () => {
    const e: Problempflanze | undefined = liste.find((x) => x.regel === 'praxis-neophyt')
    expect(e).toBeDefined()
    const w = hinweise(pos(e!.deutsch.split('/')[0]!.trim())).find((x) => x.beseitigung)
    expect(w?.text).toContain('Richtlinie nennt die Art nicht')
  })
})
