# Plan Beta 2 – abgeschlossen ✅

Stand: 20.10.2026, mit Simon abgestimmt. Gebaut wird lokal mit Claude Code, **ein Schritt
pro Sitzung**, jede Sitzung beginnt mit `git checkout main && git pull`.

## Ziele (Simons Punkte)

1. **KI-Funktionen abschalten** – zweitrangig, Code bleibt, Schalter `KI_AKTIV` (aus).
2. **Design: sehr schlicht und clean, wie eine echte App** – Schwarz/Grau/Weiß, eine
   ruhige Akzentfarbe, Rot nur für Warnungen; keine Emojis, wenige Strich-Icons, lieber
   Text; keine Verläufe/Schatten-Spielereien/bunten Karten; Listen mit dünnen Trennlinien
   (wie Handy-Einstellungen); Systemschrift, wenige Größen, viel Weißraum.
   Draußen-tauglich: Berührflächen ≥ 48 px, Eingaben ≥ 16 px Schrift, volle kontrastreiche
   Flächen (keine Transparenz), Mobile-Grundregeln (kein Zoom beim Tippen, kein
   Tipp-Blitz, `100dvh`, Safe Areas). **Erst Entwürfe für 3 Bildschirme** (WEP-Liste,
   Erfassung Aufwuchs, Position hinzufügen) → Simons Freigabe → Umbau.
3. **Android-App (APK) mit Offline-Betrieb und Hintergrund-Upload nur über WLAN**
   - Capacitor um die bestehende App (eine Code-Basis).
   - Jede Speicherung legt die WEP-Datei in eine Upload-Warteschlange auf dem Gerät.
   - Nativer Android-Hintergrunddienst (WorkManager, Bedingung „nur WLAN“ bzw. laut
     Geräte-Einstellung) lädt die Warteschlange nach OneDrive – auch bei geschlossener App.
     Lädt nur hoch, überschreibt nie eine neuere Fassung (eTag/If-Match); Konflikte und
     Download erledigt die App beim Öffnen.
   - Anmeldung in der APK über System-Browser + PKCE mit App-Rücksprung
     (z. B. `de.wep.app://auth`, Azure-Plattform „Mobil/Desktop“ ergänzen); Langzeit-Token
     sicher gespeichert, damit der Hintergrunddienst ohne App hochladen kann.
   - Verteilung ohne Play Store: GitHub Actions baut signierte APK als Release; App zeigt
     „Update verfügbar“.
   - Kein iPhone/iPad. Windows: installierte Web-App (Edge/Chrome) reicht, keine .exe.
4. **OneDrive-Ordner, Login, Profil**
   - App-Ordner bleibt `Apps/WEP-App` (ein „.“ versteckt unter Windows/OneDrive-Web nichts).
     Struktur: `daten/` (App-Dateien, inkl. `profil.json`), `Exporte/` (fertige Excel-Dateien),
     `LIESMICH.txt` („bitte nicht bearbeiten“). Vorhandene Dateien im App-Ordner werden
     beim ersten Abgleich nach `daten/` verschoben.
   - Login-Bildschirm beim ersten Start: „Mit Microsoft anmelden“; darunter klein und
     unauffällig „Ohne Konto fortfahren (nur auf diesem Gerät)“. Spätere Anmeldung
     gleicht die lokalen WEPs ab. Danach startet die App direkt, auch offline.
   - Profil/Einstellungen: Name (wird Wertermittler im WEP), Rolle (Grün / Bau / beides –
     vorerst nur gespeichert), Standard-Kleingartenanlage, Upload nur über WLAN
     (Standard an, pro Gerät), Konto/Abmelden, App-Version, „Nach Update suchen“,
     Speicherort. Profil in OneDrive (`daten/profil.json`), Geräte-Einstellungen lokal.

## Reihenfolge

| Schritt | Inhalt | Stand |
|---|---|---|
| 1 | KI abschalten | ✅ #28 |
| 2 | Login-Bildschirm, Profil, Ordnerstruktur, Konto-Modul (Web) | ✅ #29, #30 |
| 3 | Test-APK: Anmeldung per System-Browser + Hintergrund-Upload nur WLAN auf Simons Tablet | ✅ #31, auf dem Tablet getestet |
| 4 | Design: Entwürfe → Freigabe → Umbau | ✅ #32, #33, #34 |
| 5 | Fertige APK: Hintergrund-Upload, automatischer Build, Update-Hinweis | ✅ #35, #36 – erstes Release „WEP 0.1.0 (4)“ |

**Beta 2 abgeschlossen am 20.10.2026.** Offen bleibt nur die Bestätigung des Update-Hinweises
auf dem Gerät (erscheint beim ersten Merge nach Installation von Release 4).

## Ideen für später (nicht in Beta 2)

- Kleinigkeiten: „Rasen“ wird zu „Rasengräser“; eigene Pflanze „schlecht“ = 0 € statt 1 €?;
  Problempflanzen-Liste (z. B. Japanischer Staudenknöterich); Vorlagen-Überschrift
  „Skizze – Baulichkeiten“ auf beiden Skizzen-Blättern.
- Bau-Excel aus gemeinsamem OneDrive-Ordner wählen, Formalien daraus vorbefüllen,
  fertiges WEP automatisch in OneDrive ablegen.
- Fotos zu Positionen/WEP; eigene Pflanzen und Preise dauerhaft speichern; Status je WEP
  und Suche; WEP duplizieren; Vorbelegungen aus dem Profil.
- Skizze: Zoomen/Verschieben mit zwei Fingern, Einrasten, leichteres Auswählen.
- Papierkorb statt endgültigem Löschen; Sicherung als Datei; Sync-Konflikte sichtbar.
- „Neue Version“-Hinweis (teilweise in Schritt 5), Sonnen-Kontrast, Fehlerprotokoll,
  Katalog-Version im WEP.
- KI-Assistent (A: Notizen → Positionen, B: Skizze aus Foto + Chat) – siehe
  docs/KI-ASSISTENT.md, wieder einschalten nach rechtlicher Prüfung.
