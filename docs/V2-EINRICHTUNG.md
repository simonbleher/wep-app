# v2 einrichten: Cloudflare, Google, Resend, Azure (Schritt für Schritt, Simon)

Diese Anleitung bereitet die **Vorschau** `https://main.wep-pankow.pages.dev` für v2 vor
(Plan: [PLAN-V2.md](PLAN-V2.md)). **Production bleibt unberührt.** Alles, was hier
eingetragen wird, gehört in Cloudflare zur Umgebung **Vorschau** (*Preview*). Die laufende App
auf `wep-pankow.pages.dev` und auf den Geräten merkt nichts davon.

- **Nur Testdaten** mit erfundenen Namen, bis der AV-Vertrag geklärt ist.
- **Geheimnisse** (Client-Secrets, API-Schlüssel) nur in Cloudflare eintragen, als Typ
  *Geheimnis* (*Secret*). Nie ins Repo, nie in einen Chat oder ein Ticket.
- **Alter:** Einige Anbieter verlangen in ihren Nutzungsbedingungen Volljährigkeit, zum Beispiel
  Google Cloud und Resend. Lies die Bedingungen vorher. Wenn nötig, legt ein Elternteil das
  Konto an und gibt dir Zugriff.
- Die Reihenfolge ist egal. Was schon eingerichtet ist, zeigt am Ende
  `https://main.wep-pankow.pages.dev/api/v2/status` (Schritt 6).

## Übersicht: was wohin kommt

Cloudflare → **Workers & Pages** → Projekt **wep-pankow** → **Einstellungen**, Umgebung jeweils **Vorschau**:

| Name | Art | Wert / Herkunft |
|---|---|---|
| `SERVER_MODUS` | Variable (Text) | `true` |
| `VITE_SERVER_MODUS` | Variable (Text) | `true` (wird beim Build eingebaut) |
| `V2_ADMINS` | Variable (Text) | deine Anmelde-E-Mail(s), kommagetrennt (erste Admins) |
| `VITE_MS_CLIENT_ID` | Variable (Text) | ist schon gesetzt; prüfen, ob auch in der Vorschau |
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
2. **Name:** `wep-v2-vorschau`.
3. **Datenspeicherort** (*Data location*): **Jurisdiktion angeben** (*Specify jurisdiction*) →
   **Europäische Union (EU)**. Das geht nur beim Anlegen und lässt sich später nicht ändern.
   Einen „Standort-Hinweis“ (*location hint*) braucht es dann nicht mehr.
4. **Erstellen**.
5. Binden: **Workers & Pages → wep-pankow → Einstellungen → Bindungen** (*Bindings*) → oben die
   Umgebung **Vorschau** wählen → **Bindung hinzufügen** → **D1-Datenbank**:
   - **Variablenname:** `WEP_DB`
   - **D1-Datenbank:** `wep-v2-vorschau`

### Tabellen einspielen (Migrationen)

Die Tabellen stehen im Repo unter `migrations/` (`0001_konten.sql`, später `0002_…`). Jede Datei
wird **genau einmal und in der Reihenfolge der Nummern** eingespielt:

1. Dashboard → **D1** → `wep-v2-vorschau` → Reiter **Konsole** (*Console*).
2. Den ganzen Inhalt der nächsten Datei aus `migrations/` (auf GitHub öffnen → **Raw** → alles
   kopieren) einfügen → **Ausführen** (*Execute*).
3. Prüfen: `https://main.wep-pankow.pages.dev/api/v2/status` zeigt unter `schema` den Stand.
   `"stand"` muss gleich `"erwartet"` sein. Ist `stand` kleiner, fehlt die nächste Datei. Eine Datei
   ein zweites Mal einspielen schlägt fehl („table … already exists“); das schadet nicht.

Wer die Kommandozeile mag, nimmt stattdessen
`npx wrangler d1 execute wep-v2-vorschau --remote --file=migrations/0001_konten.sql`.

## 2. Dateispeicher (R2) mit Speicherort EU

1. Im Dashboard links **R2-Objektspeicher** (*R2 Object Storage*). Beim ersten Mal will Cloudflare
   ein Zahlungsmittel hinterlegt haben. Der kostenlose Umfang (10 GB) reicht für die Tests.
2. **Bucket erstellen** (*Create bucket*):
   - **Name:** `wep-v2-vorschau`
   - **Standort** (*Location*): **Jurisdiktion angeben** (*Specify jurisdiction*) →
     **Europäische Union (EU)**. Auch das gilt nur beim Anlegen.
   - Öffentlicher Zugriff bleibt **aus**. Dateien gibt es nur über die App mit Rechteprüfung.
3. Binden: wie bei D1, Umgebung **Vorschau** → **Bindung hinzufügen** → **R2-Bucket**:
   - **Variablenname:** `WEP_DATEIEN`
   - **R2-Bucket:** `wep-v2-vorschau`

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
4. **Zielgruppe** (*Audience*) → **Testnutzer** (*Test users*) → die Google-Konten eintragen, mit
   denen getestet wird. Solange die App im Status *Testen* ist, kommen nur diese Konten durch.
   Das passt für die Vorschau.
5. **Clients → Client erstellen** (*Create client*):
   - **Anwendungstyp:** **Webanwendung** (*Web application*)
   - **Name:** `WEP-App Server Vorschau`
   - **Autorisierte Weiterleitungs-URIs** (*Authorized redirect URIs*):
     - `https://main.wep-pankow.pages.dev/api/v2/anmeldung/google/zurueck`
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
   - **Name:** `wep-v2-vorschau`
   - **Berechtigung:** *Sending access* (nur senden), auf die Domain beschränkt
   - Den Schlüssel (`re_…`) gleich kopieren und als Cloudflare `RESEND_API_KEY` (**Geheimnis**) eintragen.
4. Cloudflare-Variable `MAIL_ABSENDER` (Text), z. B. `WEP-App <wep@mail.deine-domain>`.
   Ohne Domain vorerst `WEP-App <onboarding@resend.dev>`.

Die Mails enthalten später nur Vorgangs-Nr., Anlage, Parzelle und einen Link: keine Pächternamen, keine Beträge.

## 5. Microsoft-Anmeldung für den Server (Azure)

Die vorhandene Registrierung **WEP-App** bekommt **zusätzlich** die Plattform „Web“. Die Plattform
„Single-Page-Webanwendung“ der laufenden App (v1) bleibt unverändert. Sie arbeitet weiter
**ohne** Geheimnis (docs/SYNC.md). Das Geheimnis unten nutzt nur der Server.

1. <https://entra.microsoft.com> → **Identität → Anwendungen → App-Registrierungen** → **WEP-App**.
2. **Authentifizierung** (*Authentication*) → **Plattform hinzufügen** (*Add a platform*) → **Web**:
   - **Umleitungs-URI:** `https://main.wep-pankow.pages.dev/api/v2/anmeldung/microsoft/zurueck`
   - Die Häkchen bei „Zugriffstoken“ und „ID-Token“ (implizite Gewährung) **nicht** setzen
   - **Konfigurieren**
   - Danach bei **Web** eine weitere URI hinzufügen:
     `http://localhost:8788/api/v2/anmeldung/microsoft/zurueck` → **Speichern**
3. **Zertifikate & Geheimnisse** (*Certificates & secrets*) → **Neuer geheimer Clientschlüssel**:
   - **Beschreibung:** `WEP-App Server Vorschau`
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

## 6. Neu bauen und prüfen

1. Variablen und Bindungen wirken erst mit einem **neuen Build**. Unter **Bereitstellungen**
   (*Deployments*) die letzte Bereitstellung von `main` **erneut ausführen** (*Retry deployment*),
   oder auf den nächsten Merge warten.
2. Im Browser öffnen: `https://main.wep-pankow.pages.dev/api/v2/status`. Erwartet wird etwa:

   ```json
   {"serverModus":true,"einrichtung":{"datenbank":true,"dateien":true,"google":true,"microsoft":true,"mail":true,"admins":true},"schema":{"stand":1,"erwartet":1}}
   ```

   - Steht dort `false`, fehlt der Teil oder ist falsch geschrieben (siehe Tabelle oben).
   - Kommt „Nicht gefunden“, fehlt `SERVER_MODUS=true` in der Vorschau.
   - Die Seite zeigt **nie** Werte oder Geheimnisse, nur ja oder nein.
3. Die Vorschau-App (`https://main.wep-pankow.pages.dev`) zeigt oben das Band
   „v2-Vorschau – nur Testdaten“. Fehlt es, fehlt `VITE_SERVER_MODUS=true`
   oder der neue Build.
4. **Erste Anmeldung (ab Paket 1):** In der Vorschau-App „Mit Google anmelden“ oder „Mit Microsoft
   anmelden“ mit der Adresse aus `V2_ADMINS`. Du landest direkt in der App und bist Admin.
   - Unter **Profil → Konten verwalten** gibst du weitere Konten frei und vergibst Rollen
     (Wertermittler Bau **oder** Grün, dazu BV und Admin).
   - Für `V2_ADMINS` zählen nur bestätigte Adressen: bei Google mit bestätigter E-Mail, bei
     Microsoft die Anmeldeadresse.
   - Alle anderen Konten warten nach der ersten Anmeldung auf deine Freigabe.

**Hinweis zur Adresse:** Anmelden klappt später nur unter `main.wep-pankow.pages.dev`. Die
Einzel-Adressen pro Bereitstellung (`<kennung>.wep-pankow.pages.dev`) stehen bei Google und
Microsoft nicht als Rücksprung-Adresse.

## Bei der Umstellung (Paket 7, nicht jetzt)

- Dasselbe für **Produktion**: eigene D1-Datenbank und eigener R2-Bucket (beide EU), eigene
  Geheimnisse.
- Rücksprung-Adressen für `https://wep-pankow.pages.dev/api/v2/anmeldung/…/zurueck` ergänzen.
- Google-App auf *In Produktion* stellen.
- Vorher: AV-Vertrag, Cloudflare-DPA, Lösch- und Aufbewahrungsregeln (PLAN-V2.md, „Datenschutz“).
