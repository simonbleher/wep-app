// Öffentliche Schnittstelle des Sync-Moduls für die App.
// Die Anmeldung kommt aus src/konto; hier wird nur noch das Token benutzt.
import { aktuellesKonto, kontoVerfuegbar, zugriffstoken } from '@/konto'
import { lokalesProfil } from '@/profil'
import { synchronisiere, wartetAufUpload } from './engine'
import { exportHochladen, leereExportWarteschlange, type ExportStatus } from './exporte'
import { erstelleGraphClient } from './graph'
import { DATEN_ORDNER, EXPORTE_ORDNER, richteOrdnerEin } from './ordner'
import { synchronisiereProfil } from './profil'
import { exportSpeicher, syncSpeicher } from './speicher'
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

const GERAET_KEY = 'wep-geraet'
const ORDNER_KEY = 'wep-ordner-eingerichtet'

/** Stabile, zufällige Kennung dieses Geräts (nur zur Info in den Sync-Dateien). */
export function geraeteKennung(): string {
  try {
    let id = localStorage.getItem(GERAET_KEY)
    if (!id) {
      id = `${navigator.platform || 'Gerät'}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(GERAET_KEY, id)
    }
    return id
  } catch {
    return 'unbekanntes Gerät'
  }
}

/** Anzahl der WEPs und Exporte, die noch auf den Upload warten. */
export async function wartendeAenderungen(): Promise<number> {
  const [weps, metas, exporte] = await Promise.all([
    syncSpeicher.alleWeps(),
    syncSpeicher.alleMeta(),
    exportSpeicher.alle(),
  ])
  const meta = new Map(metas.map((m) => [m.id, m]))
  return weps.filter((w) => wartetAufUpload(meta.get(w.id))).length + exporte.length
}

export interface GesamtErgebnis extends SyncErgebnis {
  exporte: string[]
  profilGeaendert: boolean
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
  const exporte = erstelleGraphClient(zugriffstoken, undefined, EXPORTE_ORDNER)

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

  const ergebnis = await synchronisiere({ client: daten, lokal: syncSpeicher, geraet })
  const gesamt: GesamtErgebnis = { ...ergebnis, exporte: [], profilGeaendert: false }

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
  const q = await leereExportWarteschlange(exporte, exportSpeicher)
  gesamt.exporte = q.hochgeladen
  gesamt.fehler.push(...q.fehler)
  return gesamt
}

/**
 * Legt eine fertige Excel-Datei in OneDrive (Exporte/) ab, wenn angemeldet und online;
 * sonst kommt sie in die Warteschlange. Ohne Konto passiert nichts ('ohne-konto').
 */
export async function exportNachOneDrive(
  name: string,
  blob: Blob,
): Promise<ExportStatus | 'ohne-konto'> {
  if (!kontoVerfuegbar() || !(await aktuellesKonto())) return 'ohne-konto'
  return exportHochladen({
    client: navigator.onLine ? erstelleGraphClient(zugriffstoken, undefined, EXPORTE_ORDNER) : null,
    speicher: exportSpeicher,
    name,
    blob,
  })
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
    await syncSpeicher.setzeMeta({ ...m, letzterSyncAm: undefined, remoteETag: undefined })
  }
  const stand = lokalesProfil.lade()
  lokalesProfil.speichere({ ...stand, letzterSyncAm: undefined, remoteETag: undefined })
}
