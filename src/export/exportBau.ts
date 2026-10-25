/**
 * Export des Bau-Teils in die Blätter „Baulichkeiten“, „Mängelliste“ und „Beseitigungskosten“ (Abschnitt 1).
 *
 * Die App schreibt nur Eingabezellen. Die Formeln der Vorlage rechnen beim Öffnen (Excel und LibreOffice).
 * Ausnahme: offensichtliche Fehler in den Formeln der Vorlage werden im Export korrigiert (Liste
 * `VORLAGEN_KORREKTUREN`, siehe docs/ENTSCHEIDUNGEN.md) – `docs/WEP_Vorlage.xlsx` selbst bleibt unverändert.
 */
import JSZip from 'jszip'
import type { BauDaten, Bauteil, Wep } from '../model'
import {
  GRUBE_NICHT_GELEERT_ABZUG,
  MAENGEL_GRUPPEN,
  TYP_FEHLT,
  berechneBau,
  grubenGrundwert,
  mangelProzent,
  rnEffektiv,
  typFuer,
  umbrechen,
  weisePlaetzeZu,
  wirksamesAlterGrube,
  wirksamesAlterKanal,
  nhkEintrag,
  type BauOptionen,
} from '../bau'
import { isoDateToExcelSerial } from './cellMapper'
import { blattPfadNachName, leseBeschreibung, sharedStrings, zellenWert } from './bauExcelLesen'
import { mitZahlenformat, patchCells, patchFormel, type CellPatch } from './xmlPatcher'

export const BAULICHKEITEN_BLATT = 'Baulichkeiten'
export const MAENGEL_BLATT = 'Mängelliste'
export const BESEITIGUNG_BLATT = 'Beseitigungskosten'
export const TABELLE1_BLATT = 'Tabelle1'

/** Zeilen der Baubeschreibung im Blatt „Baulichkeiten“ (B83 bis B99). */
export const BESCHREIBUNG_ERSTE_ZEILE = 83
export const BESCHREIBUNG_ZEILEN = 17
/** Zeilen der Beseitigungskosten Abschnitt 1 (Zeile 13 gehört zu „Letzte Abfuhrbescheinigung vom“). */
export const BESEITIGUNG_BAU_ZEILEN = [12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const

export interface VorlagenKorrektur {
  blatt: string
  zelle: string
  vorher: string
  nachher: string
  grund: string
  /** Neues Zahlenformat der Zelle (eingebautes `numFmtId`, z. B. 2 = „0.00“), wenn die Korrektur Nachkommastellen bringt. */
  zahlenformat?: number
}

/** Fehler der Vorlage, die der Export korrigiert (jeweils nur, wenn die Zelle noch die erwartete Formel hat). */
export const VORLAGEN_KORREKTUREN: readonly (VorlagenKorrektur & { blattName: string })[] = [
  { blattName: BAULICHKEITEN_BLATT, blatt: 'Baulichkeiten', zelle: 'C33', vorher: '$H$23', nachher: '$H$32', grund: 'Anbau A2 rechnete mit dem Ergebnis von A1 (H23) statt mit dem eigenen nach Mängelabzug (H32).' },
  { blattName: BAULICHKEITEN_BLATT, blatt: 'Baulichkeiten', zelle: 'J52', vorher: '$B$21', nachher: '$B$47', grund: 'Die Beschriftung „Wert BT“ beim Schuppen zeigte das Kürzel von A1.' },
  { blattName: BAULICHKEITEN_BLATT, blatt: 'Baulichkeiten', zelle: 'K81', vorher: 'K52+K61+K71+K75+K77+K79', nachher: 'K61+K71+K75+K77+K79', grund: 'Der Schuppen (K52) steckt schon in der Zwischensumme K61 und wurde doppelt gezählt.' },
  { blattName: BAULICHKEITEN_BLATT, blatt: 'Baulichkeiten', zelle: 'C75', vorher: 'C74*3', nachher: '(1-0.97^C74)*100', zahlenformat: 2, grund: 'Altersabzug der Abwassergrube: jährlich 3 % vom Restwert, (1 − 0,97^Alter) × 100 statt Alter × 3 (16 Jahre: 38,57 % statt 48 %); mit 2 Nachkommastellen.' },
  { blattName: BAULICHKEITEN_BLATT, blatt: 'Baulichkeiten', zelle: 'H79', vorher: 'G78/100*3', nachher: '1-0.97^G78', zahlenformat: 10, grund: 'Altersabzug des Kanalanschlusses: jährlich 3 % vom Restwert, 1 − 0,97^Alter statt Alter × 3 %; mit 2 Nachkommastellen.' },
  { blattName: BAULICHKEITEN_BLATT, blatt: 'Baulichkeiten', zelle: 'C64', vorher: '', nachher: 'I63', grund: 'Beim integrierten Laubenvorplatz fehlte der Bezug auf den Wert nach Mängelabzug; der Wert ging verloren.' },
  { blattName: BESEITIGUNG_BLATT, blatt: 'Beseitigungskosten', zelle: 'K21', vorher: '', nachher: '<f t="shared" si="0"/>', grund: 'In Zeile 9 (Abschnitt 1) fehlte die Summenformel; die Zeile zählte nicht in die Summe.' },
]

export interface BauExportErgebnis {
  /** Korrigierte Formeln der Vorlage (leer, wenn nichts zu korrigieren war oder die Korrektur ausgeschaltet ist). */
  korrekturen: VorlagenKorrektur[]
  /** Bauteile, für die die Vorlage keinen Platz hat. */
  nichtExportiert: Bauteil[]
  /** Die Baubeschreibung war länger als das Feld; so viele Zeilen wurden weggelassen. */
  beschreibungGekuerzt: number
  /** Beseitigungspositionen, die nicht mehr in die Vorlage passten. */
  beseitigungGekuerzt: number
  /** Der verwendete Baupreisindex. */
  index: { jahr: number; wert: number; quelle: string } | null
}

export interface BauExportOptionen extends BauOptionen {
  /** Offensichtliche Fehler der Vorlagen-Formeln korrigieren (Standard: ja). */
  vorlagenfehlerKorrigieren?: boolean
}

const deutschesDatum = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}
const num = (v: number | undefined): number | null => (v === undefined || !Number.isFinite(v) ? null : v)
const pos = (v: number | undefined): number | null => (v !== undefined && Number.isFinite(v) && v !== 0 ? v : null)
const datum = (iso: string | undefined): number | null => {
  const s = iso ? isoDateToExcelSerial(iso) : 0
  return s > 0 ? s : null
}

// Zellen je Block „Laube-Rechenweg“ in Baulichkeiten
interface HauptZellen {
  name: string
  typ: string
  baujahr: string
  quelle: string
  rn: string
  maengel: string
  flaeche: string
  nicht?: string
}
const L: HauptZellen = { name: 'B12', typ: 'G12', baujahr: 'C13', quelle: 'D13', rn: 'I13', maengel: 'E14', flaeche: 'A17', nicht: 'I19' }
const A1: HauptZellen = { name: 'B21', typ: 'G21', baujahr: 'C22', quelle: 'D22', rn: 'I22', maengel: 'E23', flaeche: 'A26', nicht: 'I28' }
const A2: HauptZellen = { name: 'B30', typ: 'G30', baujahr: 'C31', quelle: 'D31', rn: 'I31', maengel: 'E32', flaeche: 'A35', nicht: 'I37' }
const S: HauptZellen = { name: 'B47', typ: 'G47', baujahr: 'C48', quelle: 'D48', rn: 'I48', maengel: 'E49', flaeche: 'A52' }

function leerHaupt(z: HauptZellen): CellPatch[] {
  return [
    { cell: z.typ, value: TYP_FEHLT },
    { cell: z.baujahr, value: null },
    { cell: z.quelle, value: null },
    { cell: z.rn, value: null },
    { cell: z.maengel, value: null },
    { cell: z.flaeche, value: null },
    ...(z.nicht ? [{ cell: z.nicht, value: null }] : []),
  ]
}

function hauptPatches(z: HauptZellen, b: Bauteil, wertjahr: number, flaeche: number, nichtBerechnet: number, laubeRn: number | undefined): CellPatch[] {
  const typ = typFuer(b)
  const spalte = nhkEintrag(typ)?.spalte ?? 5
  const rn = rnEffektiv(b, spalte, wertjahr, laubeRn)
  const p: CellPatch[] = [
    { cell: z.name, value: b.kuerzel },
    { cell: z.typ, value: typ },
    { cell: z.baujahr, value: num(b.baujahr) },
    { cell: z.quelle, value: b.baujahrQuelle?.trim() || null },
    { cell: z.rn, value: rn === undefined ? null : rn },
    { cell: z.maengel, value: pos(mangelProzent(b)) },
    { cell: z.flaeche, value: flaeche > 0 ? flaeche : null },
  ]
  if (z.nicht) p.push({ cell: z.nicht, value: pos(nichtBerechnet) })
  return p
}

/** Patches für das Blatt „Baulichkeiten“. */
export function baulichkeitenPatches(wep: Pick<Wep, 'bau' | 'formalien'>, optionen: BauOptionen = {}): { patches: CellPatch[]; ergebnis: ReturnType<typeof berechneBau>; gekuerzt: number } {
  const bau = wep.bau as BauDaten
  const erg = berechneBau(wep, optionen)!
  const plaetze = weisePlaetzeZu(bau.bauteile)
  const wj = erg.wertjahr
  const p: CellPatch[] = []

  // Baupreisindex (H7, I7 „für 2026“)
  if (erg.index) {
    p.push({ cell: 'H7', value: erg.index.wert })
    p.push({ cell: 'I7', value: `für ${wj}` })
  }

  const laubeRn = erg.laube?.restnutzungsjahre
  const hauptBlock = (z: HauptZellen, b: Bauteil | undefined, e: { flaeche: number; nichtBerechnet: number } | undefined) =>
    b && e ? hauptPatches(z, b, wj, e.flaeche, e.nichtBerechnet, z === L ? undefined : laubeRn) : leerHaupt(z)
  p.push(...hauptBlock(L, plaetze.laube, erg.laube))
  p.push(...hauptBlock(A1, plaetze.anbauten[0], erg.anbauten[0]))
  p.push(...hauptBlock(A2, plaetze.anbauten[1], erg.anbauten[1]))
  p.push(...hauptBlock(S, plaetze.schuppen, erg.schuppen))
  if (!plaetze.laube) p.push({ cell: 'B12', value: 'L' })
  if (!plaetze.anbauten[0]) p.push({ cell: 'B21', value: 'A1' })
  if (!plaetze.anbauten[1]) p.push({ cell: 'B30', value: 'A2' })
  if (!plaetze.schuppen) p.push({ cell: 'B47', value: 'S oder U' })
  // Nicht berechnete Bauflächen: auch ohne Block die Vorlagen-Beispielwerte (1, 2, 3 m²) leeren, siehe leerHaupt

  // Gewächshaus (2.1)
  const g = erg.gewaechshaus
  if (g) {
    p.push(
      { cell: 'D40', value: g.bauteil.kuerzel },
      { cell: 'G40', value: pos(g.minderungProJahr) },
      { cell: 'I40', value: num(g.alter) },
      { cell: 'D41', value: g.nhk },
      { cell: 'F41', value: g.maengelProzent / 100 },
      { cell: 'F44', value: g.flaeche > 0 ? g.flaeche : null },
    )
  } else {
    p.push({ cell: 'D40', value: 'GWH' }, { cell: 'G40', value: null }, { cell: 'I40', value: null }, { cell: 'D41', value: null }, { cell: 'F41', value: 0 }, { cell: 'F44', value: null })
  }

  // Überdachter Laubenvorplatz (2.3)
  const v = erg.vorplatz
  if (v) {
    const integriert = v.lage === 'integriert'
    p.push(
      { cell: 'F62', value: v.bauteil.kuerzel },
      { cell: 'E63', value: integriert ? v.nhk : 0 },
      { cell: 'E66', value: integriert ? null : pos(v.minderungProJahr) },
      { cell: 'H66', value: integriert ? 0 : (v.alter ?? 0) },
      { cell: 'B67', value: integriert ? 'ohne' : v.bauteil.vorplatzGuete ?? 'ohne' },
      { cell: 'G67', value: integriert ? 0 : v.maengelProzent / 100 },
      { cell: 'G68', value: integriert ? 100 : v.altersabzugProzent },
      { cell: 'F71', value: v.flaeche },
    )
  } else {
    p.push({ cell: 'F62', value: 'Ü1' }, { cell: 'E63', value: 0 }, { cell: 'E66', value: null }, { cell: 'H66', value: 0 }, { cell: 'B67', value: 'ohne' }, { cell: 'G67', value: 0 }, { cell: 'G68', value: 100 }, { cell: 'F71', value: 0 })
  }

  // Abwasser (3)
  const a = bau.abwasser
  const gr = a.grube
  const grubeAktiv = a.art === 'grube'
  const kanalAktiv = a.art === 'kanal'
  p.push(
    { cell: 'F73', value: grubeAktiv ? datum(gr.genehmigtAm) : null },
    { cell: 'I73', value: grubeAktiv ? gr.genehmigungNr?.trim() || null : null },
    { cell: 'C74', value: grubeAktiv ? wirksamesAlterGrube(bau, wj) : null },
    { cell: 'F74', value: grubeAktiv ? (gr.grundwert ?? grubenGrundwert(gr.typ)) : 470 },
    { cell: 'I75', value: grubeAktiv ? (gr.zuBeseitigen ? 0 : num(gr.inhaltM3)) : null },
    { cell: 'D76', value: grubeAktiv ? datum(gr.dichtheitAm) : null },
    { cell: 'E76', value: grubeAktiv && erg.grube?.nachweisFehlt ? 'fehlt' : null },
    { cell: 'K77', value: grubeAktiv && erg.grube && erg.grube.nichtGeleertAbzug !== 0 ? erg.grube.nichtGeleertAbzug : null },
    { cell: 'E78', value: kanalAktiv && a.kanal.baujahr ? String(a.kanal.baujahr) : null },
    { cell: 'G78', value: kanalAktiv ? wirksamesAlterKanal(bau, wj) : null },
    { cell: 'C79', value: kanalAktiv ? num(a.kanal.kosten) : null },
  )

  // Baubeschreibung
  const zeilen = umbrechen(bau.beschreibung ?? '')
  const gekuerzt = Math.max(0, zeilen.length - BESCHREIBUNG_ZEILEN)
  for (let i = 0; i < BESCHREIBUNG_ZEILEN; i++) {
    p.push({ cell: `B${BESCHREIBUNG_ERSTE_ZEILE + i}`, value: zeilen[i] ? zeilen[i] : null })
  }

  // 6. nicht beräumt, 7. nicht geleerte Grube (Beispielwerte der Vorlage 5 m³ × 50 € und 150 € ersetzen)
  const nb = bau.nichtBeraeumt
  p.push(
    { cell: 'F104', value: nb.aktiv ? num(nb.m3) : null },
    { cell: 'G104', value: nb.aktiv ? num(nb.preis) : null },
    { cell: 'H105', value: grubeAktiv && gr.nichtGeleert ? GRUBE_NICHT_GELEERT_ABZUG : null },
  )
  return { patches: p, ergebnis: erg, gekuerzt }
}

/** Patches für das Blatt „Mängelliste“: Abzug konkret je Gruppe (Laube), Gesamtabzug rechnet die Vorlage (F46). */
export function maengelPatches(wep: Pick<Wep, 'bau'>): CellPatch[] {
  const laube = wep.bau?.bauteile.find((b) => b.art === 'laube')
  const p: CellPatch[] = []
  for (const g of MAENGEL_GRUPPEN) {
    const summe = (laube?.maengel ?? []).filter((m) => m.gruppe === g.id).reduce((s, m) => s + m.abzug, 0)
    p.push({ cell: g.zelle, value: summe !== 0 ? summe : null })
  }
  // Eigene Mängel gehören keiner Gruppe der Tabelle an: sie stehen nur in der Baubeschreibung und im Mängelabzug E14
  return p
}

/** Patches für „Beseitigungskosten“ Abschnitt 1 (Bau). */
export function beseitigungBauPatches(bau: BauDaten): { patches: CellPatch[]; gekuerzt: number } {
  const p: CellPatch[] = []
  const liste = bau.beseitigung
  const zeilen = BESEITIGUNG_BAU_ZEILEN
  zeilen.forEach((row, i) => {
    const pos = liste[i]
    p.push(
      { cell: `B${row}`, value: pos ? pos.gegenstand : null },
      { cell: `F${row}`, value: pos ? pos.menge : null },
      { cell: `G${row}`, value: pos ? pos.einheit : null },
      { cell: `H${row}`, value: pos ? pos.einzelpreis : null },
      { cell: `J${row}`, value: pos ? pos.faktor : 1 },
    )
  })
  // Zeile 13 („Letzte Abfuhrbescheinigung vom“) gehört zur Fäkalienabfuhr in Zeile 12: nur dann behalten
  const abfuhr = /fäkalienabfuhr/i.test(liste[0]?.gegenstand ?? '')
  const bescheinigung = bau.abwasser.grube.abfuhrBescheinigungAm
  if (!abfuhr) p.push({ cell: 'B13', value: null })
  else if (bescheinigung) p.push({ cell: 'B13', value: `                   Letzte Abfuhrbescheinigung vom ${deutschesDatum(bescheinigung)}` })
  // Begründungen bei Faktor über 100 %: Textfeld F25 (wie F53 im Abschnitt 2), Beispieltext der Vorlage in A26 entfällt
  const begruendungen = liste.filter((x) => x.faktor > 1 && x.begruendung?.trim()).map((x) => `${x.gegenstand}: ${x.begruendung!.trim()}`)
  p.push({ cell: 'F25', value: begruendungen.length ? begruendungen.join(' · ') : null })
  p.push({ cell: 'A26', value: null })
  return { patches: p, gekuerzt: Math.max(0, liste.length - zeilen.length) }
}

/**
 * Schreibt den Bau-Teil in die Blätter der Vorlage bzw. Bau-Excel im ZIP. Die Formeln bleiben, nur Eingabezellen
 * werden gesetzt; mit `vorlagenfehlerKorrigieren` (Standard) kommen die Korrekturen aus `VORLAGEN_KORREKTUREN` dazu.
 */
export async function schreibeBau(zip: JSZip, wep: Wep, optionen: BauExportOptionen = {}): Promise<BauExportErgebnis> {
  const bau = wep.bau
  if (!bau) throw new Error('Kein Bau-Teil am WEP')
  const korrigieren = optionen.vorlagenfehlerKorrigieren !== false
  const korrekturen: VorlagenKorrektur[] = []

  const pfadB = await blattPfadNachName(zip, BAULICHKEITEN_BLATT, 'xl/worksheets/sheet3.xml')
  const pfadM = await blattPfadNachName(zip, MAENGEL_BLATT, 'xl/worksheets/sheet4.xml')
  const pfadK = await blattPfadNachName(zip, BESEITIGUNG_BLATT, 'xl/worksheets/sheet17.xml')

  const { patches, ergebnis, gekuerzt } = baulichkeitenPatches(wep, optionen)
  const lies = async (pfad: string) => {
    const f = zip.file(pfad)
    if (!f) throw new Error(`Blatt nicht gefunden: ${pfad}`)
    return f.async('string')
  }

  const xmlBasis = await lies(pfadB)
  // Die Baubeschreibung der Bau-Excel steht in mehreren Spalten (links B, rechts E/F). Hat der Nutzer sie nicht geändert,
  // bleiben diese Zeilen unangetastet – sonst gingen die rechten Teile verloren oder die Zeilen würden gekürzt.
  const gleichBeschreibung = norm(leseBeschreibung(xmlBasis, await sharedStrings(zip))) === norm(bau.beschreibung ?? '')
  let zuSchreiben = gleichBeschreibung ? patches.filter((p) => !beschreibungsZelle(p.cell)) : patches
  if (!gleichBeschreibung) {
    // Neuer Text: auch die rechten Teile der alten Zeilen (E, F … in Zeile 83–99) entfernen, sonst stehen sie neben dem neuen Text
    const geteilt = await sharedStrings(zip)
    const rest: CellPatch[] = []
    for (let zeile = BESCHREIBUNG_ERSTE_ZEILE; zeile < BESCHREIBUNG_ERSTE_ZEILE + BESCHREIBUNG_ZEILEN; zeile++) {
      for (const spalte of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
        if (zellenWert(xmlBasis, `${spalte}${zeile}`, geteilt) !== null) rest.push({ cell: `${spalte}${zeile}`, value: null })
      }
    }
    zuSchreiben = [...patches, ...rest]
  }
  let xmlB = patchCells(xmlBasis, zuSchreiben)
  let xmlM = patchCells(await lies(pfadM), maengelPatches(wep))
  const k = beseitigungBauPatches(bau)
  let xmlK = patchCells(await lies(pfadK), k.patches)

  if (korrigieren) {
    const stylesPfad = 'xl/styles.xml'
    let styles = await zip.file(stylesPfad)?.async('string')
    const wende = (blattName: string, xml: string): string => {
      let aus = xml
      for (const kor of VORLAGEN_KORREKTUREN.filter((x) => x.blattName === blattName)) {
        const neu = patchFormel(aus, kor.zelle, kor.nachher)
        if (neu === null) continue
        // nur korrigieren, wenn dort noch der Stand der Vorlage steht (eine schon korrigierte oder geänderte Zelle bleibt)
        const aktuell = formelInhalt(aus, kor.zelle)
        if (aktuell !== kor.vorher) continue
        aus = neu
        if (kor.zahlenformat !== undefined && styles) {
          const f = mitZahlenformat(styles, aus, kor.zelle, kor.zahlenformat)
          if (f) ({ styles, sheet: aus } = f)
        }
        korrekturen.push({ blatt: kor.blatt, zelle: kor.zelle, vorher: kor.vorher, nachher: kor.nachher, grund: kor.grund })
      }
      return aus
    }
    xmlB = wende(BAULICHKEITEN_BLATT, xmlB)
    xmlK = wende(BESEITIGUNG_BLATT, xmlK)
    if (styles) zip.file(stylesPfad, styles)
  }
  zip.file(pfadB, xmlB)
  zip.file(pfadM, xmlM)
  zip.file(pfadK, xmlK)

  return {
    korrekturen,
    nichtExportiert: ergebnis!.ueberzaehlig,
    beschreibungGekuerzt: gleichBeschreibung ? 0 : gekuerzt,
    beseitigungGekuerzt: k.gekuerzt,
    index: ergebnis!.index ? { jahr: ergebnis!.index.jahr, wert: ergebnis!.index.wert, quelle: ergebnis!.index.quelle } : null,
  }
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
const beschreibungsZelle = (zelle: string) => {
  const m = /^B(\d+)$/.exec(zelle)
  return !!m && Number(m[1]) >= BESCHREIBUNG_ERSTE_ZEILE && Number(m[1]) < BESCHREIBUNG_ERSTE_ZEILE + BESCHREIBUNG_ZEILEN
}

/** Formelinhalt einer Zelle als Text („$H$23“), `''` bei leerer Zelle ohne Formel, sonst der gemeinsame `<f>`-Text. */
function formelInhalt(xml: string, zelle: string): string {
  const m = new RegExp(`<c\\s[^>]*r="${zelle}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)
  if (!m || !m[1]) return ''
  const f = /<f\b[^>]*>([^<]*)<\/f>/.exec(m[1])
  if (f) return f[1]
  if (/<f\b[^>]*\/>/.test(m[1])) return '<f/>'
  return `Wert:${m[1]}`
}

