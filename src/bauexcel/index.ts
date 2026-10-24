// Bau-Excel am WEP (Beta 3, Paket 5): wählen, austauschen, entfernen, nachladen. Die Oberfläche
// (src/app/BauExcel.tsx) ruft nur diese Funktionen auf; die Ablage ist austauschbar (Tests).
//
// Die Datei liegt lokal in IndexedDB (src/app/db.ts) und in OneDrive unter daten/bau/<Vorgangs-Nr>.xlsx
// (Abgleich: src/sync/bauExcel.ts). Im WEP steht nur der Verweis `Wep.bauExcel` mit der Kennung
// (Hash) des Inhalts.
import {
  alleBauExcelRecords,
  entferneBauExcelLokal,
  ladeBauExcelDatei,
  markiereBauExcelGeloescht,
  setzeBauExcelRecord,
  speichereBauExcel,
} from '@/app/db'
import { leseBauFormalien, leseBauGruen, type BauFormalien } from '@/export/bauExcelLesen'
import type { BauGruen } from '@/export/bauExcelLesen'
import { leseBauTeil, leererBauTeil } from '@/export/bauTeilLesen'
import type { BauExcelInhalt } from './uebernahme'
import type { Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { inhaltsKennung } from './kennung'
import { XLSX_MIME, type BauExcelSpeicher } from './types'

export const dbBauAblage: BauExcelSpeicher = {
  alleRecords: alleBauExcelRecords,
  ladeDatei: ladeBauExcelDatei,
  setzeRecord: setzeBauExcelRecord,
  speichere: speichereBauExcel,
  entferne: entferneBauExcelLokal,
  markiereGeloescht: markiereBauExcelGeloescht,
}

export interface BauWerkzeuge {
  ablage: BauExcelSpeicher
  jetzt: () => string
}

const standard: BauWerkzeuge = { ablage: dbBauAblage, jetzt: () => new Date().toISOString() }

const hoerer = new Set<() => void>()
/** Meldet, wenn sich die Bau-Excel eines WEP (Datei, Upload-Stand) geändert hat. */
export function beiBauExcelAenderung(fn: () => void): () => void {
  hoerer.add(fn)
  return () => void hoerer.delete(fn)
}
export function meldeBauExcelAenderung(): void {
  for (const fn of hoerer) fn()
}

export interface GewaehltErgebnis {
  /** Formalien, die in der Bau-Excel ausgefüllt sind. */
  bau: BauFormalien
  /** Dieselbe Datei war schon hinterlegt: nichts geändert. */
  unveraendert: boolean
  /** Es gab schon eine andere Bau-Excel (sie wurde ersetzt). */
  ersetzt: boolean
}

/**
 * Hinterlegt die gewählte Bau-Excel am WEP (neu oder als Ersatz): prüft, dass es die WEP-Vorlage ist,
 * legt die Datei lokal ab und trägt den Verweis ins WEP ein. Erst die Datei, dann der Verweis: bricht
 * etwas ab, bleibt höchstens eine unbenutzte Datei. Wirft mit lesbarer Meldung, wenn die Datei nicht passt.
 */
export async function setzeBauExcel(opt: {
  wepId: string
  datei: Blob & { name?: string }
  /** Aktuelle Bau-Excel des WEP (zum Erkennen von „unverändert“/„ersetzt“). */
  aktuell?: Wep['bauExcel']
  aendere: WepAendern
  werkzeuge?: Partial<BauWerkzeuge>
}): Promise<GewaehltErgebnis> {
  const w = { ...standard, ...opt.werkzeuge }
  const bytes = new Uint8Array(await opt.datei.arrayBuffer())
  let bau: BauFormalien
  try {
    bau = await leseBauFormalien(bytes)
  } catch (e) {
    const meldung = e instanceof Error ? e.message : ''
    throw new Error(
      meldung.includes('Formalien')
        ? meldung
        : 'Diese Datei lässt sich nicht als Excel-Datei (.xlsx) lesen. Bitte die WEP-Datei des Bau-Wertermittlers wählen.',
    )
  }
  const version = await inhaltsKennung(bytes)
  const zeit = w.jetzt()
  if (opt.aktuell?.version === version) {
    // Dieselbe Datei: nichts ändern – außer sie liegt (noch) nicht auf diesem Gerät
    const rec = (await w.ablage.alleRecords()).find((r) => r.wepId === opt.wepId)
    if (rec?.hatDatei && !rec.geloescht && rec.version === version) return { bau, unveraendert: true, ersetzt: false }
    await w.ablage.speichere(
      { wepId: opt.wepId, version, hatDatei: true, hochgeladen: false, erstelltAm: zeit },
      new Blob([bytes.slice().buffer], { type: XLSX_MIME }),
    )
    meldeBauExcelAenderung()
    return { bau, unveraendert: true, ersetzt: false }
  }
  await w.ablage.speichere(
    { wepId: opt.wepId, version, hatDatei: true, hochgeladen: false, erstelltAm: zeit },
    new Blob([bytes.slice().buffer], { type: XLSX_MIME }),
  )
  await opt.aendere((wep) => ({
    ...wep,
    bauExcel: {
      name: opt.datei.name?.trim() || `${opt.wepId}.xlsx`,
      groesse: bytes.byteLength,
      version,
      hinzugefuegtAm: zeit,
    },
  }))
  meldeBauExcelAenderung()
  return { bau, unveraendert: false, ersetzt: Boolean(opt.aktuell) }
}

/**
 * Entfernt die Bau-Excel: Der Verweis verschwindet aus dem WEP und die Datei von diesem Gerät. Liegt sie
 * schon in OneDrive, wird sie dort beim nächsten Abgleich gelöscht – aber erst, wenn das WEP ohne
 * Verweis dort angekommen ist (src/sync/bauExcel.ts). Die bereits übernommenen Formalien bleiben.
 */
export async function entferneBauExcel(opt: { wepId: string; aendere: WepAendern; werkzeuge?: Partial<BauWerkzeuge> }): Promise<void> {
  const w = { ...standard, ...opt.werkzeuge }
  await opt.aendere((wep) => {
    const { bauExcel: _weg, ...rest } = wep
    return rest
  })
  const rec = (await w.ablage.alleRecords()).find((r) => r.wepId === opt.wepId)
  if (rec?.hochgeladen) await w.ablage.markiereGeloescht(opt.wepId, w.jetzt())
  else await w.ablage.entferne(opt.wepId)
  meldeBauExcelAenderung()
}

export type NachladeErgebnis =
  /** Kein Verweis am WEP. */
  | 'keine'
  /** Die aktuelle Fassung liegt schon auf diesem Gerät. */
  | 'vorhanden'
  | 'geladen'
  /** In OneDrive nicht erreichbar oder nicht vorhanden. */
  | 'fehlt'
  /** In OneDrive liegt noch eine andere (ältere) Fassung: das andere Gerät hat die neue noch nicht hochgeladen. */
  | 'veraltet'

export interface BauQuelle {
  /** Holt die Datei aus OneDrive (undefined = dort nicht vorhanden). */
  hole(wepId: string): Promise<Blob | undefined>
}

/** Holt die Bau-Excel aus OneDrive, wenn auf diesem Gerät nur eine ältere oder keine Fassung liegt. */
export async function ladeBauExcelNach(opt: { wep: Wep; quelle: BauQuelle; werkzeuge?: Partial<BauWerkzeuge> }): Promise<NachladeErgebnis> {
  const w = { ...standard, ...opt.werkzeuge }
  const ref = opt.wep.bauExcel
  if (!ref) return 'keine'
  const rec = (await w.ablage.alleRecords()).find((r) => r.wepId === opt.wep.id)
  if (rec && rec.hatDatei && !rec.geloescht && rec.version === ref.version) return 'vorhanden'
  let blob: Blob | undefined
  try {
    blob = await opt.quelle.hole(opt.wep.id)
  } catch {
    return 'fehlt'
  }
  if (!blob) return 'fehlt'
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if ((await inhaltsKennung(bytes)) !== ref.version) return 'veraltet'
  await w.ablage.speichere(
    { wepId: opt.wep.id, version: ref.version, hatDatei: true, hochgeladen: true, erstelltAm: w.jetzt() },
    new Blob([bytes.slice().buffer], { type: XLSX_MIME }),
  )
  meldeBauExcelAenderung()
  return 'geladen'
}

/** Die Bau-Excel dieses WEP als Bytes für den Export, wenn sie auf diesem Gerät liegt (sonst undefined). */
export async function ladeLokaleBauExcel(wep: Wep, werkzeuge?: Partial<BauWerkzeuge>): Promise<ArrayBuffer | undefined> {
  const w = { ...standard, ...werkzeuge }
  const ref = wep.bauExcel
  if (!ref) return undefined
  const rec = (await w.ablage.alleRecords()).find((r) => r.wepId === wep.id)
  if (!rec?.hatDatei || rec.geloescht || rec.version !== ref.version) return undefined
  return (await w.ablage.ladeDatei(wep.id))?.arrayBuffer()
}

/**
 * Die Bau-Excel für den Export: lokal, sonst aus OneDrive nachgeladen. Ohne Verweis am WEP: undefined
 * (der Export nimmt dann die leere Vorlage). Ist die Datei nicht zu bekommen, wirft die Funktion mit
 * einer verständlichen Meldung – ein stiller Export mit der leeren Vorlage wäre falsch.
 */
export async function bauExcelFuerExport(opt: {
  wep: Wep
  quelle: BauQuelle
  werkzeuge?: Partial<BauWerkzeuge>
}): Promise<ArrayBuffer | undefined> {
  if (!opt.wep.bauExcel) return undefined
  const erg = await ladeBauExcelNach(opt)
  if (erg === 'fehlt' || erg === 'veraltet') {
    throw new Error(
      erg === 'veraltet'
        ? `Die Bau-Excel (${opt.wep.bauExcel.name}) wurde auf einem anderen Gerät ausgetauscht; die neue Fassung ist noch nicht in OneDrive. Bitte dort abgleichen lassen oder die Bau-Excel hier neu auswählen.`
        : `Die Bau-Excel (${opt.wep.bauExcel.name}) liegt noch nicht auf diesem Gerät und ist gerade nicht aus OneDrive zu holen. Bitte mit Netz noch einmal versuchen oder die Bau-Excel hier neu auswählen.`,
    )
  }
  const bytes = await ladeLokaleBauExcel(opt.wep, opt.werkzeuge)
  if (!bytes) throw new Error('Die Bau-Excel dieses WEP konnte nicht gelesen werden. Bitte neu auswählen.')
  return bytes
}

/** Die ausgefüllten Formalien der hinterlegten Bau-Excel (undefined = Datei liegt nicht auf diesem Gerät). */
export async function leseHinterlegteFormalien(wep: Wep, werkzeuge?: Partial<BauWerkzeuge>): Promise<BauFormalien | undefined> {
  const bytes = await ladeLokaleBauExcel(wep, werkzeuge)
  return bytes ? leseBauFormalien(bytes) : undefined
}

/** Bau- und Grün-Teil der Bau-Excel sind eine Zugabe: ein unlesbares Blatt verhindert nicht das Hinterlegen. */
export async function leseInhaltOderLeer(bytes: Uint8Array | ArrayBuffer): Promise<BauExcelInhalt> {
  const teil = await leseBauTeil(bytes).catch(() => leererBauTeil())
  const gruen = await leseBauGruen(bytes).catch((): BauGruen => ({ aussenanlagen: [], aufwuchs: [], beseitigungAA: [] }))
  return { teil, gruen }
}

/** Alles außer den Formalien aus der hinterlegten Bau-Excel (undefined = Datei liegt nicht auf diesem Gerät). */
export async function leseHinterlegtenInhalt(wep: Wep, werkzeuge?: Partial<BauWerkzeuge>): Promise<BauExcelInhalt | undefined> {
  const bytes = await ladeLokaleBauExcel(wep, werkzeuge)
  return bytes ? leseInhaltOderLeer(bytes) : undefined
}
