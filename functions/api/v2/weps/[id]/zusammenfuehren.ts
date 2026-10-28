// POST /api/v2/weps/<Bau-WEP>/zusammenfuehren { aus: <eigenes Grün-WEP>, wep, felder, basisRev } – Grün führt sein eigenes
// WEP mit dem an ihn abgegebenen Bau-WEP zusammen. Wer was darf: src/server/rechte.ts (`pruefeZusammenfuehren`).
// Danach werden die Fotodateien des Grün-WEP in R2 zum Bau-WEP kopiert (was fehlt, lädt die App selbst hoch).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { fuehreZusammen } from '../../../../_lib/v2/weps'
import { kopiereFotos, type R2Ablage } from '../../../../_lib/v2/dateien'

export const onRequestPost = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request, 'gruen')
  if (konto instanceof Response) return konto
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const e = await fuehreZusammen(db, konto, params.id, body)
  if (!e.ok) return jsonAntwort(e.status, { fehler: e.fehler, ...(e.stand ? { stand: e.stand } : {}) })
  const r2 = env.WEP_DATEIEN as R2Ablage | undefined
  const kopiert = r2 && e.wert.fotoIds.length ? await kopiereFotos(r2, e.wert.gruenId, params.id, e.wert.fotoIds).catch(() => 0) : 0
  return jsonAntwort(200, { kopf: e.wert.kopf, fotosKopiert: kopiert })
}
