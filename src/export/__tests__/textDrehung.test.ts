/**
 * Gedrehte Textfelder der Bau-Skizze (senkrechte Maße, 270°) bleiben gedreht: lesen → Grundlage → Editor/PNG/PDF → Excel.
 * Testdaten ausschließlich erfunden.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { exportWep } from '../index'
import { leseBauSkizze, textDrehung } from '../bauSkizzeLesen'
import { skizzeDatenZuFormen } from '../skizzeFormen'
import { erzeugeTestBauExcel } from '../../bauexcel/testBauExcel'
import { neuerWep } from '../../model'
import { uebernehmeGrundlage } from '../../skizze/grundlage'
import { elementKasten, trefferSuchen } from '../../skizze/geometrie'
import { skizzeAufContext } from '../../skizze/skizzePng'
import { leereSkizze, type SkizzeText } from '../../skizze/types'

const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')
const JETZT = '2026-10-24T10:00:00.000Z'

let bauExcel: Uint8Array
beforeAll(async () => {
  bauExcel = await erzeugeTestBauExcel({
    skizzeBau: true,
    weitereFormen: [
      { name: 'Textfeld 90', art: 'textfeld', x: 100, y: 300, w: 40, h: 20, text: '2,45', drehung: 270 },
      { name: 'Textfeld 91', art: 'textfeld', x: 200, y: 300, w: 40, h: 20, text: '1,70', textrichtung: 'vert270' },
      { name: 'Textfeld 92', art: 'textfeld', x: 300, y: 300, w: 40, h: 20, text: '3,10' },
    ],
  })
})

describe('Drehung von Textfeldern', () => {
  it('textDrehung: Drehung der Form und Textrichtung ergeben zusammen den Winkel', () => {
    expect(textDrehung('<a:bodyPr/>', 0)).toBe(0)
    expect(textDrehung('<a:bodyPr vert="vert270"/>', 0)).toBe(270)
    expect(textDrehung('<a:bodyPr vert="vert"/>', 0)).toBe(90)
    expect(textDrehung('<a:bodyPr/>', 270)).toBe(270)
    expect(textDrehung('<a:bodyPr rot="5400000"/>', 270)).toBe(0)
  })

  it('liest die Drehung der Textfelder aus „Skizze Bau“', async () => {
    const l = await leseBauSkizze(bauExcel)
    const nach = (n: string) => l.formen.find((f) => f.name === n)!
    expect(nach('Textfeld 90').drehung).toBe(270)
    expect(nach('Textfeld 91').drehung).toBe(270)
    expect(nach('Textfeld 92').drehung).toBeUndefined()
  })

  it('die Grundlage übernimmt die Drehung; waagerechte Texte bleiben ohne', async () => {
    const lesen = await leseBauSkizze(bauExcel)
    const erg = uebernehmeGrundlage(leereSkizze(), { art: 'excel', lesen }, JETZT)!
    const texte = erg.daten.elemente.filter((e): e is SkizzeText => e.typ === 'text')
    const t = (s: string) => texte.find((e) => e.inhalt === s)!
    expect(t('2,45').drehung).toBe(270)
    expect(t('1,70').drehung).toBe(270)
    expect(t('3,10').drehung).toBeUndefined()
    expect(t('Zufahrt').drehung).toBeUndefined()
  })

  it('Kasten und Treffer eines gedrehten Texts: Breite und Höhe getauscht, Mitte bleibt', () => {
    const el: SkizzeText = { id: 't', typ: 'text', ebene: 'grundlage', x: 100, y: 100, inhalt: '2,45', schriftgroesse: 14, drehung: 270 }
    const waagerecht = elementKasten({ ...el, drehung: undefined })
    const gedreht = elementKasten(el)
    expect(gedreht.breite).toBeCloseTo(waagerecht.hoehe)
    expect(gedreht.hoehe).toBeCloseTo(waagerecht.breite)
    expect(gedreht.x + gedreht.breite / 2).toBeCloseTo(waagerecht.x + waagerecht.breite / 2)
    expect(gedreht.y + gedreht.hoehe / 2).toBeCloseTo(waagerecht.y + waagerecht.hoehe / 2)
    const mx = gedreht.x + gedreht.breite / 2
    expect(trefferSuchen([el], { x: mx, y: gedreht.y + 1 })).toBe(el) // oben im senkrechten Text
    expect(trefferSuchen([el], { x: waagerecht.x + waagerecht.breite - 1, y: waagerecht.y + 5 }, 0)).toBeNull() // dort stünde ein waagerechter Text
  })

  it('Canvas/PDF: gedrehter Text wird um seine Mitte gedreht gezeichnet', () => {
    const aufrufe: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (z, n: string) => (n in z ? z[n] : (...a: unknown[]) => void aufrufe.push(`${n}(${a.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)).join(',')})`)),
      set: (z, n: string, v) => ((z[n] = v), true),
    })
    const daten = { ...leereSkizze(), elemente: [{ id: 't', typ: 'text', ebene: 'grundlage', x: 100, y: 100, inhalt: '2,45', schriftgroesse: 14, drehung: 270 } as SkizzeText] }
    skizzeAufContext(ctx as unknown as CanvasRenderingContext2D, daten, 800, 600, {})
    const i = aufrufe.findIndex((a) => a.startsWith('rotate('))
    expect(i).toBeGreaterThan(-1)
    expect(aufrufe[i]).toBe(`rotate(${Math.round(((270 * Math.PI) / 180) * 100) / 100})`)
    expect(aufrufe[i - 1]).toMatch(/^translate\(/)
    expect(aufrufe.slice(i).some((a) => a.startsWith('fillText(2,45,0,0'))).toBe(true)
  })

  it('Excel-Export: gedrehter Text wird ein gedrehtes Textfeld (rot=16200000), waagerechter nicht', async () => {
    const lesen = await leseBauSkizze(bauExcel)
    const skizze = uebernehmeGrundlage(leereSkizze(), { art: 'excel', lesen }, JETZT)!.daten
    const wep = { ...neuerWep('2026-007'), skizze }
    const buf = fs.readFileSync(VORLAGE)
    const r = await exportWep(wep, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
      skizzeFormen: { elemente: ({ zeichenbereich }) => skizzeDatenZuFormen(skizze, zeichenbereich) },
    })
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer())
    const xml = await zip.file('xl/drawings/drawing9.xml')!.async('string')
    const sp = (text: string) => new RegExp(`<xdr:sp\\b(?:(?!</xdr:sp>)[\\s\\S])*<a:t>${text}</a:t>`).exec(xml)?.[0] ?? ''
    expect(sp('2,45')).toContain('rot="16200000"')
    expect(sp('1,70')).toContain('rot="16200000"')
    expect(sp('3,10')).not.toContain(' rot=')
    expect(sp('3,10')).not.toBe('')
  })
})
