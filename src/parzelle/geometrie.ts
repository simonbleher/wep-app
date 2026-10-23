/**
 * Form der Parzelle in Metern aus den Eingaben (Beta 6, Paket 1) – reine Rechnung ohne DOM.
 *
 * - Rechteck: Länge × Breite.
 * - Freie Form: Jede Seite ist eingetippt; zusätzlich braucht ein Viereck eine Diagonale (oder einen Winkel), ein
 *   Fünfeck zwei usw. (n − 3). Aus den bekannten Längen setzt `loese` die Ecken Dreieck für Dreieck zusammen
 *   (Dreieck aus drei Seiten). Zu jedem Dreieck gibt es zwei Spiegelbilder; die grob gezeichneten Ecken
 *   entscheiden, welches gemeint ist. Passen mit den eingetippten Maßen auch andere Formen (z. B. ein Viereck, das
 *   an der Diagonale nach innen statt nach außen knickt), meldet die Lösung `mehrdeutig`.
 * - Fehlt etwas, sagt `fehlt`, was: fehlende Seiten und die Diagonalen, mit denen die Form eindeutig wird.
 *
 * Nichts wird gesperrt: Eine unmögliche oder sich überschneidende Form ergibt Hinweise, keine Fehler.
 */
import type { Parzelle, ParzellePunkt } from './types'
import { eckenName } from './types'

export type GPunkt = ParzellePunkt

const EPS = 1e-9
/** Eine eingetippte Länge gilt als verletzt, wenn die Form mehr als dies (m) und mehr als `TOLERANZ_ANTEIL` abweicht. */
const TOLERANZ_M = 0.1
const TOLERANZ_ANTEIL = 0.01
/** Großzügigere Grenze für „diese Spiegelung passt auch noch“ (Messungenauigkeit von Maßband und Handeingabe). */
const GRENZE_M = 0.25
const GRENZE_ANTEIL = 0.03
/** Höchstzahl der Ecken, bei der alle Spiegelungen durchprobiert werden (2^(n−3) Möglichkeiten). */
const MAX_ECKEN_PROBE = 14

const rund3 = (n: number) => Math.round(n * 1000) / 1000
const rund2 = (n: number) => Math.round(n * 100) / 100
const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const m = (n: number) => `${DE.format(rund2(n))} m`

export type FehlendArt = 'laenge' | 'breite' | 'seite' | 'diagonale' | 'ecken'

export interface Fehlend {
  art: FehlendArt
  /** Seite oder Diagonale: die beiden Ecken (Index). */
  ecken?: [number, number]
  /** Klartext, z. B. „Seite C–D“ oder „Diagonale A–C“. */
  text: string
  /** Bei einer Diagonale über zwei Seiten: Ecken, an denen statt der Diagonale auch ein Winkel genügt. */
  alternativWinkel?: number[]
}

export type LoesungStatus = 'fertig' | 'unvollstaendig' | 'unmoeglich'

export interface Loesung {
  status: LoesungStatus
  /** Ecken in Metern, so gedreht wie die grobe Zeichnung, links oben (kleinstes x und y) bei (0, 0). Leer, solange nicht `fertig`. */
  punkte: GPunkt[]
  flaeche?: number
  umfang?: number
  /** Ausdehnung der Form (umgebendes Rechteck) in m. */
  breite?: number
  hoehe?: number
  /** Nur bei `unvollstaendig`: was noch fehlt. */
  fehlt: Fehlend[]
  /** Mit den eingetippten Maßen sind mehrere Formen möglich; die grob gezeichneten Ecken haben entschieden. */
  mehrdeutig: boolean
  /** Hinweise (nur Warnungen): überkreuzte Seiten, Angaben, die nicht zusammenpassen … */
  hinweise: string[]
  /** Seitenlängen der berechneten Form (Seite i von Ecke i zu Ecke i+1). */
  seitenlaengen?: number[]
}

const leer = (extra: Partial<Loesung> = {}): Loesung => ({ status: 'unvollstaendig', punkte: [], fehlt: [], mehrdeutig: false, hinweise: [], ...extra })

const positiv = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

// ---------------------------------------------------------------------------
// Grundformeln
// ---------------------------------------------------------------------------

export function flaecheVon(punkte: readonly GPunkt[]): number {
  let s = 0
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i]
    const b = punkte[(i + 1) % punkte.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

const abstand = (a: GPunkt, b: GPunkt) => Math.hypot(b.x - a.x, b.y - a.y)
const kreuz = (o: GPunkt, a: GPunkt, b: GPunkt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Schnittpunkte zweier Kreise um a (Radius ra) und b (Radius rb); leer, wenn es keinen gibt. */
function kreisSchnitt(a: GPunkt, ra: number, b: GPunkt, rb: number): GPunkt[] {
  const d = abstand(a, b)
  if (d < EPS) return []
  // Messungenauigkeit: knapp daneben gilt als „berührt sich“
  const spiel = Math.max(1e-6, 1e-4 * d)
  if (d > ra + rb + spiel || d < Math.abs(ra - rb) - spiel) return []
  const l = (ra * ra - rb * rb + d * d) / (2 * d)
  const h2 = ra * ra - l * l
  const h = h2 > 0 ? Math.sqrt(h2) : 0
  const ex = (b.x - a.x) / d
  const ey = (b.y - a.y) / d
  const mx = a.x + ex * l
  const my = a.y + ey * l
  if (h < 1e-6) return [{ x: mx, y: my }]
  return [
    { x: mx - ey * h, y: my + ex * h },
    { x: mx + ey * h, y: my - ex * h },
  ]
}

function strecken(a: GPunkt, b: GPunkt, c: GPunkt, d: GPunkt): boolean {
  const d1 = kreuz(a, b, c)
  const d2 = kreuz(a, b, d)
  const d3 = kreuz(c, d, a)
  const d4 = kreuz(c, d, b)
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
}

/** Überschneiden sich zwei nicht benachbarte Seiten? */
export function hatUeberschneidung(punkte: readonly GPunkt[]): boolean {
  const n = punkte.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (strecken(punkte[i], punkte[(i + 1) % n], punkte[j], punkte[(j + 1) % n])) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Bekannte Längen
// ---------------------------------------------------------------------------

const schluessel = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`)

interface Bekannt {
  laengen: Map<string, number>
  /** Angaben, die sich nicht auswerten lassen (Winkel ohne die zwei Seiten …). */
  hinweise: string[]
}

/** Sammelt Seiten, Diagonalen und Winkel (Winkel → Diagonale über die Ecke, Kosinussatz). */
function sammleLaengen(p: Parzelle, n: number): Bekannt {
  const laengen = new Map<string, number>()
  const hinweise: string[] = []
  const seiten = p.seiten ?? []
  for (let i = 0; i < n; i++) {
    const v = seiten[i]
    if (positiv(v)) laengen.set(schluessel(i, (i + 1) % n), v)
  }
  for (const d of p.diagonalen ?? []) {
    if (!positiv(d.laenge) || d.von === d.nach || d.von < 0 || d.nach < 0 || d.von >= n || d.nach >= n) continue
    const k = schluessel(d.von, d.nach)
    if (!laengen.has(k)) laengen.set(k, d.laenge)
  }
  for (const w of p.winkel ?? []) {
    if (!(typeof w.grad === 'number' && w.grad > 0 && w.grad < 360) || w.ecke < 0 || w.ecke >= n) continue
    const vor = (w.ecke + n - 1) % n
    const nach = (w.ecke + 1) % n
    const a = laengen.get(schluessel(vor, w.ecke))
    const b = laengen.get(schluessel(w.ecke, nach))
    if (a === undefined || b === undefined) {
      hinweise.push(`Der Winkel an Ecke ${eckenName(w.ecke)} braucht die Seiten ${eckenName(vor)}–${eckenName(w.ecke)} und ${eckenName(w.ecke)}–${eckenName(nach)}.`)
      continue
    }
    const d = Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos((w.grad * Math.PI) / 180)))
    const k = schluessel(vor, nach)
    if (!laengen.has(k)) laengen.set(k, d)
  }
  return { laengen, hinweise }
}

// ---------------------------------------------------------------------------
// Zusammensetzen
// ---------------------------------------------------------------------------

/** Ein Schritt: Ecke k liegt im Abstand da von a und db von b. */
interface Schritt {
  k: number
  a: number
  b: number
  da: number
  db: number
  /** Weitere bereits gesetzte Ecken mit bekanntem Abstand (entscheiden zwischen den zwei Spiegelungen). */
  weitere: { j: number; d: number }[]
  /** Die erste Ecke nach der Grundlinie: ihre Spiegelung vertauscht nur die ganze Form (gleiche Form). */
  erster: boolean
}

interface Plan {
  basis: [number, number]
  basisLaenge: number
  schritte: Schritt[]
  gesetzt: Set<number>
}

/** Reihenfolge, in der sich die Ecken setzen lassen (nur nach der Verknüpfung der bekannten Längen, ohne Koordinaten). */
function plane(n: number, laengen: ReadonlyMap<string, number>): Plan | undefined {
  // Grundlinie: Seite A–B, sonst die erste bekannte Länge
  let basis: [number, number] | undefined
  let basisLaenge = 0
  const erste = laengen.get(schluessel(0, 1))
  if (erste !== undefined) {
    basis = [0, 1]
    basisLaenge = erste
  } else {
    for (const [k, v] of laengen) {
      const [i, j] = k.split('-').map(Number)
      basis = [i, j]
      basisLaenge = v
      break
    }
  }
  if (!basis) return undefined
  const gesetzt = new Set<number>(basis)
  const schritte: Schritt[] = []
  let weiter = true
  while (weiter) {
    weiter = false
    for (let k = 0; k < n; k++) {
      if (gesetzt.has(k)) continue
      const nachbarn = [...gesetzt].filter((j) => laengen.has(schluessel(j, k)))
      if (nachbarn.length < 2) continue
      // Die zwei am weitesten auseinander liegenden Ecken (steht numerisch am sichersten)
      let a = nachbarn[0]
      let b = nachbarn[1]
      let best = -1
      for (let x = 0; x < nachbarn.length; x++) {
        for (let y = x + 1; y < nachbarn.length; y++) {
          const gap = Math.abs(nachbarn[x] - nachbarn[y])
          if (gap > best) {
            best = gap
            a = nachbarn[x]
            b = nachbarn[y]
          }
        }
      }
      schritte.push({
        k,
        a,
        b,
        da: laengen.get(schluessel(a, k))!,
        db: laengen.get(schluessel(b, k))!,
        weitere: nachbarn.filter((j) => j !== a && j !== b).map((j) => ({ j, d: laengen.get(schluessel(j, k))! })),
        erster: schritte.length === 0,
      })
      gesetzt.add(k)
      weiter = true
    }
  }
  return { basis, basisLaenge, schritte, gesetzt }
}

interface Versuch {
  pos: (GPunkt | undefined)[]
  /** Anzahl der Stellen, an denen die Spiegelung mit der groben Zeichnung übereinstimmt. */
  passt: number
  /** Alle Dreiecke ließen sich bilden. */
  gueltig: boolean
  /** Größte Abweichung einer eingetippten Länge zur Form. */
  abweichung: number
}

/**
 * Setzt die Ecken: `wahl[i]` wählt bei Schritt i eine der zwei Spiegelungen; ohne `wahl` gilt für jeden Schritt die,
 * die zur groben Zeichnung passt.
 */
function setze(n: number, plan: Plan, laengen: ReadonlyMap<string, number>, rauh: readonly GPunkt[], wahl?: readonly number[]): Versuch {
  const pos: (GPunkt | undefined)[] = Array.from({ length: n }, () => undefined)
  pos[plan.basis[0]] = { x: 0, y: 0 }
  pos[plan.basis[1]] = { x: plan.basisLaenge, y: 0 }
  let passt = 0
  let gueltig = true
  plan.schritte.forEach((s, idx) => {
    const pa = pos[s.a]!
    const pb = pos[s.b]!
    const kandidaten = kreisSchnitt(pa, s.da, pb, s.db)
    if (!kandidaten.length) {
      gueltig = false
      // Näherung, damit die übrigen Ecken sichtbar bleiben: auf der Verbindung im Verhältnis der Radien
      const t = s.da / Math.max(EPS, s.da + s.db)
      pos[s.k] = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t }
      return
    }
    let wert: GPunkt
    if (kandidaten.length === 1) {
      wert = kandidaten[0]
      passt++
    } else {
      const soll = Math.sign(kreuz(rauh[s.a], rauh[s.b], rauh[s.k]))
      const links = kandidaten.map((c) => Math.sign(kreuz(pa, pb, c)))
      let i = wahl ? wahl[idx] : -1
      if (i < 0) {
        const trefferAnzahl = links.map((l) => (l === soll ? 1 : 0))
        // Dritte bekannte Länge entscheidet vor der groben Zeichnung
        if (s.weitere.length) {
          const fehler = kandidaten.map((c) => s.weitere.reduce((sum, w) => sum + Math.abs(abstand(c, pos[w.j]!) - w.d), 0))
          i = fehler[0] <= fehler[1] ? 0 : 1
        } else {
          i = trefferAnzahl[0] >= trefferAnzahl[1] ? 0 : 1
        }
      }
      wert = kandidaten[i]
      if (links[i] === soll) passt++
    }
    pos[s.k] = wert
  })
  // Abweichung der eingetippten Längen von der Form
  let abweichung = 0
  for (const [k, v] of laengen) {
    const [i, j] = k.split('-').map(Number)
    if (!pos[i] || !pos[j]) continue
    abweichung = Math.max(abweichung, Math.abs(abstand(pos[i]!, pos[j]!) - v))
  }
  return { pos, passt, gueltig, abweichung }
}

const innerhalbGrenze = (ist: number, soll: number, grenzeM: number, anteil: number) => Math.abs(ist - soll) <= Math.max(grenzeM, anteil * soll)

/** Prüft, ob alle bekannten Längen (auch die nicht zum Setzen benutzten) in der Form stimmen. */
function passtZuAllen(pos: readonly (GPunkt | undefined)[], laengen: ReadonlyMap<string, number>): boolean {
  for (const [k, v] of laengen) {
    const [i, j] = k.split('-').map(Number)
    if (!pos[i] || !pos[j]) continue
    if (!innerhalbGrenze(abstand(pos[i]!, pos[j]!), v, GRENZE_M, GRENZE_ANTEIL)) return false
  }
  return true
}

/** Dreht die Form so, dass sie der groben Zeichnung gleicht (kleinste Quadrate), und setzt links oben auf (0, 0). */
function ausrichten(pos: readonly GPunkt[], rauh: readonly GPunkt[]): GPunkt[] {
  const n = pos.length
  const cx = pos.reduce((s, p) => s + p.x, 0) / n
  const cy = pos.reduce((s, p) => s + p.y, 0) / n
  const rx = rauh.reduce((s, p) => s + p.x, 0) / n
  const ry = rauh.reduce((s, p) => s + p.y, 0) / n
  let sinS = 0
  let cosS = 0
  for (let i = 0; i < n; i++) {
    const px = pos[i].x - cx
    const py = pos[i].y - cy
    const qx = rauh[i].x - rx
    const qy = rauh[i].y - ry
    cosS += px * qx + py * qy
    sinS += px * qy - py * qx
  }
  const w = Math.atan2(sinS, cosS)
  const c = Math.cos(w)
  const s = Math.sin(w)
  const gedreht = pos.map((p) => ({ x: (p.x - cx) * c - (p.y - cy) * s, y: (p.x - cx) * s + (p.y - cy) * c }))
  const minX = Math.min(...gedreht.map((p) => p.x))
  const minY = Math.min(...gedreht.map((p) => p.y))
  return gedreht.map((p) => ({ x: rund3(p.x - minX), y: rund3(p.y - minY) }))
}

const gleicheForm = (a: readonly GPunkt[], b: readonly GPunkt[]) => a.every((p, i) => Math.abs(p.x - b[i].x) < 0.02 && Math.abs(p.y - b[i].y) < 0.02)

// ---------------------------------------------------------------------------
// Was fehlt?
// ---------------------------------------------------------------------------

/**
 * Fehlende Seiten und die Diagonalen, mit denen sich die Form eindeutig setzen lässt. Fehlende Längen werden dafür
 * so angenommen, wie sie in der groben Zeichnung aussehen; die Zahl der Diagonalen ist bei lückenlosen Seiten n − 3.
 */
function ermittleFehlendes(n: number, laengen: ReadonlyMap<string, number>, rauh: readonly GPunkt[]): Fehlend[] {
  const fehlt: Fehlend[] = []
  const hyp = new Map(laengen)
  const rauhAbstand = (i: number, j: number) => Math.max(0.01, abstand(rauh[i], rauh[j]))
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    if (hyp.has(schluessel(i, j))) continue
    fehlt.push({ art: 'seite', ecken: [i, j], text: `Seite ${eckenName(i)}–${eckenName(j)}` })
    hyp.set(schluessel(i, j), rauhAbstand(i, j))
  }
  for (let runde = 0; runde < n * n; runde++) {
    const plan = plane(n, hyp)
    if (!plan || plan.gesetzt.size >= n) break
    // Eine nicht gesetzte Ecke mit einem gesetzten Nachbarn: eine zweite Verbindung fehlt
    let k = -1
    for (let x = 0; x < n && k < 0; x++) {
      if (plan.gesetzt.has(x)) continue
      if ([...plan.gesetzt].some((j) => hyp.has(schluessel(j, x)))) k = x
    }
    if (k < 0) break
    const verbunden = new Set([...plan.gesetzt].filter((j) => hyp.has(schluessel(j, k))))
    const kandidaten = [...plan.gesetzt].filter((j) => !verbunden.has(j) && (j + 1) % n !== k && (k + 1) % n !== j)
    if (!kandidaten.length) break
    kandidaten.sort((a, b) => rauhAbstand(k, a) - rauhAbstand(k, b))
    const j = kandidaten[0]
    // Über zwei Seiten hinweg (eine Ecke dazwischen): statt der Diagonale genügt auch der Winkel an dieser Ecke
    const dazwischen: number[] = []
    if ((k + 1) % n === (j + n - 1) % n) dazwischen.push((k + 1) % n)
    if ((j + 1) % n === (k + n - 1) % n) dazwischen.push((j + 1) % n)
    const von = Math.min(k, j)
    const nach = Math.max(k, j)
    fehlt.push({
      art: 'diagonale',
      ecken: [von, nach],
      text: `Diagonale ${eckenName(von)}–${eckenName(nach)}`,
      ...(dazwischen.length ? { alternativWinkel: dazwischen.sort((a, b) => a - b) } : {}),
    })
    hyp.set(schluessel(k, j), rauhAbstand(k, j))
  }
  return fehlt
}

// ---------------------------------------------------------------------------
// Lösen
// ---------------------------------------------------------------------------

/** Wie weit die berechnete Form von einer eingetippten Länge abweicht, als lesbare Hinweise. */
function abweichungsHinweise(pos: readonly GPunkt[], p: Parzelle, n: number): string[] {
  const out: string[] = []
  const pruefe = (i: number, j: number, soll: number, name: string) => {
    const ist = abstand(pos[i], pos[j])
    if (!innerhalbGrenze(ist, soll, TOLERANZ_M, TOLERANZ_ANTEIL)) {
      out.push(`${name}: eingetippt ${m(soll)}, in der Form ${m(ist)} – die Maße passen nicht ganz zusammen, bitte nachmessen.`)
    }
  }
  const seiten = p.seiten ?? []
  for (let i = 0; i < n; i++) if (positiv(seiten[i])) pruefe(i, (i + 1) % n, seiten[i] as number, `Seite ${eckenName(i)}–${eckenName((i + 1) % n)}`)
  for (const d of p.diagonalen ?? []) {
    if (positiv(d.laenge) && d.von !== d.nach && d.von >= 0 && d.nach >= 0 && d.von < n && d.nach < n) {
      pruefe(d.von, d.nach, d.laenge, `Diagonale ${eckenName(d.von)}–${eckenName(d.nach)}`)
    }
  }
  for (const w of p.winkel ?? []) {
    if (!(typeof w.grad === 'number' && w.grad > 0 && w.grad < 360) || w.ecke < 0 || w.ecke >= n) continue
    const vor = pos[(w.ecke + n - 1) % n]
    const hier = pos[w.ecke]
    const nach = pos[(w.ecke + 1) % n]
    const a1 = Math.atan2(vor.y - hier.y, vor.x - hier.x)
    const a2 = Math.atan2(nach.y - hier.y, nach.x - hier.x)
    let grad = (Math.abs(a1 - a2) * 180) / Math.PI
    if (grad > 180) grad = 360 - grad
    const soll = w.grad > 180 ? 360 - w.grad : w.grad
    if (Math.abs(grad - soll) > 2) out.push(`Winkel an Ecke ${eckenName(w.ecke)}: eingetippt ${DE.format(w.grad)}°, in der Form ${DE.format(Math.round(grad * 10) / 10)}°.`)
  }
  return out
}

function loeseFrei(p: Parzelle): Loesung {
  const rauh = p.ecken ?? []
  const n = rauh.length
  if (n < 3) {
    return leer({ fehlt: [{ art: 'ecken', text: 'Mindestens drei Ecken' }] })
  }
  const { laengen, hinweise: winkelHinweise } = sammleLaengen(p, n)
  const plan = plane(n, laengen)
  const unvollst = (): Loesung => leer({ fehlt: ermittleFehlendes(n, laengen, rauh), hinweise: winkelHinweise })
  if (!plan || plan.gesetzt.size < n) return unvollst()

  // Alle Spiegelungen durchprobieren: gibt es mehr als eine passende Form, ist es mehrdeutig
  const zweifach: number[] = []
  plan.schritte.forEach((s, idx) => {
    if (idx === 0) return // vertauscht nur die ganze Form
    const g = setze(n, plan, laengen, rauh)
    const pa = g.pos[s.a]
    const pb = g.pos[s.b]
    if (pa && pb && kreisSchnitt(pa, s.da, pb, s.db).length === 2) zweifach.push(idx)
  })
  const beste = setze(n, plan, laengen, rauh)
  let gewaehlt = beste
  let distinct: Versuch[] = []
  if (zweifach.length > 0 && n <= MAX_ECKEN_PROBE) {
    const gueltige: Versuch[] = []
    const anzahl = 1 << zweifach.length
    for (let bits = 0; bits < anzahl; bits++) {
      const wahl = plan.schritte.map(() => -1)
      // Der erste Schritt wird wie bei der groben Zeichnung gewählt, die übrigen laut `bits`
      zweifach.forEach((idx, b) => (wahl[idx] = (bits >> b) & 1))
      const v = setze(n, plan, laengen, rauh, wahl)
      if (!v.gueltig || !passtZuAllen(v.pos, laengen)) continue
      const punkte = v.pos as GPunkt[]
      if (gueltige.some((d) => gleicheForm(ausrichten(d.pos as GPunkt[], rauh), ausrichten(punkte, rauh)))) continue
      gueltige.push(v)
    }
    // Eine Form, deren Seiten sich kreuzen (Schleife), ist keine zweite Möglichkeit für die Parzelle
    const einfache = gueltige.filter((v) => !hatUeberschneidung(v.pos as GPunkt[]))
    distinct = einfache.length ? einfache : gueltige
    if (distinct.length) {
      // Die Form, die der groben Zeichnung am besten gleicht
      distinct.sort((a, b) => b.passt - a.passt || a.abweichung - b.abweichung)
      gewaehlt = distinct[0]
    }
  } else if (beste.gueltig) {
    distinct.push(beste)
  }
  const mehrdeutig = distinct.length > 1

  if (!gewaehlt.gueltig) {
    // Ein Dreieck lässt sich aus den Längen nicht bilden: Seiten zu kurz für die Diagonale o. ä.
    return leer({
      status: 'unmoeglich',
      hinweise: [...winkelHinweise, 'Aus diesen Maßen lässt sich keine Form zeichnen (ein Dreieck wäre zu kurz oder zu lang). Bitte Seiten und Diagonalen nachmessen.'],
    })
  }
  const punkte = ausrichten(gewaehlt.pos as GPunkt[], rauh)
  const hinweise = [...winkelHinweise, ...abweichungsHinweise(punkte, p, n)]
  if (hatUeberschneidung(punkte)) {
    hinweise.push('Zwei Seiten der Form kreuzen sich – die Fläche stimmt dann nicht. Bitte die Reihenfolge der Ecken und die Maße prüfen.')
  }
  if (mehrdeutig) {
    hinweise.push(
      'Mit diesen Maßen wäre auch eine andere Form möglich (eine Ecke nach innen statt nach außen geknickt). Die grob gezeichneten Ecken haben entschieden – stimmt die Form nicht, die Ecke in der Zeichnung auf die andere Seite der Diagonale ziehen.',
    )
  }
  const bb = { x: Math.max(...punkte.map((q) => q.x)), y: Math.max(...punkte.map((q) => q.y)) }
  return {
    status: 'fertig',
    punkte,
    flaeche: rund2(flaecheVon(punkte)),
    umfang: rund2(punkte.reduce((s, q, i) => s + abstand(q, punkte[(i + 1) % n]), 0)),
    breite: rund2(bb.x),
    hoehe: rund2(bb.y),
    fehlt: [],
    mehrdeutig,
    hinweise,
    seitenlaengen: punkte.map((q, i) => rund2(abstand(q, punkte[(i + 1) % n]))),
  }
}

function loeseRechteck(p: Parzelle): Loesung {
  const fehlt: Fehlend[] = []
  if (!positiv(p.laenge)) fehlt.push({ art: 'laenge', text: 'Länge' })
  if (!positiv(p.breite)) fehlt.push({ art: 'breite', text: 'Breite' })
  if (fehlt.length) return leer({ fehlt })
  const b = p.breite as number
  const l = p.laenge as number
  const punkte = [
    { x: 0, y: 0 },
    { x: b, y: 0 },
    { x: b, y: l },
    { x: 0, y: l },
  ]
  return {
    status: 'fertig',
    punkte,
    flaeche: rund2(b * l),
    umfang: rund2(2 * (b + l)),
    breite: rund2(b),
    hoehe: rund2(l),
    fehlt: [],
    mehrdeutig: false,
    hinweise: [],
    seitenlaengen: [b, l, b, l].map(rund2),
  }
}

const endlich = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Form der Parzelle in Metern aus den Eingaben. Die Parzelle kann aus einer fremden Datei (.wep, Sicherung, OneDrive) stammen:
 * Unlesbares ergibt eine leere Lösung mit Hinweis, nie einen Fehler.
 */
export function loese(p: Parzelle): Loesung {
  try {
    if (!p || (p.form !== 'rechteck' && p.form !== 'frei')) return leer({ hinweise: ['Die Angaben zur Parzelle sind unlesbar.'] })
    if (p.form === 'frei' && (!Array.isArray(p.ecken) || p.ecken.some((e) => !e || !endlich(e.x) || !endlich(e.y)))) {
      return leer({ fehlt: [{ art: 'ecken', text: 'Mindestens drei Ecken' }], hinweise: ['Die Ecken der Parzelle sind unlesbar.'] })
    }
    return p.form === 'rechteck' ? loeseRechteck(p) : loeseFrei(p)
  } catch {
    return leer({ hinweise: ['Die Angaben zur Parzelle sind unlesbar.'] })
  }
}

// ---------------------------------------------------------------------------
// Fläche und Vertragsfläche
// ---------------------------------------------------------------------------

/** Ab dieser Abweichung zur Vertragsfläche erscheint der Hinweis: mehr als 3 % und mehr als 2 m². */
export const ABWEICHUNG_ANTEIL = 0.03
export const ABWEICHUNG_MIN_M2 = 2

export interface FlaechenVergleich {
  berechnet: number
  vertrag: number
  /** berechnet − Vertrag in m². */
  unterschied: number
  /** Abweichung in Prozent der Vertragsfläche. */
  prozent: number
  /** Hinweis, wenn die Abweichung deutlich ist; sonst `undefined`. Der Hinweis sperrt nichts. */
  hinweis?: string
}

/** Vergleicht die berechnete Fläche mit der Vertragsfläche (Formalien); ohne Vertragsfläche `undefined`. */
export function vergleicheFlaeche(berechnet: number | undefined, vertrag: number | undefined): FlaechenVergleich | undefined {
  if (berechnet === undefined || !positiv(vertrag)) return undefined
  const unterschied = rund2(berechnet - vertrag)
  const prozent = Math.round(((berechnet - vertrag) / vertrag) * 1000) / 10
  const deutlich = Math.abs(berechnet - vertrag) > ABWEICHUNG_MIN_M2 && Math.abs(berechnet - vertrag) / vertrag > ABWEICHUNG_ANTEIL
  const zahl = (n: number) => DE.format(rund2(n))
  return {
    berechnet,
    vertrag,
    unterschied,
    prozent,
    ...(deutlich
      ? {
          hinweis: `Berechnet ${zahl(berechnet)} m², laut Vertrag ${zahl(vertrag)} m² (${unterschied > 0 ? '+' : '−'}${zahl(Math.abs(unterschied))} m², ${DE.format(Math.abs(prozent))} %). Bitte die Maße prüfen – oder die Vertragsfläche in den Formalien. Das ist nur ein Hinweis.`,
        }
      : {}),
  }
}

/** Länge der Seite i (Ecke i → i+1) aus einer Lösung. */
export const seitenLaenge = (punkte: readonly GPunkt[], i: number): number => abstand(punkte[i], punkte[(i + 1) % punkte.length])
