/**
 * Kamera der 3D-Ansicht (Beta 4, Paket 5) – Umlaufbahn um die Mitte des Modells, reine Rechnung ohne DOM.
 * Eine Berührung/Maustaste dreht, zwei Finger bzw. das Mausrad zoomen (Ansicht.tsx liest die Zeiger und ruft diese Funktionen).
 */

export interface Kamera3D {
  /** Drehung um die senkrechte Achse in Radiant (0 = Blick von vorn, +z nach hinten). */
  azimut: number
  /** Höhenwinkel über dem Boden in Radiant (0 = waagerecht, π/2 = von oben). */
  hoehenwinkel: number
  /** Abstand zur Mitte in m. */
  abstand: number
}

export const SICHTFELD_GRAD = 40
export const MIN_HOEHENWINKEL = 0.03
export const MAX_HOEHENWINKEL = Math.PI / 2 - 0.02
/** Drehung je Pixel Fingerweg. */
export const DREH_PRO_PIXEL = 0.008

const klemme = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x))

/** Abstand, bei dem eine Kugel mit `radius` (m) bei diesem Seitenverhältnis (Breite/Höhe) ganz ins Bild passt. */
export function passenderAbstand(radius: number, seitenverhaeltnis: number): number {
  const halb = (SICHTFELD_GRAD * Math.PI) / 360
  const vertikal = radius / Math.sin(halb)
  const horizontal = radius / (Math.sin(Math.atan(Math.tan(halb) * Math.max(0.3, seitenverhaeltnis))))
  return Math.max(vertikal, horizontal) * 1.08
}

export function startKamera(radius: number, seitenverhaeltnis: number): Kamera3D {
  return { azimut: Math.PI / 5, hoehenwinkel: 0.5, abstand: passenderAbstand(Math.max(radius, 1), seitenverhaeltnis) }
}

export function abstandsgrenzen(radius: number): { min: number; max: number } {
  return { min: Math.max(radius * 0.7, 1.5), max: Math.max(radius, 1) * 12 }
}

export function dreheKamera(k: Kamera3D, dx: number, dy: number): Kamera3D {
  return {
    ...k,
    azimut: k.azimut - dx * DREH_PRO_PIXEL,
    hoehenwinkel: klemme(k.hoehenwinkel + dy * DREH_PRO_PIXEL, MIN_HOEHENWINKEL, MAX_HOEHENWINKEL),
  }
}

/** Faktor > 1 = hineinzoomen (Abstand schrumpft). */
export function zoomeKamera(k: Kamera3D, faktor: number, radius: number): Kamera3D {
  if (!(faktor > 0) || !Number.isFinite(faktor)) return k
  const g = abstandsgrenzen(radius)
  return { ...k, abstand: klemme(k.abstand / faktor, g.min, g.max) }
}

/** Kameraposition (x, y, z) in m, Blick auf den Ursprung. */
export function kameraPosition(k: Kamera3D): [number, number, number] {
  const c = Math.cos(k.hoehenwinkel)
  return [k.abstand * c * Math.sin(k.azimut), k.abstand * Math.sin(k.hoehenwinkel), k.abstand * c * Math.cos(k.azimut)]
}
