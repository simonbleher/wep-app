# src/pdf – PDF-Export (Beta 5, Paket 4)

`erzeugeWepPdf({ wep, quelle, hatBauExcel, rolle }, { skizzen, fotos, unterschrift })` → PDF-Bytes + Dateiname.

```
exportWep (Excel-Export) ──► .xlsx ──► mappe.ts (lesen) ──► formeln.ts (rechnen) ──► blatt.ts (Seiten, Op-Liste)
                                                                          └─► schreiber.ts / skizzen.ts / fotos.ts (pdf-lib)
```

- `xml.ts`, `mappe.ts`: .xlsx lesen (Zellen, Stile, Geometrie, Druckbereich). Die Datei wird nie verändert.
- `formeln.ts`: Rechenwerk (ROUND, IF, SUM, MIN, MAX, SVERWEIS …); Unbekanntes → gespeicherter Wert + `bericht.unbekannt`.
- `zahlformat.ts`: Excel-Zahlenformate in deutscher Schreibweise.
- `blatt.ts`: Blatt → Seiten als Liste von Zeichenbefehlen (`Op`, pt, Ursprung oben links) – auch ohne PDF-Bibliothek prüfbar.
- `schreiber.ts`, `kontext.ts`, `skizzen.ts`, `fotos.ts`: Zeichenbefehle, Skizzen (Vektor), Fotoanhang ins PDF (`pdf-lib`, per `import()` nachgeladen).
- `erzeugen.ts`: Blattwahl je Rolle, Unterschriftsfelder, Zusammenbau. `testFaelle.ts`: erfundene Fälle für Tests und Werkzeuge.

Tests: `npx vitest run src/pdf` (LibreOffice-Vergleich wird ohne LibreOffice übersprungen). Vergleich/Screenshots: `docs/beta5-paket4/`.

## Zweites PDF: übersichtlich (`uebersicht/`)

`erzeugeWepUebersichtPdf(...)` (gleiche Eingabe wie `erzeugeWepPdf`) → schlichtes Protokoll statt der Blätter der Vorlage. Gleicher Excel-Export, gleiches Rechenwerk, also gleiche Zahlen.

```
.xlsx ──► Rechenwerk ──► daten.ts (Zellen der Vorlage → Protokoll) ──► inhalt.ts + seitenbau.ts (Seiten, Op-Liste) ──► erzeugen.ts (pdf-lib, Kopf/Fuß)
```

- `format.ts`: Euro, Prozent, Datum in deutscher Schreibweise (nur WinAnsi-Zeichen). `seitenbau.ts`: Umbruch, Überschriften, Tabellen, Skizzenseiten.
- Der Deckblatt-Text steht in `src/export/deckblattText.ts` (für beide PDFs und die Excel-Kopie).
- Tests: `npx vitest run src/pdf/__tests__/uebersicht.test.ts`. Bilder: `docs/pdf-uebersichtlich/` (`npm run pdf-uebersichtlich:screenshots`).

