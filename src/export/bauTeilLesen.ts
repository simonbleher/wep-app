/**
 * Liest den Bau-Teil einer Bau-Excel (Blätter „Baulichkeiten“, „Mängelliste“ und „Beseitigungskosten“ Abschnitt 1) –
 * die Umkehrung von `exportBau.ts`: nur die Eingabezellen, keine Formelergebnisse.
 *
 * Bewusst nicht gelesen: Abwasser, Gewächshaus, Laubenvorplatz und Baupreisindex (Mischformen aus Text und Formeln,
 * die Zahlen stehen in der Excel selbst). Beispielwerte der leeren Vorlage (Typ „fehlt“, 5 m³ × 50 €, Fäkalien-Zeile)
 * gelten nicht als ausgefüllt.
 */
import JSZip from 'jszip'
import { GRUBEN_TYPEN, MANGEL_EIGEN, MAENGEL_GRUPPEN, TYP_FEHLT } from '../bau'
import type { Abwasser, BauteilArt } from '../model'
import { excelSerialToIso } from './cellMapper'
import { BAULICHKEITEN_BLATT, BESEITIGUNG_BAU_ZEILEN, BESEITIGUNG_BLATT, MAENGEL_BLATT } from './exportBau'
import { blattPfadNachName, datumAlsIso, leseBeschreibung, sharedStrings, zellenWert } from './bauExcelLesen'

export interface BauTeilBauteil {
  art: BauteilArt
  kuerzel: string
  typ: string
  baujahr?: number
  baujahrQuelle?: string
  restnutzungsjahre?: number
  flaeche: number
  /** Mängelabzug in % je Gruppe der Mängeltabelle (nur Laube) bzw. gesamt (`eigen`). */
  maengel: { gruppe: string; abzug: number }[]
  /** Gewächshaus und Vorplatz */
  /** Alter in Jahren laut Bau-Excel (Gewächshaus, Vorplatz): erst beim Übernehmen mit dem Wertjahr des WEP in ein Baujahr umgerechnet. */
  alter?: number
  minderungProJahr?: number
  nhk?: number
  vorplatzLage?: 'integriert' | 'angebaut'
  vorplatzGuete?: 'hochwertig' | 'minderwertig' | 'ohne'
}

export interface BauTeilBeseitigung {
  gegenstand: string
  menge: number
  einheit: string
  einzelpreis: number
  faktor: number
}

export interface BauTeil {
  bauteile: BauTeilBauteil[]
  beschreibung: string
  nichtBeraeumt?: { m3: number; preis: number }
  /** Abwasser (Grube oder Kanal), wenn die Bau-Excel es ausgefüllt hat. */
  abwasser?: Abwasser
  /** Alter der Grube in Jahren laut Bau-Excel (C74), erst beim Übernehmen in ein Baujahr umgerechnet. */
  grubeAlter?: number
  /** Baupreisindex der Bau-Excel (ohne den Beispielwert der Vorlage). */
  index?: { jahr: number; wert: number }
  beseitigung: BauTeilBeseitigung[]
}

export const leererBauTeil = (): BauTeil => ({ bauteile: [], beschreibung: '', beseitigung: [] })

interface Block {
  art: BauteilArt
  name: string
  typ: string
  baujahr: string
  quelle: string
  rn: string
  maengel: string
  flaeche: string
}
const BLOECKE: Block[] = [
  { art: 'laube', name: 'B12', typ: 'G12', baujahr: 'C13', quelle: 'D13', rn: 'I13', maengel: 'E14', flaeche: 'A17' },
  { art: 'anbau', name: 'B21', typ: 'G21', baujahr: 'C22', quelle: 'D22', rn: 'I22', maengel: 'E23', flaeche: 'A26' },
  { art: 'anbau', name: 'B30', typ: 'G30', baujahr: 'C31', quelle: 'D31', rn: 'I31', maengel: 'E32', flaeche: 'A35' },
  { art: 'schuppen', name: 'B47', typ: 'G47', baujahr: 'C48', quelle: 'D48', rn: 'I48', maengel: 'E49', flaeche: 'A52' },
]

const FAEKALIEN_VORLAGE = 'Einbehalt für Fäkalienabfuhr, wenn Grube bei der WE nicht geleert ist'

const zahl = (roh: string | null): number | undefined => {
  if (roh === null) return undefined
  const n = Number(roh.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}
const text = (roh: string | null) => roh?.replace(/\s+/g, ' ').trim() || undefined

export async function leseBauTeil(excel: ArrayBuffer | Uint8Array): Promise<BauTeil> {
  const zip = await JSZip.loadAsync(excel)
  const geteilt = await sharedStrings(zip)
  const blatt = async (name: string, standard: string) => zip.file(await blattPfadNachName(zip, name, standard))?.async('string')
  const [bl, mae, bes] = await Promise.all([
    blatt(BAULICHKEITEN_BLATT, 'xl/worksheets/sheet3.xml'),
    blatt(MAENGEL_BLATT, 'xl/worksheets/sheet4.xml'),
    blatt(BESEITIGUNG_BLATT, 'xl/worksheets/sheet17.xml'),
  ])
  const teil = leererBauTeil()
  if (bl) {
    for (const b of BLOECKE) {
      const typ = text(zellenWert(bl, b.typ, geteilt))
      if (!typ || typ === TYP_FEHLT) continue // Block nicht ausgefüllt
      const baujahr = zahl(zellenWert(bl, b.baujahr, geteilt))
      const rn = zahl(zellenWert(bl, b.rn, geteilt))
      const abzug = zahl(zellenWert(bl, b.maengel, geteilt))
      let maengel: { gruppe: string; abzug: number }[] = []
      if (b.art === 'laube' && mae) {
        maengel = MAENGEL_GRUPPEN.flatMap((g) => {
          const a = zahl(zellenWert(mae, g.zelle, geteilt))
          // „Nicht fertiggestellt“ (F44) steht in der Vorlage mit 0,05 vor – ein Beispielwert, kein Abzug
          if (g.id === 'unfertig' && a === 0.05) return []
          return a !== undefined && a !== 0 ? [{ gruppe: g.id, abzug: a }] : []
        })
      }
      // Maßgeblich ist der Gesamtabzug der Bau-Excel (E14 usw.): Ohne Aufschlüsselung (Anbau, Schuppen) oder wenn die
      // Gruppen der Mängelliste nicht zu ihm passen, bleibt nur dieser Wert – so rechnet das WEP wie die Bau-Excel
      const summe = maengel.reduce((s, m) => s + m.abzug, 0)
      if (abzug !== undefined && abzug > 0 && Math.abs(summe - abzug) > 0.005) maengel = [{ gruppe: MANGEL_EIGEN, abzug }]
      teil.bauteile.push({
        art: b.art,
        kuerzel: text(zellenWert(bl, b.name, geteilt)) ?? '',
        typ,
        // Tippfehler wie „18982“ nicht als Baujahr übernehmen
        ...(baujahr !== undefined && baujahr >= 1800 && baujahr <= 2100 ? { baujahr } : {}),
        ...(text(zellenWert(bl, b.quelle, geteilt)) ? { baujahrQuelle: text(zellenWert(bl, b.quelle, geteilt)) } : {}),
        // Leere Restnutzung heißt in der Bau-Excel 100 % Altersabzug: nicht von der App schätzen lassen
        restnutzungsjahre: rn !== undefined && rn >= 0 ? rn : 0,
        flaeche: Math.max(0, zahl(zellenWert(bl, b.flaeche, geteilt)) ?? 0),
        maengel,
      })
    }
    teil.beschreibung = leseBeschreibung(bl, geteilt)
    const wertjahr = /(\d{4})/.exec(zellenWert(bl, 'I7', geteilt) ?? '')?.[1]
    const jahr = wertjahr ? Number(wertjahr) : undefined
    const wert = zahl(zellenWert(bl, 'H7', geteilt))
    // 179,2 „für 2025“ steht in der Vorlage vor
    if (jahr && wert && wert > 0 && !(wert === 179.2 && jahr === 2025)) teil.index = { jahr, wert }
    const datum = (z: string) => {
      const roh = zellenWert(bl, z, geteilt)
      if (roh === null) return undefined
      const n = Number(roh)
      return (Number.isFinite(n) && n > 0 ? excelSerialToIso(n) : datumAlsIso(roh)) ?? undefined // Text wie „01.09.21982“ bleibt draußen
    }

    // Gewächshaus (2.1): ausgefüllt, wenn eine Fläche in F44 steht
    const ghFlaeche = zahl(zellenWert(bl, 'F44', geteilt))
    if (ghFlaeche && ghFlaeche > 0) {
      const mp = zahl(zellenWert(bl, 'F41', geteilt))
      const alter = zahl(zellenWert(bl, 'I40', geteilt))
      const minderung = zahl(zellenWert(bl, 'G40', geteilt))
      const nhk = zahl(zellenWert(bl, 'D41', geteilt))
      teil.bauteile.push({
        art: 'gewaechshaus',
        kuerzel: text(zellenWert(bl, 'D40', geteilt)) ?? '',
        typ: '',
        flaeche: ghFlaeche,
        ...(alter !== undefined && alter > 0 ? { alter } : {}),
        ...(minderung ? { minderungProJahr: minderung } : {}),
        ...(nhk ? { nhk } : {}),
        maengel: mp && mp > 0 ? [{ gruppe: MANGEL_EIGEN, abzug: Math.round(mp * 10000) / 100 }] : [],
      })
    }
    // Überdachter Laubenvorplatz (2.3): ausgefüllt, wenn eine Fläche in F71 steht
    const vpFlaeche = zahl(zellenWert(bl, 'F71', geteilt))
    if (vpFlaeche && vpFlaeche > 0) {
      const integriert = (zahl(zellenWert(bl, 'E63', geteilt)) ?? 0) > 0
      const guete = text(zellenWert(bl, 'B67', geteilt))
      const mp = zahl(zellenWert(bl, 'G67', geteilt))
      const minderung = zahl(zellenWert(bl, 'E66', geteilt))
      const alter = zahl(zellenWert(bl, 'H66', geteilt))
      teil.bauteile.push({
        art: 'vorplatz',
        kuerzel: text(zellenWert(bl, 'F62', geteilt)) ?? '',
        typ: '',
        flaeche: vpFlaeche,
        vorplatzLage: integriert ? 'integriert' : 'angebaut',
        ...(guete === 'hochwertig' || guete === 'minderwertig' || guete === 'ohne' ? { vorplatzGuete: guete } : {}),
        ...(!integriert && minderung ? { minderungProJahr: minderung } : {}),
        ...(!integriert && alter !== undefined && alter > 0 ? { alter } : {}),
        maengel: !integriert && mp && mp > 0 ? [{ gruppe: MANGEL_EIGEN, abzug: Math.round(mp * 10000) / 100 }] : [],
      })
    }

    // Abwasser (3): Kanal, wenn Baujahr oder Kosten stehen; Grube, wenn Inhalt, Alter oder Genehmigung stehen
    const grubeInhalt = zahl(zellenWert(bl, 'I75', geteilt))
    const grubeAlter = zahl(zellenWert(bl, 'C74', geteilt))
    const genehmigtAm = datum('F73')
    const genehmigungNr = text(zellenWert(bl, 'I73', geteilt))
    const kanalBaujahr = zahl(zellenWert(bl, 'E78', geteilt))
    const kanalKosten = zahl(zellenWert(bl, 'C79', geteilt))
    if (grubeInhalt || grubeAlter || genehmigtAm || genehmigungNr) {
      const grundwert = zahl(zellenWert(bl, 'F74', geteilt))
      const typ = GRUBEN_TYPEN.find((t) => t.grundwert === grundwert && grundwert !== 470)?.id
      const dicht = datum('D76')
      teil.abwasser = {
        art: 'grube',
        grube: {
          ...(genehmigtAm ? { genehmigtAm } : {}),
          ...(genehmigungNr ? { genehmigungNr } : {}),
          ...(typ ? { typ } : {}),
          ...(grundwert && grundwert > 0 ? { grundwert } : {}),
          ...(grubeInhalt ? { inhaltM3: grubeInhalt } : {}),
          ...(dicht ? { dichtheitAm: dicht } : {}),
          ...(text(zellenWert(bl, 'E76', geteilt)) === 'fehlt' ? { dichtheitFehlt: true } : {}),
          ...((zahl(zellenWert(bl, 'K77', geteilt)) ?? 0) !== 0 ? { nichtGeleert: true } : {}),
        },
        kanal: {},
      }
      if (grubeAlter !== undefined && grubeAlter > 0) teil.grubeAlter = grubeAlter
    } else if (kanalBaujahr || kanalKosten) {
      teil.abwasser = { art: 'kanal', grube: {}, kanal: { ...(kanalBaujahr ? { baujahr: kanalBaujahr } : {}), ...(kanalKosten ? { kosten: kanalKosten } : {}) } }
    }

    const m3 = zahl(zellenWert(bl, 'F104', geteilt))
    const preis = zahl(zellenWert(bl, 'G104', geteilt))
    // 5 m³ × 50 € sind die Beispielwerte der Vorlage
    if (m3 && m3 > 0 && preis !== undefined && !(m3 === 5 && preis === 50)) teil.nichtBeraeumt = { m3, preis }
  }
  if (bes) {
    for (const zeile of BESEITIGUNG_BAU_ZEILEN) {
      const gegenstand = text(zellenWert(bes, `B${zeile}`, geteilt))
      if (!gegenstand || gegenstand === FAEKALIEN_VORLAGE) continue
      const menge = zahl(zellenWert(bes, `F${zeile}`, geteilt))
      const faktor = zahl(zellenWert(bes, `J${zeile}`, geteilt))
      const preis = zahl(zellenWert(bes, `H${zeile}`, geteilt))
      teil.beseitigung.push({
        gegenstand,
        menge: menge !== undefined && menge > 0 ? menge : 1,
        einheit: text(zellenWert(bes, `G${zeile}`, geteilt)) ?? 'Stück',
        einzelpreis: preis !== undefined && preis > 0 ? preis : 0,
        faktor: faktor !== undefined && faktor > 0 ? faktor : 1,
      })
    }
  }
  return teil
}
