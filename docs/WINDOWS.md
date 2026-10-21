# Windows-Programm (W-1)

Die WEP-App als normales Windows-Programm: eigenes Fenster, Startmenü- und Desktop-Symbol,
läuft offline. Gebaut mit **Tauri 2** (Code unter `src-tauri/`, Plan: `docs/PLAN-EXE.md`).
Die Oberfläche ist dieselbe Web-App wie im Browser und in der Android-App; neu sind nur die
Teile, die ein Browser nicht kann (Anmeldung über den Standardbrowser, „Speichern unter…“,
Updates). **Web-App und Android-App verhalten sich dadurch nicht anders.**

## Für Anwender: Installation

1. Installer holen: `https://wep-pankow-apk.pages.dev/windows/wep-setup.exe` im Browser öffnen
   (ohne Anmeldung) oder auf GitHub → **Releases** → neuestes „WEP Windows …“ (GitHub-Anmeldung
   nötig, das Repo ist privat).
2. `wep-setup.exe` starten. Windows zeigt **„Der Computer wurde durch Windows geschützt“**
   (SmartScreen), weil das Programm noch nicht mit einem Windows-Zertifikat signiert ist:
   **„Weitere Informationen“** → **„Trotzdem ausführen“**. Das ist nur beim Installieren nötig.
3. Der Installer braucht **keine Administratorrechte**: er legt das Programm in das eigene
   Benutzerprofil (`%LOCALAPPDATA%\WEP`) und erzeugt Startmenü-Eintrag und Desktop-Symbol.
   Fehlt die Windows-Komponente *WebView2* (Windows 11 und aktuelle Windows 10 haben sie), lädt
   der Installer sie nach – dafür einmalig Internet.
4. WEP starten, **Mit Microsoft anmelden** (Browser öffnet sich) oder **Ohne Konto fortfahren**.
   Die Daten liegen auf dem PC (Browser-Speicher von WebView2); mit Konto zusätzlich in OneDrive,
   Ordner `Apps/WEP-App`, wie in der Web-App.

Deinstallieren: Windows-Einstellungen → Apps → WEP. Dabei fragt der Installer, ob die App-Daten
gelöscht werden sollen – **ohne OneDrive-Konto sind sie danach weg** (vorher *Profil → Sicherung*).

## Was anders ist als im Browser

| | Browser/PWA | Windows-Programm |
|---|---|---|
| Anmeldung | MSAL.js, Weiterleitung zu Microsoft | Standardbrowser + PKCE, Rücksprung über `http://localhost:<Port>` |
| Anmeldedaten | Browser-Speicher | Refresh-Token in der **Windows-Anmeldeinformationsverwaltung** (nicht im Klartext, nicht im Browser-Speicher) |
| Excel-Export, Sicherung, Foto-ZIP | Download in den Download-Ordner | Windows-Dialog **„Speichern unter…“**; Excel mit Konto **zusätzlich** nach OneDrive (`Exporte/`) |
| Offline-Start | Service Worker | Dateien liegen im Programm (kein Service Worker) |
| Updates | Service Worker | Live-Update des Web-Teils + Programm-Update (siehe unten) |

Nicht vorhanden (nur Android): Hintergrund-Upload, „Upload nur über WLAN“, Upload-Protokoll.

## Updates

| Was ändert sich? | Weg | Was passiert |
|------------------|-----|--------------|
| nur der Web-Teil (fast immer) | **Live-Update** | still im Hintergrund, wirkt beim **nächsten Start** |
| das Programm (`src-tauri/`) | **Neue .exe** | Hinweis „Neue App-Version – Jetzt installieren“ (Profil → Über die App) |

### Live-Update (Web-Teil, ohne neue .exe)

- Jeder Web-Build (Cloudflare, bei jedem Merge auf `main`) legt `https://wep-pankow.pages.dev/updates/<commit>.zip`
  ab und schreibt `version.json` (`commit`, `bundleUrl`, `bundleSha256`, `windowsHuelle`, …) – dasselbe Paket wie
  bei der Android-App (`docs/ANDROID.md`).
- Das Programm prüft **beim Start** (höchstens alle 15 Minuten) und danach alle ~3 Stunden
  (`src/windows/updateDienst.ts`). Ist der Commit neu **und** `windowsHuelle` gleich der des
  Programms, lädt es das Paket (`src-tauri/src/webupdate.rs`): nur von `wep-pankow.pages.dev/updates/`,
  **SHA-256 wird geprüft**, Entpacken nach `%LOCALAPPDATA%\de.wep.app\web\<commit>\` (Pfade aus dem Zip werden
  geprüft), Vormerken für den nächsten Start.
- Beim nächsten Start liefert das Programm den Web-Teil aus diesem Ordner statt aus der .exe – unter
  **demselben Ursprung**, die Daten (IndexedDB) bleiben also erhalten.
- **Rückfall:** Die Oberfläche meldet nach dem Aufbau „Start gelungen“ (`web_start_gemeldet`). Kommt die
  Meldung nicht binnen 20 Sekunden (weißer Bildschirm, Absturz) – oder war schon der vorige Start ohne Meldung –,
  sperrt das Programm den Commit, lädt die Seite neu und liefert wieder den Web-Teil aus der .exe. Der
  gesperrte Commit wird nicht erneut geladen; ein späterer wird wieder versucht.
- Ein Paket für eine **andere Hülle** (`windowsHuelle`) wird nie angewendet. Ist die gehostete Nummer höher,
  zeigt die App „Neue App-Version“.

### Neue .exe (Tauri-Updater)

- Das Programm fragt `https://wep-pankow-apk.pages.dev/windows/latest.json` ab. Ist die Version dort höher
  als die installierte, erscheint der Hinweis; **Jetzt installieren** lädt `wep-setup.exe`, prüft die
  **Signatur mit dem Update-Schlüssel** und startet den Installer (passiv, ohne Admin-Rechte); das Programm
  startet danach wieder.
- Die Signatur ist die des **Tauri-Updaters** (eigener Schlüssel, siehe unten) – keine Windows-Code-Signatur.
  Die SmartScreen-Warnung beim ersten Installieren bleibt, bis es ein Windows-Zertifikat gibt (Plan: später).

### Zwei Nummern (wie `native-version` bei Android)

- **Programmversion** `version` in `src-tauri/tauri.conf.json` (und gleich in `src-tauri/Cargo.toml`).
  Muss bei **jeder** Änderung unter `src-tauri/` steigen – der Workflow **Prüfen** lässt Pull Requests sonst
  durchfallen (`node tools/pruefe-windows-version.mjs origin/main`).
- **Hüllen-Nummer** `src-tauri/huelle-version.txt` (ganze Zahl). **Erhöhen**, wenn der Web-Teil eine Funktion
  des Programms braucht, die ältere Programme nicht haben (neuer Rust-Befehl, geänderte Argumente). Dann
  wendet kein altes Programm das neue Web-Paket an, sondern meldet „Neue App-Version“. Vite schreibt sie als
  `windowsHuelle` in `version.json`, `build.rs` baut sie in das Programm ein.

## Einrichtung (einmalig, für Simon)

### 1. Azure: Umleitung `http://localhost` ergänzen

Die Anmeldung im Windows-Programm schickt Microsoft nach dem Login an `http://localhost:<Port>` zurück.
Der Port wechselt bei jeder Anmeldung; Microsoft vergleicht bei `localhost` **nur den Host, nicht den Port**.
Dafür muss in der bestehenden App-Registrierung (dieselbe wie für Web und Android, siehe `docs/SYNC.md`)
eine zusätzliche Plattform eingetragen werden:

1. <https://entra.microsoft.com> öffnen und mit dem **privaten Microsoft-Konto** anmelden (das, mit dem die
   App-Registrierung „WEP-App“ angelegt wurde).
2. Links **Identität → Anwendungen → App-Registrierungen** (*Identity → Applications → App registrations*) →
   Reiter **Alle Anwendungen** → **WEP-App** anklicken.
3. Links **Verwalten → Authentifizierung** (*Manage → Authentication*).
4. Hast du die Android-Plattform schon angelegt (Abschnitt „Mobil- und Desktopanwendungen“ mit
   `de.wep.app://auth`): dort auf **URI hinzufügen** klicken. Sonst oben **Plattform hinzufügen** →
   **Mobil- und Desktopanwendungen** (*Mobile and desktop applications*).
5. Bei den Umleitungs-URIs **benutzerdefinierter Umleitungs-URI** genau
   `http://localhost` eintragen – **ohne Port, ohne Schrägstrich am Ende, mit `http` (nicht `https`)**.
   (Windows-Anmeldung im Browser testen: der Port taucht später in der Adresszeile auf, das ist richtig.)
6. **Konfigurieren** bzw. **Speichern** klicken.
7. Weiter unten auf der Seite unter **Erweiterte Einstellungen** (*Advanced settings*) den Schalter
   **Öffentliche Clientflows zulassen** (*Allow public client flows*) auf **Ja** (steht schon so, wenn die
   Android-App eingerichtet wurde) → oben **Speichern**.
8. Die SPA-Umleitung der Web-App (`https://wep-pankow.pages.dev/`) und `de.wep.app://auth` bleiben unverändert.
   Die Client-ID ist dieselbe wie bisher (Repository-Variable `VITE_MS_CLIENT_ID`).

Probe: Programm starten → Profil/Login → **Mit Microsoft anmelden** → der Standardbrowser öffnet Microsoft →
nach dem Zustimmen erscheint eine Seite „Anmeldung abgeschlossen“ → das Programm ist angemeldet. Kommt
stattdessen die Microsoft-Fehlermeldung `AADSTS50011` („The redirect URI … does not match“), fehlt der Eintrag
`http://localhost` oder steht dort ein Port/Schrägstrich.

### 2. GitHub: Client-ID (falls noch nicht geschehen)

*Settings → Secrets and variables → Actions → Variables*: `VITE_MS_CLIENT_ID` = Client-ID (wie bei Android).
Ohne sie baut das Programm, hat aber keinen Login.

### 3. Update-Schlüssel einrichten (einmalig)

Programm-Updates werden mit einem eigenen Schlüssel signiert; das Programm prüft die Signatur, bevor es
einen Installer startet. Den Schlüssel erzeugt ein Workflow, wie beim Android-Schlüssel:

1. GitHub → **Actions** → **Windows-Schlüssel erzeugen** → *Run workflow*. (Nur einmal! Ein zweiter
   Schlüssel passt nicht zu bereits installierten Programmen – die müssten neu installiert werden.)
2. Nach dem grünen Lauf: auf der Seite des Laufs steht unter **Summary** der **öffentliche Schlüssel**;
   unten bei **Artifacts** `wep-windows-schluessel` herunterladen und entpacken. Darin: `wep-windows.key`
   (geheimer Schlüssel), `wep-windows.key.pub` (öffentlich) und `zugangsdaten.txt` (alles zum Kopieren).
   Das Passwort steht **nicht** im Log.
3. **Settings → Secrets and variables → Actions**:
   - Reiter **Secrets → New repository secret** (Name genau so, Wert aus `zugangsdaten.txt`, eine Zeile,
     ohne Leerzeichen/Zeilenumbruch):
     - `TAURI_SIGNING_PRIVATE_KEY` – der lange Text unter „TAURI_SIGNING_PRIVATE_KEY“
     - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` – das Passwort
   - Reiter **Variables → New repository variable**:
     - `TAURI_SIGNING_PUBLIC_KEY` – der öffentliche Schlüssel (nicht geheim; steht auch in der Summary)
4. **Sicherung:** `wep-windows.key` und `zugangsdaten.txt` an einem sicheren Ort ablegen (Passwortmanager,
   nicht im Repo, nicht in OneDrive-Freigaben). GitHub Secrets lassen sich nicht wieder auslesen. Geht der
   Schlüssel verloren, erkennen installierte Programme neue Installer nicht mehr – sie müssen einmal von Hand
   neu installiert werden (die Daten bleiben beim Drüberinstallieren erhalten).
5. **Artefakt löschen:** am Lauf unter *Artifacts* beim Eintrag `wep-windows-schluessel` auf den Papierkorb
   klicken (GitHub löscht es sonst nach 1 Tag). Lokale Kopie nach der Sicherung aus dem Download-Ordner entfernen.

### 4. Cloudflare (für Selbst-Update und feste Download-Adresse)

Dasselbe Cloudflare-Projekt wie für die APK: **`wep-pankow-apk`**, mit denselben Secrets
`CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` (Einrichtung in `docs/ANDROID.md`, Abschnitt
„APK ohne GitHub-Login“). Nichts Neues anzulegen.

Ein Cloudflare-Deploy ersetzt immer die **ganze** Seite. Darum holt jeder der beiden Workflows
(*Android Release* und *Windows Release*) vor dem Deploy die Dateien des anderen von der Live-Seite und
nimmt sie mit (`tools/apk-site.mjs`, Prüfsumme wird kontrolliert; Fehler brechen den Upload ab, statt
etwas zu löschen). Die Seite enthält danach:

- `/wep.apk`, `/apk.json` (Android)
- `/windows/wep-setup.exe` (feste Installer-Adresse), `/windows/latest.json` (Tauri-Updater),
  `/windows/windows.json` (Version und SHA-256 des Installers)

### 5. Erster Release

Der Workflow **Windows Release** läuft bei einer Änderung unter `src-tauri/` auf `main` (also auch beim
Merge des Pull Requests, der das Programm einführt) und von Hand (*Run workflow*). Ohne die Schlüssel aus
Schritt 3 bricht er sofort mit „Windows-Schlüssel fehlt“ ab – dann Schritt 3 erledigen und den Workflow
von Hand starten.

## Für Entwickler

```bash
npm ci
npm run windows:bauen        # Web-Build + Installer (auf Windows; braucht Rust und Node)
npm run tauri -- dev         # Fenster mit Dev-Server (npm run dev wird gestartet)
cd src-tauri && cargo test   # Rust-Tests (Loopback-Server, Zip-Entpacken, Rückfall, Tresor …)
npm run icons:windows        # Icons neu erzeugen, nach Änderung an resources/icon.svg
```

### Workflows

| Workflow | Wann | Was |
|----------|------|-----|
| **Windows Test-Build** | Push auf Branches ≠ `main`, die `src-tauri/` ändern; von Hand | `cargo test`, unsignierter Installer als Artefakt `wep-windows-test` (30 Tage) |
| **Windows Release** | Push auf `main`, der `src-tauri/` ändert; von Hand | Signierter Installer → GitHub Release `windows-v<Version>` + Cloudflare `/windows/` |
| **Windows-Schlüssel erzeugen** | nur von Hand, einmalig | Update-Schlüssel (siehe oben) |
| **Prüfen** | Pull Requests | u. a. Versionsregel für `src-tauri/` |

Windows-Minuten zählen bei privaten Repos doppelt – darum bauen die Windows-Workflows nur bei Änderungen
unter `src-tauri/` (oder von Hand). Reine Web-Änderungen erreichen das Programm per Live-Update.

### Aufbau von `src-tauri/`

| Datei | Aufgabe |
|-------|---------|
| `tauri.conf.json` | Fenster, Installer (NSIS, `currentUser`, Deutsch), Updater-Adresse, CSP |
| `huelle-version.txt` | Hüllen-Nummer (siehe oben) |
| `src/anmeldung.rs` | Loopback-Server auf `127.0.0.1:<freier Port>`, Standardbrowser öffnen, Token-Anfragen an Microsoft (nur `login.microsoftonline.com/consumers`, ohne Origin-Header) |
| `src/tresor.rs` | Anmeldedaten in der Windows-Anmeldeinformationsverwaltung (große Daten auf mehrere Einträge verteilt) |
| `src/speichern.rs` | „Speichern unter…“-Dialog, Datei roh (ohne Base64) übernehmen |
| `src/webupdate.rs` | Live-Update: laden, prüfen, entpacken, ausliefern (`LiveAssets`), Rückfall |
| `src/programm.rs` | Tauri-Updater (neue .exe) |
| `capabilities/default.json` | Hauptfenster: nur `core:default`; die eigenen Befehle brauchen keine Plugin-Rechte |

Oberfläche: `src/windows/` (Brücke `api.ts`, Update-Entscheidung `update.ts`, Ablauf `updateAblauf.ts`,
Dienst `updateDienst.ts`), `src/konto/windows.ts` (Anmeldung), `src/app/dateiSpeichern.ts` (Speichern-Weiche),
`src/app/updateModul.ts` (wählt Android- oder Windows-Update-Dienst).

## Fehlersuche

- **„Der Computer wurde durch Windows geschützt“:** siehe Installation, Schritt 2.
- **Anmeldung: `AADSTS50011` / „redirect URI does not match“:** Azure-Eintrag `http://localhost` fehlt oder ist
  falsch geschrieben (Abschnitt 1). **`AADSB…`/„invalid_client“:** „Öffentliche Clientflows zulassen“ auf *Ja*.
- **Anmeldung: Browser öffnet sich, aber das Programm wartet:** Firewall/Sicherheitsprogramm blockiert
  `localhost`? Nach 5 Minuten bricht die Anmeldung mit „Zeitüberschreitung“ ab; erneut versuchen.
- **Nach dem Anmelden verlangt die App sofort wieder die Anmeldung:** Der Credential Manager ließ sich nicht
  lesen; *Windows-Anmeldeinformationsverwaltung → Windows-Anmeldeinformationen* prüfen (Einträge `anmeldung-…`
  zu `de.wep.app`). Abmelden und neu anmelden löscht und schreibt sie neu.
- **„Programm-Update nicht eingerichtet“:** Das Programm wurde ohne `TAURI_SIGNING_PUBLIC_KEY` gebaut (z. B. ein
  Test-Build) – nur Release-Builds prüfen Programm-Updates. Live-Updates des Web-Teils funktionieren trotzdem.
- **Update hängt:** *Profil → Über die App* zeigt Commit, Hüllen-Nummer und das Ergebnis der letzten Prüfung;
  „Nach Update suchen“ prüft sofort. Zurücksetzen des Live-Updates: Ordner `%LOCALAPPDATA%\de.wep.app\web\`
  löschen (das Programm liefert dann den Web-Teil der .exe).
- **Daten:** liegen im WebView2-Profil unter `%LOCALAPPDATA%\de.wep.app\EBWebView\`. Beim Deinstallieren wird
  gefragt, ob sie gelöscht werden.

## Grenzen (Stand der Umsetzung)

- Der Windows-Build und die Rust-Tests laufen im Workflow „Windows Test-Build“; **Anmeldung gegen Microsoft,
  Installer und Updates wurden noch nicht auf einem echten Windows-PC ausprobiert.** Checkliste im Pull Request.
- Keine Windows-Code-Signatur (SmartScreen-Warnung beim Installieren), kommt mit dem BV-Vorhaben.
- Nur Windows 10/11, 64 Bit (x86_64).
- Ein Live-Update wirkt erst beim **nächsten Start** (kein automatischer Neustart).
- Offen für später (BV-Vorhaben): Code-Signatur, Verteilung an viele Rechner, Bau-Teil, gemeinsamer Speicher,
  Recht/Datenschutz, Preis- und Supportmodell (siehe `docs/PLAN-EXE.md`).
