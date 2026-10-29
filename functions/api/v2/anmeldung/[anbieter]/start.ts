// GET /api/v2/anmeldung/<google|microsoft>/start?ziel=/pfad – leitet zum Anbieter weiter (PKCE, state, nonce).
// Aus einer App (Systembrowser): …/start?client=app&challenge=…&state=…&ruecksprung=… (functions/_lib/v2/appAnmeldung.ts).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { autorisierungsUrl, clientDaten, istAnbieter } from '../../../../_lib/v2/oidc'
import { beginneAnmeldung } from '../../../../_lib/v2/sitzung'
import { appAnmeldungAus } from '../../../../_lib/v2/appAnmeldung'

export const onRequestGet = async ({ request, env, params }: V2Kontext<'anbieter'>): Promise<Response> => {
  const anbieter = params.anbieter
  if (!istAnbieter(anbieter)) return jsonAntwort(404, { fehler: 'Unbekannter Anbieter.' })
  const client = clientDaten(env, anbieter)
  if (!client) return jsonAntwort(503, { fehler: `Anmeldung mit ${anbieter === 'google' ? 'Google' : 'Microsoft'} ist noch nicht eingerichtet.` })
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const url = new URL(request.url)
  const app = appAnmeldungAus(url.searchParams)
  if (typeof app === 'string') return jsonAntwort(400, { fehler: app })
  const v = await beginneAnmeldung(db, anbieter, url.searchParams.get('ziel') ?? '/', Date.now(), app)
  const ziel = await autorisierungsUrl({ anbieter, clientId: client.id, origin: url.origin, state: v.state, nonce: v.nonce, verifier: v.verifier })
  return new Response(null, { status: 302, headers: { location: ziel, 'set-cookie': v.cookie, 'cache-control': 'no-store' } })
}
