// PDF-Export (Beta 5, Paket 4): Blätter je Rolle, Zahlen aus den Rechenfunktionen der App, Skizzen als Vektor,
// Unterschrift, Fotoanhang. Alles mit erfundenen Daten; das fertige PDF wird mit pdf.js gelesen.
import { beforeAll, describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { berechneBau } from '../../bau'
import { testFoto } from '../../fotos/testBilder'
import { berechneAbschnittSumme } from '../../gruen/summen'
import { neuerWep } from '../../model'
import { BLATT, unterschriftsFelder, waehleBlaetter, erzeugePdf } from '../erzeugen'
import { leseMappe } from '../mappe'
import { Rechenwerk } from '../formeln'
import { zeigeWert } from '../zahlformat'
import { erzeugeAlleFaelle, vorlageBytes, type FallErgebnis } from './hilfen'
import { liesPdf } from './pdfLesen'

let faelle: FallErgebnis[] = []
const fall = (name: string) => faelle.find((f) => f.fall.name.startsWith(name))!

/** Euro im Format der Vorlage („1.234,50 €“). */
const euro = (n: number) => zeigeWert(n, '#,##0.00\\ "€"')!.links
const blattNamen = (f: FallErgebnis) => f.ausgabe.pdf.blaetter.map((b) => b.blatt)
/** Wert einer Zelle der exportierten Mappe (so rechnet auch Excel). */
const zelle = (f: FallErgebnis, blatt: string, adresse: string): number => {
  const m = /^([A-Z]+)(\d+)$/.exec(adresse)!
  const s = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
  return f.ausgabe.pdf.rechenwerk.wert(blatt, Number(m[2]), s) as number
}

beforeAll(async () => {
  faelle = await erzeugeAlleFaelle()
}, 120000)

describe('Blätter je Rolle', () => {
  it('Grün: Deckblatt, Außenanlagen, Aufwuchs I, Beseitigung, Skizze, Abkürzungen – nichts vom Bau', () => {
    expect(blattNamen(fall('Grün einfach'))).toEqual([BLATT.deckblatt, BLATT.aussen, BLATT.aufwuchs1, BLATT.beseitigung, BLATT.skizzeGruen, BLATT.abkuerzungen])
  })
  it('Aufwuchs II nur bei Überlauf; ohne Beseitigung und ohne Skizze entfallen diese Blätter', () => {
    expect(blattNamen(fall('Grün voll'))).toEqual([BLATT.deckblatt, BLATT.aussen, BLATT.aufwuchs1, BLATT.aufwuchs2, BLATT.abkuerzungen])
  })
  it('Bau: Deckblatt, Baulichkeiten, Mängelliste, Beseitigung, Skizze Bau – nichts vom Grün', () => {
    expect(blattNamen(fall('Bau normal'))).toEqual([BLATT.deckblatt, BLATT.bau, BLATT.maengel, BLATT.beseitigung, BLATT.skizzeBau, BLATT.abkuerzungen])
  })
  it('Beides: alle Blätter in der Reihenfolge der Vorlage', () => {
    expect(blattNamen(fall('Beides'))).toEqual([BLATT.deckblatt, BLATT.bau, BLATT.maengel, BLATT.aussen, BLATT.aufwuchs1, BLATT.beseitigung, BLATT.skizzeBau, BLATT.skizzeGruen, BLATT.abkuerzungen])
  })
  it('Bau ohne Beseitigung und ohne Skizze: nur Deckblatt, Baulichkeiten, Mängelliste, Abkürzungen', () => {
    expect(blattNamen(fall('Bau abgeschrieben'))).toEqual([BLATT.deckblatt, BLATT.bau, BLATT.maengel, BLATT.abkuerzungen])
  })
  it('Leeres WEP: keine Beispielwerte der Vorlage (150 € Fäkalienabfuhr, 250 € nicht beräumt)', async () => {
    const f = fall('Leeres')
    expect(blattNamen(f)).not.toContain(BLATT.beseitigung)
    expect(zelle(f, 'Deckbl UPV', 'E25')).toBe(0)
    expect(zelle(f, 'Deckbl UPV', 'E26')).toBe(0)
    expect(zelle(f, 'Deckbl UPV', 'E28')).toBe(0)
  })
  it('waehleBlaetter nimmt nur sichtbare Blätter der Datei', async () => {
    const mappe = await leseMappe(vorlageBytes())
    const rechen = new Rechenwerk(mappe)
    const liste = waehleBlaetter(mappe, rechen, { rolle: 'beides' })
    // Die leere Vorlage hat in der Beseitigung Beispieltext; deshalb zählt das Blatt dort als ausgefüllt
    expect(liste).toEqual([BLATT.deckblatt, BLATT.bau, BLATT.maengel, BLATT.aussen, BLATT.aufwuchs1, BLATT.beseitigung, BLATT.abkuerzungen])
    expect(liste).not.toContain('Tabelle1')
    expect(liste).not.toContain('Formalien')
  })
})

describe('Zahlen aus den Rechenfunktionen der App', () => {
  it('Grün: Summen = Anzahl × Einzelpreis je Zeile auf Cent gerundet (Excel-Regel), Abweichung zur Live-Summe höchstens ½ Cent je Zeile', () => {
    for (const name of ['Grün einfach', 'Grün voll', 'Rundung']) {
      const f = fall(name)
      const w = f.fall.wep
      const aussen = zelle(f, BLATT.aussen, 'L46')
      const proZeile = w.gruen.aussenanlagen.reduce((s, p) => s + Math.round((p.anzahl * p.einzelpreis + Number.EPSILON) * 100) / 100, 0)
      expect(aussen).toBeCloseTo(proZeile, 2)
      expect(Math.abs(aussen - berechneAbschnittSumme(w.gruen.aussenanlagen))).toBeLessThanOrEqual(0.005 * w.gruen.aussenanlagen.length + 1e-9)
      expect(zelle(f, 'Deckbl UPV', 'E22')).toBe(aussen)
    }
  })

  it('Rundung wie Excel: 3 × 0,335 = 1,01 (nicht 1,00), 2,5 × 0,45 = 1,13, 2,675 → 2,68', () => {
    const f = fall('Rundung')
    expect(zelle(f, BLATT.aussen, 'L15')).toBe(1.01)
    expect(zelle(f, BLATT.aussen, 'L16')).toBe(1.13)
    expect(zelle(f, BLATT.aussen, 'L17')).toBe(2.68)
    expect(zelle(f, BLATT.aussen, 'L18')).toBe(0.29)
  })

  it('Bau: Baulichkeiten insgesamt, nicht beräumt, Beseitigung Bau = berechneBau der App', () => {
    for (const name of ['Bau normal', 'Beides', 'Bau abgeschrieben']) {
      const f = fall(name)
      const erg = berechneBau(f.fall.wep)!
      expect(zelle(f, BLATT.bau, 'K81')).toBeCloseTo(erg.insgesamt, 2)
      expect(zelle(f, 'Deckbl UPV', 'E21')).toBeCloseTo(erg.insgesamt, 2)
      expect(zelle(f, 'Deckbl UPV', 'E25')).toBeCloseTo(erg.nichtBeraeumtKosten, 2)
      expect(zelle(f, 'Deckbl UPV', 'E26')).toBeCloseTo(erg.beseitigungSumme, 2)
    }
  })

  it('Deckblatt: Gesamtbetrag = Zwischensumme − nicht beräumt − Beseitigung Bau − Beseitigung Grün', () => {
    const f = fall('Beides')
    const d = (a: string) => zelle(f, 'Deckbl UPV', a)
    expect(d('E28')).toBeCloseTo(d('E24') - d('E25') - d('E26') - d('E27'), 2)
    expect(d('E24')).toBeCloseTo(d('E21') + d('E22') + d('E23'), 2)
  })

  it('Grün-Rolle ohne Bau-Daten: Bau-Zeilen des Deckblatts sind 0 (nicht die Beispielwerte der Vorlage)', () => {
    const f = fall('Grün einfach')
    expect(zelle(f, 'Deckbl UPV', 'E21')).toBe(0)
    expect(zelle(f, 'Deckbl UPV', 'E25')).toBe(0)
    expect(zelle(f, 'Deckbl UPV', 'E26')).toBe(0)
  })

  it('Grün mit Bau-Excel: Bau-Zeilen kommen aus der Bau-Excel (Beispielwerte bleiben, die Datei ist maßgeblich)', () => {
    const f = fall('Grün mit Bau-Excel')
    expect(f.ausgabe.pdf.rechenwerk.bericht.unbekannt).toEqual([])
    expect(blattNamen(f)).not.toContain(BLATT.bau)
  })
})

describe('das fertige PDF (pdf.js)', () => {
  it('enthält die gedruckten Summen als Text', async () => {
    const f = fall('Grün einfach')
    const seiten = await liesPdf(f.ausgabe.pdf.bytes)
    expect(seiten).toHaveLength(f.ausgabe.pdf.seitenZahl)
    const alles = seiten.map((s) => s.text.replace(/\s+/g, ' ')).join(' ')
    expect(alles).toContain('Anlage 2 – Bewertung Außenanlagen')
    expect(alles).toContain(euro(zelle(f, BLATT.aussen, 'L46')))
    expect(alles).toContain(euro(zelle(f, 'Deckbl UPV', 'E28')))
    expect(alles).toContain('Erika Musterfrau')
    expect(alles).toContain('KGA Testgarten')
    expect(alles).toContain('Thuja fällen und entsorgen')
    expect(alles).not.toContain('Anlage 1 (Blatt 1)')
  })

  it('Seitengröße A4, Dokument beginnt mit %PDF', () => {
    const f = fall('Bau normal')
    expect(Buffer.from(f.ausgabe.pdf.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    for (const b of f.ausgabe.pdf.blaetter) for (const s of b.seiten) expect([Math.round(s.breite), Math.round(s.hoehe)]).toEqual([595, 842])
  })

  it('Skizzen sind Vektorgrafik: viele Pfade, kein einziges Bild', async () => {
    for (const [name, blatt, text] of [
      ['Grün einfach', BLATT.skizzeGruen, 'Apfel'],
      ['Bau normal', BLATT.skizzeBau, 'Massenberechnung'],
    ] as const) {
      const f = fall(name)
      const index = blattNamen(f).slice(0, blattNamen(f).indexOf(blatt)).reduce((n, b) => n + f.ausgabe.pdf.blaetter.find((x) => x.blatt === b)!.seiten.length, 0)
      const seiten = await liesPdf(f.ausgabe.pdf.bytes)
      expect(seiten[index].text).toContain(text)
      expect(seiten[index].bilder).toBe(0)
      expect(seiten[index].pfade).toBeGreaterThan(30)
    }
  })

  it('Skizze Bau: Grundriss mit Kürzeln, Flächen und Maßen', async () => {
    const f = fall('Bau normal')
    const seiten = await liesPdf(f.ausgabe.pdf.bytes)
    const text = seiten.map((s) => s.text).join(' ')
    expect(text).toMatch(/Massenberechnung \(Außenmaße/)
    expect(text).toMatch(/20,00 m²/)
    expect(text).toMatch(/Summe: /)
  })
})

describe('Unterschrift', () => {
  const kritzel = (() => {
    const c = createCanvas(300, 100)
    const g = c.getContext('2d')
    g.strokeStyle = '#1a1a80'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(10, 70)
    g.bezierCurveTo(60, 0, 90, 100, 150, 30)
    g.bezierCurveTo(190, 0, 240, 90, 290, 40)
    g.stroke()
    return new Uint8Array(c.toBuffer('image/png'))
  })()

  it('Felder: Grün-Blätter über E13, Bau-Blätter über E12, Beseitigung beide', async () => {
    const mappe = await leseMappe(vorlageBytes())
    const felder = (name: string) => unterschriftsFelder(mappe.blaetter.find((b) => b.name.trim() === name)!).map((f) => f.teil)
    expect(felder(BLATT.aussen)).toEqual(['gruen'])
    expect(felder(BLATT.aufwuchs1)).toEqual(['gruen'])
    expect(felder(BLATT.aufwuchs2)).toEqual(['gruen'])
    expect(felder(BLATT.bau)).toEqual(['bau'])
    expect(felder(BLATT.beseitigung)).toEqual(['bau', 'gruen'])
    expect(felder(BLATT.skizzeBau)).toEqual(['bau'])
    expect(felder(BLATT.skizzeGruen)).toEqual(['gruen'])
    expect(felder(BLATT.deckblatt)).toEqual([])
    expect(felder(BLATT.maengel)).toEqual([])
  })

  it('ohne Bestätigung keine Unterschrift; mit Bestätigung je ein Bild auf den Blättern des eigenen Teils', async () => {
    const f = fall('Beides')
    const ohne = await liesPdf(f.ausgabe.pdf.bytes)
    expect(ohne.reduce((n, s) => n + s.bilder, 0)).toBe(0)

    const mit = await erzeugePdf(f.xlsx, { rolle: 'beides', unterschrift: kritzel, skizzen: { gruen: f.fall.wep.skizze } })
    const seiten = await liesPdf(mit.bytes)
    // Baulichkeiten (Blatt 2), Außenanlagen, Aufwuchs I, Beseitigung (zwei Felder), Skizze Bau (ohne Grundriss: Seite aus Vorlage), Skizze Grün
    const proBlatt = new Map<string, number>()
    let i = 0
    for (const b of mit.blaetter) for (const s of b.seiten) proBlatt.set(`${b.blatt}#${s.zeilen[0]}`, seiten[i++].bilder), void s
    const summe = (name: string) => [...proBlatt].filter(([k]) => k.startsWith(name + '#')).reduce((n, [, v]) => n + v, 0)
    expect(summe(BLATT.aussen)).toBe(1)
    expect(summe(BLATT.aufwuchs1)).toBe(1)
    expect(summe(BLATT.beseitigung)).toBe(2)
    expect(summe(BLATT.bau)).toBe(1)
    expect(summe(BLATT.deckblatt)).toBe(0)
    expect(summe(BLATT.maengel)).toBe(0)
  })

  it('Rolle Grün: nur Grün-Felder, Rolle Bau: nur Bau-Felder', async () => {
    const g = fall('Grün einfach')
    const gMit = await erzeugePdf(g.xlsx, { rolle: 'gruen', unterschrift: kritzel, skizzen: { gruen: g.fall.wep.skizze } })
    const gSeiten = await liesPdf(gMit.bytes)
    // Außenanlagen 1, Aufwuchs I 1, Beseitigung 1 (nur Grün), Skizze 1
    expect(gSeiten.reduce((n, s) => n + s.bilder, 0)).toBe(4)

    const b = fall('Bau normal')
    const bMit = await erzeugePdf(b.xlsx, { rolle: 'bau', unterschrift: kritzel, skizzen: { grundriss: { daten: b.fall.wep.grundriss!, bauteile: b.fall.wep.bau!.bauteile } } })
    const bSeiten = await liesPdf(bMit.bytes)
    // Baulichkeiten Blatt 2 → 1, Beseitigung (nur Bau) 1, Skizze Bau 1
    expect(bSeiten.reduce((n, s) => n + s.bilder, 0)).toBe(3)
  })

  it('kaputtes PNG: PDF entsteht trotzdem, ohne Unterschrift', async () => {
    const f = fall('Grün einfach')
    const erg = await erzeugePdf(f.xlsx, { rolle: 'gruen', unterschrift: new Uint8Array([1, 2, 3, 4, 5]) })
    expect((await liesPdf(erg.bytes)).reduce((n, s) => n + s.bilder, 0)).toBe(0)
  })
})

describe('Fotoanhang', () => {
  it('sechs Fotos je Seite, mit Positionsnummer und Bezeichnung', async () => {
    const f = fall('Grün einfach')
    const jpeg = await testFoto(640, 480)
    const hochkant = await testFoto(480, 640)
    const fotos = Array.from({ length: 8 }, (_, i) => ({ nr: i % 4, titel: i % 4 === 0 ? '' : `Position ${i % 4}`, text: i === 2 ? 'Blick von Süden' : undefined, bytes: i % 2 ? hochkant : jpeg }))
    const ohne = await liesPdf(f.ausgabe.pdf.bytes)
    const erg = await erzeugePdf(f.xlsx, { rolle: 'gruen', fotos, fotoKopf: 'Vorgangs-Nr. 2026-101 – KGA Testgarten', skizzen: { gruen: f.fall.wep.skizze } })
    expect(erg.fotoSeitenZahl).toBe(2)
    const seiten = await liesPdf(erg.bytes)
    expect(seiten).toHaveLength(ohne.length + 2)
    const anhang = seiten.slice(-2)
    expect(anhang[0].bilder).toBe(6)
    expect(anhang[1].bilder).toBe(2)
    expect(anhang[0].text).toContain('Fotoanhang')
    expect(anhang[0].text).toContain('Vorgangs-Nr. 2026-101')
    expect(anhang[0].text).toContain('Gesamtansicht')
    expect(anhang[0].text).toContain('Nr. 01 – Position 1')
    expect(anhang.map((s) => s.text).join(' ')).toContain('Blick von Süden')
    expect(anhang[1].text).toContain('Seite 2 von 2')
  })

  it('unlesbares Bild: Hinweis, restliche Fotos bleiben', async () => {
    const f = fall('Grün einfach')
    const gut = await testFoto(320, 240)
    const erg = await erzeugePdf(f.xlsx, { rolle: 'gruen', fotos: [{ nr: 1, titel: 'Apfel', bytes: gut }, { nr: 2, titel: 'Birne', bytes: new Uint8Array([9, 9, 9, 9]) }] })
    expect(erg.hinweise.join(' ')).toContain('Birne')
    expect(erg.fotoSeitenZahl).toBe(1)
    const seiten = await liesPdf(erg.bytes)
    expect(seiten[seiten.length - 1].bilder).toBe(1)
  })

  it('ohne Fotos kein Anhang', () => {
    expect(fall('Grün einfach').ausgabe.pdf.fotoSeitenZahl).toBe(0)
  })
})

describe('Sonderfälle', () => {
  it('leeres WEP (nur Formalien-Vorgabe): PDF entsteht, Deckblatt mit 0,00 €', async () => {
    const f = fall('Leeres')
    const seiten = await liesPdf(f.ausgabe.pdf.bytes)
    expect(seiten.length).toBeGreaterThan(3)
    expect(seiten[0].text).toContain('0,00 €')
    expect(f.ausgabe.name).toBe('2026-107_WEP.pdf')
  })

  it('Dateiname wie beim Excel-Export, nur .pdf', () => {
    expect(fall('Grün einfach').ausgabe.name).toBe('2026-101_WEP.pdf')
    expect(fall('Bau normal').ausgabe.name).toBe('2026-103_WEP_Bau.pdf')
  })

  it('WEP ohne Fotos/Unterschrift erzeugt auch aus einem frischen neuerWep ohne Fehler', async () => {
    const w = neuerWep('2026-200')
    const { erzeugeWepPdf } = await import('../index')
    const a = await erzeugeWepPdf({ wep: w, quelle: vorlageBytes(), hatBauExcel: false, rolle: 'gruen' }, {})
    expect(a.pdf.seitenZahl).toBeGreaterThan(2)
  })
})
