/**
 * Liest den Bau-Teil einer Bau-Excel (Blätter „Baulichkeiten“, „Mängelliste“ und „Beseitigungskosten“ Abschnitt 1) –
 * die Umkehrung von `exportBau.ts`: nur die Eingabezellen, keine Formelergebnisse.
 *
 * Bewusst nicht gelesen: Abwasser, Gewächshaus, Laubenvorplatz und Baupreisindex (Mischformen aus Text und Formeln,
 * die Zahlen stehen in der Excel selbst). Beispielwerte der leeren Vorlage (Typ „fehlt“, 5 m³ × 50 €, Fäkalien-Zeile)
 * gelten nicht als ausgefüllt.
 */
import JSZip from 'jszip'
import { MANGEL_EIGEN, MAENGEL_GRUPPEN, TYP_FEHLT } from '../bau'
import type { BauteilArt } from '../model'
import { BAULICHKEITEN_BLATT, BESEITIGUNG_BAU_ZEILEN, BESEITIGUNG_BLATT, BESCHREIBUNG_ERSTE_ZEILE, BESCHREIBUNG_ZEILEN, MAENGEL_BLATT } from './exportBau'
import { blattPfadNachName, sharedStrings, zellenWert } from './bauExcelLesen'

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
        ...(rn !== undefined && rn >= 0 ? { restnutzungsjahre: rn } : {}),
        flaeche: Math.max(0, zahl(zellenWert(bl, b.flaeche, geteilt)) ?? 0),
        maengel,
      })
    }
    const zeilen: string[] = []
    for (let i = 0; i < BESCHREIBUNG_ZEILEN; i++) zeilen.push(zellenWert(bl, `B${BESCHREIBUNG_ERSTE_ZEILE + i}`, geteilt)?.replace(/\s+$/, '') ?? '')
    teil.beschreibung = zeilen.join('\n').replace(/\n+$/, '')
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
