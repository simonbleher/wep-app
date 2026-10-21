import { describe, it, expect } from 'vitest'
import {
  GANZE_SKIZZE,
  ZOOM_MAX,
  ZOOM_MIN,
  ansichtBegrenzen,
  bildschirmZuSkizze,
  pixelProEinheit,
  radFaktor,
  verschiebeUmPixel,
  viewBoxText,
  zoomUmMitte,
  zoomUmPunkt,
  zweiFingerAnsicht,
} from '../ansicht.js'

const f = { breite: 800, hoehe: 600 }
// Zeichenfläche liegt bei (100, 50) auf dem Bildschirm und ist 400 px breit → 0,5 px je Einheit
const k = { left: 100, top: 50, width: 400, height: 300 }

describe('Ansicht: Umrechnung', () => {
  it('ganze Skizze: Bildschirm → Skizze', () => {
    expect(pixelProEinheit(GANZE_SKIZZE, f, k)).toBeCloseTo(0.5)
    expect(bildschirmZuSkizze({ x: 300, y: 200 }, GANZE_SKIZZE, f, k)).toEqual({ x: 400, y: 300 })
  })

  it('gezoomt und verschoben: Bildschirm → Skizze', () => {
    const a = { zoom: 2, x: 200, y: 100 }
    expect(pixelProEinheit(a, f, k)).toBeCloseTo(1)
    expect(bildschirmZuSkizze({ x: 100, y: 50 }, a, f, k)).toEqual({ x: 200, y: 100 })
    expect(bildschirmZuSkizze({ x: 150, y: 80 }, a, f, k)).toEqual({ x: 250, y: 130 })
  })

  it('viewBox zeigt den Ausschnitt', () => {
    expect(viewBoxText(GANZE_SKIZZE, f)).toBe('0 0 800 600')
    expect(viewBoxText({ zoom: 4, x: 100, y: 50 }, f)).toBe('100 50 200 150')
  })
})

describe('Ansicht: Grenzen', () => {
  it('Zoom bleibt zwischen Minimum und Maximum', () => {
    expect(ansichtBegrenzen({ zoom: 0.2, x: 0, y: 0 }, f).zoom).toBe(ZOOM_MIN)
    expect(ansichtBegrenzen({ zoom: 99, x: 0, y: 0 }, f).zoom).toBe(ZOOM_MAX)
  })

  it('Ausschnitt bleibt in der Zeichenfläche', () => {
    expect(ansichtBegrenzen({ zoom: 2, x: -50, y: -50 }, f)).toEqual({ zoom: 2, x: 0, y: 0 })
    expect(ansichtBegrenzen({ zoom: 2, x: 700, y: 700 }, f)).toEqual({ zoom: 2, x: 400, y: 300 })
    expect(ansichtBegrenzen({ zoom: 1, x: 30, y: 30 }, f)).toEqual({ zoom: 1, x: 0, y: 0 })
  })
})

describe('Ansicht: Zoomen', () => {
  it('der Punkt unter dem Fokus bleibt liegen', () => {
    const fokus = { x: 250, y: 125 }
    const vorher = bildschirmZuSkizze(fokus, GANZE_SKIZZE, f, k)
    const neu = zoomUmPunkt(GANZE_SKIZZE, 2, fokus, f, k)
    expect(neu.zoom).toBe(2)
    const nachher = bildschirmZuSkizze(fokus, neu, f, k)
    expect(nachher.x).toBeCloseTo(vorher.x)
    expect(nachher.y).toBeCloseTo(vorher.y)
  })

  it('Zoom um die Mitte ändert die Mitte nicht', () => {
    const neu = zoomUmMitte(GANZE_SKIZZE, 2, f, k)
    expect(neu).toEqual({ zoom: 2, x: 200, y: 150 })
  })

  it('Herauszoomen auf 1 zeigt wieder alles', () => {
    const rein = zoomUmMitte(GANZE_SKIZZE, 4, f, k)
    expect(zoomUmMitte(rein, 1 / 4, f, k)).toEqual(GANZE_SKIZZE)
  })

  it('Zoom stößt an das Maximum', () => {
    expect(zoomUmMitte({ zoom: 7, x: 0, y: 0 }, 10, f, k).zoom).toBe(ZOOM_MAX)
  })

  it('Mausrad: nach oben hinein, nach unten heraus', () => {
    expect(radFaktor(-100)).toBeGreaterThan(1)
    expect(radFaktor(100)).toBeLessThan(1)
    expect(radFaktor(0)).toBe(1)
  })
})

describe('Ansicht: Verschieben', () => {
  it('der Inhalt folgt dem Finger', () => {
    const a = { zoom: 2, x: 200, y: 100 } // 1 px je Einheit
    expect(verschiebeUmPixel(a, 30, -20, f, k)).toEqual({ zoom: 2, x: 170, y: 120 })
  })

  it('bleibt an den Rändern stehen', () => {
    const a = { zoom: 2, x: 0, y: 0 }
    expect(verschiebeUmPixel(a, 500, 500, f, k)).toEqual(a)
  })

  it('bei ganzer Skizze nichts zu verschieben', () => {
    expect(verschiebeUmPixel(GANZE_SKIZZE, 40, 40, f, k)).toEqual(GANZE_SKIZZE)
  })
})

describe('Ansicht: Zwei-Finger-Geste', () => {
  const start: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 200, y: 125 },
    { x: 400, y: 125 },
  ]

  it('Finger auseinander = hineinzoomen, Mitte bleibt unter den Fingern', () => {
    const jetzt: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 100, y: 125 },
      { x: 500, y: 125 },
    ]
    const neu = zweiFingerAnsicht(GANZE_SKIZZE, start, jetzt, f, k)
    expect(neu.zoom).toBeCloseTo(2)
    const unterMitte = bildschirmZuSkizze({ x: 300, y: 125 }, neu, f, k)
    const vorher = bildschirmZuSkizze({ x: 300, y: 125 }, GANZE_SKIZZE, f, k)
    expect(unterMitte.x).toBeCloseTo(vorher.x)
    expect(unterMitte.y).toBeCloseTo(vorher.y)
  })

  it('Finger zusammen = herauszoomen', () => {
    const rein = { zoom: 4, x: 300, y: 200 }
    const jetzt: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 250, y: 125 },
      { x: 350, y: 125 },
    ]
    expect(zweiFingerAnsicht(rein, start, jetzt, f, k).zoom).toBeCloseTo(2)
  })

  it('beide Finger gleich verschoben = nur Verschieben', () => {
    const start2 = { zoom: 2, x: 200, y: 100 } // 1 px je Einheit
    const jetzt: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 230, y: 125 },
      { x: 430, y: 125 },
    ]
    const neu = zweiFingerAnsicht(start2, start, jetzt, f, k)
    expect(neu.zoom).toBeCloseTo(2)
    expect(neu.x).toBeCloseTo(170)
    expect(neu.y).toBeCloseTo(100)
  })

  it('Zoom wird begrenzt', () => {
    const jetzt: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 125 },
      { x: 4000, y: 125 },
    ]
    expect(zweiFingerAnsicht(GANZE_SKIZZE, start, jetzt, f, k).zoom).toBe(ZOOM_MAX)
  })

  it('Finger auf demselben Punkt (Abstand 0) teilt nicht durch null', () => {
    const gleich: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 200, y: 125 },
      { x: 200, y: 125 },
    ]
    const neu = zweiFingerAnsicht(GANZE_SKIZZE, gleich, start, f, k)
    expect(Number.isFinite(neu.zoom)).toBe(true)
  })
})
