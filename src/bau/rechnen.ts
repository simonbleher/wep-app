// Rechenkern des Bau-Teils: eine genaue Nachbildung der Formeln im Blatt „Baulichkeiten“ der Vorlage
// (Zellbezüge stehen jeweils dabei). Dadurch rechnet die App dasselbe wie die Excel-Datei, die der Export
// erzeugt; `src/export/__tests__/exportBauRechnung.test.ts` prüft das gegen LibreOffice.
//
// Grundsatz: Eingaben werden nicht verändert oder gesperrt. Regelverstöße meldet `regeln.ts` als Hinweise.
import type { Bauteil, BauDaten, Wep } from '../model'
import { ermittleBaupreisindex, type IndexErgebnis } from './baupreisindex'
import { bauklasseAusAngaben } from './assistent'
import {
  GEWAECHSHAUS,
  GRUBE_MAX_ALTER_TANK,
  grubeAltersabzug,
  GRUBE_NICHT_GELEERT_ABZUG,
  GRUBEN_TYPEN,
  KANAL_HOECHSTWERT,
  NHK_TABELLE,
  RESTNUTZUNG,
  TYP_FEHLT,
  VORPLATZ_HOECHST,
  VORPLATZ_INTEGRIERT_REGEL,
  ZULAESSIGE_FLAECHE_M2,
  type NhkEintrag,
} from './tabellen'

/** Excel-ROUND(x; 2): kaufmännisch auf zwei Stellen (halb weg von null), Gleitkomma-Rauschen bereinigt. */
export function rund2(x: number): number {
  if (!Number.isFinite(x)) return 0
  const a = Math.abs(x)
  const r = Math.round(Number((a * 100).toPrecision(15))) / 100
  return x < 0 ? -r : r
}

/** Alter in Jahren: Die Abschreibung beginnt mit dem vollen Kalenderjahr der Erstellung (Richtlinie S. 8). */
export function alterInJahren(baujahr: number | undefined, wertjahr: number): number | undefined {
  if (!baujahr || baujahr < 1800) return undefined
  return Math.max(0, wertjahr - baujahr + 1)
}

// ---------------------------------------------------------------------------
// Bauklasse, Restnutzung
// ---------------------------------------------------------------------------

/** Eintrag der NHK-Tabelle zu einem Vorlagen-Text (`uwe`); `undefined` = „fehlt“/unbekannt. */
export function nhkEintrag(typ: string | undefined): NhkEintrag | undefined {
  if (typ === undefined) return undefined
  return NHK_TABELLE.find((e) => e.typ === typ)
}

/** Der Typ-Text, den die Vorlage für dieses Bauteil bekommt (Eingabe, sonst Assistent, sonst „fehlt“). */
export function typFuer(b: Bauteil): string {
  if (b.nichtBewerten) return TYP_FEHLT
  if (b.typ && (b.typManuell || b.typ === TYP_FEHLT || nhkEintrag(b.typ))) return b.typ
  return bauklasseAusAngaben(b)?.typ ?? TYP_FEHLT
}

/**
 * Abzug in % aus der Restnutzungstabelle (Vorlage: SVERWEIS(RN; nelke; Spalte), ungefähre Suche).
 * Spalte 2 = Bauklasse I, 3 = II + III, 4 = IV, 5 = keine Bauklasse (Abzug 0).
 * Wie in Excel: Restnutzungsjahre werden abgerundet, fehlende Angabe zählt als 0 Jahre (= 100 % Abzug), hinter dem
 * Ende der Tabellenspalte (IV: 40, II + III: 60 Jahre) liefert Excel 0 %.
 */
export function abzugRestnutzung(spalte: 2 | 3 | 4 | 5, restnutzungsjahre: number | undefined): number {
  if (spalte === 5) return 0
  const rn = Math.floor(restnutzungsjahre ?? 0)
  const zeile = RESTNUTZUNG[Math.min(Math.max(rn, 0), RESTNUTZUNG.length - 1)]
  return zeile[spalte - 2] ?? 0
}

/** Letztes Jahr der Restnutzungstabelle je Spalte (Gesamtnutzungsdauer: IV 40, II + III 60, I 80 Jahre). */
export function tabellenEnde(spalte: 2 | 3 | 4): number {
  let ende = 0
  RESTNUTZUNG.forEach((z, i) => {
    if (z[spalte - 2] !== null) ende = i
  })
  return ende
}

/** Vorschlag Restnutzungsjahre: Gesamtnutzungsdauer (Ende der Tabellenspalte) minus Alter, nicht unter 0. */
export function schlageRestnutzungVor(spalte: 2 | 3 | 4, baujahr: number | undefined, wertjahr: number): number | undefined {
  const alter = alterInJahren(baujahr, wertjahr)
  if (alter === undefined) return undefined
  return Math.max(0, tabellenEnde(spalte) - alter)
}

// ---------------------------------------------------------------------------
// Ergebnisse
// ---------------------------------------------------------------------------

/** Bewertung eines Bauteils mit Laube-Rechenweg (Laube, Anbau, Schuppen/Keller): Zeilen 12–19 usw. der Vorlage. */
export interface HauptErgebnis {
  bauteil: Bauteil
  kuerzel: string
  typ: string
  bauklasse: string
  spalte: 2 | 3 | 4 | 5
  /** NHK €/m² (C14) */
  nhk: number
  /** Mängelabzug in % (E14) */
  maengelProzent: number
  /** nach Mängelabzug (H14) */
  nachMaengeln: number
  restnutzungsjahre: number | undefined
  /** Altersabzug in % (E15) */
  altersabzugProzent: number
  /** nach Altersabzug (H15) */
  nachAlter: number
  /** Index/100 (E16) */
  indexFaktor: number
  /** €/m² (H16) */
  wertProM2: number
  /** zulässig überbaute Fläche (A17) */
  flaeche: number
  /** nicht berechnete Baufläche (I19, I28, I37) */
  nichtBerechnet: number
  /** Wert Bauteil (E17 = K17) */
  wert: number
  /** Restnutzungsjahre 0 bzw. Abzug 100 %: wirtschaftlich abgeschrieben. */
  abgeschrieben: boolean
  /** Schuppen/Unterstand: wird nicht bewertet (Fläche 0), weil es eine Laube gibt. */
  nichtBewertetWegenLaube?: boolean
}

export interface GewaechshausErgebnis {
  bauteil: Bauteil
  nhk: number
  maengelProzent: number
  nachMaengeln: number // I41
  alter: number | undefined // I40
  minderungProJahr: number // G40
  altersabzugProzent: number // E42
  abgeschrieben: boolean
  nachAlter: number // C43
  wertProM2: number // I43
  flaeche: number // F44
  wert: number // K44
}

export interface VorplatzErgebnis {
  bauteil: Bauteil
  lage: 'integriert' | 'angebaut'
  /** NHK integriert (E63) bzw. Güte-Wert angebaut (E67) */
  nhk: number
  maengelProzent: number
  altersabzugProzent: number
  wertProM2: number // I70
  flaeche: number // F71
  wert: number // K71
  /** Alter, Minderung je Jahr und Altersabzug (angebaut: E66, H66, G68) */
  alter: number | undefined
  minderungProJahr: number
}

export interface GrubeErgebnis {
  alter: number | undefined
  /** Alter, mit dem gerechnet wird (höchstens 16 bzw. 33 Jahre) */
  wirksamesAlter: number
  altersabzugProzent: number // C75
  grundwert: number // F74
  wertProM3: number // F75
  inhaltM3: number
  nachweisFehlt: boolean // E76
  wert: number // K75
  nichtGeleertAbzug: number // K77 (negativ)
}

export interface KanalErgebnis {
  alter: number | undefined
  kosten: number
  hoechstens: number // E79
  abzug: number // H79 (Anteil)
  wert: number // K79
}

export interface BauErgebnis {
  wertjahr: number
  index: IndexErgebnis | null
  /** Faktor Index/100, mit dem gerechnet wurde (0 ohne Index) */
  indexFaktor: number
  laube?: HauptErgebnis
  anbauten: HauptErgebnis[]
  schuppen?: HauptErgebnis
  gewaechshaus?: GewaechshausErgebnis
  vorplatz?: VorplatzErgebnis
  grube?: GrubeErgebnis
  kanal?: KanalErgebnis
  /** Bauteile, für die die Vorlage keinen Platz hat (nicht exportiert, nicht gerechnet) */
  ueberzaehlig: Bauteil[]
  /** Zwischensumme der Bauteile (K53/K61) */
  summeBauteile: number
  /** Baulichkeiten insgesamt (K81, mit korrigierten Formeln der Vorlage) */
  insgesamt: number
  /** bewertete bebaute Fläche (F101) */
  bewerteteFlaeche: number
  /** nicht berechnete Bauflächen (I38) */
  nichtBerechneteFlaeche: number
  /** Kosten nicht beräumter Baulichkeiten (H104, Deckblatt E25) */
  nichtBeraeumtKosten: number
  /** Summe Beseitigungskosten Bau (Beseitigungskosten K24, Deckblatt E26) */
  beseitigungSumme: number
}

// ---------------------------------------------------------------------------
// Plätze der Vorlage
// ---------------------------------------------------------------------------

export interface Plaetze {
  laube?: Bauteil
  anbauten: Bauteil[] // höchstens 2: A1, A2
  schuppen?: Bauteil // S oder U (auch Keller)
  gewaechshaus?: Bauteil
  vorplatz?: Bauteil
  ueberzaehlig: Bauteil[]
}

/**
 * Verteilt die Bauteile auf die Plätze der Vorlage: Laube, zwei Anbauten (A1, A2), ein Schuppen oder Keller (S/U),
 * Gewächshaus, Vorplatz Ü1. Weitere Bauteile haben in der Vorlage keinen Platz (`ueberzaehlig`).
 */
export function weisePlaetzeZu(bauteile: readonly Bauteil[]): Plaetze {
  const p: Plaetze = { anbauten: [], ueberzaehlig: [] }
  const nimm = (art: Bauteil['art']) => bauteile.filter((b) => b.art === art)
  const ablage = (liste: Bauteil[], platz: number) => {
    liste.slice(platz).forEach((b) => p.ueberzaehlig.push(b))
    return liste.slice(0, platz)
  }
  p.laube = ablage(nimm('laube'), 1)[0]
  p.anbauten = ablage(nimm('anbau'), 2)
  p.gewaechshaus = ablage(nimm('gewaechshaus'), 1)[0]
  p.vorplatz = ablage(nimm('vorplatz'), 1)[0]
  const sk = [...nimm('schuppen'), ...nimm('keller')]
  p.schuppen = ablage(sk, 1)[0]
  return p
}

/** Standard-Kürzel einer Bauteil-Art; Anbauten werden nach Reihenfolge nummeriert. */
export function kuerzelFuer(art: Bauteil['art'], vorhandene: readonly Bauteil[]): string {
  const gleiche = vorhandene.filter((b) => b.art === art).length
  switch (art) {
    case 'laube':
      return 'L'
    case 'anbau':
      return `A${gleiche + 1}`
    case 'schuppen':
      return 'S'
    case 'gewaechshaus':
      return 'GWH'
    case 'vorplatz':
      return 'Ü1'
    case 'keller':
      return 'K'
  }
}

// ---------------------------------------------------------------------------
// Bauteile
// ---------------------------------------------------------------------------

export function mangelProzent(b: Bauteil): number {
  return b.maengel.reduce((s, m) => s + (Number.isFinite(m.abzug) ? m.abzug : 0), 0)
}

export function flaecheVon(b: Bauteil): number {
  if (b.nichtBewerten) return 0
  const f = Number.isFinite(b.flaeche) ? b.flaeche : 0
  return Math.max(0, f)
}

/** Vorschlag Fläche aus den Außenmaßen. */
export function flaecheAusMassen(laenge: number | undefined, breite: number | undefined): number | undefined {
  if (!laenge || !breite || laenge <= 0 || breite <= 0) return undefined
  return rund2(laenge * breite)
}

/** Restnutzungsjahre, mit denen gerechnet wird: Eingabe, sonst Vorschlag aus dem Baujahr. */
export function rnEffektiv(b: Bauteil, spalte: 2 | 3 | 4 | 5, wertjahr: number, laubeRn?: number): number | undefined {
  let rn = b.rnManuell ? b.restnutzungsjahre : (schlageRestnutzungVor(spalte === 5 ? 4 : spalte, b.baujahr, wertjahr) ?? b.restnutzungsjahre)
  if (b.art === 'keller' && rn !== undefined && laubeRn !== undefined && !b.rnManuell) rn = Math.min(rn, laubeRn)
  return rn
}

export function rechneHaupt(
  b: Bauteil,
  flaeche: number,
  nichtBerechnet: number,
  indexFaktor: number,
  wertjahr: number,
  laubeRn: number | undefined,
): HauptErgebnis {
  const typ = typFuer(b)
  const e = nhkEintrag(typ)
  const spalte = e ? e.spalte : 5
  const nhk = e ? e.nhk : 0
  const maengel = mangelProzent(b)
  const rn = rnEffektiv(b, spalte, wertjahr, laubeRn)
  const nachMaengeln = rund2(nhk - (nhk * maengel) / 100) // H14
  const altersabzug = abzugRestnutzung(spalte, rn) // E15
  const nachAlter = rund2(nachMaengeln - (nachMaengeln * altersabzug) / 100) // H15
  const wertProM2 = rund2(nachAlter * indexFaktor) // H16
  const wert = rund2(flaeche * wertProM2) // E17
  return {
    bauteil: b,
    kuerzel: b.kuerzel,
    typ,
    bauklasse: e ? e.bauklasse : '',
    spalte,
    nhk,
    maengelProzent: maengel,
    nachMaengeln,
    restnutzungsjahre: rn,
    altersabzugProzent: altersabzug,
    nachAlter,
    indexFaktor,
    wertProM2,
    flaeche,
    nichtBerechnet,
    wert,
    abgeschrieben: spalte !== 5 && altersabzug >= 100,
  }
}

function rechneGewaechshaus(b: Bauteil, indexFaktor: number, wertjahr: number): GewaechshausErgebnis {
  const nhk = b.nhk ?? GEWAECHSHAUS.nhk // D41
  const maengel = mangelProzent(b)
  const nachMaengeln = rund2(nhk - (nhk * maengel) / 100) // I41 (Vorlage F41 als Bruch)
  const alter = alterInJahren(b.baujahr, wertjahr) // I40
  const minderung = b.minderungProJahr ?? 0 // G40
  const abzug = (alter ?? 0) * minderung // E42
  const abgeschrieben = abzug > 99
  const nachAlter = abgeschrieben ? 0 : rund2(nachMaengeln - (nachMaengeln * abzug) / 100) // C43
  const wertProM2 = rund2(nachAlter * indexFaktor) // I43
  const flaeche = flaecheVon(b)
  return {
    bauteil: b, nhk, maengelProzent: maengel, nachMaengeln, alter, minderungProJahr: minderung, altersabzugProzent: abzug,
    abgeschrieben, nachAlter, wertProM2, flaeche, wert: rund2(flaeche * wertProM2),
  }
}

/** Regelwert „integriert“ nach Bauklasse der Laube (Kommentar der Vorlage zu Baulichkeiten!E63). */
export function vorplatzIntegriertRegelwert(laube: HauptErgebnis | undefined): number {
  if (!laube || !laube.bauklasse) return VORPLATZ_HOECHST.integriert
  const k = laube.bauklasse.split('.')[0]
  if (k === 'I') return VORPLATZ_INTEGRIERT_REGEL.I
  if (k === 'IV') return VORPLATZ_INTEGRIERT_REGEL.IV
  return VORPLATZ_INTEGRIERT_REGEL['II/III']
}

export function vorplatzNhk(b: Bauteil, laube: HauptErgebnis | undefined): number {
  if (b.nhk !== undefined) return b.nhk
  if ((b.vorplatzLage ?? 'integriert') === 'integriert') return vorplatzIntegriertRegelwert(laube)
  const g = b.vorplatzGuete ?? 'ohne'
  return g === 'hochwertig' ? VORPLATZ_HOECHST.hochwertig : g === 'minderwertig' ? VORPLATZ_HOECHST.minderwertig : 0
}

function rechneVorplatz(b: Bauteil, flaeche: number, laube: HauptErgebnis | undefined, indexFaktor: number, wertjahr: number): VorplatzErgebnis {
  const lage = b.vorplatzLage ?? 'integriert'
  const nhk = vorplatzNhk(b, laube)
  const alter = alterInJahren(b.baujahr, wertjahr)
  const minderung = b.minderungProJahr ?? 0
  let wertProM2: number
  let maengel: number
  let altersabzug: number
  if (lage === 'integriert') {
    // E63 = NHK, G63 = Mängel der Laube (E14), I63; C64 = I63 (in der Vorlage fehlt der Bezug, der Export setzt ihn),
    // E64 = Altersabzug der Laube (E15), I64 → C70
    maengel = nhk > 0 ? (laube?.maengelProzent ?? 0) : 0
    const i63 = rund2(nhk - (nhk * maengel) / 100)
    altersabzug = i63 > 0 ? (laube?.altersabzugProzent ?? 0) : 0
    const i64 = rund2(i63 - (i63 * altersabzug) / 100)
    wertProM2 = rund2(i64 * indexFaktor)
  } else {
    // angebaut: E67 = Güte-Wert, G67 = Mängel (Bruch), G68 = Altersabzug %, I68; C70 = I68, bei 0 der Wert aus a) = 0
    maengel = mangelProzent(b)
    const i67 = rund2(nhk - (nhk * maengel) / 100)
    altersabzug = Math.min(100, (alter ?? 0) * minderung)
    const i68 = rund2(i67 - (i67 * altersabzug) / 100)
    wertProM2 = rund2(i68 * indexFaktor)
  }
  return { bauteil: b, lage, nhk, maengelProzent: maengel, altersabzugProzent: altersabzug, wertProM2, flaeche, wert: rund2(flaeche * wertProM2), alter, minderungProJahr: minderung }
}

// ---------------------------------------------------------------------------
// Abwasser
// ---------------------------------------------------------------------------

export function grubenGrundwert(typ: string | undefined): number {
  return GRUBEN_TYPEN.find((t) => t.id === typ)?.grundwert ?? 470
}

/**
 * Höchstalter für die Abschreibung: Tanks/monolithische Gruben 16 Jahre (S. 14); sonst ohne Grenze – der Abzug vom
 * Restwert (`grubeAltersabzug`) erreicht nie 100 %.
 */
export function grubeMaxAlter(typ: string | undefined): number {
  return typ === 'beton' || typ === 'tank' || typ === 'kunststoff' ? GRUBE_MAX_ALTER_TANK : Infinity
}

export function nachweisVorhanden(g: { dichtheitAm?: string; dichtheitFehlt?: boolean }): boolean {
  return Boolean(g.dichtheitAm) && !g.dichtheitFehlt
}

function rechneGrube(bau: BauDaten, wertjahr: number): GrubeErgebnis {
  const g = bau.abwasser.grube
  const alter = alterInJahren(g.baujahr, wertjahr)
  const wirksam = Math.min(alter ?? 0, grubeMaxAlter(g.typ)) // C74
  const abzug = grubeAltersabzug(wirksam) // C75
  const grundwert = g.grundwert ?? grubenGrundwert(g.typ) // F74
  const wertProM3 = rund2(grundwert - (grundwert * abzug) / 100) // F75
  const inhalt = g.zuBeseitigen ? 0 : (g.inhaltM3 ?? 0) // I75
  const fehlt = !nachweisVorhanden(g) // E76
  const wert = fehlt ? 0 : rund2(wertProM3 * inhalt) // K75
  const nichtGeleert = g.nichtGeleert && !g.zuBeseitigen && wert > 0 ? -Math.min(GRUBE_NICHT_GELEERT_ABZUG, wert) : 0 // K77
  return { alter, wirksamesAlter: wirksam, altersabzugProzent: abzug, grundwert, wertProM3, inhaltM3: inhalt, nachweisFehlt: fehlt, wert, nichtGeleertAbzug: nichtGeleert }
}

function rechneKanal(bau: BauDaten, wertjahr: number): KanalErgebnis {
  const k = bau.abwasser.kanal
  const alter = alterInJahren(k.baujahr, wertjahr)
  const wirksam = Math.min(alter ?? 0, 33) // G78 (höchstens 33 Jahre, sonst wäre der Abzug über 100 %)
  const kosten = k.kosten ?? 0 // C79
  const hoechstens = wirksam > 0 ? Math.min(KANAL_HOECHSTWERT, kosten) : 0 // E79
  const abzug = (wirksam / 100) * 3 // H79
  const wert = kosten > 74 ? rund2(hoechstens - hoechstens * abzug) : 0 // K79
  return { alter, kosten, hoechstens, abzug, wert }
}

/** Das wirksame Alter (Grube: Tanks höchstens 16 Jahre; Kanal höchstens 33), das der Export in C74 bzw. G78 schreibt. */
export function wirksamesAlterGrube(bau: BauDaten, wertjahr: number): number {
  return rechneGrube(bau, wertjahr).wirksamesAlter
}
export function wirksamesAlterKanal(bau: BauDaten, wertjahr: number): number {
  return Math.min(alterInJahren(bau.abwasser.kanal.baujahr, wertjahr) ?? 0, 33)
}

// ---------------------------------------------------------------------------
// Gesamt
// ---------------------------------------------------------------------------

/** Jahr der Wertermittlung: aus „Wertermittlung am“ in den Formalien, sonst das aktuelle Jahr. */
export function wertjahrVon(wep: Pick<Wep, 'formalien'>, heute: Date = new Date()): number {
  const m = /^(\d{4})-/.exec(wep.formalien.wertermittlungAm ?? '')
  return m ? Number(m[1]) : heute.getFullYear()
}

export interface BauOptionen {
  /** Index-Werte aus dem Profil (Jahr → Wert), überschreiben die Tabelle der App. */
  profilIndex?: Record<string, number>
  heute?: Date
}

/** Der Index, mit dem gerechnet wird: der am WEP gemerkte (wenn er zum Jahr passt oder von Hand gesetzt ist), sonst Profil/Tabelle. */
export function indexFuer(bau: BauDaten, wertjahr: number, profilIndex?: Record<string, number>): IndexErgebnis | null {
  const i = bau.index
  if (i && i.wert > 0 && (i.manuell || i.jahr === wertjahr)) {
    return { jahr: wertjahr, wert: i.wert, quelle: i.quelle, manuell: Boolean(i.manuell), ersatz: false }
  }
  return ermittleBaupreisindex(wertjahr, profilIndex)
}

/** Nicht berechnete Fläche und bewertete Fläche je Bauteil; Reihenfolge Laube, A1, A2, Ü1, Summe höchstens `zulaessig` m². */
export function verteileFlaeche(plaetze: Plaetze, zulaessig: number): Map<string, { bewertet: number; nichtBerechnet: number }> {
  const aus = new Map<string, { bewertet: number; nichtBerechnet: number }>()
  let rest = zulaessig
  const reihe = [plaetze.laube, ...plaetze.anbauten, plaetze.vorplatz].filter((b): b is Bauteil => Boolean(b))
  for (const b of reihe) {
    const f = flaecheVon(b)
    const bewertet = rund2(Math.min(f, Math.max(rest, 0)))
    aus.set(b.id, { bewertet, nichtBerechnet: rund2(f - bewertet) })
    rest = rund2(rest - bewertet)
  }
  return aus
}

export function berechneBau(wep: Pick<Wep, 'bau' | 'formalien'>, optionen: BauOptionen = {}): BauErgebnis | undefined {
  const bau = wep.bau
  if (!bau) return undefined
  const wertjahr = wertjahrVon(wep, optionen.heute)
  const index = indexFuer(bau, wertjahr, optionen.profilIndex)
  const indexFaktor = index ? index.wert / 100 : 0 // E16 = H7/100
  const plaetze = weisePlaetzeZu(bau.bauteile)
  const zulaessig = bau.zulaessigeFlaeche ?? ZULAESSIGE_FLAECHE_M2
  const fl = verteileFlaeche(plaetze, zulaessig)
  const get = (b: Bauteil | undefined) => (b ? (fl.get(b.id) ?? { bewertet: 0, nichtBerechnet: 0 }) : { bewertet: 0, nichtBerechnet: 0 })

  const laube = plaetze.laube ? rechneHaupt(plaetze.laube, get(plaetze.laube).bewertet, get(plaetze.laube).nichtBerechnet, indexFaktor, wertjahr, undefined) : undefined
  const laubeRn = laube?.restnutzungsjahre
  const anbauten = plaetze.anbauten.map((b) => rechneHaupt(b, get(b).bewertet, get(b).nichtBerechnet, indexFaktor, wertjahr, laubeRn))
  // Schuppen und Unterstände werden nicht bewertet, solange es eine Laube gibt; ist der Schuppen die einzige Anlage, ist er
  // in Wahrheit die Laube (nur falsch eingetragen) und wird bewertet. Keller zählen nicht dazu (eigene Regel).
  const schuppenZaehltNicht = Boolean(plaetze.laube && plaetze.schuppen?.art === 'schuppen')
  const schuppen = plaetze.schuppen
    ? {
        ...rechneHaupt(plaetze.schuppen, schuppenZaehltNicht ? 0 : flaecheVon(plaetze.schuppen), 0, indexFaktor, wertjahr, laubeRn),
        ...(schuppenZaehltNicht ? { nichtBewertetWegenLaube: true } : {}),
      }
    : undefined
  const gewaechshaus = plaetze.gewaechshaus ? rechneGewaechshaus(plaetze.gewaechshaus, indexFaktor, wertjahr) : undefined
  const vorplatz = plaetze.vorplatz ? rechneVorplatz(plaetze.vorplatz, get(plaetze.vorplatz).bewertet, laube, indexFaktor, wertjahr) : undefined
  const grube = bau.abwasser.art === 'grube' ? rechneGrube(bau, wertjahr) : undefined
  const kanal = bau.abwasser.art === 'kanal' ? rechneKanal(bau, wertjahr) : undefined

  // K53/K61 = K17 + K26 + K35 + K44 + K52; K81 = K61 + K71 + K75 + K77 + K79 (Vorlage korrigiert, siehe docs/ENTSCHEIDUNGEN.md)
  const summeBauteile =
    (laube?.wert ?? 0) + anbauten.reduce((s, a) => s + a.wert, 0) + (schuppen?.wert ?? 0) + (gewaechshaus?.wert ?? 0)
  const insgesamt = summeBauteile + (vorplatz?.wert ?? 0) + (grube?.wert ?? 0) + (grube?.nichtGeleertAbzug ?? 0) + (kanal?.wert ?? 0)
  const nichtBeraeumt = bau.nichtBeraeumt.aktiv ? (bau.nichtBeraeumt.m3 ?? 0) * (bau.nichtBeraeumt.preis ?? 0) : 0
  const beseitigung = bau.beseitigung.reduce((s, p) => s + p.menge * p.einzelpreis * p.faktor, 0)

  return {
    wertjahr,
    index,
    indexFaktor,
    laube,
    anbauten,
    schuppen,
    gewaechshaus,
    vorplatz,
    grube,
    kanal,
    ueberzaehlig: plaetze.ueberzaehlig,
    summeBauteile: rund2(summeBauteile),
    insgesamt: rund2(insgesamt),
    bewerteteFlaeche: (laube?.flaeche ?? 0) + anbauten.reduce((s, a) => s + a.flaeche, 0) + (schuppen?.flaeche ?? 0),
    nichtBerechneteFlaeche: (laube?.nichtBerechnet ?? 0) + anbauten.reduce((s, a) => s + a.nichtBerechnet, 0),
    nichtBeraeumtKosten: nichtBeraeumt,
    beseitigungSumme: rund2(beseitigung),
  }
}
