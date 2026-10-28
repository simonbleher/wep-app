// GET /api/v2/weps – Köpfe aller WEPs, die das Konto lesen darf (für den Abgleich und Listen; ohne Inhalt).
import { jsonAntwort } from '../../_lib/serverModus'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../_lib/v2/kontext'
import { lesbareWeps } from '../../_lib/v2/weps'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  return jsonAntwort(200, { weps: await lesbareWeps(db, konto) })
}
