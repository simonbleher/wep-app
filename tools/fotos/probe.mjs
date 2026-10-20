// Erzeugt das Probebild für src/fotos/komprimieren.ts (PROBE_BASE64): ein selbst gezeichnetes
// JPEG, 2 × 1 px, mit EXIF-Ausrichtung 6. Aufruf: node tools/fotos/probe.mjs
import { createCanvas } from '@napi-rs/canvas'

function exifApp1(orientierung) {
  // TIFF (little endian) mit einem Eintrag: Orientation (0x0112, SHORT, 1)
  const tiff = Buffer.alloc(8 + 2 + 12 + 4)
  tiff.write('II', 0, 'latin1')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(orientierung, 18)
  const kopf = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const seg = Buffer.alloc(4)
  seg.writeUInt16BE(0xffe1, 0)
  seg.writeUInt16BE(kopf.length + 2, 2)
  return Buffer.concat([seg, kopf])
}

const c = createCanvas(2, 1)
const ctx = c.getContext('2d')
ctx.fillStyle = '#c03030'
ctx.fillRect(0, 0, 1, 1)
ctx.fillStyle = '#3030c0'
ctx.fillRect(1, 0, 1, 1)
const jpeg = c.toBuffer('image/jpeg', 90)
const ohneApp0 = jpeg // SOI + (APP0) + …; EXIF direkt nach SOI einfügen
const mit = Buffer.concat([ohneApp0.subarray(0, 2), exifApp1(6), ohneApp0.subarray(2)])
console.log(mit.toString('base64'))
