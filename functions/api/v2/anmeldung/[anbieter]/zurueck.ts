// GET /api/v2/anmeldung/<google|microsoft>/zurueck?code&state – Rücksprung vom Anbieter: Code gegen ID-Token tauschen,
// Token prüfen, Konto finden oder anlegen („wartet auf Freigabe“), Sitzung setzen, zurück in die App.
import { jsonAntwort } from '../../../../_lib/serverModus'
import { TokenFehler } from '../../../../_lib/idToken'
import { kontoZurAnmeldung } from '../../../../_lib/v2/konten'
import { datenbank, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { clientDaten, holeIdToken, istAnbieter, jwks, pruefeAnmeldeToken } from '../../../../_lib/v2/oidc'
import { ANMELDUNG_COOKIE, beendeAnmeldung, cookie, leseCookie, neueSitzung } from '../../../../_lib/v2/sitzung'

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

export const onRequestGet = async ({ request, env, params }: V2Kontext<'anbieter'>): Promise<Response> => {
  const anbieter = params.anbieter
  if (!istAnbieter(anbieter)) return jsonAntwort(404, { fehler: 'Unbekannter Anbieter.' })
  const client = clientDaten(env, anbieter)
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const url = new URL(request.url)
  if (!client) return fehlerZurApp(url.origin, 'Diese Anmeldung ist noch nicht eingerichtet.')
  const anbieterFehler = url.searchParams.get('error')
  if (anbieterFehler) return fehlerZurApp(url.origin, anbieterFehler === 'access_denied' ? 'Anmeldung abgebrochen.' : `Anmeldung fehlgeschlagen (${anbieterFehler}).`)
  const vorgang = await beendeAnmeldung(db, anbieter, url.searchParams.get('state'), leseCookie(request, ANMELDUNG_COOKIE))
  const code = url.searchParams.get('code')
  if (!vorgang || !code) return fehlerZurApp(url.origin, 'Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser begonnen. Bitte noch einmal anmelden.')
  try {
    const idToken = await holeIdToken({ anbieter, client, origin: url.origin, code, verifier: vorgang.verifier })
    const identitaet = await pruefeAnmeldeToken(idToken, { anbieter, clientId: client.id, nonce: vorgang.nonce, schluessel: jwks(anbieter) })
    const konto = await kontoZurAnmeldung(db, identitaet, env.V2_ADMINS)
    if (konto.status === 'gesperrt') return fehlerZurApp(url.origin, 'Das Konto ist gesperrt. Bitte beim Admin melden.')
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
    return fehlerZurApp(url.origin, e instanceof TokenFehler ? `Anmeldung ungültig: ${e.message}` : 'Anmeldung konnte nicht abgeschlossen werden.')
  }
}
