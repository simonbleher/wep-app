# v2 einrichten: Cloudflare, Google, Resend, Azure (Schritt für Schritt, Simon)

Diese Anleitung richtet v2 direkt für **Produktion** ein: `https://wep-pankow.pages.dev`
(Plan: [PLAN-V2.md](PLAN-V2.md)). Eine Vorschau-Phase gibt es nicht mehr. v1 wird nicht mehr genutzt.
Alles, was hier eingetragen wird, gehört in Cloudflare zur Umgebung **Produktion** (*Production*).

- **Production baut aus dem Branch `release`.** Variablen und Bindungen wirken erst mit dem nächsten
  Build. Nach dem Eintragen deshalb **„Version freigeben“** ausführen (Schritt 6).
- **Nur Testdaten** mit erfundenen Namen, bis der AV-Vertrag mit dem BV steht. Das gilt auch in
  Produktion.
- **Geheimnisse** (Client-Secrets, API-Schlüssel) nur in Cloudflare eintragen, als Typ
  *Geheimnis* (*Secret*). Nie ins Repo, nie in einen Chat oder ein Ticket.
- **Alter:** Einige Anbieter verlangen in ihren Nutzungsbedingungen Volljährigkeit, zum Beispiel
  Google Cloud und Resend. Lies die Bedingungen vorher. Wenn nötig, legt ein Elternteil das
  Konto an und gibt dir Zugriff.
- Die Reihenfolge ist egal. Was schon eingerichtet ist, zeigt am Ende
  `https://wep-pankow.pages.dev/api/v2/status` (Schritt 6).

## Übersicht: was wohin kommt

Cloudflare → **Workers & Pages** → Projekt **wep-pankow** → **Einstellungen**, Umgebung jeweils **Produktion**:

| Name | Art | Wert / Herkunft |
|---|---|---|
| `SERVER_MODUS` | Variable (Text) | `true` |
| `VITE_SERVER_MODUS` | Variable (Text) | `true` (wird beim Build eingebaut) |
| `V2_ADMINS` | Variable (Text) | deine Anmelde-E-Mail(s), kommagetrennt (erste Admins) |
| `VITE_MS_CLIENT_ID` | Variable (Text) | ist schon gesetzt (Produktion) |
| `GOOGLE_CLIENT_ID` | Variable (Text) | Schritt 3 |
| `GOOGLE_CLIENT_SECRET` | **Geheimnis** | Schritt 3 |
| `MS_CLIENT_SECRET` | **Geheimnis** | Schritt 5 |
| `RESEND_API_KEY` | **Geheimnis** | Schritt 4 |
| `MAIL_ABSENDER` | Variable (Text) | Schritt 4, z. B. `WEP-App <wep@mail.example.org>` |
| `WEP_DB` | Bindung D1 | Schritt 1 |
| `WEP_DATEIEN` | Bindung R2 | Schritt 2 |

Die Namen müssen genau so geschrieben sein.

## 1. Datenbank (D1) mit Speicherort EU

1. <https://dash.cloudflare.com> → links **Speicher & Datenbanken → D1 SQL-Datenbank**
   (*Storage & Databases → D1 SQL Database*) → **Datenbank erstellen** (*Create Database*).
2. **Name:** `wep-v2`.
3. **Datenspeicherort** (*Data location*): **Jurisdiktion angeben** (*Specify jurisdiction*) →
   **Europäische Union (EU)**. Das geht nur beim Anlegen und lässt sich später nicht ändern.
   Einen „Standort-Hinweis“ (*location hint*) braucht es dann nicht mehr.
4. **Erstellen**.
5. Binden: **Workers & Pages → wep-pankow → Einstellungen → Bindungen** (*Bindings*) → oben die
   Umgebung **Produktion** wählen → **Bindung hinzufügen** → **D1-Datenbank**:
   - **Variablenname:** `WEP_DB`
   - **D1-Datenbank:** `wep-v2`

### Tabellen einspielen (Migrationen)

Die Tabellen stehen im Repo unter `migrations/` (`0001_konten.sql`, `0002_weps.sql`, `0003_ablauf.sql`, `0004_benachrichtigungen.sql`, `0005_gruen_zusammenfuehren.sql`, `0006_app_anmeldung.sql`, …). Jede Datei
wird **genau einmal und in der Reihenfolge der Nummern** eingespielt:

1. Dashboard → **D1** → `wep-v2` → Reiter **Konsole** (*Console*).
2. Den ganzen Inhalt der nächsten Datei aus `migrations/` (auf GitHub öffnen → **Raw** → alles
   kopieren) einfügen → **Ausführen** (*Execute*).
3. Prüfen (erst nach dem neuen Build aus Schritt 6): `https://wep-pankow.pages.dev/api/v2/status` zeigt unter `schema` den Stand.
   `"stand"` muss gleich `"erwartet"` sein. Ist `stand` kleiner, fehlt die nächste Datei. Eine Datei
   ein zweites Mal einspielen schlägt fehl („table … already exists“); das schadet nicht.

Wer die Kommandozeile mag, nimmt stattdessen
`npx wrangler d1 execute wep-v2 --remote --file=migrations/0001_konten.sql`.

## 2. Dateispeicher (R2) mit Speicherort EU

1. Im Dashboard links **R2-Objektspeicher** (*R2 Object Storage*). Beim ersten Mal will Cloudflare
   ein Zahlungsmittel hinterlegt haben. Der kostenlose Umfang (10 GB) reicht für den Anfang.
2. **Bucket erstellen** (*Create bucket*):
   - **Name:** `wep-v2`
   - **Standort** (*Location*): **Jurisdiktion angeben** (*Specify jurisdiction*) →
     **Europäische Union (EU)**. Auch das gilt nur beim Anlegen.
   - Öffentlicher Zugriff bleibt **aus**. Dateien gibt es nur über die App mit Rechteprüfung.
3. Binden: wie bei D1, Umgebung **Produktion** → **Bindung hinzufügen** → **R2-Bucket**:
   - **Variablenname:** `WEP_DATEIEN`
   - **R2-Bucket:** `wep-v2`

**Wichtig – bitte zurückmelden:** Cloudflare zeigt Buckets mit EU-Jurisdiktion in der
Bindungsauswahl von Pages womöglich nicht an. Das ist ein bekanntes Problem, das in den
Cloudflare-Foren gemeldet wurde. Fehlt der Bucket in der Liste, **nicht** auf einen Bucket ohne
EU-Jurisdiktion ausweichen, sondern mir Bescheid geben. Dann kommt die Bindung in Paket 1 über
eine Konfigurationsdatei im Repo (`wrangler.toml` mit `jurisdiction = "eu"`).

## 3. Google-Anmeldung (OAuth-Client)

1. <https://console.cloud.google.com> → oben **Projekt auswählen → Neues Projekt** → Name
   `WEP-App` → **Erstellen** → das Projekt auswählen.
2. Links **APIs & Dienste → OAuth-Zustimmungsbildschirm** (heißt inzwischen auch
   **Google Auth Platform**) → **Jetzt starten** (*Get started*):
   - **App-Name:** `WEP-App`, **Support-E-Mail:** deine Adresse
   - **Zielgruppe** (*Audience*): **Extern** (*External*)
   - **Kontaktdaten:** deine Adresse → Bedingungen akzeptieren → **Erstellen**
3. **Datenzugriff** (*Data access*) → **Bereiche hinzufügen** → `openid`, `…/auth/userinfo.email`
   und `…/auth/userinfo.profile` ankreuzen → **Aktualisieren** → **Speichern**. Diese drei Bereiche
   brauchen keine Prüfung durch Google.
4. **Zielgruppe** (*Audience*) → **Veröffentlichungsstatus** (*Publishing status*) → **App veröffentlichen**
   (*Publish app*) → bestätigen. Danach steht dort **„In Produktion“** (*In production*), und jedes
   Google-Konto kann sich anmelden. Ob jemand in die App darf, entscheidet weiter die Freigabe durch den Admin.
   Weil die App nur `openid`, E-Mail und Profil abfragt, ist **keine Prüfung durch Google** nötig.
   Google zeigt höchstens den Hinweis, dass die App nicht überprüft ist; das betrifft nur Logo und Domain,
   nicht die Anmeldung.
5. **Clients → Client erstellen** (*Create client*):
   - **Anwendungstyp:** **Webanwendung** (*Web application*)
   - **Name:** `WEP-App Server`
   - **Autorisierte Weiterleitungs-URIs** (*Authorized redirect URIs*):
     - `https://wep-pankow.pages.dev/api/v2/anmeldung/google/zurueck`
     - `http://localhost:8788/api/v2/anmeldung/google/zurueck` (für Tests auf dem eigenen Rechner)
   - „Autorisierte JavaScript-Quellen“ bleiben leer → **Erstellen**.
6. Es erscheinen **Client-ID** und **Clientschlüssel** (*Client secret*). Den Schlüssel zeigt
   Google womöglich nur dieses eine Mal an, also gleich übertragen (oder die JSON-Datei
   herunterladen und nach dem Eintragen löschen):
   - Client-ID → Cloudflare-Variable `GOOGLE_CLIENT_ID` (Text)
   - Clientschlüssel → Cloudflare `GOOGLE_CLIENT_SECRET` (**Geheimnis**)

## 4. E-Mails (Resend)

1. <https://resend.com> → Konto anlegen.
2. **Domain** (*Domains → Add Domain*): Resend schickt Mails an beliebige Empfänger nur von einer
   eigenen, bestätigten Domain. Eine `pages.dev`-Adresse geht dafür nicht.
   - Am besten eine Subdomain wie `mail.<deine-domain>`, **Region: EU (Irland)**.
   - Resend zeigt danach DNS-Einträge (TXT für SPF, DKIM und MX). Diese beim Anbieter der Domain
     eintragen und in Resend **Verify** drücken. Das kann bis zu einigen Stunden dauern.
   - **Ohne eigene Domain:** Zum Ausprobieren schickt Resend vom Absender
     `onboarding@resend.dev` nur an die E-Mail-Adresse des eigenen Resend-Kontos. Für den
     Durchlauf mit mehreren Testkonten braucht es eine Domain. **Offene Frage:** Welche Domain
     nehmen wir (eigene Domain, eine Domain des BV)?
3. **API Keys → Create API Key**:
   - **Name:** `wep-v2`
   - **Berechtigung:** *Sending access* (nur senden), auf die Domain beschränkt
   - Den Schlüssel (`re_…`) gleich kopieren und als Cloudflare `RESEND_API_KEY` (**Geheimnis**) eintragen.
4. Cloudflare-Variable `MAIL_ABSENDER` (Text), z. B. `WEP-App <wep@mail.deine-domain>`.
   Ohne Domain vorerst `WEP-App <onboarding@resend.dev>`.

Die Mails enthalten später nur Vorgangs-Nr., Anlage, Parzelle und einen Link: keine Pächternamen, keine Beträge.

## 5. Microsoft-Anmeldung für den Server (Azure)

Die vorhandene Registrierung **WEP-App** bekommt **zusätzlich** die Plattform „Web“. Die Plattformen
„Single-Page-Webanwendung“ und „Mobil- und Desktopanwendungen“ bleiben unverändert: Die Android- und die
Windows-App arbeiten vorerst weiter wie v1 mit OneDrive und melden sich darüber **ohne** Geheimnis an
(docs/SYNC.md). Das Geheimnis unten nutzt nur der Server.

1. <https://entra.microsoft.com> → **Identität → Anwendungen → App-Registrierungen** → **WEP-App**.
2. **Authentifizierung** (*Authentication*) → **Plattform hinzufügen** (*Add a platform*) → **Web**:
   - **Umleitungs-URI:** `https://wep-pankow.pages.dev/api/v2/anmeldung/microsoft/zurueck`
   - Die Häkchen bei „Zugriffstoken“ und „ID-Token“ (implizite Gewährung) **nicht** setzen
   - **Konfigurieren**
   - Danach bei **Web** eine weitere URI hinzufügen:
     `http://localhost:8788/api/v2/anmeldung/microsoft/zurueck` → **Speichern**
3. **Zertifikate & Geheimnisse** (*Certificates & secrets*) → **Neuer geheimer Clientschlüssel**:
   - **Beschreibung:** `WEP-App Server`
   - **Gültig bis:** 12 Monate. Trag dir einen Termin zum Erneuern in den Kalender ein; danach
     schlägt die Microsoft-Anmeldung im Server-Modus fehl.
   - **Hinzufügen** → in der Spalte **Wert** (*Value*, nicht „Geheimnis-ID“) kopieren. Der Wert
     wird nur jetzt angezeigt.
   - In Cloudflare als `MS_CLIENT_SECRET` (**Geheimnis**) eintragen.
4. **API-Berechtigungen** → **Berechtigung hinzufügen** → **Microsoft Graph** →
   **Delegierte Berechtigungen** → `openid`, `profile`, `email` ankreuzen → hinzufügen.
   `Files.ReadWrite.AppFolder` und `User.Read` bleiben stehen.
5. Die unterstützten Kontotypen sind schon auf „alle Microsoft-Konten“ umgestellt (docs/SYNC.md).
   Daran nichts ändern.

## 6. Version freigeben und prüfen

1. Production baut aus dem Branch `release`. Variablen und Bindungen wirken erst mit einem **neuen
   Build**. Deshalb nach dem Eintragen: GitHub → **Actions → „Version freigeben“ → Run workflow**
   (Feld leer lassen = aktueller Stand von `main`, docs/FREIGABE.md).
   - Wurde nur eine Variable geändert und `main` ist schon freigegeben, reicht in Cloudflare unter
     **Bereitstellungen** (*Deployments*) bei der letzten Bereitstellung von `release`
     **erneut ausführen** (*Retry deployment*).
2. Im Browser öffnen: `https://wep-pankow.pages.dev/api/v2/status`. Erwartet wird etwa:

   ```json
   {"serverModus":true,"einrichtung":{"datenbank":true,"dateien":true,"google":true,"microsoft":true,"mail":true,"admins":true},"schema":{"stand":5,"erwartet":5}}
   ```

   - Steht dort `false`, fehlt der Teil oder ist falsch geschrieben (siehe Tabelle oben).
   - Kommt „Nicht gefunden“, fehlt `SERVER_MODUS=true` in Produktion, oder der neue Build fehlt.
   - Die Seite zeigt **nie** Werte oder Geheimnisse, nur ja oder nein.
3. Die App unter `https://wep-pankow.pages.dev` zeigt den Anmelde-Bildschirm mit „Mit Google
   anmelden“ und „Mit Microsoft anmelden“. Zeigt sie stattdessen „Ohne Konto fortfahren“, fehlt
   `VITE_SERVER_MODUS=true` oder der neue Build. Ein schon installierter Browser-Stand lädt die neue
   Fassung beim nächsten Öffnen nach; im Zweifel die Seite einmal neu laden.
4. **Erste Anmeldung:** „Mit Google anmelden“ oder „Mit Microsoft anmelden“ mit der Adresse aus
   `V2_ADMINS`. Du landest direkt in der App und bist Admin.
   - Unter **Profil → Konten verwalten** gibst du weitere Konten frei und vergibst Rollen
     (Wertermittler Bau **oder** Grün, dazu BV und Admin).
   - Für `V2_ADMINS` zählen nur bestätigte Adressen: bei Google mit bestätigter E-Mail, bei
     Microsoft die Anmeldeadresse.
   - Alle anderen Konten warten nach der ersten Anmeldung auf deine Freigabe.
5. **Anleitung:** In der App unter Profil → Anleitung (oder
   `docs/anleitung-v2/Anleitung_WEP-App_v2.pdf`) – Ablauf Bau → Grün → BV mit Bildern.

**Hinweis zur Adresse:** Anmelden klappt nur unter `wep-pankow.pages.dev` (und `localhost:8788` zum
Testen). Die Einzel-Adressen pro Bereitstellung (`<kennung>.wep-pankow.pages.dev`) und
`main.wep-pankow.pages.dev` stehen bei Google und Microsoft nicht als Rücksprung-Adresse.

## Android- und Windows-App

Seit Paket 8 melden sich die Apps über den Browser des Geräts am Server an. **Bei Google und Microsoft
ist dafür nichts einzutragen:** Der Server benutzt seine bisherigen Rücksprung-Adressen und reicht die
Anmeldung danach an die App weiter. Nötig ist nur:

1. Migration `0006_app_anmeldung.sql` in der D1-Konsole einspielen (wie oben unter „Tabellen einspielen“).
2. Die neuen Apps installieren: Android-App 0.2.0 (`https://wep-pankow-apk.pages.dev/wep.apk`), Windows-App
   0.1.4 (`https://wep-pankow-apk.pages.dev/windows/wep-setup.exe`). Die bisherigen Apps bieten das Update
   auch selbst an. Bis dahin laufen sie weiter wie v1 und zeigen oben „bitte die App aktualisieren“.

## Vor echten Daten (Paket 7, nicht jetzt)

- **Bis dahin nur Testdaten** auf dem Server, auch in Produktion.
- Vorher: AV-Vertrag mit dem BV, Cloudflare-DPA, Lösch- und Aufbewahrungsregeln (PLAN-V2.md, „Datenschutz“).
- Danach: Übernahme vorhandener WEPs aus OneDrive (Paket 7).
