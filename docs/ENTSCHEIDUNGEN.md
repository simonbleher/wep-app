# Entscheidungen

| Datum | Entscheidung | Grund |
|-------|--------------|-------|
| 2026-10-16 | PWA statt nativer Apps | Eine Codebasis für Handy, Tablet und Windows |
| 2026-10-16 | WEP intern als JSON, Excel nur beim Export | Vorlage ist komplex und auf der Parzelle nicht bedienbar |
| 2026-10-16 | Eine Datei pro Rolle (grün/bau) beim Sync | Keine Schreibkonflikte zwischen Bau- und Grün-Wertermittler |
| 2026-10-16 | Vorlage bereinigt (externe Verknüpfung, 54 tote Namen entfernt) | Externe Datei existiert auf anderen Rechnern nicht |
| 2026-10-16 | Preise sind Vorschläge, Regeln nur Warnungen | Wertermittler dürfen nicht eingeschränkt werden |
| 2026-10-16 | Schema für data/katalog.json: eine Position hat entweder ein einzelnes Feld `hoechstwert` oder ein Array `varianten` (Differenzierung nach Form/Alter/Größe/Material/Ausführung), nie beides. Felder `arten` (Beispielpflanzen) und `relevanz` (1–5) ergänzt. Invasive Arten in separater data/invasive.json. | Die Richtlinie gibt teils Einzelpreise, teils Preismatrizen (z. B. Obstgehölze nach Form × Alter) vor; ein einheitliches Varianten-Modell bildet beides sauber ab und bleibt für Suche/Sortierung (K2) und Erfassung (A2) nutzbar. Zwei Druckfehler der Quelle (75;00 €, Aufnahmejahr 2027) wurden dokumentiert in data/README.md übernommen. |
