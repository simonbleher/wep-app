// Antworten der Anmeldung bei einem Fehler: zurück auf die Seite mit einem festen Schlüssel (?anmeldefehler=<schlüssel>,
// Text in src/server/anmeldeFehler.ts – Fund N10) bzw. in die Android-/Windows-App mit dem Text zum Schlüssel.
import { ANMELDEFEHLER_TEXT, type AnmeldeFehler } from '../../../src/server/anmeldeFehler'
import { ruecksprungMit } from './appAnmeldung'
import { ANMELDUNG_COOKIE, cookie, type AppAnmeldung } from './sitzung'

const umleitung = (ziel: string) =>
  new Response(null, {
    status: 302,
    headers: [
      ['location', ziel],
      ['set-cookie', cookie(ANMELDUNG_COOKIE, '', 0)],
      ['cache-control', 'no-store'],
    ],
  })

/** Zurück auf die Anmeldeseite dieser Herkunft (Browser). */
export const fehlerZurSeite = (origin: string, fehler: AnmeldeFehler) => umleitung(`${origin}/?anmeldefehler=${fehler}`)

/** Zurück in die App (Android/Windows); die App prüft den state und zeigt den Text. */
export const fehlerZurApp = (app: AppAnmeldung, fehler: AnmeldeFehler) => umleitung(ruecksprungMit(app, { error: ANMELDEFEHLER_TEXT[fehler] }))
