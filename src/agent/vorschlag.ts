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
import { elementKasten } from '../skizze/geometrie'
import { normalisiereFarbe, vorgabe } from '../skizze/stile'
import type { Linienart, PositionsBezug, SkizzeDaten, SkizzeElement } from '../skizze/types'
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
import { abbildungFuer, mZuPx, r1 } from './umrechnung'

/** Obergrenzen, damit ein fehlerhafter Vorschlag die Skizze nicht sprengt. */
export const MAX_ELEMENTE = 400
const MAX_KOORDINATE_M = 1000
const MAX_GROESSE_M = 500
const MAX_TEXT = 120
const MAX_PUNKTE = 200

type Rohobjekt = Record<string, unknown>
const istObjekt = (v: unknown): v is Rohobjekt => typeof v === 'object' && v !== null && !Array.isArray(v)
const istZahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const STIL_FELDER = ['stil', 'fuellung', 'linie', 'linienart', 'linienbreite', 'beschriftung'] as const
const ALLGEMEIN = ['typ', 'id', 'name', 'bezug'] as const
const FELDER: Record<string, readonly string[]> = {
  rechteck: [...ALLGEMEIN, 'x', 'y', 'breite', 'hoehe', ...STIL_FELDER],
  ellipse: [...ALLGEMEIN, 'x', 'y', 'breite', 'hoehe', ...STIL_FELDER],
  vieleck: [...ALLGEMEIN, 'punkte', 'offen', ...STIL_FELDER],
  bogen: [...ALLGEMEIN, 'x', 'y', 'breite', 'hoehe', 'startWinkel', 'endWinkel', 'linie', 'linienart', 'linienbreite', 'stil'],
  linie: [...ALLGEMEIN, 'von', 'nach', 'farbe', 'linienart', 'linienbreite', 'pfeil'],
  massangabe: [...ALLGEMEIN, 'von', 'nach', 'beschriftung', 'farbe'],
  text: [...ALLGEMEIN, 'x', 'y', 'inhalt', 'farbe', 'groesse'],
}
const MIN_LINIENBREITE = 0.25
const MAX_LINIENBREITE = 6

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
function stilFelder(k: Kontext, o: Rohobjekt, pfad: string): { fuellung?: string; linie?: string; linienart?: Linienart; linienbreite?: number } {
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
  const breite = linienbreiteFeld(k, o, pfad)
  // Standardfarbe der Linie weglassen (bestehende Skizzen sehen so unverändert aus)
  return {
    ...(breite ? { linienbreite: breite } : {}),
    ...(fuellung ? { fuellung } : {}),
    ...(linie && linie.toUpperCase() !== '#1A1A1A' ? { linie } : {}),
    ...(linienart === 'gestrichelt' ? { linienart } : {}),
  }
}

/** Linienstärke in pt (0,25 bis 6) – optional. */
function linienbreiteFeld(k: Kontext, o: Rohobjekt, pfad: string): number | undefined {
  if (o.linienbreite === undefined) return undefined
  const v = o.linienbreite
  if (!istZahl(v) || v < MIN_LINIENBREITE || v > MAX_LINIENBREITE) {
    fehlt(k, `${pfad}.linienbreite`, `linienbreite ist die Linienstärke in pt (${MIN_LINIENBREITE} bis ${MAX_LINIENBREITE}, z. B. 1 oder 2), nicht ${JSON.stringify(v)}.`)
    return undefined
  }
  return v
}

/** Optionaler Name des Elements (wird zum Formnamen im Excel). */
function nameFeld(k: Kontext, o: Rohobjekt, pfad: string): string | undefined {
  if (o.name === undefined) return undefined
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.trim().length > 60) {
    fehlt(k, `${pfad}.name`, 'name ist ein kurzer Text (höchstens 60 Zeichen), z. B. „Stamm“ oder „Krone“.')
    return undefined
  }
  return o.name.trim()
}

const fmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

const GRUNDFORMEN_TEXT = FORM_TYPEN.join(', ')

/** Ein Element prüfen und in ein Skizzenelement umrechnen; `null` bei Fehlern (sie stehen in `k.fehler`). */
function pruefeElement(k: Kontext, e: unknown, i: number, a: ReturnType<typeof abbildungFuer>['abb'], pxPt: number): SkizzeElement | null {
  const pfad = `elemente[${i}]`
  if (!istObjekt(e)) {
    fehlt(k, pfad, 'Ein Element ist ein Objekt mit „typ“, z. B. { "typ": "ellipse", "x": 3, "y": 4, "breite": 1.5, "hoehe": 1.5, "fuellung": "#548235" }.')
    return null
  }
  const typ = e.typ
  if (typeof typ !== 'string') {
    fehlt(k, `${pfad}.typ`, `„typ“ fehlt. Erlaubt (Grundformen): ${GRUNDFORMEN_TEXT}.`)
    return null
  }
  if (!(FORM_TYPEN as readonly string[]).includes(typ)) {
    const bekannt = (SYMBOL_ARTEN as readonly string[]).includes(typ) || typ === 'symbol'
    fehlt(
      k,
      `${pfad}.typ`,
      bekannt
        ? `„${typ}“ ist keine Grundform – der Vorschlag besteht nur aus Grundformen (${GRUNDFORMEN_TEXT}). Zeichne es aus Kreisen, Linien, Vierecken, Dreiecken … oder hole dir fertige Grundformen mit window.wep.skizze.baustein('${typ}', { x, y }).`
        : `Unbekannter Typ „${typ}“. Erlaubt (Grundformen): ${GRUNDFORMEN_TEXT}.`,
    )
    return null
  }
  const anfang = k.fehler.length
  const erlaubt = FELDER[typ]
  for (const f of Object.keys(e)) {
    if (!erlaubt.includes(f)) fehlt(k, `${pfad}.${f}`, `Unbekanntes Feld „${f}“ bei Typ „${typ}“. Erlaubt: ${erlaubt.join(', ')}.`)
  }
  const name = nameFeld(k, e, pfad)
  const bz = bezugPruefen(k, e.bezug, `${pfad}.bezug`)
  const gemeinsam = { id: neueId(), frei: true as const, ...(name ? { name } : {}), ...(bz ? { bezug: bz.bezug } : {}) }

  switch (typ) {
    case 'rechteck':
    case 'ellipse': {
      const x = zahlFeld(k, e, 'x', pfad, { pflicht: true })
      const y = zahlFeld(k, e, 'y', pfad, { pflicht: true })
      const b = zahlFeld(k, e, 'breite', pfad, { pflicht: true, groesser0: true, max: MAX_GROESSE_M })
      const h = zahlFeld(k, e, 'hoehe', pfad, { pflicht: true, groesser0: true, max: MAX_GROESSE_M })
      const stil = stilFelder(k, e, pfad)
      const text = textFeld(k, e.beschriftung, `${pfad}.beschriftung`)
      if (k.fehler.length > anfang || x === undefined || y === undefined || b === undefined || h === undefined) return null
      const mitte = mZuPx(a, { x, y })
      const pb = b * a.pxProM
      const ph = h * a.pxProM
      const basis = { ...gemeinsam, ...stil, ...(text ? { beschriftung: text } : {}) }
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
      const offen = e.offen === true
      if (e.offen !== undefined && typeof e.offen !== 'boolean') fehlt(k, `${pfad}.offen`, 'offen ist true (offener Linienzug) oder false (geschlossene Fläche).')
      const min = offen ? 2 : 3
      let punkte: MPunkt[] | undefined
      if (!Array.isArray(roh)) fehlt(k, `${pfad}.punkte`, `„punkte“ fehlt: Liste von mindestens ${min} Punkten [{ "x": 1, "y": 2 }, …] in Metern.`)
      else if (roh.length < min) fehlt(k, `${pfad}.punkte`, `Ein ${offen ? 'Linienzug braucht mindestens 2 Punkte' : 'Vieleck braucht mindestens 3 Eckpunkte (Dreieck = 3)'} (angegeben: ${roh.length}).`)
      else if (roh.length > MAX_PUNKTE) fehlt(k, `${pfad}.punkte`, `Zu viele Punkte (${roh.length}, höchstens ${MAX_PUNKTE}).`)
      else {
        const liste = roh.map((p, j) => punktFeld(k, p, `${pfad}.punkte[${j}]`))
        if (liste.every((p): p is MPunkt => p !== undefined)) punkte = liste
      }
      const stil = stilFelder(k, e, pfad)
      const text = textFeld(k, e.beschriftung, `${pfad}.beschriftung`)
      if (k.fehler.length > anfang || !punkte) return null
      // Ein offener Linienzug hat keine Füllung
      const { fuellung: _f, ...ohneFuellung } = stil
      return { ...gemeinsam, typ: 'vieleck', punkte: punkte.map((p) => mZuPx(a, p)), ...(offen ? { offen: true, ...ohneFuellung } : stil), ...(text && !offen ? { beschriftung: text } : {}) }
    }
    case 'bogen': {
      const x = zahlFeld(k, e, 'x', pfad, { pflicht: true })
      const y = zahlFeld(k, e, 'y', pfad, { pflicht: true })
      const b = zahlFeld(k, e, 'breite', pfad, { pflicht: true, groesser0: true, max: MAX_GROESSE_M })
      const h = zahlFeld(k, e, 'hoehe', pfad, { pflicht: true, groesser0: true, max: MAX_GROESSE_M })
      const von = zahlFeld(k, e, 'startWinkel', pfad, { pflicht: true, min: -720, max: 720 })
      const bis = zahlFeld(k, e, 'endWinkel', pfad, { pflicht: true, min: -720, max: 720 })
      const stil = stilFelder(k, e, pfad)
      if (von !== undefined && bis !== undefined && (Math.abs(bis - von) < 1 || Math.abs(bis - von) > 360)) {
        fehlt(k, `${pfad}.endWinkel`, `Der Bogen muss zwischen 1° und 360° umfassen (startWinkel ${von}, endWinkel ${bis}). 0° = rechts, 90° = unten, im Uhrzeigersinn.`)
      }
      if (k.fehler.length > anfang || x === undefined || y === undefined || b === undefined || h === undefined || von === undefined || bis === undefined) return null
      const n = Math.max(8, Math.ceil(Math.abs(bis - von) / 8))
      const punkte = Array.from({ length: n + 1 }, (_, j) => {
        const w = ((von + ((bis - von) * j) / n) * Math.PI) / 180
        return mZuPx(a, { x: x + (b / 2) * Math.cos(w), y: y + (h / 2) * Math.sin(w) })
      })
      const { fuellung: _f, ...ohneFuellung } = stil
      return { ...gemeinsam, typ: 'vieleck', offen: true, punkte, ...ohneFuellung }
    }
    case 'linie': {
      const von = punktFeld(k, e.von, `${pfad}.von`)
      const nach = punktFeld(k, e.nach, `${pfad}.nach`)
      const farbe = e.farbe !== undefined ? farbFeld(k, e.farbe, `${pfad}.farbe`, 'linie') : undefined
      const art = linienartFeld(k, e.linienart, `${pfad}.linienart`)
      const breite = linienbreiteFeld(k, e, pfad)
      if (e.pfeil !== undefined && typeof e.pfeil !== 'boolean') fehlt(k, `${pfad}.pfeil`, 'pfeil ist true oder false.')
      if (k.fehler.length > anfang || !von || !nach) return null
      const p1 = mZuPx(a, von)
      const p2 = mZuPx(a, nach)
      return {
        ...gemeinsam,
        typ: 'linie',
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        ...(farbe && farbe.toUpperCase() !== '#1A1A1A' ? { farbe } : {}),
        ...(art === 'gestrichelt' ? { linienart: art } : {}),
        ...(breite ? { linienbreite: breite } : {}),
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
        ...gemeinsam,
        typ: 'massangabe',
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        beschriftung: text || `${fmt.format(Math.round(laenge * 100) / 100)} m`,
        ...(farbe ? { farbe } : {}),
      }
    }
    default: {
      // text
      const x = zahlFeld(k, e, 'x', pfad, { pflicht: true })
      const y = zahlFeld(k, e, 'y', pfad, { pflicht: true })
      let inhalt = textFeld(k, e.inhalt, `${pfad}.inhalt`)
      if (inhalt === undefined && bz) inhalt = bz.name
      if (inhalt === undefined) fehlt(k, `${pfad}.inhalt`, '„inhalt“ fehlt: der Text (oder „bezug“ auf eine Position – dann ist es ihr Kurzname).')
      const farbe = e.farbe !== undefined ? farbFeld(k, e.farbe, `${pfad}.farbe`, 'linie') : undefined
      let gr: number | undefined
      if (e.groesse !== undefined) {
        if (!istZahl(e.groesse) || e.groesse < 5 || e.groesse > 28) fehlt(k, `${pfad}.groesse`, 'groesse ist die Schriftgröße in pt (5 bis 28, üblich 9).')
        else gr = e.groesse
      }
      if (k.fehler.length > anfang || x === undefined || y === undefined || !inhalt) return null
      const px = (gr ?? 9) * pxPt
      const m = mZuPx(a, { x, y })
      return { ...gemeinsam, typ: 'text', x: r1(m.x - (inhalt.length * px * 0.55) / 2), y: r1(m.y - (px + 4) / 2), inhalt, schriftgroesse: r1(px), ...(farbe ? { farbe } : {}) }
    }
  }
}

/** Anzeigename der Grundform für Zusammenfassung und Hinweise. */
function formName(el: SkizzeElement): string {
  switch (el.typ) {
    case 'rechteck':
      return 'Rechteck'
    case 'kreis':
      return el.radiusY !== undefined ? 'Ellipse' : 'Kreis'
    case 'vieleck':
      return el.offen ? 'Linienzug' : el.punkte.length === 3 ? 'Dreieck' : 'Vieleck'
    case 'linie':
      return el.pfeil ? 'Pfeil' : 'Linie'
    case 'massangabe':
      return 'Maßlinie'
    case 'text':
      return 'Text'
    default:
      return el.typ
  }
}

const MEHRZAHL: Record<string, string> = { Rechteck: 'Rechtecke', Kreis: 'Kreise', Ellipse: 'Ellipsen', Dreieck: 'Dreiecke', Vieleck: 'Vielecke', Linienzug: 'Linienzüge', Linie: 'Linien', Pfeil: 'Pfeile', Maßlinie: 'Maßlinien', Text: 'Texte' }
const plural = (name: string, n: number): string => (n === 1 ? `1 ${name}` : `${n} ${MEHRZAHL[name] ?? name}`)

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
  const pxPt = (skizze?.breite ?? 800) / 452
  const elemente: SkizzeElement[] = []
  const roh = json.elemente as unknown[]
  roh.forEach((e, i) => {
    const el = pruefeElement(k, e, i, abb, pxPt)
    if (el) elemente.push(el)
  })
  if (k.fehler.length) return leer(`Nichts angezeigt: ${k.fehler.length} ${k.fehler.length === 1 ? 'Fehler' : 'Fehler'} im Vorschlag.`)

  // Hinweise (verhindern nichts)
  if (!mitParzelle) {
    k.hinweise.push(`Es gilt keine Parzelle: Die Meter beziehen sich auf eine Zeichenfläche von ${fmt.format(flaecheM.breite)} × ${fmt.format(flaecheM.hoehe)} m. Mit angelegter Parzelle (Reiter „Skizze“) liegen die Meter auf dem Grundstück.`)
  }
  const lage = lageVon(wep)
  if (lage && mitParzelle) {
    elemente.forEach((el, i) => {
      const kasten = elementKasten(el)
      const mm = { x: (kasten.x + kasten.breite / 2 - abb.ox) / abb.pxProM, y: (kasten.y + kasten.hoehe / 2 - abb.oy) / abb.pxProM }
      if (!punktImPolygon(mm, lage.punkte, 0.3)) {
        k.hinweise.push(`elemente[${i}] (${formName(el)}${el.name ? ` „${el.name}“` : ''}) liegt mit seiner Mitte außerhalb der Parzelle.`)
      }
    })
  }
  const bestehend = (skizze?.elemente ?? []).filter((e) => !istGrundlage(e))
  if (json.modus === 'gruen-ersetzen' && bestehend.length) {
    const symbole = bestehend.filter((e) => e.typ === 'symbol').length
    k.hinweise.push(`„gruen-ersetzen“ ersetzt ${bestehend.length} vorhandene Grün-Elemente${symbole ? ` (davon ${symbole} Symbole des Nutzers, die als Grundformen nicht wiederkommen)` : ''}.`)
  }

  // Aufwuchs-Positionen ohne Skizzenelement; mehr Elemente als Stück (Bezug nur am Hauptelement eines Gegenstands setzen)
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
      k.hinweise.push(`Zur Position „${kurzname(p.bezeichnung)}“ gehören ${p.anzahl} Stück, in der Skizze verweisen aber ${n} Elemente darauf (der Bezug gehört nur an ein Element je Gegenstand).`)
    }
  }

  // Zusammenfassung
  const zaehler = new Map<string, number>()
  for (const el of elemente) zaehler.set(formName(el), (zaehler.get(formName(el)) ?? 0) + 1)
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
