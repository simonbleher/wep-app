// Verständliche Meldungen für Anmeldefehler. Wichtigster Fall bei Geschäftskonten: Die Organisation erlaubt Mitarbeitenden
// nicht, Apps selbst zuzustimmen (AADSTS65001 / AADSTS90094) – dann muss die IT einmal eine Administratorzustimmung geben.

const ZUSTIMMUNG = /AADSTS65001|AADSTS90094|AADSTS90008|consent_required|admin_consent_required|Administratorgenehmigung|admin approval/i

export function anmeldeFehlerText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e)
  if (ZUSTIMMUNG.test(text)) {
    const code = /AADSTS\d+/.exec(text)?.[0]
    return (
      'Deine Organisation erlaubt nicht, dass du der WEP-App selbst zustimmst. Bitte die IT, einmal eine Administratorzustimmung ' +
      'für die App „WEP-App“ zu erteilen (Microsoft Entra → Unternehmensanwendungen → WEP-App → Berechtigungen). ' +
      `Danach klappt die Anmeldung.${code ? ` (Fehler ${code})` : ''}`
    )
  }
  return text
}
