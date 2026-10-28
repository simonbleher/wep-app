// GET /api/v2/weps/<id>/verlauf – Verlauf des WEP (Zeit, Person, Aktion, Notiz, Zustandswechsel).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { ladeVerlauf } from '../../../../_lib/v2/weps'

export const onRequestGet = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const e = await ladeVerlauf(db, konto, params.id)
  return e.ok ? jsonAntwort(200, { verlauf: e.wert }) : jsonAntwort(e.status, { fehler: e.fehler })
}
