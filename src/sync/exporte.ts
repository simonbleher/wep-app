// Fertige Excel-Dateien nach OneDrive (Exporte/) hochladen.
//
// Angemeldet und online: sofort hochladen. Sonst (offline oder Upload schlägt fehl)
// kommt die Datei in eine Warteschlange auf dem Gerät und geht beim nächsten Abgleich
// hoch. Gleicher Dateiname = neuere Fassung ersetzt die ältere (auch in der Warteschlange).
import type { GraphClient, SyncHinweis } from './types'

export const XLSX_TYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const JPEG_TYP = 'image/jpeg'
export const PDF_TYP = 'application/pdf'

export interface ExportEintrag {
  name: string
  blob: Blob
  erstelltAm: string
  /** Medientyp; fehlt = Excel. */
  typ?: string
  /**
   * Nur bei einer Ordner-Marke (Name endet auf „/“, z. B. „2026-001_Fotos/“): Namen der Dateien, die
   * im Ordner bleiben sollen. Alles andere dort wird entfernt, sobald alle Dateien oben sind.
   */
  behalte?: string[]
}

export interface ExportSpeicher {
  legeAb(eintrag: ExportEintrag): Promise<void>
  alle(): Promise<ExportEintrag[]>
  entferne(name: string): Promise<void>
}

export type ExportStatus = 'hochgeladen' | 'wartet'

/** `client` ist der Client für Exporte/; null = gerade nicht möglich (offline). `typ`: Medientyp (Standard Excel; PDF: `PDF_TYP`). */
export async function exportHochladen(opt: {
  client: GraphClient | null
  speicher: ExportSpeicher
  name: string
  blob: Blob
  typ?: string
  jetzt?: () => string
}): Promise<ExportStatus> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  if (opt.client) {
    try {
      await opt.client.schreibe(opt.name, opt.blob, opt.typ ?? XLSX_TYP)
      // Eine ältere, noch wartende Fassung ist damit überholt
      await opt.speicher.entferne(opt.name)
      return 'hochgeladen'
    } catch {
      /* unterwegs ausgefallen → Warteschlange */
    }
  }
  await opt.speicher.legeAb({ name: opt.name, blob: opt.blob, erstelltAm: jetzt(), ...(opt.typ ? { typ: opt.typ } : {}) })
  return 'wartet'
}

/** Lädt alles Wartende hoch. Fehler bleiben in der Warteschlange und werden gemeldet. */
export async function leereExportWarteschlange(
  client: GraphClient,
  speicher: ExportSpeicher,
  /** Client für einen Unterordner von Exporte/ (für die Ordner-Marken der Fotos). */
  ordnerClient?: (ordner: string) => GraphClient,
): Promise<{ hochgeladen: string[]; fehler: SyncHinweis[] }> {
  const ergebnis = { hochgeladen: [] as string[], fehler: [] as SyncHinweis[] }
  const meldeFehler = (name: string, err: unknown) =>
    ergebnis.fehler.push({
      wepId: name,
      text: `Export ${name}: ${err instanceof Error ? err.message : String(err)}`,
    })
  const alle = await speicher.alle()
  for (const e of alle.filter((x) => !istOrdnerMarke(x.name))) {
    try {
      await client.schreibe(e.name, e.blob, e.typ ?? XLSX_TYP)
      await speicher.entferne(e.name)
      ergebnis.hochgeladen.push(e.name)
    } catch (err) {
      meldeFehler(e.name, err)
    }
  }
  // Ordner aufräumen, sobald von seinen Dateien nichts mehr wartet
  const rest = await speicher.alle()
  for (const m of alle.filter((x) => istOrdnerMarke(x.name))) {
    const ordner = m.name.slice(0, -1)
    if (!ordnerClient || rest.some((x) => !istOrdnerMarke(x.name) && x.name.startsWith(m.name))) continue
    try {
      await bereinigeOrdner(ordnerClient(ordner), m.behalte ?? [])
      await speicher.entferne(m.name)
    } catch (err) {
      meldeFehler(m.name, err)
    }
  }
  return ergebnis
}

function istOrdnerMarke(name: string): boolean {
  return name.endsWith('/')
}

/** Entfernt aus dem Ordner alles, was nicht in `behalte` steht (Reste eines früheren Exports). */
async function bereinigeOrdner(client: GraphClient, behalte: string[]): Promise<void> {
  const bleibt = new Set(behalte)
  for (const d of await client.liste()) if (!bleibt.has(d.name)) await client.loesche(d.name)
}

export interface ExportDatei {
  name: string
  blob: Blob
}

/**
 * Legt einen Ordner mit Dateien (die Fotos eines Exports) in Exporte/<ordner>/ ab. Angemeldet und online:
 * sofort, danach werden Reste eines früheren Exports im Ordner entfernt. Sonst oder bei einem Fehler
 * wartet der Rest in der Warteschlange und geht beim nächsten Abgleich hoch. Ein neuerer Export desselben
 * Ordners ersetzt die wartende ältere Fassung.
 */
export async function exportOrdnerHochladen(opt: {
  client: GraphClient | null
  ordnerClient: ((ordner: string) => GraphClient) | null
  speicher: ExportSpeicher
  ordner: string
  dateien: ExportDatei[]
  jetzt?: () => string
}): Promise<{ status: ExportStatus; wartend: number }> {
  const jetzt = opt.jetzt ?? (() => new Date().toISOString())
  const marke = `${opt.ordner}/`
  for (const e of await opt.speicher.alle()) {
    if (e.name.startsWith(marke)) await opt.speicher.entferne(e.name) // überholt
  }
  const behalte = opt.dateien.map((d) => d.name)
  let fertig = 0
  if (opt.client) {
    try {
      for (const d of opt.dateien) {
        await opt.client.schreibe(`${opt.ordner}/${d.name}`, d.blob, JPEG_TYP)
        fertig++
      }
      if (opt.ordnerClient) await bereinigeOrdner(opt.ordnerClient(opt.ordner), behalte)
      return { status: 'hochgeladen', wartend: 0 }
    } catch {
      /* unterwegs ausgefallen → der Rest wartet */
    }
  }
  for (const d of opt.dateien.slice(fertig)) {
    await opt.speicher.legeAb({ name: `${marke}${d.name}`, blob: d.blob, erstelltAm: jetzt(), typ: JPEG_TYP })
  }
  await opt.speicher.legeAb({ name: marke, blob: new Blob([]), erstelltAm: jetzt(), behalte })
  return { status: 'wartet', wartend: opt.dateien.length - fertig }
}
