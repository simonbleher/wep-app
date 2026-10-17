/**
 * SVG → PNG im Browser (PNG-Fallback der Piktogramme für Excel-Versionen ohne SVG).
 * Benötigt `Image` und `canvas`; im Node-Test wird stattdessen ein eigener
 * Rasterisierer übergeben.
 */

import type { SvgRaster } from './skizzeFormen'

export const svgZuPngBrowser: SvgRaster = async (svg, breite, hoehe) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const bild = new Image()
    bild.width = breite
    bild.height = hoehe
    await new Promise<void>((ok, fehler) => {
      bild.onload = () => ok()
      bild.onerror = () => fehler(new Error('SVG-Piktogramm konnte nicht gerendert werden'))
      bild.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = breite
    canvas.height = hoehe
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar')
    ctx.drawImage(bild, 0, 0, breite, hoehe)
    const blob = await new Promise<Blob>((ok, fehler) =>
      canvas.toBlob((b) => (b ? ok(b) : fehler(new Error('canvas.toBlob gab null zurück'))), 'image/png'),
    )
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}
