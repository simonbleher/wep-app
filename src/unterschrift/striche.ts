// Gezeichnete Unterschrift: Striche glätten und auf eine Zeichenfläche malen.
//
// Reine Rechnung ohne Oberfläche; die Zeichenfläche kommt als `Zeichner` herein (CanvasRenderingContext2D
// im Browser, @napi-rs/canvas in den Tests). Koordinaten sind auf die Breite der Fläche normiert
// (x und y in Breiten), damit eine Unterschrift bei jeder Fensterbreite gleich aussieht.

export interface Punkt {
  x: number
  y: number
  /** Stiftdruck 0–1 (Stift); Finger und Maus melden keinen. */
  druck?: number
}

export type Strich = Punkt[]

/** Der Teil der Canvas-Schnittstelle, den das Malen braucht. */
export interface Zeichner {
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  lineWidth: number
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  beginPath(): void
  moveTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  stroke(): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  fill(): void
}

/** Stiftbreite als Anteil der Flächenbreite (bei 900 px Breite etwa 3 px). */
export const STIFT_BREITE = 0.0035
/** Dunkles Blauschwarz wie ein Kugelschreiber; im PDF gut lesbar, auch bei schlechtem Druck. */
export const STIFT_FARBE = '#10213d'

/**
 * Glättet die Eingabe leicht (gleitender Mittelwert): Fingerzittern und die Treppen der Maus
 * verschwinden, Anfang und Ende des Strichs bleiben, wo sie sind.
 */
export function glaetteEingabe(vorher: Punkt | undefined, neu: Punkt, staerke = 0.55): Punkt {
  if (!vorher) return neu
  const a = Math.min(Math.max(staerke, 0), 0.95)
  return {
    x: vorher.x + (neu.x - vorher.x) * (1 - a),
    y: vorher.y + (neu.y - vorher.y) * (1 - a),
    druck: neu.druck,
  }
}

/** Entfernt Punkte, die weniger als `abstand` vom letzten behaltenen entfernt liegen (der letzte bleibt immer). */
export function duenneAus(strich: Strich, abstand = 0.0015): Strich {
  if (strich.length < 3) return strich
  const aus: Strich = [strich[0]]
  for (let i = 1; i < strich.length - 1; i++) {
    const l = aus[aus.length - 1]
    if (Math.hypot(strich[i].x - l.x, strich[i].y - l.y) >= abstand) aus.push(strich[i])
  }
  aus.push(strich[strich.length - 1])
  return aus
}

export interface Segment {
  von: Punkt
  /** Steuerpunkt der Kurve. */
  steuer: Punkt
  bis: Punkt
  /** Breite in Anteilen der Flächenbreite. */
  breite: number
}

const mitte = (a: Punkt, b: Punkt): Punkt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Wandelt einen Strich in glatte Kurvenstücke um: Die Eingabepunkte sind Steuerpunkte, die Kurve läuft
 * zwischen den Mitten benachbarter Punkte (quadratische Bézier-Kurven, ohne Knicke). Die Breite folgt
 * dem Stiftdruck, sonst der Geschwindigkeit (schnell = dünner), so wirkt die Linie wie mit echtem Stift.
 */
export function strichSegmente(strich: Strich, basisBreite = STIFT_BREITE): Segment[] {
  if (strich.length < 2) return []
  const punkte = duenneAus(strich)
  const breiten: number[] = []
  let weich = basisBreite
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i]
    let ziel = basisBreite
    if (p.druck !== undefined && p.druck > 0) {
      ziel = basisBreite * (0.5 + p.druck * 1.1)
    } else if (i > 0) {
      const v = Math.hypot(p.x - punkte[i - 1].x, p.y - punkte[i - 1].y)
      ziel = basisBreite * Math.min(1.25, Math.max(0.6, 1.25 - v * 25))
    }
    weich += (ziel - weich) * 0.35
    breiten.push(weich)
  }
  if (punkte.length === 2) {
    return [{ von: punkte[0], steuer: mitte(punkte[0], punkte[1]), bis: punkte[1], breite: breiten[1] }]
  }
  const segmente: Segment[] = []
  let start = punkte[0]
  for (let i = 1; i < punkte.length - 1; i++) {
    const ende = mitte(punkte[i], punkte[i + 1])
    segmente.push({ von: start, steuer: punkte[i], bis: ende, breite: breiten[i] })
    start = ende
  }
  const letzter = punkte[punkte.length - 1]
  segmente.push({ von: start, steuer: mitte(start, letzter), bis: letzter, breite: breiten[breiten.length - 1] })
  return segmente
}

/** Malt alle Striche. `breite` ist die Breite der Fläche in Pixeln. Ein einzelner Punkt wird ein Tupfer. */
export function malStriche(z: Zeichner, striche: Strich[], breite: number, farbe = STIFT_FARBE, basis = STIFT_BREITE): void {
  z.lineCap = 'round'
  z.lineJoin = 'round'
  z.strokeStyle = farbe
  z.fillStyle = farbe
  for (const s of striche) {
    if (s.length === 0) continue
    if (s.length === 1 || (s.length === 2 && s[0].x === s[1].x && s[0].y === s[1].y)) {
      z.beginPath()
      z.arc(s[0].x * breite, s[0].y * breite, (basis * breite) / 2, 0, Math.PI * 2)
      z.fill()
      continue
    }
    for (const g of strichSegmente(s, basis)) {
      z.lineWidth = Math.max(1, g.breite * breite)
      z.beginPath()
      z.moveTo(g.von.x * breite, g.von.y * breite)
      z.quadraticCurveTo(g.steuer.x * breite, g.steuer.y * breite, g.bis.x * breite, g.bis.y * breite)
      z.stroke()
    }
  }
}

/** Gibt es etwas zu speichern? (Mindestens ein Strich mit Länge.) */
export function hatInhalt(striche: Strich[]): boolean {
  return striche.some((s) => s.length > 1 && s.some((p) => p.x !== s[0].x || p.y !== s[0].y))
}
