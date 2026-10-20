# Plan Beta 3

Stand: 20.10.2026, mit Simon abgestimmt. Cloud-Sitzungen, eine pro Paket, nacheinander.

**Beta 3a (Pakete 0–3) abgeschlossen am 20.10.2026** – #39–#44. Ab jetzt kommen Updates
über das Selbst-Update auf die Android-Geräte.

# Beta 3a

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

# Beta 3b

Mit Simon abgestimmt am 20.10.2026. Gleiche Arbeitsweise wie 3a. Für alle Pakete gilt:
- Ändert sich `android/`, `capacitor.config.ts` oder ein Capacitor-Plugin → `android/native-version.txt`
  erhöhen (der Workflow „Prüfen“ achtet darauf); sonst kommt das Paket als Live-Update.
- Alles, was in OneDrive liegt, folgt den Regeln aus Paket 2 (Papierkorb, keine stillen Verluste).
- Testdaten nur erfunden, Fotos nur selbst erzeugte Testbilder.

## Paket 4 – Fotos

1. **Aufnehmen:** Fotos an einer **Position** (z. B. Baum, Mangel) und am **WEP allgemein**
   (Gesamtansicht). Kamera direkt in der App oder aus der Galerie, mehrere auf einmal. Kurzer
   optionaler Text je Foto.
2. **Klein halten:** Beim Speichern verkleinern (längste Seite ca. 2000 px, JPEG, Ziel ca.
   300–500 KB), Ausrichtung (EXIF) korrigieren, Standortdaten entfernen. 5–50 Fotos je WEP
   müssen flüssig gehen (Vorschaubilder, nicht alles auf einmal laden).
3. **Speichern und Abgleich:** lokal in IndexedDB; in OneDrive unter `daten/fotos/<Vorgangs-Nr>/`.
   Upload nur im WLAN (Einstellung „nur WLAN“), auch im Android-Hintergrunddienst; offene
   Fotos zählen in der Upload-Anzeige. Andere Geräte laden Vorschaubilder/Fotos beim Öffnen
   des WEP nach (nicht alle Fotos aller WEPs auf jedes Gerät).
4. **Löschen:** Foto löschen mit Rückfrage; ein WEP im Papierkorb nimmt seine Fotos mit
   (Wiederherstellen bringt sie zurück, endgültig löschen entfernt sie). Duplizieren kopiert
   die Fotos nicht (Rückfrage? → Entscheidung in ENTSCHEIDUNGEN.md: Standard „ohne Fotos“).
5. **Export:** Beim Excel-Export zusätzlich Ordner `Exporte/<Vorgangs-Nr>_Fotos/` mit
   sprechenden Dateinamen (z. B. `03 Apfelbaum.jpg`, `00 Gesamtansicht 1.jpg`), Nummer =
   Positionsnummer im WEP. Nicht in die Excel-Datei. Im Browser ohne Konto: Fotos als ZIP
   neben der Excel herunterladen.

## Paket 5 – Bau-Excel am WEP, Formalien vorbefüllen

1. **Bau-Excel wählen** über die Dateiauswahl des Systems (auf Android erscheint dort auch
   die OneDrive-App bzw. der Download-Ordner, wenn die Datei per E-Mail kam). Keine neuen
   Microsoft-Rechte. Möglich beim Anlegen („Neues WEP aus Bau-Excel“) und später am WEP.
2. **Am WEP merken:** Die Bau-Excel bleibt beim WEP (lokal + `daten/bau/<Vorgangs-Nr>.xlsx`),
   der Export nimmt sie automatisch; austauschen und entfernen möglich. Papierkorb wie Fotos.
3. **Formalien vorbefüllen:** Alles, was in der Bau-Excel ausgefüllt ist, in die Formalien
   übernehmen (Zellen laut docs/ARCHITEKTUR.md). Schon ausgefüllte Felder im WEP nicht
   still überschreiben: Liste „Bau-Excel sagt … / im WEP steht …“ mit Auswahl je Feld.
   Neue Bau-Excel (ausgetauscht) → derselbe Abgleich.
4. **Skizzen-Überschrift:** In der Export-Kopie die Überschrift des Blatts „Skizze
   Außenanlage-Aufwuchs“ prüfen; steht dort „Baulichkeiten“, passend ersetzen (Wortlaut im PR
   zeigen, Simon bestätigt). `docs/WEP_Vorlage.xlsx` bleibt unverändert.

## Paket 6 – Liste und Alltag

1. **Suche** in der WEP-Liste (Vorgangs-Nr., Anlage, Parzelle, Pächter, Ort), zusammen mit dem
   Status-Filter aus Paket 1; Sortierung (zuletzt geändert / Nummer).
2. **Problempflanzen:** Arten, die laut Richtlinie bzw. Berliner Praxis zu entfernen sind
   oder Probleme machen (z. B. Japanischer Staudenknöterich) – Liste aus docs/Richtlinie.pdf
   und der vorhandenen Invasiv-Liste prüfen/ergänzen; Hinweis mit Vorschlag „Beseitigung“
   (nur warnen, nie sperren). Quelle je Eintrag in der Datenliste vermerken.
3. **Sicherung als Datei:** Profil → „Sicherung erstellen“ (eine Datei mit allen WEPs,
   Papierkorb, eigenen Positionen, Profil; Fotos und Bau-Excel optional) und „Sicherung
   einspielen“ (Vorschau, was neu/geändert ist; nichts still überschreiben).
4. **Sonnen-Kontrast:** Schalter im Profil (Geräte-Einstellung): kräftigere Linien und Texte,
   größere Schrift; an den bestehenden Design-Tokens, Rest des Designs unverändert.

## Paket 7 – Skizze bedienen

1. **Zoomen/Verschieben** mit zwei Fingern (und Mausrad/Ziehen am PC), „Ganze Skizze“-Knopf.
2. **Einrasten:** Kanten und Ecken an benachbarten Formen und am Grundstücksrand, gerade
   Linien (0/90/45°); abschaltbar.
3. **Leichter auswählen:** größere Greifflächen für kleine Formen, Auswahl kleiner Formen
   unter großen (z. B. Pfosten auf Grundstück), Antippen wechselt bei Überlagerung durch.
4. Export der Skizze (Excel-Formen) muss unverändert stimmen – bestehende Export-Tests grün.

## Reihenfolge

4 → 5 → 6 → 7, eine Sitzung je Paket. 6 und 7 berühren getrennte Bereiche und könnten
notfalls parallel laufen.
