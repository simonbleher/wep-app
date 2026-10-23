// Foto einer Unterschrift aufbereiten: zuschneiden, Papier freistellen, Tinte behalten.
//
// Reine Rechnung auf RGBA-Pixeln (Uint8ClampedArray), unabhängig von Canvas und Oberfläche,
// damit sie im Test mit selbst erzeugten Bildern geprüft werden kann.

export interface Bild {
  breite: number
  hoehe: number
  /** RGBA, 4 Byte je Pixel. */
  daten: Uint8ClampedArray
}

export interface Rand {
  /** Anteile 0–1 der Breite bzw. Höhe, die links/rechts/oben/unten abgeschnitten werden. */
  links: number
  rechts: number
  oben: number
  unten: number
}

export interface FreistellOptionen {
  /** 0–100: wie leicht schwache Striche mitgenommen werden (höher = mehr Tinte, auch mehr Papierrauschen). */
  empfindlichkeit: number
  /** `original`: Farbton der Tinte bleibt (nur abgedunkelt), `schwarz`: einheitlich dunkel. */
  farbe: 'original' | 'schwarz'
}

export const STANDARD_FREISTELLEN: FreistellOptionen = { empfindlichkeit: 50, farbe: 'original' }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function neuesBild(breite: number, hoehe: number): Bild {
  return { breite, hoehe, daten: new Uint8ClampedArray(breite * hoehe * 4) }
}

/** Schneidet die Ränder ab (mindestens 1 Pixel bleibt). */
export function schneideRand(b: Bild, rand: Rand): Bild {
  const x0 = clamp(Math.round(rand.links * b.breite), 0, b.breite - 1)
  const x1 = clamp(b.breite - Math.round(rand.rechts * b.breite), x0 + 1, b.breite)
  const y0 = clamp(Math.round(rand.oben * b.hoehe), 0, b.hoehe - 1)
  const y1 = clamp(b.hoehe - Math.round(rand.unten * b.hoehe), y0 + 1, b.hoehe)
  return schneideAus(b, x0, y0, x1 - x0, y1 - y0)
}

export function schneideAus(b: Bild, x: number, y: number, breite: number, hoehe: number): Bild {
  const aus = neuesBild(breite, hoehe)
  for (let zeile = 0; zeile < hoehe; zeile++) {
    const von = ((y + zeile) * b.breite + x) * 4
    aus.daten.set(b.daten.subarray(von, von + breite * 4), zeile * breite * 4)
  }
  return aus
}

function helligkeit(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
}

/**
 * Schätzt das Papier unter der Schrift: Das Bild wird in Kacheln geteilt, je Kachel zählt die helle Seite
 * (85. Perzentil der Helligkeit); Kacheln voller Tinte leihen sich das Papier der Nachbarn, dann wird weich
 * ineinander übergeblendet. So stört ein Schatten oder Lichtverlauf auf dem Foto nicht.
 */
function papierHelligkeit(b: Bild): Float32Array {
  const kachel = Math.max(6, Math.round(Math.min(b.breite, b.hoehe) / 24))
  const gx = Math.ceil(b.breite / kachel)
  const gy = Math.ceil(b.hoehe / kachel)
  let raster = new Float32Array(gx * gy)
  for (let ky = 0; ky < gy; ky++) {
    for (let kx = 0; kx < gx; kx++) {
      const werte: number[] = []
      for (let y = ky * kachel; y < Math.min(b.hoehe, (ky + 1) * kachel); y += 2) {
        for (let x = kx * kachel; x < Math.min(b.breite, (kx + 1) * kachel); x += 2) werte.push(helligkeit(b.daten, (y * b.breite + x) * 4))
      }
      werte.sort((p, q) => p - q)
      raster[ky * gx + kx] = werte[Math.floor((werte.length - 1) * 0.85)] ?? 255
    }
  }
  // Tinte überbrücken: zweimal das Maximum der Nachbarschaft, dann weichzeichnen
  const nachbarn = (r: Float32Array, f: (a: number, c: number) => number, start: number) => {
    const aus = new Float32Array(r.length)
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        let w = start
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = clamp(x + dx, 0, gx - 1)
            const ny = clamp(y + dy, 0, gy - 1)
            w = f(w, r[ny * gx + nx])
          }
        }
        aus[y * gx + x] = w
      }
    }
    return aus
  }
  raster = nachbarn(raster, Math.max, 0)
  raster = nachbarn(raster, Math.max, 0)
  raster = nachbarn(raster, (a, c) => a + c / 9, 0)
  // Pixelgenau mit bilinearer Mischung
  const papier = new Float32Array(b.breite * b.hoehe)
  for (let y = 0; y < b.hoehe; y++) {
    const fy = clamp(y / kachel - 0.5, 0, gy - 1)
    const y0 = Math.floor(fy)
    const y1 = Math.min(gy - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < b.breite; x++) {
      const fx = clamp(x / kachel - 0.5, 0, gx - 1)
      const x0 = Math.floor(fx)
      const x1 = Math.min(gx - 1, x0 + 1)
      const tx = fx - x0
      const oben = raster[y0 * gx + x0] * (1 - tx) + raster[y0 * gx + x1] * tx
      const unten = raster[y1 * gx + x0] * (1 - tx) + raster[y1 * gx + x1] * tx
      papier[y * b.breite + x] = oben * (1 - ty) + unten * ty
    }
  }
  return papier
}

const weich = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Macht aus einem Foto eine Unterschrift mit durchsichtigem Hintergrund: Je dunkler ein Pixel gegenüber dem
 * Papier an dieser Stelle, desto undurchsichtiger wird es. Das Papier (auch grau oder schattig) verschwindet,
 * die Tinte behält ihren Farbton (oder wird einheitlich dunkel). Das Eingangsbild bleibt unverändert.
 */
export function stelleFrei(b: Bild, opt: FreistellOptionen = STANDARD_FREISTELLEN): Bild {
  const papier = papierHelligkeit(b)
  const unten = 0.26 - 0.0023 * clamp(opt.empfindlichkeit, 0, 100)
  const oben = unten + 0.22
  const aus = neuesBild(b.breite, b.hoehe)
  for (let p = 0; p < b.breite * b.hoehe; p++) {
    const i = p * 4
    const lum = helligkeit(b.daten, i)
    const unterschied = 1 - lum / Math.max(papier[p], 1)
    let alpha = weich(unten, oben, unterschied)
    if (alpha < 0.06) alpha = 0
    if (b.daten[i + 3] < 255) alpha *= b.daten[i + 3] / 255 // schon durchsichtige Stellen bleiben es
    if (opt.farbe === 'schwarz' || lum < 1) {
      aus.daten[i] = 16
      aus.daten[i + 1] = 33
      aus.daten[i + 2] = 61
    } else {
      // Farbton behalten, aber höchstens mittlere Helligkeit (Tinte soll dunkel wirken, wie auf Papier)
      const f = lum > 80 ? 80 / lum : 1
      aus.daten[i] = b.daten[i] * f
      aus.daten[i + 1] = b.daten[i + 1] * f
      aus.daten[i + 2] = b.daten[i + 2] * f
    }
    aus.daten[i + 3] = Math.round(alpha * 255)
  }
  return aus
}

/** Rechteck um alle Pixel mit Deckkraft über `schwelle`; `undefined`, wenn nichts da ist. */
export function inhaltsRechteck(b: Bild, schwelle = 40): { x: number; y: number; breite: number; hoehe: number } | undefined {
  let x0 = b.breite
  let y0 = b.hoehe
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < b.hoehe; y++) {
    for (let x = 0; x < b.breite; x++) {
      if (b.daten[(y * b.breite + x) * 4 + 3] > schwelle) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return undefined
  return { x: x0, y: y0, breite: x1 - x0 + 1, hoehe: y1 - y0 + 1 }
}

/** Schneidet eng um die Schrift (mit etwas Luft). Ohne Schrift bleibt das Bild, wie es ist. */
export function schneideAufSchrift(b: Bild, luft = 0.04): Bild {
  const r = inhaltsRechteck(b)
  if (!r) return b
  const rand = Math.round(Math.max(r.breite, r.hoehe) * luft) + 1
  const x = Math.max(0, r.x - rand)
  const y = Math.max(0, r.y - rand)
  return schneideAus(b, x, y, Math.min(b.breite, r.x + r.breite + rand) - x, Math.min(b.hoehe, r.y + r.hoehe + rand) - y)
}

/**
 * Verkleinert auf höchstens `maxBreite` × `maxHoehe` (Seitenverhältnis bleibt, nie vergrößert) – gemittelt über
 * die Quellpixel, mit vormultiplizierter Deckkraft, damit an den Rändern kein heller Saum entsteht.
 */
export function verkleinere(b: Bild, maxBreite: number, maxHoehe: number): Bild {
  const faktor = Math.min(1, maxBreite / b.breite, maxHoehe / b.hoehe)
  if (faktor >= 1) return b
  const w = Math.max(1, Math.round(b.breite * faktor))
  const h = Math.max(1, Math.round(b.hoehe * faktor))
  const aus = neuesBild(w, h)
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * b.hoehe) / h)
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * b.hoehe) / h))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * b.breite) / w)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * b.breite) / w))
      let r = 0
      let g = 0
      let bl = 0
      let a = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * b.breite + sx) * 4
          const al = b.daten[i + 3]
          r += b.daten[i] * al
          g += b.daten[i + 1] * al
          bl += b.daten[i + 2] * al
          a += al
          n++
        }
      }
      const o = (y * w + x) * 4
      if (a > 0) {
        aus.daten[o] = r / a
        aus.daten[o + 1] = g / a
        aus.daten[o + 2] = bl / a
      }
      aus.daten[o + 3] = a / n
    }
  }
  return aus
}
