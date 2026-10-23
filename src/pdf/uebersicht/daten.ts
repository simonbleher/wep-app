/**
 * Was das übersichtliche PDF zeigt, gelesen aus der exportierten Arbeitsmappe (dieselbe Quelle und dasselbe
 * Rechenwerk wie das PDF „wie Vorlage“): jede Zahl ist der Wert einer Zelle der Excel-Datei, nichts wird neu
 * gerechnet. Die Zellen sind die der Vorlage (Blatt und Adresse stehen in den Funktionen).
 */
import { MAENGEL_GRUPPEN, mangelProzent } from '../../bau'
import type { Bauteil, BauteilArt, Rolle, Wep } from '../../model'
import type { Rechenwerk } from '../formeln'
import { zelleAdresse } from '../mappe'
import { datum, euro, prozent, zahl } from './format'

const BLATT = {
  formalien: 'Formalien',
  deck: 'Deckbl UPV',
  bau: 'Baulichkeiten',
  maengel: 'Mängelliste',
  aussen: 'Außenanlagen',
  aufwuchs1: 'Aufwuchs I',
  aufwuchs2: 'Aufwuchs II',
  beseitigung: 'Beseitigungskosten',
} as const

/** Lesezugriff auf ein Blatt: Zellen per Adresse („K17“). */
class Blatt {
  constructor(
    private readonly r: Rechenwerk,
    private readonly name: string,
  ) {}
  wert(adresse: string) {
    const { z, s } = zelleAdresse(adresse)
    return this.r.wert(this.name, z, s)
  }
  /** Zahl; fehlt oder kein Zahlenwert → `undefined`. */
  zahl(adresse: string): number | undefined {
    const v = this.wert(adresse)
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  /** Text (Zahlen als Text), ohne Leerraum an den Rändern; leer → `undefined`. */
  text(adresse: string): string | undefined {
    const v = this.wert(adresse)
    if (v === null || v === undefined || typeof v === 'object' || typeof v === 'boolean') return undefined
    const t = String(v).trim()
    return t ? t : undefined
  }
  /** Datum aus einer Seriennummer als „TT.MM.JJJJ“. */
  datum(adresse: string): string | undefined {
    const n = this.zahl(adresse)
    return n && n > 0 ? datum(n) : undefined
  }
}

export interface Posten {
  nr: number
  text: string
  anzahl?: number
  einheit?: string
  einzelpreis?: number
  faktor?: number
  summe: number
}

export interface Schritt {
  text: string
  angabe?: string
  /** Zwischenergebnis in €/m². */
  wert?: number
}

export interface BauteilRechnung {
  kuerzel: string
  titel: string
  /** Eine Zeile unter der Überschrift (Bauart, Baujahr, Restnutzung …). */
  kopf: string
  schritte: Schritt[]
  flaeche: number
  wertProM2?: number
  wert: number
  /** Nicht berechnete Baufläche in m² (zählt nicht zum Wert). */
  nichtBerechnet?: number
}

export interface AbwasserDaten {
  grube?: { genehmigtAm?: string; nr?: string; alter?: number; grundwert?: number; abzugProzent?: number; wertProM3?: number; menge?: number; wert: number; dichtheitAm?: string; nachweisFehlt: boolean; nichtGeleertAbzug?: number }
  kanal?: { baujahr?: string; alter?: number; kosten?: number; hoechstens?: number; abzug?: number; wert: number }
}

export interface Zeile {
  text: string
  betrag: number
  /** 'plus' = zählt hinzu, 'minus' = wird abgezogen, 'summe' = Zwischensumme, 'gesamt' = Endbetrag. */
  art: 'plus' | 'minus' | 'summe' | 'gesamt'
}

export interface MaengelZeile {
  gruppe: string
  maengel: string[]
  abzug: number
  hoechstens?: number
  begruendung?: string
}

export interface MaengelBauteil {
  titel: string
  zeilen: MaengelZeile[]
  gesamt: number
}

export interface Beseitigung {
  abschnitt: 'bau' | 'gruen'
  posten: Posten[]
  summe: number
  begruendung?: string
  hinweis?: string
}

export interface Protokoll {
  /** Kopfzeile jeder Seite. */
  kopf: { nr: string; anlage: string; parzelle: string }
  verband: { name: string; adresse?: string; titel: string }
  formalien: { label: string; wert: string }[]
  bewertung: Zeile[]
  /** Baupreisindex in % und das Jahr dazu („für 2026“). */
  index?: { wert: number; text?: string }
  bauteile: BauteilRechnung[]
  bauZusammenstellung: Zeile[]
  bauBeschreibung: string[]
  bebauteFlaeche?: number
  abwasser: AbwasserDaten
  maengel: MaengelBauteil[]
  aussenBeschreibung?: string
  aussenanlagen: Posten[]
  aussenSumme: number
  aufwuchsBeschreibung?: string
  aufwuchs: Posten[]
  aufwuchsSumme: number
  beseitigung: Beseitigung[]
  /** Bauabzüge, die nicht zur Beseitigung gehören (nicht beräumt, nicht geleerte Grube). */
  bauAbzuege: { text: string; rechnung?: string; betrag: number }[]
  /** Namen der Wertermittler für die Bestätigung. */
  wertermittler: { bau?: string; gruen?: string; datum?: string }
}

const faktor = (n: number | undefined): string => `Faktor ${n === undefined ? '' : zahl(n, 3)}`

const BAUTEIL_NAME: Record<BauteilArt, string> = {
  laube: 'Laube',
  anbau: 'Anbau',
  schuppen: 'Schuppen / Unterstand',
  gewaechshaus: 'Gewächshaus',
  vorplatz: 'Überdachter Laubenvorplatz',
  keller: 'Keller',
}

/** Positionen aus einem Positionsblatt (Spalten A Anzahl, B Einheit, C Bezeichnung, K Einzelpreis, L Gesamtpreis). */
function positionen(b: Blatt, von: number, bis: number, ersteNr: number): Posten[] {
  const liste: Posten[] = []
  for (let z = von; z <= bis; z++) {
    const text = b.text(`C${z}`)
    const summe = b.zahl(`L${z}`) ?? 0
    if (!text && summe === 0) continue
    liste.push({ nr: ersteNr + liste.length, text: text ?? '', anzahl: b.zahl(`A${z}`), einheit: b.text(`B${z}`), einzelpreis: b.zahl(`K${z}`), summe })
  }
  return liste
}

function beseitigungsPosten(b: Blatt, zeilen: readonly number[], ersteNr: number): Posten[] {
  const liste: Posten[] = []
  for (const z of zeilen) {
    const text = b.text(`B${z}`)
    const summe = b.zahl(`K${z}`) ?? 0
    if (!text || summe === 0 && b.zahl(`F${z}`) === undefined) continue
    liste.push({ nr: ersteNr + liste.length, text, anzahl: b.zahl(`F${z}`), einheit: b.text(`G${z}`), einzelpreis: b.zahl(`H${z}`), faktor: b.zahl(`J${z}`), summe })
  }
  return liste
}

/** Hauptblöcke der Baulichkeiten (Laube, Anbauten, Schuppen): Zeile des Kopfes in „Baulichkeiten“. */
const HAUPTBLOECKE = [
  { zeile: 12, name: 'Laube', nicht: 'I19' },
  { zeile: 21, name: 'Anbau', nicht: 'I28' },
  { zeile: 30, name: 'Anbau', nicht: 'I37' },
  { zeile: 47, name: 'Schuppen / Unterstand', nicht: undefined },
] as const

function hauptBlock(b: Blatt, r: number, name: string, nicht: string | undefined): BauteilRechnung | undefined {
  const flaeche = b.zahl(`A${r + 5}`) ?? 0
  const wert = b.zahl(`K${r + 5}`) ?? 0
  const baujahr = b.zahl(`C${r + 1}`)
  if (flaeche <= 0 && wert === 0 && !baujahr) return undefined
  const kuerzel = b.text(`B${r}`) ?? ''
  const typ = b.text(`G${r}`)
  const bauklasse = b.text(`F${r}`)
  const rn = b.zahl(`I${r + 1}`)
  const quelle = b.text(`D${r + 1}`)
  const mangel = b.zahl(`E${r + 2}`) ?? 0
  const alter = b.zahl(`E${r + 3}`) ?? 0
  const kopf = [typ, bauklasse && `Bauklasse ${bauklasse}`, baujahr && `Baujahr ${baujahr}${quelle ? ` (${quelle})` : ''}`, rn !== undefined && `Restnutzungsjahre ${zahl(rn)}`].filter(Boolean).join(' · ')
  return {
    kuerzel,
    titel: `${name} ${kuerzel}`.trim(),
    kopf,
    schritte: [
      { text: 'Normalherstellungskosten (NHK)', angabe: 'je m²', wert: b.zahl(`C${r + 2}`) },
      { text: 'abzüglich Mängelabzug', angabe: prozent(mangel), wert: b.zahl(`H${r + 2}`) },
      { text: 'abzüglich Altersabzug', angabe: prozent(alter), wert: b.zahl(`H${r + 3}`) },
      { text: 'mal Baupreisindex', angabe: faktor(b.zahl(`E${r + 4}`)), wert: b.zahl(`H${r + 4}`) },
    ],
    flaeche,
    wertProM2: b.zahl(`C${r + 5}`),
    wert,
    nichtBerechnet: nicht ? b.zahl(nicht) : undefined,
  }
}

/** 2.1 Gewächshaus. */
function gewaechshaus(b: Blatt): BauteilRechnung | undefined {
  const flaeche = b.zahl('F44') ?? 0
  const wert = b.zahl('K44') ?? 0
  if (flaeche <= 0 && wert === 0) return undefined
  const mangel = Math.round((b.zahl('F41') ?? 0) * 10000) / 100
  const kuerzel = b.text('D40') ?? 'GWH'
  return {
    kuerzel,
    titel: `Gewächshaus ${kuerzel}`,
    kopf: [`Altersminderung ${prozent(b.zahl('G40') ?? 0)} je Jahr`, b.zahl('I40') !== undefined && `Alter ca. ${zahl(b.zahl('I40')!)} Jahre`].filter(Boolean).join(' · '),
    schritte: [
      { text: 'Normalherstellungskosten (NHK)', angabe: 'je m²', wert: b.zahl('D41') },
      { text: 'abzüglich Mängelabzug', angabe: prozent(mangel), wert: b.zahl('I41') },
      { text: 'abzüglich Altersabzug', angabe: prozent(b.zahl('E42') ?? 0), wert: b.zahl('I42') },
      { text: 'mal Baupreisindex', angabe: faktor(b.zahl('E43')), wert: b.zahl('I43') },
    ],
    flaeche,
    wertProM2: b.zahl('H44'),
    wert,
  }
}

function vorplatz(b: Blatt): BauteilRechnung | undefined {
  const flaeche = b.zahl('F71') ?? 0
  const wert = b.zahl('K71') ?? 0
  if (flaeche <= 0 && wert === 0) return undefined
  const integriert = (b.zahl('E63') ?? 0) > 0
  const nhk = integriert ? b.zahl('E63') : b.zahl('D67')
  const mangel = ((integriert ? b.zahl('G63') : b.zahl('G67')) ?? 0) * 100
  const nachMangel = integriert ? b.zahl('I63') : b.zahl('I67')
  const alter = integriert ? b.zahl('E64') : b.zahl('G68')
  const nachAlter = integriert ? b.zahl('I64') : b.zahl('I68')
  const kuerzel = b.text('F62') ?? 'Ü1'
  return {
    kuerzel,
    titel: `Überdachter Laubenvorplatz ${kuerzel}`,
    kopf: integriert ? 'in die Laube integriert (Altersabzug wie Laube)' : [`angebaut`, b.text('B67') && `Güte ${b.text('B67')}`, b.zahl('H66') !== undefined && `Alter ca. ${zahl(b.zahl('H66')!)} Jahre`].filter(Boolean).join(' · '),
    schritte: [
      { text: 'Normalherstellungskosten (NHK)', angabe: 'je m²', wert: nhk },
      { text: 'abzüglich Mängelabzug', angabe: prozent(Math.round(mangel * 100) / 100), wert: nachMangel },
      { text: 'abzüglich Altersabzug', angabe: prozent(alter ?? 0), wert: nachAlter },
      { text: 'mal Baupreisindex', angabe: faktor(b.zahl('E70')), wert: b.zahl('I70') },
    ],
    flaeche,
    wertProM2: b.zahl('H71'),
    wert,
  }
}

function abwasser(b: Blatt): AbwasserDaten {
  const aus: AbwasserDaten = {}
  const grubeBelegt = ['F73', 'I73', 'C74', 'I75', 'D76', 'K77'].some((a) => b.wert(a) !== null && b.wert(a) !== '' && b.wert(a) !== undefined && b.wert(a) !== 0)
  if (grubeBelegt || (b.zahl('K75') ?? 0) !== 0) {
    aus.grube = {
      genehmigtAm: b.datum('F73'),
      nr: b.text('I73'),
      alter: b.zahl('C74'),
      grundwert: b.zahl('F74'),
      abzugProzent: b.zahl('C75'),
      wertProM3: b.zahl('F75'),
      menge: b.zahl('I75'),
      wert: b.zahl('K75') ?? 0,
      dichtheitAm: b.datum('D76'),
      nachweisFehlt: b.text('E76') === 'fehlt',
      nichtGeleertAbzug: b.zahl('K77'),
    }
  }
  if (b.text('E78') || (b.zahl('C79') ?? 0) > 0 || (b.zahl('K79') ?? 0) !== 0) {
    aus.kanal = { baujahr: b.text('E78'), alter: b.zahl('G78'), kosten: b.zahl('C79'), hoechstens: b.zahl('E79'), abzug: b.zahl('H79'), wert: b.zahl('K79') ?? 0 }
  }
  return aus
}

/** Mängel je Bauteil: aus dem WEP (mit Begründung), sonst aus der Mängelliste der Datei (nur Laube). */
function maengel(rw: Rechenwerk, wep: Wep): MaengelBauteil[] {
  const bau = wep.bau
  if (bau?.bauteile.some((t) => t.maengel.some((m) => m.abzug > 0 || m.maengel.length))) {
    return bau.bauteile
      .filter((t: Bauteil) => t.maengel.some((m) => m.abzug > 0 || m.maengel.length))
      .map((t) => ({
        titel: `${BAUTEIL_NAME[t.art]} ${t.kuerzel}`,
        gesamt: mangelProzent(t),
        zeilen: t.maengel
          .filter((m) => m.abzug > 0 || m.maengel.length)
          .map((m) => {
            const g = MAENGEL_GRUPPEN.find((x) => x.id === m.gruppe)
            return { gruppe: g?.name ?? 'Sonstige Mängel', maengel: m.maengel, abzug: m.abzug, hoechstens: g?.max, begruendung: m.begruendung.trim() || undefined }
          }),
      }))
  }
  const b = new Blatt(rw, BLATT.maengel)
  const zeilen: MaengelZeile[] = []
  for (const g of MAENGEL_GRUPPEN) {
    const abzug = b.zahl(g.zelle) ?? 0
    if (abzug === 0) continue
    zeilen.push({ gruppe: g.name, maengel: [], abzug, hoechstens: (b.zahl(g.zelle.replace('F', 'E')) ?? 0) * 100 || g.max })
  }
  const gesamt = b.zahl('F46') ?? 0
  return zeilen.length ? [{ titel: 'Laube', zeilen, gesamt }] : []
}

export function leseProtokoll(rw: Rechenwerk, wep: Wep, rolle: Rolle): Protokoll {
  const fo = new Blatt(rw, BLATT.formalien)
  const dk = new Blatt(rw, BLATT.deck)
  const bl = new Blatt(rw, BLATT.bau)
  const be = new Blatt(rw, BLATT.beseitigung)
  const hatBau = rolle !== 'gruen'
  const hatGruen = rolle !== 'bau'

  // Formalien (Quelle: Blatt „Formalien“, wie Deckblatt und Kopf aller Blätter)
  const f = (a: string) => fo.text(a)
  const parzelle = [f('E4'), f('E5')].filter(Boolean).join(' / ')
  const formalien: { label: string; wert: string }[] = []
  const zeile = (label: string, wert: string | undefined) => wert && formalien.push({ label, wert })
  zeile('Vorgangs-Nr.', f('E17'))
  zeile('Kleingartenanlage', f('E3'))
  zeile('Parzelle / Weg', parzelle || undefined)
  zeile('Parzellenfläche lt. Vertrag', fo.zahl('E16') ? `${String(fo.zahl('E16')).replace('.', ',')} m²` : undefined)
  zeile('Unterpächter', f('E6'))
  zeile('Auftraggeber', f('E7'))
  zeile('Vertreten durch', f('E8'))
  zeile('Wertermittlung am', fo.datum('E14'))
  zeile('Protokoll erstellt am', fo.datum('E15'))
  zeile('Anwesend für den Verein', f('E9'))
  zeile('Anwesend für den Unterpächter', f('E10'))
  zeile('Anwesend für den Auftraggeber', f('E11'))
  if (hatBau) zeile('Wertermittler Baulichkeiten', f('E12'))
  if (hatGruen) zeile('Wertermittler Außenanlagen und Aufwuchs', f('E13'))

  // Bewertung (Quelle: Deckblatt E21–E28)
  const d = (a: string) => dk.zahl(a) ?? 0
  // Zeilen des eigenen Teils immer, die des anderen nur mit Betrag (z. B. Grün-Export mit Bau-Excel), damit die Zeilen zum Gesamtbetrag passen
  const bewertung: Zeile[] = []
  const zeigen = (eigen: boolean, a: string) => eigen || d(a) !== 0
  const plus = (text: string, a: string, eigen: boolean) => zeigen(eigen, a) && bewertung.push({ text, betrag: d(a), art: 'plus' })
  const minus = (text: string, a: string, eigen: boolean) => zeigen(eigen, a) && bewertung.push({ text, betrag: d(a), art: 'minus' })
  plus('Baulichkeiten (einschließlich Abwasseranlage)', 'E21', hatBau)
  plus('Außenanlagen', 'E22', hatGruen)
  plus('Aufwuchs', 'E23', hatGruen)
  if (bewertung.length > 1) bewertung.push({ text: 'Zwischensumme', betrag: d('E24'), art: 'summe' })
  minus('Kosten nicht beräumter Baulichkeiten', 'E25', hatBau)
  minus('Beseitigungskosten Bau', 'E26', hatBau)
  minus('Beseitigungskosten Außenanlagen und Aufwuchs', 'E27', hatGruen)
  bewertung.push({ text: 'Gesamtbetrag mit Abzügen', betrag: d('E28'), art: 'gesamt' })

  // Baulichkeiten
  const bauteile: BauteilRechnung[] = []
  let bauZusammenstellung: Zeile[] = []
  let bauBeschreibung: string[] = []
  let abw: AbwasserDaten = {}
  const bauAbzuege: Protokoll['bauAbzuege'] = []
  if (hatBau) {
    // Reihenfolge der Vorlage: Laube, Anbauten, Gewächshaus (2.1), Schuppen (2.2); der Vorplatz (2.3) folgt nach der Zwischensumme
    const haupt = HAUPTBLOECKE.map((h) => hauptBlock(bl, h.zeile, h.name, h.nicht))
    for (const x of [...haupt.slice(0, 3), gewaechshaus(bl), haupt[3]]) if (x) bauteile.push(x)
    const vp = vorplatz(bl)
    abw = abwasser(bl)
    for (const x of bauteile) bauZusammenstellung.push({ text: `${x.titel}`, betrag: x.wert, art: 'plus' })
    bauZusammenstellung.push({ text: 'Zwischensumme Bauteile', betrag: bl.zahl('K53') ?? 0, art: 'summe' })
    if (vp) {
      bauteile.push(vp)
      bauZusammenstellung.push({ text: vp.titel, betrag: vp.wert, art: 'plus' })
    }
    if (abw.grube) bauZusammenstellung.push({ text: 'Abwassersammelgrube', betrag: abw.grube.wert, art: 'plus' })
    if (abw.grube?.nichtGeleertAbzug) bauZusammenstellung.push({ text: 'Abzug wegen nicht geleerter Abwassergrube', betrag: abw.grube.nichtGeleertAbzug, art: 'plus' })
    if (abw.kanal) bauZusammenstellung.push({ text: 'Abwasserkanal', betrag: abw.kanal.wert, art: 'plus' })
    bauZusammenstellung.push({ text: 'Baulichkeiten insgesamt', betrag: bl.zahl('K81') ?? 0, art: 'gesamt' })
    bauBeschreibung = []
    let absatz: string[] = []
    for (let z = 83; z <= 99; z++) {
      const t = bl.text(`B${z}`)
      if (t) absatz.push(t)
      else if (absatz.length) {
        bauBeschreibung.push(absatz.join(' '))
        absatz = []
      }
    }
    if (absatz.length) bauBeschreibung.push(absatz.join(' '))
    const nicht = bl.zahl('H104') ?? 0
    if (nicht !== 0 || bl.zahl('F104')) {
      bauAbzuege.push({ text: 'Abzug wegen nicht beräumter Baulichkeiten', rechnung: `${zahl(bl.zahl('F104') ?? 0)} m³ × ${euro(bl.zahl('G104') ?? 0)}`, betrag: nicht })
    }
    const grubeAbzug = bl.zahl('H105') ?? 0
    if (grubeAbzug !== 0) bauAbzuege.push({ text: 'Nicht geleerte Abwassersammelgrube', betrag: grubeAbzug })
  }

  // Bauteile mit Zusammenstellung: Bauteile (L, A1, A2, S, GWH) vor dem Vorplatz, wie in der Vorlage
  const maengelListe = hatBau ? maengel(rw, wep) : []

  // Außenanlagen und Aufwuchs
  const aa = new Blatt(rw, BLATT.aussen)
  const a1 = new Blatt(rw, BLATT.aufwuchs1)
  const a2 = new Blatt(rw, BLATT.aufwuchs2)
  let aussenanlagen: Posten[] = []
  let aufwuchs: Posten[] = []
  let aussenSumme = 0
  let aufwuchsSumme = 0
  let aussenBeschreibung: string | undefined
  let aufwuchsBeschreibung: string | undefined
  let nr = 1
  if (hatGruen) {
    aussenanlagen = positionen(aa, 15, 45, nr)
    nr += aussenanlagen.length
    aufwuchs = positionen(a1, 18, 45, nr)
    aufwuchs.push(...positionen(a2, 10, 45, nr + aufwuchs.length))
    aussenSumme = aa.zahl('L46') ?? 0
    aufwuchsSumme = dk.zahl('E23') ?? 0
    aussenBeschreibung = aa.text('A8')
    aufwuchsBeschreibung = a1.text('A8')
  }

  // Beseitigung
  const beseitigung: Beseitigung[] = []
  const bauBes = hatBau ? beseitigungsPosten(be, [12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], 1) : []
  if (hatBau && bauBes.length) {
    beseitigung.push({ abschnitt: 'bau', posten: bauBes, summe: be.zahl('K24') ?? 0, begruendung: be.text('F25'), hinweis: be.text('B13')?.startsWith('Letzte') ? be.text('B13') : undefined })
  }
  const gruenStart = 1 + aussenanlagen.length + aufwuchs.length
  const gruenBes = hatGruen ? beseitigungsPosten(be, [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44], gruenStart) : []
  if (hatGruen && gruenBes.length) beseitigung.push({ abschnitt: 'gruen', posten: gruenBes, summe: be.zahl('K45') ?? 0, begruendung: be.text('F53') })

  return {
    kopf: { nr: f('E17') ?? '', anlage: f('E3') ?? '', parzelle: f('E4') ?? '' },
    verband: { name: dk.text('A1') ?? 'Bezirksverband der Gartenfreunde Pankow e.V.', adresse: dk.text('A2'), titel: dk.text('A4') ?? 'Wertermittlung bei Unterpächterwechsel' },
    formalien,
    bewertung,
    index: hatBau && bl.zahl('H7') ? { wert: bl.zahl('H7')!, text: bl.text('I7') } : undefined,
    bauteile,
    bauZusammenstellung,
    bauBeschreibung,
    bebauteFlaeche: hatBau ? bl.zahl('F101') : undefined,
    abwasser: abw,
    maengel: maengelListe,
    aussenBeschreibung,
    aussenanlagen,
    aussenSumme,
    aufwuchsBeschreibung,
    aufwuchs,
    aufwuchsSumme,
    beseitigung,
    bauAbzuege,
    wertermittler: { bau: hatBau ? f('E12') : undefined, gruen: hatGruen ? f('E13') : undefined, datum: fo.datum('E15') },
  }
}
