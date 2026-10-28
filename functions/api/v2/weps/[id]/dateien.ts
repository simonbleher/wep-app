// GET /api/v2/weps/<id>/dateien – Dateien des WEP auf dem Server (foto-<Id>.jpg, bau.xlsx).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { listeDateien, pruefeZugriff, type R2Ablage } from '../../../../_lib/v2/dateien'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'

export const onRequestGet = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  const r2 = env.WEP_DATEIEN as R2Ablage | undefined
  if (!db) return NICHT_EINGERICHTET()
  if (!r2) return jsonAntwort(503, { fehler: 'Der Dateispeicher ist noch nicht eingerichtet (WEP_DATEIEN).' })
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const z = await pruefeZugriff(db, konto, params.id, false)
  if (!z.ok) return jsonAntwort(z.status, { fehler: z.fehler })
  return jsonAntwort(200, { dateien: await listeDateien(r2, params.id) })
}
