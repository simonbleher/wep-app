// GET /api/v2/admin/konten – alle Konten (nur Admins), wartende zuerst, mit ihren offenen Sitzungen (Browser/Apps).
import { jsonAntwort } from '../../../_lib/serverModus'
import { alleKonten } from '../../../_lib/v2/konten'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../../_lib/v2/kontext'
import { sitzungenVon } from '../../../_lib/v2/sitzung'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const admin = await freigegebenesKonto(db, request, 'admin')
  if (admin instanceof Response) return admin
  const konten = await alleKonten(db)
  return jsonAntwort(200, { konten: await Promise.all(konten.map(async (k) => ({ ...k, sitzungen: await sitzungenVon(db, k.id) }))) })
}
