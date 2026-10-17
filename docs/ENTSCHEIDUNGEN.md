# Entscheidungen

| Datum | Entscheidung | Grund |
|-------|--------------|-------|
| 2026-10-16 | PWA statt nativer Apps | Eine Codebasis für Handy, Tablet und Windows |
| 2026-10-16 | WEP intern als JSON, Excel nur beim Export | Vorlage ist komplex und auf der Parzelle nicht bedienbar |
| 2026-10-16 | Eine Datei pro Rolle (grün/bau) beim Sync | Keine Schreibkonflikte zwischen Bau- und Grün-Wertermittler |
| 2026-10-16 | Vorlage bereinigt (externe Verknüpfung, 54 tote Namen entfernt) | Externe Datei existiert auf anderen Rechnern nicht |
| 2026-10-16 | Preise sind Vorschläge, Regeln nur Warnungen | Wertermittler dürfen nicht eingeschränkt werden |
| 2026-10-17 | Vite + React + TypeScript als PWA-Grundgerüst (S2/A1) | Schneller Build, TypeScript-First, breite Ökosystem-Unterstützung; React für komponentenbasierte UI auf Handy/Tablet |
| 2026-10-17 | Vitest + @testing-library/react für Tests (S2) | Gleiche Laufzeitumgebung wie Vite, kein separates Jest-Config nötig |
| 2026-10-17 | Skizze als Canvas-Element mit touch-action:none (S2) | Verhindert Browser-Scroll beim Zeichnen auf Touch-Geräten; natives Canvas ist offline-fähig ohne Abhängigkeiten |
| 2026-10-17 | Skizzendaten als JSON (SkizzeDaten) in wep.skizze gespeichert (S1/S2) | Objekte bleiben editierbar; PNG-Export erfolgt beim Herunterladen on-demand |
| 2026-10-17 | Entprellzeit 300 ms für Skizze-Speicherung (S2) | Verhindert zu häufige IndexedDB-Schreibzugriffe beim Zeichnen |
