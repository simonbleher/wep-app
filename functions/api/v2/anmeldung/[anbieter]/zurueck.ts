// GET /api/v2/anmeldung/<google|microsoft>/zurueck?code&state – Rücksprung vom Anbieter: Code gegen ID-Token tauschen,
// Token prüfen, Konto finden oder anlegen („wartet auf Freigabe“), Sitzung setzen, zurück in die App.
// Kam die Anmeldung aus der Android-/Windows-App, gibt es statt des Cookies einen Einmal-Code für die App.
import { jsonAntwort } from '../../../../_lib/serverModus'
import { TokenFehler } from '../../../../_lib/idToken'
import { kontoZurAnmeldung } from '../../../../_lib/v2/konten'
import { datenbank, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { clientDaten, holeIdToken, istAnbieter, jwks, pruefeAnmeldeToken } from '../../../../_lib/v2/oidc'
import { ANMELDUNG_COOKIE, beendeAnmeldung, cookie, leseCookie, neueSitzung, type AppAnmeldung } from '../../../../_lib/v2/sitzung'
import { erstelleAppCode, ruecksprungMit } from '../../../../_lib/v2/appAnmeldung'

/** Zurück in die App mit einer lesbaren Meldung (die App zeigt sie auf dem Anmelde-Bildschirm). */
const fehlerZurApp = (origin: string, meldung: string) =>
  new Response(null, {
    status: 302,
    headers: [
      ['location', `${origin}/?anmeldefehler=${encodeURIComponent(meldung)}`],
      ['set-cookie', cookie(ANMELDUNG_COOKIE, '', 0)],
      ['cache-control', 'no-store'],
    ],
  })

/** Zurück in die App (Android/Windows) mit einer Meldung. */
const fehlerZurApp2 = (app: AppAnmeldung, meldung: string) =>
  new Response(null, {
    status: 302,
    headers: [
      ['location', ruecksprungMit(app, { error: meldung })],
      ['set-cookie', cookie(ANMELDUNG_COOKIE, '', 0)],
      ['cache-control', 'no-store'],
    ],
  })

export const onRequestGet = async ({ request, env, params }: V2Kontext<'anbieter'>): Promise<Response> => {
  const anbieter = params.anbieter
  if (!istAnbieter(anbieter)) return jsonAntwort(404, { fehler: 'Unbekannter Anbieter.' })
  const client = clientDaten(env, anbieter)
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const url = new URL(request.url)
  if (!client) return fehlerZurApp(url.origin, 'Diese Anmeldung ist noch nicht eingerichtet.')
  const anbieterFehler = url.searchParams.get('error')
  const vorgang = await beendeAnmeldung(db, anbieter, url.searchParams.get('state'), leseCookie(request, ANMELDUNG_COOKIE))
  const zurueck = (meldung: string) => (vorgang?.app ? fehlerZurApp2(vorgang.app, meldung) : fehlerZurApp(url.origin, meldung))
  if (anbieterFehler) return zurueck(anbieterFehler === 'access_denied' ? 'Anmeldung abgebrochen.' : `Anmeldung fehlgeschlagen (${anbieterFehler}).`)
  const code = url.searchParams.get('code')
  if (!vorgang || !code) return fehlerZurApp(url.origin, 'Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser begonnen. Bitte noch einmal anmelden.')
  try {
    const idToken = await holeIdToken({ anbieter, client, origin: url.origin, code, verifier: vorgang.verifier })
    const identitaet = await pruefeAnmeldeToken(idToken, { anbieter, clientId: client.id, nonce: vorgang.nonce, schluessel: jwks(anbieter) })
    const konto = await kontoZurAnmeldung(db, identitaet, env.V2_ADMINS)
    if (konto.status === 'gesperrt') return zurueck('Das Konto ist gesperrt. Bitte beim Admin melden.')
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
    return zurueck(e instanceof TokenFehler ? `Anmeldung ungültig: ${e.message}` : 'Anmeldung konnte nicht abgeschlossen werden.')
  }
}
