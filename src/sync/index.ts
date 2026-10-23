// Öffentliche Schnittstelle des Sync-Moduls für die App.
// Die Anmeldung kommt aus src/konto; hier wird nur noch das Token benutzt.
import { aktuellesKonto, kontoVerfuegbar, zugriffstoken } from '@/konto'
import { lokaleEigene } from '@/katalog'
import { lokalesProfil } from '@/profil'
import { fotoUploadErlaubt } from '@/fotos/netz'
import { kopiereBauExcelLokal, kopiereFotosLokal } from '@/app/db'
import { synchronisiere, wartetAufUpload } from './engine'
import { synchronisiereEigenePositionen } from './eigenePositionen'
import {
  exportHochladen,
  exportOrdnerHochladen,
  leereExportWarteschlange,
  type ExportDatei,
  type ExportStatus,
} from './exporte'
import {
  FOTOS_ORDNER,
  FOTOS_PAPIERKORB_ORDNER,
  merkeEndgueltigGeloeschte,
  offeneFotos,
  synchronisiereFotos,
  type FotoSyncErgebnis,
} from './fotos'
import {
  BAU_ORDNER,
  BAU_PAPIERKORB_ORDNER,
  offeneBauExcel,
  synchronisiereBauExcel,
  type BauSyncErgebnis,
} from './bauExcel'
import { erstelleGraphClient, GraphFehler } from './graph'
import { geraeteKennung } from './geraet'
import { DATEN_ORDNER, EXPORTE_ORDNER, PAPIERKORB_ORDNER, richteOrdnerEin } from './ordner'
import { raeumePapierkorbAuf } from './aktionen'
import { metaMit } from './papierkorb'
import { synchronisiereProfil } from './profil'
import { bauAufraeumListe, bauSpeicher, exportSpeicher, fotoAufraeumListe, fotoSpeicher, syncSpeicher } from './speicher'
import type { SyncErgebnis, SyncHinweis } from './types'

export type { SyncErgebnis, SyncHinweis } from './types'
export type { ExportStatus } from './exporte'

/** Haken für die Android-App: vor/nach jedem Abgleich (Upload-Warteschlange abstimmen). */
export interface SyncHaken {
  vor?(): Promise<void>
  nach?(): Promise<void>
}
let syncHaken: SyncHaken | undefined
export function setzeSyncHaken(h: SyncHaken | undefined): void {
  syncHaken = h
}

export { geraeteKennung }

const ORDNER_KEY = 'wep-ordner-eingerichtet'

/**
 * Anzahl der Änderungen, die noch auf den Abgleich warten: WEPs und Exporte zum Hochladen,
 * Löschungen (Papierkorb), die noch nicht in OneDrive sind, und endgültig Gelöschtes.
 */
export async function wartendeAenderungen(): Promise<number> {
  const [weps, korb, metas, exporte, fotos, bauExcel] = await Promise.all([
    syncSpeicher.alleWeps(),
    syncSpeicher.alleImPapierkorb(),
    syncSpeicher.alleMeta(),
    exportSpeicher.alle(),
    fotoSpeicher.alleRecords(),
    bauSpeicher.alleRecords(),
  ])
  const meta = new Map(metas.map((m) => [m.id, m]))
  return (
    weps.filter((w) => wartetAufUpload(meta.get(w.id))).length +
    korb.filter((e) => !meta.get(e.id)?.papierkorbETag).length +
    metas.filter((m) => m.endgueltig).length +
    exporte.length +
    offeneFotos(fotos, new Set([...weps.map((w) => w.id), ...korb.map((e) => e.id)])) +
    offeneBauExcel(bauExcel, new Set([...weps.map((w) => w.id), ...korb.map((e) => e.id)])) +
    (lokaleEigene.lade().wartet ? 1 : 0)
  )
}

/** Fotos, die noch nicht in OneDrive sind (für die Upload-Anzeige). */
export async function offeneFotoAnzahl(): Promise<number> {
  const [weps, korb, fotos] = await Promise.all([
    syncSpeicher.alleWeps(),
    syncSpeicher.alleImPapierkorb(),
    fotoSpeicher.alleRecords(),
  ])
  return offeneFotos(fotos, new Set([...weps.map((w) => w.id), ...korb.map((e) => e.id)]))
}

/** Hat der Abgleich Daten auf diesem Gerät verändert (die Liste muss neu geladen werden)? */
export function lokalVeraendert(e: SyncErgebnis): boolean {
  return (
    e.heruntergeladen.length + e.geloescht.length + e.wiederhergestellt.length + e.bereinigt.length + e.konflikte.length > 0
  )
}

export interface GesamtErgebnis extends SyncErgebnis {
  exporte: string[]
  profilGeaendert: boolean
  eigenePositionenGeaendert: boolean
  fotos: FotoSyncErgebnis
  bauExcel: BauSyncErgebnis
}

/** Führt einen vollständigen Abgleich mit OneDrive aus. */
export async function jetztSynchronisieren(): Promise<GesamtErgebnis> {
  if (!navigator.onLine) throw new Error('Keine Internetverbindung – Änderungen warten.')
  await syncHaken?.vor?.().catch((e) => console.warn('Vor dem Abgleich:', e))
  try {
    return await abgleichen()
  } finally {
    await syncHaken?.nach?.().catch((e) => console.warn('Nach dem Abgleich:', e))
  }
}

async function abgleichen(): Promise<GesamtErgebnis> {
  const geraet = geraeteKennung()
  const wurzel = erstelleGraphClient(zugriffstoken)
  const daten = erstelleGraphClient(zugriffstoken, undefined, DATEN_ORDNER)
  const papierkorb = erstelleGraphClient(zugriffstoken, undefined, PAPIERKORB_ORDNER)
  const exporte = erstelleGraphClient(zugriffstoken, undefined, EXPORTE_ORDNER)
  const fotoOrdner = (wepId: string) => erstelleGraphClient(zugriffstoken, undefined, `${FOTOS_ORDNER}/${wepId}`)
  const bauOrdner = erstelleGraphClient(zugriffstoken, undefined, BAU_ORDNER)
  const bauKorb = erstelleGraphClient(zugriffstoken, undefined, BAU_PAPIERKORB_ORDNER)
  const fotoKorb = (wepId: string) => erstelleGraphClient(zugriffstoken, undefined, `${FOTOS_PAPIERKORB_ORDNER}/${wepId}`)

  // Ordnerstruktur zuerst: schlägt das fehl, gleichen wir lieber gar nicht ab, statt
  // WEPs neben die noch nicht verschobenen alten Dateien zu legen.
  let eingerichtet = false
  try {
    eingerichtet = localStorage.getItem(ORDNER_KEY) === 'ja'
  } catch {
    /* ohne Speicher läuft die (idempotente) Einrichtung eben jedes Mal */
  }
  if (!eingerichtet) {
    await richteOrdnerEin(wurzel)
    try {
      localStorage.setItem(ORDNER_KEY, 'ja')
    } catch {
      /* siehe oben */
    }
  }

  // Abgelaufenes (30 Tage) zuerst, damit es nicht noch hochgeladen wird
  await raeumePapierkorbAuf()
  // Die Marke „endgültig gelöscht“ verschwindet im Abgleich: Nummern für die Fotos vormerken
  await merkeEndgueltigGeloeschte(syncSpeicher, fotoAufraeumListe)
  await merkeEndgueltigGeloeschte(syncSpeicher, bauAufraeumListe)
  const ergebnis = await synchronisiere({
    client: daten,
    papierkorb,
    lokal: syncSpeicher,
    geraet,
    vorUmnummerieren: async (von, nach) => {
      await kopiereFotosLokal(von, nach)
      await kopiereBauExcelLokal(von, nach)
    },
  })
  const gesamt: GesamtErgebnis = {
    ...ergebnis,
    exporte: [],
    profilGeaendert: false,
    eigenePositionenGeaendert: false,
    fotos: { hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0, fehler: [] },
    bauExcel: { hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0, fehler: [] },
  }

  const fehler = (wepId: string, e: unknown): SyncHinweis => ({
    wepId,
    text: e instanceof Error ? e.message : String(e),
  })
  try {
    const p = await synchronisiereProfil({ client: daten, speicher: lokalesProfil, geraet })
    gesamt.profilGeaendert = p === 'geladen'
  } catch (e) {
    gesamt.fehler.push(fehler('Profil', e))
  }
  try {
    const e = await synchronisiereEigenePositionen({ client: daten, geraet })
    gesamt.eigenePositionenGeaendert = e === 'geladen' || e === 'beides'
  } catch (e) {
    gesamt.fehler.push(fehler('Eigene Positionen', e))
  }
  try {
    gesamt.fotos = await synchronisiereFotos({
      daten: fotoOrdner,
      papierkorb: fotoKorb,
      lokal: syncSpeicher,
      fotos: fotoSpeicher,
      aufraeumen: fotoAufraeumListe,
      uploadErlaubt: fotoUploadErlaubt,
      wepErgebnis: ergebnis,
    })
    gesamt.fehler.push(...gesamt.fotos.fehler)
  } catch (e) {
    gesamt.fehler.push(fehler('Fotos', e))
  }
  try {
    gesamt.bauExcel = await synchronisiereBauExcel({
      daten: bauOrdner,
      papierkorb: bauKorb,
      lokal: syncSpeicher,
      bau: bauSpeicher,
      aufraeumen: bauAufraeumListe,
      uploadErlaubt: fotoUploadErlaubt,
      wepErgebnis: ergebnis,
    })
    gesamt.fehler.push(...gesamt.bauExcel.fehler)
  } catch (e) {
    gesamt.fehler.push(fehler('Bau-Excel', e))
  }
  const q = await leereExportWarteschlange(exporte, exportSpeicher, (ordner) =>
    erstelleGraphClient(zugriffstoken, undefined, `${EXPORTE_ORDNER}/${ordner}`),
  )
  gesamt.exporte = q.hochgeladen
  gesamt.fehler.push(...q.fehler)
  return gesamt
}

/**
 * Legt eine fertige Excel- oder PDF-Datei (`typ`) in OneDrive (Exporte/) ab, wenn angemeldet und online;
 * sonst kommt sie in die Warteschlange. Ohne Konto passiert nichts ('ohne-konto').
 */
export async function exportNachOneDrive(
  name: string,
  blob: Blob,
  typ?: string,
): Promise<ExportStatus | 'ohne-konto'> {
  if (!kontoVerfuegbar() || !(await aktuellesKonto())) return 'ohne-konto'
  return exportHochladen({
    client: navigator.onLine ? erstelleGraphClient(zugriffstoken, undefined, EXPORTE_ORDNER) : null,
    speicher: exportSpeicher,
    name,
    blob,
    typ,
  })
}

/**
 * Legt die Fotos eines Exports in OneDrive (Exporte/<ordner>/) ab, wenn angemeldet und online; sonst
 * kommen sie in die Warteschlange. Ohne Konto passiert nichts ('ohne-konto').
 */
export async function exportFotosNachOneDrive(
  ordner: string,
  dateien: ExportDatei[],
): Promise<{ status: ExportStatus; wartend: number } | 'ohne-konto'> {
  if (!kontoVerfuegbar() || !(await aktuellesKonto())) return 'ohne-konto'
  const online = navigator.onLine
  return exportOrdnerHochladen({
    client: online ? erstelleGraphClient(zugriffstoken, undefined, EXPORTE_ORDNER) : null,
    ordnerClient: online ? (o) => erstelleGraphClient(zugriffstoken, undefined, `${EXPORTE_ORDNER}/${o}`) : null,
    speicher: exportSpeicher,
    ordner,
    dateien,
  })
}

export type FotoNetz = 'ok' | 'kein-konto' | 'offline' | 'nur-wlan'

/** Ist OneDrive für die Fotos gerade erreichbar (angemeldet, online, „nur WLAN“ eingehalten)? */
export async function fotoNetzStatus(): Promise<FotoNetz> {
  if (!kontoVerfuegbar() || !(await aktuellesKonto())) return 'kein-konto'
  if (!navigator.onLine) return 'offline'
  return (await fotoUploadErlaubt()) ? 'ok' : 'nur-wlan'
}

/** Holt eine Bilddatei aus OneDrive: erst aus daten/fotos/, sonst aus dem Papierkorb-Ordner. */
export async function ladeFotoAusOneDrive(wepId: string, fotoId: string): Promise<Blob | undefined> {
  const name = `${fotoId}.jpg`
  for (const ordner of [FOTOS_ORDNER, FOTOS_PAPIERKORB_ORDNER]) {
    try {
      return await erstelleGraphClient(zugriffstoken, undefined, `${ordner}/${wepId}`).ladeBlob(name)
    } catch (e) {
      if (!(e instanceof GraphFehler && e.status === 404)) throw e
    }
  }
  return undefined
}

/** Holt die Bau-Excel eines WEP aus OneDrive: erst aus daten/bau/, sonst aus dem Papierkorb-Ordner. */
export async function ladeBauExcelAusOneDrive(wepId: string): Promise<Blob | undefined> {
  const name = `${wepId}.xlsx`
  for (const ordner of [BAU_ORDNER, BAU_PAPIERKORB_ORDNER]) {
    try {
      return await erstelleGraphClient(zugriffstoken, undefined, ordner).ladeBlob(name)
    } catch (e) {
      if (!(e instanceof GraphFehler && e.status === 404)) throw e
    }
  }
  return undefined
}

/**
 * Vergisst den Abgleich-Stand (beim Abmelden): Beim nächsten Konto wird alles Lokale
 * wieder als „wartet auf Upload“ behandelt und die Ordner werden neu eingerichtet.
 * Lokale WEPs und das Profil bleiben unverändert erhalten.
 */
export async function setzeAbgleichZurueck(): Promise<void> {
  try {
    localStorage.removeItem(ORDNER_KEY)
  } catch {
    /* nichts zu vergessen */
  }
  for (const m of await syncSpeicher.alleMeta()) {
    if (m.endgueltig) {
      await syncSpeicher.schreibe({ id: m.id, meta: null }) // betraf nur das alte Konto
      continue
    }
    await syncSpeicher.setzeMeta(
      metaMit(m, m.id, m.lokalGeaendertAm, {
        letzterSyncAm: undefined,
        remoteETag: undefined,
        papierkorbETag: undefined,
        aufraeumen: undefined,
        konflikt: m.konflikt && { ...m.konflikt, kopien: [] },
      }),
    )
  }
  // Fotos: beim nächsten Konto alles hochladen; Löschmarken und Aufräumliste betrafen das alte Konto
  fotoAufraeumListe.speichere([])
  for (const r of await fotoSpeicher.alleRecords()) {
    if (r.geloescht) await fotoSpeicher.entferne(r.wepId, r.id)
    else if (r.hochgeladen) await fotoSpeicher.setzeRecord({ ...r, hochgeladen: false })
  }
  // Bau-Excel ebenso
  bauAufraeumListe.speichere([])
  for (const r of await bauSpeicher.alleRecords()) {
    if (r.geloescht) await bauSpeicher.entferne(r.wepId)
    else if (r.hochgeladen) await bauSpeicher.setzeRecord({ ...r, hochgeladen: false })
  }
  const stand = lokalesProfil.lade()
  lokalesProfil.speichere({ ...stand, letzterSyncAm: undefined, remoteETag: undefined })
  // Eigene Positionen: beim nächsten Konto alles hochladen (Marken gelöschter Einträge inklusive)
  const eigene = lokaleEigene.lade()
  lokaleEigene.speichere({ ...eigene, wartet: eigene.eintraege.length > 0, letzterSyncAm: undefined, remoteETag: undefined })
}
