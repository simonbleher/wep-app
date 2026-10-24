/**
 * `window.wep.lesen()`: ein vollständiger, nur lesender Auszug aus dem geöffneten WEP für einen Agenten
 * (Formalien, Parzelle, Bau, Grundlage, Grün-Positionen, vorhandene Skizze, verfügbare Stile). Reine Rechnung.
 */
import { INVASIVE_ARTEN, PROBLEMPFLANZEN } from '../app/katalogDaten'
import { findeProblempflanze, istInvasiv } from '../katalog'
import { wepRolle, type Position, type Wep } from '../model/types'
import { flaecheUndVergleich, lageVon } from '../parzelle'
import { flaecheVon, kuerzelVon } from '../skizze/grundriss'
import { FUELLFARBEN, LINIENARTEN, LINIENFARBEN, STIL_VORGABEN } from '../skizze/stile'
import type { SkizzeDaten } from '../skizze/types'
import { istGrundlage } from '../skizze/types'
import {
  BEZUGS_LISTEN,
  FORM_TYPEN,
  MODI,
  SCHNITTSTELLE_VERSION,
  SKIZZE_FORMAT,
  type BauteilInfo,
  type BeseitigungInfo,
  type ElementtypInfo,
  type GrundlageElementInfo,
  type GrundrissTeilInfo,
  type LesenErgebnis,
  type PositionInfo,
  type StilVorgabeInfo,
} from './format'
import { bausteinInfos } from './bausteine'
import { abbildungFuer, gruenZuFormat, pxZuM, r2 } from './umrechnung'

/** Kurzname einer Bezeichnung: „Apfel, Halbstamm, 5–30 J.“ → „Apfel“; „Liguster-Hecke (Laub)“ → „Liguster-Hecke“. */
export function kurzname(bezeichnung: string): string {
  return (bezeichnung.split(/[,(]/)[0] ?? '').trim() || bezeichnung.trim()
}

/** Höhe in m aus der Bezeichnung („Hecke 1,2 m hoch“), sonst null; Flächen und Volumen (m², m³) zählen nicht. */
function hoeheAusBezeichnung(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*m(?![²³\w])/i.exec(text)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n < 60 ? n : null
}

function positionInfo(p: Position, nr: number): PositionInfo {
  return {
    id: p.id,
    nr,
    bezeichnung: p.bezeichnung,
    art: kurzname(p.bezeichnung),
    menge: p.anzahl,
    einheit: p.einheit,
    zustand: p.zustand ?? null,
    einzelpreis: p.einzelpreis,
    hoeheM: hoeheAusBezeichnung(p.bezeichnung),
    invasiv: Boolean(istInvasiv(INVASIVE_ARTEN, p.bezeichnung)),
    problempflanze: Boolean(findeProblempflanze(PROBLEMPFLANZEN, p.bezeichnung)),
    hinweise: (p.hinweise ?? []).map((h) => ({ schwere: h.schwere, text: h.text })),
  }
}

export function elementtypen(): ElementtypInfo[] {
  const formen: Record<(typeof FORM_TYPEN)[number], string> = {
    rechteck: 'Rechteck, wahlweise gefüllt (Mittelpunkt x/y, breite, hoehe)',
    ellipse: 'Ellipse oder Kreis (Mittelpunkt x/y, breite = Durchmesser waagerecht, hoehe = senkrecht), wahlweise gefüllt',
    vieleck: 'Vieleck aus mindestens 3 Eckpunkten (punkte; Dreieck = 3), wahlweise gefüllt; mit offen: true ein Linienzug aus mindestens 2 Punkten ohne Füllung',
    bogen: 'Kreis- oder Ellipsenbogen (Mittelpunkt x/y, breite/hoehe = Durchmesser, startWinkel/endWinkel in Grad, 0° = rechts, im Uhrzeigersinn), nur Linie',
    linie: 'Linie von „von“ nach „nach“, wahlweise farbig, gestrichelt oder mit Pfeilspitze am Ende',
    massangabe: 'Maßlinie mit Endstrichen und Text (beschriftung, sonst die berechnete Länge)',
    text: 'Freier Text (inhalt) um den Mittelpunkt x/y',
  }
  return [...FORM_TYPEN.map((typ): ElementtypInfo => ({ typ, beschreibung: formen[typ], standardgroesseM: null }))]
}

export function stileInfo(): LesenErgebnis['stile'] {
  const vorgaben = STIL_VORGABEN.map(
    (v): StilVorgabeInfo => ({ id: v.id, name: v.name, fuellung: v.fuellung ?? null, linie: v.linie, linienart: v.linienart ?? 'durchgezogen' }),
  )
  return {
    elementtypen: elementtypen(),
    bausteine: bausteinInfos(),
    vorgaben,
    fuellfarben: FUELLFARBEN.map((f) => ({ ...f })),
    linienfarben: LINIENFARBEN.map((f) => ({ ...f })),
    linienarten: [...LINIENARTEN],
    bezugslisten: [...BEZUGS_LISTEN],
    modi: [...MODI],
  }
}

function grundlageInfo(skizze: SkizzeDaten | undefined, a: ReturnType<typeof abbildungFuer>['abb']): LesenErgebnis['grundlage'] {
  const els = (skizze?.elemente ?? []).filter(istGrundlage)
  const elemente: GrundlageElementInfo[] = []
  let pfosten = 0
  for (const e of els) {
    switch (e.typ) {
      case 'bauform':
        if (e.art === 'pfosten') {
          pfosten += 1
          break
        }
        elemente.push({
          art: e.art === 'grundstueck' ? 'grundstueck' : 'bauteil',
          beschriftung: e.beschriftung ? e.beschriftung.replace(/\n/g, ' ') : null,
          punkte: e.punkte.map((p) => pxZuM(a, p)),
          gestrichelt: e.gestrichelt === true,
        })
        break
      case 'linie':
      case 'massangabe':
        elemente.push({
          art: 'linie',
          beschriftung: e.typ === 'massangabe' ? e.beschriftung : null,
          punkte: [pxZuM(a, { x: e.x1, y: e.y1 }), pxZuM(a, { x: e.x2, y: e.y2 })],
          gestrichelt: e.typ === 'linie' && e.linienart === 'gestrichelt',
        })
        break
      case 'text':
        elemente.push({ art: 'text', beschriftung: e.inhalt, punkte: [pxZuM(a, { x: e.x, y: e.y })], gestrichelt: false })
        break
      default:
        break
    }
  }
  return {
    vorhanden: els.length > 0,
    quelle: skizze?.grundlage?.quelle ?? null,
    gesperrt: skizze?.grundlage?.gesperrt === true,
    elemente,
    pfostenAnzahl: pfosten,
  }
}

/**
 * Auszug aus dem WEP. `skizze` ist die Skizze, wie sie gerade im Editor steht (sonst die gespeicherte bzw. – mit Parzelle –
 * die auf die Parzelle gelegte); das Ergebnis ist reines JSON.
 */
export function leseWep(wep: Wep, skizze: SkizzeDaten | undefined = wep.skizze): LesenErgebnis {
  const lage = lageVon(wep)
  const { abb, mitParzelle, flaecheM } = abbildungFuer(wep, skizze)
  const { vergleich } = flaecheUndVergleich(wep.parzelle, wep.formalien.parzellenflaecheM2 || undefined)
  const bauteile = wep.bau?.bauteile ?? []
  const bauInfo: BauteilInfo[] = bauteile.map((b) => ({
    id: b.id,
    kuerzel: b.kuerzel,
    art: b.art,
    bezeichnung: b.bezeichnung ?? null,
    laengeM: b.laenge ?? null,
    breiteM: b.breite ?? null,
    hoeheM: b.hoehe ?? null,
    flaecheM2: b.flaeche,
    baujahr: b.baujahr ?? null,
    nichtBewerten: b.nichtBewerten === true,
  }))
  const teile: GrundrissTeilInfo[] = (wep.grundriss?.teile ?? [])
    .filter((t) => t.punkte.length >= 3)
    .map((t) => ({
      kuerzel: kuerzelVon(t, bauteile),
      bauteilId: t.bauteilId ?? null,
      punkte: t.punkte.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
      flaecheM2: r2(flaecheVon(t.punkte)),
      gestrichelt: t.gestrichelt === true,
      dachform: t.dachform ?? null,
      traufhoeheM: t.hoehe ?? null,
      firsthoeheM: t.hoeheOben ?? null,
    }))
  const beseitigung: BeseitigungInfo[] = wep.gruen.beseitigungAA.map((b, i) => ({
    id: b.id,
    nr: i + 1,
    gegenstand: b.gegenstand,
    menge: b.menge,
    einheit: b.einheit,
    einzelpreis: b.einzelpreis,
  }))

  const ergebnis: LesenErgebnis = {
    schemaVersion: SCHNITTSTELLE_VERSION,
    skizzeFormat: SKIZZE_FORMAT,
    wepId: wep.id,
    formalien: { ...wep.formalien } as unknown as Record<string, string | number>,
    rolle: wepRolle(wep),
    parzelle: {
      vorhanden: Boolean(lage),
      form: wep.parzelle?.form ?? null,
      ecken: lage ? lage.punkte.map((p) => ({ x: r2(p.x), y: r2(p.y) })) : [],
      flaecheM2: lage ? r2(lage.flaecheM2) : null,
      vertragsflaecheM2: wep.formalien.parzellenflaecheM2 || null,
      flaechenHinweis: vergleich?.hinweis ?? null,
      breiteM: lage ? r2(lage.breiteM) : null,
      hoeheM: lage ? r2(lage.hoeheM) : null,
      hinweis: lage
        ? null
        : wep.parzelle
          ? 'Die Parzelle ist noch nicht berechenbar (Maße fehlen). Meter gelten bis dahin für eine Zeichenfläche von 20 × 15 m.'
          : 'Es ist keine Parzelle angelegt. Meter gelten bis dahin für eine Zeichenfläche von 20 × 15 m.',
    },
    bau: { vorhanden: bauInfo.length > 0 || teile.length > 0, bauteile: bauInfo, grundriss: teile },
    grundlage: grundlageInfo(skizze, abb),
    gruen: {
      aussenanlagen: wep.gruen.aussenanlagen.map((p, i) => positionInfo(p, i + 1)),
      aufwuchs: wep.gruen.aufwuchs.map((p, i) => positionInfo(p, i + 1)),
      beseitigung,
    },
    skizzeGruen: { mitParzelle, flaecheM, elemente: gruenZuFormat(skizze, abb) },
    stile: stileInfo(),
  }
  // reines JSON (keine undefined-Felder, keine Referenzen auf die Daten des WEP)
  return JSON.parse(JSON.stringify(ergebnis)) as LesenErgebnis
}

