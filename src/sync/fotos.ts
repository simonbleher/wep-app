// Abgleich der Fotos mit OneDrive (Beta 3, Paket 4). Läuft nach dem Abgleich der WEP-Dateien
// (engine.ts) und richtet sich nach dem Zustand, den dieser hergestellt hat.
//
// Ablage in OneDrive:
//   daten/fotos/<Vorgangs-Nr>/<Foto-Id>.jpg              Fotos eines aktiven WEP
//   daten/papierkorb/fotos/<Vorgangs-Nr>/<Foto-Id>.jpg   Fotos eines WEP im Papierkorb
//
// Regeln (dieselben wie für die WEP-Dateien, Paket 2):
// - Das WEP liegt im Papierkorb → seine Fotos wandern per Graph-Move mit nach
//   daten/papierkorb/fotos/…; Wiederherstellen holt sie zurück. Nie wird ein Foto eines
//   gelöschten WEP nach daten/fotos/ hochgeladen; noch nicht hochgeladene Fotos gehen direkt
//   in den Papierkorb-Ordner.
// - Endgültig gelöscht (Papierkorb abgelaufen, „Endgültig löschen“, anderswo gelöscht) →
//   beide Ordner werden geleert. Das merkt sich eine Liste (`AufraeumListe`), damit auch ein
//   Abbruch zwischen WEP-Abgleich und Foto-Abgleich nichts liegen lässt. Ist das WEP inzwischen
//   wieder da (z. B. Konflikt „gelöscht und danach geändert“), wird nichts gelöscht.
// - Ein vom Nutzer gelöschtes Foto wird erst aus OneDrive entfernt, wenn die WEP-Datei ohne
//   dieses Foto dort angekommen ist und kein Konflikt offen ist. Nichts wird aus OneDrive
//   gelöscht, was nur „nicht mehr im WEP steht“, ohne dass jemand es gelöscht hat.
// - Hochgeladen wird nur, wenn `uploadErlaubt` das sagt („nur WLAN“); sonst bleiben die Fotos
//   offen und zählen in der Upload-Anzeige.
// - Alle Schritte sind idempotent (ein Abbruch wird beim nächsten Abgleich geheilt).
import { fotoDateiName, type FotoRecord } from '@/fotos/types'
import { PAPIERKORB_ORDNER } from './ordner'
import { wartetAufUpload } from './engine'
import type { GraphClient, LokalSpeicher, PapierkorbEintrag, SyncErgebnis, SyncHinweis } from './types'

export const FOTOS_ORDNER = 'daten/fotos'
export const FOTOS_PAPIERKORB_ORDNER = `${PAPIERKORB_ORDNER}/fotos`

/** Nicht abgeglichene Fotos ohne Verweis im WEP werden erst nach dieser Zeit lokal verworfen. */
const FREMDE_RECORDS_NACH_MS = 60 * 60 * 1000

/** Lokale Foto-Ablage (in der App IndexedDB). */
export interface FotoSpeicher {
  alleRecords(): Promise<FotoRecord[]>
  ladeDatei(wepId: string, fotoId: string): Promise<Blob | undefined>
  setzeRecord(r: FotoRecord): Promise<void>
  /** Entfernt Eintrag und Datei von diesem Gerät. */
  entferne(wepId: string, fotoId: string): Promise<void>
}

/** Nummern endgültig gelöschter WEPs, deren Fotos in OneDrive noch aufzuräumen sind. */
export interface AufraeumListe {
  lade(): string[]
  speichere(ids: string[]): void
}

export interface FotoSyncOptionen {
  /** Ordner daten/fotos/<wepId> */
  daten: (wepId: string) => GraphClient
  /** Ordner daten/papierkorb/fotos/<wepId> */
  papierkorb: (wepId: string) => GraphClient
  lokal: LokalSpeicher
  fotos: FotoSpeicher
  aufraeumen: AufraeumListe
  /** „Nur WLAN“: dürfen Fotos jetzt hochgeladen werden? */
  uploadErlaubt: () => Promise<boolean>
  /** Ergebnis des WEP-Abgleichs derselben Runde (endgültig gelöschte, umnummerierte WEPs). */
  wepErgebnis?: Pick<SyncErgebnis, 'bereinigt' | 'umnummeriert'>
  jetzt?: () => string
}

export interface FotoSyncErgebnis {
  /** Hochgeladene Fotos (`<Nr>/<Foto-Id>`). */
  hochgeladen: string[]
  /** In den Papierkorb bzw. zurück verschobene Dateien. */
  verschoben: number
  /** Aus OneDrive entfernte Dateien. */
  geloescht: number
  /** Fotos, die noch hochgeladen werden müssten, aber wegen „nur WLAN“ warten. */
  aufgeschoben: number
  fehler: SyncHinweis[]
}

/** Merkt die Nummern endgültig gelöschter WEPs vor dem Abgleich (die Marke verschwindet dabei). */
export async function merkeEndgueltigGeloeschte(lokal: LokalSpeicher, liste: AufraeumListe): Promise<void> {
  const ids = (await lokal.alleMeta()).filter((m) => m.endgueltig).map((m) => m.id)
  if (ids.length) liste.speichere([...new Set([...liste.lade(), ...ids])])
}

/** Fotos, die noch nicht in OneDrive sind oder dort noch gelöscht werden müssen. */
export function offeneFotos(records: FotoRecord[], sichtbarWepIds: Set<string>): number {
  return records.filter(
    (r) => sichtbarWepIds.has(r.wepId) && ((r.hatDatei && !r.hochgeladen && !r.geloescht) || (r.geloescht && r.hochgeladen)),
  ).length
}

export async function synchronisiereFotos(opt: FotoSyncOptionen): Promise<FotoSyncErgebnis> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const erg: FotoSyncErgebnis = { hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0, fehler: [] }
  const { fotos } = opt

  // Umnummerierte WEPs: die Einträge unter der alten Nummer sind überholt (Kopien liegen vor)
  for (const { von } of opt.wepErgebnis?.umnummeriert ?? []) {
    for (const r of await fotos.alleRecords()) if (r.wepId === von) await fotos.entferne(r.wepId, r.id)
  }

  const offen = new Set(opt.aufraeumen.lade())
  for (const id of opt.wepErgebnis?.bereinigt ?? []) offen.add(id)

  const [weps, korb, metas, records] = await Promise.all([
    opt.lokal.alleWeps(),
    opt.lokal.alleImPapierkorb(),
    opt.lokal.alleMeta(),
    fotos.alleRecords(),
  ])
  const aktiv = new Map(weps.map((w) => [w.id, w]))
  const imKorb = new Map(korb.map((e) => [e.id, e]))
  const meta = new Map(metas.map((m) => [m.id, m]))
  const proWep = new Map<string, FotoRecord[]>()
  for (const r of records) proWep.set(r.wepId, [...(proWep.get(r.wepId) ?? []), r])

  const ids = new Set<string>([
    ...weps.filter((w) => w.fotos?.length).map((w) => w.id),
    ...korb.filter((e) => e.wep.fotos?.length).map((e) => e.id),
    ...proWep.keys(),
    ...offen,
  ])

  let erlaubt: boolean | undefined
  const darfHochladen = async () => (erlaubt ??= await opt.uploadErlaubt())

  /** Datei mit Zuordnung zu den Listen der beiden Ordner. */
  async function ordnerStand(id: string) {
    const dc = opt.daten(id)
    const pc = opt.papierkorb(id)
    let d: Set<string> | undefined
    let p: Set<string> | undefined
    return {
      dc,
      pc,
      async inD() {
        return (d ??= new Set((await dc.liste()).map((x) => x.name)))
      },
      async inP() {
        return (p ??= new Set((await pc.liste()).map((x) => x.name)))
      },
    }
  }

  const markiere = (r: FotoRecord | undefined, felder: Partial<FotoRecord>) =>
    r ? fotos.setzeRecord({ ...r, ...felder }) : Promise.resolve()

  async function laden(wepId: string, fotoId: string): Promise<Blob | undefined> {
    return fotos.ladeDatei(wepId, fotoId)
  }

  /** Foto-Löschmarken ausführen, wenn die WEP-Datei in OneDrive schon ohne das Foto vorliegt. */
  async function loescheMarkierte(
    id: string,
    recs: FotoRecord[],
    stand: Awaited<ReturnType<typeof ordnerStand>>,
    verweise: Set<string>,
    bereit: boolean,
  ) {
    for (const r of recs.filter((x) => x.geloescht)) {
      if (verweise.has(r.id)) {
        await markiere(r, { geloescht: undefined }) // wieder im WEP (Konflikt: andere Fassung übernommen)
        continue
      }
      if (!bereit) continue // WEP-Datei noch nicht abgeglichen / Konflikt offen: abwarten
      const name = fotoDateiName(r.id)
      if ((await stand.inD()).has(name)) {
        await stand.dc.loesche(name)
        erg.geloescht++
      }
      if ((await stand.inP()).has(name)) {
        await stand.pc.loesche(name)
        erg.geloescht++
      }
      await fotos.entferne(id, r.id)
    }
  }

  async function syncAktiv(id: string): Promise<void> {
    const w = aktiv.get(id)!
    const m = meta.get(id)
    const recs = proWep.get(id) ?? []
    const mapRec = new Map(recs.map((r) => [r.id, r]))
    const refs = w.fotos ?? []
    if (!refs.length && !recs.length) return
    const stand = await ordnerStand(id)
    const imWepFassung = new Set(refs.map((f) => f.id))
    // Auch die andere Fassung eines Konflikts kann noch auf Fotos verweisen
    const verweise = new Set([...imWepFassung, ...(m?.konflikt?.fassung?.fotos ?? []).map((f) => f.id)])
    const abgeglichen = !m?.konflikt && !wartetAufUpload(m)

    for (const f of refs) {
      const name = fotoDateiName(f.id)
      const r = mapRec.get(f.id)
      if (r?.geloescht) continue // gerade erst gelöscht, steht aber noch im WEP: nichts hochladen
      if ((await stand.inD()).has(name)) {
        if (r && !r.hochgeladen) await markiere(r, { hochgeladen: true })
        continue
      }
      if ((await stand.inP()).has(name)) {
        // Das WEP wurde wiederhergestellt: Foto aus dem Papierkorb zurückholen
        const res = await stand.pc.verschiebe(name, `${FOTOS_ORDNER}/${id}`)
        if (res === 'vorhanden') await stand.pc.loesche(name)
        ;(await stand.inP()).delete(name)
        ;(await stand.inD()).add(name)
        erg.verschoben++
        if (r && !r.hochgeladen) await markiere(r, { hochgeladen: true })
        continue
      }
      if (!r?.hatDatei) continue // nur woanders vorhanden (oder verloren): beim Öffnen laden
      if (!(await darfHochladen())) {
        erg.aufgeschoben++
        continue
      }
      const blob = await laden(id, f.id)
      if (!blob) {
        await markiere(r, { hatDatei: false })
        continue
      }
      await stand.dc.schreibe(name, blob, 'image/jpeg')
      ;(await stand.inD()).add(name)
      await markiere(r, { hochgeladen: true })
      erg.hochgeladen.push(`${id}/${f.id}`)
    }

    await loescheMarkierte(id, recs, stand, verweise, abgeglichen)

    // Einträge, die nirgends mehr im WEP stehen und niemand gelöscht hat (z. B. weil ein anderes
    // Gerät das Foto entfernt hat), geben ihren Speicher frei – aber nur bei abgeglichenem WEP.
    if (abgeglichen) {
      for (const r of recs) {
        if (r.geloescht || verweise.has(r.id)) continue
        if (Date.parse(jetzt()) - Date.parse(r.erstelltAm) < FREMDE_RECORDS_NACH_MS) continue
        await fotos.entferne(id, r.id)
      }
    }
  }

  async function syncKorb(id: string, t: PapierkorbEintrag): Promise<void> {
    const recs = proWep.get(id) ?? []
    const refs = t.wep.fotos ?? []
    if (!refs.length && !recs.length) return
    const stand = await ordnerStand(id)
    const ziel = `${FOTOS_PAPIERKORB_ORDNER}/${id}`

    // Alles, was noch in daten/fotos/ liegt, gehört zum gelöschten WEP und zieht mit um
    for (const name of [...(await stand.inD())]) {
      const res = await stand.dc.verschiebe(name, ziel)
      if (res === 'vorhanden') await stand.dc.loesche(name)
      ;(await stand.inD()).delete(name)
      ;(await stand.inP()).add(name)
      erg.verschoben++
    }

    for (const f of refs) {
      const name = fotoDateiName(f.id)
      const r = recs.find((x) => x.id === f.id)
      if (!r?.hatDatei || r.geloescht || (await stand.inP()).has(name)) {
        if (r && !r.hochgeladen && (await stand.inP()).has(name)) await markiere(r, { hochgeladen: true })
        continue
      }
      // Noch nie hochgeladen: gleich in den Papierkorb-Ordner, nie nach daten/fotos/
      if (!(await darfHochladen())) {
        erg.aufgeschoben++
        continue
      }
      const blob = await laden(id, f.id)
      if (!blob) continue
      await stand.pc.schreibe(name, blob, 'image/jpeg')
      ;(await stand.inP()).add(name)
      await markiere(r, { hochgeladen: true })
      erg.hochgeladen.push(`${id}/${f.id}`)
    }
    await loescheMarkierte(id, recs, stand, new Set(), true)
  }

  async function raeumeAuf(id: string): Promise<void> {
    const stand = await ordnerStand(id)
    for (const name of await stand.inD()) {
      await stand.dc.loesche(name)
      erg.geloescht++
    }
    for (const name of await stand.inP()) {
      await stand.pc.loesche(name)
      erg.geloescht++
    }
    for (const r of proWep.get(id) ?? []) await fotos.entferne(id, r.id)
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
      erg.fehler.push({ wepId: id, text: `Fotos: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  opt.aufraeumen.speichere([...offen])
  return erg
}
