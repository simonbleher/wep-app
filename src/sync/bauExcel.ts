// Abgleich der Bau-Excel mit OneDrive (Beta 3, Paket 5). Läuft nach dem Abgleich der WEP-Dateien
// (engine.ts) und folgt denselben Regeln wie die Fotos (fotos.ts, Paket 4) und die WEP-Dateien (Paket 2).
//
// Ablage in OneDrive (je WEP genau eine Datei):
//   daten/bau/<Vorgangs-Nr>.xlsx               Bau-Excel eines aktiven WEP
//   daten/papierkorb/bau/<Vorgangs-Nr>.xlsx    Bau-Excel eines WEP im Papierkorb
//
// Regeln:
// - Das WEP liegt im Papierkorb → seine Bau-Excel wandert per Graph-Move mit nach daten/papierkorb/bau/;
//   Wiederherstellen holt sie zurück. Nie wird die Datei eines gelöschten WEP nach daten/bau/ hochgeladen;
//   eine noch nicht hochgeladene geht direkt in den Papierkorb-Ordner.
// - Endgültig gelöscht (Papierkorb abgelaufen, „Endgültig löschen“, anderswo gelöscht) → beide Dateien
//   werden entfernt. Eine Liste (`AufraeumListe`) merkt sich die Nummer, damit auch ein Abbruch zwischen
//   WEP-Abgleich und diesem Schritt nichts liegen lässt. Ist das WEP inzwischen wieder da, wird nichts gelöscht.
// - Entfernt der Nutzer die Bau-Excel (oder tauscht sie aus), wird nichts still verworfen: Das Entfernen
//   braucht eine Rückfrage in der Oberfläche; die Datei in OneDrive geht erst weg, wenn die WEP-Datei ohne
//   Verweis dort angekommen ist und kein Konflikt offen ist. Beim Austauschen überschreibt der Upload die
//   Datei in OneDrive.
// - Nichts wird aus OneDrive gelöscht, was nur „nicht mehr im WEP steht“, ohne dass jemand es entfernt hat.
// - Die Kennung (Hash) im WEP entscheidet, welche Fassung gemeint ist: Nur eine lokale Datei mit genau
//   dieser Kennung wird hochgeladen. Bei offenem Konflikt wird nichts hochgeladen oder gelöscht.
// - Hochgeladen wird nur, wenn `uploadErlaubt` das sagt („nur WLAN“, wie bei den Fotos).
// - Alle Schritte sind idempotent (ein Abbruch wird beim nächsten Abgleich geheilt).
import { bauExcelDateiName, XLSX_MIME, type BauExcelRecord, type BauExcelSpeicher } from '@/bauexcel/types'
import { PAPIERKORB_ORDNER } from './ordner'
import { wartetAufUpload } from './engine'
import type { AufraeumListe } from './fotos'
import type { GraphClient, LokalSpeicher, PapierkorbEintrag, SyncErgebnis, SyncHinweis } from './types'

export const BAU_ORDNER = 'daten/bau'
export const BAU_PAPIERKORB_ORDNER = `${PAPIERKORB_ORDNER}/bau`

/** Eine lokale Datei, die zu keinem WEP-Stand mehr gehört, wird erst nach dieser Zeit verworfen. */
const FREMDE_RECORDS_NACH_MS = 60 * 60 * 1000

export interface BauSyncOptionen {
  /** Ordner daten/bau */
  daten: GraphClient
  /** Ordner daten/papierkorb/bau */
  papierkorb: GraphClient
  lokal: LokalSpeicher
  bau: BauExcelSpeicher
  aufraeumen: AufraeumListe
  /** „Nur WLAN“: darf jetzt hochgeladen werden? */
  uploadErlaubt: () => Promise<boolean>
  /** Ergebnis des WEP-Abgleichs derselben Runde (endgültig gelöschte, umnummerierte WEPs). */
  wepErgebnis?: Pick<SyncErgebnis, 'bereinigt' | 'umnummeriert'>
  jetzt?: () => string
}

export interface BauSyncErgebnis {
  /** Hochgeladene Bau-Excel-Dateien (Vorgangs-Nr.). */
  hochgeladen: string[]
  /** In den Papierkorb bzw. zurück verschobene Dateien. */
  verschoben: number
  /** Aus OneDrive entfernte Dateien. */
  geloescht: number
  /** Dateien, die hochgeladen werden müssten, aber wegen „nur WLAN“ warten. */
  aufgeschoben: number
  fehler: SyncHinweis[]
}

/** Bau-Excel-Dateien, die noch nicht in OneDrive sind oder dort noch gelöscht werden müssen. */
export function offeneBauExcel(records: BauExcelRecord[], sichtbarWepIds: Set<string>): number {
  return records.filter(
    (r) => sichtbarWepIds.has(r.wepId) && ((r.hatDatei && !r.hochgeladen && !r.geloescht) || (r.geloescht && r.hochgeladen)),
  ).length
}

export async function synchronisiereBauExcel(opt: BauSyncOptionen): Promise<BauSyncErgebnis> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const erg: BauSyncErgebnis = { hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0, fehler: [] }
  const { bau } = opt

  // Umnummerierte WEPs: der Eintrag unter der alten Nummer ist überholt (die Kopie liegt vor)
  for (const { von } of opt.wepErgebnis?.umnummeriert ?? []) await bau.entferne(von)

  const offen = new Set(opt.aufraeumen.lade())
  for (const id of opt.wepErgebnis?.bereinigt ?? []) offen.add(id)

  const [weps, korb, metas, records] = await Promise.all([
    opt.lokal.alleWeps(),
    opt.lokal.alleImPapierkorb(),
    opt.lokal.alleMeta(),
    bau.alleRecords(),
  ])
  const aktiv = new Map(weps.map((w) => [w.id, w]))
  const imKorb = new Map(korb.map((e) => [e.id, e]))
  const meta = new Map(metas.map((m) => [m.id, m]))
  const record = new Map(records.map((r) => [r.wepId, r]))

  const ids = new Set<string>([
    ...weps.filter((w) => w.bauExcel).map((w) => w.id),
    ...korb.filter((e) => e.wep.bauExcel).map((e) => e.id),
    ...record.keys(),
    ...offen,
  ])

  let erlaubt: boolean | undefined
  const darfHochladen = async () => (erlaubt ??= await opt.uploadErlaubt())

  // Die beiden Ordner enthalten je WEP höchstens eine Datei: einmal auflisten genügt
  let inD: Set<string> | undefined
  let inP: Set<string> | undefined
  const liegtInD = async () => (inD ??= new Set((await opt.daten.liste()).map((x) => x.name)))
  const liegtInP = async () => (inP ??= new Set((await opt.papierkorb.liste()).map((x) => x.name)))

  const markiere = (r: BauExcelRecord | undefined, felder: Partial<BauExcelRecord>) =>
    r ? bau.setzeRecord({ ...r, ...felder }) : Promise.resolve()

  /** Löscht die Datei in beiden Ordnern (soweit vorhanden). */
  async function loescheInOneDrive(name: string): Promise<void> {
    if ((await liegtInD()).has(name)) {
      await opt.daten.loesche(name)
      ;(await liegtInD()).delete(name)
      erg.geloescht++
    }
    if ((await liegtInP()).has(name)) {
      await opt.papierkorb.loesche(name)
      ;(await liegtInP()).delete(name)
      erg.geloescht++
    }
  }

  async function syncAktiv(id: string): Promise<void> {
    const w = aktiv.get(id)!
    const m = meta.get(id)
    const r = record.get(id)
    const ref = w.bauExcel
    const name = bauExcelDateiName(id)
    // Auch die andere Fassung eines Konflikts kann auf eine Bau-Excel verweisen
    const verweise = new Set([ref?.version, m?.konflikt?.fassung?.bauExcel?.version].filter((v): v is string => !!v))
    const abgeglichen = !m?.konflikt && !wartetAufUpload(m)

    if (r?.geloescht) {
      if (verweise.size) {
        // Wieder (oder von einem anderen Gerät) eine Bau-Excel am WEP: die Datei in OneDrive bleibt
        await bau.entferne(id)
      } else if (abgeglichen) {
        await loescheInOneDrive(name)
        await bau.entferne(id)
      }
      return
    }

    if (!ref) {
      // Nirgends mehr im WEP und niemand hat sie hier entfernt (z. B. anderes Gerät): Speicher freigeben
      if (r && abgeglichen && !verweise.has(r.version) && Date.parse(jetzt()) - Date.parse(r.erstelltAm) >= FREMDE_RECORDS_NACH_MS) {
        await bau.entferne(id)
      }
      return
    }

    const passt = !!r && r.hatDatei && r.version === ref.version
    if (passt && !m?.konflikt) {
      const oben = (await liegtInD()).has(name)
      const imKorb = (await liegtInP()).has(name)
      if (!r.hochgeladen || (!oben && !imKorb)) {
        if (!(await darfHochladen())) {
          erg.aufgeschoben++
          return
        }
        const blob = await bau.ladeDatei(id)
        if (!blob) {
          await markiere(r, { hatDatei: false })
          return
        }
        await opt.daten.schreibe(name, blob, XLSX_MIME)
        ;(await liegtInD()).add(name)
        if (imKorb) {
          await opt.papierkorb.loesche(name) // die ältere Fassung aus dem Papierkorb ist überholt
          ;(await liegtInP()).delete(name)
        }
        await markiere(r, { hochgeladen: true })
        erg.hochgeladen.push(id)
        return
      }
      if (imKorb) {
        // Das WEP wurde wiederhergestellt: die Datei aus dem Papierkorb zurückholen
        await zurueckHolen(name)
      }
      return
    }

    if ((await liegtInP()).has(name)) await zurueckHolen(name) // wiederhergestelltes WEP

    // Stand dieses Geräts gehört zu keiner Fassung mehr: Speicher freigeben (nur bei abgeglichenem WEP)
    if (r && abgeglichen && !verweise.has(r.version) && Date.parse(jetzt()) - Date.parse(r.erstelltAm) >= FREMDE_RECORDS_NACH_MS) {
      await bau.entferne(id)
    }
  }

  async function zurueckHolen(name: string): Promise<void> {
    const res = await opt.papierkorb.verschiebe(name, BAU_ORDNER)
    if (res === 'vorhanden') await opt.papierkorb.loesche(name)
    ;(await liegtInP()).delete(name)
    ;(await liegtInD()).add(name)
    erg.verschoben++
  }

  async function syncKorb(id: string, t: PapierkorbEintrag): Promise<void> {
    const r = record.get(id)
    const ref = t.wep.bauExcel
    const name = bauExcelDateiName(id)

    // Was noch in daten/bau/ liegt, gehört zum gelöschten WEP und zieht mit um
    if ((await liegtInD()).has(name)) {
      const res = await opt.daten.verschiebe(name, BAU_PAPIERKORB_ORDNER)
      if (res === 'vorhanden') await opt.daten.loesche(name)
      ;(await liegtInD()).delete(name)
      ;(await liegtInP()).add(name)
      erg.verschoben++
    }

    if (r?.geloescht) {
      if (ref) await bau.entferne(id)
      else {
        await loescheInOneDrive(name)
        await bau.entferne(id)
      }
      return
    }
    if (!ref || !r || !r.hatDatei || r.version !== ref.version) return
    const oben = (await liegtInP()).has(name)
    if (r.hochgeladen && oben) return
    // Noch nie hochgeladen (oder verloren): gleich in den Papierkorb-Ordner, nie nach daten/bau/
    if (!(await darfHochladen())) {
      erg.aufgeschoben++
      return
    }
    const blob = await bau.ladeDatei(id)
    if (!blob) {
      await markiere(r, { hatDatei: false })
      return
    }
    await opt.papierkorb.schreibe(name, blob, XLSX_MIME)
    ;(await liegtInP()).add(name)
    await markiere(r, { hochgeladen: true })
    erg.hochgeladen.push(id)
  }

  async function raeumeAuf(id: string): Promise<void> {
    await loescheInOneDrive(bauExcelDateiName(id))
    await bau.entferne(id)
  }

  for (const id of [...ids].sort()) {
    try {
      if (aktiv.has(id)) {
        offen.delete(id)
        await syncAktiv(id)
      } else if (imKorb.has(id)) {
        offen.delete(id)
        await syncKorb(id, imKorb.get(id)!)
      } else if (offen.has(id)) {
        await raeumeAuf(id)
        offen.delete(id)
      }
    } catch (e) {
      erg.fehler.push({ wepId: id, text: `Bau-Excel: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  opt.aufraeumen.speichere([...offen])
  return erg
}
