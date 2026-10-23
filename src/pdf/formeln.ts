/**
 * Rechenwerk für die Formeln der WEP-Vorlage.
 *
 * Das PDF wird aus derselben Arbeitsmappe erzeugt wie der Excel-Export. Damit die Zahlen im PDF genau die sind,
 * die Excel und LibreOffice aus dieser Mappe berechnen, werden die Formeln hier mit denselben Eingabezellen
 * ausgewertet. Die Vorlage benutzt nur ROUND, IF, SUM, MIN, MAX, Verweise zwischen Blättern und die
 * Grundrechenarten; ein paar weitere gängige Funktionen sind dabei, damit auch eine von Hand erweiterte Bau-Excel
 * rechnet. Kennt das Rechenwerk etwas nicht, bleibt der zuletzt gespeicherte Wert der Zelle stehen und der Fall
 * wird in `unbekannt` gemeldet (nichts bricht ab).
 *
 * Test: `src/pdf/__tests__/formeln.test.ts` vergleicht das Rechenwerk für mehrere erfundene Fälle mit den von
 * LibreOffice berechneten Werten der exportierten Datei.
 */
import { schluessel, spaltenNummer, type Blatt, type Mappe, type Zelle, type Zellwert } from './mappe'

type Fehler = { fehler: string }
type V = Zellwert

const istFehler = (v: V): v is Fehler => typeof v === 'object' && v !== null && 'fehler' in v

// ---------------------------------------------------------------------------
// Zerlegen
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'zahl'; v: number }
  | { t: 'text'; v: string }
  | { t: 'bezug'; blatt?: string; text: string }
  | { t: 'name'; v: string }
  | { t: 'fehler'; v: string }
  | { t: 'op'; v: string }

const TOKEN =
  /\s+|"((?:[^"]|"")*)"|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|((?:'(?:[^']|'')+'|[A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![A-Za-z0-9_(.])|([A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_.]*)|(<=|>=|<>|[-+*/^&=<>(),%;:])|(#[A-Z0-9/]+[!?]?)/gy

function zerlege(formel: string): Tok[] {
  const out: Tok[] = []
  TOKEN.lastIndex = 0
  let ende = 0
  let m: RegExpExecArray | null
  while (ende < formel.length && (m = TOKEN.exec(formel))) {
    ende = TOKEN.lastIndex
    if (m[1] !== undefined) out.push({ t: 'text', v: m[1].replace(/""/g, '"') })
    else if (m[2] !== undefined) out.push({ t: 'zahl', v: Number(m[2]) })
    else if (m[4] !== undefined) {
      const blatt = m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : undefined
      out.push({ t: 'bezug', blatt, text: m[4] })
    } else if (m[5] !== undefined) out.push({ t: 'name', v: m[5] })
    else if (m[6] !== undefined) out.push({ t: 'op', v: m[6] })
    else if (m[7] !== undefined) out.push({ t: 'fehler', v: m[7] })
  }
  if (ende < formel.length) throw new Error(`Formel nicht lesbar: ${formel}`)
  return out
}

/** Verschiebt die relativen Bezüge einer Formel (gemeinsame Formeln der Vorlage). */
export function verschiebeFormel(formel: string, dz: number, ds: number): string {
  if (!dz && !ds) return formel
  let aus = ''
  TOKEN.lastIndex = 0
  let ende = 0
  let m: RegExpExecArray | null
  while (ende < formel.length && (m = TOKEN.exec(formel))) {
    ende = TOKEN.lastIndex
    if (m[4] !== undefined) {
      const verschoben = m[4].replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (_x, d1: string, sp: string, d2: string, zl: string) => {
        const s = d1 ? sp : buchstaben(spaltenNummer(sp) + ds)
        const z = d2 ? zl : String(Number(zl) + dz)
        return `${d1}${s}${d2}${z}`
      })
      aus += (m[3] ?? '') + verschoben
    } else aus += m[0]
  }
  return aus
}

function buchstaben(n: number): string {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// ---------------------------------------------------------------------------
// Aufbau des Ausdrucks
// ---------------------------------------------------------------------------

type Knoten =
  | { k: 'zahl'; v: number }
  | { k: 'text'; v: string }
  | { k: 'bezug'; blatt?: string; z1: number; s1: number; z2: number; s2: number }
  | { k: 'un'; op: string; x: Knoten }
  | { k: 'prozent'; x: Knoten }
  | { k: 'bin'; op: string; l: Knoten; r: Knoten }
  | { k: 'aufruf'; name: string; arg: Knoten[] }
  | { k: 'wahr'; v: boolean }
  | { k: 'fehler'; v: string }

function bezug(text: string): { z1: number; s1: number; z2: number; s2: number } {
  const teile = text.replace(/\$/g, '').split(':')
  const a = /^([A-Za-z]+)(\d+)$/.exec(teile[0])!
  const b = teile[1] ? /^([A-Za-z]+)(\d+)$/.exec(teile[1])! : a
  const z1 = Number(a[2])
  const s1 = spaltenNummer(a[1])
  const z2 = Number(b[2])
  const s2 = spaltenNummer(b[1])
  return { z1: Math.min(z1, z2), s1: Math.min(s1, s2), z2: Math.max(z1, z2), s2: Math.max(s1, s2) }
}

function baue(tokens: Tok[], namen: ReadonlyMap<string, string>): Knoten {
  let i = 0
  const op = (...erlaubt: string[]) => {
    const t = tokens[i]
    return t && t.t === 'op' && erlaubt.includes(t.v) ? (i++, t.v) : undefined
  }
  const vergleich = (): Knoten => {
    let l = verkettung()
    for (let o = op('=', '<>', '<', '>', '<=', '>='); o; o = op('=', '<>', '<', '>', '<=', '>=')) l = { k: 'bin', op: o, l, r: verkettung() }
    return l
  }
  const verkettung = (): Knoten => {
    let l = summe()
    for (let o = op('&'); o; o = op('&')) l = { k: 'bin', op: o, l, r: summe() }
    return l
  }
  const summe = (): Knoten => {
    let l = produkt()
    for (let o = op('+', '-'); o; o = op('+', '-')) l = { k: 'bin', op: o, l, r: produkt() }
    return l
  }
  const produkt = (): Knoten => {
    let l = potenz()
    for (let o = op('*', '/'); o; o = op('*', '/')) l = { k: 'bin', op: o, l, r: potenz() }
    return l
  }
  const potenz = (): Knoten => {
    let l = vorzeichen()
    for (let o = op('^'); o; o = op('^')) l = { k: 'bin', op: o, l, r: vorzeichen() }
    return l
  }
  const vorzeichen = (): Knoten => {
    const o = op('-', '+')
    if (o) return { k: 'un', op: o, x: vorzeichen() }
    return prozent()
  }
  const prozent = (): Knoten => {
    let x = grund()
    while (op('%')) x = { k: 'prozent', x }
    return x
  }
  const grund = (): Knoten => {
    const t = tokens[i++]
    if (!t) throw new Error('Formel unvollständig')
    if (t.t === 'zahl') return { k: 'zahl', v: t.v }
    if (t.t === 'text') return { k: 'text', v: t.v }
    if (t.t === 'fehler') return { k: 'fehler', v: t.v }
    if (t.t === 'bezug') return { k: 'bezug', blatt: t.blatt, ...bezug(t.text) }
    if (t.t === 'name') {
      const gross = t.v.toUpperCase()
      if (tokens[i]?.t === 'op' && (tokens[i] as { v: string }).v === '(') {
        i++
        const arg: Knoten[] = []
        if (!op(')')) {
          do {
            const n = tokens[i]
            // leeres Argument (z. B. IF(a;;b)) als Leerwert
            if (n && n.t === 'op' && (n.v === ',' || n.v === ';' || n.v === ')')) arg.push({ k: 'text', v: '' })
            else arg.push(vergleich())
          } while (op(',', ';'))
          if (!op(')')) throw new Error('Klammer fehlt')
        }
        return { k: 'aufruf', name: gross, arg }
      }
      if (gross === 'TRUE' || gross === 'WAHR') return { k: 'wahr', v: true }
      if (gross === 'FALSE' || gross === 'FALSCH') return { k: 'wahr', v: false }
      const ziel = namen.get(t.v.toLowerCase())
      if (ziel) {
        const tk = zerlege(ziel)
        if (tk.length === 1 && tk[0].t === 'bezug') return { k: 'bezug', blatt: tk[0].blatt, ...bezug(tk[0].text) }
      }
      throw new Error(`Name unbekannt: ${t.v}`)
    }
    if (t.v === '(') {
      const x = vergleich()
      if (!op(')')) throw new Error('Klammer fehlt')
      return x
    }
    throw new Error(`Unerwartet: ${t.v}`)
  }
  const wurzel = vergleich()
  if (i < tokens.length) throw new Error('Formel hat Reste')
  return wurzel
}

// ---------------------------------------------------------------------------
// Rechnen
// ---------------------------------------------------------------------------

/** Excel-Rundung (kaufmännisch, auf die dezimale Darstellung bezogen). */
export function runde(x: number, stellen: number): number {
  const f = Math.pow(10, stellen)
  const y = +(Math.abs(x) * f).toPrecision(15)
  return (Math.sign(x) * Math.round(y)) / f
}

const FEHLER = (f: string): Fehler => ({ fehler: f })

function alsZahl(v: V): number | Fehler {
  if (istFehler(v)) return v
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) && String(v).trim() !== '' ? n : FEHLER('#WERT!')
}

function alsWahrheit(v: V): boolean | Fehler {
  if (istFehler(v)) return v
  if (v === null || v === '') return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const t = v.toUpperCase()
  if (t === 'TRUE' || t === 'WAHR') return true
  if (t === 'FALSE' || t === 'FALSCH') return false
  return FEHLER('#WERT!')
}

function alsText(v: V): string {
  if (v === null) return ''
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (istFehler(v)) return v.fehler
  return v
}

function vergleiche(a: V, b: V, o: string): V {
  if (istFehler(a)) return a
  if (istFehler(b)) return b
  const rang = (v: V) => (typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 0)
  let x = a
  let y = b
  if (x === null) x = typeof y === 'string' ? '' : typeof y === 'boolean' ? false : 0
  if (y === null) y = typeof x === 'string' ? '' : typeof x === 'boolean' ? false : 0
  let c: number
  if (rang(x) !== rang(y)) c = rang(x) - rang(y)
  else if (typeof x === 'string') {
    const p = x.toLowerCase()
    const q = (y as string).toLowerCase()
    c = p < q ? -1 : p > q ? 1 : 0
  } else c = Number(x) - Number(y as number)
  switch (o) {
    case '=': return c === 0
    case '<>': return c !== 0
    case '<': return c < 0
    case '>': return c > 0
    case '<=': return c <= 0
    default: return c >= 0
  }
}

export interface RechenBericht {
  /** Formeln, die das Rechenwerk nicht auswerten konnte („Blatt!Zelle: Grund“). */
  unbekannt: string[]
}

export class Rechenwerk {
  private readonly blaetter = new Map<string, Blatt>()
  private readonly cache = new Map<string, V>()
  private readonly aufBau = new Set<string>()
  private readonly ast = new Map<string, Knoten | null>()
  readonly bericht: RechenBericht = { unbekannt: [] }

  constructor(readonly mappe: Mappe) {
    for (const b of mappe.blaetter) this.blaetter.set(b.name.trim().toLowerCase(), b)
  }

  blatt(name: string): Blatt | undefined {
    return this.blaetter.get(name.trim().toLowerCase())
  }

  /** Wert der Zelle (Zeile und Spalte ab 1) nach Auswertung der Formel. */
  wert(blatt: string, z: number, s: number): V {
    const b = this.blatt(blatt)
    if (!b) return FEHLER('#BEZUG!')
    const zelle = b.zellen.get(schluessel(z, s))
    if (!zelle) return null
    if (!zelle.formel) return zelle.wert
    const key = `${b.name}\u0001${z}\u0001${s}`
    if (this.cache.has(key)) return this.cache.get(key)!
    if (this.aufBau.has(key)) return FEHLER('#ZIRKELBEZUG!')
    this.aufBau.add(key)
    let ergebnis: V
    try {
      ergebnis = this.rechneZelle(b, zelle, key)
    } catch (e) {
      this.bericht.unbekannt.push(`${b.name}!${buchstaben(s)}${z}: ${e instanceof Error ? e.message : String(e)}`)
      ergebnis = zelle.wert
    }
    this.aufBau.delete(key)
    this.cache.set(key, ergebnis)
    return ergebnis
  }

  private rechneZelle(b: Blatt, zelle: Zelle, key: string): V {
    let k = this.ast.get(key)
    if (k === undefined) {
      const text = zelle.verschiebung ? verschiebeFormel(zelle.formel!, zelle.verschiebung.dz, zelle.verschiebung.ds) : zelle.formel!
      const toks = zerlege(text.replace(/^=/, ''))
      k = toks.length ? baue(toks, this.mappe.namen) : null
      this.ast.set(key, k)
    }
    if (!k) return null
    const v = this.auswerten(k, b)
    // Ein bloßer Verweis auf eine leere Zelle bleibt leer (Excel zeigte „0“; im PDF steht nichts)
    if (k.k === 'bezug' && (v === 0 || v === '') && this.istLeer(k, b)) return null
    return Array.isArray(v) ? FEHLER('#WERT!') : v
  }

  private istLeer(k: Extract<Knoten, { k: 'bezug' }>, b: Blatt): boolean {
    const ziel = k.blatt ? this.blatt(k.blatt) : b
    const zelle = ziel?.zellen.get(schluessel(k.z1, k.s1))
    return !zelle || (!zelle.formel && (zelle.wert === null || zelle.wert === '')) || (Boolean(zelle.formel) && this.wert(ziel!.name, k.z1, k.s1) === null)
  }

  private bereich(k: Extract<Knoten, { k: 'bezug' }>, b: Blatt): V[] {
    const ziel = k.blatt ? this.blatt(k.blatt) : b
    if (!ziel) return [FEHLER('#BEZUG!')]
    const out: V[] = []
    for (let z = k.z1; z <= k.z2; z++) for (let s = k.s1; s <= k.s2; s++) out.push(this.wert(ziel.name, z, s))
    return out
  }

  private auswerten(k: Knoten, b: Blatt): V | V[] {
    switch (k.k) {
      case 'zahl': return k.v
      case 'text': return k.v
      case 'wahr': return k.v
      case 'fehler': return FEHLER(k.v)
      case 'bezug': {
        if (k.z1 === k.z2 && k.s1 === k.s2) {
          const ziel = k.blatt ? this.blatt(k.blatt) : b
          return ziel ? this.wert(ziel.name, k.z1, k.s1) : FEHLER('#BEZUG!')
        }
        return this.bereich(k, b)
      }
      case 'un': {
        const x = this.einzeln(k.x, b)
        const n = alsZahl(x)
        if (typeof n !== 'number') return n
        return k.op === '-' ? -n : n
      }
      case 'prozent': {
        const n = alsZahl(this.einzeln(k.x, b))
        return typeof n === 'number' ? n / 100 : n
      }
      case 'bin': {
        const l = this.einzeln(k.l, b)
        const r = this.einzeln(k.r, b)
        if (['=', '<>', '<', '>', '<=', '>='].includes(k.op)) return vergleiche(l, r, k.op)
        if (k.op === '&') return istFehler(l) ? l : istFehler(r) ? r : alsText(l) + alsText(r)
        const x = alsZahl(l)
        const y = alsZahl(r)
        if (typeof x !== 'number') return x
        if (typeof y !== 'number') return y
        switch (k.op) {
          case '+': return x + y
          case '-': return x - y
          case '*': return x * y
          case '/': return y === 0 ? FEHLER('#DIV/0!') : x / y
          default: return Math.pow(x, y)
        }
      }
      case 'aufruf': return this.aufruf(k, b)
    }
  }

  private einzeln(k: Knoten, b: Blatt): V {
    const v = this.auswerten(k, b)
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  /**
   * SVERWEIS. Mit Suchbereich „wahr“ (Standard) gilt der größte Eintrag, der nicht über dem Suchwert liegt;
   * Texte werden zuerst genau gesucht (die Tabellen der Vorlage sind nicht durchgehend sortiert).
   */
  private sverweis(a: Knoten[], b: Blatt): V {
    const roh = this.einzeln(a[0], b)
    const such: V = roh === null ? 0 : roh
    const tabelle = a[1]
    if (tabelle?.k !== 'bezug') throw new Error('SVERWEIS: Tabelle ist kein Bezug')
    const spalte = alsZahl(this.einzeln(a[2], b))
    if (typeof spalte !== 'number') return spalte
    if (istFehler(such)) return such
    const ziel = tabelle.blatt ? this.blatt(tabelle.blatt) : b
    if (!ziel) return FEHLER('#BEZUG!')
    const ungefaehr = a[3] ? alsWahrheit(this.einzeln(a[3], b)) !== false : true
    const col = tabelle.s1 + Math.trunc(spalte) - 1
    if (col > tabelle.s2 || spalte < 1) return FEHLER('#BEZUG!')
    const zeilen: number[] = []
    for (let z = tabelle.z1; z <= tabelle.z2; z++) zeilen.push(z)
    const schluessel1 = (z: number): V => this.wert(ziel.name, z, tabelle.s1)
    const gleich = (x: V, y: V) => vergleiche(x, y, '=') === true
    const exakt = zeilen.find((z) => gleich(schluessel1(z), such))
    if (exakt !== undefined && (!ungefaehr || typeof such === 'string')) return this.wert(ziel.name, exakt, col)
    if (!ungefaehr) return FEHLER('#NV')
    let lo = 0
    let hi = zeilen.length - 1
    let treffer = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const k = schluessel1(zeilen[mid])
      if (k !== null && vergleiche(k, such, '<=') === true && (typeof k === typeof such)) {
        treffer = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return treffer < 0 ? FEHLER('#NV') : this.wert(ziel.name, zeilen[treffer], col)
  }

  /** Alle Zahlen der Argumente (Bereiche: nur Zahlen, Einzelwerte werden umgewandelt). */
  private zahlen(arg: Knoten[], b: Blatt): number[] | Fehler {
    const out: number[] = []
    for (const a of arg) {
      const v = this.auswerten(a, b)
      if (Array.isArray(v)) {
        for (const x of v) {
          if (istFehler(x)) return x
          if (typeof x === 'number') out.push(x)
        }
      } else {
        if (a.k !== 'bezug' || a.z1 !== a.z2 || a.s1 !== a.s2) {
          const n = alsZahl(v)
          if (typeof n !== 'number') return n
          out.push(n)
        } else if (istFehler(v)) return v
        else if (typeof v === 'number') out.push(v)
      }
    }
    return out
  }

  private aufruf(k: Extract<Knoten, { k: 'aufruf' }>, b: Blatt): V {
    const a = k.arg
    const ein = (i: number): V => (a[i] ? this.einzeln(a[i], b) : null)
    switch (k.name) {
      case 'ROUND':
      case 'ROUNDUP':
      case 'ROUNDDOWN': {
        const x = alsZahl(ein(0))
        const n = alsZahl(ein(1))
        if (typeof x !== 'number') return x
        if (typeof n !== 'number') return n
        if (k.name === 'ROUND') return runde(x, Math.trunc(n))
        const f = Math.pow(10, Math.trunc(n))
        const y = +(Math.abs(x) * f).toPrecision(15)
        return (Math.sign(x) * (k.name === 'ROUNDUP' ? Math.ceil(y) : Math.floor(y))) / f
      }
      case 'INT': {
        const x = alsZahl(ein(0))
        return typeof x === 'number' ? Math.floor(x) : x
      }
      case 'ABS': {
        const x = alsZahl(ein(0))
        return typeof x === 'number' ? Math.abs(x) : x
      }
      case 'IF':
      case 'WENN': {
        const c = alsWahrheit(ein(0))
        if (typeof c !== 'boolean') return c
        if (c) return a[1] ? this.einzeln(a[1], b) : true
        return a[2] ? this.einzeln(a[2], b) : false
      }
      case 'IFERROR': {
        const v = ein(0)
        return istFehler(v) ? ein(1) : v
      }
      case 'AND':
      case 'OR': {
        const werte = a.map((x) => alsWahrheit(this.einzeln(x, b)))
        const f = werte.find((x): x is Fehler => typeof x !== 'boolean')
        if (f) return f
        return k.name === 'AND' ? werte.every(Boolean) : werte.some(Boolean)
      }
      case 'NOT': {
        const c = alsWahrheit(ein(0))
        return typeof c === 'boolean' ? !c : c
      }
      case 'SUM': {
        const z = this.zahlen(a, b)
        return Array.isArray(z) ? z.reduce((s, x) => s + x, 0) : z
      }
      case 'MAX':
      case 'MIN': {
        const z = this.zahlen(a, b)
        if (!Array.isArray(z)) return z
        if (!z.length) return 0
        return k.name === 'MAX' ? Math.max(...z) : Math.min(...z)
      }
      case 'AVERAGE': {
        const z = this.zahlen(a, b)
        if (!Array.isArray(z)) return z
        return z.length ? z.reduce((s, x) => s + x, 0) / z.length : FEHLER('#DIV/0!')
      }
      case 'VLOOKUP':
      case 'SVERWEIS':
        return this.sverweis(a, b)
      case 'CONCATENATE':
      case 'CONCAT':
        return a.map((x) => alsText(this.einzeln(x, b))).join('')
      default:
        throw new Error(`Funktion ${k.name} wird nicht unterstützt`)
    }
  }
}

export { istFehler }
