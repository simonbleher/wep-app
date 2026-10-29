# Sicherheitsprüfung v2 (Server-Modus)

Stand 29.10.2026, Branch `claude/sicherheit-pruefung-v2-h2x461`. Unabhängige Prüfung von `functions/` (v2), `src/server/`,
`src-tauri/src/` und `android/…/WepNative*`/`ServerTokenStore`. Geprüft wurde **nur lokal**: Functions mit SQLite statt D1 und
einem R2-Ersatz im Arbeitsspeicher (wie `tools/v2/umgebung.ts`), dazu Unit-Tests. `https://wep-pankow.pages.dev` wurde nicht
angefasst. Alle Testdaten sind erfunden. Zeilenangaben beziehen sich auf den Stand dieses Branches.

**Tests zu den Funden:** `functions/_lib/__tests__/v2Sicherheit.test.ts` und `src/server/kontowechsel.test.ts`.
Behobene Funde haben normale Tests. Offene Funde stehen als `it.fails`: Der Test beschreibt das **sichere** Verhalten und
schlägt heute fehl (vitest zählt das als bestanden). Wird ein Fund behoben, meldet vitest den Test als „unerwartet bestanden“;
dann `it.fails` zu `it` machen.

## Ergebnis in Zahlen

| Schwere | Anzahl | Stand |
|---|---|---|
| kritisch | 0 | – |
| hoch | 1 | H1 behoben (dieser PR) |
| mittel | 8 | Vorschlag, Simon entscheidet |
| niedrig | 15 | Vorschlag, Simon entscheidet |

## Funde

Schwere: **kritisch** = ohne Konto ausnutzbar oder fremde Daten in großem Umfang · **hoch** = ein freigegebenes Konto
ändert oder liest, was ihm nicht zusteht · **mittel** = Missbrauch braucht Insider, besondere Umstände oder trifft
Verfügbarkeit/Datenschutz · **niedrig** = Härtung, kaum ausnutzbar.

| Nr. | Stelle | Beschreibung | Angriffsweg (ein Satz) | Schwere | Vorschlag |
|---|---|---|---|---|---|
| H1 | `functions/_lib/v2/dateien.ts:47-63`, `functions/api/v2/weps/[id]/dateien/[datei].ts:38-58` | Die Dateirechte kannten nur „darf schreiben“. Grün durfte jede `foto-<Id>.jpg` des Bau-WEP überschreiben und löschen, auch Fotos des Bau-Teils. Beim WEP-JSON verhindert `mitEigenemTeil` genau das. | Grün schickt `PUT …/dateien/foto-<Id eines Bau-Fotos>.jpg` mit einem anderen Bild (oder `DELETE`), und der BV sieht beim Prüfen ein falsches oder fehlendes Bau-Foto. | **hoch** | **Behoben:** `fotoTeil()` in `src/server/teile.ts` ordnet Fotos so zu wie beim Speichern. Sind beide beteiligt, gilt für Fotos des anderen Teils: nur eine noch fehlende Datei hochladen, nie überschreiben, nie löschen (Grün darf neue Fotos ohne Position hinzufügen; die zählen nach dem Speichern zum Bau-Teil). |
| M1 | `src/server/rechte.ts:162-163` | Ein Konto mit `bv` (oder `admin`) und `bau`/`gruen` kann sein eigenes WEP auf „geprüft“ setzen, eine Rückfrage stellen oder es wieder öffnen. | Eine Grün-Wertermittlerin, die auch BV ist, gibt an den BV ab und prüft das WEP dann selbst. | mittel | Frage an Simon: Vier-Augen-Prinzip erzwingen? Dann in `moeglicheAktionen` für `rueckfrage`/`geprueft`/`wiederoeffnen` zusätzlich `!istBeteiligt(kopf, konto)` prüfen. |
| M2 | `functions/_lib/v2/weps.ts:186-217`, `:312-332`; `src/server/teile.ts:83-100` | Es gibt kein Schema für das WEP-JSON. Geprüft werden nur `id` und Größe. Grün kann `gruen`/`skizze` in beliebiger Form speichern, Bau beliebige Felder. Bei `formalien: null` endet `an_gruen`/`an_bv` mit 500. | Grün speichert `gruen: "x"`, und die Ansicht von Bau und BV (und das PDF) bricht an diesem WEP ab. | mittel | Beim Speichern eine schlanke Formprüfung: `formalien`/`gruen` sind Objekte, Listen sind Arrays, Texte haben eine Höchstlänge. Sonst 400. |
| M3 | `functions/_lib/v2/oidc.ts:154-156`, `functions/_lib/v2/konten.ts:60-68` | (a) Ohne `@` in `preferred_username` übernimmt Microsoft den **unbestätigten** Anspruch `email` als Konto-Adresse. Admin-Seite, Grün-Auswahl und Mails zeigen bzw. nutzen sie. (b) `V2_ADMINS` gilt für jedes Microsoft-Konto, dessen `preferred_username` passt, auch aus fremden Tenants. Microsoft sagt ausdrücklich, dass `preferred_username` nicht für Rechte gedacht ist. | Wer in seinem eigenen Tenant eine Domain aus `V2_ADMINS` bestätigt hat (oder über das `email`-Feld eine fremde Adresse zeigt), wird Admin bzw. wirkt bei der Freigabe wie eine bekannte Person. | mittel | (a) Unbestätigte Adresse nicht speichern bzw. als „unbestätigt“ markieren; Admin-Seite zeigt Anbieter und Tenant. (b) `V2_ADMINS` mit Anbieter angeben (`google:adresse`) oder bei Microsoft zusätzlich `xms_edov`/den Tenant prüfen. Eine Konto-Übernahme über dieselbe E-Mail bei einem anderen Anbieter gibt es nicht (Schlüssel ist Anbieter + `sub` bzw. `tid:oid`). |
| M4 | `public/_headers` | Es fehlen Security-Header: kein `Content-Security-Policy` (auch kein `frame-ancestors`), kein `X-Frame-Options`, kein `X-Content-Type-Options: nosniff`, keine `Referrer-Policy`, keine `Permissions-Policy`. | Eine fremde Seite bettet `/` unsichtbar ein und lässt einen angemeldeten Admin auf „Freigeben“ oder „Rollen“ klicken (Clickjacking). | mittel | Für `/*` setzen: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com; worker-src 'self' blob:`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. CSP vorher mit `Content-Security-Policy-Report-Only` testen (v1 nutzt OneDrive und Graph). HSTS ist für `*.dev` durch die HSTS-Preload-Liste schon gesetzt. |
| M5 | `functions/api/v2/anmeldung/[anbieter]/start.ts:9-22`, `functions/_lib/v2/sitzung.ts:40-49`, `functions/api/v2/anmeldung/app/token.ts` | Nirgends gibt es eine Begrenzung von Anfragen. Jeder `GET …/start` schreibt **ohne Anmeldung** eine Zeile in D1. | Ein Skript ruft `/api/v2/anmeldung/google/start` in Schleife auf und verbraucht das Tageskontingent von D1 (Schreibzugriffe) bzw. Functions, und die App steht für alle still. | mittel | In Cloudflare eine Rate-Limiting-Regel (WAF) für `/api/v2/anmeldung/*` (z. B. 20/min je IP) und `/api/v2/*` (z. B. 300/min je IP). Code-Raten beim Einmal-Code ist dagegen kein Thema (256 Bit, 60 s, einmalig). |
| M6 | `functions/api/v2/weps/[id]/dateien/[datei].ts:38-50`, `functions/_lib/v2/benachrichtigungen.ts:25-28` | (a) Ein Konto kann beliebig viele Fotos zu je 15 MB hochladen, auch ohne Eintrag im WEP. Aufgeräumt wird erst bei der Abgabe an den BV. (b) Jede Abgabe an den BV schickt jedem BV-Konto eine Mail. Grün kann beliebig viele eigene WEPs anlegen und abgeben. | Ein freigegebenes Konto füllt R2 (Kosten) oder schickt in einer Schleife Hunderte Mails an alle BV-Konten und verbraucht das Resend-Kontingent. | mittel | (a) Höchstzahl Fotos je WEP (z. B. 300) und nur Foto-Ids, die im WEP stehen oder neu sind (`listeDateien` zählen). (b) Mails je Empfänger bündeln (höchstens eine je Stunde, Rest nur in „Neu für dich“), Anlegen/Abgeben je Konto und Tag begrenzen. |
| M7 | `src/app/db.ts:25`, `src/server/abgleich.ts:216`, `src/server/V2Tor.tsx:82-90` | Die lokale Ablage `wep-db-v2` gehört zu keinem Konto. Beim Abmelden bleibt sie stehen. Meldet sich auf demselben Gerät jemand anderes an, sieht diese Person die WEPs der vorigen, und der nächste Abgleich lädt nicht abgeglichene WEPs als ihre eigenen hoch. | Auf einem geteilten Vereins-Tablet meldet sich Person B nach Person A an, sieht A's offline erfasste WEPs (mit Pächterdaten) und lädt sie unbemerkt unter ihrem Konto hoch. | mittel | Ablage je Konto (`wep-db-v2-<konto-id>`) oder beim Kontowechsel fragen: „Daten der vorigen Person auf diesem Gerät löschen?“. Beim Abmelden anbieten, die lokalen Daten zu löschen. |
| M8 | `src-tauri/Cargo.toml:26`, `Cargo.lock` | `cargo audit`: `zip` 2.6.1 (und 4.6.1 im Lockfile) mit RUSTSEC-2026-0367/0368/0369 (bis 9.1 kritisch), `tokio` 1.54.0 (RUSTSEC-2026-0384, zurückgezogen). **Nicht ausnutzbar:** `webupdate.rs` nutzt nicht `extract()`, sondern prüft `enclosed_name()` und schreibt nur normale Dateien, nachdem die SHA-256 stimmt. | Nur, wenn später jemand `ZipArchive::extract` auf ein heruntergeladenes Paket anwendet. | mittel | `zip` auf ≥ 9 und `tokio` auf ≥ 1.54.1 heben (eigener PR, danach steigt `huelle-version`). `npm audit --omit=dev`: 0 Lücken. Die Funde in Dev-Abhängigkeiten (vitest/tinypool kritisch, vite-plugin-pwa/workbox niedrig) betreffen nur Build und Tests. Bei Gelegenheit vitest auf 5 heben. |
| N1 | `functions/_lib/v2/kontext.ts:24`, `functions/_lib/v2/sitzung.ts:74-75` | Die Origin-Prüfung lässt jede Anfrage mit `Authorization: Bearer …` durch (`startsWith`). Die Sitzung liest das Token aber nur mit `^Bearer (\S+)$`. Bei `Bearer a b` fällt sie auf das **Cookie** zurück, ohne dass die Herkunft geprüft wurde. | Aus einem Browser nicht ausnutzbar (der Kopf `Authorization` braucht einen Preflight, und der scheitert für fremde Herkünfte). Wird aber CORS je gelockert, öffnet das CSRF. | niedrig | In `fremdeHerkunft` dasselbe Muster wie in `kontoDerSitzung` nutzen und bei vorhandenem `Authorization` nie auf das Cookie zurückfallen. |
| N2 | `functions/_lib/v2/appAnmeldung.ts:70-76` | Einmal-Code: `SELECT`, danach `DELETE`, nicht atomar. Zwei gleichzeitige Anfragen lösen ihn beide ein. | Nur mit dem Verifier möglich, also nur durch die App selbst. Es entstehen zwei Sitzungen statt einer. | niedrig | `DELETE FROM app_codes WHERE code_hash = ? RETURNING *` in einem Schritt. |
| N3 | `functions/_lib/v2/appAnmeldung.ts:76`, `functions/api/v2/anmeldung/app/token.ts` | Beim Token-Tausch wird der Kontostatus nicht geprüft. Wird ein Konto in den 60 s zwischen Code und Tausch gesperrt, bekommt es eine neue Sitzung. | Wirkung gering: Alle Daten-Endpunkte prüfen den Status bei jeder Anfrage. Nur `/ich` und `/ich/sitzungen` antworten. | niedrig | In `loeseAppCodeEin` gesperrte Konten ablehnen. |
| N4 | `functions/_lib/v2/dateien.ts:42` | Der Kopf für die Dateirechte enthält `rueckfrageAn`/`rueckfrageBei` nicht. Bei einer Rückfrage darf darum **niemand** Fotos hochladen (sicher, aber ein Fehler im Ablauf). | – (verweigert zu viel, nicht zu wenig) | niedrig | Denselben `rechteKopf` wie in `weps.ts` verwenden. Der H1-Schutz greift dann auch bei der Rückfrage. |
| N5 | `functions/_lib/v2/sitzung.ts:22-24` | Das Sitzungs-Cookie heißt `wep_sitzung` und hat kein `__Host-`-Präfix. Vorschau-Adressen `*.wep-pankow.pages.dev` sind Unterdomains und dürfen Cookies für `wep-pankow.pages.dev` setzen. | Wer einen Branch mit eigenem Code als Vorschau bauen lassen kann, schiebt Besuchern ein Sitzungs-Cookie unter (Login-CSRF). | niedrig | `__Host-wep_sitzung` (Path=/, Secure, ohne Domain). Beim Umstellen bleiben alte Sitzungen einmal ungültig. |
| N6 | `functions/_lib/v2/sitzung.ts:10`, `functions/api/v2/ich/sitzungen.ts` | Sitzungen gelten 30 Tage fest, ohne Ende bei Untätigkeit. Ein Konto kann sich selbst nur Gerät für Gerät abmelden, nicht „überall“ auf einmal. | Ein verlorenes, entsperrtes Gerät bleibt bis zu 30 Tage angemeldet, wenn niemand es bemerkt. | niedrig | Ende nach z. B. 14 Tagen ohne Nutzung (bei Nutzung verlängern) und „Überall abmelden“ im Profil. |
| N7 | `functions/_lib/v2/weps.ts:192-205` | Die WEP-Kennung bestimmt die App. Ein freigegebenes Konto kann jede noch freie Kennung belegen, auch alte, erratbare wie `2026-007` aus .wep-Importen. Ein 404 statt 200 verrät außerdem, ob es eine Kennung schon gibt. | Ein Konto belegt vorab `2026-001 … 2026-999`, und die spätere Migration bzw. der Import eines Kollegen scheitert für diese WEPs. | niedrig | Neue Kennungen nur als UUID annehmen. Alte Kennungen nur über die Migration (Paket 7), nicht über `PUT`. |
| N8 | `src/server/rechte.ts:190`, `:199`; `functions/_lib/v2/weps.ts:387` | Rückfrage-Notiz, Begründung und `felder` beim Zusammenführen haben keine Höchstlänge. Sie landen im Verlauf. | Ein Konto bläht den Verlauf mit Megabyte-Texten auf, bis D1 die Zeile ablehnt (Fehler 500). | niedrig | Notiz/Begründung auf z. B. 2000 Zeichen begrenzen, `felder` auf bekannte Formalien-Felder. |
| N9 | `functions/api/v2/status.ts:5-6` | `/api/v2/status` zeigt ohne Anmeldung, welche Teile eingerichtet sind (Google, Microsoft, Mail, Admins), und den Schema-Stand. | Ein Angreifer erfährt, ob z. B. Mail eingerichtet ist (geringer Nutzen). | niedrig | Ohne Anmeldung nur `google`/`microsoft` (braucht die Anmeldeseite), den Rest nur für Admins. |
| N10 | `functions/api/v2/anmeldung/[anbieter]/zurueck.ts:13-21`, `src/server/V2Tor.tsx:31-40` | `?anmeldefehler=<Text>` zeigt beliebigen Text auf der Anmeldeseite (React maskiert ihn, kein XSS). Auch der Fehlertext des Anbieters wird durchgereicht. | Ein Phishing-Link `https://wep-pankow.pages.dev/?anmeldefehler=Bitte rufen Sie … an` zeigt eine falsche Meldung unter der echten Adresse. | niedrig | Nur feste Fehlerschlüssel übergeben (`?anmeldefehler=abgelaufen`), Texte in der App. |
| N11 | `functions/_lib/v2/weps.ts:276-281`, `:259-267` | Jedes Bau-Konto sieht Namen **und E-Mail-Adressen** aller Grün-Konten. Der Verlauf zeigt die E-Mail, wenn kein Name gesetzt ist. | Ein Bau-Konto sammelt die Adressen aller Grün-Wertermittler (Datensparsamkeit). | niedrig | In der Grün-Auswahl nur Name (und ggf. Anlage), keine Adresse. Im Verlauf ohne Namen „Konto“ statt Adresse. |
| N12 | `src/server/teile.ts:113` | Beim Zusammenführen übernimmt Grün mit `felder` **jedes** Formalien-Feld aus dem eigenen WEP, auch `wertermittlerBaulichkeiten` (Name des Bau-Wertermittlers). | Grün setzt beim Zusammenführen einen anderen Namen als Bau-Wertermittler ins Protokoll. | niedrig | Frage an Simon: Felder des Bau-Teils (z. B. `wertermittlerBaulichkeiten`) von der Übernahme ausnehmen? |
| N13 | `functions/_lib/v2/benachrichtigungen.ts:65`, `functions/api/v2/weps/[id]/aktion.ts:24` | Der Fehlertext von Resend (bis 200 Zeichen, kann die Empfängeradresse enthalten) landet in `console.error` (Cloudflare-Logs) und in `benachrichtigungen.mail_fehler`. | Wer Zugriff auf die Logs hat, sieht E-Mail-Adressen. Sonst keine Tokens oder Inhalte in Logs. | niedrig | Nur Status-Code und Fehlerart protokollieren, nicht den Text. |
| N14 | `functions/_lib/v2/appAnmeldung.ts:28-38` | Der Start einer App-Anmeldung nimmt jede `challenge` an. Wer einen Start-Link mit eigener challenge verschickt, bekommt den Code nur, wenn auf dem Gerät des Opfers eine Schad-App den Rücksprung abfängt (`de.wep.app://` oder den Loopback-Port). | Schad-App auf dem Handy registriert `de.wep.app://auth` und tauscht den abgefangenen Code mit dem Verifier des Angreifers. | niedrig | Für Android App Links (https, verifiziert) statt eigenem Schema. Im Browser vor dem Rücksprung anzeigen: „Anmeldung für die WEP-App auf diesem Gerät?“. |
| N15 | `functions/_lib/v2/oidc.ts:132` | `aud` als Liste wird angenommen, wenn die Client-ID darin steht. `azp` wird nicht geprüft. | Praktisch nicht ausnutzbar: Das ID-Token kommt vom Token-Endpunkt (mit Client-Geheimnis), nicht vom Nutzer. | niedrig | Bei mehreren Empfängern `azp === clientId` verlangen. |

## Geprüft und in Ordnung

**Rechte (jede Route, jede Rolle, jeder Zustand)**
- Ohne Anmeldung 401, wartend/gesperrt 403 auf allen Daten-Routen.
- `GET /ich` und `/ich/sitzungen` gehen auch wartend (gewollt).
- Fremde WEPs: 404 bei Lesen, Speichern, Löschen, Verlauf, Dateiliste, Datei, Aktion und Liste. Das gilt auch für BV und Admin vor der Abgabe.
- Grün schreibt im WEP-JSON nur den Grün-Teil. Formalien, Bau-Teil, Bau-Fotos und `ablauf` kommen vom Server.
- Bau schreibt nach der Abgabe nichts mehr (WEP, Dateien, Papierkorb).
- Nur BV fragt zurück und prüft. Nur BV/Admin öffnen wieder, mit Begründung.
- Bei einer Rückfrage an Bau schreibt Grün nicht.
- Zusammenführen geht nur mit einem eigenen offenen Grün-WEP und nur durch das Grün-Konto, an das abgegeben wurde. Rücknahme nur durch dieses Konto.
- Das eigene Grün-WEP bleibt für Bau unsichtbar.
- Admin-Endpunkte nur mit Admin. Rollen lassen sich nicht selbst setzen (`PATCH /ich` übernimmt nur `mailBenachrichtigung`). Der eigene Admin lässt sich nicht entfernen.
- Benachrichtigungen nur eigene, auch beim Markieren als gelesen.
- `an_gruen` nur an freigegebene Grün-Konten und nicht an sich selbst.
- Rückfrage an Bau bei einem Grün-WEP ohne Bau wird abgelehnt.

**Anmeldung (OIDC)**
- `state` hängt am Cookie des Browsers und gilt einmalig, 10 Minuten. Login-CSRF ist damit verhindert.
- `nonce` und PKCE S256 werden geprüft.
- ID-Token: Signatur RS256 gegen das JWKS des Anbieters, nur `alg: RS256`, `aud`, `exp`/`nbf` mit 5 Minuten Spiel.
- `iss`: Google fest. Microsoft `…/<tid>/v2.0` passend zum `tid` im Token, daher kein fremder Aussteller unter „common“. Das Konto hängt an `tid:oid`, ein fremder Tenant erzeugt also nur ein eigenes, wartendes Konto.
- Google: `email_verified` ist nötig, damit `V2_ADMINS` greift.
- Gesperrte Konten bekommen weder Sitzung noch Einmal-Code.
- Rücksprung nur auf Pfade derselben Seite (`sicheresZiel`, immer mit `origin` davor), kein Open Redirect.

**App-Anmeldung**
- Einmal-Code: 256 Bit, in D1 nur als SHA-256, 60 s gültig, wird auch bei falschem Verifier verbraucht.
- Verifier gegen die S256-Challenge geprüft.
- Rücksprung nur `de.wep.app://auth/server` oder `http://127.0.0.1:<1024-65535>/`.
- Die App prüft den `state`.
- Token: Android in EncryptedSharedPreferences (Keystore, `allowBackup=false`), Windows im Credential Manager, nie im localStorage.
- Abmelden löscht die Sitzung auf dem Server (Bearer) und lokal. Widerruf über Profil und Admin.
- Tauri: `anmeldung_browser` öffnet nur die Anmeldeseiten, `token_anfrage` geht nur an Microsofts Token-Endpunkt. Der Loopback-Server nimmt nur `GET` mit `code=`/`error=` an (höchstens 8 KB Kopf, 5 Minuten).

**Sitzungen**
- Token 256 Bit, in D1 nur der Hash.
- Cookie `HttpOnly; Secure; SameSite=Lax`.
- Jede schreibende Cookie-Anfrage braucht `Origin` = eigene Herkunft (ohne Origin 403).
- Sperren und Löschen beenden alle Sitzungen sofort, und der Status wird bei jeder Anfrage neu gelesen.
- Admin „Überall abmelden“.

**CORS**
- Nur `https://localhost`, `https://tauri.localhost` und `http://tauri.localhost`.
- Kein `Allow-Credentials`, keine gespiegelten fremden Origins.
- Preflight fremder Herkunft 403. Ohne `SERVER_MODUS` 404.

**Eingaben**
- Alle SQL-Anweisungen mit Platzhaltern. `IN (…)` wird aus `?` gebaut, die übrigen Bausteine sind feste Texte.
- WEP-JSON höchstens 1,9 MB, Fotos 15 MB, Bau-Excel 10 MB. Geprüft werden `Content-Length` und die tatsächliche Größe.
- Dateityp über die ersten Bytes (JPEG `FF D8`, XLSX `PK`), die Antwort immer mit festem Typ.
- R2-Pfade nur `weps/<[A-Za-z0-9_-]{1,64}>/fotos/<[A-Za-z0-9_-]{1,64}>.jpg` bzw. `…/bau.xlsx`, kein `../`.
- XSS: React maskiert Namen, Notizen und Beschriftungen. Die einzige `dangerouslySetInnerHTML`-Stelle (Skizzen-Symbole) maskiert Text (`esc`), Zahlen laufen durch `Math.round`, Farben sind Konstanten.
- Mails maskieren HTML, ihr Link wird maskiert.
- Prototype-Pollution beim Zusammenführen: `hasOwnProperty` verhindert `__proto__`.

**Datenschutz**
- Das Zugriffsprotokoll enthält Konto-Id, Aktion, Ziel-Id und kurze Details, keine WEP-Inhalte und keine Tokens.
- Keine Tokens oder E-Mails in `console.*` (Ausnahme N13).
- Fehlermeldungen an den Client ohne Stacktraces.
- `/api/v2/status` zeigt nur ja/nein (siehe N9).
- Mails enthalten nur Vorgangs-Nr., Anlage, Parzelle und Link, ohne Pächternamen und Beträge (sofern niemand Namen in diese Felder schreibt).

**Konfiguration**
- Der Service Worker cached keine API-Antworten: kein `runtimeCaching`, `navigateFallbackDenylist` mit `/api/`.
- API-Antworten tragen `cache-control: no-store`, Dateien `private, no-store`.
- Tauri hat eine strenge CSP und nur `core:default`.

**Nicht geprüft**
- v1-Endpunkte (`functions/api/bv/*`, `functions/api/ki/*`), nur überflogen: KI ist hinter `KI_AKTIV` abgeschaltet.
- Echte Geräte und Cloudflare-Einstellungen (WAF, Zugriff auf Vorschau-Adressen).
- Die Integrität der Live-Updates hängt an TLS und dem Hosting, `version.json` liefert die SHA-256 vom selben Server, es gibt keine Signatur. Nur ein Hinweis: Wer das Cloudflare-Konto übernimmt, kann jedem Gerät Code ausliefern.

## Offene Fragen an Simon

1. **M1:** Soll ein BV-Konto, das selbst Bau oder Grün an einem WEP ist, dieses WEP prüfen dürfen?
2. **N12:** Sollen beim Zusammenführen Felder des Bau-Teils (Name des Bau-Wertermittlers) aus dem Grün-WEP übernommen werden dürfen?
3. **M3:** Welche Adressen stehen in `V2_ADMINS`, und mit welchem Anbieter melden sich diese Personen an? Danach richtet sich, wie streng die Prüfung sein muss.
4. **M7:** Werden Geräte von mehreren Personen genutzt (Vereins-Tablet)? Dann sollte die lokale Ablage je Konto getrennt werden.
5. **M5:** Ist das Cloudflare-Konto im kostenlosen Tarif? Dann ist die Rate-Limiting-Regel (WAF) vor echten Daten wichtig.
6. **H1, Restrisiko:** Hat Bau ein Foto ins WEP aufgenommen, die Datei aber noch nicht hochgeladen (offline), kann Grün die fehlende Datei zuerst hochladen. Danach kann Bau sie nicht mehr ersetzen, weil Bau nach der Abgabe gesperrt ist. Reicht das, oder soll der Server sich merken, wer eine Datei hochgeladen hat?
