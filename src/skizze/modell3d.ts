/**
 * 3D-Modell der Laube (Beta 4, Paket 5) – reine Rechnung ohne three.js und ohne DOM.
 *
 * Aus dem Grundriss (`GrundrissDaten`: Polygone in Metern, Höhe, Dachform) entstehen Dreiecke für Wände und Dach
 * sowie Kantenlinien. Die Ansicht (`Ansicht3D.tsx`, wird erst bei Bedarf nachgeladen) schiebt die Zahlen nur in
 * three.js. Nur Ansicht: nichts davon fließt in Bewertung oder Export.
 *
 * Koordinaten: x nach rechts, y nach oben (Höhe über dem Fußboden), z nach vorn (= y des Grundrisses), Meter,
 * Mittelpunkt aller Teile im Ursprung. Dreiecke stehen unindiziert in einer Zahlenliste (x, y, z, x, y, z …).
 * Das Dach folgt derselben Rechnung wie die Kubatur (`massenAusFlaeche`): Pultdach linear von der niedrigen zur
 * hohen Wand, Satteldach mit First in der Mitte der kürzeren Seite (Dachneigung quer zur längsten Kante).
 */
import type { Bauteil, BauteilArt } from '@/model'
import { umgebendesRechteck, abstandG, type Dachform, type GPunkt, type GrundrissDaten, type GrundrissTeil } from './grundriss'

/** Höhe, die die Ansicht annimmt, wenn der Grundriss keine nennt (nur Darstellung, mit Hinweis). */
export const STANDARD_HOEHE_M = 2.2

export type TeilArt3D = BauteilArt

/** Farben je Bauteilart – nur Werte aus dem App-Design (`src/design/tokens.css`) und ihre Abtönungen. */
export interface Farben3D {
  wand: string
  dach: string
  /** Deckkraft 0–1 (Glas, Keller). */
  deckkraft: number
}

export const FARBEN_3D: Record<TeilArt3D, Farben3D> = {
  laube: { wand: '#e7efe9', dach: '#2e6640', deckkraft: 1 }, // --farbe-akzent-hell / --farbe-akzent
  anbau: { wand: '#cddfd3', dach: '#4f8a63', deckkraft: 1 },
  schuppen: { wand: '#e3e3e1', dach: '#4d4d4d', deckkraft: 1 }, // --farbe-linie / --farbe-text-2
  gewaechshaus: { wand: '#c5d6f1', dach: '#9db9e4', deckkraft: 0.55 }, // Ton von --farbe-fokus
  vorplatz: { wand: '#f3f3f2', dach: '#8a8a87', deckkraft: 1 }, // --farbe-flaeche / --farbe-rand
  keller: { wand: '#8a8a87', dach: '#8a8a87', deckkraft: 0.4 },
}

/** Farbe des Bodenrasters und der Kantenlinien. */
export const FARBE_RASTER = '#e3e3e1' // --farbe-linie
export const FARBE_KANTE = '#111111' // --farbe-text

export const ART_TEXT_3D: Record<TeilArt3D, string> = {
  laube: 'Laube',
  anbau: 'Anbau',
  schuppen: 'Schuppen',
  gewaechshaus: 'Gewächshaus',
  vorplatz: 'Laubenvorplatz',
  keller: 'Keller',
}

export interface Teil3D {
  id: string
  kuerzel: string
  art: TeilArt3D
  farben: Farben3D
  dachform: Dachform
  /** Dreiecke der Wände (x, y, z je Ecke). */
  wand: number[]
  /** Dreiecke des Dachs bzw. beim Keller der Bodenplatte. */
  dach: number[]
  /** Linienpaare (Umriss, Ecken, First): x, y, z, x, y, z. */
  kanten: number[]
  /** Höchster Punkt in m (Keller: 0). */
  hoechsterPunkt: number
  /** Tiefster Punkt in m (nur Keller: negativ). */
  tiefsterPunkt: number
  hinweise: string[]
}

export interface Modell3D {
  teile: Teil3D[]
  /** Mittelpunkt des Grundrisses in Grundriss-Koordinaten (zum Zurückrechnen). */
  mitte: GPunkt
  /** Halbe Ausdehnung, die alles umschließt (Kugelradius um den Ursprung auf Fußbodenhöhe), in m. */
  radius: number
  hoechsterPunkt: number
  tiefsterPunkt: number
  /** Hinweise zur Ansicht (fehlende Höhen …), je mit Kürzel. */
  hinweise: string[]
}

/** Art des Teils: vom verknüpften Bauteil, sonst aus Kürzel bzw. „gestrichelt“ (Keller). */
export function artVon(teil: GrundrissTeil, bauteile: ReadonlyArray<Pick<Bauteil, 'id' | 'art'>> = []): TeilArt3D {
  const b = teil.bauteilId ? bauteile.find((x) => x.id === teil.bauteilId) : undefined
  if (b) return b.art
  const k = (teil.kuerzel || '').trim().toUpperCase()
  if (teil.gestrichelt || k === 'K') return 'keller'
  if (k.startsWith('A')) return 'anbau'
  if (k.startsWith('GWH')) return 'gewaechshaus'
  if (k.startsWith('Ü') || k.startsWith('UE')) return 'vorplatz'
  if (k === 'S' || k === 'U' || /^[SU]\d/.test(k)) return 'schuppen'
  return 'laube'
}

// ---------------------------------------------------------------------------
// Dreiecke
// ---------------------------------------------------------------------------

const EPS = 1e-9

/** Fläche des Polygons mit Vorzeichen (> 0: gegen den Uhrzeigersinn in x/y des Grundrisses). */
function vorzeichenFlaeche(p: readonly GPunkt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

const kreuz = (a: GPunkt, b: GPunkt, c: GPunkt): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

function imDreieck(p: GPunkt, a: GPunkt, b: GPunkt, c: GPunkt): boolean {
  const d1 = kreuz(a, b, p)
  const d2 = kreuz(b, c, p)
  const d3 = kreuz(c, a, p)
  const neg = d1 < -EPS || d2 < -EPS || d3 < -EPS
  const pos = d1 > EPS || d2 > EPS || d3 > EPS
  return !(neg && pos)
}

/** Ohrenschneiden: zerlegt ein einfaches Polygon (konvex oder nicht, beliebige Richtung) in Dreiecke. */
export function trianguliere(punkte: readonly GPunkt[]): [GPunkt, GPunkt, GPunkt][] {
  const n = punkte.length
  if (n < 3) return []
  const ccw = vorzeichenFlaeche(punkte) >= 0
  const idx = punkte.map((_p, i) => i)
  const aus: [GPunkt, GPunkt, GPunkt][] = []
  let schutz = n * n + 10
  while (idx.length > 3 && schutz-- > 0) {
    let geschnitten = false
    for (let k = 0; k < idx.length; k++) {
      const a = punkte[idx[(k + idx.length - 1) % idx.length]]
      const b = punkte[idx[k]]
      const c = punkte[idx[(k + 1) % idx.length]]
      const k3 = kreuz(a, b, c)
      if (ccw ? k3 <= EPS : k3 >= -EPS) continue // reflex oder entartet
      const enthaelt = idx.some((j) => {
        const p = punkte[j]
        return p !== a && p !== b && p !== c && imDreieck(p, a, b, c)
      })
      if (enthaelt) continue
      aus.push([a, b, c])
      idx.splice(k, 1)
      geschnitten = true
      break
    }
    if (!geschnitten) break // entartet (z. B. sich selbst schneidend): Rest als Fächer
  }
  if (idx.length >= 3) {
    for (let k = 1; k < idx.length - 1; k++) aus.push([punkte[idx[0]], punkte[idx[k]], punkte[idx[k + 1]]])
  }
  return aus
}

// ---------------------------------------------------------------------------
// Ein Teil
// ---------------------------------------------------------------------------

interface HoehenFunktion {
  /** Höhe über dem Fußboden an einem Grundrisspunkt. */
  hoehe: (p: GPunkt) => number
  /** Vorzeichenbehafteter Abstand zur Firstlinie (nur Satteldach), sonst undefined. */
  firstAbstand?: (p: GPunkt) => number
}

function hoehenFunktion(punkte: readonly GPunkt[], dachform: Dachform, unten: number, oben: number): HoehenFunktion {
  if (dachform === 'flach' || Math.abs(oben - unten) < EPS) return { hoehe: () => unten }
  // Längste Kante = Laufrichtung u; die Dachneigung läuft quer dazu (v)
  let besteLaenge = -1
  let u: GPunkt = { x: 1, y: 0 }
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[(i + 1) % punkte.length]
    const l = abstandG(a, b)
    if (l > besteLaenge + EPS) {
      besteLaenge = l
      u = { x: (b.x - a.x) / (l || 1), y: (b.y - a.y) / (l || 1) }
    }
  }
  const vVon = (p: GPunkt): number => -p.x * u.y + p.y * u.x
  const vs = punkte.map(vVon)
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const spanne = vMax - vMin || 1
  if (dachform === 'pult') return { hoehe: (p) => unten + ((oben - unten) * (vVon(p) - vMin)) / spanne }
  const vMitte = (vMin + vMax) / 2
  const halb = spanne / 2
  return {
    hoehe: (p) => unten + (oben - unten) * (1 - Math.min(1, Math.abs(vVon(p) - vMitte) / halb)),
    firstAbstand: (p) => vVon(p) - vMitte,
  }
}

type P3 = [number, number, number]

const schiebe = (liste: number[], ...ps: P3[]): void => {
  for (const p of ps) liste.push(p[0], p[1], p[2])
}

/** Dreieck an der Firstlinie schneiden; liefert die Teilpolygone (je Seite) mit dem Schnittpunkt als Ecke. */
function schneideDreieck(tri: [GPunkt, GPunkt, GPunkt], abstand: (p: GPunkt) => number): GPunkt[][] {
  const ds = tri.map(abstand)
  const seiten: GPunkt[][] = [[], []] // [>= 0, <= 0]
  for (let i = 0; i < 3; i++) {
    const a = tri[i]
    const b = tri[(i + 1) % 3]
    const da = ds[i]
    const db = ds[(i + 1) % 3]
    if (da >= -EPS) seiten[0].push(a)
    if (da <= EPS) seiten[1].push(a)
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db)
      const s = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      seiten[0].push(s)
      seiten[1].push(s)
    }
  }
  return seiten.filter((s) => s.length >= 3)
}

/** Baut Wände, Dach und Kanten eines Teils. `mitte` verschiebt in den Ursprung. */
export function baueTeil3D(teil: GrundrissTeil, art: TeilArt3D, kuerzel: string, mitte: GPunkt): Teil3D {
  const hinweise: string[] = []
  const punkte = teil.punkte
  const farben = FARBEN_3D[art]
  const wand: number[] = []
  const dach: number[] = []
  const kanten: number[] = []
  const keller = art === 'keller'

  const h = teil.hoehe && teil.hoehe > 0 ? teil.hoehe : undefined
  if (h === undefined) hinweise.push(`Höhe fehlt – die Ansicht nimmt ${String(STANDARD_HOEHE_M).replace('.', ',')} m an.`)
  const unten = h ?? STANDARD_HOEHE_M
  let dachform: Dachform = keller ? 'flach' : (teil.dachform ?? 'flach')
  let oben = unten
  if (!keller && dachform !== 'flach') {
    if (teil.hoeheOben && teil.hoeheOben > 0) {
      oben = teil.hoeheOben
      if (oben < unten) {
        // „niedrige/hohe Wand“ bzw. First unter Traufe: die Ansicht stellt trotzdem dar, was eingetragen ist
        if (dachform === 'sattel') {
          hinweise.push('Firsthöhe liegt unter der Traufhöhe – Dach als flach dargestellt.')
          dachform = 'flach'
          oben = unten
        }
      }
    } else {
      hinweise.push(`${dachform === 'pult' ? 'Hohe Wand' : 'Firsthöhe'} fehlt – Dach als flach dargestellt.`)
      dachform = 'flach'
    }
  }

  const p3 = (p: GPunkt, y: number): P3 => [p.x - mitte.x, y, p.y - mitte.y]
  const hf = hoehenFunktion(punkte, dachform, unten, oben)
  const hoeheAn = (p: GPunkt): number => (keller ? 0 : hf.hoehe(p))
  const fuss = keller ? -unten : 0

  // Wände: Kanten an der Firstlinie teilen (Giebel), jedes Stück ist ein Viereck
  let hoechster = 0
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[(i + 1) % punkte.length]
    const stuetz: GPunkt[] = [a]
    if (hf.firstAbstand && !keller) {
      const da = hf.firstAbstand(a)
      const db = hf.firstAbstand(b)
      if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
        const t = da / (da - db)
        stuetz.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      }
    }
    stuetz.push(b)
    for (let k = 0; k < stuetz.length - 1; k++) {
      const p = stuetz[k]
      const q = stuetz[k + 1]
      const hp = hoeheAn(p)
      const hq = hoeheAn(q)
      hoechster = Math.max(hoechster, hp, hq)
      schiebe(wand, p3(p, fuss), p3(q, fuss), p3(q, hq), p3(p, fuss), p3(q, hq), p3(p, hp))
      schiebe(kanten, p3(p, fuss), p3(q, fuss), p3(p, hp), p3(q, hq))
    }
    schiebe(kanten, p3(a, fuss), p3(a, hoeheAn(a)))
  }

  // Dach (Keller: Bodenplatte), Dreieck für Dreieck; Satteldach an der Firstlinie zerlegt
  const dreiecke = trianguliere(punkte)
  for (const tri of dreiecke) {
    if (keller) {
      schiebe(dach, p3(tri[0], fuss), p3(tri[1], fuss), p3(tri[2], fuss))
      continue
    }
    const teile = hf.firstAbstand ? schneideDreieck(tri, hf.firstAbstand) : [[...tri]]
    for (const poly of teile) {
      for (let k = 1; k < poly.length - 1; k++) {
        schiebe(dach, p3(poly[0], hoeheAn(poly[0])), p3(poly[k], hoeheAn(poly[k])), p3(poly[k + 1], hoeheAn(poly[k + 1])))
      }
      if (hf.firstAbstand) {
        // First: Kante des Teilpolygons, deren Enden beide auf der Firstlinie liegen
        for (let k = 0; k < poly.length; k++) {
          const p = poly[k]
          const q = poly[(k + 1) % poly.length]
          if (Math.abs(hf.firstAbstand(p)) < 1e-6 && Math.abs(hf.firstAbstand(q)) < 1e-6 && abstandG(p, q) > 1e-6) {
            schiebe(kanten, p3(p, hoeheAn(p)), p3(q, hoeheAn(q)))
          }
        }
      }
    }
  }

  return {
    id: teil.id,
    kuerzel,
    art,
    farben,
    dachform,
    wand,
    dach,
    kanten,
    hoechsterPunkt: hoechster,
    tiefsterPunkt: keller ? -unten : 0,
    hinweise,
  }
}

// ---------------------------------------------------------------------------
// Gesamtmodell
// ---------------------------------------------------------------------------

export function baueModell3D(daten: GrundrissDaten, bauteile: ReadonlyArray<Pick<Bauteil, 'id' | 'art' | 'kuerzel'>> = []): Modell3D {
  const gueltig = daten.teile.filter((t) => t.punkte.length >= 3)
  if (!gueltig.length) return { teile: [], mitte: { x: 0, y: 0 }, radius: 0, hoechsterPunkt: 0, tiefsterPunkt: 0, hinweise: [] }

  const alle = gueltig.flatMap((t) => t.punkte)
  const r = umgebendesRechteck(alle)
  const mitte: GPunkt = { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 }

  const teile = gueltig.map((t) => {
    const b = t.bauteilId ? bauteile.find((x) => x.id === t.bauteilId) : undefined
    const kuerzel = (b?.kuerzel || t.kuerzel || '?').trim()
    return baueTeil3D(t, artVon(t, bauteile), kuerzel, mitte)
  })
  const hoechster = Math.max(...teile.map((t) => t.hoechsterPunkt))
  const tiefster = Math.min(...teile.map((t) => t.tiefsterPunkt))
  const radius = Math.max(Math.hypot(r.x2 - r.x1, r.y2 - r.y1) / 2, hoechster, -tiefster, 1)
  return {
    teile,
    mitte,
    radius,
    hoechsterPunkt: hoechster,
    tiefsterPunkt: tiefster,
    hinweise: teile.flatMap((t) => t.hinweise.map((h) => `${t.kuerzel}: ${h}`)),
  }
}

/** Rauminhalt unter dem Dach in m³ aus den Dreiecken (Prüfung gegen die Kubatur der Massenberechnung). */
export function rauminhaltAusDach(teil: Pick<Teil3D, 'dach' | 'art'>): number {
  if (teil.art === 'keller') return 0
  const d = teil.dach
  let v = 0
  for (let i = 0; i + 8 < d.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = d.slice(i, i + 9)
    const flaecheXZ = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2
    v += (flaecheXZ * (ay + by + cy)) / 3
  }
  return v
}
