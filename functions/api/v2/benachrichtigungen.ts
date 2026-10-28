// GET /api/v2/benachrichtigungen – „Neu für dich“: die letzten 50 eigenen Benachrichtigungen (neueste zuerst).
import { jsonAntwort } from '../../_lib/serverModus'
import { meineBenachrichtigungen } from '../../_lib/v2/benachrichtigungen'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../_lib/v2/kontext'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  return jsonAntwort(200, { benachrichtigungen: await meineBenachrichtigungen(db, konto.id) })
}
