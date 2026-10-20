// Fertige Excel-Dateien nach OneDrive (Exporte/) hochladen.
//
// Angemeldet und online: sofort hochladen. Sonst (offline oder Upload schlägt fehl)
// kommt die Datei in eine Warteschlange auf dem Gerät und geht beim nächsten Abgleich
// hoch. Gleicher Dateiname = neuere Fassung ersetzt die ältere (auch in der Warteschlange).
import type { GraphClient, SyncHinweis } from './types'

export const XLSX_TYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface ExportEintrag {
  name: string
  blob: Blob
  erstelltAm: string
}

export interface ExportSpeicher {
  legeAb(eintrag: ExportEintrag): Promise<void>
  alle(): Promise<ExportEintrag[]>
  entferne(name: string): Promise<void>
}

export type ExportStatus = 'hochgeladen' | 'wartet'

/** `client` ist der Client für Exporte/; null = gerade nicht möglich (offline). */
export async function exportHochladen(opt: {
  client: GraphClient | null
  speicher: ExportSpeicher
  name: string
  blob: Blob
  jetzt?: () => string
}): Promise<ExportStatus> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  if (opt.client) {
    try {
      await opt.client.schreibe(opt.name, opt.blob, XLSX_TYP)
      // Eine ältere, noch wartende Fassung ist damit überholt
      await opt.speicher.entferne(opt.name)
      return 'hochgeladen'
    } catch {
      /* unterwegs ausgefallen → Warteschlange */
    }
  }
  await opt.speicher.legeAb({ name: opt.name, blob: opt.blob, erstelltAm: jetzt() })
  return 'wartet'
}

/** Lädt alles Wartende hoch. Fehler bleiben in der Warteschlange und werden gemeldet. */
export async function leereExportWarteschlange(
  client: GraphClient,
  speicher: ExportSpeicher,
): Promise<{ hochgeladen: string[]; fehler: SyncHinweis[] }> {
  const ergebnis = { hochgeladen: [] as string[], fehler: [] as SyncHinweis[] }
  for (const e of await speicher.alle()) {
    try {
      await client.schreibe(e.name, e.blob, XLSX_TYP)
      await speicher.entferne(e.name)
      ergebnis.hochgeladen.push(e.name)
    } catch (err) {
      ergebnis.fehler.push({
        wepId: e.name,
        text: `Export ${e.name}: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
  return ergebnis
}
