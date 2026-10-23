/**
 * Ein Blatt der Arbeitsmappe in Seiten setzen: Druckbereich, Skalierung, Ränder, Seitenumbrüche, Füllungen,
 * Rahmen und Texte wie in der Vorlage. Das Ergebnis ist eine Liste von Zeichenbefehlen (`Seite.ops`, in pt,
 * Ursprung links oben), die `schreiber.ts` in ein PDF schreibt. So lässt sich der Inhalt auch ohne PDF-Bibliothek
 * prüfen (Test: Werte im PDF = Werte im Excel-Export).
 */
import { zeigeWert } from './zahlformat'
import { istFehler, type Rechenwerk } from './formeln'
import { schluessel, type Bereich, type Blatt, type Kante, type Lauf, type Stil, type Zellwert } from './mappe'

export interface Rechteck {
  x: number
  y: number
  w: number
  h: number
}

export type Op =
  | { t: 'fuellung'; x: number; y: number; w: number; h: number; farbe: string }
  | { t: 'linie'; x1: number; y1: number; x2: number; y2: number; breite: number; farbe: string; strich?: number[] }
  | { t: 'kasten'; x: number; y: number; w: number; h: number; breite: number; farbe: string }
  | {
      t: 'text'
      /** Linke Kante (bei Drehung: Mittelpunkt). */
      x: number
      /** Grundlinie. */
      y: number
      s: string
      groesse: number
      fett: boolean
      kursiv: boolean
      unterstrichen: boolean
      farbe: string
      /** Nur innerhalb dieses Rechtecks zeichnen. */
      klammer?: Rechteck
      /** Drehung in Grad gegen den Uhrzeigersinn um (x, y). */
      drehung?: number
      /** Quelle für Prüfungen: Blattname und Zelladresse. */
      zelle?: string
    }

export interface SeitenInhalt {
  breite: number
  hoehe: number
  ops: Op[]
  /** Rechteck eines Zellbereichs (Zeile/Spalte ab 1) in Seitenkoordinaten; `undefined`, wenn er nicht auf dieser Seite liegt. */
  lage: (z: number, s: number, ze?: number, se?: number) => Rechteck | undefined
  /** Zeilen dieses Teils des Blatts (ab 1). */
  zeilen: [number, number]
}

export interface Messer {
  /** Breite eines Textes in pt. */
  breite(text: string, fett: boolean, kursiv: boolean, groesse: number): number
}

const A_PT = 0.75
const MDW = 7

/** Spaltenbreite in Zeichen → pt (ungeskaliert), nach der Excel-Regel für die Standardschrift. */
export function spaltenPt(zeichen: number): number {
  return Math.trunc(((256 * zeichen + Math.trunc(128 / MDW)) / 256) * MDW) * A_PT
}

const SCHRIFT_FAKTOR: Record<string, number> = { calibri: 0.93, carlito: 0.93, cambria: 0.95 }

function strichBreite(k: Kante): { breite: number; strich?: number[]; doppelt?: boolean } {
  switch (k.stil) {
    case 'hair': return { breite: 0.3 }
    case 'thin': return { breite: 0.6 }
    case 'medium': return { breite: 1.2 }
    case 'thick': return { breite: 2 }
    case 'double': return { breite: 0.5, doppelt: true }
    case 'dashed': return { breite: 0.6, strich: [3, 2] }
    case 'mediumDashed': return { breite: 1.2, strich: [4, 3] }
    case 'dotted': return { breite: 0.6, strich: [1, 1.5] }
    case 'dashDot': case 'dashDotDot': case 'slantDashDot': return { breite: 0.6, strich: [3, 1.5, 1, 1.5] }
    default: return { breite: 1.2, strich: [4, 2, 1, 2] }
  }
}

export interface BlattOptionen {
  /** Zusatz-Skalierung (1 = wie in der Vorlage). */
  skalaFaktor?: number
}

/** Hilfsstruktur: Position und Größe aller Zeilen und Spalten des Druckbereichs (ungeskaliert, in pt). */
interface Raster {
  spaltenX: number[] // Anfang jeder Spalte im Bereich + Ende
  zeilenY: number[]
  bereich: Bereich
}

function baueRaster(blatt: Blatt, bereich: Bereich): Raster {
  const spaltenX = [0]
  for (let s = bereich.s1; s <= bereich.s2; s++) {
    const def = blatt.spalten.find((c) => s >= c.min && s <= c.max)
    const breite = def ? (def.versteckt ? 0 : spaltenPt(def.breite)) : spaltenPt(blatt.standardSpaltenBreite)
    spaltenX.push(spaltenX[spaltenX.length - 1] + breite)
  }
  const zeilenY = [0]
  for (let z = bereich.z1; z <= bereich.z2; z++) {
    const h = blatt.zeilenVersteckt.has(z) ? 0 : (blatt.zeilenHoehe.get(z) ?? blatt.standardZeilenHoehe)
    zeilenY.push(zeilenY[zeilenY.length - 1] + h)
  }
  return { spaltenX, zeilenY, bereich }
}

export function blattBereich(blatt: Blatt): Bereich {
  if (blatt.druckbereich) return blatt.druckbereich
  let z2 = 1
  let s2 = 1
  for (const k of blatt.zellen.keys()) {
    z2 = Math.max(z2, Math.floor(k / 20000))
    s2 = Math.max(s2, k % 20000)
  }
  return { z1: 1, s1: 1, z2, s2 }
}

function sicherText(s: string): string {
  // Die Standardschriften des PDF kennen nur WinAnsi; ein paar häufige Zeichen werden ersetzt
  return s
    .replace(/[→➔]/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/−/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/✓|✔/g, 'ok')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** Zeilenumbruch nach Textbreite; harte Umbrüche („\n“) bleiben. */
function umbrechen(text: string, breite: number, mess: (s: string) => number): string[] {
  const zeilen: string[] = []
  for (const absatz of text.split(/\r?\n/)) {
    if (!absatz) {
      zeilen.push('')
      continue
    }
    let akt = ''
    for (const wort of absatz.split(/(?<=[ -])/)) {
      const probe = akt + wort
      if (akt && mess(probe.trimEnd()) > breite) {
        zeilen.push(akt.trimEnd())
        akt = wort
      } else akt = probe
    }
    zeilen.push(akt.trimEnd())
  }
  return zeilen
}

export interface BlattErgebnis {
  seiten: SeitenInhalt[]
  /** Die Skalierung, mit der gedruckt wurde. */
  skala: number
}

export function setzeBlatt(blatt: Blatt, mappe: { stile: Stil[] }, rechen: Rechenwerk, messer: Messer, optionen: BlattOptionen = {}): BlattErgebnis {
  const bereich = blattBereich(blatt)
  const raster = baueRaster(blatt, bereich)
  const sp = blatt.seite
  const [pb, ph] = sp.hochformat ? sp.papier : [sp.papier[1], sp.papier[0]]
  const rand = { l: sp.rand.l * 72, r: sp.rand.r * 72, o: sp.rand.o * 72, u: sp.rand.u * 72 }
  const nutzB = pb - rand.l - rand.r
  const nutzH = ph - rand.o - rand.u
  const gesamtB = raster.spaltenX[raster.spaltenX.length - 1]
  let f = (sp.skala / 100) * (optionen.skalaFaktor ?? 1)
  if (gesamtB * f > nutzB) f = nutzB / gesamtB // nie über den Rand hinaus

  // Ragt ein Abschnitt zwischen zwei festen Umbrüchen nur knapp über die Seite, wird etwas kleiner gedruckt,
  // damit kein fast leeres Restblatt entsteht (wie „An Seite anpassen“, aber höchstens 6 %).
  {
    const grenzen = [bereich.z1 - 1, ...blatt.umbrueche.filter((z) => z >= bereich.z1 && z < bereich.z2), bereich.z2]
    let faktor = 1
    for (let i = 1; i < grenzen.length; i++) {
      const h = (raster.zeilenY[grenzen[i] - bereich.z1 + 1] - raster.zeilenY[grenzen[i - 1] + 1 - bereich.z1]) * f
      if (h > nutzH && h <= nutzH * 1.06) faktor = Math.min(faktor, nutzH / h)
    }
    f *= faktor
  }

  // Seiten: Zeilen sammeln, bis die Höhe voll ist oder ein Umbruch kommt
  const teile: [number, number][] = []
  let start = bereich.z1
  let hoehe = 0
  for (let z = bereich.z1; z <= bereich.z2; z++) {
    const h = (raster.zeilenY[z - bereich.z1 + 1] - raster.zeilenY[z - bereich.z1]) * f
    if (z > start && hoehe + h > nutzH + 0.01) {
      teile.push([start, z - 1])
      start = z
      hoehe = 0
    }
    hoehe += h
    if (blatt.umbrueche.includes(z) && z < bereich.z2) {
      teile.push([start, z])
      start = z + 1
      hoehe = 0
    }
  }
  if (start <= bereich.z2) teile.push([start, bereich.z2])

  const verbundenVon = new Map<number, number>()
  blatt.verbunden.forEach((b, i) => {
    for (let z = b.z1; z <= b.z2; z++) for (let s = b.s1; s <= b.s2; s++) verbundenVon.set(schluessel(z, s), i)
  })

  const stilVon = (z: number, s: number): Stil => {
    const zelle = blatt.zellen.get(schluessel(z, s))
    let id = zelle?.stil
    if (id === undefined || (id === 0 && !zelle)) {
      id = blatt.zeilenStil.get(z) ?? blatt.spalten.find((c) => s >= c.min && s <= c.max)?.stil ?? 0
    }
    return mappe.stile[id] ?? mappe.stile[0]
  }

  const seiten: SeitenInhalt[] = []
  for (const [z1, z2] of teile) {
    const ox = rand.l + (sp.zentriertH ? (nutzB - gesamtB * f) / 2 : 0)
    const oy = rand.o
    const X = (s: number) => ox + raster.spaltenX[s - bereich.s1] * f
    const Y = (z: number) => oy + (raster.zeilenY[z - bereich.z1] - raster.zeilenY[z1 - bereich.z1]) * f
    const seite: SeitenInhalt = {
      breite: pb,
      hoehe: ph,
      ops: [],
      zeilen: [z1, z2],
      lage: (z, s, ze = z, se = s) => (z < z1 || ze > z2 ? undefined : { x: X(s), y: Y(z), w: X(se + 1) - X(s), h: Y(ze + 1) - Y(z) }),
    }
    const ops = seite.ops

    // Füllungen
    for (let z = z1; z <= z2; z++) {
      for (let s = bereich.s1; s <= bereich.s2; s++) {
        const mi = verbundenVon.get(schluessel(z, s))
        const m = mi === undefined ? undefined : blatt.verbunden[mi]
        if (m && (m.z1 !== z || m.s1 !== s) && !(m.z1 < z1 && z === z1 && s === m.s1)) continue
        const st = stilVon(m ? m.z1 : z, m ? m.s1 : s)
        if (!st.fuellung || st.fuellung === 'FFFFFF') continue
        const za = Math.max(m ? m.z1 : z, z1)
        const ze = Math.min(m ? m.z2 : z, z2)
        const sa = m ? m.s1 : s
        const se = Math.min(m ? m.s2 : s, bereich.s2)
        ops.push({ t: 'fuellung', x: X(sa), y: Y(za), w: X(se + 1) - X(sa), h: Y(ze + 1) - Y(za), farbe: st.fuellung })
      }
    }

    // Texte
    const zeichneTexte = () => {
      for (let z = z1; z <= z2; z++) {
        if (blatt.zeilenVersteckt.has(z)) continue
        for (let s = bereich.s1; s <= bereich.s2; s++) {
          const zelle = blatt.zellen.get(schluessel(z, s))
          if (!zelle) continue
          const mi = verbundenVon.get(schluessel(z, s))
          const m = mi === undefined ? undefined : blatt.verbunden[mi]
          if (m && (m.z1 !== z || m.s1 !== s)) {
            // Beginnt die verbundene Zelle auf der vorigen Seite, gehört der Text dorthin
            continue
          }
          const st = stilVon(z, s)
          const wert = rechen.wert(blatt.name, z, s)
          const anz = zeigeWert(wert, st.format)
          if (!anz || (anz.links === '' && !anz.rechts)) continue
          const za = z
          const ze = Math.min(m ? m.z2 : z, z2)
          const se = Math.min(m ? m.s2 : s, bereich.s2)
          const box: Rechteck = { x: X(s), y: Y(za), w: X(se + 1) - X(s), h: Y(ze + 1) - Y(za) }
          if (box.h <= 0 || box.w <= 0) continue
          textInZelle(ops, blatt, rechen, messer, st, anz, wert, box, f, { z, s, se, m: Boolean(m) }, bereich, X, verbundenVon, `${blatt.name}!${z}:${s}`, zelle.laeufe)
        }
      }
    }
    zeichneTexte()

    // Kontrollkästchen
    for (const c of blatt.checkboxen) {
      if (c.z1 < z1 || c.z1 > z2 || c.s1 < bereich.s1 || c.s1 > bereich.s2) continue
      const x = X(c.s1) + c.sOff1 * f
      const yTop = Y(c.z1) + c.zOff1 * f
      const kante = 8.5 * f
      const yMitte = c.z2 >= c.z1 && c.z2 <= z2 ? (yTop + Y(c.z2) + c.zOff2 * f) / 2 : yTop + kante / 2
      ops.push({ t: 'kasten', x, y: yMitte - kante / 2, w: kante, h: kante, breite: 0.6 * f, farbe: '000000' })
    }

    // Rahmen
    const linieZeichnen = (x1: number, y1: number, x2: number, y2: number, k: Kante) => {
      const sb = strichBreite(k)
      const breite = sb.breite * Math.max(0.8, f)
      if (sb.doppelt) {
        const waagerecht = y1 === y2
        const d = 0.9
        ops.push({ t: 'linie', x1: x1 + (waagerecht ? 0 : -d), y1: y1 + (waagerecht ? -d : 0), x2: x2 + (waagerecht ? 0 : -d), y2: y2 + (waagerecht ? -d : 0), breite, farbe: k.farbe })
        ops.push({ t: 'linie', x1: x1 + (waagerecht ? 0 : d), y1: y1 + (waagerecht ? d : 0), x2: x2 + (waagerecht ? 0 : d), y2: y2 + (waagerecht ? d : 0), breite, farbe: k.farbe })
      } else ops.push({ t: 'linie', x1, y1, x2, y2, breite, farbe: k.farbe, strich: sb.strich })
    }
    for (let z = z1; z <= z2; z++) {
      for (let s = bereich.s1; s <= bereich.s2; s++) {
        const mi = verbundenVon.get(schluessel(z, s))
        const st = stilVon(z, s)
        const r = st.rahmen
        const innen = (dz: number, ds: number) => mi !== undefined && verbundenVon.get(schluessel(z + dz, s + ds)) === mi
        const x1 = X(s)
        const x2 = X(s + 1)
        const y1 = Y(z)
        const y2 = Y(z + 1)
        if (y2 - y1 <= 0 || x2 - x1 <= 0) continue
        if (r.o && !innen(-1, 0)) linieZeichnen(x1, y1, x2, y1, r.o)
        if (r.u && !innen(1, 0)) linieZeichnen(x1, y2, x2, y2, r.u)
        if (r.l && !innen(0, -1)) linieZeichnen(x1, y1, x1, y2, r.l)
        if (r.r && !innen(0, 1)) linieZeichnen(x2, y1, x2, y2, r.r)
      }
    }

    seiten.push(seite)
  }
  return { seiten, skala: f }
}

function textInZelle(
  ops: Op[],
  blatt: Blatt,
  rechen: Rechenwerk,
  messer: Messer,
  st: Stil,
  anz: NonNullable<ReturnType<typeof zeigeWert>>,
  wert: Zellwert,
  box: Rechteck,
  f: number,
  pos: { z: number; s: number; se: number; m: boolean },
  bereich: Bereich,
  X: (s: number) => number,
  verbundenVon: Map<number, number>,
  quelle: string,
  laeufe?: Lauf[],
): void {
  const schr = st.schrift
  const basis = schr.groesse * (SCHRIFT_FAKTOR[schr.name.toLowerCase()] ?? 1) * f
  const farbe = anz.farbe ?? schr.farbe ?? '000000'
  const a = st.ausrichtung
  const links = sicherText(anz.links)
  const rechts = anz.rechts === undefined ? undefined : sicherText(anz.rechts)
  const mess = (t: string, g: number) => messer.breite(t, schr.fett, schr.kursiv, g)
  const innen = 1.6 * f
  const einzug = a.einzug * 6.75 * f

  // Horizontale Ausrichtung
  let h = a.h
  if (h === 'general') h = anz.zahl || istFehler(wert) ? (istFehler(wert) ? 'center' : 'right') : typeof wert === 'boolean' ? 'center' : 'left'

  const basisOp = { fett: schr.fett, kursiv: schr.kursiv, unterstrichen: schr.unterstrichen, farbe, zelle: quelle }

  // Text mit gemischter Formatierung (z. B. ein fett gesetztes Wort mitten im Satz)
  if (laeufe && rechts === undefined && !a.drehung && laeufe.map((l) => l.text).join('') === anz.links) {
    zeichneLaeufe(ops, messer, st, laeufe, box, f, h, a, basisOp, innen, einzug, quelle)
    return
  }

  // Gedrehter Text: mittig in der Zelle
  if (a.drehung && a.drehung !== 255) {
    const winkel = a.drehung <= 90 ? a.drehung : -(a.drehung - 90)
    const g = basis
    const breite = mess(links, g)
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const rad = (winkel * Math.PI) / 180
    // Mittelpunkt des Textes auf (cx, cy): Anfang um die halbe Breite zurück entlang der Schreibrichtung
    const x0 = cx - (Math.cos(rad) * breite) / 2 + Math.sin(rad) * g * 0.3
    const y0 = cy + (Math.sin(rad) * breite) / 2 + Math.cos(rad) * g * 0.3
    ops.push({ t: 'text', x: x0, y: y0, s: links, groesse: g, drehung: winkel, ...basisOp })
    return
  }

  // Füllformat („* “): links und rechts getrennt an den Rändern
  if (rechts !== undefined) {
    const g = basis
    const grund = box.y + box.h - 1.2 * f - g * 0.21
    const klammer = box
    if (links.trim()) ops.push({ t: 'text', x: box.x + innen, y: grund, s: links, groesse: g, klammer, ...basisOp })
    const rb = mess(rechts, g)
    ops.push({ t: 'text', x: box.x + box.w - innen - rb, y: grund, s: rechts, groesse: g, klammer, ...basisOp })
    return
  }

  let g = basis
  let zeilen: string[]
  const verfuegbar = (): { x: number; w: number } => {
    // Nicht umbrochener Text, der in die Zelle passt, bleibt in der Zelle; sonst darf er in leere Nachbarzellen hineinragen
    let von = box.x
    let bis = box.x + box.w
    const eigene = box.w - 2 * innen - (h === 'left' ? einzug : 0)
    const breit = Math.max(...links.split(/\r?\n/).map((t) => mess(t, basis)))
    if (!a.umbruch && !pos.m && breit > eigene) {
      const leer = (s: number): boolean => {
        const nb = blatt.zellen.get(schluessel(pos.z, s))
        if (verbundenVon.has(schluessel(pos.z, s))) return false
        if (!nb) return true
        if (nb.formel) {
          const w = rechen.wert(blatt.name, pos.z, s)
          return w === null || w === ''
        }
        return nb.wert === null || nb.wert === ''
      }
      const rechtsFrei = () => {
        let s = pos.s + 1
        while (s <= bereich.s2 && leer(s)) {
          bis = X(s + 1)
          s++
        }
      }
      const linksFrei = () => {
        let s = pos.s - 1
        while (s >= bereich.s1 && leer(s)) {
          von = X(s)
          s--
        }
      }
      if (h === 'left') rechtsFrei()
      else if (h === 'right') linksFrei()
      else {
        rechtsFrei()
        linksFrei()
      }
    }
    return { x: von, w: bis - von }
  }
  const frei = verfuegbar()
  const nutzB = frei.w - 2 * innen - (h === 'left' ? einzug : 0)

  if (a.umbruch) {
    zeilen = umbrechen(links, nutzB, (t) => mess(t, g))
    // Passt der Text nicht in die Höhe, die Schrift bis auf 80 % verkleinern
    while (zeilen.length * g * 1.15 > box.h && g > basis * 0.8) {
      g *= 0.95
      zeilen = umbrechen(links, nutzB, (t) => mess(t, g))
    }
  } else {
    zeilen = links.split(/\r?\n/)
    const breit = Math.max(...zeilen.map((t) => mess(t, g)))
    if (breit > nutzB && nutzB > 0) g = Math.max(basis * 0.72, g * (nutzB / breit))
  }

  const hoeheGesamt = zeilen.length * g * 1.15
  let yTop: number
  if (a.v === 'top') yTop = box.y + 0.8 * f
  else if (a.v === 'center' || a.v === 'distributed' || a.v === 'justify') yTop = box.y + (box.h - hoeheGesamt) / 2
  else yTop = box.y + box.h - hoeheGesamt - 0.8 * f
  if (yTop < box.y && a.umbruch) yTop = box.y

  zeilen.forEach((t, i) => {
    if (!t) return
    const b = mess(t, g)
    let x: number
    if (h === 'right') x = frei.x + frei.w - innen - b
    else if (h === 'center' || h === 'centerContinuous') x = frei.x + (frei.w - b) / 2
    else x = frei.x + innen + einzug
    const grund = yTop + i * g * 1.15 + g * 0.93
    ops.push({ t: 'text', x, y: grund, s: t, groesse: g, klammer: a.umbruch || pos.m ? box : undefined, ...basisOp })
  })
}

interface Wort {
  text: string
  fett: boolean
  kursiv: boolean
  unterstrichen: boolean
  groesse: number
  farbe: string
  breite: number
  /** Zeilenumbruch nach diesem Wort („\n“ im Text). */
  umbruch?: boolean
}

/** Zeilen mit Wörtern unterschiedlicher Formatierung setzen (Rich Text). */
function zeichneLaeufe(
  ops: Op[],
  messer: Messer,
  st: Stil,
  laeufe: Lauf[],
  box: Rechteck,
  f: number,
  h: 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed',
  a: Stil['ausrichtung'],
  basis: { fett: boolean; kursiv: boolean; unterstrichen: boolean; farbe: string; zelle?: string },
  innen: number,
  einzug: number,
  quelle: string,
): void {
  const schr = st.schrift
  const faktor = SCHRIFT_FAKTOR[schr.name.toLowerCase()] ?? 1
  const worte: Wort[] = []
  for (const l of laeufe) {
    const fett = l.fett ?? schr.fett
    const kursiv = l.kursiv ?? schr.kursiv
    const groesse = (l.groesse ?? schr.groesse) * faktor * f
    const teile = sicherText(l.text).split(/(\r?\n)/)
    for (const t of teile) {
      if (/^\r?\n$/.test(t)) {
        if (worte.length) worte[worte.length - 1].umbruch = true
        else worte.push({ text: '', fett, kursiv, unterstrichen: false, groesse, farbe: basis.farbe, breite: 0, umbruch: true })
        continue
      }
      for (const w of t.split(/(?<=[ -])/)) {
        if (!w) continue
        worte.push({ text: w, fett, kursiv, unterstrichen: l.unterstrichen ?? basis.unterstrichen, groesse, farbe: l.farbe ?? basis.farbe, breite: messer.breite(w, fett, kursiv, groesse) })
      }
    }
  }
  const verfuegbar = box.w - 2 * innen - (h === 'left' || h === 'general' ? einzug : 0)
  let zeilen: Wort[][] = [[]]
  let breite = 0
  for (const w of worte) {
    const netto = w.breite - (w.text.endsWith(' ') ? messer.breite(' ', w.fett, w.kursiv, w.groesse) : 0)
    if (a.umbruch && breite + netto > verfuegbar && zeilen[zeilen.length - 1].length) {
      zeilen.push([])
      breite = 0
    }
    zeilen[zeilen.length - 1].push(w)
    breite += w.breite
    if (w.umbruch) {
      zeilen.push([])
      breite = 0
    }
  }
  if (!zeilen[zeilen.length - 1].length && zeilen.length > 1) zeilen = zeilen.slice(0, -1)
  const hoehen = zeilen.map((z) => Math.max(0, ...z.map((w) => w.groesse)) * 1.15)
  const gesamt = hoehen.reduce((x, y) => x + y, 0)
  let y = a.v === 'top' ? box.y + 0.8 * f : a.v === 'center' || a.v === 'distributed' || a.v === 'justify' ? box.y + (box.h - gesamt) / 2 : box.y + box.h - gesamt - 0.8 * f
  if (y < box.y) y = box.y
  zeilen.forEach((zeile, i) => {
    const gross = Math.max(0, ...zeile.map((w) => w.groesse))
    const zeilenBreite = zeile.reduce((x, w) => x + w.breite, 0) - (zeile.length && zeile[zeile.length - 1].text.endsWith(' ') ? messer.breite(' ', zeile[zeile.length - 1].fett, zeile[zeile.length - 1].kursiv, zeile[zeile.length - 1].groesse) : 0)
    let x = h === 'right' ? box.x + box.w - innen - zeilenBreite : h === 'center' || h === 'centerContinuous' ? box.x + (box.w - zeilenBreite) / 2 : box.x + innen + einzug
    const grund = y + gross * 0.93
    for (const w of zeile) {
      if (w.text.trim()) ops.push({ t: 'text', x, y: grund, s: w.text.replace(/ +$/, ''), groesse: w.groesse, fett: w.fett, kursiv: w.kursiv, unterstrichen: w.unterstrichen, farbe: w.farbe, klammer: box, zelle: quelle })
      x += w.breite
    }
    y += hoehen[i]
  })
}
