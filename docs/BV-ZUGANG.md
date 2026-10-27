# Zugang zur BV-Kontrollseite (/bv) einrichten

Die Kontrollseite `https://wep-pankow.pages.dev/bv` kann nur für freigegebene Personen
geöffnet werden. Wer sie öffnet, meldet sich mit seinem Microsoft-Konto an
(persönlich oder Geschäfts-/Schulkonto). Beim ersten Mal entsteht ein **Antrag**, die
Seite zeigt „Zugang beantragt – wartet auf Freigabe“. Ein Admin gibt unter
`https://wep-pankow.pages.dev/bv/admin` frei, sperrt oder löscht.

- **Auf dem Server liegen nur Anträge und Freigaben:** Objekt-ID, Tenant-ID, Name,
  E-Mail, Status und Zeiten. **Keine WEP-Daten.** Die Protokolle bleiben im Browser
  des BV-Rechners.
- Das Microsoft-ID-Token prüft eine kleine Cloudflare Pages Function auf dem Server:
  Signatur mit den Schlüsseln von Microsoft, Empfänger = Client-ID der App, Aussteller
  passend zum Tenant und Ablaufzeit.
- **Ohne Netz** bleibt die Seite nach der letzten bestätigten Freigabe noch **7 Tage** offen.
- **Solange die Kontrolle nicht eingeschaltet ist**, öffnet sich die Seite ohne Anmeldung,
  wie bisher. So ist es auch auf `main.wep-pankow.pages.dev`: In der Vorschau
  funktioniert die Microsoft-Anmeldung nicht, deshalb dort die Variable unten nicht setzen.

## Schritt für Schritt (einmalig, Simon)

### 1. KV-Namensraum anlegen
1. <https://dash.cloudflare.com> → links **Speicher & Datenbanken → KV** (englisch
   *Storage & Databases → KV*; in älteren Oberflächen *Workers & Pages → KV*).
2. **Namensraum erstellen** (*Create namespace*) → Name `wep-bv-zugang` → **Hinzufügen**.

### 2. KV an das Pages-Projekt binden
1. **Workers & Pages** → Projekt **wep-pankow** → **Einstellungen** (*Settings*) →
   **Bindungen** (*Bindings*). In älteren Oberflächen: **Funktionen → KV-Namensraumbindungen**.
2. **Bindung hinzufügen** → **KV-Namensraum**:
   - **Variablenname:** `BV_ZUGANG` (genau so geschrieben)
   - **KV-Namensraum:** `wep-bv-zugang`
3. Das für **Produktion** (*Production*) **und** **Vorschau** (*Preview*) tun. Oben lässt
   sich die Umgebung umschalten. In der Vorschau bleibt die Kontrolle trotzdem aus,
   solange dort `BV_ZUGANG_AKTIV` fehlt.

### 3. Variablen setzen (nur Produktion)
**Einstellungen → Variablen und Geheimnisse** (*Variables and Secrets*) → Umgebung
**Produktion**:

| Name | Wert | Typ |
|---|---|---|
| `BV_ZUGANG_AKTIV` | `true` | Text |
| `BV_ADMINS` | E-Mail-Adresse(n) der Admins, kommagetrennt, z. B. die eigene Microsoft-Anmeldeadresse. Alternativ die Objekt-ID | Text |

`VITE_MS_CLIENT_ID` ist schon gesetzt und wird von der Function mitgenutzt.

### 4. Umleitungs-URI in Azure ergänzen
<https://entra.microsoft.com> → App-Registrierungen → **WEP-App** → **Authentifizierung** →
bei **Single-Page-Webanwendung** die Adresse `https://wep-pankow.pages.dev/bv` hinzufügen
(ohne Schrägstrich am Ende) → **Speichern**.
Für Geschäftskonten des BV müssen außerdem die unterstützten Kontotypen umgestellt sein
(docs/SYNC.md, Abschnitt „Alle Microsoft-Konten“).

### 5. Neu veröffentlichen und testen
1. Unter **Bereitstellungen** die letzte Produktions-Bereitstellung **erneut ausführen**
   (Variablen und Bindungen wirken erst nach einem neuen Deploy). Oder „Version freigeben“.
2. `https://wep-pankow.pages.dev/bv` öffnen → **Mit Microsoft anmelden** → mit der
   Admin-Adresse landet man direkt auf der Kontrollseite, oben steht „Freigaben verwalten“.
3. Mit einem zweiten Konto anmelden → „Zugang beantragt – wartet auf Freigabe“ →
   als Admin unter `/bv/admin` **Freigeben** → beim zweiten Konto **Erneut prüfen**.

## Ausschalten
`BV_ZUGANG_AKTIV` löschen oder auf `false` setzen und neu bereitstellen. Die Seite ist dann
wieder ohne Anmeldung offen, die Anträge bleiben im KV erhalten.

## Technik
| Datei | Aufgabe |
|---|---|
| `functions/_lib/idToken.ts` | ID-Token prüfen (RS256 gegen Microsoft-JWKS, `aud`, `iss` = `…/<tid>/v2.0`, `exp`/`nbf`) |
| `functions/_lib/freigaben.ts` | Anträge/Freigaben im KV, Admins aus `BV_ADMINS` |
| `functions/api/bv/konfig.ts` | `GET` – ist die Kontrolle eingeschaltet? |
| `functions/api/bv/zugang.ts` | `POST` mit ID-Token – eigener Status, beim ersten Mal Antrag |
| `functions/api/bv/admin/nutzer.ts` | `GET`/`POST` – Liste, freigeben, sperren, löschen (nur Admins) |
| `src/bv/zugang.ts`, `BvZugang.tsx`, `BvAdmin.tsx`, `anmeldung.ts` | Seite: Entscheidung, 7 Tage offline, Anmeldung (MSAL, nur `openid profile email`, Sitzungsspeicher) |
