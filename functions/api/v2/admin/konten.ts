// GET /api/v2/admin/konten – alle Konten (nur Admins), wartende zuerst.
import { jsonAntwort } from '../../../_lib/serverModus'
import { alleKonten } from '../../../_lib/v2/konten'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../../_lib/v2/kontext'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const admin = await freigegebenesKonto(db, request, 'admin')
  if (admin instanceof Response) return admin
  return jsonAntwort(200, { konten: await alleKonten(db) })
}
