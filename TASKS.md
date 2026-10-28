# Aufgaben

Status: ⬜ offen · 🔄 in Arbeit · ✅ PR offen · ✅ erledigt

Jede Aufgabe wird in ihrem Slack-Channel als **eigener Thread** gestartet.
Der fertige Prompt steht jeweils darunter.

> **Beta-Umfang (Stand 2026-10-16):** Nur ein Nutzer (Simon, Grün-Wertermittler).
> Kein Bau-Teil in der App, kein BV-OneDrive. Sync zwischen Simons Geräten über
> sein **privates OneDrive**. Der Bau-Teil kommt als fertig ausgefüllte
> **Bau-Excel** vom Bau-Wertermittler; die App schreibt den Grün-Teil hinein.
> Siehe docs/ARCHITEKTUR.md, Abschnitt „Beta-Umfang“.

## Phase 1 – Grün-Teil

### K1 · Katalog aus der BewRL ✅ (#katalog)
Ergebnis: `data/katalog.json` + `data/katalog.schema.json` + kurze Doku `data/README.md`
Stand: Branch katalog/bewrl-katalog – katalog.json (52 Positionen inkl. S. 18 Ziergehölze/Hecken/Rasen+geschützter Baum), invasive.json (41 Arten), Schema + README – PR #1 gemergt.
> Lies CLAUDE.md und docs/ARCHITEKTUR.md. Erstelle aus docs/Richtlinie.pdf (Abschnitte
> II Außenanlagen und III Aufwuchs, S. 12–18) den Katalog data/katalog.json: jede
> Position mit id, Kategorie, Bezeichnung, Einheit, Altersstufe/Form (falls vorhanden),
> Höchstwert in €, Seitenzahl der Richtlinie und den relevanten Regeln als Text.
> Ergänze ein Feld "arten" mit gängigen Pflanzen, die in diese Kategorie fallen
> (Apfel, Birne, Liguster, Kirschlorbeer, Thuja, Forsythie …), und ein Feld
> "relevanz" (1–5) für die Sortierung im Kleingarten. Lege außerdem
> data/invasive.json aus der Unionsliste (Anlage, S. 25) an. Prüfe jeden Höchstwert
> gegen das PDF. Erstelle einen PR.

### K2 · Suche & Sortierung ✅ (#katalog) – inkl. Nachbesserungen (PR #5)
> Implementiere in src/katalog/ eine Suchfunktion über data/katalog.json:
> tippfehlertolerant, findet auch Arten-Namen (Apfel → Obstgehölz), sortiert ohne
> Suchbegriff nach relevanz und "zuletzt verwendet". Mit Unit-Tests. PR.

### K3 · Kleinigkeit Suche ✅ (#katalog)
> „Insektenhotel“ findet das Ökologische Objekt nicht: Varianten-Feld `typ` in die
> Suche aufnehmen (src/katalog/suche.ts) und testen. PR.

### A1 · PWA-Grundgerüst ✅ (#app-gruen)
> Lies CLAUDE.md und docs/ARCHITEKTUR.md. Lege das PWA-Grundgerüst an (TypeScript,
> Vite, installierbar, offline per Service Worker, IndexedDB). Begründe die
> Framework-Wahl in docs/ENTSCHEIDUNGEN.md. Ziel-Geräte: Handy und Tablet im
> Freien → große Bedienelemente, hoher Kontrast. Lege src/model/ mit den Typen aus
> der Architektur an. Startseite: Liste der WEPs + „Neues WEP“. PR.

### A2 · Erfassung Formalien + Aufwuchs + Außenanlagen ✅ (#app-gruen) – nach A1, K2
> Baue die Erfassungsmasken: Formalien, Außenanlagen, Aufwuchs. Position hinzufügen
> über Schnellsuche (src/katalog), dann Anzahl, Einheit, Zustand, Preis
> (Vorschlag = Höchstwert × Zustand, überschreibbar), eigene Pflanze per Freitext.
> Regel-Warnungen anzeigen, nicht blockieren. Live-Summe. PR.

### A3 · Verbesserungen Erfassung ✅ (#app-gruen) – nach A2 (von der Leitung selbst umgesetzt)
> Kürzere Bezeichnungen mit gefundener Art („Liguster-Hecke (Laub, einfache Art)“,
> „Apfel, Halbstamm, 5–30 J.“), Bezeichnung immer editierbar; Variante aus dem
> Suchtreffer übernehmen (Variantenschritt überspringen); Richtlinien-Infos in der
> Positionsliste einklappbar, Warnungen bleiben sichtbar; deutsche Zahlen (Komma
> bei Eingabe und Anzeige, Faktor 0,75); alle Labels mit ihren Feldern verknüpft. PR.

### E1 · Excel-Export: Bau-Excel + App → fertiges WEP ✅ (#export) – PR #7
> Lies CLAUDE.md und docs/ARCHITEKTUR.md (Abschnitte „Beta-Umfang“ und Zellen-Mapping).
> Schreibe src/export/: Eingabe ist ein Wep-Objekt aus der App plus **optional eine
> Bau-Excel** (die WEP-Vorlage, in der der Bau-Wertermittler seine Blätter schon
> ausgefüllt hat). Ohne Bau-Excel wird eine Kopie von docs/WEP_Vorlage.xlsx genutzt.
> Die App schreibt nur die Grün-Zellen (Außenanlagen, Aufwuchs I/II,
> Beseitigungskosten Abschnitt 2, Formalien E13) und Formalien-Felder, die in der
> Bau-Excel noch leer sind. Abweichende, bereits gefüllte Formalien nicht
> überschreiben, sondern als Hinweis anzeigen. Bau-Blätter niemals verändern.
> Formeln und Formatierung bleiben erhalten, Überlauf Aufwuchs I → II. Ergebnis als
> neue Datei <Vorgangs-Nr>_WEP.xlsx zum Download. Bibliothek muss im Browser laufen;
> Wahl in docs/ENTSCHEIDUNGEN.md begründen. Tests: mit und ohne Bau-Excel
> exportieren, mit LibreOffice neu berechnen, Summen prüfen, und prüfen, dass
> Bau-Blätter byte-gleich bleiben. PR.

### E2 · Skizze als Bild in die Excel ✅ (#export) – von der Leitung umgesetzt
> `exportWep(wep, excel, { skizzePng })` fügt das PNG ins Blatt „Skizze
> Außenanlage-Aufwuchs“ ein (Bereich B7:G48, Seitenverhältnis bleibt, zentriert).
> Erneuter Export ersetzt die alte App-Skizze. Bau-Blätter unverändert. Die App
> übergibt das PNG (skizzeAlsPng) im Export-Tab, sobald S2 gemerged ist.

### E3 · Grün-Skizze als native Excel-Formen ✅ (#export) – Branch export/skizze-formen
> `exportWep(wep, excel, { skizzeFormen })` schreibt die Skizze als bearbeitbare Formen
> (`xdr:sp`/`cxnSp`/`pic` mit SVG + PNG-Fallback) an das vorhandene Drawing von „Skizze
> Außenanlage-Aufwuchs“; Bau-Kopie und Vorlagen-Textfelder bleiben byte-gleich, erneuter
> Export ersetzt nur Formen mit `descr="wep-app"`. Stil nach `docs/skills/parzellen-skizze.md`.
> PNG nur noch Fallback (`skizzeAlsBild`, Checkbox im Export-Tab). Vergleichsbild:
> `npm run ki-test-skizze-export` → `tools/ki-test/ergebnis-skizze/fall1/formen-export.png`.
> Offen: Sichtprüfung in echtem Excel (nur LibreOffice getestet), Editor mit den neuen
> Elementtypen (Hecke, Baum …) – bis dahin erzeugt nur die KI-Strecke Lageplan-Elemente.

### S1 · Einfaches Skizzen-Tool ✅ (#skizze) – PR #9, nach A1
> Einfache Zeichenfläche für die Parzellenskizze: Rechteck, Linie, Kreis (Baum),
> Text, Maßangabe, Rückgängig. Speichern als JSON, Export als PNG für die Vorlage.
> Touch-tauglich. Vorläufige Lösung, wird später ersetzt – also schlank halten. PR.

### S2 · Skizze in die Erfassung einbauen ✅ (#skizze) – von der Leitung umgesetzt (Agent-PR #15 lag auf veraltetem Stand)
> Tab „Skizze“ zwischen Beseitigung und Export mit dem SkizzeEditor, Speichern
> entprellt in `wep.skizze` (beim Verlassen sofort), Excel-Export fügt die Skizze
> automatisch ins Blatt „Skizze Außenanlage-Aufwuchs“ ein (E2).

### Y1 · Sync über Simons privates OneDrive ✅ (#sync) – PR #8, Anleitung in docs/SYNC.md
> Lies CLAUDE.md und docs/ARCHITEKTUR.md (Abschnitt „Beta-Umfang“). Implementiere in
> src/sync/ die Synchronisation der WEPs zwischen Simons Geräten über sein privates
> OneDrive: Microsoft Graph, Anmeldung mit MSAL.js (Authorization Code + PKCE, privates
> Microsoft-Konto), Berechtigung nur Files.ReadWrite.AppFolder (App-Ordner
> „Apps/WEP-App“). Eine JSON-Datei pro WEP. Offline-Warteschlange in IndexedDB,
> Upload sobald Netz da ist. Konflikte (gleiches WEP auf zwei Geräten geändert):
> neuere Änderung gewinnt, ältere Version als Kopie behalten und Hinweis anzeigen.
> Client-ID über Konfiguration (keine Secrets im Repo). Schreibe docs/SYNC.md mit
> Schritt-für-Schritt-Anleitung, wie Simon die App im Azure-Portal mit seinem
> privaten Konto registriert (Redirect-URIs für localhost und die spätere
> Veröffentlichung). Tests mit gemocktem Graph-Client. PR.

## Beta 2 (Plan: docs/PLAN-BETA2.md)

### B2-2 · Konto, Login, Profil, Ordnerstruktur ✅ (#app-gruen) – Branch app/konto-profil
Ergebnis: Konto-Modul `src/konto/` (Web/MSAL, Schnittstelle für die spätere Android-Umsetzung),
Login-Bildschirm mit „Ohne Konto fortfahren“, Profil-Bildschirm, Ordner `daten/` · `Exporte/` ·
`LIESMICH.txt` im OneDrive (Migration beim ersten Abgleich), Excel-Export zusätzlich nach `Exporte/`
(Warteschlange offline), Profil-Abgleich über `daten/profil.json`. Playwright-Durchlauf: `npm run e2e`.
Details: docs/SYNC.md, docs/ENTSCHEIDUNGEN.md. Offen: Schritt 4 (Design).

### B2-3 · Android-Test-APK ✅ (#app-gruen) – Branch android/test-apk
Ergebnis: Capacitor-Hülle (`android/`, App-ID `de.wep.app`), Android-Anmeldung `src/konto/android.ts`
(System-Browser + PKCE, Token nativ), Hintergrund-Upload (WorkManager, Warteschlange, eigenes
Kotlin-Plugin), Test-Seite im Profil, Workflow „Android Test-APK“. **Nur Machbarkeitstest**, noch nicht
auf einem Gerät erprobt. Anleitung und Grenzen: docs/ANDROID.md. Offen: Schritt 4 (Design), 5 (fertige APK).

### B2-4a · Design-Entwürfe ✅ (#design) – Branch design/entwurf
Ergebnis: eigenständige Vorschau `entwurf.html` (WEP-Liste, Erfassung Aufwuchs, Position hinzufügen;
erfundene Daten), Design-Tokens `src/design/tokens.css`, Screenshots Handy/Tablet in `docs/entwurf/`
(`npm run entwurf:screenshots`). Die App selbst ist unverändert. **Wartet auf Simons Freigabe**, danach
B2-4b · Umbau der App mit den Tokens.

### B2-4b · Umbau der App, Teil A ✅ (#design) – Branch design/umbau-a
Ergebnis: App im freigegebenen Entwurfs-Stil (nur Tokens, lucide-Icons, keine Emojis): Rahmen mit Kopfzeile,
Handy-Leiste (Formalien, Außenanlagen, Aufwuchs, Beseitigung, Skizze), Export als Aktion oben rechts,
Tablet ≥ 900 px mit Seitenleiste; WEP-Liste mit Statuszeile Abgleich (Löschen jetzt im Menü „⋯“ der
WEP-Ansicht mit Rückfrage); Login und Profil inkl. Android-Test-Seite (inzwischen „Synchronisierung“, B2-5); Außenanlagen/Aufwuchs mit Positionsliste,
Warnungen, eingeklappten Hinweisen, Summe; „Position hinzufügen“ mit Varianten direkt in den Suchtreffern.
Playwright-Durchlauf erweitert, Screenshots `docs/umbau/` (`npm run umbau:screenshots`).
Offen (Teil B): Formalien, Beseitigung, Export und Skizze im Detail, Dunkelmodus.

### B2-4c · Umbau der App, Teil B ✅ (#design) – Branch design/umbau-b
Ergebnis: Formalien (gruppiert), Beseitigung (Liste + Formular), Export (bei gewählter Bau-Excel, Ergebnis,
Hinweise) und Skizze (lucide-Werkzeugleiste, Dialoge Text/Baumart/Maß, Berührflächen ≥ 48 px, Zeichenfläche
unverändert) im Entwurfs-Stil; gemeinsame Bausteine `Dialog`, `Rueckfrage`, `LeerZustand`, `Meldung` in
`src/app/ui.tsx`; keine Emojis/Zeichen-Symbole mehr (Test). **Positionen ändern:** Antippen einer Position
(Außenanlagen, Aufwuchs, Beseitigung) öffnet das Formular, „Löschen“ unten mit Rückfrage; Richtlinien-
Erläuterungen (Schwere „info“) nur noch im Formular unter „Richtlinie“, Warnungen bleiben in der Liste.
Aufgeräumt: `entwurf.html`, zweiter Vite-Einstieg, Service-Worker-Ausnahme, `src/design/entwurf/` und
`tools/entwurf/` entfernt (`docs/entwurf/` bleibt als Referenz). Tests (`umbauB.test.tsx`), Playwright-Durchlauf
und Screenshots (`docs/umbau/`) erweitert. Offen: Dunkelmodus.

### B2-5 · Fertige APK ✅ (#app-gruen) – Branch android/release
Ergebnis: Workflows „Android-Schlüssel erzeugen“ (einmalig, manuell) und „Android Release“ (Push auf
`main` + manuell; signierte APK als GitHub Release „WEP <Version> (<Code>)“; ohne Secrets Abbruch mit
Meldung), `version.json` im Web-Build, Update-Hinweis in der Android-App (`src/android/update.ts`,
`UpdateHinweis.tsx`), Profil-Bereich „Synchronisierung“ statt Test-Seite (Protokoll nur per langem
Drücken auf die Version); Update-Hinweis vergleicht Commit + Bauzeit, Release-Workflow bei jedem Push auf `main`. Anleitung, Umstieg von der Test-APK und Updates: docs/ANDROID.md.
**Noch nicht gelaufen:** Release-Workflow (braucht die vier Secrets) – erster echter Lauf steht aus.

## KI-Assistent (Plan: docs/KI-ASSISTENT.md)

> **Abgeschaltet seit 20.10.2026** (Beta 2, Schritt 1 – Branch app/ki-aus ✅): Schalter `KI_AKTIV`,
> Code bleibt. Einschalten: docs/KI-ASSISTENT.md.

### K-A0 · KI-Testlauf ✅ (#00-leitung) – Branch ki/testlauf
Ergebnis: `tools/ki-test/` (`npm run ki-test`), Prompt `tools/ki-test/prompt-aufnahme.md`,
3 erfundene Testfälle, Bericht `tools/ki-test/ergebnis.md`. Fotos handschriftlicher Listen
ergänzt Simon in `tools/ki-test/faelle/<name>/eingabe.jpg`.
> Testlauf (Node/TypeScript) für Assistent A: Aufnahmeliste → Katalogpositionen mit
> Gemini (kostenlos). Nur JSON nach responseSchema, keine Preise (App rechnet über
> berechnePreisvorschlag). Modellkette aus models.list, bei 429 nächstes Modell.
> Auswertung je Modell × Fall: Recall/Precision, ID/Variante, Δ Summe €, unsicher, Laufzeit.

## Offene Fragen an Simon / den BV
- Zustandsstufen: feste Prozent-Staffel oder freie Schätzung?
- Geräte vor Ort: Handy oder Tablet?
- ~~OneDrive des BV~~ → Beta: privates OneDrive von Simon (BV-OneDrive später)
- Blätter „Anl IV Schuppen“ / „Anl IV Dach“ (versteckt, viele #REF!): noch gebraucht?

### K-B0 · Skizzen-Testlauf ✅ (#00-leitung) – Branch ki/skizze-test
Ergebnis: `npm run ki-test-skizze`, Übersicht `tools/ki-test/ergebnis-skizze.html`, Fall 1 mit
`soll.json` (Entwurf, offene Fragen im PR). Assistent A: Eingabe nur Text/.docx (Fall 04).
Export-Sofortfix: PNG transparent, wenn das Blatt schon Formen hat. Weiterführung: E3.

### K-B1 · Skizzen-Chat ✅ (#00-leitung) – Branch ki/skizze-chat
Ergebnis: `functions/api/ki/skizze-chat.ts` (+ `functions/_lib/`), Szene-Modell und Operationen in
`src/skizze/` (`szene.ts`, `operationen.ts`, `chatWerkzeuge.ts`, `chatAblauf.ts`), Chat-Leiste
`SkizzeChat.tsx` im Skizze-Tab, neue Symbole (Editor, PNG, Excel-Formen), Replay `npm run ki-test-chat`
→ `tools/ki-test/ergebnis-chat.html`. Offen: Vergleich mit `claude-ergebnis.json` (Datei fehlt noch).

## Beta 3 (Plan: docs/PLAN-BETA3.md)

### B3-0 · Selbst-Update der Android-App ✅ #39, #41, #42 – Branch beta3/selbst-update
Ergebnis: Live-Update des Web-Teils (`@capgo/capacitor-updater`, manuell, `updates/<commit>.zip`,
`version.json` mit `bundleUrl`/`nativeVersion`, Rückfall per `notifyAppReady` + Sperrliste), `android/native-version.txt`
mit Prüfung im Workflow „Prüfen“, natives Update (APK in der App laden, Android-Installer,
Hinweis „Neue App-Version“), APK zusätzlich auf Cloudflare Pages (`wep-pankow-apk`, Secrets
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`), Profil zeigt Commit/Stand/letzte Prüfung.
Tests: Entscheidung Live/Nativ, Rückfall, native-version-Regel. Anleitung: docs/ANDROID.md „Updates“.
Nachträge: #41 (Update-Hinweis nach Installation sofort neu prüfen), #42 (Prüfsumme des Live-Update-Pakets,
sonst „Failed to download“). Cloudflare-Token angelegt; Installer und Live-Update auf dem Handy erprobt.
**Noch offen:** Rückfall bei Fehlstart nur in Tests geprüft.

### B3-1 · Icon, Kleinigkeiten, Status, Duplizieren ✅ #40 – Branch beta3/paket1
Ergebnis: App-Icon „Klemmbrett mit Blatt“ (`resources/icon.svg`, `npm run icons` erzeugt Android adaptiv/rund/
monochrom in allen Dichten, PWA 192/512 + maskable, Favicon, Apple-Touch-Icon, Splash; Vorschau
`docs/icon/vorschau.png`); Fehler „Rasengräser“ (`gefundeneArt`); „schlecht“ = 1,00 € auch ohne Höchstwert;
Status je WEP (`Wep.status`: in Arbeit / fertig / exportiert, Filter und Marke in der Liste, Menü „⋯“, Abgleich über
die WEP-Datei); „⋯“ → „Duplizieren“ (`dupliziereWep`). Tests: `format`, `preisvorschlag`, `model/__tests__/status`,
`tools/icons/icons.test.ts`; e2e um Status, Filter, Duplizieren erweitert. Screenshots: `docs/paket1/`
(`npm run paket1:screenshots`). `native-version` auf 2 (Icons liegen unter `android/`).
**Noch offen:** Gerätetest (Icon im Launcher, Themen-Icon, Splash), Android-Test-Workflow am PR.

### B3-2 · Papierkorb, Konflikte sichtbar ✅ #43 – Branch beta3/paket2
Ergebnis: Löschen verschiebt nach `daten/papierkorb/` (Löschzeitpunkt, idempotent), andere Geräte legen das WEP
beim Abgleich in ihren Papierkorb, ohne Konto lokaler Papierkorb; Papierkorb-Ansicht (Wiederherstellen,
„Endgültig löschen“ mit Rückfrage, automatisch nach 30 Tagen); Änderung nach dem Löschzeitpunkt → Konflikt statt
stillem Löschen; Konflikt-Hinweis am WEP („auf zwei Geräten geändert“: Diese Fassung behalten / Andere Fassung
übernehmen, danach Konflikt-Kopie aufräumen); Android: Löschsperre in Warteschlange und Worker; Beta-Regel
„Löschen wird nicht synchronisiert“ abgelöst, Daten migriert (DB-Version 4). `native-version` 3.
Tests: `src/sync/papierkorb.test.ts` (zwei Geräte über FakeDrive), `graph.test.ts`, `android/warteschlange.test.ts`,
`app/__tests__/paket2.test.tsx`; e2e um Papierkorb und DB-Umstieg erweitert. Screenshots: `docs/paket2/`
(`npm run paket2:screenshots`).
**Noch offen:** Gerätetest (Löschen auf Handy und Tablet mit echtem OneDrive, Android-Hintergrund-Upload während des
Löschens), alle Geräte auf diese Version bringen.

### B3-3 · Eigene Positionen merken ✅ #44 – Branch beta3/paket3
Ergebnis: Freitext-Position optional „als eigene Position merken“ (Standard an), Suche zeigt sie mit „Eigene“ vor gleich
guten Katalogtreffern (nur im passenden Abschnitt), Verwaltung im Profil (Liste, ändern, löschen), Abgleich über
`daten/eigene-positionen.json` (neuere Änderung je Eintrag gewinnt, gelöschte bleiben gelöscht). Code: `src/katalog/eigene*.ts`,
`src/sync/eigenePositionen.ts`, `src/app/EigenePositionen.tsx`. Tests: `katalog/eigene.test.ts`, `katalog/suche.test.ts`,
`sync/eigenePositionen.test.ts` (zwei Geräte über FakeDrive), `app/__tests__/paket3.test.tsx`; e2e erweitert.
Screenshots: `docs/paket3/` (`npm run paket3:screenshots`). Kein `android/`-Eingriff, `native-version` unverändert.
**Noch offen:** Gerätetest mit echtem OneDrive (zwei Geräte).

### B3-4 · Fotos ✅ #46, #48 – Branch beta3/paket4
Ergebnis: Fotos an Positionen (Außenanlagen, Aufwuchs, Beseitigung) und am WEP allgemein (Registerkarte „Fotos“, Gruppen
je Position, Großansicht mit Text, Löschen mit Rückfrage; Kamera oder Galerie, mehrere auf einmal). Beim Speichern
verkleinert (längste Seite 2000 px, JPEG, Ziel < 500 KB), EXIF-Ausrichtung korrigiert, Standortdaten/EXIF entfernt,
Vorschaubild (360 px); lokal in IndexedDB (DB-Version 5: `fotos` + `fotoDaten`). OneDrive: `daten/fotos/<Nr>/<id>.jpg`,
Papierkorb `daten/papierkorb/fotos/<Nr>/` (die Fotos ziehen mit um, Wiederherstellen holt sie zurück, endgültig löschen/30 Tage
leert sie); Upload nur im WLAN (Einstellung „nur WLAN“) auch im Android-Hintergrunddienst (neue native Foto-Warteschlange
mit Sperre für gelöschte WEPs), offene Fotos zählen in der Upload-Anzeige; andere Geräte laden Fotos beim Öffnen nach.
Duplizieren kopiert keine Fotos. Export: `Exporte/<Nr>_Fotos/` mit Namen wie `03 Apfelbaum.jpg`, `00 Gesamtansicht 1.jpg`
(ohne Konto ZIP). Code: `src/fotos/`, `src/sync/fotos.ts`, `src/app/Fotos.tsx`, `src/android/fotoWarteschlange.ts`,
`android/…/FotoWarteschlange.kt`. Tests: `fotos/komprimieren.test.ts` (alle 8 Ausrichtungen, GPS weg, Größe),
`fotos/benennung.test.ts`, `sync/fotos.test.ts` (zwei Geräte über FakeDrive, WLAN, Löschen, Papierkorb mit Fotos),
`sync/exporte.test.ts` (Export-Ordner), `android/fotoWarteschlange.test.ts`, `app/__tests__/paket4.test.tsx`; e2e erweitert
(DB-Umstieg auf 5). Screenshots: `docs/paket4/` (`npm run paket4:screenshots`). **`native-version` auf 4** (Android-Änderung).
**Noch offen:** Gerätetest (Kamera-Intent auf dem Handy, Foto-Upload im Hintergrund nur im WLAN, zwei Geräte mit echtem
OneDrive); der Kotlin-Teil wurde hier nicht kompiliert (kein Android-SDK) – der Workflow „Android Test-APK“ am PR prüft das.

### Beta 3b (Plan: docs/PLAN-BETA3.md, Abschnitt „Beta 3b“)

### B3-5 · Bau-Excel am WEP, Formalien vorbefüllen ✅ #47 – Branch beta3/paket5
Ergebnis: Bau-Excel über die Dateiauswahl des Systems wählen (am WEP unter Formalien und Export, oder „Neues WEP aus Bau-Excel“ auf der
Startseite); sie bleibt am WEP (`Wep.bauExcel`, lokal IndexedDB DB-Version 6, OneDrive `daten/bau/<Nr>.xlsx`, Papierkorb
`daten/papierkorb/bau/`), austauschen/entfernen mit Rückfrage; Abgleich und Papierkorb wie bei Fotos (`src/sync/bauExcel.ts`, Kennung = Hash,
„nur WLAN“, Konflikt, endgültig löschen, Umnummerieren). Formalien E3–E17 werden gelesen: leere Felder gefüllt, abweichende im Dialog „Bau-Excel
sagt … / Im WEP steht …“ je Feld wählbar (Voreinstellung WEP); ausgetauschte Datei = derselbe Abgleich. Export nimmt die gemerkte Bau-Excel
(WEP-Werte gelten nach dem Abgleich bis in die Datei). Überschrift im Blatt „Skizze Außenanlage-Aufwuchs“: „Skizze – Baulichkeiten“ → „Skizze –
Außenanlagen und Aufwuchs“ (**Simon bestätigt Wortlaut noch**). Code: `src/bauexcel/`, `src/sync/bauExcel.ts`, `src/export/bauExcelLesen.ts`,
`src/app/BauExcel.tsx`. Tests: `export/__tests__/bauExcelLesen.test.ts`, `bauexcel/__tests__/abgleich.test.ts`, `sync/bauExcel.test.ts` (zwei Geräte über
FakeDrive), `app/__tests__/paket5.test.tsx`; e2e erweitert (DB 6). Test-Bau-Excel aus der Vorlage mit erfundenen Werten: `src/bauexcel/testBauExcel.ts`.
Screenshots: `docs/paket5/` (`npm run paket5:screenshots`). `native-version` bleibt 4 (kein Android-Eingriff).
**Noch offen:** Gerätetest (Dateiauswahl auf Android mit OneDrive-App, zwei Geräte mit echtem OneDrive).
### B3-6 · Liste und Alltag ✅ #49, #50 – Branch beta3/paket6
Ergebnis: (1) Suche in der WEP-Liste (Vorgangs-Nr., Anlage, Parzelle, Weg, Unterpächter, Auftraggeber; jedes Wort, Umlaute egal) zusammen mit
dem Status-Filter, Sortierung „Zuletzt geändert“ (Standard) / „Nummer“ (`src/app/wepListe.ts`). (2) Problempflanzen: `data/problempflanzen.json`
(Quelle je Eintrag, `richtlinie` mit Seite oder `praxis`, noch unbestätigt), Warnung mit Knopf „Zur Beseitigung“ (Beseitigung vorbelegt), nur
warnen; die 41 Arten der Unionsliste gegen die Anlage der Richtlinie geprüft (vollständig). (3) Sicherung als ZIP-Datei (`src/sicherung/`, Profil →
„Sicherung“): alle WEPs, Papierkorb, eigene Positionen, Profil, optional Fotos und Bau-Excel; Einspielen mit Vorschau (neu / gleich / weicht ab / im
Papierkorb), Standard „behalten“, Auswahl je Eintrag, „als neues WEP anlegen“. (4) Sonnen-Kontrast: Schalter im Profil (Geräte-Einstellung),
Block `:root[data-kontrast='sonne']` in `src/design/tokens.css`. Tests: `app/__tests__/wepListe.test.ts`, `gruen/__tests__/problempflanzen.test.ts`,
`sicherung/sicherung.test.ts`, `design/kontrast.test.ts`, `app/__tests__/paket6.test.tsx`; e2e erweitert. Screenshots: `docs/paket6/`
(`npm run paket6:screenshots`, auch mit Sonnen-Kontrast). `native-version` bleibt 4 (kein Android-Eingriff).
**Offen:** Simon bestätigt die Praxis-Einträge der Problempflanzen (Quelle BfN-Schwarze-Liste, nicht Teil der Richtlinie); Gerätetest der Sicherung auf Android
(Datei speichern/wählen).
### B3-7 · Skizze bedienen (Zoomen, Einrasten, Auswählen) ✅ #51 – Branch beta3/paket7
(1) Zoomen/Verschieben: zwei Finger (Zoom + Verschieben), Mausrad (um den Mauszeiger), Ziehen auf leerer Stelle im Auswählen-Werkzeug, mittlere Maustaste,
Knöpfe Hinein/Heraus/„Ganze Skizze“ (über der Zeichenfläche), Zoom 100–800 %. Die Ansicht ist nur ein viewBox-Ausschnitt (`src/skizze/ansicht.ts`), nicht Teil der
Skizzendaten. (2) Einrasten (`src/skizze/einrasten.ts`): Ecken, Mitten und Kanten benachbarter Formen, Grundstücksrand (= Rand der Zeichenfläche), gerade Linien
0/45/90° (±6°); Hilfslinien beim Zeichnen/Ziehen; Schalter „Einrasten“ in der Werkzeugleiste (Geräte-Einstellung), am PC Alt gedrückt = kurz aus. Fangbereich 10 px
(zoom-unabhängig). (3) Auswählen (`geometrie.ts`): Greifradius 20 px (Finger) bzw. 8 px (Maus/Stift) statt fest 8 Einheiten, Treffer nach Größe sortiert (kleine Form vor
großer, Linien zuerst), erneutes Antippen der gewählten Form wechselt durch die Formen an der Stelle („2 von 3 hier“); Ziehen erst ab 6 px; Verschieben ist jetzt ein
einziger Rückgängig-Schritt. Eine Zwei-Finger-Geste lässt Auswahl und Zeichnung unberührt. (4) Export unverändert (keine Änderung an `src/export`, Skizzendaten gleich;
Test `editorBedienung.test.tsx`). Tests: `ansicht.test.ts`, `einrasten.test.ts`, `geometrie.test.ts` (Überlagerung), `editorBedienung.test.tsx`; e2e (`konto-durchlauf.mjs`,
Abschnitt 10f) mit Mausrad, Maus-Ziehen und Zwei-Finger-Gesten über CDP-Touch. Screenshots: `docs/paket7/` (`npm run paket7:screenshots`). `native-version` bleibt 4
(kein Android-Eingriff).
**Offen:** Gerätetest der Gesten auf Android/Tablet; Simon prüft Fangbereich und Greifradius (Konstanten `FANG_PIXEL`, `GREIF_PIXEL_FINGER`).

## Windows-Programm (Plan: docs/PLAN-EXE.md, Doku: docs/WINDOWS.md)
- W-1 · .exe mit Tauri ✅ PR offen – Branch exe/tauri. `src-tauri/` (Tauri 2, NSIS ohne Admin), Anmeldung über System-Browser +
  PKCE mit Loopback `http://localhost:<Port>`, Refresh-Token im Windows-Credential-Manager, „Speichern unter…“ über
  `dateiSpeichern.ts`, Live-Update des Web-Teils mit Rückfall, Programm-Updates über den Tauri-Updater (`latest.json` auf
  `wep-pankow-apk.pages.dev/windows/`), Workflows „Windows Release“ / „Windows Test-Build“ / „Windows-Schlüssel erzeugen“.
  Tests: `windows.test.ts` (Loopback-Anmeldung), `update.test.ts` (Update-Entscheidung), `dateiSpeichern.test.ts`
  (Speichern-Weiche), `pruefe-windows-version.test.ts`, `apk-site.test.ts`, Rust-Tests (`cargo test` in `src-tauri/`).
  `native-version` bleibt 5 (kein Android-Eingriff).
  **Offen (Simon):** Azure-Eintrag `http://localhost` (docs/WINDOWS.md, Abschnitt 1), Update-Schlüssel erzeugen und als
  Secrets/Variable anlegen (Abschnitt 3); danach Windows Release starten und auf einem Windows-PC ausprobieren
  (Installation, Anmeldung, Speichern unter, Live-Update, Programm-Update).

## Beta 4 – Bau-Teil (Plan: docs/PLAN-BETA4.md)
- B4-1 · Rolle schaltet Funktionen frei ✅ PR offen – Branch beta4/paket1 (Reiter und Export je Rolle, pro WEP umschaltbar, Bau-Reiter als Platzhalter, Export `<Nr>_WEP_Bau.xlsx`; Screenshots docs/beta4-paket1/)
- B4-2 · Bau erfassen und bewerten ✅ PR offen – Branch beta4/paket2. Bauteile (L, A1/A2, S/U, GWH, Ü1, Keller) mit Maßen/Baujahr, Bauklasse-Assistent (Tabelle S. 5),
  Mängelabzug (S. 6–8), Alterswertminderung (Tabelle S. 10 = Vorlage), Baupreisindex je Jahr mit Quelle (Profil überschreibbar, WEP merkt ihn), Warnungen mit Quelle,
  Abwasser (Grube/Kanal, nicht geleert), Laube nicht beräumt, Beseitigung Bau mit Textbausteinen, Baubeschreibung, Export in Baulichkeiten/Mängelliste/Beseitigungskosten.
  **Test App = Excel:** `src/export/__tests__/exportBauRechnung.test.ts` (24 Fälle über LibreOffice). Fehler in den Formeln der Vorlage werden im Export korrigiert
  (docs/ENTSCHEIDUNGEN.md). Code: `src/bau/`, `src/export/exportBau.ts`, `src/app/Bau*.tsx`. Screenshots: `docs/beta4-paket2/` (`npm run beta4-paket2:screenshots`).
  Offen: fachliche Fragen im PR (Simon).
- B4-3 · Zeichen-Tools Bau ✅ PR offen – Branch beta4/paket3. Grundriss mit echten Maßen (Rechteck/Vieleck, Kante antippen → Länge eintippen → Form passt sich an), Maßketten,
  Bauteil-Kürzel verknüpft mit Paket 2 (Fläche, Maße, Höhe, Kubatur fließen in die Bewertung; überschreibbar), Massenberechnung nach Dachform (Flach/Pult/Sattel),
  Export als bearbeitbare Formen in „Skizze Bau“. Zoom/Einrasten/Auswahl aus Beta 3; Grün-Skizze unverändert. Code: `src/skizze/grundriss*.ts`, `GrundrissEditor.tsx`,
  `src/bau/grundriss.ts`, `src/export/grundrissFormen.ts`, `src/app/SkizzeBauTab.tsx`. Screenshots: `docs/beta4-paket3/` (`npm run beta4-paket3:screenshots`, Excel-Bild: `npm run beta4-paket3:export-bild`).
- B4-4 · Rechen-Tools ✅ PR offen – Branch beta4/paket4. Neuer Bau-Reiter „Rechner“: Flächenrechner (Rechteck, Dreieck, Dreieck aus drei Seiten, Trapez, Abzüge → auch unregelmäßig),
  Kubatur nach Dachform (Flach/Pult/Sattel), Altersabzug/Restnutzung je Bauteil (Probewerte), Baupreisindex (Umrechnung, Werte je Jahr, Wert für das WEP wählen),
  24-m²-Check (Anrechnung L → A → Ü1, nicht berechnete Fläche, was nicht zählt, zulässige Fläche nach Vertrag). Ergebnis auf Wunsch ins Bauteil übernehmen.
  **Nichts doppelt gerechnet:** `src/bau/rechner.ts` ruft `berechneBau`, `massenAusFlaeche` (jetzt auch von `massenVon` im Grundriss benutzt), `ermittleBaupreisindex`, `verteileFlaeche` auf; Tests vergleichen Rechner = Bewertung = Grundriss.
  Code: `src/bau/rechner.ts`, `src/app/BauRechner.tsx`. Screenshots: `docs/beta4-paket4/` (`npm run beta4-paket4:screenshots`, zugleich Bedienungsdurchlauf mit Prüfungen).
  Offen (Simon): Der überdachte Vorplatz zählt auf die 24 m²; die Vorlage (I38) summiert seinen nicht berechneten Anteil nicht – der Check zeigt ihn mit Hinweis.
- B4-5 · 3D-Ansicht ✅ PR offen – Branch beta4/paket5. In „Skizze Bau“ unter der Massenberechnung: „3D-Ansicht zeigen“ lädt three.js erst dann nach (eigener Teil, ~120 kB gzip; Hauptteil unverändert, liegt für offline im Service-Worker-Cache).
  Modell aus Grundriss, Höhen und Dachform (Flach/Pult/Sattel, Keller unter dem Boden), Bauteile farbig im App-Design, drehbar (Finger/Maus), zoombar (zwei Finger, Mausrad, Knöpfe, Tasten), nur Ansicht.
  Gezeichnet wird nur bei Bewegung (Tablet-tauglich). Code: `src/skizze/modell3d.ts` (Rechnung, getestet: Rauminhalt unter dem Dach = Kubatur der Massenberechnung), `kamera3d.ts`, `Ansicht3D.tsx`, `Bereich3D` in `src/app/SkizzeBauTab.tsx`.
  Screenshots + Bedienungsdurchlauf (auch offline): `docs/beta4-paket5/` (`npm run beta4-paket5:screenshots`).
- T-1 · Prüfwerkzeug für alte WEPs ✅ PR offen – Branch tools/pruef-weps. `tools/pruef-weps/` (Python 3.10+, nur openpyxl): prüft alle .xlsx/.xlsm eines Ordners (rekursiv, nur lesend)
  auf die fünf Vorlagenfehler (Baulichkeiten C33, K81, J52, C64; Beseitigungskosten K21) und die Beispielwerte (F104/G104 „nicht beräumt“ als Verdacht, I19/I28/I37 als Hinweis),
  rechnet mit den gespeicherten Werten und eigener Nachrechnung den Euro-Unterschied bis zum Deckblatt (E21/E25/E26/E28). Ausgabe `pruefbericht.html` + `pruefbericht.csv` im geprüften Ordner
  (enthalten Personendaten, in `.gitignore`), `pruefe_weps.bat` für Windows, README für Laien. Tests (pytest, erfundene Dateien aus der Vorlage, Werte über LibreOffice) im Workflow „Prüfen“.

## Beta 5 (Plan: docs/PLAN-BETA5.md)
- B5-1 · Grün-Skizze auf Bau-Basis ✅ #66 – Branch beta5/paket1. Reiter „Skizze“ (Grün) bekommt die Bau-Skizze als **Grundlage**: aus dem Grundriss des Bau-Teils (Maßstab, Pfosten, Grundstück, Bauteile, Keller gestrichelt) oder aus „Skizze Bau“ der eingelesenen Bau-Excel (DrawingML: Position, Größe, Typ, Text, Linienart; Gruppen, Drehung, Freiform; Bilder/Näherungen als Hinweis).
  Eigene Ebene (`ebene: 'grundlage'`, ganz unten), standardmäßig gesperrt (nicht auswählbar, bleibt Einrast-Ziel), entsperrbar und einzeln korrigierbar; „Grundlage neu übernehmen“ mit Rückfrage, Grün bleibt. Ohne Bau-Daten nur ein Hinweis (nie gesperrt, freies Zeichnen geht).
  Export ins Blatt „Skizze Außenanlage-Aufwuchs“ wie im Skill (Modus Außenanlage): Wiese #C5E0B4, Gras, Pfosten, Gebäude #E7E6E6, Keller gestrichelt, darüber Grün; „Skizze Bau“ bleibt byte-gleich (Test). Hat das Blatt schon eigene Formen, wird die Grundlage nicht doppelt geschrieben (Hinweis).
  Code: `src/skizze/grundlage.ts`, `src/export/bauSkizzeLesen.ts`, `src/app/SkizzeTab.tsx`; Test-Bau-Excel mit handgezeichneten Formen: `src/bauexcel/testBauExcel.ts` (`skizzeBau`), `docs/beta5-paket1/Test-Bau-Excel.xlsx`.
  Tests: `src/export/__tests__/grundlage.test.ts`; e2e/Durchlauf `npm run beta5-paket1:screenshots`, Excel-Render `npm run beta5-paket1:export-bild`. Screenshots: `docs/beta5-paket1/`. Keine Änderung an `android/`, Plugins oder `src-tauri/`, daher keine neue Versionsnummer.
- B5-2 · Teilen als .wep-Datei ✅ PR offen – Branch beta5/paket2. Menü „⋯“ → **Teilen** erzeugt `<Vorgangs-Nr>_<Anlage>.wep` (ZIP, `wep.json` im Format `wep-teilen/1`, optional `fotos/`, `bau.xlsx`);
  vorher Schalter „Fotos mitschicken“ und „Bau-Excel mitschicken“ (mit Größe) und der Hinweis auf Personendaten. Weitergabe: Android-Teilen-Menü (`dateiTeilen`, FileProvider), Browser-Teilen, sonst/zusätzlich „Speichern unter…“ (Windows-Dialog).
  Öffnen: „WEP-Datei öffnen“ auf der Startseite, Android „Öffnen mit WEP“ (Intent-Filter, `Eingang.kt`), Windows-Doppelklick (Dateizuordnung `.wep`, `eingang.rs`). Vorschau nach dem Muster von „Sicherung einspielen“ (neu / gleich / weicht ab / im Papierkorb) und bei Abweichung
  **Auswahl je Teil** (Bau-Teil, Grün-Teil, Fotos, Bau-Excel, Formalien/Status) – Standard: alles behalten, nichts wird still überschrieben; damit läuft **Bau → Grün** direkt in der App. Unbekannte/neuere Formate, kaputte, fremde Dateien und Sicherungen werden mit Klartext abgelehnt.
  Wiederverwendet: `src/sicherung/` (Vorschau, Einspielen, Ziel/Quelle). Code: `src/teilen/`, `src/app/TeilenDialog.tsx`, `src/app/TeilenOeffnen.tsx`, `src/teilen/eingang.ts`.
  Tests: `src/teilen/teilen.test.ts`, `eingang.test.ts`, `src/app/dateiSpeichern.test.ts`, Rust-Test in `src-tauri/src/eingang.rs`; Durchlauf mit zwei „Geräten“ `npm run beta5-paket2:screenshots`, Screenshots `docs/beta5-paket2/`.
  Geändert unter `android/` und `src-tauri/`: **`native-version` 5 → 6**, Windows-Programm **0.1.1 → 0.1.2**, Hülle **1 → 2**. Echtes Gerät/echter PC: Checkliste im PR (Teilen-Menü, „Öffnen mit WEP“ aus WhatsApp/E-Mail, Doppelklick).
- B5-3 · Unterschrift im Profil ✅ #67 – Branch claude/beta5-paket3-signature-oe4bmx. Profil → „Meine Unterschrift“: **zeichnen** (Finger/Stift/Maus, geglättete Linien, Stiftdruck/Tempo ändern die Breite, Rückgängig, Alles löschen) oder **Bild hochladen** (Zuschnitt über vier Regler, Papier/Schatten freistellen mit Stärke-Regler, optional einheitlich dunkel, Vorschau auf Karo); Ergebnis ist ein eng zugeschnittenes **transparentes PNG** (höchstens 600 × 240). Ersetzen, Löschen mit Rückfrage.
  Gespeichert als `Profil.unterschrift` (PNG-Data-URL) lokal und mit dem Profil in `daten/profil.json` abgeglichen (neuere Änderung gewinnt; aus der Cloud kommt nur ein gültiges, nicht zu großes PNG an). **Für Paket 4:** `unterschriftAlsPng(): Uint8Array | null` (und `ladeUnterschriftUrl()`) aus `@/unterschrift`, offline, ohne Oberfläche; „Mit meiner Unterschrift versehen“ im PDF-Dialog baut Paket 4.
  Code: `src/unterschrift/` (`striche.ts`, `bild.ts`, `png.ts`, `index.ts`), `src/app/Unterschrift.tsx`. Tests: `src/unterschrift/__tests__/`, `src/sync/profil.test.ts` (Abgleich, Löschen, Fremdes verwerfen); Durchlauf `npm run beta5-paket3:screenshots`, Screenshots `docs/beta5-paket3/` (selbst erzeugte Kritzel und Testfoto, keine echten Unterschriften). Keine Änderung an `android/`, Plugins oder `src-tauri/`, daher keine neue Versionsnummer.
- B5-4 · PDF direkt aus der App ✅ PR offen – Branch beta5/paket4. Export-Reiter → „Export als PDF“: sieht aus wie die Blätter der BV-Vorlage (Deckblatt, Baulichkeiten, Mängelliste, Außenanlagen, Aufwuchs I/II, Beseitigungskosten, Skizzen, Abkürzungen; je Rolle nur der eigene Teil und nur Ausgefülltes), entsteht offline im Browser (`pdf-lib` wird erst dabei nachgeladen). **Zahlen = Excel:** das PDF wird aus derselben exportierten Arbeitsmappe gesetzt, ein Rechenwerk (`src/pdf/formeln.ts`) wertet die Vorlagen-Formeln aus; Test `werteGleichExcel.test.ts` vergleicht jede Formelzelle der gedruckten Blätter in 8 erfundenen Fällen mit LibreOffice, `pdfInhalt.test.ts` mit `berechneBau` u. a. Skizzen als Vektor (Grün-Skizze über dieselben Zeichenbefehle wie Editor/PNG, Grundriss wie im Excel-Export), Fotos optional als Anhang mit Positionsnummer, Unterschrift (Paket 3) nur nach Bestätigung über dem Namen des Wertermittlers. Speichern über `dateiSpeichern.ts` (+ „Teilen“), mit Konto zusätzlich `Exporte/` (OneDrive, offline per Warteschlange).
  Code: `src/pdf/` (`mappe`, `formeln`, `zahlformat`, `blatt`, `schreiber`, `kontext`, `skizzen`, `fotos`, `erzeugen`, `index`), `src/app/PdfExport.tsx`, `src/app/exportQuelle.ts`; kleine Änderung in `src/sync/exporte.ts`/`index.ts` (Medientyp). Tests: `src/pdf/__tests__/`. Vergleich mit dem LibreOffice-PDF der Excel: `npm run beta5-paket4:vergleich` → `docs/beta5-paket4/vergleich/`; Bedienungsdurchlauf (inkl. offline, Prüfung der heruntergeladenen PDFs): `npm run beta5-paket4:screenshots` → `docs/beta5-paket4/`. Entscheidungen: `docs/ENTSCHEIDUNGEN.md`. Keine Änderung an `android/`, Plugins oder `src-tauri/`, daher keine neue Versionsnummer.
  **Offen:** Gerätetest (PDF auf Android speichern/teilen, Windows-Speichern-Dialog, Ansicht in echten PDF-Betrachtern); Simon prüft Optik gegen ausgedruckte Excel (Calibri→Helvetica, Seitenumbruch Baulichkeiten) und ob die festen „Seite N“-Texte so bleiben sollen.

## Beta 6 (Plan: docs/PLAN-BETA6.md)
- B6-1 · Parzellenform und gleicher Maßstab ✅ PR offen – Branch beta6/paket1. Eine **Parzelle je WEP** (`Wep.parzelle`, `src/parzelle/`): rechteckig (Länge × Breite) oder freie Form (Ecken grob zeichnen, Seiten, Diagonalen/Winkel eintippen; die App sagt, was fehlt; Fläche berechnet, Hinweis bei Abweichung zur Vertragsfläche, nie sperren). Angelegt vom Ersten, von Bau- und Grün-Reiter korrigierbar (Rückfrage bei vorhandenen Elementen, Lage in Metern bleibt). **Gleicher Maßstab:** Parzelle füllt den Skizzenkasten (Leinwand 600 × 825), Grundriss und Grün in echten Metern, Rasterkästchen gleich; Export in beide Blätter an gleicher Stelle/Größe (Test liest beide Zeichnungen), auch PDF. Migration: WEPs ohne Parzelle bleiben wie bisher, mit Hinweis; alte Skizze wird nach Rückfrage auf die Parzelle gelegt. Form „Grundstück“ der Bau-Excel wird als Parzelle (ohne Maße) übernommen; Abgleich, Teilen, Sicherung nehmen sie mit. Seitenmaße als Maßlinien auf Wunsch.
  Tests: `src/parzelle/__tests__/`, `src/export/__tests__/parzelleExport.test.ts`, `src/pdf/__tests__/parzellePdf.test.ts`, `src/app/__tests__/parzelle.test.tsx`, Ergänzungen in `teilen`, `sicherung`, `sync`. Durchlauf `npm run beta6-paket1:screenshots`, Excel-Render `npm run beta6-paket1:export-bild` → `docs/beta6-paket1/`. Entscheidungen: `docs/ENTSCHEIDUNGEN.md`. Keine Änderung an `android/`, Plugins oder `src-tauri/`, daher keine neue Versionsnummer.
- B6-2 · Weitere Dachformen ✅ PR offen – Branch beta6/paket2. Walmdach, Zeltdach/Pyramide, Krüppelwalmdach und Mansarddach zusätzlich zu Flach/Pult/Sattel. Eingaben je Form mit kleiner Erklär-Skizze (Ansicht + Draufsicht, Legende) im Grundriss-Editor und im Rechner; Kubatur je Form nach Formel (Handrechnung im Test, Quellen in ENTSCHEIDUNGEN.md), Näherung mit Hinweis bei nicht rechteckigem Grundriss, fehlende Maße → wie Satteldach mit Hinweis (nichts gesperrt). Massenberechnung (App, Excel, PDF), Rechner (Rechenweg je Form) und 3D-Ansicht zeigen die Formen; Rauminhalt 3D = Kubatur. Bestehende Daten bleiben gültig (nur optionale Felder). Screenshots: docs/beta6-paket2/ (`npm run beta6-paket2:screenshots`).
- B6-3 · KGA-Auswahl ✅ PR offen – Branch formalien/kga-auswahl. Formalien und „Standard-Kleingartenanlage“ im Profil: Auswahlliste mit den 56 Anlagen des Bezirksverbands (`src/kga/`), „Andere …“ für eine eigene Eingabe (nichts gesperrt); eine Schreibweise aus einer Bau-Excel („Rosenthal Süd“) wählt den passenden Listeneintrag („Rosenthal-Süd“) vor, der gespeicherte Text bleibt unverändert. Code: `src/kga/index.ts`, `src/app/KgaAuswahl.tsx`. Test: `src/kga/kga.test.ts`, e2e angepasst.

## Nachtrag
- PDF-2 · PDF übersichtlich + neuer Deckblatt-Text ✅ PR offen – Branch pdf/uebersichtlich. Export-Reiter: zwei Knöpfe **„PDF übersichtlich“** (neu: schlichtes, gut lesbares Protokoll im Stil der App; Deckblatt mit Formalien und Bewertung, je Teil Tabellen mit Rechenweg je Bauteil, Mängel, Abwasser, Außenanlagen, Aufwuchs, Beseitigung, Bestätigung mit Unterschrift, große Vektor-Skizzen, optional Fotoanhang, Kopfzeile Vorgangs-Nr./Anlage/Parzelle, „Seite n von N“) und **„PDF wie Vorlage“** (bisheriges PDF, unverändert). Zahlen aus derselben exportierten Mappe wie das bisherige PDF; Test vergleicht die Summen in allen acht erfundenen Fällen.
  **Neuer Deckblatt-Text** (acht Absätze) an einer Stelle `src/export/deckblattText.ts`; Excel-Kopie (`src/export/deckblatt.ts`, Zellen A31–A40, `docs/WEP_Vorlage.xlsx` unverändert) und beide PDFs lesen ihn. **Fehler behoben:** Grün-Export ohne Bau-Daten und ohne Bau-Excel zog in der Excel noch die Beispielwerte der Vorlage ab (250 € nicht beräumt, 150 € Fäkalien); `mitLeerenBauDaten` leert sie jetzt für Excel und PDF.
  Code: `src/pdf/uebersicht/` (`daten`, `seitenbau`, `inhalt`, `erzeugen`, `format`), `src/export/deckblatt*.ts`, `src/export/ohneBau.ts`, `src/app/PdfExport.tsx`. Tests: `src/pdf/__tests__/uebersicht.test.ts`, `src/export/__tests__/deckblatt.test.ts`. Durchlauf/Screenshots (Handy, Tablet, Seitenbilder): `npm run pdf-uebersichtlich:screenshots` → `docs/pdf-uebersichtlich/`. Entscheidungen: `docs/ENTSCHEIDUNGEN.md`.
  **Offen:** Simon prüft Optik und Wortlaut auf Papier (der alte Verweis auf § 9 Abs. 7 und der Absatz zu Änderungskosten entfallen durch den neuen Text); Gerätetest wie bei B5-4.
- SKA-1 · Agent-Schnittstelle der Grün-Skizze ✅ PR offen – Branch skizze/agent-schnittstelle. Ausgefüllte Formen (Rechteck, Ellipse/Kreis, Vieleck: Füllfarbe, Linienfarbe, Linienart, Vorgaben aus dem Skill parzellen-skizze, „Aussehen“-Dialog), Linien mit Farbe/Pfeil, Mängelhinweis mit Pfeil; Excel-Export und PDF übernehmen sie; aus einer Bau-Excel kommen Farben, rote Maßlinien und Pfeilspitzen in die Grundlage. `window.wep` (`schema()`, `lesen()`, `skizze.vorschlagen()`, `skizze.status()`), nur lesend außer dem Vorschlag, Balken „Vorschlag: N Elemente – Übernehmen / Verwerfen“, Übernehmen = ein Rückgängig-Schritt, ohne Bestätigung nichts gespeichert. Doku: `docs/WEP-SCHNITTSTELLE.md`. Code: `src/agent/`, `src/skizze/stile.ts`, `editorZustand.ts`. Tests: `src/agent/__tests__/`, `src/export/__tests__/skizzeFarben.test.ts`; Durchlauf + Screenshots `npm run skizze-agent:screenshots` (`docs/skizze-agent/`), Excel-Render `npm run skizze-agent:export-bild`. Kein Eingriff in `android/`, Plugins oder `src-tauri/`, daher keine neue Versionsnummer. **Offen:** Skill „wep-skizze-app“ (Entwurf im PR) von Simon prüfen; Gerätetest mit Claude in Chrome.
- SKA-2 · Positionen aus Text über `window.wep.positionen` ✅ PR offen (im PR von SKA-1) – `katalogSuchen`, `vorschlagen` (Format `wep-positionen/1`, Aufwuchs/Außenanlagen/Beseitigung Grün), `status`; Balken mit Übernehmen/Verwerfen/Rückgängig. Doku: `docs/WEP-SCHNITTSTELLE.md`, Abschnitt „Positionen aus Text“. Tests `src/agent/__tests__/positionen.test.ts`, Durchlauf `npm run skizze-agent:screenshots`. **Offen:** Skill „wep-positionen-app“ (Entwurf) von Simon prüfen; Gerätetest mit Claude in Chrome.
- SKA-3 · Skizzen-Vorschlag nur aus Grundformen ✅ PR offen – Branch skizze/agent-grundformen. Format `wep-skizze/2`: Rechteck, Ellipse, Vieleck (Dreieck, offener Linienzug), Bogen, Linie, Maßlinie, Text; jede Form gefüllt, mit eigener Linienfarbe, -stärke (pt) und -art; `name`, `bezug`; `window.wep.skizze.baustein()` liefert fertige Grundformen (Baum, Hecke, Tor …) nach dem Skill parzellen-skizze. Excel/PNG/PDF/Editor kennen Linienstärke, offene Linienzüge, Textfarbe/-größe, Namen und frei gezeichnete Reihenfolge. Doku `docs/WEP-SCHNITTSTELLE.md`, Beispiel `docs/skizze-agent/beispiel-vorschlag.json`. **Offen:** Skill „wep-skizze-app“ (aktualisierter Entwurf) prüfen; Gerätetest mit Claude in Chrome.
- BX-2 · Bau-Excel: gesamten Inhalt ins WEP übernehmen ✅ PR offen – Branch excel/bau-teil-uebernahme. Beim Hinterlegen einer Bau-Excel (auch „Neues WEP aus Bau-Excel“) fragt die App einmal „Inhalt der Bau-Excel übernehmen?“ und bietet alles an, was über die Formalien hinaus ausgefüllt ist, je Gruppe wählbar: **Bau** (Laube, Anbauten, Schuppen, Gewächshaus, Laubenvorplatz mit Typ, Baujahr, Restnutzung, Fläche, Mängelabzug; Baubeschreibung; Abwasser Grube/Kanal; Beseitigung Abschnitt 1; „Laube nicht beräumt“; Baupreisindex) und **Grün** (Außenanlagen, Aufwuchs I/II, Beseitigung Außenanlagen/Aufwuchs). Nichts wird überschrieben, nichts doppelt angelegt. Hatte das WEP einen Teil noch nicht (nur Grün oder nur Bau), bekommt es mit der Übernahme die Rolle „beides“ – Reiter, Excel und PDF enthalten dann alles. Später jederzeit über „Inhalt übernehmen“ in der Karte der Bau-Excel. Code: `src/export/bauTeilLesen.ts`, `src/export/bauExcelLesen.ts` (`leseBauGruen`), `src/bauexcel/{bauAbgleich,gruenAbgleich,uebernahme}.ts`, `src/app/BauExcel.tsx`. Tests: `src/bauexcel/__tests__/{bauAbgleich,gruenAbgleich,uebernahme}.test.ts` (inkl. Rundlauf in den Export). **Offen:** Mängel nur aufgeschlüsselt, wenn die Gruppen der Mängelliste zum Gesamtabzug passen; Gewächshaus/Vorplatz rechnet der Export wieder nach den Regeln der App (z. B. 24-m²-Grenze), die Zahlen können daher abweichen.
- BAU-1 · Schuppen und Unterstände neben einer Laube nicht bewerten ✅ PR offen – Branch bau/schuppen-nicht-bewerten. Gibt es eine Laube, zählen Schuppen/Unterstände (Art „Schuppen“) nicht: Fläche und Wert 0, nicht in der Summe Baulichkeiten und der bewerteten Fläche, Excel-Block „S oder U“ ohne Fläche (Wert 0), Hinweis am Bauteil. Ohne Laube ist der Schuppen die einzige Anlage (in Wahrheit die Laube, falsch eingetragen) und wird bewertet. Keller auf demselben Platz zählen weiter. Code: `src/bau/rechnen.ts`, `regeln.ts`. Test: `src/bau/__tests__/schuppenNichtBewerten.test.ts`.
- BX-3 · Bau-Excel-Import: Korrekturen nach Prüfung eines echten WEP ✅ PR offen – Branch excel/bau-import-korrekturen. Beim Vergleich eines WEP aus einer Bau-Excel mit der Excel selbst: (1) Baubeschreibung verlor die rechten Teile der Zeilen (Spalten E/F: „Typ: …“, „Entwässerung: …“) und wurde beim Export um 2 Zeilen gekürzt – jetzt werden alle Teile gelesen, eine unveränderte Beschreibung lässt die Zeilen der Bau-Excel im Export unangetastet, eine geänderte ersetzt auch die rechten Teile; (2) Alter (Grube, Gewächshaus, Vorplatz) wurde mit dem Index-Jahr statt dem Wertjahr und ohne das „+1“ der App in ein Baujahr umgerechnet (Grube 18 statt 16 Jahre, Wert 649 € statt 733 €); (3) leere Restnutzungsjahre (Schuppen) schätzte die App (13 Jahre, 1.193 €), die Bau-Excel rechnet mit 100 % Altersabzug (0 €) – Gesamtsumme Baulichkeiten jetzt 4.990,50 € wie in der Excel (vorher 6.099,12 €); (4) Formalien-Hinweis im Export meldete gleiche Daten als Konflikt (Seriennummer vs. Datum) und zeigte Feldnamen roh. Tests: `src/bauexcel/__tests__/bauAbgleich.test.ts`.
- SK-1 · Gedrehte Texte der Bau-Skizze bleiben gedreht ✅ PR offen – Branch skizze/text-drehung. Senkrechte Maße/Beschriftungen in „Skizze Bau“ (Textfelder mit 270°-Drehung oder Textrichtung „vert270“) wurden beim Übernehmen in die Grün-Skizze waagerecht. Jetzt liest `bauSkizzeLesen` die Drehung (`xfrm rot` + `bodyPr rot/vert`), `SkizzeText.drehung` (Grad im Uhrzeigersinn) kommt in die Grundlage und wird im Editor, in PNG/Canvas, im PDF (Vektor) und im Excel-Export (`xfrm rot`) wieder gedreht gezeichnet; Auswahlkasten und Treffer folgen der Drehung. Waagerechte Texte bleiben unverändert. Tests: `src/export/__tests__/textDrehung.test.ts`, `src/pdf/__tests__/einheiten.test.ts`.
- EXP-1 · Grün-WEP mit Bau-Daten: Bau-Teil in Excel und PDF ✅ PR offen – Branch export/bau-teil-immer. Hatte ein WEP die Rolle „nur Grün“ (z. B. vom Bau-Wertermittler geteilt und als Grün geöffnet), schrieb der Export den Bau-Teil nicht: die Laube fehlte in der Excel (und im PDF), obwohl sie im WEP stand. Jetzt gilt für Export und PDF `exportRolle`: Grün mit Bau-Daten → beide Teile. Code: `src/export/ohneBau.ts`, `src/app/WepDetail.tsx`. Test: `src/export/__tests__/exportRolle.test.ts`.
- XL-1 · Einstellung „Ohne Excel arbeiten“ (Standard: an) ✅ PR offen – Branch einstellung/excel-aus. Profil → Dieses Gerät: Schalter, standardmäßig an. An: Alle Excel-Funktionen sind ausgeblendet – „Export als Excel“ (der Export-Reiter zeigt nur das PDF und heißt „Export (PDF)“), Bau-Excel hinterlegen/abgleichen/übernehmen in den Formalien, „Neues WEP aus Bau-Excel“ auf der Startseite, Grundlage „Aus Bau-Excel“ in der Skizze, Excel-Vorschlag bei der Parzelle, „Bau-Excel mitschicken/einschließen“ beim Teilen und in der Sicherung; Texte ohne Excel-Bezug. Aus: alles wie bisher. Gespeicherte Daten und Bau-Excel-Dateien bleiben unangetastet. Gilt je Gerät (`GeraeteEinstellungen.ohneExcel`, `src/app/ohneExcel.ts`). Tests: `src/app/__tests__/ohneExcel.test.tsx`, e2e (Standard-Prüfung, danach für die Excel-Durchläufe aus- und am Ende wieder eingeschaltet).
- VNR-1 · Vorgangs-Nr. immer eingeben, interne Kennung UUID ✅ PR offen – Branch wep/uuid-vorgangsnr. Die App zählt keine Nummern mehr selbst hoch: „Neues WEP“ fragt im Dialog nach der Vorgangs-Nr. (vom BV), „Nummer noch nicht bekannt“ legt das WEP ohne an; dann weisen Formalien, Liste, Seitenleiste und PDF-Bereich darauf hin (nichts gesperrt). Hinweis bei doppelter Vorgangs-Nr. auf dem Gerät. Interne Kennung neuer WEPs: UUID (Dateiname im OneDrive, nie angezeigt); alte WEPs behalten „2026-007“. Duplizieren: neue Kennung, Vorgangs-Nr. leer. Sync/Papierkorb/Sicherung/Teilen vergeben bei Kollisionen eine neue Kennung, die Vorgangs-Nr. bleibt (kein Umnummerieren mehr). Anzeige, Dateinamen (PDF, Excel, .wep, Foto-Export) und Meldungen nach der Vorgangs-Nr. Code: `src/model/types.ts` (`neueWepId`, `vorgangsNrVon`, `wepName`, `gleicheVorgangsNr`), `src/app/VorgangsNr.tsx`. Tests: `src/model/__tests__/status.test.ts`, angepasste Sync-/Sicherungs-/Teilen-Tests, e2e.
- BV-1 · „An den BV senden“ (Stufe A) ✅ PR offen – Branch senden/an-bv (baut auf VNR-1 und dem PDF-Status-Fix auf). Export-Reiter → „Paket für den BV erstellen“: ein ZIP `<Vorgangs-Nr>_<Anlage>_Parzelle_<n>_an-BV.zip` mit beiden PDFs („übersichtlich“ und „wie Vorlage“, bis der BV eins wählt), der WEP-Datei (ohne Fotos, zum Öffnen in der App) und allen Fotos als JPG im Ordner `Fotos/`. „Teilen …“ (z. B. direkt in die Synology-Drive-App) oder „Speichern“, dann in den Synology-Ordner des BV legen. Danach steht „an BV gesendet <Datum>“ am WEP (Liste, Kopf, Seitenleiste), Status „exportiert“. Hinweis, wenn die Vorgangs-Nr. fehlt. Optional mit eigener Unterschrift im PDF. Code: `src/senden/paket.ts`, `src/app/AnBvSenden.tsx`, `erstellePdf` in `src/app/PdfExport.tsx`. Tests: `src/senden/paket.test.ts`, e2e. **Offen:** Stufe B (direktes Hochladen ins NAS über Cloudflare-Funktion, Eingang/Dashboard für die Geschäftsstelle) – wartet auf die Angaben des BV (Erreichbarkeit des NAS, DSM-Version, Upload-Benutzer).
- DOKU-1 · Anleitung für Wertermittler ✅ PR offen – Branch doku/anleitung (baut auf BV-1 auf). 11 Kapitel mit Bildschirmfotos aus erfundenen Daten: Ablauf Bau → Grün → BV, Start und Profil, Neues WEP mit Vorgangs-Nr., Außenanlagen/Aufwuchs/Beseitigung (Suche, Zustand, Preisvorschlag, Überschreiben, Hinweise), Baulichkeiten und Mängel, Parzelle und Skizzen, Fotos, Übergabe per .wep, PDF und „An den BV senden“, Offline/Abgleich/Papierkorb/Sicherung, häufige Fragen. In der App unter Profil → „Anleitung“ (eigene Seite `public/anleitung/`, offline im Service Worker), als PDF `docs/anleitung/Anleitung_WEP-App.pdf` zum Verteilen. Quelle `docs/anleitung/anleitung.html`; `npm run anleitung` erzeugt Bildschirmfotos, JPGs und PDF neu (`tools/anleitung/`). Test: e2e (Link, Bilder, Zurück zur App).
- BAU-FIX-1 · Phantom-Bauteile aus gelöschten Skizze-Formen ✅ PR offen – Branch bau/phantom-bauteile. Wurde eine Form in der Skizze Bau gelöscht oder getrennt, behielt das verknüpfte Bauteil Fläche und Maße der Form (z. B. Editor-Rechteck 12 × 8 = 96 m² als Gewächshaus → 27.525 € im PDF statt 0). Jetzt verliert es Fläche und Maße (0 m², „noch nicht gezeichnet“), gelöscht wird nichts; gilt auch für bestehende WEPs beim Export/PDF. Bau-Excel-Abgleich: Ein Bauteil, das im WEP nur gezeichnet ist (kein Typ, Baujahr, Mängel …), wird mit den Angaben der Excel ergänzt („Laube L ergänzen“), die Fläche aus der Skizze bleibt; vorher wurde es übersprungen und die Laube blieb ohne Bauklasse (0 €). Code: `src/bau/grundriss.ts` (`uebernehmeGrundriss`, `nurGezeichnet`), `src/bauexcel/bauAbgleich.ts`. Tests: `src/bau/__tests__/grundriss.test.ts`, `src/bauexcel/__tests__/bauAbgleich.test.ts`.
- BAU-GRUBE-1 · Altersabzug von Abwassergrube und Kanal vom Restwert ✅ PR offen – Branch bau/grube-restwert. Jährlich 3 % vom Restwert: (1 − 0,97^Alter) × 100 statt Alter × 3 (16 Jahre: 38,57 % statt 48 %). Der Kanalanschluss ebenso (1 − 0,97^Alter vom Erstellungspreis). App-Rechner (`altersabzugVomRestwert` in `src/bau/tabellen.ts`) und Export (Vorlagen-Korrekturen Baulichkeiten!C75 und H79 auf der Kopie, beide mit 2 Nachkommastellen über ein neues Zellformat) rechnen gleich; Tanks/monolithische Gruben weiter höchstens 16 Jahre, sonst und beim Kanal keine 33-Jahre-Grenze mehr (der Abzug erreicht nie 100 %). Anzeige im Reiter Abwasser und im übersichtlichen PDF angepasst. Tests: `src/bau/__tests__/bau.test.ts`, Export-Struktur, `src/pdf/__tests__/pdfInhalt.test.ts`, Reiter Abwasser.
- TEILEN-FIX-1 · WEP-Datei mit UUID-Kennung ließ sich nicht öffnen ✅ PR offen – Branch teilen/uuid-kennung. Die Prüfung in `src/teilen/lesen.ts` kannte nur Kennungen wie „2026-007“; seit VNR-1 haben neue WEPs eine UUID, ihre .wep-Datei wurde mit „Die Vorgangs-Nr. des WEP ist ungültig“ abgelehnt (Übergabe Bau → Grün, BV). Jetzt: alte Kennung oder UUID (streng, Dateiname). Test: `src/teilen/teilen.test.ts`.
- UEB-1 · Reiter „Übersicht“ im WEP ✅ PR offen – Branch wep/uebersicht (baut auf TEILEN-FIX-1 auf). Neuer Reiter für alle Rollen: Formalien, Bewertung wie das Deckblatt (Gesamtbetrag hervorgehoben), Baulichkeiten mit Rechenweg je Bauteil, Mängel, Abwasser, alle Positionen von Außenanlagen und Aufwuchs mit Menge, Einzelpreis, Summe, Beseitigung und Abzüge. Zahlen = übersichtliches PDF: `erzeugeWepProtokoll` (`src/pdf/index.ts`) nimmt denselben Excel-Export und dasselbe `leseProtokoll`; die Seite rechnet nach Änderungen kurz verzögert neu. Dieselbe Komponente (`src/app/Uebersicht.tsx`) wird die Detailansicht der BV-Kontrollseite. Dazu `grundrissAufContext`/`grundrissAlsPng` (`src/skizze/grundrissZeichnen.ts`): Grundriss-Zeichnung aus dem PDF herausgelöst, damit sie auch als Bild nutzbar ist. Tests: `src/app/__tests__/uebersicht.test.tsx` (Protokoll der Übersicht = Protokoll des PDF in allen Testfällen), e2e.
- EINST-1 · Export-Reiter nur „An den BV senden“, Entwickleroptionen ✅ PR offen – Branch einstellung/entwickleroptionen (baut auf UEB-1 auf). Wertermittler haben kein PDF mehr: Der Reiter heißt „An den BV senden“ (Kopf-Knopf „An den BV“) und zeigt nur das Paket. „Mit Excel arbeiten“ (gespeichert weiter als `ohneExcel`) und der Notfall-Schalter „PDF-Export anzeigen“ (`pdfExport`) liegen im zugeklappten Bereich „Entwickleroptionen“ am Ende des Profils, Standard beide aus. Paket für den BV: die WEP-Datei jetzt mit Fotos und Bau-Excel (die BV-Kontrollseite rechnet daraus dieselben Zahlen), keine JPG-Kopien mehr daneben; PDFs nur mit dem Notfall-Schalter. Tests: `src/app/__tests__/ohneExcel.test.tsx`, `src/design/kontrast.test.ts`, e2e.
- BV-2 · BV-Kontrollseite /bv ✅ PR offen – Branch bv/kontrollseite (baut auf EINST-1 auf). Unterseite `wep-pankow.pages.dev/bv` derselben App, nicht in der Navigation der Wertermittler. Kein Server mit WEP-Daten: Der BV öffnet .wep-Dateien und „…_an-BV.zip“-Pakete (mehrere Dateien, Ordner, Hineinziehen; ZIP auch ohne Endung am Inhalt erkannt), gelesen mit `leseTeilen`; gespeichert nur im Browser (eigene IndexedDB `wep-bv`, getrennt von `wep-db`). Tabelle: Vorgangs-Nr., Anlage, Parzelle/Weg, Unterpächter, Wertermittler Bau/Grün, Datum, Gesamtbetrag, Eingang, Status (neu/geprüft/Rückfrage mit Notiz), Filter nach Status; Hinweise „Vorgangs-Nr. fehlt“ und doppelte Nr. (neueste Fassung gekennzeichnet). Detail nur lesend: dieselbe Übersicht wie bei den Wertermittlern (mit der mitgeschickten Bau-Excel als Quelle), Skizzen (Bau als Bild über `grundrissAlsPng`, Grün über `skizzeAlsPng`), Fotos mit Position, „PDF übersichtlich“/„PDF wie Vorlage“ (mit Fotos) und „Drucken“ (Druck-CSS). Anleitung: Kapitel 9 neu (Übersicht, An den BV senden), Kapitel 10 „Für den BV: die Kontrollseite“. Code: `src/bv/`. Tests: `src/bv/__tests__/eingang.test.ts`, e2e (Paket öffnen, Betrag Tabelle = Detail, Status, PDF, Neuladen). **Offen (Sitzung B):** Anmeldung und Freigabe für /bv (Ziel 4), alle Microsoft-Konten (Ziel 5).
- UNTERSCHRIFT-1 · Unterschrift reist mit dem WEP ✅ PR offen – Branch unterschrift/im-paket. Neues Feld `Wep.unterschriften { bau?, gruen? }` (PNG-Data-URLs). Beim Teilen und beim Paket „An den BV senden“ kommt immer die Unterschrift des Absenders aus dem Profil für seinen Teil dazu (Rolle im Profil × Teile des WEP; bei „Beides“ mit zwei verschiedenen Wertermittlern der Teil mit seinem Namen), ohne Rückfrage; mitgereiste Unterschriften des anderen Teils bleiben (Bau → Grün → BV: beide). Einspielen: mit dem Bau-/Grün-Teil kommt dessen Unterschrift. Hinweis (nur Info) in Teilen-Dialog und „An den BV senden“. BV-Seite: beide PDF-Formen setzen die Unterschrift an der Stelle des jeweiligen Wertermittlers (`unterschriften` in `PdfOptionen`), ohne Unterschrift bleibt das Feld leer. Code: `src/teilen/unterschriften.ts`, `src/app/UnterschriftHinweis.tsx`, `src/pdf/erzeugen.ts` (`unterschriftsBilder`). Tests: `src/teilen/unterschriften.test.ts`, e2e.
- KONTO-5 · Alle Microsoft-Konten (Ziel 5) ✅ PR offen – Branch konto/alle-microsoft-konten. Anmeldung in Browser (MSAL), Android und Windows über `common` statt `consumers`: persönliche und Geschäfts-/Schulkonten. Android/Windows merken den Tenant aus dem ID-Token (`tid`, persönliche Konten → `consumers`) und erneuern dort (TS, Kotlin `TokenStore`, Rust `ist_token_url`); gespeicherte Anmeldungen ohne Tenant erneuern wie bisher über `consumers` – persönliche Konten unverändert. Verständliche Meldung bei fehlender Administratorzustimmung (AADSTS65001/90094, `src/konto/fehler.ts`), auch nach der Rückkehr vom Browser-Login. Versionen: `android/native-version.txt` 7, Windows 0.1.3, Hülle 3 (ältere Apps lehnen die neue Anmelde-Adresse ab, daher kein Live-Update auf alte Hüllen). Azure-Umstellung und Hinweis für die BV-IT: docs/SYNC.md „Alle Microsoft-Konten“. Tests: `src/konto/*.test.ts`, Rust `nur_microsoft_token_endpunkte` (läuft im Windows-Test-Build).
- BV-3 · Zugang zur BV-Kontrollseite mit Freigabe (Ziel 4) ✅ PR offen – Branch bv/zugang-freigabe (baut auf KONTO-5 auf). Ist die Kontrolle eingeschaltet (`BV_ZUGANG_AKTIV=true` + KV-Bindung `BV_ZUGANG`), verlangt /bv eine Microsoft-Anmeldung; neue Konten bekommen „Zugang beantragt – wartet auf Freigabe“, Admins (`BV_ADMINS`) geben unter /bv/admin frei, sperren, löschen. Pages Functions prüfen das ID-Token serverseitig (Microsoft-JWKS, aud, iss passend zur tid, exp/nbf) und speichern nur Anträge/Freigaben (oid, tid, Name, E-Mail, Status, Zeiten). Offline gilt eine bestätigte Freigabe 7 Tage. Ohne eingeschaltete Kontrolle (Vorschau, lokal, Function fehlt) läuft /bv wie bisher. Anmeldung der Seite mit eigenem MSAL im Sitzungsspeicher (stört die Wertermittler-App im selben Browser nicht), stille Wiederanmeldung. Einrichtung für Simon: docs/BV-ZUGANG.md. Tests: `functions/_lib/__tests__/bvZugang.test.ts`, `src/bv/__tests__/zugang.test.ts`, e2e (Sperre, 7 Tage offline).
- PDF-BB-1 · Baubeschreibung im übersichtlichen PDF mit Zeilenumbrüchen ✅ PR offen – Branch pdf/baubeschreibung-zeilen. Bisher hing das PDF alle Zeilen aneinander (und las nur Spalte B). Jetzt bleibt jede Zeile eine Zeile wie in der Bau-Excel bzw. wie eingetippt, Leerzeile = neuer Absatz. Quelle ist der Text im WEP (die Excel-Zeilen 83–99 taugen nicht, weil der Export lange Zeilen umbricht); ohne Text im WEP je Excel-Zeile eine Zeile (B–K). Code: `baubeschreibung` in `src/pdf/uebersicht/daten.ts`. Tests: `src/pdf/__tests__/uebersicht.test.ts`.
- PROFIL-KGA-1 · Standard-Kleingartenanlage aus dem Profil entfernt ✅ PR offen – Branch profil/ohne-standard-kga. Im Profil gibt es keine „Standard-Kleingartenanlage“ mehr; neue WEPs (auch aus einer Bau-Excel) kommen ohne vorbelegte Anlage, sie wird in den Formalien gewählt (Auswahlliste bleibt). Ein alter gespeicherter Wert wird beim Laden des Profils verworfen; Sicherungen und Profil-Dateien älterer Apps lassen sich weiter lesen. Code: `src/profil/index.ts`, `src/app/Profil.tsx`, `src/sicherung/vorschau.ts`. Tests angepasst (`sync`, `sicherung`, `bauexcel`, `model`), e2e, Anleitung.

## v2 – Server, Konten mit Rollen (Plan: docs/PLAN-V2.md, Einrichtung: docs/V2-EINRICHTUNG.md)
- V2-0 · Plan, Schalter, Einrichtungsanleitung ✅ gemergt (über #113 auf main) – Branch v2/plan-und-schalter. `docs/PLAN-V2.md` (Zielbild, Zustände, technische Leitplanken, Datenschutz, Reihenfolge). Schalter: `VITE_SERVER_MODUS=true` (Web, `src/server/modus.ts`; zeigt das Band „v2-Vorschau – nur Testdaten“) und `SERVER_MODUS=true` (Functions, `functions/_lib/serverModus.ts`; ohne ihn 404 für alles unter `/api/v2/`). `GET /api/v2/status` meldet je Teil (D1, R2, Google, Microsoft, Mail, Admins) nur ja/nein. Ohne Schalter keine Änderung (einzig: der Service Worker leitet Seitenaufrufe unter `/api/` nicht mehr auf die App um). Schritt-für-Schritt für Simon: `docs/V2-EINRICHTUNG.md` (D1 und R2 mit Jurisdiktion EU nur für Vorschau, Google OAuth-Client, Resend mit Domain, Azure-Plattform „Web“ mit Geheimnis). Tests: `src/server/modus.test.ts`, `functions/_lib/__tests__/serverModus.test.ts`. **Offen:** Simon richtet ein und meldet, ob der EU-Bucket in der Pages-Bindung erscheint; Domain für Resend klären.
- V2-1 · Server-Grundgerüst ✅ gemergt (über #113 auf main) – Branch v2/server-grundgeruest (baut auf V2-0 auf). D1-Schema `migrations/0001_konten.sql` (Konten, Sitzungen, laufende Anmeldungen, Zugriffsprotokoll, `schema_stand`; `/api/v2/status` zeigt den Stand). Anmeldung mit Google und Microsoft über den Server (OIDC Authorization Code mit PKCE, state an ein Cookie des Browsers gebunden, nonce; ID-Token gegen die Schlüssel des Anbieters geprüft), Konto-Schlüssel Google `sub`, Microsoft `tid:oid`. Neue Konten „wartet auf Freigabe“; erste Admins über `V2_ADMINS` (nur bestätigte Adressen). Sitzung 30 Tage als Cookie `wep_sitzung` (HttpOnly, Secure, SameSite=Lax), in D1 nur der SHA-256-Hash; Bearer-Token für spätere Apps vorbereitet. Schreibende Anfragen nur mit passendem `Origin`. Admin-Seite in der App (Profil → Konten verwalten): freigeben, sperren (beendet Sitzungen), löschen, Rollen (Wertermittler Bau ODER Grün, dazu BV, Admin; eigenes Konto nicht aussperrbar); Mail-Benachrichtigung je Konto abschaltbar (gespeichert, Versand in V2-5). App im Server-Modus: Anmelde-Bildschirm Google/Microsoft, „Wartet auf Freigabe“/„gesperrt“, Start ohne Netz mit dem zuletzt bestätigten Konto, kein OneDrive. Endpunkte `functions/api/v2/` (`anmeldung/[anbieter]/start|zurueck`, `ich`, `abmelden`, `admin/konten`, `admin/konten/[id]`), Logik `functions/_lib/v2/`, App `src/server/`. Tests: `functions/_lib/__tests__/v2Konten.test.ts` (SQLite aus Node mit denselben Migrationen, Anbieter mit Testschlüssel nachgebaut), Durchlauf `npm run v2:durchlauf` (echter Browser gegen die echten Functions). **Offen:** WEPs liegen im Server-Modus noch nur auf dem Gerät (V2-2); Android/Windows im Server-Modus später.
- V2-2 · WEPs auf dem Server ✅ gemergt (über #113 auf main) – Branch v2/weps-auf-server (baut auf V2-1 auf). D1 `migrations/0002_weps.sql` (WEP als JSON mit Revision, Spalten für Zustand, Bau-/Grün-Konto, Vorgangs-Nr., Anlage, Parzelle, Papierkorb; Verlauf). Endpunkte `GET /api/v2/weps`, `GET|PUT|DELETE /api/v2/weps/<id>`, `POST …/wiederherstellen`, `GET …/verlauf`. Rechte gemeinsam für Server und App in `src/server/rechte.ts`: anlegen nur mit Rolle Bau (wird Besitzer), schreiben in „bau_in_arbeit“ nur der Besitzer, lesen nur Beteiligte (BV/Admin erst ab „beim_bv“), Papierkorb nur der Besitzer. Speichern nur mit passender Revision, sonst 409 mit dem Stand des Servers. Verlauf: angelegt, bearbeitet (höchstens einmal je Person und Stunde), gelöscht, wiederhergestellt. App: Abgleich `src/server/abgleich.ts` über IndexedDB wie in v1 (lokal arbeiten, Änderungen warten offline; zwei Geräte geändert → die neuere gilt, die andere bleibt sichtbar; gelöscht/geändert wird gefragt; gesperrtes WEP → Stand des Servers, eigene Änderung als Fassung; „endgültig löschen“ nur auf dem Gerät, der Server behält es im Papierkorb), Statuszeile „mit dem Server abgeglichen / n Änderungen warten“, Abgleich beim Öffnen, bei Netz und jede Minute. Rolle im Profil kommt im Server-Modus vom Konto (Bau/Grün). Tests: `functions/_lib/__tests__/v2Weps.test.ts`, `src/server/abgleich.test.ts` (zwei Geräte gegen die echte Server-Logik), `npm run v2:durchlauf` (Bert legt an, zweites Gerät bekommt es, ohne Server wartet die Änderung). **Offen:** Fotos und Bau-Excel in R2 (eigener PR, V2-2b); bis dahin bleiben sie im Server-Modus auf dem Gerät.
- V2-2b · Fotos und Bau-Excel in R2 ✅ gemergt (über #113 auf main) – Branch v2/dateien-r2 (baut auf V2-2 auf). R2-Bindung `WEP_DATEIEN` (EU): `weps/<id>/fotos/<Foto-Id>.jpg`, `weps/<id>/bau.xlsx`; Endpunkte `GET /api/v2/weps/<id>/dateien`, `GET|PUT|DELETE …/dateien/<foto-Id.jpg|bau.xlsx>` mit denselben Rechten wie das WEP (lesen bzw. bearbeiten; Grün ab Paket 3 nur Fotos), nur diese Namen, Größe (Foto 15 MB, Bau-Excel 10 MB) und Art (JPEG/ZIP) geprüft, `cache-control: private, no-store`. App: Abgleich der Dateien nach den WEPs (`src/server/dateiAbgleich.ts`): hochladen erst, wenn das WEP auf dem Server ist, „nur WLAN“ gilt, gelöschte Fotos/entfernte Bau-Excel erst entfernen, wenn das WEP ohne sie angekommen ist, Papierkorb lässt die Dateien beim WEP, gesperrtes WEP lädt nichts. Nachladen beim Öffnen (Fotos, Bau-Excel, PDF) im Server-Modus vom Server; Texte „auf dem Server“ statt „in OneDrive“. Tests: `functions/_lib/__tests__/v2Dateien.test.ts`, `src/server/dateiAbgleich.test.ts` (gegen die echte Server-Logik mit R2-Ersatz), `npm run v2:durchlauf` (Foto auf Gerät A, auf Gerät B vom Server geladen).
- V2-3 · Ablauf ✅ gemergt (über #113 auf main) – Branch v2/ablauf (baut auf V2-2b auf). Zustandsautomat für Server und App in `src/server/rechte.ts` (vollständige Tabelle getestet): `bau_in_arbeit` → An Grün (Auswahl eines freigegebenen Grün-Wertermittlers, nie dieselbe Person) → `gruen_in_arbeit` → An den BV → `beim_bv`; Rückfrage des BV an Bau, Grün oder beide (`rueckfrage`, „beide“: Bau → Grün → BV, nur Bau: direkt an den BV), `geprueft`, wieder öffnen mit Begründung (BV/Admin). Schritte serverseitig über `POST /api/v2/weps/<id>/aktion` nur auf dem aktuellen Stand (Revision); Abgabe in der App erst nach dem Abgleich. Jeder nur in seinem Teil (`src/server/teile.ts`): Grün ändert nur Grün-Teil (Außenanlagen, Aufwuchs, Beseitigung AA/Aufwuchs, Grün-Skizze, Unterschrift Grün, Fotos an Grün-Positionen, neue Fotos), Bau nach Beteiligung von Grün alles außer dem Grün-Teil; der Server führt zusammen und die App lädt den Stand neu. Bei der Abgabe an Grün setzt der Server Rolle „beides“ und die Namen der Wertermittler. Der Server liefert den Ablauf im WEP mit (`Wep.ablauf`: Zustand, Bau/Grün mit Namen, offene Rückfrage). App: Reiter nach Recht (Bau seinen Teil, Grün nur Grün-Teil + Übersicht, nach der Abgabe nur Übersicht), Reiter „Abgabe“ (Stand, Rückfrage, Schritte, Verlauf), Zustand in Liste und Kopf, Menü ohne Status/Teilen, Löschen nur für den Besitzer vor der Abgabe, „Neues WEP“ nur für Bau. D1 `migrations/0003_ablauf.sql`, `GET /api/v2/konten/gruen`. Tests: `functions/_lib/__tests__/v2Ablauf.test.ts` (Tabelle, Schritte, Teile, ganzer Weg mit Verlauf), `src/server/abgleich.test.ts` (zwei Personen), `npm run v2:durchlauf` (Bert → Erika → BV).
- V2-4 · BV-Kontrollseite mit Server-Daten ✅ gemergt (über #113 auf main) – Branch v2/bv-server (baut auf V2-3 auf). `/bv` im Server-Modus: Anmeldung über den Server, Zugang für Konten mit Rolle BV oder Admin. Tabelle der abgegebenen WEPs vom Server (beim BV, Rückfrage, geprüft; Entwürfe nie) mit Vorgangs-Nr., Anlage, Parzelle/Weg, Unterpächter, Wertermittler Bau/Grün, Datum, Gesamtbetrag (nachgerechnet), zuletzt geändert, Zustand mit Rückfrage-Notiz, Filter. Detail wie bisher (Übersicht, Skizzen, Fotos und Bau-Excel vom Server, PDF übersichtlich/wie Vorlage mit Unterschriften, Drucken, Verlauf) und die Schritte des BV: Rückfrage an Bau, Grün oder beide mit Notiz, geprüft, wieder öffnen mit Begründung. `src/bv/BvServer.tsx`; Skizzen/Fotos aus `BvDetail.tsx` gemeinsam genutzt. Dazu im Server-Modus: wechselt die Person auf einem Gerät, gehören Name, Unterschrift und eigene Baupreisindex-Werte im Profil nicht mehr zur vorigen Person (zurückgesetzt); bei der Abgabe kommt die eigene Unterschrift für den eigenen Teil ins WEP. Durchlauf `npm run v2:durchlauf` (Bea: Liste, PDF, Rückfrage an Grün → Erika gibt wieder ab → geprüft → wieder geöffnet, Verlauf mit Notizen). **Offen:** Die Kontrollseite im Server-Modus braucht Netz (kein Offline-Speicher wie in v1).
- V2-5 · Benachrichtigungen ✅ gemergt (über #113 auf main) – Branch v2/benachrichtigungen (baut auf V2-4 auf). D1 `migrations/0004_benachrichtigungen.sql`. Bei jedem Schritt im Ablauf bekommen Bescheid: an Grün → der gewählte Grün-Wertermittler; an den BV → alle BV-Konten; Rückfrage → wer gefragt ist (Bau, Grün oder beide); geprüft/wieder geöffnet → beide Wertermittler; nie die Person selbst. In der App „Neu für dich“ auf der Startseite (antippen öffnet das WEP, vorher wird abgeglichen; „Alle als gelesen markieren“), per E-Mail über Resend, je Konto im Profil abschaltbar. Mails nur mit Vorgangs-Nr., Anlage, Parzelle und Link (`/?wep=<id>` öffnet das WEP, BV: `/bv?wep=<id>`), keine Namen von Pächtern oder Wertermittlern, keine Beträge; Versand nach der Antwort (`waitUntil`), ein Mailfehler ändert nichts am Schritt und steht bei der Benachrichtigung. Endpunkte `GET /api/v2/benachrichtigungen`, `POST /api/v2/benachrichtigungen/gelesen`. Tests: `functions/_lib/__tests__/v2Benachrichtigungen.test.ts`, `npm run v2:durchlauf` (Resend nachgebaut: Mails an Grün und BV, „Neu für dich“, Link aus der Mail).
- V2-6 · Anleitung und Durchlauf ✅ gemergt (über #113 auf main) – Branch v2/anleitung-durchlauf (baut auf V2-5 auf). **Anleitung v2** (`docs/anleitung-v2/anleitung.html`, Sie-Form, 10 Kapitel: Überblick und Rollen, Anmelden/Freigabe, Konten und Rollen für Admins, Bau anlegen und an Grün abgeben, Grün-Teil und Abgabe an den BV, BV prüfen/Rückfrage/geprüft, Rückfrage beantworten, Benachrichtigungen, ohne Netz und mehrere Geräte, häufige Fragen) mit Bildschirmfotos aus der Testumgebung: `npm run anleitung:v2` → `public/anleitung-v2/` (in der App unter Profil → Anleitung, nur in Builds mit Schalter; v1-Geräte laden sie nicht) und `docs/anleitung-v2/Anleitung_WEP-App_v2.pdf`. Testumgebung ausgelagert nach `tools/v2/umgebung.ts` (echte Functions, SQLite, R2-Ersatz, nachgebaute Anmeldung und Resend) – genutzt vom Durchlauf und den Bildschirmfotos. **Durchlauf** `npm run v2:durchlauf` mit drei Testkonten Bau (Bert), Grün (Erika), BV (Bea), dazu Admin (Ada) und Max: Anmeldung/Freigabe, zwei Geräte, ohne Netz, Fotos, Abgabe Bau → Grün → BV, Rückfrage an Grün und an beide, geprüft, wieder geöffnet, Benachrichtigungen, Anleitung (77 Prüfungen). `tools/anleitung/pdf.mjs` nimmt Quelle, Ziel und PDF-Namen als Argumente (ohne Argumente wie bisher).
- V2-PROD · v2 direkt in Produktion ✅ PR offen – Branch v2/production. Kein Vorschau-Band mehr (`VorschauBand.tsx` entfernt). `docs/V2-EINRICHTUNG.md` auf Produktion umgeschrieben (Umgebung „Produktion“, Namen `wep-v2`, Rücksprung-Adressen `https://wep-pankow.pages.dev/api/v2/anmeldung/{google,microsoft}/zurueck` plus localhost, Google-App „In Produktion“, danach „Version freigeben“, weil Production aus `release` baut). **Android und Windows:** Ihre APK/EXE bauen in GitHub Actions **ohne** `VITE_SERVER_MODUS` (v1), das Live-Update-Paket kommt aber aus dem Production-Build **mit** Schalter. Deshalb ist der Server-Modus in den Apps aus (`modusFuer` in `src/server/modus.ts`): sie laufen weiter wie v1 (OneDrive) und zeigen „bitte im Browser nutzen“ (`src/server/NurImBrowser.tsx`). Tests: `src/server/modus.test.ts`, Durchlauf v2 prüft die nachgestellte Windows-App (73 Prüfungen). Keine Änderung an `android/`, Plugins, `src-tauri/`.
- V2-7 · Echte Daten: Migration der bestehenden WEPs (OneDrive/.wep → Server) – später (erst nach AV-Vertrag mit dem BV und Rechtsberatung; bis dahin nur Testdaten auf dem Server, auch in Produktion)
- V2-8 · Server-Modus für Android und Windows – als Nächstes. Anmeldung per Bearer-Token (im Server vorbereitet, `functions/_lib/v2/sitzung.ts`), Anmeldung über den Systembrowser mit Rücksprung in die App, `/api/v2` mit absoluter Adresse; danach entfällt der Hinweis „bitte im Browser nutzen“. Versionsnummern der Apps steigen.
- V2-RECHT-1 · Datenschutzerklärung und Nutzungsbedingungen (für die Google-OAuth-Veröffentlichung) ✅ PR offen – Branch recht/datenschutz-seiten. Zwei statische Seiten `public/datenschutz.html` und `public/nutzungsbedingungen.html` (Adressen `/datenschutz` und `/nutzungsbedingungen`), ohne Anmeldung und offline (Precache) in Builds mit und ohne `VITE_SERVER_MODUS`. Beide als „Entwurf – rechtlich noch nicht geprüft“ markiert. Testphase: Simon Bleher ist Verantwortlicher (nur E-Mail), Hinweis „Testphase, erfundene Daten“ oben; nur Cloudflare-DPA und Resend-Vertrag bleiben als „[BITTE ERGÄNZEN]“ offen. Links in Anmeldeseite (v1 und v2), Wartebildschirm, Startseite (Fußzeile), Profil und beiden Anleitungen (`RechtLinks.tsx`). Tests: `rechtsseiten.test.tsx`, `npm run e2e` und `npm run v2:durchlauf` prüfen Erreichbarkeit ohne Anmeldung und Eintrag im Service Worker. **Offen:** Rechtsprüfung, DPA/Resend-Vertrag, Umstellung auf BV als Verantwortlichen mit AV-Vertrag (V2-7), automatische Löschung des Zugriffsprotokolls nach 90 Tagen.
- V2-RECHT-2 · Korrekturen an den Rechtsseiten ✅ PR offen – Branch recht/datenschutz-korrekturen. Resend als Resend, Inc. (USA) mit Hinweis auf Versandregion, neuer Abschnitt „Übermittlung in Drittländer“, Rechtsgrundlage lit. f für Zugriffsprotokoll und Verbindungsdaten, Cloudflare- und Resend-DPA statt Platzhalter, „der Betreiber“ statt „wir“, Formulierung in den Nutzungsbedingungen. Keine [BITTE ERGÄNZEN]-Stellen mehr; Entwurfs-Hinweis bleibt. **Offen:** Rechtsprüfung, Umstellung auf BV (V2-7).
- V2-RECHT-3 · Abschnitt „Google-Nutzerdaten“ (deutsch + englisch, Limited Use) in `public/datenschutz.html` ✅ PR offen – Branch recht/google-nutzerdaten. Test in `rechtsseiten.test.tsx`.
