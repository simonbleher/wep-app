/**
 * Beta 3, Paket 5: Formalien aus der Bau-Excel lesen, Abgleich im Export, Überschrift des Skizzen-Blatts.
 * Alle Testdaten sind erfunden (Test-Bau-Excel aus der Vorlage, src/bauexcel/testBauExcel.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import JSZip from 'jszip'
import { erzeugeTestBauExcel, TEST_FORMALIEN } from '../../bauexcel/testBauExcel'
import { neuerWep } from '../../model'
import { BAU_SHEET_PATHS, isoDateToExcelSerial } from '../cellMapper'
import { SKIZZE_AA_UEBERSCHRIFT, exportWep, leseBauFormalien } from '../index'
import { vergleichsWert, zellenWert, sharedStrings } from '../bauExcelLesen'

const VORLAGE = 'docs/WEP_Vorlage.xlsx'
const sha = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex')
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

describe('leseBauFormalien', () => {
  it('liest Texte (Shared Strings), Daten und Fläche aus der Test-Bau-Excel', async () => {
    const f = await leseBauFormalien(await erzeugeTestBauExcel())
    expect(f).toEqual({
      kleingartenanlage: 'KGA Testgarten',
      parzelle: 'Parzelle 42',
      weg: 'Rosenweg',
      unterpaechter: 'Erika Musterfrau',
      auftraggeber: 'Bezirksverband Beispielstadt',
      anwesendVerein: 'Hans Vorstand',
      wertermittlerBaulichkeiten: 'Bert Bauer',
      wertermittlungAm: '2026-10-14',
      protokollerstellungAm: '2026-10-20',
      parzellenflaecheM2: 380,
      vorgangsNr: '2026-007',
    })
  })

  it('die Datums-Seriennummern der Testdaten sind die richtigen Tage', () => {
    expect(isoDateToExcelSerial('2026-10-14')).toBe(TEST_FORMALIEN.E14)
    expect(isoDateToExcelSerial('2026-10-20')).toBe(TEST_FORMALIEN.E15)
  })

  it('liest Inline-Strings genauso', async () => {
    const f = await leseBauFormalien(await erzeugeTestBauExcel({ inline: true }))
    expect(f.parzelle).toBe('Parzelle 42')
    expect(f.unterpaechter).toBe('Erika Musterfrau')
  })

  it('die leere Vorlage ergibt keine Angaben', async () => {
    expect(await leseBauFormalien(fs.readFileSync(VORLAGE))).toEqual({})
  })

  it('leere und nur aus Leerzeichen bestehende Zellen zählen nicht', async () => {
    const f = await leseBauFormalien(await erzeugeTestBauExcel({ werte: { E3: '   ', E4: 'Parzelle 9', E16: 0 } }))
    expect(f).toEqual({ parzelle: 'Parzelle 9' })
  })

  it('Sonderzeichen und Datum als Text (TT.MM.JJJJ) werden richtig gelesen', async () => {
    const f = await leseBauFormalien(
      await erzeugeTestBauExcel({ werte: { E3: 'Garten & Co <Süd>', E14: '14.10.2026', E16: '380,5' } }),
    )
    expect(f.kleingartenanlage).toBe('Garten & Co <Süd>')
    expect(f.wertermittlungAm).toBe('2026-10-14')
    expect(f.parzellenflaecheM2).toBe(380.5)
  })

  it('wirft eine verständliche Meldung, wenn das Blatt „Formalien“ fehlt', async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(VORLAGE))
    zip.file('xl/workbook.xml', (await zip.file('xl/workbook.xml')!.async('string')).replace('name="Formalien"', 'name="Etwas"'))
    zip.remove('xl/worksheets/sheet1.xml')
    await expect(leseBauFormalien(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('Formalien')
  })

  it('wirft bei einer Datei, die keine Excel-Datei ist', async () => {
    await expect(leseBauFormalien(new TextEncoder().encode('kein zip'))).rejects.toThrow()
  })

  it('vergleichsWert: Text getrimmt, Datum als ISO, Fläche als Zahl', () => {
    expect(vergleichsWert('parzelle', '  Parzelle   42 ')).toBe('Parzelle 42')
    expect(vergleichsWert('wertermittlungAm', '14.10.2026')).toBe('2026-10-14')
    expect(vergleichsWert('wertermittlungAm', '2026-10-14')).toBe('2026-10-14')
    expect(vergleichsWert('parzellenflaecheM2', 380)).toBe('380')
    expect(vergleichsWert('parzellenflaecheM2', 0)).toBe('')
  })
})

describe('Export mit der am WEP gemerkten Bau-Excel (Formalien)', () => {
  const wep = () => {
    const w = neuerWep('2026-007')
    w.formalien = { ...w.formalien, kleingartenanlage: 'KGA Testgarten', parzelle: 'Parzelle 42', unterpaechter: 'Max Beispielmann' }
    return w
  }

  it('gleiche Werte sind kein Konflikt (auch wenn die Bau-Excel Shared Strings nutzt)', async () => {
    const r = await exportWep(wep(), ab(await erzeugeTestBauExcel()))
    expect(r.konflikte.map((k) => k.feld)).toEqual(['unterpaechter'])
    expect(r.konflikte[0]).toMatchObject({ zelle: 'E6', bauExcelWert: 'Erika Musterfrau', appWert: 'Max Beispielmann' })
  })

  it('nach dem Abgleich gelten die Werte aus dem WEP, auch gegen die Bau-Excel (keine Konflikte)', async () => {
    const r = await exportWep(wep(), ab(await erzeugeTestBauExcel()), { formalienAbgeglichen: true })
    expect(r.konflikte).toEqual([])
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const blatt = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(zellenWert(blatt, 'E6', await sharedStrings(zip))).toBe('Max Beispielmann')
    // Was die Bau-Excel hat und das WEP nicht, bleibt stehen
    expect(zellenWert(blatt, 'E12', await sharedStrings(zip))).toBe('Bert Bauer')
  })

  it('Bau-Blätter bleiben byte-gleich', async () => {
    const bau = await erzeugeTestBauExcel()
    const vorher = await JSZip.loadAsync(bau)
    const r = await exportWep(wep(), ab(bau), { formalienAbgeglichen: true })
    const nachher = await JSZip.loadAsync(await r.blob.arrayBuffer())
    for (const pfad of ['xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet18.xml'] as const) {
      expect(BAU_SHEET_PATHS).toContain(pfad)
      expect(await nachher.file(pfad)!.async('string'), pfad).toBe(await vorher.file(pfad)!.async('string'))
    }
  })
})

describe('Überschrift des Blatts „Skizze Außenanlage-Aufwuchs“', () => {
  const blatt = async (zip: JSZip, nr: number) => zip.file(`xl/worksheets/sheet${nr}.xml`)!.async('string')
  let vorlage: Buffer
  beforeAll(() => {
    vorlage = fs.readFileSync(VORLAGE)
  })

  it('die Vorlage nennt beide Skizzen-Blätter „Skizze – Baulichkeiten“ (derselbe Shared String)', async () => {
    const zip = await JSZip.loadAsync(vorlage)
    const geteilt = await sharedStrings(zip)
    expect(zellenWert(await blatt(zip, 19), 'A1', geteilt)).toBe('Skizze – Baulichkeiten')
    expect(zellenWert(await blatt(zip, 18), 'A1', geteilt)).toBe('Skizze – Baulichkeiten')
  })

  it('der Export ersetzt nur die Überschrift im Blatt Außenanlage-Aufwuchs; „Skizze Bau“ bleibt', async () => {
    const r = await exportWep(neuerWep('2026-007'), ab(vorlage))
    expect(r.skizzeUeberschriftGeaendert).toBe(true)
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const geteilt = await sharedStrings(zip)
    expect(SKIZZE_AA_UEBERSCHRIFT).toBe('Skizze – Außenanlagen und Aufwuchs')
    expect(zellenWert(await blatt(zip, 19), 'A1', geteilt)).toBe('Skizze – Außenanlagen und Aufwuchs')
    expect(zellenWert(await blatt(zip, 18), 'A1', geteilt)).toBe('Skizze – Baulichkeiten')
    // Format der Zelle (Stil) bleibt
    expect(await blatt(zip, 19)).toMatch(/<c r="A1" s="570" t="inlineStr">/)
    // Der gemeinsame Shared String selbst ist unverändert
    const vorher = await JSZip.loadAsync(vorlage)
    expect(await zip.file('xl/sharedStrings.xml')!.async('string')).toBe(await vorher.file('xl/sharedStrings.xml')!.async('string'))
  })

  it('ein zweiter Export derselben Datei ändert nichts mehr; eine andere Überschrift bleibt stehen', async () => {
    const erst = await exportWep(neuerWep('2026-007'), ab(vorlage))
    const zweit = await exportWep(neuerWep('2026-007'), await erst.blob.arrayBuffer())
    expect(zweit.skizzeUeberschriftGeaendert).toBe(false)

    const zip = await JSZip.loadAsync(vorlage)
    zip.file('xl/worksheets/sheet19.xml', (await blatt(zip, 19)).replace('<c r="A1" s="570" t="s"><v>551</v></c>', '<c r="A1" s="570" t="inlineStr"><is><t>Skizze – Garten</t></is></c>'))
    const eigene = await exportWep(neuerWep('2026-007'), await zip.generateAsync({ type: 'arraybuffer' }))
    expect(eigene.skizzeUeberschriftGeaendert).toBe(false)
    const z2 = await JSZip.loadAsync(await eigene.blob.arrayBuffer())
    expect(zellenWert(await blatt(z2, 19), 'A1', await sharedStrings(z2))).toBe('Skizze – Garten')
  })

  it('docs/WEP_Vorlage.xlsx wird nie verändert (Export arbeitet auf einer Kopie)', async () => {
    const vorher = sha(fs.readFileSync(VORLAGE))
    await exportWep(neuerWep('2026-007'), ab(fs.readFileSync(VORLAGE)))
    expect(sha(fs.readFileSync(VORLAGE))).toBe(vorher)
  })
})
