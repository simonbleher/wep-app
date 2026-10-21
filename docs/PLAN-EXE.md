# Plan Windows-Programm (.exe)

Stand: 21.10.2026, mit Simon abgestimmt. Eine Cloud-Sitzung, Branch `exe/tauri`.
Das größere Vorhaben (Produkt für den BV Pankow mit Bau-Teil, mehreren Nutzern, Recht,
Verkauf) wird ab ca. 28.10.2026 separat geplant – hier nur die .exe.

## Entscheidungen

- **Tauri 2** (Windows-WebView2, klein) statt Electron. Code unter `src-tauri/`.
- **Keine Code-Signatur vorerst:** Die Windows-Warnung „Der Computer wurde durch Windows
  geschützt“ wird einmal weggeklickt. Signatur (z. B. Microsoft Trusted Signing) kommt mit dem
  BV-Vorhaben.
- Funktionen wie die Web-App am PC, nichts zusätzlich.

## Umfang

1. **Programm:** eigenes Fenster, Startmenü und Desktop-Symbol (Icon aus `resources/icon.svg`),
   Installer (NSIS, Installation ohne Admin-Rechte ins Benutzerprofil), läuft offline.
2. **Anmeldung mit Microsoft** wie in der Android-App: System-Browser + PKCE, Rücksprung über
   `http://localhost:<Port>` (Loopback). Azure: Plattform „Mobile und Desktop“ um
   `http://localhost` ergänzen – Anleitung für Simon in docs/WINDOWS.md. Refresh-Token sicher
   speichern (Windows-Anmeldeinformationsverwaltung, nicht im Klartext).
3. **Dateien:** Excel-Export, Sicherung und Foto-ZIP über den Windows-Dialog „Speichern
   unter…“ (an `src/app/dateiSpeichern.ts` anschließen); mit Konto geht der Export zusätzlich
   nach OneDrive wie bisher.
4. **Updates ohne Handarbeit:**
   - Der Web-Teil soll sich wie in der Android-App ohne neue .exe aktualisieren (z. B. Prüfung
     von `version.json` und Laden des Pakets `updates/<commit>.zip`, Rückfall bei Fehlstart),
     damit nicht jeder Merge einen Windows-Build braucht.
   - Das Programm selbst über den Tauri-Updater: signierte Update-Datei (Tauri-Schlüssel, nicht
     Windows-Signatur) und `latest.json` auf dem Cloudflare-Projekt `wep-pankow-apk` unter
     `/windows/`. Schlüssel per Workflow erzeugen wie beim Android-Schlüssel, als GitHub-Secrets.
5. **Build:** Workflow „Windows Release“ (windows-latest) **nur**, wenn sich `src-tauri/` oder
   eine Versionsnummer dafür ändert, oder von Hand – Windows-Minuten zählen bei privaten Repos
   doppelt. Zusätzlich ein Test-Build für Branches, die `src-tauri/` ändern.
6. **Doku:** docs/WINDOWS.md (Installation, Warnung wegklicken, Azure-Schritt, Updates,
   Fehlersuche), TASKS.md, ENTSCHEIDUNGEN.md.

## Offen für später (BV-Vorhaben)

Code-Signatur, Verteilung an viele Rechner, Bau-Teil, gemeinsamer Speicher, Recht/Datenschutz,
Preis- und Supportmodell.
