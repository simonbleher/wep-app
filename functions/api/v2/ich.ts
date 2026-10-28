// GET /api/v2/ich – eigenes Konto (auch wartend); PATCH { mailBenachrichtigung } – eigene Einstellungen.
import { jsonAntwort } from '../../_lib/serverModus'
import { setzeMailBenachrichtigung } from '../../_lib/v2/konten'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../_lib/v2/kontext'
import { kontoDerSitzung } from '../../_lib/v2/sitzung'

export const onRequestGet = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const konto = await kontoDerSitzung(db, request)
  return konto ? jsonAntwort(200, { konto }) : jsonAntwort(401, { fehler: 'Nicht angemeldet.' })
}

export const onRequestPatch = async ({ request, env }: V2Kontext): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const body = (await request.json().catch(() => ({}))) as { mailBenachrichtigung?: unknown }
  if (typeof body.mailBenachrichtigung !== 'boolean') return jsonAntwort(400, { fehler: 'mailBenachrichtigung fehlt.' })
  await setzeMailBenachrichtigung(db, konto.id, body.mailBenachrichtigung)
  return jsonAntwort(200, { konto: { ...konto, mailBenachrichtigung: body.mailBenachrichtigung } })
}
