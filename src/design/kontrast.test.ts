// @vitest-environment node
// Beta 3, Paket 6: Sonnen-Kontrast. Prüft die Werte in tokens.css (Kontrastverhältnis nach WCAG)
// und den Schalter (Geräte-Einstellung → Attribut am <html>).
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ladeGeraeteEinstellungen, speichereGeraeteEinstellungen, wendeKontrastAn } from '@/profil'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf-8')

/** Die Token-Zeilen `--name: wert;` des ersten Blocks mit dem Kopf `kopf {`. */
function tokens(kopf: string): Record<string, string> {
  const start = css.indexOf(`${kopf} {`)
  if (start < 0) throw new Error(`Block ${kopf} fehlt`)
  const ende = css.indexOf('\n}', start)
  const t: Record<string, string> = {}
  for (const m of css.slice(start, ende).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) t[m[1]!] = m[2]!.trim()
  return t
}

const hell = tokens(':root')
const sonne = { ...hell, ...tokens(":root[data-kontrast='sonne']") }

function luminanz(hex: string): number {
  const k = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * k[0]! + 0.7152 * k[1]! + 0.0722 * k[2]!
}
function kontrast(a: string, b: string): number {
  const [x, y] = [luminanz(a), luminanz(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}
const px = (s: string) => Number.parseInt(s, 10)

describe('Sonnen-Kontrast: Design-Tokens', () => {
  it('der Block ändert nur Tokens, die es auch im Normalfall gibt', () => {
    for (const name of Object.keys(tokens(":root[data-kontrast='sonne']"))) expect(hell, name).toHaveProperty(name)
  })

  it('Texte: mindestens 12:1 auf Weiß (Normalfall: weniger)', () => {
    for (const t of ['--farbe-text', '--farbe-text-2', '--farbe-akzent', '--farbe-warnung']) {
      expect(kontrast(sonne[t]!, sonne['--farbe-grund']!), t).toBeGreaterThanOrEqual(t === '--farbe-warnung' ? 8 : 11)
      expect(kontrast(sonne[t]!, sonne['--farbe-grund']!), t).toBeGreaterThan(kontrast(hell[t]!, hell['--farbe-grund']!) - 0.01)
    }
    expect(kontrast(sonne['--farbe-text']!, sonne['--farbe-grund']!)).toBeGreaterThanOrEqual(12)
    expect(kontrast(sonne['--farbe-text-2']!, sonne['--farbe-grund']!)).toBeGreaterThanOrEqual(12)
  })

  it('Ränder und Trennlinien deutlich kräftiger', () => {
    expect(kontrast(sonne['--farbe-rand']!, sonne['--farbe-grund']!)).toBeGreaterThanOrEqual(7)
    expect(kontrast(sonne['--farbe-linie']!, sonne['--farbe-grund']!)).toBeGreaterThanOrEqual(4.5)
    expect(kontrast(sonne['--farbe-linie']!, sonne['--farbe-grund']!)).toBeGreaterThan(2 * kontrast(hell['--farbe-linie']!, hell['--farbe-grund']!))
    expect(px(sonne['--linie']!)).toBeGreaterThan(px(hell['--linie']!))
  })

  it('Schrift auf Flächen bleibt gut lesbar (Knopf, Warnung, ausgewählt)', () => {
    expect(kontrast(sonne['--farbe-auf-akzent']!, sonne['--farbe-akzent']!)).toBeGreaterThanOrEqual(11)
    expect(kontrast(sonne['--farbe-warnung']!, sonne['--farbe-warnung-hell']!)).toBeGreaterThanOrEqual(7)
    expect(kontrast(sonne['--farbe-akzent-gedrueckt']!, sonne['--farbe-akzent-hell']!)).toBeGreaterThanOrEqual(11)
    expect(kontrast(sonne['--farbe-text']!, sonne['--farbe-flaeche']!)).toBeGreaterThanOrEqual(12)
    expect(kontrast(sonne['--farbe-fokus']!, sonne['--farbe-grund']!)).toBeGreaterThanOrEqual(7)
  })

  it('Schrift und Berührflächen größer, Schrift kräftiger', () => {
    for (const t of ['--schrift-mini', '--schrift-klein', '--schrift-basis', '--schrift-titel', '--schrift-gross']) {
      expect(px(sonne[t]!), t).toBeGreaterThan(px(hell[t]!))
    }
    expect(px(sonne['--schrift-basis']!)).toBeGreaterThanOrEqual(18)
    expect(px(sonne['--beruehr-min']!)).toBeGreaterThan(px(hell['--beruehr-min']!))
    expect(px(sonne['--gewicht-normal']!)).toBeGreaterThan(px(hell['--gewicht-normal']!))
  })

  it('Rest des Designs unverändert: keine Abstände, Radien oder Farbe des Hintergrunds', () => {
    const geaendert = Object.keys(tokens(":root[data-kontrast='sonne']"))
    for (const t of geaendert) expect(t, t).not.toMatch(/abstand|radius|farbe-grund|farbe-flaeche|farbe-auf-akzent/)
  })
})

describe('Sonnen-Kontrast: Schalter', () => {
  const speicher = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => void speicher.set(k, v),
    removeItem: (k: string) => void speicher.delete(k),
  })
  afterEach(() => speicher.clear())

  it('Standard: aus; „nur WLAN“ bleibt an', () => {
    expect(ladeGeraeteEinstellungen()).toEqual({ nurWlan: true, sonnenKontrast: false })
  })

  it('speichert nur die genannte Einstellung, die andere bleibt', () => {
    speichereGeraeteEinstellungen({ nurWlan: false })
    speichereGeraeteEinstellungen({ sonnenKontrast: true })
    expect(ladeGeraeteEinstellungen()).toEqual({ nurWlan: false, sonnenKontrast: true })
    speichereGeraeteEinstellungen({ nurWlan: true })
    expect(ladeGeraeteEinstellungen()).toEqual({ nurWlan: true, sonnenKontrast: true })
  })

  it('übernimmt eine ältere Einstellung ohne Kontrast-Feld', () => {
    speicher.set('wep-geraete-einstellungen', JSON.stringify({ nurWlan: false }))
    expect(ladeGeraeteEinstellungen()).toEqual({ nurWlan: false, sonnenKontrast: false })
  })

  it('setzt und entfernt data-kontrast am Dokument', () => {
    const wurzel = { dataset: {} as Record<string, string | undefined> }
    wendeKontrastAn(true, wurzel)
    expect(wurzel.dataset.kontrast).toBe('sonne')
    wendeKontrastAn(false, wurzel)
    expect(wurzel.dataset.kontrast).toBeUndefined()
  })

  it('beim Start gilt die gespeicherte Einstellung', () => {
    const wurzel = { dataset: {} as Record<string, string | undefined> }
    wendeKontrastAn(undefined, wurzel)
    expect(wurzel.dataset.kontrast).toBeUndefined()
    speichereGeraeteEinstellungen({ sonnenKontrast: true })
    wendeKontrastAn(undefined, wurzel)
    expect(wurzel.dataset.kontrast).toBe('sonne')
  })

  it('kaputter Speicher: Standard, kein Fehler', () => {
    speicher.set('wep-geraete-einstellungen', '{kaputt')
    expect(ladeGeraeteEinstellungen().sonnenKontrast).toBe(false)
  })
})
