// Meldungen nach einer gescheiterten Anmeldung. Der Server gibt nur einen festen Schlüssel weiter (?anmeldefehler=<schlüssel>),
// den Text wählt die App – so lässt sich über die Adresse kein beliebiger Text auf die Anmeldeseite bringen (Fund N10,
// docs/SICHERHEITSPRUEFUNG-V2.md). Server und App nutzen diese Datei gemeinsam (keine Importe über „@/“).

export const ANMELDEFEHLER_TEXT = {
  abgebrochen: 'Anmeldung abgebrochen.',
  anbieter: 'Der Anbieter hat die Anmeldung abgelehnt. Bitte noch einmal versuchen.',
  abgelaufen: 'Die Anmeldung ist abgelaufen oder wurde in einem anderen Browser begonnen. Bitte noch einmal anmelden.',
  gesperrt: 'Das Konto ist gesperrt. Bitte beim Admin melden.',
  ungueltig: 'Die Anmeldung war ungültig. Bitte noch einmal anmelden.',
  nicht_eingerichtet: 'Diese Anmeldung ist noch nicht eingerichtet.',
  zu_viele: 'Zu viele Anmeldeversuche von diesem Netz. Bitte in einigen Minuten noch einmal versuchen.',
  fehler: 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte noch einmal versuchen.',
} as const

export type AnmeldeFehler = keyof typeof ANMELDEFEHLER_TEXT

/** Text zu einem Schlüssel aus der Adresse; unbekannte Schlüssel ergeben den allgemeinen Text. */
export const anmeldeFehlerText = (schluessel: string): string =>
  Object.prototype.hasOwnProperty.call(ANMELDEFEHLER_TEXT, schluessel) ? ANMELDEFEHLER_TEXT[schluessel as AnmeldeFehler] : ANMELDEFEHLER_TEXT.fehler
