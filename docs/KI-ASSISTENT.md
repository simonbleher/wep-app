# KI-Assistent (Planung, noch nicht gebaut)

Ziel: Die beiden Claude-in-Excel-Skills von Simon in der App nachbauen –
ohne Claude-API, mit **Google AI Studio (Gemini, kostenloser Tarif)**.

- `/wertermittlung-aussen-aufwuchs` → **Assistent A: Aufnahmeliste übernehmen**
- `/parzellen-skizze` → **Assistent B: Skizze aus Foto**

Vorlagen: die beiden Claude-Skills liegen als Referenz in `docs/skills/`.

## Grundsatz: KI liest, App rechnet

| Aufgabe | Wer |
|---|---|
| Foto/Notiz/Diktat lesen, Position erkennen, Katalog-ID + Variante zuordnen, Menge/Alter/Zustand schätzen, Unsicheres markieren | KI |
| Höchstwert, Zustandsfaktor, Preis, Regelhinweise, Summen | App (vorhandener Code) |
| Skizze: Elemente mit Typ, Lage, Beschriftung, Maß | KI |
| Skizze: Stil (Farben, Gras, Baum-Piktogramme, rote Maßlinien, Mängelkästen) | App (Stil-Spezifikation aus dem Skill) |

Die KI liefert **nur strukturiertes JSON** (Gemini `responseSchema`), nie Preise oder
Zeichenbefehle. Dadurch ist das Ergebnis weitgehend modellunabhängig, und alles bleibt
in der App sichtbar und editierbar.

## Assistent A – Aufnahmeliste

- Eingabe: Foto, eingefügter Text oder Diktat (Web Speech API).
- Prompt enthält: Katalog (IDs, Bezeichnungen, Varianten, Synonyme), Regeln aus dem Skill
  (eine Zeile = eine Sache, Reihenfolge, „nicht bewerten“-Liste, Richtwerte), Kürzel.
- Antwort je Zeile: `katalogId | null`, `varianteIndex`, `anzahl`, `einheit`,
  `bezeichnung`, `zustand`, `unsicher`, `grund`; dazu `kurzbeschreibung` (A8, inkl. KGN).
- Vorschau-Liste: unsichere Zeilen gelb, abhaken/korrigieren, dann übernehmen.

## Assistent B – Skizze aus Foto

- Antwort: Elemente mit Typ, Box (Gemini-Format `box_2d`, 0–1000), Beschriftung, Maß.
- Neue Elementtypen im Editor: Weg + Tor, Hecke, Baum-Piktogramm, Strauch, Kompost,
  Schacht, „entfernen“ (Stern + rotes X), Mängelhinweis mit Pfeil, rote Maßlinie.
- Modus Bau: Gebäude aus Blatt „Skizze Bau“ der Bau-Excel als Grundlage übernehmen.
- Später optional: Export als bearbeitbare Excel-Formen statt PNG.

## Anbindung

- Cloudflare Pages Function `/api/ki`; API-Key als Cloudflare-Secret (`GEMINI_API_KEY`),
  nie im App-Bundle.
- Modellkette vom besten Modell abwärts (z. B. Pro → Flash → Flash-Lite; aktuelle
  kostenlose Modelle beim Bau prüfen). Bei „Limit erreicht“ (429) Modell bis zum Reset
  sperren und das nächste nehmen; nach Reset automatisch wieder hoch.
- Anbieter austauschbar halten (später Azure OpenAI, Gemini bezahlt, Claude-API).
- Antwortendes Modell in der App anzeigen; schwächere Modelle strenger prüfen
  (IDs existieren, Mengen plausibel).

## Datenschutz (Entscheidung 17.10.2026)

Bis zur rechtlichen Prüfung **nur Fake-Daten**. Im kostenlosen Gemini-Tarif darf Google
Eingaben verwenden. Die App sendet nie Formalien mit. **Vor dem ersten echten Einsatz**
klären: bezahlter Tarif / Azure OpenAI / Claude-API mit Auftragsverarbeitungsvertrag.
Microsoft-365-Copilot-API verworfen (Vorschau, Copilot-Lizenz je Nutzer, nur Text).

## Vorgehen

1. Simon: API-Key in Google AI Studio, als Secret bei Cloudflare eintragen; 3–5 Testfälle
   mit **erfundenen** Daten (Aufnahmeliste + erwartetes Ergebnis, Skizzenfoto + Soll).
2. Testlauf-Skript: gleiche Eingaben an jedes Modell, Vergleich mit dem Soll
   (Positionen gefunden, Katalog-Treffer, Preisabweichung, Unsicherheiten).
   Prompts nachschärfen (Beispiele statt Regeln, Kürzel-Liste, Begründungsfeld,
   ggf. zweiter Prüfdurchgang „fehlt etwas?“).
3. `/api/ki` mit Modellkette.
4. Assistent A.
5. Assistent B (zusammen mit dem Design-Durchgang).
