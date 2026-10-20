# KI-Assistent (Planung, noch nicht gebaut)

## Abgeschaltet seit 20.10.2026, so einschalten

Die KI-Funktionen sind vorerst **aus** (Beta 2, siehe docs/PLAN-BETA2.md, Schritt 1).
Der Code bleibt vollständig im Repo. Einschalten braucht **beide** Seiten:

1. **App (Build-Variable):** `VITE_KI_AKTIV=true` beim Build setzen (lokal in `.env.local`,
   bei Cloudflare Pages unter „Variablen“). Der Schalter `KI_AKTIV` steht in
   `src/funktionen.ts`; ohne die Variable ist er `false`.
2. **Schnittstelle (Cloudflare-Variable):** `KI_AKTIV=true` zusätzlich zu `GEMINI_API_KEY`
   (lokal in `.dev.vars`). Sonst antwortet `/api/ki/*` mit 404 „KI ist abgeschaltet“.

Wenn aus: Skizzen-Chat und KI-Hinweise sind in der App ausgeblendet; Skizzen-Editor, neue
Symbole und Export als Excel-Formen laufen unverändert. Test: `src/app/__tests__/kiSchalter.test.tsx`.
Vor dem Wiedereinschalten rechtliche Prüfung (siehe „Datenschutz“).

Ziel: Die beiden Claude-in-Excel-Skills von Simon in der App nachbauen –
ohne Claude-API, mit **Google AI Studio (Gemini, kostenloser Tarif)**.

- `/wertermittlung-aussen-aufwuchs` → **Assistent A: Aufnahmeliste übernehmen**
- `/parzellen-skizze` → **Assistent B: Skizze aus Foto**

Vorlagen: die beiden Claude-Skills liegen als Referenz in `docs/skills/`.

## Grundsatz: KI liest, App rechnet

| Aufgabe | Wer |
|---|---|
| Notiz/Diktat/Word-Text lesen, Position erkennen, Katalog-ID + Variante zuordnen, Menge/Alter/Zustand schätzen, Unsicheres markieren | KI |
| Höchstwert, Zustandsfaktor, Preis, Regelhinweise, Summen | App (vorhandener Code) |
| Skizze: Elemente mit Typ, Lage, Beschriftung, Maß | KI |
| Skizze: Stil (Farben, Gras, Baum-Piktogramme, rote Maßlinien, Mängelkästen) | App (Stil-Spezifikation aus dem Skill) |

Die KI liefert **nur strukturiertes JSON** (Gemini `responseSchema`), nie Preise oder
Zeichenbefehle. Dadurch ist das Ergebnis weitgehend modellunabhängig, und alles bleibt
in der App sichtbar und editierbar.

## Assistent A – Aufnahmeliste

- Eingabe **nur Text oder Word-Datei**: eingetippter/eingefügter Text, Diktat (wird zu
  Text) oder `.docx`. Die Word-Datei wandelt **mammoth** im Browser in Text um
  (Tabellenzeilen als „Position | Menge | Bemerkung“). **Kein Foto** (Entscheidung
  17.10.2026): Handschrift-Fotos der Liste sind unzuverlässig und teurer; die Aufnahmeliste
  liegt in der Praxis ohnehin als Word-Datei oder Notiz vor.
  Testlauf: `tools/ki-test/faelle/04-word-tabelle/` (`eingabe.docx`).
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
- Export als bearbeitbare Excel-Formen statt PNG: **umgesetzt** (E3, `src/export/skizzeFormen.ts`);
  `tools/ki-test/skizze/formen.ts` übersetzt die Ausrichtung in `FormElement`e.

## Erkenntnis aus echter Bau-Excel (17.10.2026)

- Die Bau-Skizze liegt in der Bau-Excel als **native Excel-Formen** (Rechtecke, Ellipsen,
  Linien, Pfeile, Textfelder mit Maßen) im Blatt „Skizze Bau“ – nicht im Skill-Stil.
- Der Bau-Wertermittler **kopiert sie bereits** ins Blatt „Skizze Außenanlage-Aufwuchs“
  (ohne Maße). Grün ergänzt nur noch: Bäume, Hecken, Beete, Brunnen, Zugang, Mängel …
- Folgen:
  1. **Export ändern:** Das bisherige PNG (E2) würde die vorhandenen Bau-Formen
     überdecken. Grün-Elemente müssen als **eigene Excel-Formen** in das vorhandene
     Drawing angehängt werden (Bau-Formen bleiben unangetastet), mindestens aber als
     transparentes PNG ohne Hintergrund/Raster.
  2. **Import:** Lädt man die Bau-Excel hoch, liest die App die Formen aus „Skizze Bau“
     (bzw. dem schon vorbereiteten Außen-Blatt) und zeigt sie im Editor als feste
     Hintergrund-Ebene.
  3. **KI-Ausrichtung:** Gemini erkennt im Foto auch die Gebäude (Laube, LVP, ASG …).
     Die App richtet das Foto über diese Bezugsgebäude an den Excel-Formen aus und setzt
     nur die neuen Grün-Elemente.
- Testfall: tools/ki-test/faelle-skizze/fall1/.

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

## Skizzen-Chat (gebaut, Branch ki/skizze-chat)

- Chat-Leiste im Skizze-Tab: Text oder Diktat → KI antwortet **nur mit Function Calls**
  (`hinzufuegen`, `aendern`, `verschieben`, `groesse`, `loeschen`, `beschriften`, `reihe`,
  `entlangKante`, `neben`/`unter`/`ueber`, `hinweis`, `fertig`); der Code rechnet die Geometrie.
- Szene in Promille des Grundstücks mit stabilen ids, Bau-Formen `fest`. Siehe `src/skizze/szene.ts`.
- Schnittstelle `POST /api/ki/skizze-chat` (`functions/`), Secrets: `GEMINI_API_KEY`, optional
  `KI_MODELLE` (kommagetrennt, bestes zuerst) und `APP_TOKEN` (Header `x-wep-token`, in der App
  `VITE_KI_TOKEN`). Lokal: `.dev.vars` + `npx wrangler pages dev`.
- Selbstprüfung: neu rendern → zweiter Aufruf mit Bild und Code-Befunden → höchstens 1 Korrekturrunde.
- Test: `npm run ki-test-chat` (Replay, siehe `tools/ki-test/README.md`).

