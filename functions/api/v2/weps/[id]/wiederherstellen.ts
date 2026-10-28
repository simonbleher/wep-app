// POST /api/v2/weps/<id>/wiederherstellen – aus dem Papierkorb zurückholen (nur der Besitzer).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { setzePapierkorb } from '../../../../_lib/v2/weps'

export const onRequestPost = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const e = await setzePapierkorb(db, konto, params.id, false, undefined)
  return e.ok ? jsonAntwort(200, { kopf: e.wert }) : jsonAntwort(e.status, { fehler: e.fehler, ...(e.stand ? { stand: e.stand } : {}) })
}
