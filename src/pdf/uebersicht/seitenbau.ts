/**
 * Seitenaufbau für das übersichtliche PDF: Text mit Umbruch, Überschriften, Tabellen und Kästen fließen über A4-Seiten.
 * Das Ergebnis sind Seiten mit Zeichenbefehlen (`Op`, pt, Ursprung oben links) und Haken für Vektorgrafiken
 * (Skizzen, Unterschrift); `erzeugen.ts` schreibt sie ins PDF. Ohne PDF-Bibliothek prüfbar, wie `blatt.ts`.
 */
import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib'
import type { Messer, Op, Rechteck } from '../blatt'
import type { Schriften } from '../schrift'

type Lib = typeof import('pdf-lib')

export const A4: [number, number] = [595.28, 841.89]

/** Farben im Stil der App (`src/design/tokens.css`): Schwarz/Grau/Weiß, ein gedecktes Grün. */
export const FARBE = {
  text: '#111111',
  text2: '#4d4d4d',
  linie: '#e3e3e1',
  rand: '#8a8a87',
  flaeche: '#f3f3f2',
  akzent: '#2e6640',
  akzentDunkel: '#234f31',
  akzentHell: '#e7efe9',
  warnung: '#b3261e',
} as const

export interface ZeichenKontext {
  lib: Lib
  dok: PDFDocument
  seite: PDFPage
  schriften: Schriften
  /** Die Unterschrift als eingebettetes Bild (nur wenn bestätigt). */
  unterschrift?: PDFImage
}

export interface Haken {
  rechteck: Rechteck
  zeichne: (k: ZeichenKontext) => void
}

export interface SeiteU {
  ops: Op[]
  haken: Haken[]
  /** Für Tests: kurze Bezeichnung des Inhalts. */
  art: 'deckblatt' | 'text' | 'skizze'
}

export interface Lauf {
  text: string
  fett?: boolean
}

export interface Zelle {
  text: string
  fett?: boolean
  kursiv?: boolean
  farbe?: string
  ausricht?: 'l' | 'r' | 'c'
  /** Über so viele Spalten (ab dieser). */
  spanne?: number
}

export interface Zeile {
  zellen: Zelle[]
  art?: 'normal' | 'summe' | 'gesamt' | 'gruppe' | 'hinweis'
}

export interface TabelleDef {
  /** Spaltenüberschriften (leer = ohne Kopfzeile). */
  kopf?: { text: string; ausricht?: 'l' | 'r' | 'c' }[]
  /** Breiten in pt; eine Spalte darf `0` sein (= Rest). */
  breiten: number[]
  zeilen: Zeile[]
  groesse?: number
  /** Abstand oben und unten in jeder Zeile (Standard 4,5 pt). */
  padY?: number
}

const RAND_L = 50
const RAND_R = 50
const OBEN = 74
const UNTEN = 62
export const BREITE = A4[0] - RAND_L - RAND_R
const ZEILE = 1.32

export class Satz {
  readonly seiten: SeiteU[] = []
  private y = OBEN

  constructor(private readonly messer: Messer) {}

  get seite(): SeiteU {
    return this.seiten[this.seiten.length - 1]
  }

  neueSeite(art: SeiteU['art'] = 'text'): SeiteU {
    this.seiten.push({ ops: [], haken: [], art })
    this.y = OBEN
    return this.seite
  }

  private frei(): number {
    return A4[1] - UNTEN - this.y
  }

  /** Sorgt für mindestens `h` pt Platz, sonst neue Seite. */
  platz(h: number): void {
    if (!this.seiten.length) this.neueSeite()
    else if (this.frei() < h) this.neueSeite()
  }

  abstand(h: number): void {
    this.y += h
  }

  get yPos(): number {
    return this.y
  }

  breite(text: string, fett: boolean, groesse: number, kursiv = false): number {
    return this.messer.breite(text, fett, kursiv, groesse)
  }

  // ---------------------------------------------------------------------------------------------------- Text

  /** Bricht Läufe in Zeilen um (Wörter bleiben ganz; zu lange Wörter werden getrennt). */
  umbrechen(laeufe: Lauf[], breite: number, groesse: number, grundFett = false, kursiv = false): Lauf[][] {
    const zeilen: Lauf[][] = []
    let aktuell: Lauf[] = []
    let w = 0
    const leer = this.breite(' ', false, groesse, kursiv)
    const neueZeile = () => {
      zeilen.push(aktuell)
      aktuell = []
      w = 0
    }
    const setze = (text: string, fett: boolean) => {
      const bw = this.breite(text, fett, groesse, kursiv)
      const abstand = aktuell.length ? leer : 0
      if (aktuell.length && w + abstand + bw > breite) neueZeile()
      if (aktuell.length) {
        const letzter = aktuell[aktuell.length - 1]
        // Leerzeichen gehört zum Vorgänger, damit Läufe nahtlos bleiben
        letzter.text += ' '
        w += leer
      }
      aktuell.push({ text, fett })
      w += bw
    }
    for (const lauf of laeufe) {
      const fett = lauf.fett ?? grundFett
      const absaetze = lauf.text.split('\n')
      absaetze.forEach((absatz, i) => {
        if (i > 0) neueZeile()
        for (let wort of absatz.split(/ +/)) {
          if (!wort) continue
          // zu langes Wort: in Stücke
          while (this.breite(wort, fett, groesse, kursiv) > breite && wort.length > 1) {
            let n = wort.length - 1
            while (n > 1 && this.breite(wort.slice(0, n), fett, groesse, kursiv) > breite) n--
            setze(wort.slice(0, n), fett)
            neueZeile()
            wort = wort.slice(n)
          }
          setze(wort, fett)
        }
      })
    }
    if (aktuell.length || !zeilen.length) zeilen.push(aktuell)
    return zeilen
  }

  /** Zeichnet eine umbrochene Zeile ab `x` (Grundlinie `y`). */
  private zeile(zeile: Lauf[], x: number, y: number, o: { groesse: number; farbe: string; fett: boolean; kursiv: boolean; ausricht: 'l' | 'r' | 'c'; breite: number }): void {
    const ops = this.seite.ops
    const gesamt = zeile.reduce((s, l) => s + this.breite(l.text, l.fett ?? o.fett, o.groesse, o.kursiv), 0)
    let px = o.ausricht === 'r' ? x + o.breite - gesamt : o.ausricht === 'c' ? x + (o.breite - gesamt) / 2 : x
    // Läufe mit gleicher Schrift zusammenfassen
    const gruppen: Lauf[] = []
    for (const l of zeile) {
      const letzte = gruppen[gruppen.length - 1]
      if (letzte && (letzte.fett ?? o.fett) === (l.fett ?? o.fett)) letzte.text += l.text
      else gruppen.push({ text: l.text, fett: l.fett ?? o.fett })
    }
    for (const g of gruppen) {
      const text = g.text
      if (text.trim()) ops.push({ t: 'text', x: px, y, s: text.trimEnd(), groesse: o.groesse, fett: g.fett ?? o.fett, kursiv: o.kursiv, unterstrichen: false, farbe: o.farbe })
      px += this.breite(text, g.fett ?? o.fett, o.groesse, o.kursiv)
    }
  }

  /** Ein Absatz (Text oder Läufe) über die ganze Breite, mit Seitenumbruch zwischen den Zeilen. */
  absatz(inhalt: string | Lauf[], o: { groesse?: number; farbe?: string; fett?: boolean; kursiv?: boolean; nach?: number; ausricht?: 'l' | 'r' | 'c'; x?: number; breite?: number; zusammen?: boolean } = {}): void {
    const groesse = o.groesse ?? 10
    const laeufe = typeof inhalt === 'string' ? [{ text: inhalt }] : inhalt
    const x = o.x ?? RAND_L
    const breite = o.breite ?? BREITE
    const zeilen = this.umbrechen(laeufe, breite, groesse, o.fett ?? false, o.kursiv ?? false)
    const lh = groesse * ZEILE
    if (o.zusammen) this.platz(zeilen.length * lh)
    for (const z of zeilen) {
      this.platz(lh)
      this.zeile(z, x, this.y + groesse, { groesse, farbe: o.farbe ?? FARBE.text, fett: o.fett ?? false, kursiv: o.kursiv ?? false, ausricht: o.ausricht ?? 'l', breite })
      this.y += lh
    }
    this.y += o.nach ?? 6
  }

  /** Überschrift der Ebene 1 (Abschnitt) mit Linie darunter. */
  h1(text: string): void {
    this.platz(170)
    this.y += 4
    this.absatz(text, { groesse: 17, fett: true, farbe: FARBE.akzentDunkel, nach: 3 })
    this.seite.ops.push({ t: 'linie', x1: RAND_L, y1: this.y, x2: RAND_L + BREITE, y2: this.y, breite: 1.2, farbe: FARBE.akzent })
    this.y += 10
  }

  h2(text: string, zusatz?: string): void {
    this.platz(110)
    this.y += 6
    this.absatz(text, { groesse: 12, fett: true, nach: zusatz ? 1 : 5 })
    if (zusatz) this.absatz(zusatz, { groesse: 9, farbe: FARBE.text2, nach: 5 })
  }

  linie(farbe: string = FARBE.linie, breite = 0.75): void {
    this.seite.ops.push({ t: 'linie', x1: RAND_L, y1: this.y, x2: RAND_L + BREITE, y2: this.y, breite, farbe })
  }

  // -------------------------------------------------------------------------------------------------- Tabelle

  /** Höhe einer Zeile und die umbrochenen Zellen. */
  private messeZeile(z: Zeile, spalten: number[], groesse: number, padY: number): { h: number; zeilen: Lauf[][][]; gr: number } {
    const padX = 6
    const art = z.art ?? 'normal'
    const gr = art === 'gesamt' ? groesse + 1.5 : art === 'hinweis' ? groesse - 0.5 : groesse
    let ci = 0
    const zeilen: Lauf[][][] = []
    let maxZ = 1
    for (const zelle of z.zellen) {
      const span = zelle.spanne ?? 1
      const b = spalten.slice(ci, ci + span).reduce((s, x) => s + x, 0) - 2 * padX
      const fett = zelle.fett ?? (art === 'summe' || art === 'gesamt' || art === 'gruppe')
      const u = this.umbrechen([{ text: zelle.text }], b, gr, fett, zelle.kursiv ?? art === 'hinweis')
      zeilen.push(u)
      maxZ = Math.max(maxZ, u.length)
      ci += span
    }
    return { h: maxZ * gr * ZEILE + 2 * padY, zeilen, gr }
  }

  tabelle(def: TabelleDef): void {
    const groesse = def.groesse ?? 9.5
    const fest = def.breiten.reduce((s, b) => s + b, 0)
    const spalten = def.breiten.map((b) => (b === 0 ? BREITE - fest : b))
    const padX = 6
    const padY = def.padY ?? 4.5
    const kopfH = def.kopf ? groesse * ZEILE + 2 * padY + 1 : 0

    const zeichneKopf = () => {
      if (!def.kopf) return
      const ops = this.seite.ops
      ops.push({ t: 'fuellung', x: RAND_L, y: this.y, w: BREITE, h: kopfH, farbe: FARBE.flaeche })
      let x = RAND_L
      def.kopf.forEach((k, i) => {
        this.zeile([{ text: k.text }], x + padX, this.y + padY + groesse - 1, { groesse: groesse - 1, farbe: FARBE.text2, fett: true, kursiv: false, ausricht: k.ausricht ?? 'l', breite: spalten[i] - 2 * padX })
        x += spalten[i]
      })
      ops.push({ t: 'linie', x1: RAND_L, y1: this.y + kopfH, x2: RAND_L + BREITE, y2: this.y + kopfH, breite: 0.9, farbe: FARBE.rand })
      this.y += kopfH
    }

    const gemessen = def.zeilen.map((z) => this.messeZeile(z, spalten, groesse, padY))
    if (!this.seiten.length) this.neueSeite()
    // Kopf und erste Zeile zusammenhalten
    if (gemessen.length) this.platz(kopfH + gemessen[0].h + 2)
    zeichneKopf()

    def.zeilen.forEach((z, i) => {
      const g = gemessen[i]
      if (this.frei() < g.h) {
        this.neueSeite()
        zeichneKopf()
      }
      const art = z.art ?? 'normal'
      const ops = this.seite.ops
      const y0 = this.y
      if (art === 'gesamt') ops.push({ t: 'fuellung', x: RAND_L, y: y0, w: BREITE, h: g.h, farbe: FARBE.akzentHell })
      else if (art === 'gruppe') ops.push({ t: 'fuellung', x: RAND_L, y: y0, w: BREITE, h: g.h, farbe: FARBE.flaeche })
      if (art === 'summe') ops.push({ t: 'linie', x1: RAND_L, y1: y0, x2: RAND_L + BREITE, y2: y0, breite: 0.9, farbe: FARBE.rand })
      let x = RAND_L
      let ci = 0
      z.zellen.forEach((zelle, k) => {
        const span = zelle.spanne ?? 1
        const b = spalten.slice(ci, ci + span).reduce((s, v) => s + v, 0)
        const fett = zelle.fett ?? (art === 'summe' || art === 'gesamt' || art === 'gruppe')
        const farbe = zelle.farbe ?? (art === 'gesamt' ? FARBE.akzentDunkel : art === 'hinweis' ? FARBE.text2 : FARBE.text)
        const lh = g.gr * ZEILE
        g.zeilen[k].forEach((u, li) => {
          this.zeile(u, x + padX, y0 + padY + g.gr + li * lh - 1.5, { groesse: g.gr, farbe, fett, kursiv: zelle.kursiv ?? art === 'hinweis', ausricht: zelle.ausricht ?? 'l', breite: b - 2 * padX })
        })
        x += b
        ci += span
      })
      this.y = y0 + g.h
      const naechste = def.zeilen[i + 1]?.art
      if (art !== 'summe' && art !== 'gesamt' && naechste !== 'summe' && naechste !== 'gesamt' && i < def.zeilen.length - 1) {
        ops.push({ t: 'linie', x1: RAND_L, y1: this.y, x2: RAND_L + BREITE, y2: this.y, breite: 0.5, farbe: FARBE.linie })
      }
    })
    this.y += 10
  }

  /** Beschriftung links, Wert rechts daneben (Formalien, Bewertung in Kästen). */
  schluesselWerte(zeilen: { label: string; wert: string }[], o: { labelBreite?: number; groesse?: number } = {}): void {
    const groesse = o.groesse ?? 10
    const lb = o.labelBreite ?? 170
    const lh = groesse * ZEILE
    for (const z of zeilen) {
      const wertZeilen = this.umbrechen([{ text: z.wert }], BREITE - lb, groesse)
      const h = Math.max(1, wertZeilen.length) * lh + 3
      this.platz(h)
      this.zeile([{ text: z.label }], RAND_L, this.y + groesse, { groesse, farbe: FARBE.text2, fett: false, kursiv: false, ausricht: 'l', breite: lb })
      wertZeilen.forEach((w, i) => this.zeile(w, RAND_L + lb, this.y + groesse + i * lh, { groesse, farbe: FARBE.text, fett: true, kursiv: false, ausricht: 'l', breite: BREITE - lb }))
      this.y += h
    }
    this.y += 6
  }

  /** Haken für eine Zeichnung im Rechteck `r` der aktuellen Seite. */
  haken(r: Rechteck, zeichne: Haken['zeichne']): void {
    this.seite.haken.push({ rechteck: r, zeichne })
  }

  /** Eine Zeile mit freier Höhe reservieren (z. B. für die Unterschrift) und ihr Rechteck zurückgeben. */
  reserviere(h: number): Rechteck {
    this.platz(h)
    const r = { x: RAND_L, y: this.y, w: BREITE, h }
    this.y += h
    return r
  }

  /** Seite für eine Zeichnung: Überschrift, darunter das größte Rechteck mit dem Seitenverhältnis `h/w`. */
  skizzenSeite(titel: string, hinweis: string | undefined, verhaeltnis: number): Rechteck {
    this.neueSeite('skizze')
    this.h1(titel)
    if (hinweis) this.absatz(hinweis, { groesse: 9, farbe: FARBE.text2, nach: 6 })
    const maxH = A4[1] - UNTEN - this.y
    let w = BREITE
    let h = w * verhaeltnis
    if (h > maxH) {
      h = maxH
      w = h / verhaeltnis
    }
    return { x: RAND_L + (BREITE - w) / 2, y: this.y, w, h }
  }
}

export const RAENDER = { links: RAND_L, rechts: RAND_R, oben: OBEN, unten: UNTEN }
