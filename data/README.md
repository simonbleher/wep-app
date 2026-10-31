# data/ – Katalog und Unionsliste (Bereich `katalog`)

Fachliche Referenzdaten für die Bewertung. Quelle: Bewertungsrichtlinie (BewRL)
des Landesverbandes Berlin der Gartenfreunde e. V., gültig ab 01.01.2023
(`docs/Richtlinie.pdf`).

## Dateien
- `katalog.json` – Positionen aus Abschnitt II (Außenanlagen) und III (Aufwuchs), gedruckte S. 12–18.
- `invasive.json` – Unionsliste invasiver Pflanzenarten (Anlage, gedruckte S. 25–26).
- `katalog.schema.json` – JSON-Schema (Draft 07) zur Validierung von `katalog.json`.

## Schema `katalog.json`
`meta` enthält Quelle, Stand und übergreifende Hinweise. `positionen` ist eine Liste.
Jede Position hat:
- `id` – stabiler Bezeichner (Präfix `aa-` = Außenanlagen, `aw-` = Aufwuchs).
- `abschnitt` – Kapitel der Richtlinie (`II. Außenanlagen` / `III. Aufwuchs`).
- `kategorie` – Unterabschnitt/Gruppe (z. B. „Obstgehölze“).
- `bezeichnung` – Anzeigename.
- `einheit` – `m`, `m²`, `m³`, `Stück` oder `Pauschale`.
- **`hoechstwert` ODER `varianten`, nie beides:**
  - `hoechstwert` (Zahl, €) bei Positionen mit genau einem Wert.
  - `varianten` (Array) bei Positionen mit mehreren Werten nach `form`,
    `altersstufe`, `groesse`, `material`, `ausfuehrung` oder `typ`. Jede
    Variante trägt ihren eigenen `hoechstwert`.
- `seite` – gedruckte Seitenzahl der Richtlinie.
- `regeln` – relevante Regeln/Hinweise als Text (leerer String = keine spezifischen Regeln).
- `arten` – gängige Beispielpflanzen für Suche/Zuordnung (nicht abschließend,
  nicht bindend; bei technischen Außenanlagen leer). Eigene Pflanzen/Freitext
  sind laut CLAUDE.md immer zusätzlich erlaubt.
- `synonyme` – **optional**, Array von Alltags-/Umgangssprachbegriffen für die
  Suche (z. B. „Regentonne“ → Regenwasserauffangbehälter, „Gartenweg“ →
  Wege- und Platzbelag, „Komposter“ → Kompostanlage). Nur gesetzt, wo ein echter
  Alltagsbegriff existiert; in der Suche wie `arten` gewichtet.
- `relevanz` – 1–5, wie häufig die Position im Kleingarten vorkommt (5 = sehr
  häufig), für die Sortierung der Trefferliste.

Alle Höchstwerte sind „bis“-Werte (Obergrenzen). Preisvorschlag der App =
Höchstwert × Zustandsstufe; immer überschreibbar (siehe CLAUDE.md).

## Staffeln nach Maß (`staffeln`)
Wo die Richtlinie nach einem Maß staffelt, wählt die App die Stufe selbst (`src/gruen/baumMass.ts`):
- `baumBeseitigung` – Beseitigungskosten Bäume nach Stammumfang in 1,30 m Höhe (S. 20–21): `bis` cm
  (einschließlich) → `hoechstwert`; die letzte Stufe `ueber: 140` gilt für alles darüber.
- `obstgehoelzAlter` – Altersstufe der Obstgehölze (S. 16) aus dem Alter in vollen Jahren; der Höchstwert
  kommt aus der Variante von `aw-obstgehoelz` mit gleicher `form` und `altersstufe`.

## Schema `invasive.json`
`meta` + Liste `arten`. Je Art: `id`, `wissenschaftlich`, `synonym` (optional),
`deutsch`, `englisch` (optional), `aufnahme` (Jahr), `seite`, `hinweis` (optional).

## Prüfung gegen die Richtlinie / bekannte Quellenfehler
Alle Höchstwerte und Einheiten wurden gegen die gerenderten PDF-Seiten geprüft;
hochgestellte Einheiten (m²/m³) wurden visuell verifiziert, nicht nur aus dem
Textlayer übernommen. Hinweis zur Seitenzählung: die gedruckte „Seite N“ liegt
auf PDF-Seite N+1.

Zwei offensichtliche Druckfehler der Quelle wurden dokumentiert übernommen:
- Obstgehölz „Buschbaum, 5 bis 30 Jahre“ steht im PDF als „bis € 75;00“
  (Semikolon statt Komma). Übernommen als 75 €.
- Unionsliste „Celastrus orbiculatus“ nennt als Aufnahmejahr „2027“ (vermutlich
  Druckfehler für 2017). Wie gedruckt übernommen, mit `hinweis`-Feld.
