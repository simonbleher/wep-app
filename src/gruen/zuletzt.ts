// localStorage-Verwaltung für zuletzt verwendete Katalog-IDs.
//
// Wird in der Schnellsuche genutzt, um dem Wertermittler auf der Parzelle
// die häufig verwendeten Positionen direkt anzubieten (ohne Tippen).

const MAX_EINTRAEGE = 10
const LS_KEY = 'wep-zuletzt-verwendet'

/**
 * Merkt eine Katalog-ID als „zuletzt verwendet". Die ID wandert an den Anfang
 * der Liste, ältere Einträge rutschen nach hinten; die Liste ist auf
 * MAX_EINTRAEGE begrenzt. Fehler (kein localStorage) werden still ignoriert.
 */
export function merkeZuletztVerwendet(id: string): void {
  try {
    const liste = ladeZuletztVerwendet()
    const aktualisiert = [id, ...liste.filter((i) => i !== id)].slice(0, MAX_EINTRAEGE)
    localStorage.setItem(LS_KEY, JSON.stringify(aktualisiert))
  } catch {
    // localStorage nicht verfügbar (z. B. in Tests / SSR) – ignorieren
  }
}

/**
 * Lädt die zuletzt verwendeten Katalog-IDs aus dem localStorage.
 * Gibt ein leeres Array zurück, wenn noch keine vorhanden sind oder localStorage
 * nicht verfügbar ist.
 */
export function ladeZuletztVerwendet(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}
