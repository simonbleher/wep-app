// GET /api/v2/konten/gruen – freigegebene Grün-Wertermittler (Name, E-Mail) für die Abgabe Bau → Grün. Nur für Bau.
import { jsonAntwort } from '../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, NICHT_EINGERICHTET, type V2Kontext } from '../../../_lib/v2/kontext'
import { gruenKonten } from '../../../_lib/v2/weps'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const konto = await freigegebenesKonto(db, request, 'bau')
  if (konto instanceof Response) return konto
  return jsonAntwort(200, { konten: (await gruenKonten(db)).filter((k) => k.id !== konto.id) })
}
