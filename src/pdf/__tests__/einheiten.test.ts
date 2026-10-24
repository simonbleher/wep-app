// Bausteine des PDF-Exports einzeln: XML-Leser, Formeln, Zahlenformate, Farben, Seitenaufteilung, Zeichenkontext.
import { inflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as lib from 'pdf-lib'
import { Rechenwerk, runde, verschiebeFormel } from '../formeln'
import { cssFarbe, PdfKontext } from '../kontext'
import { leseMappe, spaltenBuchstaben, spaltenNummer, zelleAdresse } from '../mappe'
import { setzeBlatt, spaltenPt } from '../blatt'
import { ladeSchriften, messerAus, kodierbar } from '../schrift'
import { allgemein, zeigeWert } from '../zahlformat'
import { leseXml } from '../xml'
import { vorlageBytes } from './hilfen'

/** Kleine Arbeitsmappe aus Zellen (Blatt „A“ und „B“) für Formeltests. */
async function mappe(zellen: Record<string, Record<string, string | number | { f: string }>>, namen = ''): Promise<Rechenwerk> {
  const zip = new JSZip()
  const blaetter = Object.keys(zellen)
  zip.file('xl/workbook.xml', `<workbook><sheets>${blaetter.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${namen}</definedNames></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml" Type="x/worksheet"/>`).join('')}</Relationships>`)
  zip.file('xl/styles.xml', '<styleSheet><fonts><font><sz val="10"/><name val="Arial"/></font></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>')
  blaetter.forEach((n, i) => {
    const zeilen = new Map<number, string[]>()
    for (const [adr, w] of Object.entries(zellen[n])) {
      const { z } = zelleAdresse(adr)
      const inhalt = typeof w === 'object' ? `<c r="${adr}"><f>${w.f.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</f></c>` : typeof w === 'number' ? `<c r="${adr}"><v>${w}</v></c>` : `<c r="${adr}" t="inlineStr"><is><t>${w}</t></is></c>`
      zeilen.set(z, [...(zeilen.get(z) ?? []), inhalt])
    }
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet><sheetData>${[...zeilen].map(([z, c]) => `<row r="${z}">${c.join('')}</row>`).join('')}</sheetData></worksheet>`)
  })
  return new Rechenwerk(await leseMappe(await zip.generateAsync({ type: 'uint8array' })))
}

describe('XML-Leser', () => {
  it('Elemente, Attribute, Text, Entitäten, CDATA, selbstschließend', () => {
    const k = leseXml('<?xml version="1.0"?><a x="1" y=\'2&amp;3\'><!-- c --><b/><c>Text &lt;&#65;&#x42;&gt;</c><d><![CDATA[<roh>]]></d></a>')
    expect(k.name).toBe('a')
    expect(k.attr).toEqual({ x: '1', y: '2&3' })
    expect(k.kinder.map((c) => c.name)).toEqual(['b', 'c', 'd'])
    expect(k.kinder[1].text).toBe('Text <AB>')
    expect(k.kinder[2].text).toBe('<roh>')
  })
})

describe('Zelladressen', () => {
  it('Spalten und Adressen', () => {
    expect(spaltenNummer('A')).toBe(1)
    expect(spaltenNummer('AB')).toBe(28)
    expect(spaltenBuchstaben(28)).toBe('AB')
    expect(zelleAdresse('$C$12')).toEqual({ z: 12, s: 3 })
  })
})

describe('Formeln', () => {
  it('ROUND rundet kaufmännisch auf die dezimale Darstellung (wie Excel)', () => {
    expect(runde(1.005, 2)).toBe(1.01)
    expect(runde(2.675, 2)).toBe(2.68)
    expect(runde(-2.675, 2)).toBe(-2.68)
    expect(runde(1234.5678, 0)).toBe(1235)
    expect(runde(0.285, 2)).toBe(0.29)
    expect(runde(5, 2)).toBe(5)
  })

  it('Grundrechenarten, Vorrang, Prozent, Potenz, Verkettung, Vergleiche', async () => {
    const r = await mappe({ A: { A1: 10, A2: 4, B1: { f: 'A1+A2*3' }, B2: { f: '(A1+A2)*3' }, B3: { f: 'A1*A2%' }, B4: { f: '2^3^1' }, B5: { f: '"x"&A1&"y"' }, B6: { f: 'A1>A2' }, B7: { f: '-A1+3' }, B8: { f: 'A1/0' } } })
    expect(r.wert('A', 1, 2)).toBe(22)
    expect(r.wert('A', 2, 2)).toBe(42)
    expect(r.wert('A', 3, 2)).toBeCloseTo(0.4)
    expect(r.wert('A', 4, 2)).toBe(8)
    expect(r.wert('A', 5, 2)).toBe('x10y')
    expect(r.wert('A', 6, 2)).toBe(true)
    expect(r.wert('A', 7, 2)).toBe(-7)
    expect(r.wert('A', 8, 2)).toEqual({ fehler: '#DIV/0!' })
  })

  it('IF (auch ohne Sonst), Vergleich ohne Groß/Klein, leere Zelle = 0 und = ""', async () => {
    const r = await mappe({ A: { A1: 'Fehlt', B1: { f: 'IF(A1="fehlt",1,2)' }, B2: { f: 'IF(A9=0,"leer","voll")' }, B3: { f: 'IF(A9="","e","n")' }, B4: { f: 'IF(1>2,5)' }, B5: { f: 'IF(A1<>"x",1,0)' } } })
    expect(r.wert('A', 1, 2)).toBe(1)
    expect(r.wert('A', 2, 2)).toBe('leer')
    expect(r.wert('A', 3, 2)).toBe('e')
    expect(r.wert('A', 4, 2)).toBe(false)
    expect(r.wert('A', 5, 2)).toBe(1)
  })

  it('SUM/MIN/MAX über Bereiche und Blätter; Texte im Bereich zählen nicht', async () => {
    const r = await mappe({ A: { A1: 1, A2: 2, A3: 'text', A4: 7, B1: { f: 'SUM(A1:A4)' }, B2: { f: 'MAX(A1:A4,B!A1)' }, B3: { f: 'MIN(A1:A2,10)' }, B4: { f: "SUM(B!A1:A2)" } }, B: { A1: 100, A2: 5 } })
    expect(r.wert('A', 1, 2)).toBe(10)
    expect(r.wert('A', 2, 2)).toBe(100)
    expect(r.wert('A', 3, 2)).toBe(1)
    expect(r.wert('A', 4, 2)).toBe(105)
  })

  it('Verweis auf eine leere Zelle bleibt leer (nicht „0“); Verweis auf Text und Zahl bleibt wie er ist', async () => {
    const r = await mappe({ A: { A1: 'KGA', A2: 5, B1: { f: 'A1' }, B2: { f: 'A2' }, B3: { f: 'A7' }, B4: { f: 'A7+1' } } })
    expect(r.wert('A', 1, 2)).toBe('KGA')
    expect(r.wert('A', 2, 2)).toBe(5)
    expect(r.wert('A', 3, 2)).toBeNull()
    expect(r.wert('A', 4, 2)).toBe(1)
  })

  it('Blattnamen mit Leerzeichen und Hochkomma, Verweis zwischen Blättern', async () => {
    const r = await mappe({ 'Mein Blatt': { A1: 3 }, B: { A1: { f: "'Mein Blatt'!A1*2" } } })
    expect(r.wert('B', 1, 1)).toBe(6)
  })

  it('SVERWEIS: genau (Text), ungefähr (Zahlen), mit definiertem Namen', async () => {
    const r = await mappe(
      { T: { A1: 0, B1: 100, A2: 5, B2: 90, A3: 10, B3: 80, A5: 'Holz', B5: 1, A6: 'Stein', B6: 2, C1: { f: 'VLOOKUP(7,tab,2)' }, C2: { f: 'VLOOKUP(10,tab,2)' }, C3: { f: 'VLOOKUP("Stein",mat,2)' }, C4: { f: 'VLOOKUP(0.5,tab,2)' }, C5: { f: 'VLOOKUP(A9,tab,2)' }, C6: { f: 'VLOOKUP("Glas",mat,2,FALSE)' } } },
      '<definedName name="tab">T!$A$1:$B$3</definedName><definedName name="mat">T!$A$5:$B$6</definedName>',
    )
    expect(r.wert('T', 1, 3)).toBe(90)
    expect(r.wert('T', 2, 3)).toBe(80)
    expect(r.wert('T', 3, 3)).toBe(2)
    expect(r.wert('T', 4, 3)).toBe(100)
    expect(r.wert('T', 5, 3)).toBe(100) // leere Zelle = 0
    expect(r.wert('T', 6, 3)).toEqual({ fehler: '#NV' })
  })

  it('Zirkelbezug und unbekannte Funktion: kein Absturz, Meldung im Bericht', async () => {
    const r = await mappe({ A: { A1: { f: 'A2' }, A2: { f: 'A1' }, B1: { f: 'GIBTESNICHT(1)' } } })
    expect(r.wert('A', 1, 1)).toEqual({ fehler: '#ZIRKELBEZUG!' })
    r.wert('A', 1, 2)
    expect(r.bericht.unbekannt.join(' ')).toContain('GIBTESNICHT')
  })

  it('gemeinsame Formeln: relative Bezüge wandern, absolute bleiben, Blattbezüge ebenfalls', () => {
    expect(verschiebeFormel('ROUND(A15*K15,2)', 3, 0)).toBe('ROUND(A18*K18,2)')
    expect(verschiebeFormel('$A$1+B2+$C3+D$4', 1, 1)).toBe('$A$1+C3+$C4+E$4')
    expect(verschiebeFormel("Formalien!$E$3&'Aufwuchs I'!L46", 2, 0)).toBe("Formalien!$E$3&'Aufwuchs I'!L48")
    expect(verschiebeFormel('"A1"&A1', 1, 0)).toBe('"A1"&A2')
    expect(verschiebeFormel('SUM(K12:K23)', 1, 0)).toBe('SUM(K13:K24)')
  })

  it('Vorlage: alle Formeln der gedruckten Blätter sind für das Rechenwerk lesbar', async () => {
    const m = await leseMappe(vorlageBytes())
    const r = new Rechenwerk(m)
    for (const b of m.blaetter) if (b.sichtbar) for (const k of b.zellen.keys()) r.wert(b.name, Math.floor(k / 20000), k % 20000)
    expect(r.bericht.unbekannt).toEqual([])
  })
})

describe('Zahlenformate (deutsche Schreibweise)', () => {
  const f = (v: number, code: string) => {
    const e = zeigeWert(v, code)
    return e ? (e.rechts === undefined ? e.links : `${e.links}|${e.rechts}`) : null
  }
  it('Euro, Tausender, negativ, Prozent, Jahre, m²', () => {
    expect(f(1234.5, '#,##0.00\\ "€"')).toBe('1.234,50 €')
    expect(f(-3, '#,##0.00\\ "€";\\-#,##0.00\\ "€"')).toBe('-3,00 €')
    expect(f(1.5, '0.00" m²"')).toBe('1,50 m²')
    expect(f(10, '0\\ "Jahre"')).toBe('10 Jahre')
    expect(f(10, '0"%"')).toBe('10%')
    expect(f(0.1, '0%')).toBe('10%')
    expect(f(2.5, '0.0')).toBe('2,5')
    expect(f(3.14159, '0.0#')).toBe('3,14')
    expect(f(3, '0.0#')).toBe('3,0')
  })
  it('Buchhaltungsformat: Betrag rechts, Null als „-“, Währung auch mitten im Format', () => {
    const b = '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-'
    expect(f(18.5, b)).toBe(' |18,50 € ')
    expect(f(0, b)).toBe(' |-   € ')
    expect(f(-5, b)).toBe('-|5,00 € ')
    const e = '_-* #,##0.00\\ [$€-407]_-;\\-* #,##0.00\\ [$€-407]_-;_-* "-"??\\ [$€-407]_-;_-@_-'
    expect(f(18.5, e)).toBe(' |18,50 € ')
  })
  it('Datum: Tag/Monat/Jahr, Monatsnamen deutsch', () => {
    expect(f(46309, 'dd.mm.yyyy')).toBe('14.10.2026')
    expect(f(46309, '[$-407]d/\\ mmmm\\ yyyy;@')).toBe('14/ Oktober 2026')
    expect(f(46309, 'd. mmm yyyy')).toBe('14. Okt 2026')
  })
  it('Text, Leere, Fehler, Wahrheitswerte, Standard', () => {
    expect(zeigeWert('Hallo', 'General')?.links).toBe('Hallo')
    expect(zeigeWert('Hallo', '@')?.links).toBe('Hallo')
    expect(zeigeWert(null, '0.00')).toBeNull()
    expect(zeigeWert('', '0.00')).toBeNull()
    expect(zeigeWert({ fehler: '#NV' }, 'General')?.links).toBe('#NV')
    expect(zeigeWert(true, 'General')?.links).toBe('WAHR')
    expect(allgemein(1234)).toBe('1234')
    expect(allgemein(0.1 + 0.2)).toBe('0,3')
    expect(allgemein(179.2)).toBe('179,2')
  })
  it('Farbe der Bedingung', () => {
    expect(zeigeWert(-2, '#,##0.00\\ "€";[Red]\\-#,##0.00\\ "€"')?.farbe).toBe('FF0000')
  })
})

describe('Schrift und Farben', () => {
  it('kodierbar ersetzt, was die Standardschriften nicht kennen, und behält deutsche Zeichen', () => {
    expect(kodierbar('Äöü ß € – „x“ m²')).toBe('Äöü ß € – „x“ m²')
    expect(kodierbar('a→b ≥ ✓')).toBe('a?b ? ?')
    expect(kodierbar('a\nb')).toBe('a b')
  })
  it('cssFarbe', () => {
    expect(cssFarbe('#C5E0B4')).toBe('c5e0b4')
    expect(cssFarbe('#abc')).toBe('aabbcc')
    expect(cssFarbe('transparent')).toBeNull()
    expect(cssFarbe('rgb(10, 20, 30)')).toBe('0a141e')
    expect(cssFarbe('none')).toBeNull()
  })
})

describe('Blatt → Seiten', () => {
  it('Spaltenbreite wie Excel (Zeichen → Punkt)', () => {
    // gespeicherte Breite 9,140625 = Standardspalte (64 Pixel = 48 pt); 10 → 75 Pixel
    expect(spaltenPt(9.140625)).toBeCloseTo(48, 1)
    expect(spaltenPt(10)).toBeCloseTo(52.5, 1)
  })

  it('Außenanlagen: eine A4-Seite, alle Zeilen, Rahmen und Texte, Summe rechts unten', async () => {
    const dok = await PDFDocument.create()
    const messer = messerAus(await ladeSchriften(dok, StandardFonts))
    const m = await leseMappe(vorlageBytes())
    const r = new Rechenwerk(m)
    const blatt = m.blaetter.find((b) => b.name === 'Außenanlagen')!
    const erg = setzeBlatt(blatt, m, r, messer)
    expect(erg.seiten).toHaveLength(1)
    expect(erg.skala).toBeCloseTo(0.85, 2)
    const s = erg.seiten[0]
    expect(s.breite).toBeCloseTo(595.28, 1)
    // alles liegt innerhalb der Ränder
    const xs = s.ops.flatMap((o) => (o.t === 'linie' ? [o.x1, o.x2] : o.t === 'fuellung' || o.t === 'kasten' ? [o.x, o.x + o.w] : []))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.78 * 72 - 0.5)
    expect(Math.max(...xs)).toBeLessThanOrEqual(595.28 - 0.19 * 72 + 0.5)
    expect(s.ops.some((o) => o.t === 'text' && o.s.includes('Anlage 2 – Bewertung Außenanlagen'))).toBe(true)
    expect(s.lage(48, 8, 48, 10)).toBeDefined()
    expect(s.lage(60, 1)).toBeUndefined()
  })

  it('Baulichkeiten: ein fester Umbruch nach Zeile 54, knapp überlange Abschnitte werden nicht zerrissen', async () => {
    const dok = await PDFDocument.create()
    const messer = messerAus(await ladeSchriften(dok, StandardFonts))
    const m = await leseMappe(vorlageBytes())
    const blatt = m.blaetter.find((b) => b.name === 'Baulichkeiten')!
    const erg = setzeBlatt(blatt, m, new Rechenwerk(m), messer)
    expect(erg.seiten.map((s) => s.zeilen)).toEqual([[1, 54], [55, 109]])
  })

  it('lange Texte in verbundenen Zellen werden umbrochen und bleiben in ihrer Zelle', async () => {
    const dok = await PDFDocument.create()
    const messer = messerAus(await ladeSchriften(dok, StandardFonts))
    const m = await leseMappe(vorlageBytes())
    const blatt = m.blaetter.find((b) => b.name === 'Deckbl UPV ')!
    const erg = setzeBlatt(blatt, m, new Rechenwerk(m), messer)
    const texte = erg.seiten[0].ops.filter((o) => o.t === 'text')
    expect(texte.some((o) => o.t === 'text' && o.s.startsWith('Die Wertermittlung erfolgt auf der Grundlage'))).toBe(true)
    // kein Text ragt rechts über den Seitenrand
    for (const o of texte) if (o.t === 'text') expect(o.x + messer.breite(o.s, o.fett, o.kursiv, o.groesse)).toBeLessThanOrEqual(595.28 - 0.19 * 72 + 1)
  })
})

describe('Zeichenkontext (Skizze als Vektor)', () => {
  it('Pfade, Ellipse, Text und Strichelung erzeugen Befehle ohne Bild', async () => {
    const dok = await PDFDocument.create()
    const schriften = await ladeSchriften(dok, StandardFonts)
    const seite = dok.addPage([200, 200])
    const ctx = new PdfKontext(lib, seite, schriften, 10, 10, 0.5)
    ctx.fillStyle = '#C5E0B4'
    ctx.strokeStyle = '#262626'
    ctx.lineWidth = 2
    ctx.fillRect(0, 0, 100, 100)
    ctx.beginPath()
    ctx.ellipse(50, 50, 30, 20, 0, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([4, 2])
    ctx.strokeRect(10, 10, 80, 80)
    ctx.beginPath()
    ctx.arc(50, 50, 10, 0, Math.PI / 2)
    ctx.stroke()
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#000000'
    ctx.fillText('Apfel', 50, 50)
    ctx.fillStyle = 'transparent'
    ctx.fillText('unsichtbar', 50, 80)
    expect(ctx.measureText('Apfel').width).toBeGreaterThan(10)
    const bytes = await dok.save()
    expect(bytes.length).toBeGreaterThan(500)
  })

  it('gedrehter Text (senkrechte Maße der Bau-Skizze): translate/rotate drehen nur den Text, im Uhrzeigersinn', async () => {
    const dok = await PDFDocument.create()
    const schriften = await ladeSchriften(dok, StandardFonts)
    const seite = dok.addPage([200, 200])
    const ctx = new PdfKontext(lib, seite, schriften, 0, 0, 1)
    ctx.font = '10px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.translate(100, 100)
    ctx.rotate((270 * Math.PI) / 180) // Canvas: im Uhrzeigersinn → Text liest sich von unten nach oben
    ctx.fillText('2,45', 0, 0)
    ctx.restore()
    ctx.fillText('waagerecht', 50, 20) // nach restore() wieder ohne Drehung
    const roh = Buffer.from(await dok.save({ useObjectStreams: false }))
    // Der Seiteninhalt ist mit Flate gepackt: alle Streams entpacken, die sich entpacken lassen
    const inhalt = [...roh.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .map((m) => {
        try {
          return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')
        } catch {
          return ''
        }
      })
      .join('\n')
    const tm = [...inhalt.matchAll(/(-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+) Tm/g)].map((m) => m.slice(1, 5).map((v) => Math.round(Number(v) * 1000) / 1000 + 0))
    expect(tm).toHaveLength(2)
    expect(tm[0]).toEqual([0, 1, -1, 0]) // 90° gegen den Uhrzeigersinn im PDF = 270° im Uhrzeigersinn auf dem Bildschirm
    expect(tm[1]).toEqual([1, 0, 0, 1])
  })
})
