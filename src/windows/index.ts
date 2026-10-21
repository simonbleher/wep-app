// Start der Windows-Funktionen (nur im Windows-Programm, wird von main.tsx nachgeladen):
// Update-Prüfung für den Web-Teil (Live-Update) und das Programm selbst.
import { starteAutomatik } from './updateDienst'

export function startWindows(): void {
  starteAutomatik()
}
