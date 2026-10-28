// Server-Modus (v2): Fotos und Bau-Excel über /api/v2/weps/<id>/dateien/… hoch- und herunterladen.
import { AbgleichFehler } from './abgleich'
import { BAU_NAME, fotoName, type DateiZugriff } from './dateiAbgleich'

const pfad = (wepId: string, name: string) => `/api/v2/weps/${encodeURIComponent(wepId)}/dateien/${encodeURIComponent(name)}`

async function fehlerAus(r: Response): Promise<AbgleichFehler> {
  const d = (await r.json().catch(() => ({}))) as { fehler?: string }
  return new AbgleichFehler(d.fehler ?? `Server antwortet mit ${r.status}`, r.status)
}

export const httpDateien: DateiZugriff = {
  async hochladen(wepId, name, datei) {
    const r = await fetch(pfad(wepId, name), { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': datei.type || 'application/octet-stream' }, body: datei })
    if (!r.ok) throw await fehlerAus(r)
  },
  async loesche(wepId, name) {
    const r = await fetch(pfad(wepId, name), { method: 'DELETE', credentials: 'same-origin' })
    if (!r.ok && r.status !== 404) throw await fehlerAus(r)
  },
}

async function lade(wepId: string, name: string): Promise<Blob | undefined> {
  const r = await fetch(pfad(wepId, name), { credentials: 'same-origin' })
  if (r.status === 404) return undefined
  if (!r.ok) throw await fehlerAus(r)
  return r.blob()
}

/** Foto vom Server (undefined = dort nicht vorhanden). */
export const ladeFotoVomServer = (wepId: string, fotoId: string) => lade(wepId, fotoName(fotoId))

/** Bau-Excel vom Server (undefined = dort nicht vorhanden). */
export const ladeBauExcelVomServer = (wepId: string) => lade(wepId, BAU_NAME)
