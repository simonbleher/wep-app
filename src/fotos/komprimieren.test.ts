// @vitest-environment node
// Fotos verkleinern: Größe, Qualität, Ausrichtung (EXIF) und entfernte Standortdaten – mit selbst
// erzeugten Testbildern und @napi-rs/canvas als Bilddienst.
import { describe, expect, it } from 'vitest'
import {
  FOTO_MAX_SEITE,
  FOTO_ZIEL_BYTES,
  PROBE_JPEG_O6,
  VORSCHAU_MAX_SEITE,
  erkenneAutoDrehung,
  erzeugeFoto,
  erzeugeVorschau,
  leseExifOrientierung,
  orientierungsMatrix,
  vertauscht,
  zielGroesse,
} from './komprimieren'
import {
  EXIF_GPS_REF,
  EXIF_KAMERA,
  groesseVon,
  mitExif,
  napiBilddienst,
  ohneExif,
  pixel,
  farbName,
  testFoto,
  vierViertelBild,
  zweiFarbenBild,
} from './testBilder'

const enthaelt = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'))
const istRot = ([r, , b]: number[]) => r > 150 && b < 90
const istBlau = ([r, , b]: number[]) => b > 150 && r < 90

describe('Größenberechnung', () => {
  it('längste Seite höchstens 2000 px, Seitenverhältnis bleibt, nie vergrößert', () => {
    expect(zielGroesse(4000, 3000, 2000)).toEqual({ breite: 2000, hoehe: 1500 })
    expect(zielGroesse(3000, 4000, 2000)).toEqual({ breite: 1500, hoehe: 2000 })
    expect(zielGroesse(1200, 800, 2000)).toEqual({ breite: 1200, hoehe: 800 })
    expect(zielGroesse(1, 5000, 2000)).toEqual({ breite: 1, hoehe: 2000 })
  })

  it('Orientierungen 5–8 vertauschen Breite und Höhe', () => {
    expect([1, 2, 3, 4].map(vertauscht)).toEqual([false, false, false, false])
    expect([5, 6, 7, 8].map(vertauscht)).toEqual([true, true, true, true])
    expect(orientierungsMatrix(1, 10, 20)).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe('EXIF lesen', () => {
  it('liest die Ausrichtung aus einem JPEG', async () => {
    const roh = await testFoto(64, 48, 0)
    expect(leseExifOrientierung(roh)).toBe(1)
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8]) expect(leseExifOrientierung(mitExif(roh, { orientierung: o }))).toBe(o)
    expect(leseExifOrientierung(mitExif(roh, { orientierung: 6, gps: true }))).toBe(6)
  })

  it('liefert 1 bei Unsinn: leer, kein JPEG, abgeschnitten, ungültiger Wert', async () => {
    const roh = await testFoto(32, 24, 0)
    expect(leseExifOrientierung(new Uint8Array())).toBe(1)
    expect(leseExifOrientierung(new Uint8Array([1, 2, 3, 4, 5]))).toBe(1)
    const mit = mitExif(roh, { orientierung: 6 })
    expect(leseExifOrientierung(mit.subarray(0, 14))).toBe(1)
    expect(leseExifOrientierung(mitExif(roh, { orientierung: 9 }))).toBe(1)
  })

  it('das Probebild für die Drehungs-Erkennung hat Ausrichtung 6 und ist 2 × 1 px groß', async () => {
    expect(leseExifOrientierung(PROBE_JPEG_O6)).toBe(6)
    expect(await groesseVon(ohneExif(PROBE_JPEG_O6))).toEqual({ breite: 2, hoehe: 1 })
    // dieser Decoder (wie heutige Browser) dreht von selbst: 1 × 2
    expect(await groesseVon(PROBE_JPEG_O6)).toEqual({ breite: 1, hoehe: 2 })
  })
})

describe('Verkleinern', () => {
  it('ein großes Foto (4000 × 3000) wird ≤ 2000 px und unter 500 KB', async () => {
    const roh = await testFoto(4000, 3000, 0.12)
    expect(roh.byteLength).toBeGreaterThan(FOTO_ZIEL_BYTES) // Ausgangsbild ist wirklich groß
    const f = await erzeugeFoto(roh, napiBilddienst())
    expect(Math.max(f.breite, f.hoehe)).toBeLessThanOrEqual(FOTO_MAX_SEITE)
    expect(f.breite / f.hoehe).toBeCloseTo(4 / 3, 2)
    expect(f.jpeg.byteLength).toBeLessThanOrEqual(FOTO_ZIEL_BYTES)
    expect(f.jpeg.byteLength).toBeGreaterThan(20_000)
    expect(Array.from(f.jpeg.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]) // JPEG
    expect(await groesseVon(f.jpeg)).toEqual({ breite: f.breite, hoehe: f.hoehe })
  })

  it('ein kleines Foto wird nicht vergrößert', async () => {
    const f = await erzeugeFoto(await testFoto(800, 600, 0.05), napiBilddienst())
    expect({ b: f.breite, h: f.hoehe }).toEqual({ b: 800, h: 600 })
  })

  it('sehr unruhige Bilder: schrittweise verkleinert, bis das Ziel erreicht ist', async () => {
    const roh = await testFoto(3000, 2000, 1)
    const f = await erzeugeFoto(roh, napiBilddienst())
    expect(f.jpeg.byteLength).toBeLessThanOrEqual(FOTO_ZIEL_BYTES)
    expect(Math.max(f.breite, f.hoehe)).toBeLessThan(FOTO_MAX_SEITE)
    expect(Math.max(f.breite, f.hoehe)).toBeGreaterThanOrEqual(1000)
  })

  it('Vorschaubild: höchstens 360 px und klein', async () => {
    const f = await erzeugeFoto(await testFoto(3000, 2000, 0.12), napiBilddienst())
    const v = await groesseVon(f.vorschau)
    expect(Math.max(v.breite, v.hoehe)).toBeLessThanOrEqual(VORSCHAU_MAX_SEITE)
    expect(v.breite / v.hoehe).toBeCloseTo(1.5, 1)
    expect(f.vorschau.byteLength).toBeLessThan(60_000)
    // Vorschau eines schon verkleinerten (geladenen) Fotos
    const nur = await erzeugeVorschau(f.jpeg, napiBilddienst())
    expect(Math.max((await groesseVon(nur)).breite, (await groesseVon(nur)).hoehe)).toBe(VORSCHAU_MAX_SEITE)
  })
})

describe('Ausrichtung (EXIF) korrigieren', () => {
  // Rohbild: 400 × 200, links rot, rechts blau
  it('Ausrichtung 6 (90° im Uhrzeigersinn): wird zum Hochformat, rot oben, blau unten', async () => {
    const roh = mitExif(await zweiFarbenBild(400, 200), { orientierung: 6 })
    const f = await erzeugeFoto(roh, napiBilddienst({ dreht: false }))
    expect({ b: f.breite, h: f.hoehe }).toEqual({ b: 200, h: 400 })
    expect(istRot(await pixel(f.jpeg, 100, 50))).toBe(true)
    expect(istBlau(await pixel(f.jpeg, 100, 350))).toBe(true)
    // gespeichertes Foto hat keine Ausrichtung mehr – es ist schon richtig herum
    expect(leseExifOrientierung(f.jpeg)).toBe(1)
  })

  it('Ausrichtung 8 (90° gegen den Uhrzeigersinn): rot unten, blau oben', async () => {
    const roh = mitExif(await zweiFarbenBild(400, 200), { orientierung: 8 })
    const f = await erzeugeFoto(roh, napiBilddienst({ dreht: false }))
    expect({ b: f.breite, h: f.hoehe }).toEqual({ b: 200, h: 400 })
    expect(istBlau(await pixel(f.jpeg, 100, 50))).toBe(true)
    expect(istRot(await pixel(f.jpeg, 100, 350))).toBe(true)
  })

  it('Ausrichtung 3 (180°): rot rechts, blau links', async () => {
    const roh = mitExif(await zweiFarbenBild(400, 200), { orientierung: 3 })
    const f = await erzeugeFoto(roh, napiBilddienst({ dreht: false }))
    expect({ b: f.breite, h: f.hoehe }).toEqual({ b: 400, h: 200 })
    expect(istBlau(await pixel(f.jpeg, 50, 100))).toBe(true)
    expect(istRot(await pixel(f.jpeg, 350, 100))).toBe(true)
  })

  it('Ausrichtung 2 (gespiegelt): rot rechts, blau links, Größe gleich', async () => {
    const roh = mitExif(await zweiFarbenBild(400, 200), { orientierung: 2 })
    const f = await erzeugeFoto(roh, napiBilddienst({ dreht: false }))
    expect({ b: f.breite, h: f.hoehe }).toEqual({ b: 400, h: 200 })
    expect(istBlau(await pixel(f.jpeg, 50, 100))).toBe(true)
    expect(istRot(await pixel(f.jpeg, 350, 100))).toBe(true)
  })

  // Viertel des Ergebnisses (links oben, rechts oben, links unten, rechts unten) je Ausrichtung
  const ERWARTET: Record<number, string> = {
    1: 'RGBY',
    2: 'GRYB',
    3: 'YBGR',
    4: 'BYRG',
    5: 'RBGY',
    6: 'BRYG',
    7: 'YGBR',
    8: 'GYRB',
  }
  for (const [o, soll] of Object.entries(ERWARTET)) {
    it(`alle acht Ausrichtungen: ${o} ergibt ${soll} (links oben, rechts oben, links unten, rechts unten)`, async () => {
      const roh = mitExif(await vierViertelBild(300, 200), { orientierung: Number(o) })
      for (const dreht of [false, true]) {
        const f = await erzeugeFoto(roh, napiBilddienst({ dreht }))
        const b = f.breite
        const h = f.hoehe
        expect([b, h]).toEqual(vertauscht(Number(o)) ? [200, 300] : [300, 200])
        const q = await Promise.all(
          [
            [b * 0.25, h * 0.25],
            [b * 0.75, h * 0.25],
            [b * 0.25, h * 0.75],
            [b * 0.75, h * 0.75],
          ].map(async ([x, y]) => farbName(await pixel(f.jpeg, Math.floor(x), Math.floor(y)))),
        )
        expect(q.join('')).toBe(soll)
      }
    })
  }

  it('dreht der Decoder schon selbst (wie die Browser), wird nicht doppelt gedreht', async () => {
    const roh = mitExif(await zweiFarbenBild(400, 200), { orientierung: 6 })
    const dienst = napiBilddienst() // @napi-rs/canvas wendet die Ausrichtung beim Dekodieren an
    expect(await dienst.dreheSelbst()).toBe(true)
    const f = await erzeugeFoto(roh, dienst)
    expect({ b: f.breite, h: f.hoehe }).toEqual({ b: 200, h: 400 })
    expect(istRot(await pixel(f.jpeg, 100, 50))).toBe(true)
    expect(istBlau(await pixel(f.jpeg, 100, 350))).toBe(true)
  })

  it('ein Decoder ohne eigene Drehung wird am Probebild erkannt', async () => {
    expect(await napiBilddienst({ dreht: false }).dreheSelbst()).toBe(false)
  })

  it('erkennt am Probebild, ob der Decoder selbst dreht', async () => {
    const dekodiere = async (b: Uint8Array) => ({ breite: b === PROBE_JPEG_O6 ? 1 : 0, hoehe: 2 })
    expect(await erkenneAutoDrehung(dekodiere)).toBe(true)
    expect(await erkenneAutoDrehung(async () => ({ breite: 2, hoehe: 1 }))).toBe(false)
    expect(await erkenneAutoDrehung(async () => Promise.reject(new Error('kaputt')))).toBe(false)
  })
})

describe('Standortdaten entfernen', () => {
  it('GPS, Kameramodell und jedes EXIF-Segment sind im Ergebnis weg', async () => {
    const roh = mitExif(await testFoto(1600, 1200, 0.05), { orientierung: 6, gps: true })
    expect(enthaelt(roh, EXIF_GPS_REF)).toBe(true)
    expect(enthaelt(roh, EXIF_KAMERA)).toBe(true)

    const f = await erzeugeFoto(roh, napiBilddienst())
    for (const bytes of [f.jpeg, f.vorschau]) {
      expect(enthaelt(bytes, EXIF_GPS_REF)).toBe(false)
      expect(enthaelt(bytes, EXIF_KAMERA)).toBe(false)
      expect(enthaelt(bytes, 'Exif')).toBe(false)
      expect(leseExifOrientierung(bytes)).toBe(1)
    }
  })
})
