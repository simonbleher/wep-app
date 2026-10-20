// Schnittstelle des Konto-Moduls. Der Rest der App (src/sync, Oberfläche) kennt nur
// diese Schnittstelle – nicht MSAL und nicht die Android-Anmeldung. Jede Plattform
// liefert eine eigene Umsetzung:
// - Web: web.ts (MSAL.js, Weiterleitung zu Microsoft)
// - Android (später, Beta 2 Schritt 3): System-Browser + PKCE mit App-Rücksprung

/** Das angemeldete Microsoft-Konto, soweit die App es anzeigt. */
export interface Konto {
  /** Anzeigename (kann leer sein). */
  name: string
  /** Anmeldename, meist die E-Mail-Adresse. */
  benutzername: string
}

export interface KontoDienst {
  /** Ist die Anmeldung auf dieser Plattform eingerichtet (z. B. Client-ID gesetzt)? */
  verfuegbar(): boolean
  /** Startet die Anmeldung. Im Web verlässt die Seite dafür kurz die App. */
  anmelden(): Promise<void>
  abmelden(): Promise<void>
  /** Angemeldetes Konto oder null. Funktioniert auch offline (lokaler Zwischenspeicher). */
  aktuellesKonto(): Promise<Konto | null>
  /** Gültiges Zugriffstoken für OneDrive; wirft einen Fehler, wenn nicht angemeldet. */
  zugriffstoken(): Promise<string>
}
