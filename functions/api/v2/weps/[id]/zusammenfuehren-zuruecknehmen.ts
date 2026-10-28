// POST /api/v2/weps/<Bau-WEP>/zusammenfuehren-zuruecknehmen { basisRev } – Zusammenführen rückgängig machen, solange das
// Bau-WEP bei Grün in Arbeit ist: Bau-WEP wie vorher, das eigene Grün-WEP taucht wieder auf.
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { nimmZusammenfuehrungZurueck } from '../../../../_lib/v2/weps'

export const onRequestPost = async ({ request, env, params }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request, 'gruen')
  if (konto instanceof Response) return konto
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const e = await nimmZusammenfuehrungZurueck(db, konto, params.id, body)
  return e.ok ? jsonAntwort(200, { kopf: e.wert }) : jsonAntwort(e.status, { fehler: e.fehler, ...(e.stand ? { stand: e.stand } : {}) })
}
