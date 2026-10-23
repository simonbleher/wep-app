// Übersichtliches PDF: gleiche Zahlen wie das PDF „wie Vorlage“ (beide aus derselben exportierten Mappe), Aufbau je Rolle,
// Kopfzeile, Seitenzahlen, Skizzen als Vektor, Unterschrift auf Bestätigung, neuer Deckblatt-Text. Nur erfundene Daten.
import { beforeAll, describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { erzeugeTestBauExcel } from '../../bauexcel/testBauExcel'
import { DECKBLATT_ABSAETZE, absatzText } from '../../export/deckblattText'
import { testFoto } from '../../fotos/testBilder'
import { erzeugeWepPdf, erzeugeWepUebersichtPdf, type WepPdfAusgabe, type WepUebersichtAusgabe } from '../index'
import { euro, abzugEuro } from '../uebersicht/format'
import { testFaelle, type TestFall } from '../testFaelle'
import { vorlageBytes } from './hilfen'
import { liesPdf } from './pdfLesen'

interface Paar {
  fall: TestFall
  neu: WepUebersichtAusgabe
  alt: WepPdfAusgabe
}
let paare: Paar[] = []
const fall = (name: string) => paare.find((p) => p.fall.name.startsWith(name))!
const norm = (t: string) => t.replace(/\s+/g, ' ')
const seitenText = async (p: Paar) => (await liesPdf(p.neu.pdf.bytes)).map((s) => norm(s.text))
/** Überschriften der Abschnitte (17 pt) und Skizzenseiten – ohne Fließtext, der dieselben Wörter enthalten kann. */
const ueberschriften = (p: Paar): string[] => p.neu.pdf.seiten.flatMap((s) => s.ops.filter((o) => o.t === 'text' && o.groesse === 17).map((o) => (o as { s: string }).s))
const alleText = async (p: Paar) => (await seitenText(p)).join(' ')
const zelle = (p: Paar, blatt: string, adresse: string): number => {
  const m = /^([A-Z]+)(\d+)$/.exec(adresse)!
  const s = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
  return (p.alt.pdf.rechenwerk.wert(blatt, Number(m[2]), s) as number) ?? 0
}
const summe = (xs: { summe: number }[]) => Math.round(xs.reduce((s, x) => s + x.summe, 0) * 100) / 100

beforeAll(async () => {
  const bx = await erzeugeTestBauExcel({ skizzeBau: true })
  const bauBuffer = bx.buffer.slice(bx.byteOffset, bx.byteOffset + bx.byteLength) as ArrayBuffer
  for (const f of testFaelle()) {
    const eingabe = { wep: f.wep, quelle: f.mitBauExcel ? bauBuffer : vorlageBytes(), hatBauExcel: Boolean(f.mitBauExcel), rolle: f.rolle }
    const optionen = {
      skizzen: { gruen: f.wep.skizze, grundriss: f.wep.grundriss ? { daten: f.wep.grundriss, bauteile: f.wep.bau?.bauteile ?? [] } : undefined },
    }
    paare.push({ fall: f, neu: await erzeugeWepUebersichtPdf(eingabe, optionen), alt: await erzeugeWepPdf(eingabe, optionen) })
  }
}, 180000)

describe('Zahlen: dieselben wie im PDF „wie Vorlage“', () => {
  it('Bewertung auf dem Deckblatt = Zellen E21–E28 des Deckblatts', () => {
    for (const p of paare) {
      const b = p.neu.pdf.protokoll.bewertung
      expect(b.at(-1)!.betrag, p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E28'))
      const nach = (text: string) => b.find((z) => z.text.startsWith(text))?.betrag
      const rolle = p.fall.rolle
      if (rolle !== 'gruen') {
        expect(nach('Baulichkeiten'), p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E21'))
        expect(nach('Kosten nicht beräumter'), p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E25'))
        expect(nach('Beseitigungskosten Bau'), p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E26'))
      }
      if (rolle !== 'bau') {
        expect(nach('Außenanlagen'), p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E22'))
        expect(nach('Aufwuchs'), p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E23'))
        expect(nach('Beseitigungskosten Außenanlagen'), p.fall.name).toBe(zelle(p, 'Deckbl UPV', 'E27'))
      }
    }
  })

  it('Gesamtbetrag = Summe der Posten (Rechenprobe über die gedruckten Zeilen)', () => {
    for (const p of paare) {
      const b = p.neu.pdf.protokoll.bewertung
      const plus = b.filter((z) => z.art === 'plus').reduce((s, z) => s + z.betrag, 0)
      const minus = b.filter((z) => z.art === 'minus').reduce((s, z) => s + z.betrag, 0)
      expect(plus - minus, p.fall.name).toBeCloseTo(b.at(-1)!.betrag, 2)
    }
  })

  it('Positionen: Summe der Zeilen = Außenanlagen-, Aufwuchs- und Beseitigungssumme der Mappe', () => {
    for (const p of paare) {
      const d = p.neu.pdf.protokoll
      if (p.fall.rolle === 'bau') continue
      expect(summe(d.aussenanlagen), p.fall.name).toBeCloseTo(zelle(p, 'Außenanlagen', 'L46'), 2)
      expect(d.aussenSumme, p.fall.name).toBe(zelle(p, 'Außenanlagen', 'L46'))
      // Aufwuchs: Zeilen aus I und II; die Summe auf Aufwuchs II enthält den Übertrag aus I
      const gesamt = zelle(p, 'Aufwuchs II', 'L46') || zelle(p, 'Aufwuchs I', 'L46')
      expect(summe(d.aufwuchs), p.fall.name).toBeCloseTo(Math.max(zelle(p, 'Aufwuchs I', 'L46'), zelle(p, 'Aufwuchs II', 'L46'), gesamt), 2)
      const bes = d.beseitigung.find((b) => b.abschnitt === 'gruen')
      expect(bes ? summe(bes.posten) : 0, p.fall.name).toBeCloseTo(zelle(p, 'Beseitigungskosten', 'K45'), 2)
    }
  })

  it('Baulichkeiten: Bauteilwerte, Zwischensumme und Gesamt = Zellen des Blatts', () => {
    for (const p of paare.filter((x) => x.fall.rolle !== 'gruen')) {
      const d = p.neu.pdf.protokoll
      const bauteile = d.bauteile.filter((b) => !b.titel.startsWith('Überdachter'))
      expect(Math.round(bauteile.reduce((s, b) => s + b.wert, 0) * 100) / 100, p.fall.name).toBeCloseTo(zelle(p, 'Baulichkeiten', 'K53'), 2)
      expect(d.bauZusammenstellung.at(-1)!.betrag, p.fall.name).toBe(zelle(p, 'Baulichkeiten', 'K81'))
      for (const b of d.bauteile) {
        // Rechenweg stimmig: Fläche × Wert je m² = Wert (auf Cent)
        if (b.wertProM2 !== undefined) expect(b.flaeche * b.wertProM2, `${p.fall.name} ${b.titel}`).toBeCloseTo(b.wert, 1)
      }
    }
  })

  it('Rechenweg je Bauteil kommt aus den Zellen der Laube (Probe Fall „Bau normal“)', () => {
    const d = fall('Bau normal').neu.pdf.protokoll
    const laube = d.bauteile.find((b) => b.kuerzel === 'L')!
    expect(laube.schritte.map((s) => s.wert)).toEqual([zelleWert('Bau normal', 'C14'), zelleWert('Bau normal', 'H14'), zelleWert('Bau normal', 'H15'), zelleWert('Bau normal', 'H16')])
    expect(laube.wert).toBe(zelleWert('Bau normal', 'K17'))
  })

  it('Mängelabzug je Bauteil (WEP) = Mängelabzug im Rechenweg der Baulichkeiten', () => {
    const d = fall('Bau normal').neu.pdf.protokoll
    const laube = d.maengel.find((m) => m.titel.startsWith('Laube'))!
    expect(laube.gesamt).toBe(zelleWert('Bau normal', 'E14'))
  })

  it('Beträge stehen im PDF-Text (Deckblatt, Gesamtbetrag, Summen)', async () => {
    for (const name of ['Grün einfach', 'Bau normal', 'Beides']) {
      const p = fall(name)
      const text = await alleText(p)
      const gesamt = p.neu.pdf.protokoll.bewertung.at(-1)!.betrag
      expect(text, name).toContain(`Gesamtbetrag mit Abzügen ${euro(gesamt)}`)
      for (const z of p.neu.pdf.protokoll.bewertung.filter((x) => x.art !== 'gesamt')) {
        expect(text, `${name} ${z.text}`).toContain(z.art === 'minus' ? abzugEuro(z.betrag) : euro(z.betrag))
      }
    }
  })
})

function zelleWert(name: string, adresse: string): number {
  return zelle(fall(name), 'Baulichkeiten', adresse)
}

describe('Aufbau je Rolle (nur Ausgefülltes)', () => {
  it('Grün: Außenanlagen, Aufwuchs, Beseitigung, Skizze – nichts vom Bau', async () => {
    const t = await alleText(fall('Grün einfach'))
    expect(ueberschriften(fall('Grün einfach'))).toEqual(['Außenanlagen', 'Aufwuchs', 'Beseitigungskosten und Abzüge', 'Bestätigung', 'Skizze Außenanlagen und Aufwuchs'])
    for (const w of ['Terrasse, Betonplatten', 'Thuja fällen und entsorgen', 'Gerda Gruen']) expect(t).toContain(w)
    for (const w of ['Rechenschritt', 'Mängelabzug', 'Abwassersammelgrube', 'Bert Bauer']) expect(t, w).not.toContain(w)
  })

  it('Bau: Baulichkeiten mit Rechenweg, Mängel, Abwasser, Beseitigung, Skizze Bau – nichts vom Grün', async () => {
    const t = await alleText(fall('Bau normal'))
    expect(ueberschriften(fall('Bau normal'))).toEqual(['Baulichkeiten', 'Mängel', 'Abwasser', 'Beseitigungskosten und Abzüge', 'Bestätigung', 'Skizze Baulichkeiten'])
    for (const w of ['Rechenschritt', 'Normalherstellungskosten (NHK)', 'Mängelabzug insgesamt', 'Abwassersammelgrube', 'Rückbau Anbau1', 'Bert Bauer']) expect(t, w).toContain(w)
    for (const w of ['Aufwuchs insgesamt', 'Außenanlagen insgesamt', 'Gerda Gruen']) expect(t, w).not.toContain(w)
  })

  it('Beides mit Bau-Excel-losem WEP: beide Teile und beide Skizzen', async () => {
    const t = await alleText(fall('Beides'))
    expect(ueberschriften(fall('Beides'))).toEqual(['Baulichkeiten', 'Abwasser', 'Außenanlagen', 'Aufwuchs', 'Beseitigungskosten und Abzüge', 'Bestätigung', 'Skizze Baulichkeiten', 'Skizze Außenanlagen und Aufwuchs'])
    for (const w of ['Abwasserkanal', 'Bert Bauer', 'Gerda Gruen']) expect(t, w).toContain(w)
  })

  it('Leeres WEP: nur das Deckblatt, Beträge 0, keine Beispielwerte der Vorlage', async () => {
    const p = fall('Leeres')
    const d = p.neu.pdf.protokoll
    expect(d.bewertung.every((z) => z.betrag === 0)).toBe(true)
    expect(d.bauteile).toHaveLength(0)
    expect(d.beseitigung).toHaveLength(0)
    expect(d.bauAbzuege).toHaveLength(0)
    const t = await alleText(p)
    expect(ueberschriften(p)).toEqual([])
    expect(t).not.toContain('Fäkalienabfuhr')
    expect(t).not.toContain('Rechenschritt')
  })

  it('Grün mit Bau-Excel: Bau-Teile nicht gedruckt (Rolle Grün), Zahlen = Mappe', async () => {
    const p = fall('Grün mit Bau-Excel')
    const t = await alleText(p)
    expect(t).not.toContain('Rechenschritt')
    expect(p.neu.pdf.protokoll.aussenSumme).toBe(zelle(p, 'Außenanlagen', 'L46'))
  })

  it('Positionsnummern laufen durch wie bei den Fotos (Außenanlagen, Aufwuchs, Beseitigung)', () => {
    const d = fall('Grün einfach').neu.pdf.protokoll
    expect(d.aussenanlagen.map((x) => x.nr)).toEqual([1, 2, 3, 4])
    expect(d.aufwuchs.map((x) => x.nr)).toEqual([5, 6, 7, 8, 9])
    expect(d.beseitigung[0].posten.map((x) => x.nr)).toEqual([10, 11])
  })

  it('Überlauf Aufwuchs II: alle 40 Positionen stehen im PDF', async () => {
    const p = fall('Grün voll')
    expect(p.neu.pdf.protokoll.aufwuchs).toHaveLength(40)
    const t = await alleText(p)
    expect(t).toContain('Pflanze Nr. 40')
    expect(t).toContain('Walnuss, Hochstamm')
  })
})

describe('Kopfzeile, Seitenzahlen, Format', () => {
  it('jede Seite: Vorgangs-Nr., Anlage, Parzelle, „Seite n von N“, A4', async () => {
    for (const p of paare) {
      const seiten = await seitenText(p)
      const n = seiten.length
      expect(n, p.fall.name).toBe(p.neu.pdf.seitenZahl)
      // Die Kopfzeile nimmt die Formalien der Datei (bei einer Bau-Excel sind es deren Angaben)
      const k = p.neu.pdf.protokoll.kopf
      seiten.forEach((t, i) => {
        if (k.nr) expect(t, `${p.fall.name} S. ${i + 1}`).toContain(`Vorgangs-Nr. ${k.nr}`)
        if (k.anlage) expect(t).toContain(k.anlage)
        if (k.parzelle) expect(t).toContain(k.parzelle)
        expect(t, `${p.fall.name} S. ${i + 1}`).toContain(`Seite ${i + 1} von ${n}`)
      })
    }
  })

  it('Kopfzeile ohne doppeltes „Parzelle“ (Bau-Excel liefert „Parzelle 42“)', () => {
    expect(fall('Grün mit Bau-Excel').neu.pdf.protokoll.kopf.nr).toBe('2026-007')
  })

  it('Dateiname', () => {
    expect(fall('Grün einfach').neu.name).toBe('2026-101_WEP_uebersichtlich.pdf')
    expect(fall('Bau normal').neu.name).toBe('2026-103_WEP_Bau_uebersichtlich.pdf')
  })

  it('Fließtext bricht nicht über den Rand: keine Seite mit mehr als ihrem Inhalt (Seiten sind A4)', () => {
    for (const p of paare) for (const s of p.neu.pdf.seiten) expect(s.ops.length).toBeGreaterThan(0)
  })
})

describe('Deckblatt-Text (eine Datei, beide PDFs)', () => {
  it('alle Absätze stehen im übersichtlichen PDF', async () => {
    const t = await alleText(fall('Grün einfach'))
    for (const a of DECKBLATT_ABSAETZE) {
      const text = norm(absatzText(a))
      // pdf.js liefert Zeilen einzeln: erste und letzte Wörter genügen für die Zuordnung, ganze Sätze bis zum Umbruch
      expect(t, text.slice(0, 40)).toContain(text.split(' ').slice(0, 6).join(' '))
      expect(t, text.slice(-40)).toContain(text.split(' ').slice(-4).join(' '))
    }
    expect(t).toContain('Erklärung: Die Wertermittler haften nicht für versteckte Mängel.')
    expect(t).toContain('wertermittlung@gartenfreunde-pankow.de')
  })

  it('auch im PDF „wie Vorlage“ (Deckblatt aus der Excel-Kopie)', async () => {
    const seiten = await liesPdf(fall('Grün einfach').alt.pdf.bytes)
    const t = norm(seiten[0].text)
    expect(t).toContain('Wertermittlungsrichtlinie für Kleingärten')
    expect(t).toContain('Die Wertermittler haften nicht für versteckte Mängel.')
    expect(t).toContain('Der neue Unterpächter muss das Inventar nicht übernehmen')
    expect(t).toContain('wertermittlung@gartenfreunde-pankow.de')
    expect(t).not.toContain('Hausschwamm')
    expect(t).not.toContain('§ 9 Abs. 7')
  })
})

describe('Skizzen, Fotos, Unterschrift', () => {
  it('Skizzen sind Vektor (Pfade, keine Bilder) und stehen auf eigenen Seiten', async () => {
    const p = fall('Beides')
    const seiten = await liesPdf(p.neu.pdf.bytes)
    const skizzen = p.neu.pdf.seiten.map((s, i) => ({ s, i })).filter((x) => x.s.art === 'skizze')
    expect(skizzen).toHaveLength(2)
    for (const { i } of skizzen) {
      expect(seiten[i].bilder).toBe(0)
      expect(seiten[i].pfade).toBeGreaterThan(10)
    }
    expect(seiten.reduce((n, s) => n + s.bilder, 0)).toBe(0)
  })

  it('Fotoanhang und Unterschrift auf Bestätigung', async () => {
    const f = fall('Grün einfach')
    const foto = await testFoto(640, 480)
    const sig = createCanvas(300, 100)
    const g = sig.getContext('2d')
    g.strokeStyle = '#000'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(10, 80)
    g.bezierCurveTo(60, 0, 120, 120, 280, 20)
    g.stroke()
    const png = new Uint8Array(sig.toBuffer('image/png'))
    const ohne = await erzeugeWepUebersichtPdf({ wep: f.fall.wep, quelle: vorlageBytes(), hatBauExcel: false, rolle: 'gruen' }, { unterschrift: null })
    const mit = await erzeugeWepUebersichtPdf(
      { wep: f.fall.wep, quelle: vorlageBytes(), hatBauExcel: false, rolle: 'gruen' },
      { unterschrift: png, fotos: [{ nr: 0, titel: '', bytes: foto }, { nr: 3, titel: 'Regentonne', bytes: foto }], fotoKopf: 'Vorgangs-Nr. 2026-101' },
    )
    const sOhne = await liesPdf(ohne.pdf.bytes)
    const sMit = await liesPdf(mit.pdf.bytes)
    expect(sOhne.reduce((n, s) => n + s.bilder, 0)).toBe(0)
    // Unterschrift (1 Bild auf der Bestätigungsseite) + 2 Fotos
    expect(sMit.reduce((n, s) => n + s.bilder, 0)).toBe(3)
    expect(mit.pdf.fotoSeitenZahl).toBe(1)
    expect(sMit).toHaveLength(ohne.pdf.seitenZahl + 1)
    const bestaetigung = sMit.findIndex((s) => norm(s.text).includes('Bestätigung'))
    expect(sMit[bestaetigung].bilder).toBe(1)
    expect(norm(sMit.at(-1)!.text)).toContain('Fotoanhang')
    // Seitenzahl gilt für das ganze Dokument, auch den Fotoanhang
    expect(norm(sMit.at(-1)!.text)).toContain(`Seite ${sMit.length} von ${sMit.length}`)
  })
})
