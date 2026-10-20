// Bilddienst für den Browser (Canvas); Gegenstück für die Tests: komprimieren.test.ts.
import { erkenneAutoDrehung, type Bilddienst, type Leinwand } from './komprimieren'

async function dekodiereRoh(bytes: Uint8Array): Promise<ImageBitmap> {
  // Kopie in einen ArrayBuffer (nicht SharedArrayBuffer), damit Blob sie annimmt
  return createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/jpeg' }))
}

let autoDrehung: Promise<boolean> | undefined

export const browserBilddienst: Bilddienst = {
  async dekodiere(bytes) {
    const bild = await dekodiereRoh(bytes)
    return { bild, breite: bild.width, hoehe: bild.height }
  },

  leinwand(breite, hoehe): Leinwand {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(breite, hoehe)
      const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D
      return {
        zeichner: ctx as never,
        async nachJpeg(q) {
          const blob = await c.convertToBlob({ type: 'image/jpeg', quality: q })
          return new Uint8Array(await blob.arrayBuffer())
        },
      }
    }
    const c = document.createElement('canvas')
    c.width = breite
    c.height = hoehe
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    return {
      zeichner: ctx as never,
      nachJpeg: (q) =>
        new Promise((ok, fehler) => {
          c.toBlob(
            (blob) => (blob ? void blob.arrayBuffer().then((b) => ok(new Uint8Array(b)), fehler) : fehler(new Error('JPEG konnte nicht erzeugt werden'))),
            'image/jpeg',
            q,
          )
        }),
    }
  },

  dreheSelbst() {
    autoDrehung ??= erkenneAutoDrehung(async (b) => {
      const bild = await dekodiereRoh(b)
      return { breite: bild.width, hoehe: bild.height }
    })
    return autoDrehung
  },
}
