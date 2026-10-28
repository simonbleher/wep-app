// POST /api/v2/benachrichtigungen/gelesen { ids? } – als gelesen markieren (ohne ids: alle eigenen).
import { jsonAntwort } from '../../../_lib/serverModus'
import { markiereGelesen } from '../../../_lib/v2/benachrichtigungen'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../_lib/v2/kontext'

export const onRequestPost = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  await markiereGelesen(db, konto.id, Array.isArray(body.ids) ? (body.ids as number[]) : undefined)
  return jsonAntwort(200, { ok: true })
}
