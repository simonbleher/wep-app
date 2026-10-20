// Selbst erzeugte Testbilder für e2e und Screenshots (keine echten Fotos): ein gemaltes „Gartenfoto“ als
// JPEG, optional mit EXIF-Ausrichtung sowie Kameramodell und GPS-Daten, die nach dem Verkleinern in der
// App weg sein müssen. Gleiche Idee wie src/fotos/testBilder.ts (dort für Vitest).
import { createCanvas } from '@napi-rs/canvas'

export const EXIF_KAMERA = 'TestKamera-X1'
export const EXIF_GPS = 'GPSTEST'

function exif(orientierung, gps) {
  const ifd0 = []
  const extra = []
  const n0 = 1 + (gps ? 2 : 0)
  const ifdGroesse = 2 + n0 * 12 + 4
  let zeiger = 8 + ifdGroesse
  const u16 = (v) => {
    const b = Buffer.alloc(4)
    b.writeUInt16LE(v, 0)
    return b
  }
  const u32 = (v) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(v, 0)
    return b
  }
  ifd0.push({ tag: 0x0112, typ: 3, n: 1, wert: u16(orientierung) })
  if (gps) {
    const make = Buffer.from(`${EXIF_KAMERA}\0`, 'latin1')
    ifd0.push({ tag: 0x010f, typ: 2, n: make.length, wert: u32(zeiger) })
    extra.push(make)
    zeiger += make.length
    const ref = Buffer.from(`${EXIF_GPS}\0`, 'latin1')
    const gpsIfd = Buffer.alloc(2 + 12 + 4)
    gpsIfd.writeUInt16LE(1, 0)
    gpsIfd.writeUInt16LE(0x0001, 2)
    gpsIfd.writeUInt16LE(2, 4)
    gpsIfd.writeUInt32LE(ref.length, 6)
    gpsIfd.writeUInt32LE(zeiger + gpsIfd.length, 10)
    ifd0.push({ tag: 0x8825, typ: 4, n: 1, wert: u32(zeiger) })
    extra.push(gpsIfd, ref)
  }
  ifd0.sort((a, b) => a.tag - b.tag)
  const kopf = Buffer.alloc(8)
  kopf.write('II', 0, 'latin1')
  kopf.writeUInt16LE(42, 2)
  kopf.writeUInt32LE(8, 4)
  const tabelle = Buffer.alloc(ifdGroesse)
  tabelle.writeUInt16LE(ifd0.length, 0)
  ifd0.forEach((e, i) => {
    const o = 2 + i * 12
    tabelle.writeUInt16LE(e.tag, o)
    tabelle.writeUInt16LE(e.typ, o + 2)
    tabelle.writeUInt32LE(e.n, o + 4)
    e.wert.copy(tabelle, o + 8)
  })
  const inhalt = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), kopf, tabelle, ...extra])
  const seg = Buffer.alloc(4)
  seg.writeUInt16BE(0xffe1, 0)
  seg.writeUInt16BE(inhalt.length + 2, 2)
  return Buffer.concat([seg, inhalt])
}

/** Gemaltes Gartenbild (Himmel, Wiese, Haus, Baum); `variante` verschiebt Farben/Baum, `rauschen` 0–1. */
export function testFoto({ breite = 3000, hoehe = 2000, orientierung, gps = false, variante = 0, rauschen = 0.1 } = {}) {
  const c = createCanvas(breite, hoehe)
  const ctx = c.getContext('2d')
  const himmel = ctx.createLinearGradient(0, 0, 0, hoehe * 0.6)
  himmel.addColorStop(0, ['#6aa7d8', '#8fb6d8', '#a9c4de'][variante % 3])
  himmel.addColorStop(1, '#e3f0f8')
  ctx.fillStyle = himmel
  ctx.fillRect(0, 0, breite, hoehe)
  ctx.fillStyle = ['#4f8a3c', '#5c9444', '#3f7a35'][variante % 3]
  ctx.fillRect(0, hoehe * 0.6, breite, hoehe * 0.4)
  ctx.fillStyle = '#c9b48a'
  ctx.fillRect(breite * 0.12, hoehe * 0.35, breite * 0.25, hoehe * 0.3)
  ctx.fillStyle = '#8a3b2e'
  ctx.beginPath()
  ctx.moveTo(breite * 0.1, hoehe * 0.35)
  ctx.lineTo(breite * 0.245, hoehe * 0.2)
  ctx.lineTo(breite * 0.39, hoehe * 0.35)
  ctx.closePath()
  ctx.fill()
  const bx = breite * (0.6 + 0.07 * (variante % 3))
  ctx.fillStyle = '#5b3a1e'
  ctx.fillRect(bx, hoehe * 0.4, breite * 0.03, hoehe * 0.3)
  ctx.fillStyle = ['#2f6f2a', '#3a7a30', '#276025'][variante % 3]
  ctx.beginPath()
  ctx.arc(bx + breite * 0.015, hoehe * 0.37, hoehe * 0.16, 0, Math.PI * 2)
  ctx.fill()
  if (variante % 2 === 1) {
    ctx.fillStyle = '#c0392b'
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.arc(bx - breite * 0.05 + i * breite * 0.016, hoehe * (0.33 + (i % 3) * 0.04), hoehe * 0.012, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (rauschen > 0) {
    const d = ctx.getImageData(0, 0, breite, hoehe)
    let s = 4242 + variante
    for (let i = 0; i < d.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0
      const r = ((s >>> 8) % 256) - 128
      for (let k = 0; k < 3; k++) d.data[i + k] = Math.max(0, Math.min(255, d.data[i + k] + r * rauschen))
    }
    ctx.putImageData(d, 0, 0)
  }
  const jpeg = c.toBuffer('image/jpeg', 92)
  return orientierung ? Buffer.concat([jpeg.subarray(0, 2), exif(orientierung, gps), jpeg.subarray(2)]) : jpeg
}
