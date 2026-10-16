# Entscheidungen

| Datum | Entscheidung | Grund |
|-------|--------------|-------|
| 2026-10-16 | PWA statt nativer Apps | Eine Codebasis für Handy, Tablet und Windows |
| 2026-10-16 | WEP intern als JSON, Excel nur beim Export | Vorlage ist komplex und auf der Parzelle nicht bedienbar |
| 2026-10-16 | Eine Datei pro Rolle (grün/bau) beim Sync | Keine Schreibkonflikte zwischen Bau- und Grün-Wertermittler |
| 2026-10-16 | Vorlage bereinigt (externe Verknüpfung, 54 tote Namen entfernt) | Externe Datei existiert auf anderen Rechnern nicht |
| 2026-10-16 | Preise sind Vorschläge, Regeln nur Warnungen | Wertermittler dürfen nicht eingeschränkt werden |
| 2026-10-16 | Schema für data/katalog.json: eine Position hat entweder ein einzelnes Feld `hoechstwert` oder ein Array `varianten` (Differenzierung nach Form/Alter/Größe/Material/Ausführung), nie beides. Felder `arten` (Beispielpflanzen) und `relevanz` (1–5) ergänzt. Invasive Arten in separater data/invasive.json. | Die Richtlinie gibt teils Einzelpreise, teils Preismatrizen (z. B. Obstgehölze nach Form × Alter) vor; ein einheitliches Varianten-Modell bildet beides sauber ab und bleibt für Suche/Sortierung (K2) und Erfassung (A2) nutzbar. Zwei Druckfehler der Quelle (75;00 €, Aufnahmejahr 2027) wurden dokumentiert in data/README.md übernommen. |
| 2026-10-16 | Framework/Stack für die PWA: React + TypeScript + Vite + vite-plugin-pwa (Workbox) + idb | Vite liefert einen schnellen Dev-Server, schlanke Builds und erstklassige PWA-Unterstützung. React ist die am weitesten verbreitete Bibliothek, vertraut für ein formularlastiges UI und erleichtert die Zusammenarbeit mehrerer Agenten. vite-plugin-pwa erzeugt Service-Worker/Offline-Precaching und das installierbare Manifest ohne Handarbeit. idb ist ein dünner, typsicherer Wrapper um IndexedDB. Gegen reines Vanilla-TS spricht der hohe Boilerplate-Aufwand für reaktive Formulare, gegen Svelte die geringere Team-Vertrautheit. |
| 2026-10-16 | Beta nur für einen Nutzer (Grün); Sync über privates OneDrive (App-Ordner), kein Bau-Teil in der App; Export führt Bau-Excel + Grün-Daten zusammen | Testphase: schnell nutzbar ohne BV-Admin, App-Registrierung oder Rollenabgleich; Bau-Wertermittler arbeitet unverändert in Excel |
