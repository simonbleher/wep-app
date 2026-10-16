# WEP-App – Projektregeln für alle Agenten

Wir bauen ein Tool, mit dem Wertermittler im Kleingarten (BV Pankow) das
Wertermittlungsprotokoll (WEP) **direkt auf der Parzelle** erfassen. Am Ende wird
die offizielle Excel-Vorlage des Bezirksverbands automatisch befüllt.

## Lies zuerst
1. `docs/ARCHITEKTUR.md` – Datenmodell, Zellen-Mapping der Vorlage, Sync-Konzept
2. `TASKS.md` – wer arbeitet woran, was ist erledigt
3. Fachliche Grundlage: `docs/Richtlinie.pdf` (BewRL, LV Berlin, gültig ab 01.01.2023)
4. Zielformat: `docs/WEP_Vorlage.xlsx` (bereinigte Vorlage des BV Pankow)

## Arbeitsregeln
- **Eine Aufgabe = ein Branch = ein PR.** Nie direkt auf `main` pushen.
  Branch-Namen: `<bereich>/<kurzbeschreibung>`, z. B. `katalog/bewrl-aufwuchs`.
- **Nur die Dateien deines Bereichs anfassen** (siehe Bereichs-Tabelle in
  `docs/ARCHITEKTUR.md`). Brauchst du eine Änderung woanders, schreib sie als
  offene Frage in deinen PR statt sie selbst zu machen.
- **TASKS.md aktualisieren**: Status deiner Aufgabe im selben PR setzen.
- **Entscheidungen** (Bibliothek gewählt, Datenformat geändert …) kurz in
  `docs/ENTSCHEIDUNGEN.md` festhalten: Datum, Entscheidung, Grund.
- **`docs/WEP_Vorlage.xlsx` niemals verändern.** Der Export arbeitet auf einer Kopie.
- **Keine echten Personendaten** ins Repo (Namen von Unterpächtern, echte WEPs).
  Testdaten nur mit erfundenen Namen („Erika Musterfrau“).
- Sprache: UI, Kommentare und Doku auf **Deutsch**; Code-Bezeichner dürfen Englisch sein.

## Fachliche Grundsätze
- Die Richtlinie nennt fast überall **Höchstwerte („bis €“)**. Die App schlägt einen
  Preis vor (Höchstwert × Zustandsstufe), der Wertermittler kann **immer** überschreiben.
- **Nichts sperren, nur warnen.** Regelverstöße (Hecke > 1,25 m, Rasen > 100 m²,
  invasive Art …) erzeugen Hinweise, keine Blockaden. Eigene Pflanzen und Freitext
  sind immer erlaubt.
- Offline-Fähigkeit hat Vorrang: Auf der Parzelle gibt es oft kein Netz.

## Technik (Stand Projektstart, Änderungen über ENTSCHEIDUNGEN.md)
- PWA (installierbar auf Handy/Tablet/Windows), TypeScript
- Lokale Speicherung im Browser (IndexedDB), Sync später über OneDrive
- Excel-Export im Browser mit einer Bibliothek, die Formeln und Formatierung der
  Vorlage erhält (Auswahl ist Teil der Aufgabe im Bereich `export`)
