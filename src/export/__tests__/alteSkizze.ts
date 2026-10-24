/** Eine Skizze im Stil von vor der Schnittstelle (ohne Füllung, Farben, Linienart): Export und PNG müssen unverändert bleiben. Erfunden. */
import type { SkizzeDaten } from '../../skizze/types'

export const alteSkizze: SkizzeDaten = {
  breite: 800,
  hoehe: 600,
  raster: true,
  rasterGroesse: 40,
  elemente: [
    { id: 'a1', typ: 'rechteck', x: 100, y: 100, breite: 200, hoehe: 100 },
    { id: 'a2', typ: 'kreis', cx: 500, cy: 300, radius: 30, beschriftung: 'Apfel' },
    { id: 'a3', typ: 'kreis', cx: 600, cy: 120, radius: 20 },
    { id: 'a4', typ: 'linie', x1: 10, y1: 10, x2: 300, y2: 12 },
    { id: 'a5', typ: 'text', x: 50, y: 400, inhalt: 'Laube', schriftgroesse: 16 },
    { id: 'a6', typ: 'massangabe', x1: 100, y1: 550, x2: 400, y2: 550, beschriftung: '4 m' },
    { id: 'a7', typ: 'symbol', art: 'baum', x: 400, y: 200, breite: 34, hoehe: 42, beschriftung: 'Birne' },
    { id: 'a8', typ: 'symbol', art: 'hecke', x: 600, y: 400, breite: 110, hoehe: 24, beschriftung: 'Liguster' },
    { id: 'a9', typ: 'symbol', art: 'weg', x: 300, y: 300, breite: 30, hoehe: 100 },
    { id: 'a10', typ: 'symbol', art: 'mangelhinweis', x: 150, y: 450, breite: 90, hoehe: 22, beschriftung: 'Rückschnitt' },
    { id: 'a11', typ: 'symbol', art: 'kompost', x: 700, y: 500, breite: 42, hoehe: 24 },
  ],
}
