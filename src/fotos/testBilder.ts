// Nur für Tests und Werkzeuge: selbst erzeugte Testbilder (keine echten Fotos), EXIF-Daten zum Einbauen
// und ein Bilddienst auf Basis von @napi-rs/canvas (Node), der die Browser-Canvas nachbildet.
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import { erkenneAutoDrehung, type Bilddienst, type Leinwand } from './komprimieren'

/** Entfernt alle EXIF-Segmente (APP1) eines JPEG – damit dekodiert auch ein Decoder ohne eigene Drehung „roh“. */
export function ohneExif(jpeg: Uint8Array): Uint8Array {
  const teile: Buffer[] = [Buffer.from(jpeg.subarray(0, 2))]
  let pos = 2
  const b = Buffer.from(jpeg)
  while (pos + 4 <= b.length && b[pos] === 0xff && b[pos + 1] !== 0xda) {
    const len = b.readUInt16BE(pos + 2)
    if (b[pos + 1] !== 0xe1) teile.push(b.subarray(pos, pos + 2 + len))
    pos += 2 + len
  }
  teile.push(b.subarray(pos))
  return new Uint8Array(Buffer.concat(teile))
}

/**
 * Bilddienst für Node. @napi-rs/canvas wendet die EXIF-Ausrichtung beim Dekodieren selbst an (wie die
 * heutigen Browser). `dreht: false` bildet einen Decoder nach, der das nicht tut (er bekommt das JPEG ohne
 * EXIF): dann muss `erzeugeFoto` selbst drehen.
 */
export function napiBilddienst(opt: { dreht?: boolean } = {}): Bilddienst {
  const dekodiere = async (bytes: Uint8Array) => {
    const bild = await loadImage(Buffer.from(opt.dreht === false ? ohneExif(bytes) : bytes))
    return { bild: bild as unknown, breite: bild.width, hoehe: bild.height }
  }
  return {
    dekodiere,
    leinwand(breite, hoehe): Leinwand {
      const c: Canvas = createCanvas(breite, hoehe)
      return {
        zeichner: c.getContext('2d') as never,
        async nachJpeg(q) {
          return new Uint8Array(await c.encode('jpeg', Math.round(q * 100)))
        },
      }
    },
    // wie im Browser: Verhalten des Decoders am Probebild erkennen
    dreheSelbst: () => erkenneAutoDrehung(dekodiere),
  }
}

export interface ExifOptionen {
  orientierung?: number
  /** Standortdaten (GPS) und Kameramodell einbauen – müssen nach dem Verkleinern weg sein. */
  gps?: boolean
}

/** Marker-Texte, die in `baueExif` stehen und im Ergebnis nicht mehr vorkommen dürfen. */
export const EXIF_KAMERA = 'TestKamera-X1'
export const EXIF_GPS_REF = 'GPSTEST'

/** Baut ein EXIF-Segment (APP1) mit Ausrichtung und optional Kamera + GPS. */
export function baueExif(opt: ExifOptionen): Uint8Array {
  const eintraege: { tag: number; typ: number; anzahl: number; wert: Buffer }[] = []
  const kurz = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt16LE(n, 0)
    return b
  }
  const lang = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n, 0)
    return b
  }
  // Layout: Header (8) · IFD0 · Zusatzdaten
  const ifd0: typeof eintraege = []
  if (opt.orientierung) ifd0.push({ tag: 0x0112, typ: 3, anzahl: 1, wert: kurz(opt.orientierung) })
  const extra: Buffer[] = []
  const anzahl0 = ifd0.length + (opt.gps ? 2 : 0)
  const ifd0Groesse = 2 + anzahl0 * 12 + 4
  let zeiger = 8 + ifd0Groesse
  if (opt.gps) {
    const make = Buffer.from(`${EXIF_KAMERA}\0`, 'latin1')
    ifd0.push({ tag: 0x010f, typ: 2, anzahl: make.length, wert: lang(zeiger) })
    extra.push(make)
    zeiger += make.length
    // GPS-IFD: Referenz-Text und Breitengrad (3 Rationale)
    const ref = Buffer.from(`${EXIF_GPS_REF}\0`, 'latin1')
    const gpsStart = zeiger
    const gpsIfdGroesse = 2 + 2 * 12 + 4
    const breite = Buffer.alloc(24)
    ;[52, 1, 31, 1, 1234, 100].forEach((v, i) => breite.writeUInt32LE(v, i * 4))
    const gps = Buffer.alloc(gpsIfdGroesse)
    gps.writeUInt16LE(2, 0)
    gps.writeUInt16LE(0x0001, 2) // GPSLatitudeRef
    gps.writeUInt16LE(2, 4)
    gps.writeUInt32LE(ref.length, 6)
    gps.writeUInt32LE(gpsStart + gpsIfdGroesse, 10)
    gps.writeUInt16LE(0x0002, 14) // GPSLatitude
    gps.writeUInt16LE(5, 16)
    gps.writeUInt32LE(3, 18)
    gps.writeUInt32LE(gpsStart + gpsIfdGroesse + ref.length, 22)
    extra.push(gps, ref, breite)
    ifd0.push({ tag: 0x8825, typ: 4, anzahl: 1, wert: lang(gpsStart) })
    zeiger += gpsIfdGroesse + ref.length + breite.length
  }
  ifd0.sort((a, b) => a.tag - b.tag)
  eintraege.push(...ifd0)
  const kopf = Buffer.alloc(8)
  kopf.write('II', 0, 'latin1')
  kopf.writeUInt16LE(42, 2)
  kopf.writeUInt32LE(8, 4)
  const tabelle = Buffer.alloc(ifd0Groesse)
  tabelle.writeUInt16LE(eintraege.length, 0)
  eintraege.forEach((e, i) => {
    const o = 2 + i * 12
    tabelle.writeUInt16LE(e.tag, o)
    tabelle.writeUInt16LE(e.typ, o + 2)
    tabelle.writeUInt32LE(e.anzahl, o + 4)
    e.wert.copy(tabelle, o + 8)
  })
  const tiff = Buffer.concat([kopf, tabelle, ...extra])
  const inhalt = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const seg = Buffer.alloc(4)
  seg.writeUInt16BE(0xffe1, 0)
  seg.writeUInt16BE(inhalt.length + 2, 2)
  return new Uint8Array(Buffer.concat([seg, inhalt]))
}

/** Setzt ein EXIF-Segment direkt hinter den Dateianfang (SOI) eines JPEG. */
export function mitExif(jpeg: Uint8Array, opt: ExifOptionen): Uint8Array {
  return new Uint8Array(Buffer.concat([jpeg.subarray(0, 2), baueExif(opt), jpeg.subarray(2)]))
}

/**
 * Selbst gemaltes „Gartenfoto“ (Himmel, Wiese, Haus, Baum) mit dem gewünschten Rauschen; deterministisch.
 * `rauschen` 0 = glatt, 1 = sehr unruhig (schlecht komprimierbar).
 */
export async function testFoto(breite: number, hoehe: number, rauschen = 0.15): Promise<Uint8Array> {
  const c = createCanvas(breite, hoehe)
  const ctx = c.getContext('2d')
  const himmel = ctx.createLinearGradient(0, 0, 0, hoehe * 0.6)
  himmel.addColorStop(0, '#6aa7d8')
  himmel.addColorStop(1, '#cfe6f5')
  ctx.fillStyle = himmel
  ctx.fillRect(0, 0, breite, hoehe)
  ctx.fillStyle = '#4f8a3c'
  ctx.fillRect(0, hoehe * 0.6, breite, hoehe * 0.4)
  ctx.fillStyle = '#c9b48a'
  ctx.fillRect(breite * 0.15, hoehe * 0.35, breite * 0.25, hoehe * 0.3)
  ctx.fillStyle = '#8a3b2e'
  ctx.beginPath()
  ctx.moveTo(breite * 0.13, hoehe * 0.35)
  ctx.lineTo(breite * 0.275, hoehe * 0.2)
  ctx.lineTo(breite * 0.42, hoehe * 0.35)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#5b3a1e'
  ctx.fillRect(breite * 0.68, hoehe * 0.4, breite * 0.03, hoehe * 0.3)
  ctx.fillStyle = '#2f6f2a'
  ctx.beginPath()
  ctx.arc(breite * 0.695, hoehe * 0.37, hoehe * 0.16, 0, Math.PI * 2)
  ctx.fill()
  // Rauschen (deterministisch)
  if (rauschen > 0) {
    const daten = ctx.getImageData(0, 0, breite, hoehe)
    let s = 12345
    for (let i = 0; i < daten.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0
      const r = ((s >>> 8) % 256) - 128
      for (let k = 0; k < 3; k++) {
        daten.data[i + k] = Math.max(0, Math.min(255, daten.data[i + k] + r * rauschen))
      }
    }
    ctx.putImageData(daten, 0, 0)
  }
  return new Uint8Array(await c.encode('jpeg', 92))
}

/** Zwei Hälften: links rot, rechts blau (zum Prüfen der Drehung). */
export async function zweiFarbenBild(breite: number, hoehe: number): Promise<Uint8Array> {
  const c = createCanvas(breite, hoehe)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#d02020'
  ctx.fillRect(0, 0, breite / 2, hoehe)
  ctx.fillStyle = '#2020d0'
  ctx.fillRect(breite / 2, 0, breite / 2, hoehe)
  return new Uint8Array(await c.encode('jpeg', 95))
}

/** Farbe (RGB) an einem Punkt eines JPEG. */
export async function pixel(jpeg: Uint8Array, x: number, y: number): Promise<[number, number, number]> {
  const bild = await loadImage(Buffer.from(jpeg))
  const c = createCanvas(bild.width, bild.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(bild, 0, 0)
  const d = ctx.getImageData(x, y, 1, 1).data
  return [d[0], d[1], d[2]]
}

export async function groesseVon(jpeg: Uint8Array): Promise<{ breite: number; hoehe: number }> {
  const bild = await loadImage(Buffer.from(jpeg))
  return { breite: bild.width, hoehe: bild.height }
}

/** Vier Viertel: links oben rot, rechts oben grün, links unten blau, rechts unten gelb. */
export async function vierViertelBild(breite: number, hoehe: number): Promise<Uint8Array> {
  const c = createCanvas(breite, hoehe)
  const ctx = c.getContext('2d')
  const farben = [
    ['#d02020', '#20b020'],
    ['#2020d0', '#d0d020'],
  ]
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = farben[y][x]
      ctx.fillRect((x * breite) / 2, (y * hoehe) / 2, breite / 2, hoehe / 2)
    }
  }
  return new Uint8Array(await c.encode('jpeg', 95))
}

/** Benennt die Farbe eines Pixels: R(ot), G(rün), B(lau), Y (gelb). */
export function farbName([r, g, b]: number[]): 'R' | 'G' | 'B' | 'Y' | '?' {
  if (r > 150 && g < 90 && b < 90) return 'R'
  if (g > 120 && r < 90 && b < 90) return 'G'
  if (b > 150 && r < 90 && g < 90) return 'B'
  if (r > 150 && g > 150 && b < 90) return 'Y'
  return '?'
}
