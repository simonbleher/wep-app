/**
 * Zahlenformate der Vorlage („#,##0.00\ "€"“, Buchhaltungsformate, Datum …) in deutscher Schreibweise:
 * Komma als Dezimalzeichen, Punkt als Tausendertrenner. Das Ergebnis besteht aus einem linken und einem rechten
 * Teil (Buchhaltungsformate mit „*“ füllen den Raum dazwischen), die der Renderer an den Zellrändern ausrichtet.
 */
import { runde } from './formeln'
import type { Zellwert } from './mappe'

export interface Anzeige {
  /** Text (bei Füllformaten der linke Teil). */
  links: string
  /** Nur bei Füllformaten (`*`): der rechte Teil, rechtsbündig. */
  rechts?: string
  /** Zahlen stehen rechts, Text links (nur für Ausrichtung „Standard“). */
  zahl: boolean
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

/** Excel-Seriennummer → Datum (UTC). */
function datumAusSerie(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000 + Math.round((n % 1) * 86400000))
}

interface Abschnitt {
  text: string
  bedingung?: (n: number) => boolean
  farbe?: string
}

function teileAb(code: string): Abschnitt[] {
  const teile: string[] = []
  let akt = ''
  let inText = false
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '\\') {
      akt += c + (code[i + 1] ?? '')
      i++
    } else if (c === '"') {
      inText = !inText
      akt += c
    } else if (c === ';' && !inText) {
      teile.push(akt)
      akt = ''
    } else akt += c
  }
  teile.push(akt)
  return teile.map((t) => {
    const a: Abschnitt = { text: t }
    // Bedingung und Farbe in eckigen Klammern am Anfang
    for (;;) {
      const m = /^\[([^\]]*)\]/.exec(a.text)
      if (!m) break
      const inhalt = m[1]
      const b = /^([<>=]+)\s*(-?[\d.]+)$/.exec(inhalt)
      if (b) {
        const v = Number(b[2])
        a.bedingung = (n) => (b[1] === '<' ? n < v : b[1] === '>' ? n > v : b[1] === '<=' ? n <= v : b[1] === '>=' ? n >= v : b[1] === '=' ? n === v : n !== v)
      } else if (/^(red|rot)$/i.test(inhalt)) a.farbe = 'FF0000'
      else if (/^\$.*-/.test(inhalt)) {
        // Währungs-/Gebietsschema „[$€-407]“ → Zeichen vor dem „-“ ist die Währung
        const w = /^\$([^-]*)/.exec(inhalt)
        a.text = (w ? w[1] : '') + a.text.slice(m[0].length)
        break
      }
      a.text = a.text.slice(m[0].length)
    }
    return a
  })
}

function istDatum(code: string): boolean {
  const roh = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '')
  return /[dmyhs]/i.test(roh.replace(/_.|\*./g, '')) && !/^[#0?.,%\s€$-]*$/.test(roh)
}

/** Zeichen eines Formats mit Zahl. `*x` trennt links/rechts. */
function formatiereZahl(abschnitt: string, wert: number, vorzeichenZeigen: boolean): { links: string; rechts?: string } {
  // Zahl-Teil bestimmen
  let ausgabe = ''
  let fuell = -1
  const prozent = /%(?=(?:[^"]*"[^"]*")*[^"]*$)/.test(abschnitt.replace(/\\./g, ''))
  const x = Math.abs(wert) * (prozent ? 100 : 1)

  // Zahlbereich: zusammenhängende #,0,?,. innerhalb des Abschnitts (ohne Texte)
  let i = 0
  const rest = abschnitt
  const tokens: { art: 'lit' | 'platz' | 'fill'; s: string }[] = []
  while (i < rest.length) {
    const c = rest[i]
    if (c === '"') {
      const j = rest.indexOf('"', i + 1)
      tokens.push({ art: 'lit', s: rest.slice(i + 1, j < 0 ? rest.length : j) })
      i = j < 0 ? rest.length : j + 1
    } else if (c === '\\') {
      tokens.push({ art: 'lit', s: rest[i + 1] ?? '' })
      i += 2
    } else if (c === '_') {
      // Platz in Breite des nächsten Zeichens: im PDF ein schmaler Leerraum
      tokens.push({ art: 'lit', s: ' ' })
      i += 2
    } else if (c === '*') {
      tokens.push({ art: 'fill', s: rest[i + 1] ?? ' ' })
      i += 2
    } else if ('#0?,.'.includes(c)) {
      let j = i
      while (j < rest.length && '#0?,.'.includes(rest[j])) j++
      tokens.push({ art: 'platz', s: rest.slice(i, j) })
      i = j
    } else if (c === '%') {
      tokens.push({ art: 'lit', s: '%' })
      i++
    } else if (c === 'E' && /^E[+-]/.test(rest.slice(i))) {
      tokens.push({ art: 'lit', s: rest.slice(i, i + 2) })
      i += 2
    } else if (c === '[') {
      const j = rest.indexOf(']', i)
      const inhalt = rest.slice(i + 1, j < 0 ? rest.length : j)
      // Währung („[$€-407]“) bleibt als Text, Farben und Bedingungen entfallen hier
      const w = /^\$([^-]*)/.exec(inhalt)
      if (w && w[1]) tokens.push({ art: 'lit', s: w[1] })
      i = j < 0 ? rest.length : j + 1
    } else {
      tokens.push({ art: 'lit', s: c })
      i++
    }
  }

  for (const t of tokens) {
    if (t.art === 'lit') ausgabe += t.s
    else if (t.art === 'fill') {
      fuell = ausgabe.length
    } else {
      const platz = t.s
      const dez = platz.indexOf('.')
      const ganz = dez < 0 ? platz : platz.slice(0, dez)
      const nach = dez < 0 ? '' : platz.slice(dez + 1)
      const tausend = ganz.includes(',')
      const stellen = nach.replace(/,/g, '').length
      const r = runde(x, stellen)
      let [g, d = ''] = r.toFixed(stellen).split('.')
      const platzhalter = ganz.replace(/,/g, '')
      if (g === '0' && !/0/.test(platzhalter)) g = ''
      // Auffüllen von rechts nach links: „0“ mit Null, „?“ mit Leerzeichen, „#“ gar nicht
      for (let k = platzhalter.length - 1 - g.length; k >= 0; k--) {
        if (platzhalter[k] === '0') g = '0' + g
        else if (platzhalter[k] === '?') g = ' ' + g
        else break
      }
      if (tausend) g = g.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      // „?“ = Platzhalter in Ziffernbreite (für Null)
      const fragezeichen = (nach.match(/\?/g) ?? []).length
      if (fragezeichen && Number(r) === 0) d = ''.padEnd(stellen, ' ')
      // Überzählige „#“ am Ende der Nachkommastellen abschneiden („0.0#“)
      let ende = d.length
      while (ende > 0 && nach[ende - 1] === '#' && d[ende - 1] === '0') ende--
      d = d.slice(0, ende)
      ausgabe += g + (d ? ',' + d : '')
    }
  }
  if (vorzeichenZeigen && wert < 0 && !/^-/.test(ausgabe)) ausgabe = '-' + ausgabe
  if (fuell >= 0) return { links: ausgabe.slice(0, fuell), rechts: ausgabe.slice(fuell) }
  return { links: ausgabe }
}

function formatiereDatum(code: string, n: number): string {
  const d = datumAusSerie(n)
  const roh = code.replace(/\[[^\]]*\]/g, '')
  let aus = ''
  for (let i = 0; i < roh.length; ) {
    const c = roh[i]
    if (c === '"') {
      const j = roh.indexOf('"', i + 1)
      aus += roh.slice(i + 1, j < 0 ? roh.length : j)
      i = j < 0 ? roh.length : j + 1
      continue
    }
    if (c === '\\') {
      aus += roh[i + 1] ?? ''
      i += 2
      continue
    }
    if (c === '_' || c === '*') {
      aus += c === '_' ? ' ' : ''
      i += 2
      continue
    }
    const lauf = /^(d+|m+|y+|h+|s+)/i.exec(roh.slice(i))
    if (!lauf) {
      aus += c === ';' ? '' : c
      i++
      continue
    }
    const t = lauf[1]
    const l = t.toLowerCase()
    const p2 = (v: number) => String(v).padStart(2, '0')
    if (l[0] === 'd') aus += l.length >= 4 ? TAGE[d.getUTCDay()] : l.length === 3 ? TAGE[d.getUTCDay()].slice(0, 2) : l.length === 2 ? p2(d.getUTCDate()) : String(d.getUTCDate())
    else if (l[0] === 'y') aus += l.length <= 2 ? p2(d.getUTCFullYear() % 100) : String(d.getUTCFullYear())
    else if (l[0] === 'm') aus += l.length >= 4 ? MONATE[d.getUTCMonth()] : l.length === 3 ? MONATE[d.getUTCMonth()].slice(0, 3) : l.length === 2 ? p2(d.getUTCMonth() + 1) : String(d.getUTCMonth() + 1)
    else if (l[0] === 'h') aus += l.length === 2 ? p2(d.getUTCHours()) : String(d.getUTCHours())
    else aus += p2(d.getUTCSeconds())
    i += t.length
  }
  return aus
}

/** Allgemeines Format: bis zu 10 gültige Stellen, deutsches Komma. */
export function allgemein(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n)
  const s = String(+n.toPrecision(10))
  return s.includes('e') ? s.replace('.', ',').replace('e+', 'E+').replace('e-', 'E-') : s.replace('.', ',')
}

export interface FormatErgebnis extends Anzeige {
  farbe?: string
}

/** Wert nach Zahlenformat anzeigen; `null` = nichts anzeigen. */
export function zeigeWert(wert: Zellwert, code: string): FormatErgebnis | null {
  if (wert === null || wert === '') return null
  if (typeof wert === 'object') return { links: wert.fehler, zahl: false }
  if (typeof wert === 'boolean') return { links: wert ? 'WAHR' : 'FALSCH', zahl: false }
  const abschnitte = teileAb(code === 'General' ? 'General' : code)
  if (typeof wert === 'string') {
    // Textabschnitt (mit @) – sonst der Text selbst
    const t = abschnitte.find((a) => a.text.includes('@'))
    if (!t) return { links: wert, zahl: false }
    const text = t.text.replace(/\\(.)/g, '$1').replace(/"([^"]*)"/g, '$1').replace(/_./g, ' ')
    const stern = text.indexOf('*')
    const z = text.replace('@', wert)
    return stern >= 0 ? { links: text.slice(0, stern).replace('@', wert), rechts: z.slice(stern + 2), zahl: false } : { links: z, zahl: false }
  }
  if (code === 'General' || code === '@') return { links: allgemein(wert), zahl: true }

  // Abschnitt wählen
  let wahl: Abschnitt
  const mitBedingung = abschnitte.some((a) => a.bedingung)
  if (mitBedingung) {
    wahl = abschnitte.find((a) => a.bedingung?.(wert)) ?? abschnitte[abschnitte.length - 1]
  } else if (abschnitte.length >= 3 && wert === 0) wahl = abschnitte[2]
  else if (abschnitte.length >= 2 && wert < 0) wahl = abschnitte[1]
  else wahl = abschnitte[0]
  const negativ = wert < 0 && !mitBedingung && abschnitte.length >= 2
  const code1 = wahl.text
  if (istDatum(code1)) return { links: formatiereDatum(code1, wert), zahl: true }
  if (code1.trim() === '' && wahl !== abschnitte[0]) return null
  const f = formatiereZahl(code1, wert, !negativ || false)
  return { ...f, zahl: true, farbe: wahl.farbe }
}
