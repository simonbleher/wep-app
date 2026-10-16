# Aufgaben

Status: ⬜ offen · 🔄 in Arbeit · 👀 PR offen · ✅ erledigt

Jede Aufgabe wird in ihrem Slack-Channel als **eigener Thread** gestartet.
Der fertige Prompt steht jeweils darunter.

## Phase 1 – Grün-Teil

### K1 · Katalog aus der BewRL 👀 (#katalog)
Ergebnis: `data/katalog.json` + `data/katalog.schema.json` + kurze Doku `data/README.md`
Stand: Branch katalog/bewrl-katalog – katalog.json (52 Positionen inkl. S. 18 Ziergehölze/Hecken/Rasen+geschützter Baum), invasive.json (41 Arten), Schema + README – PR #1 offen, ✅ nach Merge.
> Lies CLAUDE.md und docs/ARCHITEKTUR.md. Erstelle aus docs/Richtlinie.pdf (Abschnitte
> II Außenanlagen und III Aufwuchs, S. 12–18) den Katalog data/katalog.json: jede
> Position mit id, Kategorie, Bezeichnung, Einheit, Altersstufe/Form (falls vorhanden),
> Höchstwert in €, Seitenzahl der Richtlinie und den relevanten Regeln als Text.
> Ergänze ein Feld "arten" mit gängigen Pflanzen, die in diese Kategorie fallen
> (Apfel, Birne, Liguster, Kirschlorbeer, Thuja, Forsythie …), und ein Feld
> "relevanz" (1–5) für die Sortierung im Kleingarten. Lege außerdem
> data/invasive.json aus der Unionsliste (Anlage, S. 25) an. Prüfe jeden Höchstwert
> gegen das PDF. Erstelle einen PR.

### K2 · Suche & Sortierung ⬜ (#katalog) – nach K1
> Implementiere in src/katalog/ eine Suchfunktion über data/katalog.json:
> tippfehlertolerant, findet auch Arten-Namen (Apfel → Obstgehölz), sortiert ohne
> Suchbegriff nach relevanz und "zuletzt verwendet". Mit Unit-Tests. PR.

### A1 · PWA-Grundgerüst ⬜ (#app-gruen)
> Lies CLAUDE.md und docs/ARCHITEKTUR.md. Lege das PWA-Grundgerüst an (TypeScript,
> Vite, installierbar, offline per Service Worker, IndexedDB). Begründe die
> Framework-Wahl in docs/ENTSCHEIDUNGEN.md. Ziel-Geräte: Handy und Tablet im
> Freien → große Bedienelemente, hoher Kontrast. Lege src/model/ mit den Typen aus
> der Architektur an. Startseite: Liste der WEPs + „Neues WEP“. PR.

### A2 · Erfassung Formalien + Aufwuchs + Außenanlagen ⬜ (#app-gruen) – nach A1, K2
> Baue die Erfassungsmasken: Formalien, Außenanlagen, Aufwuchs. Position hinzufügen
> über Schnellsuche (src/katalog), dann Anzahl, Einheit, Zustand, Preis
> (Vorschlag = Höchstwert × Zustand, überschreibbar), eigene Pflanze per Freitext.
> Regel-Warnungen anzeigen, nicht blockieren. Live-Summe. PR.

### E1 · Excel-Export ⬜ (#export) – nach A1
> Lies docs/ARCHITEKTUR.md (Zellen-Mapping). Schreibe src/export/, das ein Wep-Objekt
> in eine Kopie von docs/WEP_Vorlage.xlsx schreibt – nur die Eingabezellen, Formeln
> und Formatierung bleiben erhalten. Überlauf Aufwuchs I → II. Wähle eine
> Bibliothek, die im Browser läuft und die Vorlage nicht beschädigt, und begründe
> sie in docs/ENTSCHEIDUNGEN.md. Test: Beispiel-WEP exportieren, Datei mit
> LibreOffice neu berechnen und Summen prüfen. PR.

### S1 · Einfaches Skizzen-Tool ⬜ (#skizze) – nach A1
> Einfache Zeichenfläche für die Parzellenskizze: Rechteck, Linie, Kreis (Baum),
> Text, Maßangabe, Rückgängig. Speichern als JSON, Export als PNG für die Vorlage.
> Touch-tauglich. Vorläufige Lösung, wird später ersetzt – also schlank halten. PR.

### Y1 · Sync-Konzept OneDrive ⬜ (#sync)
> Erstelle docs/SYNC.md: Wie synchronisiert die PWA die Rollen-Dateien
> (<id>.gruen.json, <id>.bau.json, <id>.skizze.json) über Microsoft Graph mit einem
> OneDrive/SharePoint-Ordner des BV? Offline-Warteschlange, Sperre für die Skizze,
> nötige App-Registrierung/Rechte, Datenschutz. Noch kein Code. PR.

## Offene Fragen an Simon / den BV
- Zustandsstufen: feste Prozent-Staffel oder freie Schätzung?
- Geräte vor Ort: Handy oder Tablet?
- OneDrive: Microsoft-365-Konto des BV mit Admin, der eine App freigeben kann?
- Blätter „Anl IV Schuppen“ / „Anl IV Dach“ (versteckt, viele #REF!): noch gebraucht?
