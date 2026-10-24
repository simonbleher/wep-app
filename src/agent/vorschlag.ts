/**
 * Skizzen-Vorschlag (`window.wep.skizze.vorschlagen`): prüft den Vorschlag eines Agenten (verständliche Fehler mit Pfad)
 * und macht daraus Skizzenelemente in Pixeln. Nichts davon wird gespeichert – erst die Bestätigung des Nutzers im Editor.
 *
 * Format `wep-skizze/1`: `{ "format": "wep-skizze/1", "modus": "ergaenzen" | "gruen-ersetzen", "elemente": [ … ] }`,
 * Längen in Metern auf der Parzelle (Ursprung links oben), `x`/`y` = Mittelpunkt. Siehe docs/WEP-SCHNITTSTELLE.md.
 */
import { wepRolle, type Wep } from '../model/types'
import { lageVon } from '../parzelle'
import { punktImPolygon } from '../parzelle/polygon'
import { imVieleck } from '../skizze/geometrie'
import { normalisiereFarbe, vorgabe } from '../skizze/stile'
import type { Linienart, PositionsBezug, SkizzeBauform, SkizzeDaten, SkizzeElement, SymbolArt } from '../skizze/types'
import { SYMBOL_ARTEN, istGrundlage, neueId } from '../skizze/types'
import {
  BEZUGS_LISTEN,
  FORM_TYPEN,
  MODI,
  SKIZZE_FORMAT,
  type BezugsListe,
  type FormatFehler,
  type Modus,
  type MPunkt,
  type VorschlagErgebnis,
} from './format'
import { kurzname } from './lesen'
import { abbildungFuer, mZuPx, r1, standardgroesseM } from './umrechnung'

/** Obergrenzen, damit ein fehlerhafter Vorschlag die Skizze nicht sprengt. */
export const MAX_ELEMENTE = 400
const MAX_KOORDINATE_M = 1000
const MAX_GROESSE_M = 500
const MAX_TEXT = 120
const MAX_PUNKTE = 200

type Rohobjekt = Record<string, unknown>
const istObjekt = (v: unknown): v is Rohobjekt => typeof v === 'object' && v !== null && !Array.isArray(v)
const istZahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const STIL_FELDER = ['stil', 'fuellung', 'linie', 'linienart', 'beschriftung', 'bezug'] as const
const ALLGEMEIN = ['typ', 'id'] as const
const FELDER: Record<string, readonly string[]> = {
  symbol: [...ALLGEMEIN, 'x', 'y', 'breite', 'hoehe', 'beschriftung', 'bezug', 'ziel'],
  rechteck: [...ALLGEMEIN, 'x', 'y', 'breite', 'hoehe', ...STIL_FELDER],
  ellipse: [...ALLGEMEIN, 'x', 'y', 'breite', 'hoehe', ...STIL_FELDER],
  vieleck: [...ALLGEMEIN, 'punkte', ...STIL_FELDER],
  linie: [...ALLGEMEIN, 'von', 'nach', 'farbe', 'linienart', 'pfeil'],
  massangabe: [...ALLGEMEIN, 'von', 'nach', 'beschriftung', 'farbe'],
  text: [...ALLGEMEIN, 'x', 'y', 'inhalt'],
}

export interface GeprueftVorschlag extends VorschlagErgebnis {
  modus: Modus | null
  /** Skizzenelemente in Pixeln (leer, solange nicht `ok`). */
  elemente: SkizzeElement[]
}

interface Kontext {
  wep: Wep
  fehler: FormatFehler[]
  hinweise: string[]
}

const fehlt = (k: Kontext, pfad: string, meldung: string) => k.fehler.push({ pfad, meldung })

function zahlFeld(k: Kontext, o: Rohobjekt, feld: string, pfad: string, opt: { min?: number; max?: number; pflicht?: boolean; groesser0?: boolean } = {}): number | undefined {
  const v = o[feld]
  const p = `${pfad}.${feld}`
  if (v === undefined) {
    if (opt.pflicht) fehlt(k, p, `„${feld}“ fehlt (Zahl in Metern).`)
    return undefined
  }
  if (!istZahl(v)) {
    fehlt(k, p, `„${feld}“ muss eine Zahl in Metern sein, nicht ${typeof v === 'string' ? `der Text „${v}“` : JSON.stringify(v)}.`)
    return undefined
  }
  if (opt.groesser0 && v <= 0) {
    fehlt(k, p, `„${feld}“ muss größer als 0 sein (ist ${v}).`)
    return undefined
  }
  const min = opt.min ?? -MAX_KOORDINATE_M
  const max = opt.max ?? MAX_KOORDINATE_M
  if (v < min || v > max) {
    fehlt(k, p, `„${feld}“ = ${v} liegt außerhalb des erlaubten Bereichs (${min} bis ${max} m).`)
    return undefined
  }
  return v
}

function punktFeld(k: Kontext, v: unknown, pfad: string, pflicht = true): MPunkt | undefined {
  if (v === undefined) {
    if (pflicht) fehlt(k, pfad, 'Punkt fehlt (Objekt mit x und y in Metern).')
    return undefined
  }
  if (!istObjekt(v)) {
    fehlt(k, pfad, 'Ein Punkt ist ein Objekt mit x und y in Metern, z. B. { "x": 3.5, "y": 4 }.')
    return undefined
  }
  const extra = Object.keys(v).filter((f) => f !== 'x' && f !== 'y')
  if (extra.length) fehlt(k, pfad, `Unbekanntes Feld „${extra[0]}“ am Punkt (erlaubt: x, y).`)
  const x = zahlFeld(k, v, 'x', pfad, { pflicht: true })
  const y = zahlFeld(k, v, 'y', pfad, { pflicht: true })
  return x === undefined || y === undefined ? undefined : { x, y }
}

/** Farbe als `#RRGGBB` oder Name einer Vorgabe (dann deren Füllung bzw. Linie) – sonst Fehler. */
function farbFeld(k: Kontext, v: unknown, pfad: string, art: 'fuellung' | 'linie'): string | undefined {
  if (typeof v !== 'string') {
    fehlt(k, pfad, `Farbe als Text „#RRGGBB“ angeben, z. B. „#C5E0B4“ (Vorgaben unter stile.vorgaben).`)
    return undefined
  }
  const hex = normalisiereFarbe(v)
  if (hex) return hex
  const vg = vorgabe(v.trim().toLowerCase())
  const wert = vg ? (art === 'fuellung' ? vg.fuellung : vg.linie) : undefined
  if (wert) return wert
  fehlt(k, pfad, `„${v}“ ist keine Farbe. Erlaubt: „#RRGGBB“ (Hex) oder der Name einer Vorgabe (${['wiese', 'weg', 'kompost', 'flieder', 'hecke'].join(', ')} …).`)
  return undefined
}

function textFeld(k: Kontext, v: unknown, pfad: string): string | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'string') {
    fehlt(k, pfad, 'Text erwartet.')
    return undefined
  }
  const t = v.trim()
  if (t.length > MAX_TEXT) {
    fehlt(k, pfad, `Text ist zu lang (${t.length} Zeichen, höchstens ${MAX_TEXT}).`)
    return undefined
  }
  return t
}

/** Nachschlagen der Position, auf die sich ein Element bezieht. */
function bezugPruefen(k: Kontext, v: unknown, pfad: string): { bezug: PositionsBezug; name: string } | undefined {
  if (v === undefined) return undefined
  if (!istObjekt(v)) {
    fehlt(k, pfad, 'bezug ist ein Objekt: { "liste": "aufwuchs", "id": "<Position.id aus lesen()>" }.')
    return undefined
  }
  const extra = Object.keys(v).filter((f) => f !== 'liste' && f !== 'id')
  if (extra.length) fehlt(k, pfad, `Unbekanntes Feld „${extra[0]}“ im Bezug (erlaubt: liste, id).`)
  const liste = v.liste
  if (typeof liste !== 'string' || !(BEZUGS_LISTEN as readonly string[]).includes(liste)) {
    fehlt(k, `${pfad}.liste`, `liste muss „aufwuchs“, „aussenanlagen“ oder „beseitigung“ sein (ist ${JSON.stringify(liste)}).`)
    return undefined
  }
  const id = v.id
  if (typeof id !== 'string' || !id) {
    fehlt(k, `${pfad}.id`, 'id fehlt: die Kennung der Position aus lesen() (gruen.aufwuchs[].id usw.).')
    return undefined
  }
  const g = k.wep.gruen
  const l = liste as BezugsListe
  const gefunden =
    l === 'beseitigung'
      ? g.beseitigungAA.find((p) => p.id === id)
      : (l === 'aufwuchs' ? g.aufwuchs : g.aussenanlagen).find((p) => p.id === id)
  if (!gefunden) {
    const kennungen = (l === 'beseitigung' ? g.beseitigungAA : l === 'aufwuchs' ? g.aufwuchs : g.aussenanlagen).map((p) => p.id)
    fehlt(k, `${pfad}.id`, `Keine Position „${id}“ in „${l}“.${kennungen.length ? ` Vorhanden: ${kennungen.slice(0, 8).join(', ')}${kennungen.length > 8 ? ' …' : ''}.` : ' Die Liste ist leer.'}`)
    return undefined
  }
  const name = 'gegenstand' in gefunden ? kurzname(gefunden.gegenstand) : kurzname(gefunden.bezeichnung)
  return { bezug: { liste: l, id }, name }
}

function linienartFeld(k: Kontext, v: unknown, pfad: string): Linienart | undefined {
  if (v === undefined) return undefined
  if (v === 'durchgezogen' || v === 'gestrichelt') return v
  fehlt(k, pfad, `linienart muss „durchgezogen“ oder „gestrichelt“ sein (ist ${JSON.stringify(v)}).`)
  return undefined
}

/** Stilangaben (Vorgabe, Füllung, Linie, Linienart) einer gefüllten Form. */
function stilFelder(k: Kontext, o: Rohobjekt, pfad: string): { fuellung?: string; linie?: string; linienart?: Linienart } {
  let fuellung: string | undefined
  let linie: string | undefined
  let linienart: Linienart | undefined
  if (o.stil !== undefined) {
    const v = typeof o.stil === 'string' ? vorgabe(o.stil.trim().toLowerCase()) : undefined
    if (!v) fehlt(k, `${pfad}.stil`, `Unbekannte Vorgabe ${JSON.stringify(o.stil)}. Erlaubt: ${['wiese', 'weg', 'kompost', 'flieder', 'hecke', 'beet', 'wasser', 'schacht', 'gebaeude', 'hinweis', 'entfernen', 'rahmen', 'gestrichelt'].join(', ')}.`)
    else {
      fuellung = v.fuellung
      linie = v.linie
      linienart = v.linienart
    }
  }
  if (o.fuellung !== undefined) {
    if (o.fuellung === null || o.fuellung === 'keine') fuellung = undefined
    else fuellung = farbFeld(k, o.fuellung, `${pfad}.fuellung`, 'fuellung') ?? fuellung
  }
  if (o.linie !== undefined) linie = farbFeld(k, o.linie, `${pfad}.linie`, 'linie') ?? linie
  if (o.linienart !== undefined) linienart = linienartFeld(k, o.linienart, `${pfad}.linienart`) ?? linienart
  // Standardfarbe der Linie weglassen (bestehende Skizzen sehen so unverändert aus)
  return {
    ...(fuellung ? { fuellung } : {}),
    ...(linie && linie.toUpperCase() !== '#1A1A1A' ? { linie } : {}),
    ...(linienart === 'gestrichelt' ? { linienart } : {}),
  }
}

const fmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

/** Ein Element prüfen und in ein Skizzenelement umrechnen; `null` bei Fehlern (sie stehen in `k.fehler`). */
function pruefeElement(k: Kontext, e: unknown, i: number, a: ReturnType<typeof abbildungFuer>['abb']): SkizzeElement | null {
  const pfad = `elemente[${i}]`
  if (!istObjekt(e)) {
    fehlt(k, pfad, 'Ein Element ist ein Objekt mit „typ“, z. B. { "typ": "baum", "x": 3, "y": 4 }.')
    return null
  }
  const typ = e.typ
  if (typeof typ !== 'string') {
    fehlt(k, `${pfad}.typ`, '„typ“ fehlt. Erlaubt: ' + [...SYMBOL_ARTEN, ...FORM_TYPEN].join(', ') + '.')
    return null
  }
  const istSymbol = (SYMBOL_ARTEN as readonly string[]).includes(typ)
  const istForm = (FORM_TYPEN as readonly string[]).includes(typ)
  if (!istSymbol && !istForm) {
    fehlt(k, `${pfad}.typ`, `Unbekannter Typ „${typ}“. Erlaubt: ${[...SYMBOL_ARTEN, ...FORM_TYPEN].join(', ')}.`)
    return null
  }
  const erlaubt = FELDER[istSymbol ? 'symbol' : typ]
  const anfang = k.fehler.length
  for (const f of Object.keys(e)) {
    if (!erlaubt.includes(f)) fehlt(k, `${pfad}.${f}`, `Unbekanntes Feld „${f}“ bei Typ „${typ}“. Erlaubt: ${erlaubt.join(', ')}.`)
  }

  switch (typ) {
    case 'rechteck':
    case 'ellipse': {
      const x = zahlFeld(k, e, 'x', pfad, { pflicht: true })
      const y = zahlFeld(k, e, 'y', pfad, { pflicht: true })
      const b = zahlFeld(k, e, 'breite', pfad, { pflicht: true, groesser0: true, max: MAX_GROESSE_M })
      const h = zahlFeld(k, e, 'hoehe', pfad, { pflicht: true, groesser0: true, max: MAX_GROESSE_M })
      const stil = stilFelder(k, e, pfad)
      const bz = bezugPruefen(k, e.bezug, `${pfad}.bezug`)
      const text = textFeld(k, e.beschriftung, `${pfad}.beschriftung`) ?? bz?.name
      if (k.fehler.length > anfang || x === undefined || y === undefined || b === undefined || h === undefined) return null
      const mitte = mZuPx(a, { x, y })
      const pb = b * a.pxProM
      const ph = h * a.pxProM
      const basis = { id: neueId(), ...stil, ...(text ? { beschriftung: text } : {}), ...(bz ? { bezug: bz.bezug } : {}) }
      if (typ === 'rechteck') return { ...basis, typ: 'rechteck', x: r1(mitte.x - pb / 2), y: r1(mitte.y - ph / 2), breite: r1(pb), hoehe: r1(ph) }
      return {
        ...basis,
        typ: 'kreis',
        cx: mitte.x,
        cy: mitte.y,
        radius: r1(pb / 2),
        ...(Math.abs(pb - ph) > 0.05 ? { radiusY: r1(ph / 2) } : {}),
      }
    }
    case 'vieleck': {
      const roh = e.punkte
      let punkte: MPunkt[] | undefined
      if (!Array.isArray(roh)) fehlt(k, `${pfad}.punkte`, '„punkte“ fehlt: Liste von mindestens 3 Eckpunkten [{ "x": 1, "y": 2 }, …] in Metern.')
      else if (roh.length < 3) fehlt(k, `${pfad}.punkte`, `Ein Vieleck braucht mindestens 3 Eckpunkte (angegeben: ${roh.length}).`)
      else if (roh.length > MAX_PUNKTE) fehlt(k, `${pfad}.punkte`, `Zu viele Eckpunkte (${roh.length}, höchstens ${MAX_PUNKTE}).`)
      else {
        const liste = roh.map((p, j) => punktFeld(k, p, `${pfad}.punkte[${j}]`))
        if (liste.every((p): p is MPunkt => p !== undefined)) punkte = liste
      }
      const stil = stilFelder(k, e, pfad)
      const bz = bezugPruefen(k, e.bezug, `${pfad}.bezug`)
      const text = textFeld(k, e.beschriftung, `${pfad}.beschriftung`) ?? bz?.name
      if (k.fehler.length > anfang || !punkte) return null
      return { id: neueId(), typ: 'vieleck', punkte: punkte.map((p) => mZuPx(a, p)), ...stil, ...(text ? { beschriftung: text } : {}), ...(bz ? { bezug: bz.bezug } : {}) }
    }
    case 'linie': {
      const von = punktFeld(k, e.von, `${pfad}.von`)
      const nach = punktFeld(k, e.nach, `${pfad}.nach`)
      const farbe = e.farbe !== undefined ? farbFeld(k, e.farbe, `${pfad}.farbe`, 'linie') : undefined
      const art = linienartFeld(k, e.linienart, `${pfad}.linienart`)
      if (e.pfeil !== undefined && typeof e.pfeil !== 'boolean') fehlt(k, `${pfad}.pfeil`, 'pfeil ist true oder false.')
      if (k.fehler.length > anfang || !von || !nach) return null
      const p1 = mZuPx(a, von)
      const p2 = mZuPx(a, nach)
      return {
        id: neueId(),
        typ: 'linie',
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        ...(farbe && farbe.toUpperCase() !== '#1A1A1A' ? { farbe } : {}),
        ...(art === 'gestrichelt' ? { linienart: art } : {}),
        ...(e.pfeil === true ? { pfeil: true } : {}),
      }
    }
    case 'massangabe': {
      const von = punktFeld(k, e.von, `${pfad}.von`)
      const nach = punktFeld(k, e.nach, `${pfad}.nach`)
      const text = textFeld(k, e.beschriftung, `${pfad}.beschriftung`)
      const farbe = e.farbe !== undefined ? farbFeld(k, e.farbe, `${pfad}.farbe`, 'linie') : undefined
      if (k.fehler.length > anfang || !von || !nach) return null
      const laenge = Math.hypot(nach.x - von.x, nach.y - von.y)
      if (laenge < 0.05) {
        fehlt(k, pfad, 'Anfang und Ende der Maßlinie liegen (fast) aufeinander.')
        return null
      }
      const p1 = mZuPx(a, von)
      const p2 = mZuPx(a, nach)
      return {
        id: neueId(),
        typ: 'massangabe',
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        beschriftung: text || `${fmt.format(Math.round(laenge * 100) / 100)} m`,
        ...(farbe ? { farbe } : {}),
      }
    }
    case 'text': {
      const x = zahlFeld(k, e, 'x', pfad, { pflicht: true })
      const y = zahlFeld(k, e, 'y', pfad, { pflicht: true })
      const inhalt = textFeld(k, e.inhalt, `${pfad}.inhalt`)
      if (inhalt === undefined) fehlt(k, `${pfad}.inhalt`, '„inhalt“ fehlt: der Text.')
      if (k.fehler.length > anfang || x === undefined || y === undefined || !inhalt) return null
      const gr = 14
      const m = mZuPx(a, { x, y })
      return { id: neueId(), typ: 'text', x: r1(m.x - (inhalt.length * gr * 0.55) / 2), y: r1(m.y - (gr + 4) / 2), inhalt }
    }
    default: {
      // Symbole
      const art = typ as SymbolArt
      const std = standardgroesseM(art)
      const x = zahlFeld(k, e, 'x', pfad, { pflicht: true })
      const y = zahlFeld(k, e, 'y', pfad, { pflicht: true })
      const b = zahlFeld(k, e, 'breite', pfad, { groesser0: true, max: MAX_GROESSE_M }) ?? std.breite
      const h = zahlFeld(k, e, 'hoehe', pfad, { groesser0: true, max: MAX_GROESSE_M }) ?? std.hoehe
      const bz = bezugPruefen(k, e.bezug, `${pfad}.bezug`)
      let text = textFeld(k, e.beschriftung, `${pfad}.beschriftung`)
      if (text === undefined && bz) text = art === 'entfernen' ? `${bz.name} entfernen` : bz.name
      if (art === 'mangelhinweis' && !text) fehlt(k, `${pfad}.beschriftung`, 'Ein Mängelhinweis braucht „beschriftung“ (den Hinweistext).')
      let ziel: MPunkt | undefined
      if (e.ziel !== undefined) {
        if (art !== 'mangelhinweis') fehlt(k, `${pfad}.ziel`, '„ziel“ (Pfeil) gibt es nur beim Mängelhinweis. Für andere Pfeile eine „linie“ mit pfeil: true nehmen.')
        else ziel = punktFeld(k, e.ziel, `${pfad}.ziel`)
      }
      if (k.fehler.length > anfang || x === undefined || y === undefined) return null
      const m = mZuPx(a, { x, y })
      const pb = b * a.pxProM
      const ph = h * a.pxProM
      return {
        id: neueId(),
        typ: 'symbol',
        art,
        x: r1(m.x - pb / 2),
        y: r1(m.y - ph / 2),
        breite: r1(pb),
        hoehe: r1(ph),
        ...(text ? { beschriftung: text } : {}),
        ...(ziel ? { ziel: mZuPx(a, ziel) } : {}),
        ...(bz ? { bezug: bz.bezug } : {}),
      }
    }
  }
}

/** Mittelpunkt eines Elements in Pixeln (für die Lageprüfung). */
function mittelpunkt(el: SkizzeElement): { x: number; y: number } | null {
  switch (el.typ) {
    case 'symbol':
    case 'rechteck':
      return { x: el.x + el.breite / 2, y: el.y + el.hoehe / 2 }
    case 'kreis':
      return { x: el.cx, y: el.cy }
    case 'vieleck': {
      const xs = el.punkte.map((p) => p.x)
      const ys = el.punkte.map((p) => p.y)
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    }
    default:
      return null
  }
}

/** Symbole, die ein einzelner Gegenstand im Garten sind (nicht auf einem Gebäude zu erwarten). */
const PUNKTFOERMIG = new Set<string>(['baum', 'strauch', 'wildling', 'kletterpflanze', 'kompost', 'beet', 'hochbeet', 'blumenbeet', 'brunnen', 'schacht', 'holzpferd', 'schaukel', 'gegenstand'])

const KATEGORIE_NAMEN: Record<string, string> = {
  baum: 'Baum',
  strauch: 'Strauch',
  wildling: 'Wildling',
  kletterpflanze: 'Kletterpflanze',
  hecke: 'Hecke',
  beet: 'Beet',
  hochbeet: 'Hochbeet',
  blumenbeet: 'Blumenbeet',
  rasen: 'Rasenfläche',
  kompost: 'Kompost',
  brunnen: 'Brunnen',
  schacht: 'Schacht',
  weg: 'Weg',
  tor: 'Tor',
  holzpferd: 'Holzpferd',
  schaukel: 'Schaukel',
  gegenstand: 'Gegenstand',
  entfernen: 'Entfernen-Markierung',
  mangelhinweis: 'Mängelhinweis',
  rechteck: 'Rechteck',
  ellipse: 'Ellipse',
  vieleck: 'Vieleck',
  linie: 'Linie',
  massangabe: 'Maßlinie',
  text: 'Text',
}

function plural(name: string, n: number): string {
  if (n === 1) return `1 ${name}`
  const mehrzahl: Record<string, string> = { Baum: 'Bäume', Strauch: 'Sträucher', Hecke: 'Hecken', Weg: 'Wege', Tor: 'Tore', Kompost: 'Kompost', Beet: 'Beete', Hochbeet: 'Hochbeete', Blumenbeet: 'Blumenbeete', Brunnen: 'Brunnen', Schacht: 'Schächte', Rechteck: 'Rechtecke', Ellipse: 'Ellipsen', Vieleck: 'Vielecke', Linie: 'Linien', Text: 'Texte', Wildling: 'Wildlinge', Kletterpflanze: 'Kletterpflanzen', Mängelhinweis: 'Mängelhinweise', Maßlinie: 'Maßlinien', Rasenfläche: 'Rasenflächen', Gegenstand: 'Gegenstände', Holzpferd: 'Holzpferde', Schaukel: 'Schaukeln', 'Entfernen-Markierung': 'Entfernen-Markierungen' }
  return `${n} ${mehrzahl[name] ?? name}`
}

/**
 * Prüft einen Vorschlag. `skizze` ist die Skizze, auf die er sich bezieht (Editor-Stand bzw. gespeicherte Skizze).
 * Bei Fehlern ist `ok` false und es wird nichts angezeigt (alles oder nichts).
 */
export function pruefeVorschlag(eingabe: unknown, wep: Wep, skizze: SkizzeDaten | undefined): GeprueftVorschlag {
  const k: Kontext = { wep, fehler: [], hinweise: [] }
  const leer = (zusammenfassung: string): GeprueftVorschlag => ({
    ok: false,
    fehler: k.fehler,
    hinweise: k.hinweise,
    zusammenfassung,
    anzahl: 0,
    modus: null,
    elemente: [],
  })

  let json: unknown = eingabe
  if (typeof eingabe === 'string') {
    try {
      json = JSON.parse(eingabe)
    } catch (err) {
      fehlt(k, '', `Der Vorschlag ist kein gültiges JSON: ${err instanceof Error ? err.message : String(err)}`)
      return leer('Nichts angezeigt: kein gültiges JSON.')
    }
  }
  if (!istObjekt(json)) {
    fehlt(k, '', 'Der Vorschlag ist ein Objekt: { "format": "wep-skizze/1", "modus": "ergaenzen", "elemente": [ … ] }.')
    return leer('Nichts angezeigt: der Vorschlag ist kein Objekt.')
  }
  for (const f of Object.keys(json)) {
    if (!['format', 'modus', 'elemente'].includes(f)) fehlt(k, f, `Unbekanntes Feld „${f}“ im Vorschlag (erlaubt: format, modus, elemente).`)
  }
  if (json.format !== SKIZZE_FORMAT) fehlt(k, 'format', `„format“ muss „${SKIZZE_FORMAT}“ sein (ist ${JSON.stringify(json.format)}).`)
  const modus = json.modus === undefined ? 'ergaenzen' : json.modus
  if (typeof modus !== 'string' || !(MODI as readonly string[]).includes(modus)) {
    fehlt(k, 'modus', `„modus“ muss „ergaenzen“ oder „gruen-ersetzen“ sein (ist ${JSON.stringify(json.modus)}).`)
  }
  if (!Array.isArray(json.elemente)) fehlt(k, 'elemente', '„elemente“ fehlt: Liste der Skizzenelemente.')
  else if (json.elemente.length === 0) fehlt(k, 'elemente', '„elemente“ ist leer: ein Vorschlag braucht mindestens ein Element.')
  else if (json.elemente.length > MAX_ELEMENTE) fehlt(k, 'elemente', `Zu viele Elemente (${json.elemente.length}, höchstens ${MAX_ELEMENTE}).`)
  if (wepRolle(wep) === 'bau') fehlt(k, '', 'Dieses WEP hat keinen Grün-Teil (Rolle „bau“); die Grün-Skizze gibt es hier nicht.')
  if (k.fehler.length) return leer(`Nichts angezeigt: ${k.fehler.length} ${k.fehler.length === 1 ? 'Fehler' : 'Fehler'} im Vorschlag.`)

  const { abb, mitParzelle, flaecheM } = abbildungFuer(wep, skizze)
  const elemente: SkizzeElement[] = []
  const roh = json.elemente as unknown[]
  roh.forEach((e, i) => {
    const el = pruefeElement(k, e, i, abb)
    if (el) elemente.push(el)
  })
  if (k.fehler.length) return leer(`Nichts angezeigt: ${k.fehler.length} ${k.fehler.length === 1 ? 'Fehler' : 'Fehler'} im Vorschlag.`)

  // Hinweise (verhindern nichts)
  if (!mitParzelle) {
    k.hinweise.push(`Es gilt keine Parzelle: Die Meter beziehen sich auf eine Zeichenfläche von ${fmt.format(flaecheM.breite)} × ${fmt.format(flaecheM.hoehe)} m. Mit angelegter Parzelle (Reiter „Skizze“) liegen die Meter auf dem Grundstück.`)
  }
  const lage = lageVon(wep)
  const bauteile = (skizze?.elemente ?? []).filter((e): e is SkizzeBauform => e.typ === 'bauform' && e.art === 'bauteil' && istGrundlage(e))
  elemente.forEach((el, i) => {
    const m = mittelpunkt(el)
    if (!m) return
    const mm = { x: (m.x - abb.ox) / abb.pxProM, y: (m.y - abb.oy) / abb.pxProM }
    const name = `elemente[${i}] (${el.typ === 'symbol' ? KATEGORIE_NAMEN[el.art] : (KATEGORIE_NAMEN[el.typ === 'kreis' ? 'ellipse' : el.typ] ?? el.typ)}${'beschriftung' in el && el.beschriftung ? ` „${el.beschriftung}“` : ''})`
    if (lage && mitParzelle && !punktImPolygon(mm, lage.punkte, 0.3)) k.hinweise.push(`${name} liegt außerhalb der Parzelle.`)
    if (el.typ === 'symbol' && PUNKTFOERMIG.has(el.art)) {
      const auf = bauteile.find((b) => imVieleck(m, b.punkte))
      if (auf) k.hinweise.push(`${name} liegt auf dem Bauteil „${(auf.beschriftung ?? '').split('\n')[0] || 'Gebäude'}“ der Grundlage.`)
    }
  })

  // Aufwuchs-/Außenanlagen-Positionen ohne Skizzenelement; mehr Elemente als Stück
  const bestehend = (skizze?.elemente ?? []).filter((e) => !istGrundlage(e))
  const nachModus = (json.modus === 'gruen-ersetzen' ? [] : bestehend).concat(elemente)
  const bezuege = new Map<string, number>()
  for (const el of nachModus) if (el.bezug) bezuege.set(`${el.bezug.liste}:${el.bezug.id}`, (bezuege.get(`${el.bezug.liste}:${el.bezug.id}`) ?? 0) + 1)
  const ohne = wep.gruen.aufwuchs.filter((p) => !bezuege.has(`aufwuchs:${p.id}`)).map((p) => kurzname(p.bezeichnung))
  if (elemente.some((el) => el.bezug) && ohne.length) {
    k.hinweise.push(`Aufwuchs-Positionen ohne Element in der Skizze: ${ohne.slice(0, 8).join(', ')}${ohne.length > 8 ? ' …' : ''}.`)
  }
  for (const p of wep.gruen.aufwuchs) {
    const n = bezuege.get(`aufwuchs:${p.id}`) ?? 0
    if (p.einheit === 'Stück' && p.anzahl > 0 && n > p.anzahl) {
      k.hinweise.push(`Zur Position „${kurzname(p.bezeichnung)}“ gehören ${p.anzahl} Stück, in der Skizze verweisen aber ${n} Elemente darauf.`)
    }
  }

  // Zusammenfassung
  const zaehler = new Map<string, number>()
  for (const el of elemente) {
    const n = KATEGORIE_NAMEN[el.typ === 'symbol' ? el.art : el.typ === 'kreis' ? 'ellipse' : el.typ] ?? el.typ
    zaehler.set(n, (zaehler.get(n) ?? 0) + 1)
  }
  const teile = [...zaehler].map(([n, c]) => plural(n, c))
  const mitBezug = elemente.filter((e) => e.bezug).length
  const modusText = json.modus === 'gruen-ersetzen' ? 'ersetzt das bisherige Grün (die Grundlage bleibt)' : 'ergänzt die Skizze'
  const zusammenfassung =
    `${elemente.length} ${elemente.length === 1 ? 'Element' : 'Elemente'} (${teile.join(', ')})${mitBezug ? `, davon ${mitBezug} mit Bezug zu einer Position` : ''}; ${modusText}. ` +
    'Der Vorschlag ist in der Skizze hervorgehoben; gespeichert wird erst, wenn der Nutzer „Übernehmen“ wählt.'

  return {
    ok: true,
    fehler: [],
    hinweise: k.hinweise,
    zusammenfassung,
    anzahl: elemente.length,
    modus: (json.modus ?? 'ergaenzen') as Modus,
    elemente,
  }
}

