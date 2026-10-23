// @vitest-environment node
// „Meine Unterschrift“: Glätten, Freistellen, Zuschneiden, PNG und Speicher. Alle Bilder werden hier selbst
// erzeugt (erfundene Kritzel auf erfundenem Papier) – keine echten Unterschriften.
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas'
import { beforeAll, describe, expect, it } from 'vitest'
import { LEERES_PROFIL, type ProfilSpeicher, type ProfilStand } from '@/profil'
import {
  inhaltsRechteck,
  neuesBild,
  schneideAufSchrift,
  schneideRand,
  stelleFrei,
  verkleinere,
  type Bild,
} from '../bild'
import {
  bildAlsPngUrl,
  bildZuUnterschriftUrl,
  leseBild,
  stricheZuUnterschriftUrl,
  type LeinwandFabrik,
  type LeinwandLike,
} from '../png'
import { duenneAus, glaetteEingabe, hatInhalt, malStriche, strichSegmente, type Strich } from '../striche'
import {
  istUnterschriftUrl,
  ladeUnterschriftUrl,
  loescheUnterschrift,
  speichereUnterschrift,
  unterschriftAlsPng,
} from '../index'

const fabrik: LeinwandFabrik = (b, h) => createCanvas(b, h) as unknown as LeinwandLike

beforeAll(() => {
  ;(globalThis as { ImageData?: unknown }).ImageData = ImageData
})

/** Erfundene Kritzel: eine Welle mit Schleife, in Strich-Koordinaten (Breiten). */
const kritzel = (): Strich[] => {
  const welle: Strich = []
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    welle.push({ x: 0.1 + t * 0.7, y: 0.17 + Math.sin(t * Math.PI * 4) * 0.07 })
  }
  const unterstrich: Strich = [{ x: 0.12, y: 0.28 }, { x: 0.5, y: 0.26 }, { x: 0.82, y: 0.29 }]
  return [welle, unterstrich]
}

/** Foto-Nachbau: grauliches Papier mit Lichtverlauf, blaue „Tinte“ (selbst gemalt). */
function papierFoto(breite = 600, hoehe = 300): Bild {
  const c = createCanvas(breite, hoehe)
  const ctx = c.getContext('2d')
  const verlauf = ctx.createLinearGradient(0, 0, breite, 0)
  verlauf.addColorStop(0, '#9a9a94') // Schatten links
  verlauf.addColorStop(1, '#eeeee6') // hell rechts
  ctx.fillStyle = verlauf
  ctx.fillRect(0, 0, breite, hoehe)
  ctx.strokeStyle = '#1b3f9c'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(150, 170)
  ctx.bezierCurveTo(200, 80, 260, 240, 330, 150)
  ctx.bezierCurveTo(380, 90, 430, 200, 470, 140)
  ctx.stroke()
  const d = ctx.getImageData(0, 0, breite, hoehe).data
  return { breite, hoehe, daten: new Uint8ClampedArray(d) }
}

const alpha = (b: Bild, x: number, y: number) => b.daten[(y * b.breite + x) * 4 + 3]

describe('Striche glätten', () => {
  it('glaetteEingabe zieht den Punkt Richtung Vorgänger und behält den Druck', () => {
    const p = glaetteEingabe({ x: 0, y: 0 }, { x: 1, y: 1, druck: 0.7 }, 0.5)
    expect(p).toEqual({ x: 0.5, y: 0.5, druck: 0.7 })
    expect(glaetteEingabe(undefined, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })

  it('duenneAus behält Anfang und Ende und wirft nahe Punkte weg', () => {
    const s: Strich = [{ x: 0, y: 0 }, { x: 0.0001, y: 0 }, { x: 0.0002, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1001, y: 0 }]
    const d = duenneAus(s)
    expect(d[0]).toEqual(s[0])
    expect(d[d.length - 1]).toEqual(s[s.length - 1])
    expect(d.length).toBeLessThan(s.length)
  })

  it('Kurvenstücke sind lückenlos und ohne Knick (Anschluss in der Mitte der Steuerpunkte)', () => {
    const seg = strichSegmente(kritzel()[0])
    expect(seg.length).toBeGreaterThan(10)
    for (let i = 1; i < seg.length; i++) {
      expect(seg[i].von.x).toBeCloseTo(seg[i - 1].bis.x, 10)
      expect(seg[i].von.y).toBeCloseTo(seg[i - 1].bis.y, 10)
    }
    expect(strichSegmente([{ x: 0, y: 0 }])).toEqual([])
  })

  it('Stiftdruck macht die Linie breiter, Tempo dünner', () => {
    const fest: Strich = Array.from({ length: 10 }, (_, i) => ({ x: i * 0.01, y: 0.1, druck: 1 }))
    const leicht: Strich = fest.map((p) => ({ ...p, druck: 0.1 }))
    const schnell: Strich = Array.from({ length: 10 }, (_, i) => ({ x: i * 0.2, y: 0.1 }))
    const mittel = (s: Strich) => strichSegmente(s).reduce((a, g) => a + g.breite, 0) / strichSegmente(s).length
    expect(mittel(fest)).toBeGreaterThan(mittel(leicht) * 1.5)
    expect(mittel(schnell)).toBeLessThan(0.0035)
  })

  it('hatInhalt: leer, ein Tupfer ohne Länge und ein echter Strich', () => {
    expect(hatInhalt([])).toBe(false)
    expect(hatInhalt([[{ x: 0.1, y: 0.1 }]])).toBe(false)
    expect(hatInhalt(kritzel())).toBe(true)
  })

  it('einzelner Punkt wird ein Tupfer', () => {
    const c = createCanvas(100, 100)
    malStriche(c.getContext('2d') as never, [[{ x: 0.5, y: 0.5 }]], 100, '#000', 0.1)
    const b = leseBild(c as unknown as LeinwandLike)
    expect(alpha(b, 50, 50)).toBe(255)
    expect(alpha(b, 5, 5)).toBe(0)
  })
})

describe('Foto freistellen', () => {
  it('Papier wird durchsichtig (auch im Schatten), Tinte bleibt deckend und blau', () => {
    const foto = papierFoto()
    const frei = stelleFrei(foto)
    // Papier links im Schatten und rechts im Licht: durchsichtig
    expect(alpha(frei, 20, 20)).toBe(0)
    expect(alpha(frei, 580, 280)).toBe(0)
    // Tinte: irgendwo auf der Kurve (Start 150,170) deckend und bläulich
    let gefunden = 0
    for (let y = 120; y < 200; y++) {
      for (let x = 145; x < 160; x++) {
        const i = (y * frei.breite + x) * 4
        if (frei.daten[i + 3] > 240 && frei.daten[i + 2] > frei.daten[i]) gefunden++
      }
    }
    expect(gefunden).toBeGreaterThan(5)
    // Anteil deckender Pixel klein (nur die Linie), kein Papierrauschen
    let deckend = 0
    for (let i = 3; i < frei.daten.length; i += 4) if (frei.daten[i] > 128) deckend++
    expect(deckend / (frei.breite * frei.hoehe)).toBeLessThan(0.1)
    expect(deckend).toBeGreaterThan(500)
  })

  it('Eingangsbild bleibt unverändert, Farbe „schwarz“ färbt einheitlich dunkel', () => {
    const foto = papierFoto()
    const kopie = new Uint8ClampedArray(foto.daten)
    const s = stelleFrei(foto, { empfindlichkeit: 50, farbe: 'schwarz' })
    expect(Buffer.from(foto.daten).equals(Buffer.from(kopie))).toBe(true)
    const i = s.daten.findIndex((v, k) => k % 4 === 3 && v > 200)
    expect(s.daten[i - 3]).toBe(16)
  })

  it('höhere Empfindlichkeit nimmt schwache Striche mit', () => {
    const b = neuesBild(200, 100)
    b.daten.fill(255)
    for (let x = 20; x < 180; x++) {
      const i = (50 * 200 + x) * 4
      b.daten[i] = b.daten[i + 1] = b.daten[i + 2] = 215 // blasser Bleistift
    }
    const wenig = inhaltsRechteck(stelleFrei(b, { empfindlichkeit: 0, farbe: 'original' }))
    const viel = inhaltsRechteck(stelleFrei(b, { empfindlichkeit: 100, farbe: 'original' }))
    expect(wenig).toBeUndefined()
    expect(viel).toBeDefined()
  })

  it('reines weißes Blatt bleibt leer', () => {
    const b = neuesBild(120, 60)
    b.daten.fill(255)
    expect(inhaltsRechteck(stelleFrei(b))).toBeUndefined()
  })
})

describe('Zuschneiden', () => {
  it('schneideRand schneidet in Anteilen und lässt mindestens ein Pixel', () => {
    const b = papierFoto(100, 50)
    const k = schneideRand(b, { links: 0.1, rechts: 0.2, oben: 0.5, unten: 0.1 })
    expect(k.breite).toBe(70)
    expect(k.hoehe).toBe(20)
    const winzig = schneideRand(b, { links: 0.9, rechts: 0.9, oben: 0.9, unten: 0.9 })
    expect(winzig.breite).toBeGreaterThanOrEqual(1)
    expect(winzig.hoehe).toBeGreaterThanOrEqual(1)
  })

  it('schneideAufSchrift setzt das Rechteck eng um die Tinte', () => {
    const frei = stelleFrei(papierFoto())
    const r = inhaltsRechteck(frei) as NonNullable<ReturnType<typeof inhaltsRechteck>>
    const z = schneideAufSchrift(frei)
    expect(z.breite).toBeLessThan(frei.breite / 1.5)
    expect(z.breite).toBeGreaterThanOrEqual(r.breite)
    expect(z.hoehe).toBeGreaterThanOrEqual(r.hoehe)
    expect(schneideAufSchrift(neuesBild(10, 10)).breite).toBe(10)
  })

  it('verkleinere hält das Seitenverhältnis, vergrößert nie und lässt keinen hellen Saum', () => {
    const b = neuesBild(400, 200)
    for (let p = 0; p < 400 * 200; p++) {
      b.daten[p * 4 + 3] = p % 400 < 200 ? 255 : 0 // linke Hälfte schwarz-deckend, rechte durchsichtig
    }
    const k = verkleinere(b, 100, 100)
    expect(k.breite).toBe(100)
    expect(k.hoehe).toBe(50)
    expect(verkleinere(b, 1000, 1000)).toBe(b)
    for (let y = 0; y < k.hoehe; y++) expect(k.daten[(y * 100 + 49) * 4]).toBe(0) // Farbe nicht von durchsichtigen Pixeln aufgehellt
  })
})

describe('PNG', () => {
  /** PNG zurücklesen (ohne Zusatzpaket): Bild laden, auf Canvas malen, Pixel holen. */
  const dekodiere = async (url: string) => {
    const img = await loadImage(Buffer.from(url.split(',')[1], 'base64'))
    const c = createCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data }
  }

  it('gezeichnete Striche → transparentes PNG, eng zugeschnitten, höchstens 600 × 240', async () => {
    const url = stricheZuUnterschriftUrl(kritzel(), fabrik)
    expect(istUnterschriftUrl(url)).toBe(true)
    const png = await dekodiere(url)
    expect(png.width).toBeLessThanOrEqual(600)
    expect(png.height).toBeLessThanOrEqual(240)
    expect(png.width).toBeGreaterThan(300)
    // Ecke durchsichtig, irgendwo Tinte
    expect(png.data[3]).toBe(0)
    let tinte = 0
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 200) tinte++
    expect(tinte).toBeGreaterThan(400)
    // Verhältnis passt zur Kritzel: ungefähr 0,72 breit zu 0,25 hoch
    expect(png.width / png.height).toBeGreaterThan(2)
    expect(png.width / png.height).toBeLessThan(4.5)
  })

  it('Foto → freigestelltes PNG mit durchsichtigem Rand', async () => {
    const url = bildZuUnterschriftUrl(stelleFrei(papierFoto()), fabrik)
    const png = await dekodiere(url)
    expect(png.data[3]).toBe(0)
    expect(png.width).toBeLessThan(600)
  })

  it('bildAlsPngUrl behält die Größe', async () => {
    const b = neuesBild(30, 20)
    b.daten.fill(255)
    const png = await dekodiere(bildAlsPngUrl(b, fabrik))
    expect([png.width, png.height]).toEqual([30, 20])
  })
})

describe('Speicher und Abruf für Paket 4', () => {
  const speicher = (): ProfilSpeicher & { stand: ProfilStand } => {
    const s = {
      stand: { profil: { ...LEERES_PROFIL } } as ProfilStand,
      lade: () => structuredClone(s.stand),
      speichere: (n: ProfilStand) => void (s.stand = structuredClone(n)),
    }
    return s
  }

  it('speichern, abrufen als PNG-Bytes, löschen', () => {
    const sp = speicher()
    expect(unterschriftAlsPng(sp)).toBeNull()
    const url = stricheZuUnterschriftUrl(kritzel(), fabrik)
    speichereUnterschrift(url, sp)
    expect(sp.stand.geaendertAm).toBeDefined() // für den Abgleich vorgemerkt
    expect(ladeUnterschriftUrl(sp)).toBe(url)
    const bytes = unterschriftAlsPng(sp) as Uint8Array
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]) // PNG-Kopf
    loescheUnterschrift(sp)
    expect(unterschriftAlsPng(sp)).toBeNull()
    expect(sp.stand.profil.unterschrift).toBeUndefined()
  })

  it('lehnt Fremdes ab: kein PNG, kaputtes Base64, zu groß', () => {
    const sp = speicher()
    expect(() => speichereUnterschrift('data:image/jpeg;base64,AAAA', sp)).toThrow()
    expect(() => speichereUnterschrift('data:image/png;base64,<script>', sp)).toThrow()
    expect(() => speichereUnterschrift('data:image/png;base64,' + 'A'.repeat(400_000), sp)).toThrow()
    expect(istUnterschriftUrl(undefined)).toBe(false)
  })
})
