// Rechen-Tools im WEP (Beta 4, Paket 4): Flächen, Kubatur nach Dachform, Altersabzug/Restnutzung, Baupreisindex, 24-m²-Check.
//
// Nichts wird hier ein zweites Mal gerechnet: Der Altersabzug und der Wert pro m² kommen aus `berechneBau` (also aus derselben
// Rechnung wie die Bewertung und der Export), die Kubatur aus `massenAusFlaeche` (wie der Grundriss in „Skizze Bau“), der Index aus
// `ermittleBaupreisindex`, die 24-m²-Verteilung aus `weisePlaetzeZu`/`verteileFlaeche`. Dieses Modul sammelt nur die Eingaben und
// Ergebnisse für die Oberfläche und baut „ins Bauteil übernehmen“ (`uebernehme…`).
//
// Grundsatz wie überall: Eingaben werden nicht gesperrt; Auffälligkeiten sind Hinweise.
import { neueBauDaten, type Bauteil, type Wep } from '../model'
import { massenAusFlaeche, type Dachform, type Massen } from '../skizze/grundriss'
import { ermittleBaupreisindex } from './baupreisindex'
import { ZULAESSIGE_FLAECHE_M2 } from './tabellen'
import {
  alterInJahren,
  berechneBau,
  flaecheVon,
  rund2,
  schlageRestnutzungVor,
  verteileFlaeche,
  weisePlaetzeZu,
  wertjahrVon,
  type BauErgebnis,
  type BauOptionen,
} from './rechnen'

// ---------------------------------------------------------------------------
// Flächenrechner
// ---------------------------------------------------------------------------

export type TeilflaecheArt = 'rechteck' | 'dreieck' | 'dreieck3' | 'trapez'

export const TEILFLAECHE_ARTEN: { art: TeilflaecheArt; text: string; hilfe: string; felder: { key: 'a' | 'b' | 'c' | 'h'; label: string }[] }[] = [
  { art: 'rechteck', text: 'Rechteck', hilfe: 'Länge × Breite', felder: [{ key: 'a', label: 'Länge' }, { key: 'b', label: 'Breite' }] },
  { art: 'dreieck', text: 'Dreieck (Grundseite, Höhe)', hilfe: 'Grundseite × Höhe ÷ 2', felder: [{ key: 'a', label: 'Grundseite' }, { key: 'h', label: 'Höhe' }] },
  {
    art: 'dreieck3',
    text: 'Dreieck (drei Seiten)',
    hilfe: 'Aus den drei gemessenen Seiten (Heron) – für schiefe Ecken, wenn nur Seiten messbar sind',
    felder: [{ key: 'a', label: 'Seite 1' }, { key: 'b', label: 'Seite 2' }, { key: 'c', label: 'Seite 3' }],
  },
  {
    art: 'trapez',
    text: 'Trapez',
    hilfe: '(parallele Seite 1 + parallele Seite 2) ÷ 2 × Höhe',
    felder: [{ key: 'a', label: 'Parallele 1' }, { key: 'b', label: 'Parallele 2' }, { key: 'h', label: 'Höhe' }],
  },
]

/** Eine Teilfläche eines unregelmäßigen Grundrisses. `abzug`: wird abgezogen (Einschnitt, Aussparung). */
export interface Teilflaeche {
  id: string
  art: TeilflaecheArt
  a?: number
  b?: number
  c?: number
  h?: number
  abzug?: boolean
  bezeichnung?: string
}

/** Fläche einer Teilfläche in m²; `undefined`, solange Maße fehlen oder das Dreieck nicht möglich ist. */
export function teilflaecheM2(t: Teilflaeche): number | undefined {
  const pos = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0
  switch (t.art) {
    case 'rechteck':
      return pos(t.a) && pos(t.b) ? t.a * t.b : undefined
    case 'dreieck':
      return pos(t.a) && pos(t.h) ? (t.a * t.h) / 2 : undefined
    case 'trapez':
      return pos(t.a) && pos(t.b) && pos(t.h) ? ((t.a + t.b) / 2) * t.h : undefined
    case 'dreieck3': {
      if (!pos(t.a) || !pos(t.b) || !pos(t.c)) return undefined
      const s = (t.a + t.b + t.c) / 2
      const q = s * (s - t.a) * (s - t.b) * (s - t.c)
      return q > 0 ? Math.sqrt(q) : undefined
    }
  }
}

export interface FlaechenErgebnis {
  zeilen: { teil: Teilflaeche; flaeche: number | undefined; vorzeichen: 1 | -1 }[]
  /** Summe aller Teilflächen (Abzüge abgezogen), auf zwei Stellen gerundet. */
  summe: number
  hinweise: string[]
}

export function rechneFlaechen(teile: readonly Teilflaeche[]): FlaechenErgebnis {
  const hinweise: string[] = []
  const zeilen = teile.map((teil) => {
    const flaeche = teilflaecheM2(teil)
    if (teil.art === 'dreieck3' && flaeche === undefined && [teil.a, teil.b, teil.c].every((x) => x && x > 0)) {
      hinweise.push('Ein Dreieck mit diesen drei Seiten gibt es nicht (die zwei kürzeren Seiten sind zusammen nicht länger als die dritte) – bitte nachmessen.')
    }
    return { teil, flaeche, vorzeichen: (teil.abzug ? -1 : 1) as 1 | -1 }
  })
  const summe = rund2(zeilen.reduce((s, z) => s + (z.flaeche ?? 0) * z.vorzeichen, 0))
  if (zeilen.length > 0 && summe < 0) hinweise.push('Die Abzüge sind größer als die Flächen – bitte prüfen.')
  return { zeilen, summe: Math.max(0, summe), hinweise }
}

// ---------------------------------------------------------------------------
// Kubatur
// ---------------------------------------------------------------------------

export interface KubaturEingabe {
  /** Grundfläche in m²; fehlt sie, wird aus Länge × Breite gerechnet. */
  flaeche?: number
  laenge?: number
  breite?: number
  dachform: Dachform
  /** Wand-/Traufhöhe (Pultdach: niedrige Wand) */
  hoehe?: number
  /** Pultdach: hohe Wand, Satteldach: Firsthöhe */
  hoeheOben?: number
}

/** Fläche, die für die Kubatur gilt: eingegebene Fläche, sonst Länge × Breite. */
export function kubaturFlaeche(e: KubaturEingabe): number | undefined {
  if (e.flaeche && e.flaeche > 0) return rund2(e.flaeche)
  if (e.laenge && e.breite && e.laenge > 0 && e.breite > 0) return rund2(e.laenge * e.breite)
  return undefined
}

/** Kubatur nach Dachform (Richtlinie S. 4 Nr. 9) – dieselbe Rechnung wie die Massenberechnung der Skizze Bau. */
export function rechneKubatur(e: KubaturEingabe): Massen | undefined {
  const flaeche = kubaturFlaeche(e)
  if (flaeche === undefined) return undefined
  const rechteck = !(e.flaeche && e.flaeche > 0) // aus Länge × Breite = Rechteck, eingegebene Fläche: Form unbekannt
  const umfang = e.laenge && e.breite ? rund2(2 * (e.laenge + e.breite)) : 0
  return massenAusFlaeche(flaeche, umfang, e.dachform, e.hoehe, e.hoeheOben, rechteck)
}

// ---------------------------------------------------------------------------
// Altersabzug / Restnutzung
// ---------------------------------------------------------------------------

/** Wert, mit dem der Rechner ein einzelnes Bauteil bewertet (Baupreisindex wie im WEP). */
export interface AlterErgebnis {
  wertjahr: number
  alter: number | undefined
  /** Tabelle der Restnutzung (Laube, Anbau, Schuppen, Keller) oder Jahre × % je Jahr (Gewächshaus, angebauter Vorplatz). */
  verfahren: 'restnutzung' | 'linear' | 'wie-laube'
  bauklasse: string
  restnutzungsjahre: number | undefined
  /** Vorschlag aus dem Baujahr (Tabellenende minus Alter); nur beim Verfahren „restnutzung“ */
  rnVorschlag: number | undefined
  minderungProJahr: number | undefined
  altersabzugProzent: number
  /** €/m² nach Mängeln, nach Altersabzug, nach Baupreisindex */
  nachMaengeln: number
  nachAlter: number
  wertProM2: number
  flaeche: number
  wert: number
  abgeschrieben: boolean
  indexWert: number | undefined
}

/**
 * Bewertet ein Bauteil allein, mit denselben Regeln wie `berechneBau`: das Bauteil wird als einziges in ein Probe-WEP gelegt.
 * (Die 24-m²-Kürzung fällt dabei nicht an; die Fläche des Bauteils zählt voll. Beim Keller fehlt die Begrenzung auf die
 * Restnutzung der Laube.)
 */
export function bewerteEinzeln(b: Bauteil, wep: Pick<Wep, 'formalien'> & { bau?: Wep['bau'] }, optionen: BauOptionen = {}): { erg: BauErgebnis; ergebnis: AlterErgebnis | undefined } {
  const basis = wep.bau ?? neueBauDaten()
  const probe = { formalien: wep.formalien, bau: { ...basis, bauteile: [b], zulaessigeFlaeche: undefined } }
  const erg = berechneBau(probe, optionen)!
  const wertjahr = erg.wertjahr
  const alter = alterInJahren(b.baujahr, wertjahr)
  const indexWert = erg.index?.wert
  const haupt = [erg.laube, ...erg.anbauten, erg.schuppen].find((x) => x?.bauteil.id === b.id)
  if (haupt) {
    return {
      erg,
      ergebnis: {
        wertjahr, alter,
        verfahren: 'restnutzung',
        bauklasse: haupt.bauklasse,
        restnutzungsjahre: haupt.restnutzungsjahre,
        rnVorschlag: haupt.spalte !== 5 ? schlageRestnutzungVor(haupt.spalte, b.baujahr, wertjahr) : undefined,
        minderungProJahr: undefined,
        altersabzugProzent: haupt.altersabzugProzent,
        nachMaengeln: haupt.nachMaengeln,
        nachAlter: haupt.nachAlter,
        wertProM2: haupt.wertProM2,
        flaeche: flaecheVon(b),
        wert: rund2(flaecheVon(b) * haupt.wertProM2),
        abgeschrieben: haupt.abgeschrieben,
        indexWert,
      },
    }
  }
  if (erg.gewaechshaus?.bauteil.id === b.id) {
    const g = erg.gewaechshaus
    return {
      erg,
      ergebnis: {
        wertjahr, alter, verfahren: 'linear', bauklasse: '', restnutzungsjahre: undefined, rnVorschlag: undefined, minderungProJahr: g.minderungProJahr,
        altersabzugProzent: g.altersabzugProzent, nachMaengeln: g.nachMaengeln, nachAlter: g.nachAlter, wertProM2: g.wertProM2,
        flaeche: g.flaeche, wert: g.wert, abgeschrieben: g.abgeschrieben, indexWert,
      },
    }
  }
  if (erg.vorplatz?.bauteil.id === b.id) {
    const v = erg.vorplatz
    return {
      erg,
      ergebnis: {
        wertjahr, alter, verfahren: v.lage === 'integriert' ? 'wie-laube' : 'linear', bauklasse: '', restnutzungsjahre: undefined, rnVorschlag: undefined,
        minderungProJahr: v.lage === 'angebaut' ? v.minderungProJahr : undefined, altersabzugProzent: v.altersabzugProzent,
        nachMaengeln: v.nhk, nachAlter: v.wertProM2, wertProM2: v.wertProM2, flaeche: v.flaeche, wert: v.wert,
        abgeschrieben: v.altersabzugProzent >= 100, indexWert,
      },
    }
  }
  return { erg, ergebnis: undefined }
}

/** Wie `bewerteEinzeln`, aber mit Probewerten für Baujahr, Restnutzung und Minderung (Rechner-Eingaben, ohne das Bauteil zu ändern). */
export function altersRechnung(
  b: Bauteil,
  wep: Pick<Wep, 'formalien'> & { bau?: Wep['bau'] },
  probe: { baujahr?: number; restnutzungsjahre?: number; minderungProJahr?: number },
  optionen: BauOptionen = {},
): AlterErgebnis | undefined {
  const mit: Bauteil = {
    ...b,
    baujahr: probe.baujahr ?? b.baujahr,
    minderungProJahr: probe.minderungProJahr ?? b.minderungProJahr,
    // Eine Restnutzung aus dem Rechner gilt als von Hand gesetzt; ohne Eingabe gilt der Vorschlag aus dem Baujahr
    ...(probe.restnutzungsjahre !== undefined ? { restnutzungsjahre: probe.restnutzungsjahre, rnManuell: true } : { restnutzungsjahre: undefined, rnManuell: false }),
  }
  return bewerteEinzeln(mit, wep, optionen).ergebnis
}

/** Das Bauteil mit den Werten aus dem Altersrechner (nur gesetzte Werte; Restnutzung gilt dann als von Hand gesetzt). */
export function uebernehmeAlter(b: Bauteil, w: { baujahr?: number; restnutzungsjahre?: number; rnBegruendung?: string; minderungProJahr?: number }): Bauteil {
  const neu: Bauteil = { ...b }
  if (w.baujahr !== undefined) neu.baujahr = w.baujahr
  if (w.minderungProJahr !== undefined) neu.minderungProJahr = w.minderungProJahr
  if (w.restnutzungsjahre !== undefined) {
    neu.restnutzungsjahre = w.restnutzungsjahre
    neu.rnManuell = true
    if (w.rnBegruendung?.trim()) neu.rnBegruendung = w.rnBegruendung.trim()
  }
  return neu
}

// ---------------------------------------------------------------------------
// Übernehmen: Fläche und Kubatur ins Bauteil
// ---------------------------------------------------------------------------

/**
 * Fläche und/oder Kubatur aus dem Rechner ins Bauteil. Ist das Bauteil mit dem Grundriss verknüpft (`ausGrundriss`), setzt das
 * die Werte „von Hand“ (`ausGrundriss: false`), damit der Grundriss sie nicht wieder überschreibt – wie das Fläche-Feld in der Maske.
 */
export function uebernehmeMasse(
  b: Bauteil,
  w: { flaeche?: number; laenge?: number; breite?: number; hoehe?: number; kubaturM3?: number },
): Bauteil {
  const neu: Bauteil = { ...b }
  if (w.flaeche !== undefined && w.flaeche > 0) {
    neu.flaeche = rund2(w.flaeche)
    neu.flaecheManuell = true
  }
  if (w.laenge !== undefined) neu.laenge = w.laenge
  if (w.breite !== undefined) neu.breite = w.breite
  if (w.hoehe !== undefined) neu.hoehe = w.hoehe
  if (w.kubaturM3 !== undefined) neu.kubaturM3 = w.kubaturM3
  if (b.ausGrundriss) neu.ausGrundriss = false
  return neu
}

// ---------------------------------------------------------------------------
// Baupreisindex
// ---------------------------------------------------------------------------

export interface IndexUmrechnung {
  von: number
  nach: number
  vonJahr: number
  nachJahr: number
  faktor: number
  /** Betrag nach Umrechnung */
  betrag: number
  /** Eines der Jahre hat keinen eigenen Wert (Ersatz) */
  hinweise: string[]
}

/** Rechnet einen Betrag mit dem Baupreisindex von einem Jahr auf ein anderes um (Beträge von früher auf den Stand des Wertjahres). */
export function indexUmrechnung(betrag: number, vonJahr: number, nachJahr: number, profilIndex?: Record<string, number>): IndexUmrechnung | undefined {
  const v = ermittleBaupreisindex(vonJahr, profilIndex)
  const n = ermittleBaupreisindex(nachJahr, profilIndex)
  if (!v || !n || !(betrag >= 0)) return undefined
  const hinweise: string[] = []
  if (v.ersatz) hinweise.push(`Für ${vonJahr} liegt kein Index vor – gerechnet mit dem Wert von ${v.ersatzJahr}.`)
  if (n.ersatz) hinweise.push(`Für ${nachJahr} liegt kein Index vor – gerechnet mit dem Wert von ${n.ersatzJahr}.`)
  return { von: v.wert, nach: n.wert, vonJahr, nachJahr, faktor: n.wert / v.wert, betrag: rund2((betrag * n.wert) / v.wert), hinweise }
}

// ---------------------------------------------------------------------------
// 24-m²-Check
// ---------------------------------------------------------------------------

export interface FlaechenCheckZeile {
  bauteil: Bauteil
  flaeche: number
  bewertet: number
  nichtBerechnet: number
}

export interface FlaechenCheck {
  zulaessig: number
  /** Laube, Anbauten, Vorplatz in der Reihenfolge der Anrechnung */
  zeilen: FlaechenCheckZeile[]
  summe: number
  bewertet: number
  nichtBerechnet: number
  /** Noch frei bis zur zulässigen Fläche */
  frei: number
  /** € weniger durch die nicht berechnete Fläche (Fläche × Wert je m²) */
  wertverlust: number
  /** Zählen nicht auf die 24 m²: Schuppen/Unterstand, Gewächshaus, Keller (nicht bewertet), Überzählige */
  ausgenommen: { bauteil: Bauteil; grund: string }[]
  hinweise: string[]
}

/** Was zählt auf die zulässige Fläche, was wird berechnet, was nicht. Rechnet mit denselben Funktionen wie die Bewertung. */
export function pruefeZulaessigeFlaeche(wep: Pick<Wep, 'bau' | 'formalien'>, optionen: BauOptionen = {}, zulaessigVorgabe?: number): FlaechenCheck {
  const bauteile = wep.bau?.bauteile ?? []
  const zulaessig = zulaessigVorgabe ?? wep.bau?.zulaessigeFlaeche ?? ZULAESSIGE_FLAECHE_M2
  const plaetze = weisePlaetzeZu(bauteile)
  const verteilt = verteileFlaeche(plaetze, zulaessig)
  const reihe = [plaetze.laube, ...plaetze.anbauten, plaetze.vorplatz].filter((b): b is Bauteil => Boolean(b))
  const zeilen = reihe.map((bauteil) => {
    const v = verteilt.get(bauteil.id) ?? { bewertet: 0, nichtBerechnet: 0 }
    return { bauteil, flaeche: flaecheVon(bauteil), ...v }
  })
  const summe = rund2(zeilen.reduce((s, z) => s + z.flaeche, 0))
  const bewertet = rund2(zeilen.reduce((s, z) => s + z.bewertet, 0))
  const nichtBerechnet = rund2(zeilen.reduce((s, z) => s + z.nichtBerechnet, 0))

  // Wertverlust über die Bewertung selbst (€/m² je Bauteil aus berechneBau)
  const erg = wep.bau ? berechneBau({ ...wep, bau: { ...wep.bau, zulaessigeFlaeche: zulaessig } }, optionen) : undefined
  const proM2 = new Map<string, number>()
  if (erg) {
    for (const h of [erg.laube, ...erg.anbauten]) if (h) proM2.set(h.bauteil.id, h.wertProM2)
    if (erg.vorplatz) proM2.set(erg.vorplatz.bauteil.id, erg.vorplatz.wertProM2)
  }
  const wertverlust = rund2(zeilen.reduce((s, z) => s + z.nichtBerechnet * (proM2.get(z.bauteil.id) ?? 0), 0))

  const ausgenommen: FlaechenCheck['ausgenommen'] = []
  if (plaetze.schuppen) ausgenommen.push({ bauteil: plaetze.schuppen, grund: plaetze.schuppen.art === 'keller' ? 'Keller: eigene Bewertung, nicht auf die zulässige Fläche angerechnet' : 'Schuppen/Unterstand: eigene Bewertung, nicht auf die zulässige Fläche angerechnet' })
  if (plaetze.gewaechshaus) ausgenommen.push({ bauteil: plaetze.gewaechshaus, grund: 'Gewächshaus: Nebenanlage (höchstens 12 m²), nicht auf die zulässige Fläche angerechnet' })
  for (const b of plaetze.ueberzaehlig) ausgenommen.push({ bauteil: b, grund: 'Kein Platz in der Vorlage – wird weder gerechnet noch exportiert' })
  for (const b of bauteile.filter((x) => x.nichtBewerten)) if (!ausgenommen.some((a) => a.bauteil.id === b.id)) ausgenommen.push({ bauteil: b, grund: 'Als „nicht bewerten“ markiert' })

  const hinweise: string[] = []
  if (nichtBerechnet > 0) hinweise.push(`${String(nichtBerechnet).replace('.', ',')} m² über der zulässigen Fläche werden nicht berechnet und als „nicht berechnete Baufläche“ ausgewiesen.`)
  const vorplatzNicht = zeilen.filter((z) => z.bauteil.art === 'vorplatz').reduce((s, z) => s + z.nichtBerechnet, 0)
  if (vorplatzNicht > 0) hinweise.push(`Davon ${String(vorplatzNicht).replace('.', ',')} m² beim überdachten Vorplatz – die Summe „nicht berechnete Baufläche“ in der Vorlage (I38) enthält ihn nicht.`)
  if (zulaessig !== ZULAESSIGE_FLAECHE_M2) hinweise.push(`Es gilt eine zulässige Fläche von ${String(zulaessig).replace('.', ',')} m² (Regel: ${ZULAESSIGE_FLAECHE_M2} m², nach Vertragslage anpassbar).`)
  return { zulaessig, zeilen, summe, bewertet, nichtBerechnet, frei: rund2(Math.max(0, zulaessig - bewertet)), wertverlust, ausgenommen, hinweise }
}

/** Die zulässige Fläche am WEP setzen (Vertragslage); `undefined` = Regelwert. */
export function setzeZulaessigeFlaeche(wep: Wep, flaeche: number | undefined): Wep {
  const bau = wep.bau ?? neueBauDaten()
  return { ...wep, bau: { ...bau, zulaessigeFlaeche: flaeche && flaeche > 0 && flaeche !== ZULAESSIGE_FLAECHE_M2 ? flaeche : undefined } }
}

export { wertjahrVon }
