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
 * Walm-, Krüppelwalm- und Mansarddach (Beta 6, Paket 2) sind stückweise linear in einem Rahmen aus längster Kante
 * (u) und Quer­richtung (v) des umgebenden Rechtecks; Dreiecke werden an allen Knicklinien zerlegt. Das Zeltdach
 * ist ein Fächer aus Dreiecken zur Spitze über dem Schwerpunkt.
 */
import type { Bauteil, BauteilArt } from '@/model'
import { umgebendesRechteck, abstandG, pruefeDach, schwerpunktVon, hoehenTexte, type DachMasse, type Dachform, type GPunkt, type GrundrissDaten, type GrundrissTeil } from './grundriss'

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
  /** Knicklinien des Daches als vorzeichenbehaftete Abstände (Nulldurchgang = Linie): First, Grate, Knick. */
  knicke: ((p: GPunkt) => number)[]
  /** Nur Zeltdach: Spitze über dem Schwerpunkt (Dreiecksfächer statt Höhenfunktion). */
  spitze?: GPunkt
  /** Dachform, die tatsächlich dargestellt wird (Satteldach, wenn Zusatzmaße fehlen). */
  form: Dachform
  hinweise: string[]
}

function hoehenFunktion(punkte: readonly GPunkt[], dachform: Dachform, unten: number, oben: number, dach: DachMasse): HoehenFunktion {
  const flach: HoehenFunktion = { hoehe: () => unten, knicke: [], form: 'flach', hinweise: [] }
  if (dachform === 'flach' || Math.abs(oben - unten) < EPS) return flach
  if (dachform === 'zelt') return { ...flach, hoehe: () => unten, spitze: schwerpunktVon(punkte), form: 'zelt' }
  // Längste Kante = Laufrichtung u (Firstrichtung); die Dachneigung läuft quer dazu (v)
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
  const uVon = (p: GPunkt): number => p.x * u.x + p.y * u.y
  const vs = punkte.map(vVon)
  const us = punkte.map(uVon)
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const uMin = Math.min(...us)
  const uMax = Math.max(...us)
  const spanne = vMax - vMin || 1
  if (dachform === 'pult') return { ...flach, hoehe: (p) => unten + ((oben - unten) * (vVon(p) - vMin)) / spanne, form: 'pult' }
  const vMitte = (vMin + vMax) / 2
  const halb = spanne / 2
  const r = oben - unten
  const q = (p: GPunkt) => vVon(p) - vMitte // Abstand von der Firstlinie quer
  const sattel = (hinweise: string[] = []): HoehenFunktion => ({
    hoehe: (p) => unten + r * (1 - Math.min(1, Math.abs(q(p)) / halb)),
    knicke: [q],
    form: 'sattel',
    hinweise,
  })
  if (dachform === 'sattel') return sattel()

  // Länge in u, Breite in v des umgebenden Rechtecks – wie in der Kubatur (längere/kürzere Seite)
  const L = uMax - uMin
  const hinweise: string[] = []
  const p = pruefeDach(dachform, Math.max(L, spanne), Math.min(L, spanne), unten, oben, dach, hinweise)
  if (p.art === 'sattel') return sattel([`${p.grund} – Dach als Satteldach dargestellt.`, ...hinweise])
  // Ebenen, normiert auf Dachhöhe r = 1: Längsseiten g±, Stirnseiten e0 (bei uMin) und e1 (bei uMax)
  const gPlus = (pt: GPunkt) => 1 - q(pt) / halb
  const gMinus = (pt: GPunkt) => 1 + q(pt) / halb
  if (p.art === 'walm' || p.art === 'krueppelwalm') {
    const t = p.tiefe
    if (t < EPS) return sattel(hinweise)
    const unterKante = p.art === 'krueppelwalm' ? (r - p.hoehe) / r : 0
    const steigung = p.art === 'krueppelwalm' ? p.hoehe / r : 1
    const e0 = (pt: GPunkt) => unterKante + (steigung * (uVon(pt) - uMin)) / t
    const e1 = (pt: GPunkt) => unterKante + (steigung * (uMax - uVon(pt))) / t
    const flaechen = [gPlus, gMinus, e0, e1]
    const knicke: ((pt: GPunkt) => number)[] = [q]
    for (let i = 0; i < flaechen.length; i++) {
      for (let j = i + 1; j < flaechen.length; j++) {
        if (i < 2 && j < 2) continue // g+ und g− treffen sich im First (q)
        knicke.push((pt) => flaechen[i](pt) - flaechen[j](pt))
      }
    }
    return {
      hoehe: (pt) => unten + r * Math.min(gPlus(pt), gMinus(pt), e0(pt), e1(pt)),
      knicke,
      form: dachform,
      hinweise,
    }
  }
  // Mansarddach (Giebel senkrecht): Querschnitt mit Knick bei Einzug e von der Traufwand
  const gk = halb - p.einzug // |q| am Knick
  const hk = p.knickHoehe
  return {
    hoehe: (pt) => {
      const sAbs = Math.abs(q(pt))
      return sAbs >= gk ? unten + ((hk - unten) * Math.min(1, (halb - sAbs) / p.einzug)) : hk + ((oben - hk) * (gk - sAbs)) / gk
    },
    knicke: [q, (pt) => q(pt) - gk, (pt) => -q(pt) - gk],
    form: 'mansard',
    hinweise,
  }
}

type P3 = [number, number, number]

const schiebe = (liste: number[], ...ps: P3[]): void => {
  for (const p of ps) liste.push(p[0], p[1], p[2])
}

/** Polygon an einer Linie (Nulldurchgang von `abstand`) schneiden; liefert die Teilpolygone beider Seiten mit den Schnittpunkten als Ecken. */
function schneidePolygon(poly: GPunkt[], abstand: (p: GPunkt) => number): GPunkt[][] {
  const ds = poly.map(abstand)
  if (ds.every((d) => d >= -EPS) || ds.every((d) => d <= EPS)) return [poly] // liegt ganz auf einer Seite
  const seiten: GPunkt[][] = [[], []] // [>= 0, <= 0]
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const da = ds[i]
    const db = ds[(i + 1) % n]
    if (da >= -EPS) seiten[0].push(a)
    if (da <= EPS) seiten[1].push(a)
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db)
      const sp = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      seiten[0].push(sp)
      seiten[1].push(sp)
    }
  }
  return seiten.filter((sd) => sd.length >= 3 && Math.abs(vorzeichenFlaeche(sd)) > 1e-9)
}

/** Dreieck an allen Knicklinien zerlegen: Jedes Stück liegt danach in einer Dachfläche. */
function zerlege(tri: [GPunkt, GPunkt, GPunkt], knicke: readonly ((p: GPunkt) => number)[]): GPunkt[][] {
  let stuecke: GPunkt[][] = [[...tri]]
  for (const k of knicke) stuecke = stuecke.flatMap((st) => schneidePolygon(st, k))
  return stuecke
}

/** Ist die Dachfläche entlang der Strecke p–q geknickt (Höhenverlauf quer dazu nicht linear)? */
function istKnick(hoehe: (p: GPunkt) => number, p: GPunkt, q: GPunkt): boolean {
  const l = abstandG(p, q)
  if (l < 1e-6) return false
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
  const d = 0.02
  const nx = (-(q.y - p.y) / l) * d
  const ny = ((q.x - p.x) / l) * d
  return Math.abs(hoehe({ x: m.x + nx, y: m.y + ny }) + hoehe({ x: m.x - nx, y: m.y - ny }) - 2 * hoehe(m)) > 1e-4
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
      if (oben < unten && dachform !== 'pult') {
        // „niedrige/hohe Wand“ bzw. First unter Traufe: die Ansicht stellt trotzdem dar, was eingetragen ist
        hinweise.push(`${dachform === 'zelt' ? 'Die Spitze' : 'Die Firsthöhe'} liegt unter der Traufhöhe – Dach als flach dargestellt.`)
        dachform = 'flach'
        oben = unten
      }
    } else {
      hinweise.push(`${hoehenTexte(dachform).oben} fehlt – Dach als flach dargestellt.`)
      dachform = 'flach'
    }
  }

  const p3 = (p: GPunkt, y: number): P3 => [p.x - mitte.x, y, p.y - mitte.y]
  const hf = hoehenFunktion(punkte, dachform, unten, oben, teil)
  dachform = hf.form
  hinweise.push(...hf.hinweise)
  const hoeheAn = (p: GPunkt): number => (keller ? 0 : hf.hoehe(p))
  const fuss = keller ? -unten : 0
  const knicke = keller ? [] : hf.knicke

  // Wände: Kanten an den Knicklinien teilen (Giebel), jedes Stück ist ein Viereck
  let hoechster = 0
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[(i + 1) % punkte.length]
    const ts: number[] = []
    for (const k of knicke) {
      const da = k(a)
      const db = k(b)
      if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) ts.push(da / (da - db))
    }
    ts.sort((x, y) => x - y)
    const stuetz: GPunkt[] = [a]
    for (const t of ts) if (t - 1e-9 > 0) stuetz.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    stuetz.push(b)
    for (let k = 0; k < stuetz.length - 1; k++) {
      const p = stuetz[k]
      const q = stuetz[k + 1]
      if (abstandG(p, q) < 1e-9) continue
      const hp = hoeheAn(p)
      const hq = hoeheAn(q)
      hoechster = Math.max(hoechster, hp, hq)
      schiebe(wand, p3(p, fuss), p3(q, fuss), p3(q, hq), p3(p, fuss), p3(q, hq), p3(p, hp))
      schiebe(kanten, p3(p, fuss), p3(q, fuss), p3(p, hp), p3(q, hq))
    }
    schiebe(kanten, p3(a, fuss), p3(a, hoeheAn(a)))
  }

  // Dach (Keller: Bodenplatte), Dreieck für Dreieck an den Knicklinien zerlegt; Zeltdach als Fächer zur Spitze
  if (hf.spitze && !keller) {
    const spitze = p3(hf.spitze, oben)
    hoechster = Math.max(hoechster, oben)
    for (let i = 0; i < punkte.length; i++) {
      const a = punkte[i]
      const b = punkte[(i + 1) % punkte.length]
      schiebe(dach, p3(a, unten), p3(b, unten), spitze)
      schiebe(kanten, p3(a, unten), spitze)
    }
  } else {
    for (const tri of trianguliere(punkte)) {
      if (keller) {
        schiebe(dach, p3(tri[0], fuss), p3(tri[1], fuss), p3(tri[2], fuss))
        continue
      }
      for (const poly of zerlege(tri, knicke)) {
        for (const pt of poly) hoechster = Math.max(hoechster, hoeheAn(pt)) // Walm-/Zeltdach: der First liegt über allen Wänden
        for (let k = 1; k < poly.length - 1; k++) {
          schiebe(dach, p3(poly[0], hoeheAn(poly[0])), p3(poly[k], hoeheAn(poly[k])), p3(poly[k + 1], hoeheAn(poly[k + 1])))
        }
        // First, Grate, Knick: Kanten des Teilpolygons, die auf einer Knicklinie liegen und wirklich knicken
        for (let k = 0; k < poly.length; k++) {
          const p = poly[k]
          const q = poly[(k + 1) % poly.length]
          if (abstandG(p, q) < 1e-6) continue
          if (knicke.some((kn) => Math.abs(kn(p)) < 1e-6 && Math.abs(kn(q)) < 1e-6) && istKnick(hf.hoehe, p, q)) {
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
