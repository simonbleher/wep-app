# Architektur

## Beta-Umfang (gilt vorrangig, Stand 2026-10-16)

Die App ist in der Testphase und wird zunächst **nur von Simon (Grün-Wertermittler)**
genutzt. Alles unten zu Rollen-Sync, Bau-Teil und BV-OneDrive ist Zielbild für später.

```
 Parzelle (Handy/Tablet)        Simons privates OneDrive        Schreibtisch
┌──────────────────────┐  Sync  ┌───────────────────────┐      ┌────────────────────────┐
│ PWA: Grün erfassen   │◀─────▶│ Apps/WEP-App/          │◀────▶│ PWA (Windows/Browser)  │
│ (offline, IndexedDB) │        │   <Kennung>.json       │      │ Bau-Excel hochladen ──┐│
└──────────────────────┘        └───────────────────────┘      │ + Grün aus der App    ││
                                                                │ = <Nr>_WEP.xlsx  ◀────┘│
                                                                └────────────────────────┘
```

- **Ein Nutzer, mehrere Geräte.** Sync über Microsoft Graph in den App-Ordner von
  Simons privatem OneDrive (Berechtigung nur `Files.ReadWrite.AppFolder`).
- **Kein Bau-Teil in der App.** Der Bau-Wertermittler füllt wie bisher die
  WEP-Excel aus („Bau-Excel“). Die App liest diese Datei ein und schreibt nur den
  Grün-Teil hinein (Außenanlagen, Aufwuchs I/II, Beseitigungskosten Abschnitt 2,
  Formalien E13 und noch leere Formalien). Bau-Blätter werden nie verändert.
- Ohne Bau-Excel wird die leere Vorlage `docs/WEP_Vorlage.xlsx` befüllt.
- **Rolle (Beta 4):** Grün / Bau / Beides aus dem Profil schaltet Reiter und Export frei, pro WEP
  umschaltbar (`Wep.rolle`). Bau-Reiter sind bis Paket 2 Platzhalter.
- Personendaten (Unterpächter-Namen) liegen nur lokal und in Simons OneDrive,
  nie im Repo.

## Zielbild (später, nicht Teil der Beta)

### Rollen-Sync mit BV-OneDrive

```
 Parzelle (offline)                 BV-OneDrive                    Büro
┌──────────────────┐   JSON je   ┌──────────────────────┐       ┌───────────────┐
│ PWA Grün-WE      │──Rolle────▶ │ 2026-999.gruen.json  │       │ Export:       │
│ PWA Bau-WE       │──────────▶  │ 2026-999.bau.json    │──────▶│ WEP_Vorlage   │
└──────────────────┘             │ 2026-999.skizze.json │       │ → befüllt.xlsx│
                                 └──────────────────────┘       └───────────────┘
```

- Ein WEP ist intern ein **JSON-Objekt**, nicht die Excel-Datei.
- **Jede Rolle schreibt nur ihre eigene Datei** (Grün / Bau). Dadurch keine
  Schreibkonflikte. Nur die Skizze wird gemeinsam bearbeitet → einfache Sperre
  („wird gerade von X bearbeitet“).
- Der **Export** führt alles zusammen und befüllt eine Kopie der Vorlage.

## Bereiche (wer fasst was an)

| Bereich   | Slack-Channel | Ordner / Dateien                     |
|-----------|---------------|--------------------------------------|
| leitung   | #00-leitung   | `docs/`, `TASKS.md`, `CLAUDE.md`     |
| katalog   | #katalog      | `data/`, `src/katalog/`              |
| app-gruen | #app-gruen    | `src/app/`, `src/gruen/`, `public/`  |
| export    | #export       | `src/export/`                        |
| skizze    | #skizze       | `src/skizze/`                        |
| sync      | #sync         | `src/sync/`                          |
| bau       | (später)      | `src/bau/`                           |
| bv        | –             | `src/bv/` (BV-Kontrollseite unter `/bv`, eigene IndexedDB `wep-bv`) |
| server    | –             | `src/server/`, `functions/api/v2/`, `functions/_lib/` (v2: Server-Modus hinter `VITE_SERVER_MODUS`/`SERVER_MODUS`, docs/PLAN-V2.md) |
| gemeinsam | –             | `src/model/` (nur per PR mit Begründung, betrifft alle) |

## Datenmodell (Entwurf, wird in `src/model/` verbindlich)

```ts
interface Wep {
  id: string;                 // interne Kennung (UUID; alte WEPs: "2026-999"), nie angezeigt – die Vorgangs-Nr. steht in formalien.vorgangsNr
  formalien: Formalien;
  gruen: { beschreibungAussen: string; beschreibungAufwuchs: string;
           aussenanlagen: Position[]; aufwuchs: Position[];
           beseitigungAA: BeseitigungsPosition[] };
  bau?: unknown;              // später
  skizze?: SkizzeDaten;
}

interface Position {
  id: string;
  katalogId?: string;         // Verweis auf data/katalog.json, fehlt bei eigener Pflanze
  bezeichnung: string;        // wird in Spalte C geschrieben, z. B. "Apfel, Halbstamm, 5–30 J."
  anzahl: number;             // Spalte A
  einheit: "Stück" | "m" | "m²" | "lfdm" | string;  // Spalte B
  zustand?: "sehr gut" | "gut" | "mittel" | "schlecht";
  hoechstwert?: number;       // aus Katalog
  einzelpreis: number;        // Spalte K – Vorschlag, frei überschreibbar
  preisManuell: boolean;
  hinweise: string[];         // Regel-Warnungen
}
```

**Offen:** Zustandsstufen → Prozent vom Höchstwert. Die BewRL sagt nur „bis €“ und
„bei schlechtem Zustand Abwertung bis 1,00 €“. Vorläufig: sehr gut 100 %, gut 75 %,
mittel 50 %, schlecht = 1 €. Muss vom BV bestätigt werden.

## Zellen-Mapping der Vorlage (`docs/WEP_Vorlage.xlsx`)

Nur diese Zellen werden beschrieben. Formeln (`=ROUND(A*K,2)`, Summen, Übertrag,
Verweise auf „Formalien“) bleiben unangetastet.

### Formalien
| Zelle | Inhalt |
|------|--------|
| E3 | Kleingartenanlage |
| E4 | Parzelle |
| E5 | Weg (optional) |
| E6 | Unterpächter |
| E7 | Auftraggeber |
| E8 | vertreten durch Rechtsanwalt |
| E9 | anwesend für den Verein |
| E10 | anwesend für den Unterpächter |
| E11 | anwesend für den Auftraggeber |
| E12 | Wertermittler Baulichkeiten |
| E13 | Wertermittler Außenanlagen & Aufwuchs |
| E14 | Wertermittlung am (Datum) |
| E15 | Protokollerstellung am (Datum) |
| E16 | Parzellenfläche lt. Vertrag (m²) |
| E17 | Vorgangs-Nr. |

### Außenanlagen (Anlage 2)
- Beschreibung: A8 (verbunden A8:L11)
- Positionen: Zeilen **15–45** (31 Zeilen). A = Anzahl, B = Einheit,
  C = Art (verbunden C:J), K = Einzelpreis. L = Formel, nicht beschreiben.
- J3 berechnet automatisch die zulässige versiegelte Fläche (6 % von Fläche − 24 m²).

### Aufwuchs I (Anlage 3)
- Beschreibung: A8 (verbunden A8:L14)
- Positionen: Zeilen **18–45** (28 Zeilen), Spalten wie oben.

### Aufwuchs II (Anlage 3a)
- L9 = Übertrag aus Aufwuchs I (Formel)
- Positionen: Zeilen **10–45** (36 Zeilen). Überlauf aus Aufwuchs I geht hierhin.
- Mehr als 64 Aufwuchs-Positionen → Fehlermeldung bzw. Zusammenfassen nötig.

### Beseitigungskosten (Anlage 4), Abschnitt 2 – Außenanlagen/Aufwuchs
- Zeilen **34–44**: B = Gegenstand (verbunden B:E), F = Menge, G = ME,
  H = Einzelpreis, J = Faktor (Standard 1). K = Formel.
- Begründung bei Faktor > 100 %: F53.
- Spalte M (34–41) enthält Textbausteine („Hecke auf zul. Höhe (1,25m) schneiden“ …).

### Skizze Außenanlage-Aufwuchs
- Zeichenfläche ca. A5:H49, wird als Bild eingefügt.
- A1 (Überschrift): Die Vorlage hat dort „Skizze – Baulichkeiten“; der Export schreibt „Skizze – Außenanlagen und Aufwuchs“.

### Bau-Excel am WEP (Beta 3, Paket 5)
- Die App liest aus der Bau-Excel alle ausgefüllten Formalien-Zellen E3–E17 und befüllt das WEP (Dialog bei Abweichungen); die Datei bleibt am WEP
  (`Wep.bauExcel`) und ist Grundlage des Exports.

## Regeln aus der BewRL (Auswahl für Warnungen)

- Hecken nur bewertet bis 1,25 m Höhe und 0,70 m Breite; Hecke = mind. 3 dicht stehende Sträucher
- Rasen/Wiese max. 100 m²
- Hochbeete max. 10 % der Gartenfläche, mind. 50 cm hoch, nicht gemauert
- Nadelgehölze Solitär max. 10 m² kronendeckende Fläche; Arten, die > 2,5 bzw. 4 m werden, entfernen
- Geschützte Bäume (Baumschutzverordnung) = 1,00 € je Stück
- Kranke/verkrüppelte/abgestorbene Bäume: nicht bewerten, entfernen
- Invasive Arten (Unionsliste, Anlage der BewRL): entfernen → Beseitigungskosten vorschlagen
- Wege/Plätze: max. 6 % der Restfläche versiegelt
- Teiche aus Beton/Mauerwerk/Metall, Flechtzäune, Lamellen, Strohmatten, Stacheldraht: nicht bewerten, entfernen
- Fällen/Roden 1. März – 30. September verboten (Hinweis bei Beseitigung)
