# Aufgaben

Status: ⬜ offen · 🔄 in Arbeit · 👀 PR offen · ✅ erledigt

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

### K3 · Kleinigkeit Suche 👀 (#katalog)
> „Insektenhotel“ findet das Ökologische Objekt nicht: Varianten-Feld `typ` in die
> Suche aufnehmen (src/katalog/suche.ts) und testen. PR.

### A1 · PWA-Grundgerüst ✅ (#app-gruen)
> Lies CLAUDE.md und docs/ARCHITEKTUR.md. Lege das PWA-Grundgerüst an (TypeScript,
> Vite, installierbar, offline per Service Worker, IndexedDB). Begründe die
> Framework-Wahl in docs/ENTSCHEIDUNGEN.md. Ziel-Geräte: Handy und Tablet im
> Freien → große Bedienelemente, hoher Kontrast. Lege src/model/ mit den Typen aus
> der Architektur an. Startseite: Liste der WEPs + „Neues WEP“. PR.

### A2 · Erfassung Formalien + Aufwuchs + Außenanlagen 👀 (#app-gruen) – nach A1, K2
> Baue die Erfassungsmasken: Formalien, Außenanlagen, Aufwuchs. Position hinzufügen
> über Schnellsuche (src/katalog), dann Anzahl, Einheit, Zustand, Preis
> (Vorschlag = Höchstwert × Zustand, überschreibbar), eigene Pflanze per Freitext.
> Regel-Warnungen anzeigen, nicht blockieren. Live-Summe. PR.

### A3 · Verbesserungen Erfassung 👀 (#app-gruen) – nach A2 (von der Leitung selbst umgesetzt)
> Kürzere Bezeichnungen mit gefundener Art („Liguster-Hecke (Laub, einfache Art)“,
> „Apfel, Halbstamm, 5–30 J.“), Bezeichnung immer editierbar; Variante aus dem
> Suchtreffer übernehmen (Variantenschritt überspringen); Richtlinien-Infos in der
> Positionsliste einklappbar, Warnungen bleiben sichtbar; deutsche Zahlen (Komma
> bei Eingabe und Anzeige, Faktor 0,75); alle Labels mit ihren Feldern verknüpft. PR.

### E1 · Excel-Export: Bau-Excel + App → fertiges WEP 👀 (#export) – PR #7
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

### S1 · Einfaches Skizzen-Tool 👀 (#skizze) – PR #9, nach A1
> Einfache Zeichenfläche für die Parzellenskizze: Rechteck, Linie, Kreis (Baum),
> Text, Maßangabe, Rückgängig. Speichern als JSON, Export als PNG für die Vorlage.
> Touch-tauglich. Vorläufige Lösung, wird später ersetzt – also schlank halten. PR.

### Y1 · Sync über Simons privates OneDrive 👀 (#sync) – PR #8, Anleitung in docs/SYNC.md
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

## Offene Fragen an Simon / den BV
- Zustandsstufen: feste Prozent-Staffel oder freie Schätzung?
- Geräte vor Ort: Handy oder Tablet?
- ~~OneDrive des BV~~ → Beta: privates OneDrive von Simon (BV-OneDrive später)
- Blätter „Anl IV Schuppen“ / „Anl IV Dach“ (versteckt, viele #REF!): noch gebraucht?
