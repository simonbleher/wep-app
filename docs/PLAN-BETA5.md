# Plan Beta 5 – Grün auf Bau, Teilen, PDF

Stand: 23.10.2026, mit Simon abgestimmt. Cloud-Sitzungen, eine pro Paket, nacheinander.
Grundsätze wie bisher (CLAUDE.md, docs/PLAN-BETA4.md): nichts sperren, nur warnen; Vorlage nie verändern;
nur erfundene Testdaten; Versionsnummern bei Änderungen an `android/`, Plugins oder `src-tauri/` erhöhen.
Windows-Update/Installer repariert Claude separat (nicht Teil dieser Pakete).

## Paket 1 – Grün-Skizze baut auf der Bau-Skizze auf

- Reihenfolge in der Praxis: erst Bau, dann Grün. Die Grün-Skizze („Skizze Außenanlage-Aufwuchs“) bekommt
  als **Grundlage** die Bau-Skizze: Grundstück, Gebäude, Anbauten, Schuppen, Terrassen, Keller (gestrichelt),
  Beschriftungen, Pfosten.
- **Quellen** (in dieser Reihenfolge): (a) der Bau-Teil desselben WEP (Grundriss aus Beta 4, Paket 3);
  (b) die eingelesene Bau-Excel: Formen aus dem Blatt „Skizze Bau“ auslesen (DrawingML: Position, Größe,
  Typ, Text, Linienart; Bilder/SVG soweit möglich, sonst als Hinweis) und in Skizzen-Elemente umrechnen.
- Die Grundlage liegt als **eigene Ebene** unter den Grün-Elementen: sichtbar, standardmäßig gesperrt gegen
  versehentliches Verschieben, aber entsperrbar und einzeln korrigierbar. „Grundlage neu übernehmen“ (z. B.
  nach neuer Bau-Excel) mit Rückfrage, Grün-Elemente bleiben erhalten.
- **Ohne Bau-Daten:** Hinweis „Erst Bau-Skizze übernehmen (Bau-Teil oder Bau-Excel)“, freies Zeichnen bleibt
  möglich; die Grundlage kann später druntergelegt werden.
- **Export:** Im Blatt „Skizze Außenanlage-Aufwuchs“ stehen Grundlage + Grün wie bisher als Formen (wie
  Skill parzellen-skizze, Modus Außenanlage: Wiese grün, Gebäude aus Bau); die Bau-Skizze im Blatt
  „Skizze Bau“ bleibt unangetastet.

## Paket 2 – WEPs teilen als .wep-Datei

- „⋯“ → **„Teilen“**: erzeugt `<Vorgangs-Nr>_<Anlage>.wep` (ZIP mit `wep.json` im Sync-Format, optional
  `fotos/`, optional Bau-Excel). Vor dem Teilen: Schalter „Fotos mitschicken“ (mit Größe) und
  „Bau-Excel mitschicken“. Hinweis: Datei enthält Personendaten.
- **Weitergeben:** Android-Teilen-Menü (WhatsApp, E-Mail …), Windows/Browser „Speichern unter…“.
- **Öffnen:** Datei in der App wählen oder (Android) „Öffnen mit WEP“ / (Windows) Doppelklick auf .wep.
  Vorschau wie bei „Sicherung einspielen“: neu / unterschiedlich / gleich; nichts still überschreiben;
  bei Abweichung Auswahl je Teil (z. B. „Bau-Teil übernehmen, Grün-Teil behalten“) – damit funktioniert
  der Weg **Bau → Grün** direkt in der App, ohne Excel.
- Formatversion in der Datei (`wep-teilen/1`), unbekannte/neuere Versionen sauber ablehnen.

## Paket 3 – Unterschrift im Profil

- Profil → „Meine Unterschrift“: **mit dem Finger/Stift zeichnen** oder **Bild hochladen** (Foto einer
  Unterschrift, Hintergrund automatisch freistellen/aufhellen, zuschneiden). Vorschau, löschen, ersetzen.
- Gespeichert lokal und mit dem Profil in OneDrive (`daten/profil.json` bzw. eigene Datei), nie im Repo.
- Wird beim PDF (Paket 4) im Feld des eigenen Teils eingesetzt (Bau/Grün), nur wenn der Wertermittler es
  beim Erzeugen bestätigt („Mit meiner Unterschrift versehen“).

## Paket 4 – PDF direkt aus der App

- „Export“ bietet **PDF** neben Excel. Das PDF sieht aus **wie die Blätter der BV-Vorlage**: gleiche Seiten,
  Reihenfolge, Überschriften, Tabellen und Summen (Deckblatt, Baulichkeiten, Mängelliste, Außenanlagen,
  Aufwuchs I/II, Beseitigungskosten, Skizze Bau, Skizze Außenanlage-Aufwuchs) – je nach Rolle nur die
  ausgefüllten Teile. Zahlen aus denselben Rechenfunktionen wie Excel-Export und App (Test: PDF-Werte =
  Excel-Werte).
- Skizzen als Vektorgrafik; Fotos optional als Anhang mit Positionsnummer.
- Unterschrift aus Paket 3 auf Wunsch.
- Offline erzeugbar, Speichern über „Speichern unter…“ bzw. Download; mit Konto zusätzlich in OneDrive
  `Exporte/`.

## Reihenfolge

1 → 2 → 3 → 4.
