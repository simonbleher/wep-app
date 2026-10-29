# Plan v2: WEP-App mit Server, Konten und Rollen

Stand 28.10.2026. Übergabe von Simon. Dieser Plan ist die Grundlage für die Pakete 0–7.
Einrichtung der Dienste für Simon: [V2-EINRICHTUNG.md](V2-EINRICHTUNG.md).

## Ausgangslage

- v2 entsteht im bestehenden Repo auf `main`. Wie immer gilt: ein Thema = ein Branch = ein PR.
- **Stand 28.10.2026: v2 geht direkt in Produktion** (`wep-pankow.pages.dev`), ohne Vorschau-Phase. v1 wird
  nicht mehr genutzt. Geräte und `wep-pankow.pages.dev` bekommen nur, was über „Version freigeben“
  freigegeben wird (Branch `release`).
- Alles Neue liegt hinter einem Schalter:
  - **Web:** `VITE_SERVER_MODUS=true`. Er wird beim Build eingebaut (`src/server/modus.ts`).
  - **Functions:** `SERVER_MODUS=true`. Er wird zur Laufzeit gelesen (`functions/_lib/serverModus.ts`).
    Ohne ihn antworten alle Endpunkte unter `/api/v2/` mit 404.
  - **Ohne Schalter verhält sich die App genau wie heute:** OneDrive-Sync, Teilen per .wep-Datei,
    `/bv` mit Dateien. `main` muss jederzeit freigebbar bleiben. Fehlerbehebungen für v1 laufen parallel weiter.
- Schalter und Bindungen (D1, R2, Resend, Google- und Microsoft-Client) liegen in der Cloudflare-Umgebung
  **Produktion** (docs/V2-EINRICHTUNG.md). Die Schalter bleiben im Code: Ein Build ohne sie verhält sich weiter wie v1.
- **Android und Windows** bekommen dasselbe Web-Paket als Live-Update, nutzen den Server aber noch nicht: Dort
  bleibt der Server-Modus aus (v1 mit OneDrive), oben steht „bitte im Browser nutzen“ (`src/server/modus.ts`).
  Der Server-Modus für die Apps ist das nächste Paket (8).
- **Nur erfundene Testdaten**, bis der AV-Vertrag geklärt ist (Abschnitt „Datenschutz“).

## Zielbild

### 1. Konten und Rollen

- Anmeldung mit **Google oder Microsoft** (OpenID Connect).
  - **Microsoft:** die vorhandene Registrierung „WEP-App“ für alle Kontotypen, zusätzlich mit einer
    Plattform „Web“ für den Server.
  - **Google:** ein neuer OAuth-Client.
  - Neue Konten stehen auf **„wartet auf Freigabe“**.
- **Admin-Seite** für Simon und die IT: Konten freigeben, sperren, löschen und Rollen vergeben.
- **Rollen:** `bau`, `gruen`, `bv`, `admin`.
  - Ein Wertermittler-Konto ist entweder `bau` **oder** `gruen`, nie beides.
  - `bv` und `admin` können zusätzlich vergeben werden.
  - An jedem WEP sind immer zwei verschiedene Personen beteiligt.
- Keine Standard-Kleingartenanlage im Profil (entfernt mit PR #103). Die Anlage wird je WEP aus der KGA-Liste gewählt.

### 2. Ablauf und Zustände eines WEP

Der Server erzwingt die Zustände, nicht nur die Oberfläche.

| Zustand | Wer bearbeitet | Wer liest |
|---|---|---|
| `bau_in_arbeit` | Bau (Besitzer) | Bau |
| `gruen_in_arbeit` | Grün, **nur** den Grün-Teil (im eigenen Grün-WEP alles außer dem Bau-Teil) | Bau, Grün (Bau-Teil nur in der „Übersicht“); eigenes Grün-WEP nur Grün |
| `beim_bv` | niemand | Bau, Grün, BV |
| `rueckfrage` | die vom BV gewählte(n) Person(en) | Bau, Grün, BV |
| `geprueft` | niemand | Bau, Grün, BV |

- Zum **Grün-Teil** gehören Außenanlagen, Aufwuchs, Beseitigung Außenanlagen/Aufwuchs, Grün-Skizze und die Fotos zum Grün-Teil.
- **Abgabe Bau → Grün:** Bau wählt einen freigegebenen Grün-Wertermittler aus einer Liste. Danach ist das WEP für Bau gesperrt (nur lesen).
- **Abgabe Grün → BV:** Danach ist das WEP für beide gesperrt.
- **beim_bv:** Der BV prüft auf der Kontrollseite, wie heute auf `/bv`, aber mit Daten vom Server statt aus Dateien:
  Übersicht, Status, Notiz, PDF in beiden Formen, Drucken.
- **Rückfrage:** Der BV wählt `bau`, `gruen` oder beide und schreibt eine Notiz dazu.
  - Nur die gewählten Personen dürfen wieder bearbeiten.
  - Sie geben danach erneut ab: Bau → Grün → BV, oder direkt an den BV, wenn nur ein Teil zurückging.
- **geprueft:** Das WEP ist dauerhaft gesperrt. Nur BV oder Admin können es mit Begründung wieder öffnen; das wird protokolliert.
- Jeder Zustandswechsel kommt mit Zeit, Person und Notiz in den **Verlauf** des WEP.

#### Grün legt selbst an und führt zusammen (Korrektur vom 28.10.2026)

Wie in v1 kann Grün auch ohne Bau ein WEP anlegen. Ablauf:

1. Bau legt ein WEP an (Besitzer Bau, `bau_in_arbeit`).
2. Grün legt unabhängig ein **eigenes Grün-WEP** an (Besitzer Grün, kein Bau-Konto, `gruen_in_arbeit`). Grün bearbeitet dort
   alles außer dem Bau-Teil (Formalien, Grün-Teil, Fotos, Unterschrift Grün, Grün-Skizze). Bau sieht es nicht.
3. Bau gibt sein WEP an einen Grün-Wertermittler ab (wie bisher).
4. Grün nimmt das Bau-WEP an: **mit eigenem WEP zusammenführen** (Vorschlag nach Vorgangs-Nr., sonst Anlage + Parzelle;
   Auswahl aus allen eigenen offenen WEPs) oder **ohne eigenes WEP weiterarbeiten** (wie bisher).
5. Zusammenführen:
   - Ergebnis ist das Bau-WEP (Kennung, Verlauf und Abgabe bleiben), Zustand weiter `gruen_in_arbeit`.
   - Bau-Teil, Parzelle, Bau-Excel vom Bau-WEP (hat das Bau-WEP keine Parzelle, kommt die von Grün – Hinweis „Parzelle von
     Grün übernommen – bitte mit Bau abstimmen“); Grün-Teil, Grün-Skizze, Unterschrift Grün, Fotos an Grün-Positionen und
     allgemeine Fotos aus dem Grün-WEP (Fotodateien kopiert der Server in R2).
   - Stammdaten: Bau gilt. Unterschiede und im Bau-WEP leere Felder zeigt die Vorschau; Grün übernimmt je Feld den eigenen
     Wert (leere Felder und der eigene Name als Grün-Wertermittler sind vorgewählt). Nur Hinweise, nichts gesperrt.
   - Skizze: Die Grün-Elemente kommen auf die Bau-Skizze als Grundlage (wie „Grundlage übernehmen“). Ohne Bau-Grundlage
     gezeichnet → Hinweis „Lage der Grün-Elemente zur Laube prüfen“.
   - Vorschau vor dem Zusammenführen; rückgängig, solange nicht an den BV abgegeben (Bau-WEP wie vorher, eigenes WEP so
     wie beim Zusammenführen).
   - Das Grün-WEP wird nicht gelöscht, sondern als „zusammengeführt in <Bau-WEP>“ markiert und verschwindet aus allen
     Listen; Verlauf in beiden WEPs.
   - Offline: lokal sofort, der Server übernimmt beim Abgleich (erst das eigene WEP hoch, dann das Zusammenführen). An den
     BV abgeben erst, wenn der Server den Stand hat.
6. Grün gibt an den BV ab (wie bisher).
7. Eigenes Grün-WEP ohne Bau darf Grün direkt an den BV abgeben – mit Rückfrage „Kein Bau-Teil – bewusst ohne Bau
   abgeben?“. Rückfragen des BV gehen dann nur an Grün.

Rechte (Server, `src/server/rechte.ts`): Schreibrecht `ohne_bau` im eigenen Grün-WEP; Zusammenführen nur durch das
Grün-Konto, an das abgegeben wurde, nur mit eigenen offenen WEPs (`pruefeZusammenfuehren`); Bau sieht danach weiter nur
lesend, Grün-Eigenes bleibt für Bau unsichtbar, bis es zusammengeführt ist.

### 3. Benachrichtigungen

- **In der App:** eine Liste „Neu für dich“ für abgegebene WEPs, Rückfragen und geprüfte WEPs.
- **Per E-Mail über Resend**, je Konto abschaltbar.
  - Mails enthalten nur Vorgangs-Nr., Anlage, Parzelle und einen Link.
  - Keine Pächternamen und keine Beträge.

### 4. Server und Daten

- **Dienste:** Cloudflare Pages und Functions.
  - **D1:** Konten, Rollen, WEPs, Verlauf, Benachrichtigungen, Sitzungen.
  - **R2:** Fotos, Unterschriften, Bau-Excel.
  - **Speicherort EU:** D1 mit Jurisdiktion `eu`, R2-Bucket mit Jurisdiktion EU.
- Die Rechte prüft der Server **bei jedem Zugriff**: Wer darf welches WEP in welchem Zustand lesen oder schreiben?
- **Offline bleibt Pflicht:**
  - Gearbeitet wird lokal (IndexedDB) und mit dem Server abgeglichen. Konflikte bleiben sichtbar wie in v1.
  - Eine Abgabe geht erst, wenn der Stand beim Server angekommen ist.
- Im Server-Modus entfällt der OneDrive-Sync. Später kommt er vielleicht als Export oder Sicherung zurück.

### 5. Wiederverwenden aus v1

- Übersicht, Bau-Bewertung, Grün-Katalog, Skizzen (mit `window.wep`), PDF in beiden Formen, Unterschrift, Fotos,
  BV-Kontrollseite als Ansicht.
- Der Import von .wep-Dateien bleibt, zum Testen und für die spätere Migration.
- „Ohne Excel arbeiten“ bleibt. Excel gibt es nur in den Entwickleroptionen.

## Technische Leitplanken

Die Entscheidungen fallen im jeweiligen Paket und landen in docs/ENTSCHEIDUNGEN.md. Hier steht der Rahmen.

- **Anmeldung:** serverseitiger OIDC-Ablauf (Authorization Code mit PKCE und `state`/`nonce`) mit Client-Geheimnis
  für Google und Microsoft. Endpunkte:
  - `/api/v2/anmeldung/<anbieter>/start`
  - `/api/v2/anmeldung/<anbieter>/zurueck`

  Danach prüft der Server das ID-Token (Signatur gegen die Schlüssel des Anbieters, `aud`, `iss`, `exp`,
  `nonce`) und legt das Konto an oder findet es (Schlüssel: Anbieter + `sub` bzw. `tid`/`oid`).
- **Sitzungen:**
  - Zufälliges Token. In D1 liegt nur sein SHA-256-Hash mit Ablaufzeit.
  - **Browser:** Cookie `HttpOnly; Secure; SameSite=Lax`.
  - **Android und Windows** (anderer Ursprung): Die App übernimmt die Anmeldung über einen Einmal-Code und schickt
    das Token als `Authorization: Bearer`. Das klärt Paket 1. Bis dahin funktioniert der Server-Modus im Browser.
- **Datenbank:** SQL-Migrationen im Ordner `migrations/` (`0001_….sql`, …). Simon spielt sie über die D1-Konsole
  ein (docs/V2-EINRICHTUNG.md). Jede trägt ihre Nummer in `schema_stand` ein, und `/api/v2/status` zeigt den Stand.
  Tests laufen mit SQLite aus Node (`node:sqlite`) und denselben Migrationen, ohne Cloudflare-Konto.
- **WEP-Speicherung:**
  - Das WEP liegt als JSON (Format wie in v1) mit Revision (`rev`) in D1. Dazu kommen getrennte Spalten für die
    Abfragen: Zustand, Bau-Konto, Grün-Konto, Vorgangs-Nr., Anlage, Parzelle.
  - Schreiben mit `rev`-Prüfung (optimistisch). Bei einem Konflikt gibt es 409 mit dem Serverstand.
  - Grün darf nur Felder des Grün-Teils ändern. Der Server mischt sie in den gespeicherten Stand, Änderungen am
    Bau-Teil lehnt er ab.
- **Dateien** (Fotos, Unterschriften, Bau-Excel) liegen in R2 unter `weps/<id>/…`. Abgerufen werden sie nur über
  Functions mit Rechteprüfung; öffentliche R2-Adressen gibt es nicht.
- **Zustandsautomat:** eine reine Funktion `erlaubterUebergang(wep, konto, aktion)`. Server und Oberfläche nutzen
  dieselbe Funktion, damit Anzeige und Prüfung nie auseinanderlaufen. Getestet wird sie mit einer vollständigen Tabelle.
- **Native Apps:** Bevor Android oder Windows den Server-Modus nutzen, steigen ihre Versionsnummern.
  Bis dahin ist der Server-Modus ein Web-Thema.

## Datenschutz (vor echten Daten zwingend)

- Mit dem Server liegen Pächterdaten bei Simon und bei Cloudflare. Simon wird damit **Auftragsverarbeiter des BV**. Nötig sind:
  - AV-Vertrag BV ↔ Simon
  - Cloudflare-DPA
  - Speicherort EU
  - Lösch- und Aufbewahrungsregeln
  - Zugriffsprotokoll
- Simon ist 15: Die Verträge laufen über die Eltern, und vor dem Einsatz mit echten Daten braucht es eine Rechtsberatung.
- **Bis dahin nur Testdaten** auf dem Server, auch in Produktion. (Das frühere Band „v2-Vorschau – nur Testdaten“
  ist mit dem Schritt in Produktion entfallen; die Regel bleibt.)

## Reihenfolge (je Paket ein PR, nacheinander)

0. **Plan und Schalter** (dieser PR):
   - docs/PLAN-V2.md
   - Schalter `VITE_SERVER_MODUS`/`SERVER_MODUS`; ohne Schalter ändert sich nichts
   - `/api/v2/status` zum Prüfen der Einrichtung
   - Schritt-für-Schritt-Anleitung für Simon: Cloudflare (D1, R2 EU), Google Cloud Console, Resend, Azure
1. **Server-Grundgerüst:** D1/R2-Schema mit Migrationen, Functions, Anmeldung mit Google und Microsoft,
   Sitzungen, Freigabe, Admin-Seite.
2. **WEPs auf dem Server:** offline-fähig speichern und abgleichen, Rechteprüfung, Verlauf.
   - 2b: Fotos und Bau-Excel in R2 (eigener PR). Unterschriften bleiben vorerst im WEP-JSON.
3. **Ablauf:** Zustände, Abgabe Bau → Grün mit Auswahl, Grün bearbeitet nur den Grün-Teil, Abgabe an den BV, Sperren.
4. **BV-Kontrollseite mit Server-Daten:** Rückfrage mit Auswahl, geprüft und gesperrt, Wiederöffnen mit Begründung.
5. **Benachrichtigungen** in der App und per Resend.
6. **Anleitung** (`npm run anleitung`) und Durchlauf-Tests für den ganzen Weg mit drei Testkonten (Bau, Grün, BV).
7. **Später, vor echten Daten:** Migration der bestehenden WEPs (OneDrive/.wep → Server), erst nach AV-Vertrag und
   Rechtsberatung. (Die Schalter sind seit 28.10.2026 in Production an, auf dem Server liegen bis dahin nur Testdaten.)
8. **Server-Modus für Android und Windows:** Anmeldung per Bearer-Token (im Server vorbereitet), danach kein Hinweis
   „bitte im Browser nutzen“ mehr. Mit neuen Versionsnummern der Apps.

## Grundsätze

- Nur erfundene Testdaten. Die Vorlage wird nie verändert.
- Nichts sperren außer den Zuständen des Ablaufs; Regelverstöße erzeugen nur Warnungen.
- TASKS.md und docs/ENTSCHEIDUNGEN.md im selben PR pflegen.
- Keine Secrets ins Repo.
- Bei Änderungen an `android/`, Plugins oder `src-tauri/` steigen die Versionsnummern.
