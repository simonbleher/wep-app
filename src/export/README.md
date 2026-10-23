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
├── skizzeFormen.ts   – Grün-Skizze als native Excel-Formen (DrawingML)
├── skizzeBild.ts     – Fallback: Skizze als PNG, gemeinsame Drawing-Helfer
├── svgRaster.ts      – SVG → PNG im Browser (Fallback der Piktogramme)
├── bauExcelLesen.ts  – Formalien (E3–E17) aus einer Bau-Excel lesen, Vergleichswerte
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
| Skizze (optional, Formen)  | sheet19.xml → drawing9.xml | native Formen, `skizzeFormen.ts` |
| Skizze (Fallback, PNG)     | sheet19.xml → drawing9.xml | Bild in B7:G48 (`skizzeBild.ts`) |

### Skizze als Excel-Formen (Standard)

```typescript
await exportWep(wep, excel, {
  skizzeFormen: {
    // Elemente in EMU ab Blattecke – oder eine Funktion, die erst das Blatt ansieht:
    elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(wep.skizze!, zeichenbereich),
    rasterisiere: svgZuPngBrowser, // PNG-Fallback der SVG-Piktogramme
  },
})
```

- Formen werden **angehängt**; vorhandene Formen (Bau-Kopie, Textfelder der Vorlage) bleiben
  byte-gleich. Alle eigenen Formen haben `descr="wep-app"`, ein erneuter Export ersetzt nur diese.
- Sprechende Namen wie im Skill: `Hochbeet_0`, `Holzpferd`, `Holzpferd_X1`, `Holzpferd_Hinweis`,
  `Fliederhecke_0`, `Kompost_Latte_1`, `Maß_Laube_Breite` …
- Stil (Farben, Ebenen) siehe `docs/skills/parzellen-skizze.md`; Elementtypen in `FormTyp`.
- `entfernen`: mit `pflanze: true` (Baum, Strauch, Hecke, Konifere) Stern + rotes X, sonst (Holzpferd,
  Schuppen, Platte …) nur Hinweis + Pfeil + kleines rotes X als Marker.
- Eigene Beschriftungen (Textfelder) weichen vorhandenen Beschriftungen aus (rechts, unten, links, oben);
  vorhandene Formen werden nie verschoben. `ergebnis.verschoben` / `ergebnis.ueberdeckt` melden das.
- Körper-Formen (Beete, Hochbeete, Kompost, Gegenstände …), die eine Bau-Beschriftung oder Bau-Form
  überdecken, werden minimal versetzt: Gruppe (`FormElement.gruppe`) gemeinsam, zuerst weg vom
  Hindernis, höchstens eine Elementhöhe; reicht das nicht, bis 20 % verkleinert. Geht beides nicht,
  bleibt sie stehen (`ueberdeckt`). Bäume, Sträucher, Hecken werden nie bewegt, nur gemeldet.
  Eine Bau-Form, die das Element ganz umschließt (Grundstück), zählt nicht als Hindernis.
- Gras + Grundstück (Wiese) nur, wenn das Blatt noch leer ist (`graswiese: false` schaltet ab).
- Ohne `rasterisiere` werden Baum/Strauch/Tor aus einfachen Formen gezeichnet, ohne Bilddateien.
- Positionen: absolute EMU → `twoCellAnchor editAs="oneCell"` über Spaltenbreiten/Zeilenhöhen des
  Blatts. Mit Bau-Formen kommen die EMU aus der Ausrichtung (`tools/ki-test/skizze/formen.ts`),
  ohne Bau-Excel liegt alles im Zeichenbereich B7:G48.
- Test/Sichtprüfung: `npm run ki-test-skizze-export` (LibreOffice → PDF → PNG, braucht PyMuPDF).

### Fallback: Skizze als Bild

`exportWep(wep, excel, { skizzePng })` – oder `skizzeAlsBild: true` zusammen mit `skizzeFormen`. Das PNG kommt aus der App
(`skizzeAlsPng`), der Export legt es unter `xl/media/` ab, ergänzt Beziehungen und
`[Content_Types].xml` und passt es zentriert in den umrandeten Bereich ein. Ein Bild
namens „WEP-App Skizze“ aus einem früheren Export wird vorher entfernt.

## Bau-Excel am WEP (Paket 5)

- `leseBauFormalien(excel)` liest die ausgefüllten Formalien (Shared Strings, Datum als Seriennummer oder Text); die App gleicht sie mit dem WEP ab
  (`src/bauexcel/abgleich.ts`) und reicht beim Export die am WEP gemerkte Datei als `sourceExcel` weiter.
- `ExportOptionen.formalienAbgeglichen`: Nach dem Abgleich gelten die WEP-Werte auch in Zellen, die in der Bau-Excel anders belegt sind (keine `konflikte`).
- Überschrift des Blatts „Skizze Außenanlage-Aufwuchs“: steht in A1 „Baulichkeiten“ (Vorlage: „Skizze – Baulichkeiten“), wird A1 durch
  `SKIZZE_AA_UEBERSCHRIFT` („Skizze – Außenanlagen und Aufwuchs“) ersetzt (`skizzeUeberschriftGeaendert`); „Skizze Bau“ bleibt unverändert.

## Teil (Beta 4, Paket 1)

`exportWep(wep, excel, { teil })`: `'bau'` schreibt nur die Formalien (ohne E13) in die Quelle, lässt Grün-Blätter und
Grün-Skizze aus, Dateiname `<Nr>_WEP_Bau.xlsx`. `'gruen'`/`'beides'`/leer wie oben beschrieben. Bau-Inhalte (Paket 2) kommen
später in diesen Zweig; bis dahin bleiben die Bau-Blätter der Quelle byte-gleich.

## Bau-Teil (Beta 4, Paket 2)

`exportBau.ts`: Mit `teil: 'bau'` oder `'beides'` und `wep.bau` schreibt der Export in die Blätter „Baulichkeiten“ (Index H7/I7, je Bauteil Typ, Baujahr,
Restnutzung, Mängel %, Fläche; Gewächshaus, Vorplatz, Abwasser, Baubeschreibung B83:B99, nicht beräumt F104/G104), „Mängelliste“ (Abzug konkret F5 …) und
„Beseitigungskosten“ Abschnitt 1 (Zeilen 12, 14–23). Nur Eingabezellen; die Formeln der Vorlage rechnen. `ExportResult.bau` nennt die Korrekturen von
Vorlagenfehlern (`VORLAGEN_KORREKTUREN`), nicht exportierte Bauteile und gekürzte Texte. Rechnung der App: `src/bau/rechnen.ts` (Test gegen LibreOffice).
Ohne `teil` Bau oder ohne `wep.bau` bleiben die Bau-Blätter byte-gleich.

## Grundriss in „Skizze Bau“ (Beta 4, Paket 3)

`exportWep(wep, excel, { teil: 'bau' | 'beides', grundrissFormen: { elemente: ({ zeichenbereich }) => grundrissZuFormen(wep.grundriss, zeichenbereich, wep.bau.bauteile) } })`.
`grundrissFormen.ts` rechnet Meter in EMU um (ein Maßstab, in B7:G48 eingepasst): je Teil eine Form `bauteil` (Rechteck, sonst Freiform `custGeom`, Keller gestrichelt, Text „Kürzel + m²“),
rote Maßketten (`massangabe`) und unten die Massenberechnung (`massenberechnung`). Schreibt über `fuegeSkizzeFormenEin` mit `blatt: 'Skizze Bau'`, `graswiese: false`; fremde Formen bleiben
(`ExportResult.grundriss.fremdeFormen`), eigene eines früheren Exports werden ersetzt. Bei Teil `gruen` oder ohne Option bleibt das Blatt byte-gleich. Sichtprüfung: `npm run beta4-paket3:export-bild`.

## Grundlage der Grün-Skizze (Beta 5, Paket 1)

`skizzeDatenZuFormen(skizze, zeichenbereich, { grundlage: !hatFormen })` schreibt die Bau-Skizze (Elemente mit `ebene: 'grundlage'`, Typ `bauform`) als Formen `Grundstück` (Wiese #C5E0B4, bestimmt die Fläche des Grases), `Pfosten_n`, Gebäude (`L`, `A1`, `K1_HW` …, Keller gestrichelt) ins Blatt „Skizze Außenanlage-Aufwuchs“; steht dort schon etwas Fremdes (`hatFormen`), entfällt die Grundlage. `bauSkizzeLesen.ts` liest die Formen aus „Skizze Bau“ einer Bau-Excel (nur lesend); Umrechnung in `src/skizze/grundlage.ts`. „Skizze Bau“ bleibt byte-gleich. Sichtprüfung: `npm run beta5-paket1:export-bild`.

## Regeln

- **Bau-Blätter werden nur vom Bau-Export (Teil `bau`/`beides` mit Bau-Daten oder Grundriss am WEP) verändert, sonst nie.**
- Formeln in Spalte L (Außenanlagen/Aufwuchs) und Spalte K
  (Beseitigungskosten) bleiben unberührt.
- Formalien-Felder, die in der Bau-Excel bereits belegt sind und einen
  abweichenden Wert haben, werden als `FormalienKonflikt` im
  `ExportResult.konflikte`-Array zurückgegeben.
- Wenn mehr als 28 Aufwuchs-Positionen vorhanden sind, laufen die
  überschüssigen in Aufwuchs II über (`aufwuchsUeberlauf = true`).
- Bei mehr als 64 Aufwuchs-Positionen werden die überschüssigen
  abgeschnitten (`aufwuchsAbgeschnitten = true`).
