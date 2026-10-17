# KI-Testlauf – Assistent A (Aufnahmeliste → Katalog)

Prüft, wie gut Gemini (Google AI Studio, kostenloser Tarif) eine Aufnahmeliste in
Katalogpositionen aus `data/katalog.json` übersetzt. Plan: `docs/KI-ASSISTENT.md`.

**KI liest, App rechnet:** Die KI liefert nur JSON nach festem Schema (Gemini
`responseSchema`), keine Preise. Die Summen rechnet `berechnePreisvorschlag`
(`src/gruen/preisvorschlag.ts`) wie in der App.

## Starten

1. API-Key in `.dev.vars` (Projektwurzel, steht in `.gitignore`):
   `GEMINI_API_KEY=...`
2. `npm run ki-test`

| Aufruf | Wirkung |
|---|---|
| `npm run ki-test` | alle Fälle × alle frei nutzbaren Modelle |
| `npm run ki-test -- --nur-modelle` | nur Modellvorschlag (models.list + Probe) |
| `npm run ki-test -- --modelle gemini-3.8-flash,gemini-3.5-flash` | feste Kette, keine Probe |
| `npm run ki-test -- --fall 02-kuerzel-chaos` | nur ein Fall |
| `npm run ki-test -- --max-modelle 3` | nur die besten 3 Modelle |

Ergebnis: Tabelle in der Konsole und `ergebnis.md`. Rohantworten je Modell/Fall in
`ausgaben/` (nicht im Repo).

## Modellkette

Die Modellnamen stehen nirgends fest. `models.list` liefert alle Modelle; Text-Modelle
werden gefiltert (keine TTS-, Bild-, Agenten- oder `-latest`-Aliase), sortiert (neuere
Generation zuerst, darin Pro > Flash > Flash-Lite, stabil vor Vorschau, Gemma zuletzt)
und mit einer Mini-Anfrage **mit responseSchema** geprobt:
`frei` · `limit-erreicht` (429, grundsätzlich frei) · `kein-freikontingent` (429 „limit: 0“)
· `nicht-nutzbar` (400/404).

Im Lauf: 429 mit kurzer Wartezeit (≤ 60 s) → warten und neu versuchen, sonst Modell für
den Rest des Laufs sperren und das nächste der Kette nehmen; Vermerk im Bericht
(Spalte „Antwort von“).

## Testfälle

`faelle/<name>/` mit `eingabe.txt` **oder** `eingabe.jpg`/`.png` und `erwartet.json`.
Nur **erfundene** Daten, keine Formalien (Namen, Adressen, Vorgangs-Nr.). Text-Eingaben
mit Formalien-Stichworten werden nicht gesendet.

`erwartet.json` hat dasselbe Schema wie die KI-Antwort:

```json
{
  "positionen": [
    { "katalogId": "aw-obstgehoelz", "varianteIndex": 4, "anzahl": 2, "einheit": "Stück",
      "bezeichnung": "Apfel, Halbstamm, 5–30 J.", "zustand": "gut", "unsicher": false,
      "grund": "HS ca. 15 J." }
  ],
  "kurzbeschreibung": "… KGN gut."
}
```

Optional je Zeile `alternativ: [{ "katalogId": …, "varianteIndex": … }]` für fachlich
gleichwertige Zuordnungen (z. B. Lavendel als Kraut oder Staude). Nicht bewertete
Dinge (Asbest, invasiv, krank, zu hoch) stehen mit `katalogId: null` drin.

## Kennzahlen

- **Recall / Precision**: Soll-Zeilen gefunden / KI-Zeilen zuordenbar. Zuordnung
  Soll ↔ Ist über gleiche Katalog-ID oder ähnliche Bezeichnung (gierig nach Punktzahl).
- **ID ok / Variante ok / Menge ok / Zustand ok**: Anteil der gefundenen Zeilen.
- **Σ Ist / Σ Soll / Δ**: Summe aller Zeilen, Zeile = ROUND(Anzahl × Preisvorschlag; 2).
- **unsicher Ist/Soll (getr.)**: von der KI markiert / im Soll markiert (beide).
- **KGN**: Kurzbeschreibung nennt die kleingärtnerische Nutzung.

## Prompt ändern

`prompt-aufnahme.md` – der Platzhalter `{{KATALOG}}` wird zur Laufzeit durch den
kompakten Katalog ersetzt (id | Bezeichnung | Einheit | Varianten | Arten/Synonyme,
ohne Höchstwerte). HTML-Kommentare werden nicht gesendet.
