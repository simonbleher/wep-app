# src/export – Excel-Export-Modul

Dieses Modul erzeugt aus einem `Wep`-Objekt eine fertig befüllte
XLSX-Datei (`<Vorgangs-Nr>_WEP.xlsx`) für den Download.

## Verwendung

```typescript
import { exportWep } from './src/export'

// Vorlage laden (im Browser per fetch, in Tests per fs.readFileSync)
const vorlageAntwort = await fetch('/WEP_Vorlage.xlsx')
const vorlage = await vorlageAntwort.arrayBuffer()

// Optional: Bau-Excel des Bau-Wertermittlers laden
const bauExcel = await holeBauExcelVomNutzer() // ArrayBuffer

const { blob, filename, konflikte } = await exportWep(wep, bauExcel ?? vorlage)

// Download auslösen
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = filename
a.click()
URL.revokeObjectURL(url)

// Konflikte anzeigen (Formalien-Felder, die Bau-Excel bereits ausgefüllt hat)
if (konflikte.length > 0) {
  console.warn('Achtung – folgende Felder wurden NICHT überschrieben:', konflikte)
}
```

## Architektur

```
src/export/
├── index.ts          – Hauptfunktion exportWep()
├── cellMapper.ts     – Mapping WEP-Modell → Excel-Zell-Adressen
├── xmlPatcher.ts     – Direkte XML-Manipulation (JSZip)
└── __tests__/
    └── export.test.ts
```

## Bibliothek: JSZip + direktes XML-Patching

Details in `docs/ENTSCHEIDUNGEN.md` (Eintrag 2026-10-16).

**Kurzfassung:** XLSX ist ein ZIP-Archiv mit XML-Dateien. Wir öffnen das
Archiv mit JSZip, lesen nur die betroffenen Worksheet-XMLs, patchen
gezielt einzelne Zellen per Regex und schreiben sie zurück. Bau-Blätter
werden nie geöffnet und daher auch nie verändert – die XML-Bytes bleiben
byte-gleich mit dem Original.

## Was wird geschrieben

| Bereich                    | Sheet-Datei | Zellen                   |
|----------------------------|-------------|--------------------------|
| Formalien (leere Felder)   | sheet1.xml  | E3–E17                   |
| Formalien E13 (immer)      | sheet1.xml  | E13                      |
| Außenanlagen               | sheet5.xml  | A8, A15–A45, B/C/K 15–45 |
| Aufwuchs I                 | sheet6.xml  | A8, A18–A45, B/C/K 18–45 |
| Aufwuchs II (Überlauf)     | sheet7.xml  | A10–A45, B/C/K 10–45     |
| Beseitigungskosten Abschn. 2 | sheet17.xml | B/F/G/H/J 34–44        |

## Regeln

- **Bau-Blätter werden niemals verändert.**
- Formeln in Spalte L (Außenanlagen/Aufwuchs) und Spalte K
  (Beseitigungskosten) bleiben unberührt.
- Formalien-Felder, die in der Bau-Excel bereits belegt sind und einen
  abweichenden Wert haben, werden als `FormalienKonflikt` im
  `ExportResult.konflikte`-Array zurückgegeben.
- Wenn mehr als 28 Aufwuchs-Positionen vorhanden sind, laufen die
  überschüssigen in Aufwuchs II über (`aufwuchsUeberlauf = true`).
- Bei mehr als 64 Aufwuchs-Positionen werden die überschüssigen
  abgeschnitten (`aufwuchsAbgeschnitten = true`).
