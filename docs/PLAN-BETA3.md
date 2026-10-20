# Plan Beta 3a

Stand: 20.10.2026, mit Simon abgestimmt. Cloud-Sitzungen, eine pro Paket, nacheinander.

## Paket 0 – Selbst-Update der Android-App (ohne Play Store)

Branch `beta3/selbst-update`. Ziel: Die APK aktualisiert sich selbst; Simon muss nicht mehr
jedes Mal die Release-Seite öffnen.

1. **Live-Update des Web-Teils** mit `@capgo/capacitor-updater` im manuellen Modus (keine
   Capgo-Cloud, keine Statistik). Der Web-Build erzeugt zusätzlich `updates/<commit>.zip`;
   `version.json` bekommt `bundleUrl` und `nativeVersion`. Die App prüft beim Start und etwa
   alle 3 Stunden (respektiert „nur WLAN“), lädt im Hintergrund, merkt das Paket für den
   nächsten Start vor; `notifyAppReady` nach gelungenem Start, sonst automatischer Rückfall
   (der Commit wird dann nicht erneut geladen). Angewendet wird nur, wenn `nativeVersion` zur
   installierten App passt.
2. **`nativeVersion`:** Zahl in `android/native-version.txt`, nur erhöhen, wenn sich `android/`,
   `capacitor.config.ts` oder Capacitor-/Capgo-Plugins ändern. Der Workflow „Prüfen“ lässt
   Pull Requests sonst durchfallen (`tools/pruefe-native-version.mjs`).
3. **Natives Update:** Ist `nativeVersion` der gehosteten Seite neuer → Hinweis „Neue
   App-Version“ mit „Jetzt installieren“; die App lädt die APK selbst (Fortschritt, Prüfsumme)
   und öffnet den Android-Installer (FileProvider, `REQUEST_INSTALL_PACKAGES`, Hinweis auf die
   einmalige Erlaubnis „Apps installieren“).
4. **APK ohne GitHub-Login:** Der Release-Workflow lädt die signierte APK zusätzlich in ein
   eigenes Cloudflare-Pages-Projekt (`wep-pankow-apk`: `/wep.apk`, `/apk.json`); Secrets
   `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`, ohne sie nur eine Warnung.
5. Der bisherige Hinweis „Zur Release-Seite“ entfällt. Im Browser/PWA bleibt alles wie bisher
   (dort aktualisiert der Service Worker).

Einmaliger Umstieg: Apps **vor** diesem Paket kennen weder Live-Update noch Selbst-Installation –
die erste APK mit diesem Paket muss noch per Hand installiert werden (Release-Seite), danach
nicht mehr. Anleitung: docs/ANDROID.md, Abschnitt „Selbst-Update“.

## Paket 1 – Icon, Kleinigkeiten, Status, Duplizieren

1. **App-Icon:** Klemmbrett mit Blatt, schlicht im App-Stil (weiß auf gedecktem Grün
   `--akzent` aus src/design/tokens.css, flach, keine Verläufe). Quelle als SVG im Repo;
   daraus Android-Launcher-Icons (adaptive Icon: Vorder-/Hintergrund, rund, alle Dichten,
   monochromes Themen-Icon), PWA-Icons (192/512, maskable), Favicon, Splash.
2. **Fehler „Rasengräser“:** Wer direkt nach dem Positionsnamen sucht („Rasen“), behält den
   Positionsnamen; gefundene Art nur, wenn der Suchbegriff eine Art/ein Synonym ist und
   nicht der Positionsname selbst (src/gruen/format.ts gefundeneArt/kurzeBezeichnung).
3. **Erinnerungswert:** Zustand „schlecht“ ergibt auch bei eigenen Positionen ohne
   Höchstwert 1,00 € (wie Katalog), weiterhin überschreibbar.
4. **Status je WEP:** in Arbeit (Standard) / fertig (manuell) / exportiert (automatisch
   nach Excel-Export, zurücksetzbar). In der Liste sichtbar und filterbar; wird mit
   abgeglichen.
5. **WEP duplizieren:** „⋯“ → „Duplizieren“ – komplette Kopie inkl. Formalien, Positionen,
   Beschreibungen, Beseitigung, Skizze; neue Vorgangs-Nr., Status „in Arbeit“.

## Paket 2 – Löschen überall mit Papierkorb, Konflikte sichtbar

1. **Löschen gilt auf allen Geräten:** Löschen verschiebt die Datei in OneDrive nach
   `daten/papierkorb/` (mit Löschzeitpunkt). Andere Geräte entfernen das WEP beim nächsten
   Abgleich ebenfalls (lokal in den Papierkorb). Ohne Konto: lokaler Papierkorb.
2. **Papierkorb-Ansicht** (über die WEP-Liste): Wiederherstellen (zurück nach `daten/`,
   auf allen Geräten wieder da) und „Endgültig löschen“ (mit Rückfrage). Automatisch
   endgültig gelöscht nach 30 Tagen.
3. **Sonderfall:** Wurde ein WEP auf einem anderen Gerät nach dem Löschzeitpunkt noch
   geändert, wird es nicht stillschweigend gelöscht, sondern als Konflikt gemeldet.
4. **Android-Hintergrund-Upload:** Einträge gelöschter WEPs aus der Warteschlange
   entfernen; ein Upload darf ein gelöschtes WEP nie wieder nach `daten/` schreiben.
5. **Konflikte sichtbar:** Statt still „neuere Fassung gewinnt“ ein Hinweis am WEP
   („auf zwei Geräten geändert“) mit Auswahl „Diese Fassung behalten“ / „Andere Fassung
   übernehmen“; bis zur Entscheidung gilt die neuere, die andere liegt als Konflikt-Kopie.
   Nach der Entscheidung wird die Konflikt-Kopie aufgeräumt.

## Paket 3 – Eigene Positionen merken

- Freitext-Positionen (Bezeichnung, Einheit, Preis, Abschnitt Außenanlagen/Aufwuchs) beim
  Hinzufügen optional „als eigene Position merken“ (Standard an).
- Sie erscheinen in der Suche mit Kennzeichnung „Eigene“, vor Katalogtreffern gleicher Güte.
- Verwaltung im Profil: Liste, ändern, löschen.
- Abgleich über `daten/eigene-positionen.json` (alle Geräte gleich; neuere Änderung je
  Eintrag gewinnt).

## Später (Beta 3b)

Fotos pro Position/WEP; Bau-Excel direkt aus OneDrive wählen und Formalien vorbefüllen.
