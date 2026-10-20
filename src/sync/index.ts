// Öffentliche Schnittstelle des Sync-Moduls für die App.
// Die Anmeldung kommt aus src/konto; hier wird nur noch das Token benutzt.
import { aktuellesKonto, kontoVerfuegbar, zugriffstoken } from '@/konto'
import { lokaleEigene } from '@/katalog'
import { lokalesProfil } from '@/profil'
import { synchronisiere, wartetAufUpload } from './engine'
import { synchronisiereEigenePositionen } from './eigenePositionen'
import { exportHochladen, leereExportWarteschlange, type ExportStatus } from './exporte'
import { erstelleGraphClient } from './graph'
import { geraeteKennung } from './geraet'
import { DATEN_ORDNER, EXPORTE_ORDNER, PAPIERKORB_ORDNER, richteOrdnerEin } from './ordner'
import { metaMit, raeumePapierkorbAuf } from './papierkorb'
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

export { geraeteKennung }

const ORDNER_KEY = 'wep-ordner-eingerichtet'

/**
 * Anzahl der Änderungen, die noch auf den Abgleich warten: WEPs und Exporte zum Hochladen,
 * Löschungen (Papierkorb), die noch nicht in OneDrive sind, und endgültig Gelöschtes.
 */
export async function wartendeAenderungen(): Promise<number> {
  const [weps, korb, metas, exporte] = await Promise.all([
    syncSpeicher.alleWeps(),
    syncSpeicher.alleImPapierkorb(),
    syncSpeicher.alleMeta(),
    exportSpeicher.alle(),
  ])
  const meta = new Map(metas.map((m) => [m.id, m]))
  return (
    weps.filter((w) => wartetAufUpload(meta.get(w.id))).length +
    korb.filter((e) => !meta.get(e.id)?.papierkorbETag).length +
    metas.filter((m) => m.endgueltig).length +
    exporte.length +
    (lokaleEigene.lade().wartet ? 1 : 0)
  )
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
  await raeumePapierkorbAuf(syncSpeicher, new Date().toISOString())
  const ergebnis = await synchronisiere({ client: daten, papierkorb, lokal: syncSpeicher, geraet })
  const gesamt: GesamtErgebnis = { ...ergebnis, exporte: [], profilGeaendert: false, eigenePositionenGeaendert: false }

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
  const stand = lokalesProfil.lade()
  lokalesProfil.speichere({ ...stand, letzterSyncAm: undefined, remoteETag: undefined })
  // Eigene Positionen: beim nächsten Konto alles hochladen (Marken gelöschter Einträge inklusive)
  const eigene = lokaleEigene.lade()
  lokaleEigene.speichere({ ...eigene, wartet: eigene.eintraege.length > 0, letzterSyncAm: undefined, remoteETag: undefined })
}
