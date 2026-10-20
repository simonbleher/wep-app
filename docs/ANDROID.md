# Android-App (Beta 2, Schritte 3 und 5)

Zwei Wege zur APK:

- **Release-APK** (Normalfall, Schritt 5): signiert, als GitHub Release; siehe
  „Release-Schlüssel einrichten“, „Installation“ und „Updates“ direkt unten.
- **Test-APK** (Schritt 3): Debug-Build für Branches, nur zum Ausprobieren; siehe
  „Test-APK holen und installieren“ weiter unten.

## Release-Schlüssel einrichten (einmalig)

Jede APK muss signiert sein, und **jedes Update muss mit demselben Schlüssel signiert sein**,
sonst lehnt Android es ab. Den Schlüssel erzeugt ein Workflow einmalig:

1. GitHub → **Actions** → **Android-Schlüssel erzeugen** → *Run workflow*. (Nur einmal! Ein
   zweiter Schlüssel passt nicht zu bereits installierten Apps.)
2. Nach dem grünen Lauf unten bei **Artifacts** `wep-android-schluessel` herunterladen und
   entpacken. Darin: `wep-release.jks` (der Schlüssel) und `zugangsdaten.txt` (Alias,
   Passwörter und der Schlüssel als Base64-Text). Die Passwörter stehen **nicht** im Log.
3. **Settings → Secrets and variables → Actions → New repository secret** – vier Secrets
   (Name genau so, Wert aus `zugangsdaten.txt`, ohne Leerzeichen/Zeilenumbruch):
   - `ANDROID_KEYSTORE_BASE64` – der lange Base64-Text (eine Zeile)
   - `ANDROID_KEYSTORE_PASSWORT` – Wert von `ANDROID_KEYSTORE_PASSWORT=`
   - `ANDROID_KEY_ALIAS` – `wep-release`
   - `ANDROID_KEY_PASSWORT` – Wert von `ANDROID_KEY_PASSWORT=` (gleich dem Keystore-Passwort;
     das Format PKCS12 kennt nur eines)
4. **Sicherung:** `wep-release.jks` und `zugangsdaten.txt` an einem sicheren Ort ablegen
   (Passwortmanager, nicht im Repo, nicht in OneDrive-Freigaben). GitHub Secrets kann man
   nicht wieder auslesen – geht der Schlüssel verloren, müssen alle Nutzer die App
   deinstallieren und neu installieren (die Daten liegen dann nur noch in OneDrive).
5. **Artefakt löschen:** am Lauf unter *Artifacts* beim Eintrag `wep-android-schluessel` auf
   den Papierkorb klicken (sonst löscht GitHub es nach 1 Tag von selbst). Lokale Kopie
   ebenfalls nach der Sicherung entfernen, wo sie nicht hingehört (Downloads).

Der Schlüssel ist RSA 4096, 30 Jahre gültig.

## Release-APK: Bau und Veröffentlichung

Workflow **Android Release** läuft bei jedem Push auf `main`, der `android/`, `src/`, `data/`,
`public/`, `package.json` u. Ä. ändert, und manuell (*Run workflow*). Er

- nimmt den **Versionsnamen aus `package.json`** (`version`) und als **versionCode die
  Lauf-Nummer** des Workflows,
- baut `assembleRelease` und signiert mit den vier Secrets (ohne Verkleinern/Verschleiern –
  Capacitor und das eigene Plugin arbeiten mit Reflexion, der Gewinn wäre klein),
- legt ein GitHub Release **„WEP <Version> (<Code>)“** an, APK als Anhang, dazu eine kurze
  Änderungsliste aus den Commits seit dem vorigen Android-Release.

Fehlen die Secrets, bricht der Lauf sofort mit der Meldung „Release-Schlüssel fehlt“ ab.
Der Test-APK-Workflow bleibt für Branches unverändert bestehen.

## Installation (Release-APK)

1. Auf GitHub → **Releases** → neuestes Release → `WEP-<Version>-<Code>.apk` herunterladen
   (GitHub-Anmeldung nötig, das Repo ist privat; am Handy im Browser anmelden).
2. Datei öffnen. Android fragt einmalig, ob der Browser/Datei-Manager Apps aus unbekannten
   Quellen installieren darf → erlauben → installieren. Play Protect kann warnen
   („Unbekannter Entwickler“) → „Trotzdem installieren“.
3. App öffnen, anmelden, fertig. Die Daten in der App bleiben bei späteren Updates erhalten.

## Umstieg von der Test-APK

Test- und Release-APK sind **unterschiedlich signiert** und haben dieselbe App-ID – Android
lässt kein Drüberinstallieren zu. Deshalb:

1. **Vorher abgleichen:** In der Test-App das Profil öffnen, Bereich „Synchronisierung“:
   „Offene Uploads“ muss **keine** zeigen (sonst „Jetzt hochladen“ mit WLAN). Auf der
   WEP-Liste einmal abgleichen lassen („Abgeglichen um …“). Nur was in OneDrive liegt, ist
   sicher; **ohne Konto erfasste WEPs gehen beim Deinstallieren verloren.**
2. Test-App **deinstallieren** (Einstellungen → Apps → WEP → Deinstallieren).
3. Release-APK installieren, anmelden; die WEPs kommen beim ersten Abgleich aus OneDrive zurück.

## Updates

- Beim Start (online, höchstens einmal täglich) und über **Profil → Über die App → Nach
  Update suchen** vergleicht die App ihre Version mit der der gehosteten Seite
  (`https://wep-pankow.pages.dev/version.json`, entsteht bei jedem Web-Build aus
  `package.json`). Ist die dort veröffentlichte Version neuer, erscheint oben auf der
  WEP-Liste und im Profil „Update verfügbar“ mit dem Knopf **Zur Release-Seite** (öffnet den
  System-Browser). Im Browser/PWA wird nichts angezeigt.
- Dort die neue APK laden und **über die alte installieren** (gleicher Schlüssel → Daten
  bleiben).
- **Wichtig:** Der Hinweis erscheint, wenn der **Versionsname** in `package.json` erhöht
  wurde (Beispiel 0.1.0 → 0.2.0). Der Cloudflare-Build kennt die Lauf-Nummer nicht; der
  versionCode ist deshalb nur für Android relevant (Update-Reihenfolge), nicht für den
  Hinweis. Für einen Hinweis also vor dem Merge die Version erhöhen.

## Fehlersuche

Im Profil zeigt der Bereich „Synchronisierung“ offene Uploads und den letzten erfolgreichen
Upload; „Jetzt hochladen“ stößt den Hintergrunddienst an. Das ausführliche Upload-Protokoll
(Netztyp, Läufe, Fehler) erscheint nach **langem Drücken auf die Version** unter „Über die
App“.

---

# Test-APK (Beta 2, Schritt 3)

## Aufbau

- **Capacitor** (App-ID `de.wep.app`, Name „WEP“) legt eine Android-Hülle um die
  unveränderte Web-App (`npm run build` → `dist/` → `npx cap sync android`). Die Web-App im
  Browser läuft wie bisher; der Cloudflare-Build ändert sich nicht.
- **Anmeldung** (`src/konto/android.ts`, gleiche Schnittstelle wie `web.ts`): Authorization
  Code + PKCE über den System-Browser (Custom Tab), Rücksprung `de.wep.app://auth`
  (Intent-Filter in `AndroidManifest.xml`, `appUrlOpen`). Authority
  `https://login.microsoftonline.com/consumers`, Scopes `Files.ReadWrite.AppFolder
  offline_access` (dazu `openid profile` für den Anzeigenamen, wie auch MSAL im Web).
  Die Plattform wird automatisch gewählt (`Capacitor.isNativePlatform()`).
- **Token nativ**: Token-Tausch und -Erneuerung laufen im eigenen Plugin
  (`WepNativePlugin.kt`, `HttpURLConnection`), nicht per `fetch` aus der WebView – die
  schickt einen Origin-Header, und Microsoft lehnt Cross-Origin für Nicht-SPA-Registrierungen
  ab. Der Refresh-Token liegt in `EncryptedSharedPreferences` (`TokenStore.kt`), damit auch
  der Hintergrunddienst ihn lesen kann.
- **Warteschlange** (`Warteschlange.kt`, JS-Teil `src/android/warteschlange.ts`): Jede
  Speicherung (`speichereWep`) schreibt die fertige Sync-Datei (`wep-sync/1`) zusätzlich
  in `files/upload-queue/` – je WEP eine Datei plus Meta mit dem letzten bekannten eTag.
- **Worker** (`UploadWorker.kt`, WorkManager): Bedingung `NetworkType.UNMETERED`, bei
  ausgeschaltetem „Upload nur über WLAN“ `CONNECTED`. Läuft auch bei geschlossener App
  (zusätzlich alle 15 Min. als Sicherheitsnetz). Holt per Refresh-Token ein Zugriffstoken
  und lädt nach `Apps/WEP-App/daten/<name>` hoch:
  - mit `If-Match: <eTag>`; für Dateien, die noch nie hochgeladen wurden, mit
    `@microsoft.graph.conflictBehavior=fail`, damit nie etwas überschrieben wird,
  - bei **412/409** bleibt die Datei liegen („blockiert“); die App klärt den Konflikt beim
    nächsten Abgleich (Regeln wie in `docs/SYNC.md`),
  - bei Erfolg wird der Eintrag entfernt und der neue eTag in `ergebnisse.json` geschrieben;
    die App übernimmt ihn beim Start, beim Zurückkehren in die App und vor jedem Abgleich in
    `syncMeta`. Nach einem Abgleich in der App werden erledigte Einträge aus der Warteschlange
    entfernt.
  - Jeder Lauf schreibt Protokolleinträge.
- **Oberfläche**: Profil → „Synchronisierung“ (nur in der Android-App); das ausführliche
  Protokoll (Netztyp, Läufe) nur nach langem Drücken auf die Version.

## Einmalig einrichten

1. **Azure-App-Registrierung** (dieselbe wie für die Web-App, siehe `docs/SYNC.md`):
   *Authentifizierung* → *Plattform hinzufügen* → **Mobil- und Desktopanwendungen** →
   benutzerdefinierter Umleitungs-URI `de.wep.app://auth`. Unter *Erweiterte Einstellungen*
   „Öffentliche Clientflows zulassen“ auf **Ja**. Die SPA-Umleitung für die Web-App bleibt.
2. **Client-ID im GitHub-Repo hinterlegen:** *Settings → Secrets and variables → Actions →
   Variables → New repository variable*, Name `VITE_MS_CLIENT_ID`, Wert = Client-ID. Ohne
   sie baut die APK, hat aber keinen Login.

## Test-APK holen und installieren

1. GitHub → Reiter **Actions** → Workflow **Android Test-APK** → neuester grüner Lauf →
   unten **Artifacts → `wep-test-apk`** herunterladen (ZIP, darin `app-debug.apk`).
   Neu bauen: *Run workflow* (oder Push auf `android/**`).
2. ZIP entpacken, `app-debug.apk` aufs Tablet/Handy bringen (USB, OneDrive, Mail …).
3. Datei öffnen → Android fragt einmalig, ob der Datei-Manager/Browser „Apps aus
   unbekannten Quellen“ installieren darf → erlauben → installieren. (Debug-Signatur, daher
   Warnung von Play Protect möglich: „Trotzdem installieren“.)

## Was getestet werden soll

1. **Login:** App öffnen → „Mit Microsoft anmelden“ → der System-Browser öffnet sich,
   anmelden und zustimmen → du landest wieder in der App, im Profil steht dein Konto.
2. **Offline erfassen:** Flugmodus an (oder WLAN und Mobildaten aus). Ein WEP anlegen und
   ein paar Positionen erfassen. Im Profil → „Synchronisierung“ steht ein offener Upload
   (Einzelheiten: Version lang drücken → Protokoll).
3. **App schließen:** App aus der Übersicht wegwischen (nicht nur in den Hintergrund).
4. **WLAN an:** Flugmodus aus, WLAN verbinden, 1–15 Minuten warten (WorkManager startet nicht
   sekundengenau; der Energiesparmodus kann verzögern).
5. **Prüfen:** In OneDrive unter `Apps/WEP-App/daten/` liegt `<Vorgangs-Nr>.json`. In der App
   (Profil → Version lang drücken) steht im Protokoll „… hochgeladen (eTag …)“ und die Warteschlange ist leer.
   Zum Beschleunigen: **„Jetzt hochladen“** (beachtet die WLAN-Einstellung).
6. **Nur WLAN:** Mit Mobildaten statt WLAN darf nichts hochgeladen werden (Netz „Mobilfunk
   (getaktet)“, die Datei bleibt in der Warteschlange). Schalter „Upload nur über WLAN“ im
   Profil aus → der Upload läuft auch über Mobilfunk.
7. **Konflikt:** Dasselbe WEP in OneDrive/auf einem anderen Gerät ändern, dann am Tablet
   offline ändern und WLAN anschalten: Im Protokoll steht „in OneDrive geändert (412) – bleibt
   liegen“. Beim Öffnen der App gleicht sie ab (Konflikt-Kopie wie in `docs/SYNC.md`).

Rückmeldung bitte mit: Android-Version, Gerät, was im Protokoll steht, und ob die
Uhrzeit des Uploads plausibel war.

## Bekannte Grenzen (Test)

- **Nicht auf einem echten Gerät erprobt**, als diese Umsetzung entstand: Gebaut und die
  JS-Logik getestet (PKCE, Token, Warteschlange), aber die Anmeldung gegen Microsoft und der
  Worker liefen noch nicht auf einem Gerät. Fehler im Protokoll sind genau das, was dieser
  Test finden soll.
- `If-Match` auf dem Graph-Pfad-Upload (`…:/content`) ist nach Dokumentation unterstützt,
  aber hier noch nicht gegen OneDrive bestätigt – bei unerwarteten 412/400 bitte das
  Protokoll schicken.
- Debug-Build, Debug-Signatur, `versionName 1.0`; kein Update-Hinweis, kein Play Store.
- Gelöschte WEPs werden (wie im Web) nicht abgeglichen; sie fliegen nur aus der Warteschlange.
- Der Abgleich in der geöffneten App ist unverändert und beachtet „Upload nur über WLAN“
  noch **nicht** – die Einstellung steuert nur den Hintergrunddienst.
- Android kann Hintergrundarbeit verzögern (Doze, Akkusparmodus, „Apps im Standby“);
  Hersteller wie Xiaomi/Huawei sind besonders streng. Bei Verzögerung: Akku-Optimierung für
  „WEP“ ausschalten.
- Sichern/Wiederherstellen per Android-Backup ist abgeschaltet (`allowBackup=false`), weil
  verschlüsselte Anmeldedaten nicht auf ein anderes Gerät übertragbar sind.
- Zugriffstoken und Refresh-Token werden von der App und vom Worker gemeinsam erneuert
  (synchronisiert im Prozess); bei gleichzeitiger Erneuerung aus zwei Prozessen könnte
  ein Refresh-Token einmal verworfen werden – dann hilft erneutes Anmelden.
- Kein iPhone/iPad (nicht geplant).
- Debuggen: `chrome://inspect` am PC (USB-Debugging am Gerät), die WebView ist freigegeben.

## Selbst bauen (optional)

```bash
npm ci && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # JDK 21 und Android SDK 36 nötig
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Randloser Modus (Android 15) und Systemleisten

Ab Android 15 läuft die App randlos: Die WebView reicht unter Status- und Navigationsleiste.
Darum gilt (ohne Wirkung im Browser, dort sind die Insets 0):

- `viewport-fit=cover` in `index.html`; Capacitor (`SystemBars`, `insetsHandling: 'native'`)
  setzt `env(safe-area-inset-*)` korrekt bzw. polstert die WebView bei älteren WebView-Versionen.
- `.app` trägt das Safe-Area-Padding und die Höhe `100dvh`; Seiten wachsen im Flex-Layout
  mit, ohne die Höhe zu überschreiten. Feste Dialoge (Skizze) polstern sich ebenfalls.
- Hintergrund der WebView `#f4f6f4` (= App-Hintergrund), Symbole der Systemleisten dunkel
  (`SystemBars.setStyle(Light)`), auch wenn das Gerät im Dunkelmodus ist.
