/**
 * `window.wep.skizze.baustein(name, parameter)`: fertige Zeichnungen aus Grundformen als Hilfe für den Agenten.
 *
 * Die App kennt für den Vorschlag nur Grundformen (Rechteck, Ellipse, Vieleck, Bogen, Linie, Maßlinie, Text). Ein Baum ist dort
 * kein Baum, sondern ein Stamm (Rechteck) plus drei Kronenkreise – genau wie im Skill parzellen-skizze. Damit der Agent diese
 * Rechnerei (Kronenkreise, Heckenreihe, Stern, Viertelbogen des Tors …) nicht selbst machen muss, liefert `baustein` die Grundformen
 * für einen Gegenstand, die er unverändert oder angepasst in seinen Vorschlag übernehmen kann. Die Zeichenbefehle stammen aus
 * derselben Quelle wie die Symbole des Nutzers (`src/skizze/symbole.ts`), die Bausteine sehen also gleich aus.
 */
import { symbolPrims, type Prim } from '../skizze/symbole'
import { SYMBOL_ARTEN, type SymbolArt } from '../skizze/types'
import type { FormatElement, MPunkt } from './format'
import { r2, standardgroesseM } from './umrechnung'

/** Pt des Excel-Blatts je Meter (445 pt ≙ 20 m): die Symbole sind in pt gezeichnet. */
const PT_PRO_M = 445 / 20

export const BAUSTEIN_NAMEN: readonly SymbolArt[] = SYMBOL_ARTEN

export interface BausteinParameter {
  /** Mittelpunkt in m. */
  x: number
  y: number
  /** Größe in m; weggelassen = Standardgröße (`lesen().stile.bausteine`). */
  breite?: number
  hoehe?: number
  /** Beschriftung (Art, „<Name> entfernen“, Hinweistext). */
  beschriftung?: string
  /** Nur `mangelhinweis`: Punkt in m, auf den der Pfeil zeigt. */
  ziel?: MPunkt
}

export interface BausteinErgebnis {
  ok: boolean
  fehler: { pfad: string; meldung: string }[]
  /** Grundformen, in Zeichenreihenfolge (hinten zuerst), bereit für `elemente` im Vorschlag. */
  elemente: FormatElement[]
}

const BESCHREIBUNG: Record<SymbolArt, string> = {
  baum: 'Stamm (Rechteck) und Krone aus drei Kreisen',
  strauch: 'drei grüne Kreise mit weißen Blüten',
  wildling: 'dünner Stamm mit Pfahl und kleiner Krone',
  kletterpflanze: 'Rankgitter (Linien), Ranke, Blätter und Trauben (Kreise)',
  hecke: 'Reihe überlappender, versetzter Kreise entlang der längeren Seite (lila bei „Flieder“ in der Beschriftung)',
  beet: 'braunes Rechteck',
  hochbeet: 'braune Ellipse',
  blumenbeet: 'Rechteck mit bunten Blüten (Kreise)',
  rasen: 'nur Beschriftung',
  kompost: 'braunes Rechteck mit drei Latten (Linien) und Beschriftung darüber',
  brunnen: 'blaue Ellipse mit weißem Innenkreis',
  schacht: 'graues Quadrat',
  weg: 'beiges Rechteck mit Beschriftung',
  tor: 'senkrechte Linie mit Viertelbogen (Linienzug)',
  holzpferd: 'Schaukelpferd aus Linien, Ellipsen und Vieleck',
  schaukel: 'Gestell aus Linien mit Sitz',
  gegenstand: 'Rechteck mit Diagonalen und Namen darunter',
  entfernen: 'Pflanze: grüner Stern (Vieleck) mit rotem X; sonst kleines rotes X; mit rotem Hinweisfeld und Pfeil',
  mangelhinweis: 'weißes Rechteck mit rotem Rand und Text, optional roter Pfeil zum Ziel',
}

/** Beschreibung der Bausteine für `lesen().stile.bausteine`. */
export function bausteinInfos(): { name: string; beschreibung: string; standardgroesseM: { breite: number; hoehe: number } }[] {
  return BAUSTEIN_NAMEN.map((name) => ({ name, beschreibung: BESCHREIBUNG[name], standardgroesseM: standardgroesseM(name) }))
}

const istZahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const istPunkt = (v: unknown): v is MPunkt => typeof v === 'object' && v !== null && istZahl((v as MPunkt).x) && istZahl((v as MPunkt).y)

/** Zeichenbefehl (in pt) → Grundform (in m). */
function primZuFormat(p: Prim, name: string): FormatElement[] {
  const m = (pt: number) => r2(pt / PT_PRO_M)
  const breite = (sw?: number) => Math.max(0.25, Math.min(6, sw ?? 1))
  switch (p.k) {
    case 'rect':
      return [
        {
          typ: 'rechteck',
          name,
          x: m(p.x + p.w / 2),
          y: m(p.y + p.h / 2),
          breite: m(p.w),
          hoehe: m(p.h),
          ...(p.fill ? { fuellung: p.fill } : {}),
          // ohne eigenen Rand: Randfarbe = Füllfarbe (sieht aus wie „ohne Rand“)
          ...((p.stroke ?? p.fill) ? { linie: p.stroke ?? p.fill } : {}),
          linienbreite: breite(p.sw),
        },
      ]
    case 'ellipse':
      return [
        {
          typ: 'ellipse',
          name,
          x: m(p.cx),
          y: m(p.cy),
          breite: m(2 * p.rx),
          hoehe: m(2 * p.ry),
          ...(p.fill ? { fuellung: p.fill } : {}),
          ...((p.stroke ?? p.fill) ? { linie: p.stroke ?? p.fill } : {}),
          linienbreite: breite(p.sw),
        },
      ]
    case 'line':
      return [{ typ: 'linie', name, von: { x: m(p.x1), y: m(p.y1) }, nach: { x: m(p.x2), y: m(p.y2) }, farbe: p.stroke, linienbreite: breite(p.sw), ...(p.pfeil ? { pfeil: true } : {}) }]
    case 'poly':
      return [
        {
          typ: 'vieleck',
          name,
          punkte: p.pts.map(([x, y]) => ({ x: m(x), y: m(y) })),
          ...(p.closed ? {} : { offen: true }),
          ...(p.closed && p.fill ? { fuellung: p.fill } : {}),
          ...((p.stroke ?? p.fill) ? { linie: p.stroke ?? p.fill } : {}),
          linienbreite: breite(p.sw),
        },
      ]
    case 'text': {
      const halb = p.anchor === 'start' ? (p.s.length * p.size * 0.55) / 2 : 0
      return [{ typ: 'text', name, x: m(p.x + halb), y: m(p.y - p.size * 0.35), inhalt: p.s, groesse: Math.max(5, Math.min(28, p.size)), farbe: p.fill }]
    }
  }
}

/**
 * Grundformen für einen Gegenstand (`baum`, `hecke`, `weg`, `tor`, `kompost`, `entfernen`, `mangelhinweis` …).
 * Lage und Größe in Metern (Mittelpunkt); die Formen erhalten den Namen des Bausteins.
 */
export function baustein(name: unknown, parameter: unknown): BausteinErgebnis {
  const fehler: BausteinErgebnis['fehler'] = []
  const f = (pfad: string, meldung: string) => fehler.push({ pfad, meldung })
  if (typeof name !== 'string' || !(BAUSTEIN_NAMEN as readonly string[]).includes(name)) {
    f('name', `Unbekannter Baustein ${JSON.stringify(name)}. Erlaubt: ${BAUSTEIN_NAMEN.join(', ')}.`)
    return { ok: false, fehler, elemente: [] }
  }
  const art = name as SymbolArt
  const p = (typeof parameter === 'object' && parameter !== null ? parameter : {}) as Record<string, unknown>
  const erlaubt = ['x', 'y', 'breite', 'hoehe', 'beschriftung', 'ziel']
  for (const k of Object.keys(p)) if (!erlaubt.includes(k)) f(k, `Unbekanntes Feld „${k}“. Erlaubt: ${erlaubt.join(', ')}.`)
  if (!istZahl(p.x)) f('x', '„x“ fehlt (Mittelpunkt in m, Zahl).')
  if (!istZahl(p.y)) f('y', '„y“ fehlt (Mittelpunkt in m, Zahl).')
  const std = standardgroesseM(art)
  for (const k of ['breite', 'hoehe'] as const) {
    if (p[k] !== undefined && (!istZahl(p[k]) || (p[k] as number) <= 0 || (p[k] as number) > 500)) f(k, `„${k}“ ist die Größe in m (größer als 0).`)
  }
  if (p.beschriftung !== undefined && (typeof p.beschriftung !== 'string' || p.beschriftung.length > 120)) f('beschriftung', 'beschriftung ist ein Text (höchstens 120 Zeichen).')
  if (p.ziel !== undefined && (art !== 'mangelhinweis' || !istPunkt(p.ziel))) f('ziel', art === 'mangelhinweis' ? 'ziel ist ein Punkt { "x", "y" } in m.' : '„ziel“ gibt es nur beim Baustein „mangelhinweis“. Für andere Pfeile eine „linie“ mit pfeil: true nehmen.')
  if (art === 'mangelhinweis' && typeof p.beschriftung !== 'string') f('beschriftung', 'Ein Mängelhinweis braucht „beschriftung“ (den Hinweistext).')
  if (fehler.length) return { ok: false, fehler, elemente: [] }

  const b = (p.breite as number | undefined) ?? std.breite
  const h = (p.hoehe as number | undefined) ?? std.hoehe
  const mx = p.x as number
  const my = p.y as number
  const kasten = { x: (mx - b / 2) * PT_PRO_M, y: (my - h / 2) * PT_PRO_M, w: b * PT_PRO_M, h: h * PT_PRO_M }
  const ziel = p.ziel as MPunkt | undefined
  const prims = symbolPrims(art, kasten, (p.beschriftung as string | undefined) ?? '', {
    schrift: 9,
    ...(ziel ? { ziel: { x: ziel.x * PT_PRO_M, y: ziel.y * PT_PRO_M } } : {}),
  })
  return { ok: true, fehler: [], elemente: prims.flatMap((pr) => primZuFormat(pr, art)) }
}
