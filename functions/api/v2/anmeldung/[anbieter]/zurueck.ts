// GET /api/v2/anmeldung/<google|microsoft>/zurueck?code&state – Rücksprung vom Anbieter: Code gegen ID-Token tauschen,
// Token prüfen, Konto finden oder anlegen („wartet auf Freigabe“), Sitzung setzen, zurück in die App.
// Kam die Anmeldung aus der Android-/Windows-App, gibt es statt des Cookies einen Einmal-Code für die App.
// Fehler gehen nur als fester Schlüssel zurück (src/server/anmeldeFehler.ts), nie als Text aus der Adresse.
import { jsonAntwort } from '../../../../_lib/serverModus'
import { TokenFehler } from '../../../../_lib/idToken'
import { kontoZurAnmeldung } from '../../../../_lib/v2/konten'
import { datenbank, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { clientDaten, holeIdToken, istAnbieter, jwks, pruefeAnmeldeToken } from '../../../../_lib/v2/oidc'
import { ANMELDUNG_COOKIE, beendeAnmeldung, cookie, leseCookie, neueSitzung } from '../../../../_lib/v2/sitzung'
import { erstelleAppCode, ruecksprungMit } from '../../../../_lib/v2/appAnmeldung'
import { zuViele } from '../../../../_lib/v2/begrenzung'
import { fehlerZurApp, fehlerZurSeite } from '../../../../_lib/v2/anmeldeAntwort'
import type { AnmeldeFehler } from '../../../../../src/server/anmeldeFehler'

export const onRequestGet = async ({ request, env, params }: V2Kontext<'anbieter'>): Promise<Response> => {
  const anbieter = params.anbieter
  if (!istAnbieter(anbieter)) return jsonAntwort(404, { fehler: 'Unbekannter Anbieter.' })
  const client = clientDaten(env, anbieter)
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const url = new URL(request.url)
  if (!client) return fehlerZurSeite(url.origin, 'nicht_eingerichtet')
  if (await zuViele(db, request, 'anmeldung')) return fehlerZurSeite(url.origin, 'zu_viele')
  const anbieterFehler = url.searchParams.get('error')
  const vorgang = await beendeAnmeldung(db, anbieter, url.searchParams.get('state'), leseCookie(request, ANMELDUNG_COOKIE))
  const zurueck = (f: AnmeldeFehler) => (vorgang?.app ? fehlerZurApp(vorgang.app, f) : fehlerZurSeite(url.origin, f))
  if (anbieterFehler) return zurueck(anbieterFehler === 'access_denied' ? 'abgebrochen' : 'anbieter')
  const code = url.searchParams.get('code')
  if (!vorgang || !code) return fehlerZurSeite(url.origin, 'abgelaufen')
  try {
    const idToken = await holeIdToken({ anbieter, client, origin: url.origin, code, verifier: vorgang.verifier })
    const identitaet = await pruefeAnmeldeToken(idToken, { anbieter, clientId: client.id, nonce: vorgang.nonce, schluessel: jwks(anbieter) })
    const konto = await kontoZurAnmeldung(db, identitaet, env.V2_ADMINS)
    if (konto.status === 'gesperrt') return zurueck('gesperrt')
    if (vorgang.app) {
      // App: Einmal-Code statt Cookie; das Token holt die App mit ihrem Verifier (…/anmeldung/app/token)
      const einmal = await erstelleAppCode(db, konto.id, vorgang.app)
      return new Response(null, {
        status: 302,
        headers: [
          ['location', ruecksprungMit(vorgang.app, { code: einmal })],
          ['set-cookie', cookie(ANMELDUNG_COOKIE, '', 0)],
          ['cache-control', 'no-store'],
        ],
      })
    }
    const sitzung = await neueSitzung(db, konto.id)
    return new Response(null, {
      status: 302,
      headers: [
        ['location', `${url.origin}${vorgang.ziel}`],
        ['set-cookie', sitzung.cookie],
        ['set-cookie', cookie(ANMELDUNG_COOKIE, '', 0)],
        ['cache-control', 'no-store'],
      ],
    })
  } catch (e) {
    return zurueck(e instanceof TokenFehler ? 'ungueltig' : 'fehler')
  }
}
