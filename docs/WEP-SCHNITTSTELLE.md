# WEP-Schnittstelle für Browser-Agenten (`window.wep`)

## Zweck
Ein Browser-Agent (z. B. Claude in Chrome) soll die **Grün-Skizze** zuverlässig erstellen können – ohne Pixel-Klicken. Dafür gibt es
im Browser, in der Android-App und im Windows-Programm (derselbe Web-Teil) ein JavaScript-Objekt `window.wep`, **solange ein WEP
geöffnet ist**. Für den Nutzer bleibt die Skizze fast unverändert; der Agent *schlägt vor*, der Nutzer *entscheidet*.

- **Nur lesend**, außer dem Skizzen-Vorschlag. Der Vorschlag wird hervorgehoben angezeigt; **ohne „Übernehmen“ wird nichts gespeichert**.
- **Keine Netzwerkzugriffe** (alles läuft lokal im Browser; Formalien mit Namen verlassen das Gerät nicht).
- Code: `src/agent/` (`format.ts`, `schema.ts`, `lesen.ts`, `vorschlag.ts`, `umrechnung.ts`, `bruecke.ts`).

## Ablauf für einen Agenten
1. WEP öffnen lassen (Nutzer), Reiter egal. Prüfen: `typeof window.wep` ist `'object'`.
2. `window.wep.schema()` einmal lesen (JSON-Schema mit Beschreibung je Feld).
3. `const d = window.wep.lesen()` – Parzelle, Bau, Grundlage, Aufwuchs/Außenanlagen (mit `id`), vorhandene Skizze, Stile.
4. Skizze planen **in Metern** (siehe Koordinatensystem), Elemente mit `bezug` auf die `id` der Positionen verknüpfen.
5. `window.wep.skizze.vorschlagen(vorschlag)` → `{ ok, fehler[], hinweise[], zusammenfassung, anzahl }`.
   Bei `ok: false` wurde **nichts** angezeigt: `fehler[].pfad`/`meldung` lesen, korrigieren, erneut senden.
   Bei `ok: true` öffnet die App den Reiter „Skizze“ und zeigt den Vorschlag orange gestrichelt mit dem Balken
   „Vorschlag: N Elemente – Übernehmen / Verwerfen“. `hinweise` (außerhalb der Parzelle, Baum auf dem Gebäude,
   Aufwuchs-Position ohne Element) verhindern nichts – dem Nutzer berichten.
6. **Der Nutzer** wählt Übernehmen oder Verwerfen. Der Agent fragt `window.wep.skizze.status()` ab
   (`{ offen, zustand: 'kein-vorschlag' | 'offen' | 'uebernommen' | 'verworfen', nr, anzahl, modus, entschiedenAm }`)
   und klickt **nicht selbst** auf Übernehmen. Übernehmen ist ein einziger Rückgängig-Schritt der Skizze; ein neuer
   Vorschlag ersetzt einen noch offenen.
7. Optional: `lesen()` erneut – `skizzeGruen.elemente` zeigt die übernommenen Elemente im selben Format.

Modi (`modus`): `ergaenzen` (Standard) fügt zur vorhandenen Skizze hinzu; `gruen-ersetzen` ersetzt alle Grün-Elemente.
**Die Grundlage (Bau-Skizze: Grundstück, Pfosten, Bauteile) bleibt in beiden Modi unangetastet** und ist per Vorschlag nicht änderbar.

## Koordinatensystem
Meter **auf der Parzelle**: Ursprung links oben der Parzelle (bei freier Form: links oben ihres umgebenden Rechtecks), **x nach rechts,
y nach unten**. `lesen().parzelle` nennt Ecken, Breite und Höhe; `lesen().grundlage.elemente` und `bau.grundriss` liegen im selben System.
**`x`/`y` sind immer Mittelpunkte** (rechteck, ellipse, Symbole, text); `breite`/`hoehe` sind die vollen Maße. Vieleck, Linie und Maßlinie
nutzen absolute Punkte `{ "x": …, "y": … }`. Ohne Parzelle gilt eine Zeichenfläche von 20 × 15 m (`lesen().parzelle.hinweis` sagt es).

## Format `wep-skizze/1`
```json
{ "format": "wep-skizze/1", "modus": "ergaenzen", "elemente": [ … ] }
```
| typ | Pflichtfelder | weitere Felder |
|---|---|---|
| Symbole: `baum`, `strauch`, `wildling`, `kletterpflanze`, `hecke`, `beet`, `hochbeet`, `blumenbeet`, `rasen`, `kompost`, `brunnen`, `schacht`, `weg`, `tor`, `holzpferd`, `schaukel`, `gegenstand`, `entfernen`, `mangelhinweis` | `x`, `y` | `breite`, `hoehe` (sonst Standardgröße, `lesen().stile.elementtypen`), `beschriftung`, `bezug`, `ziel` (nur `mangelhinweis`) |
| `rechteck`, `ellipse` (Kreis: `breite` = `hoehe`) | `x`, `y`, `breite`, `hoehe` | `stil`, `fuellung`, `linie`, `linienart`, `beschriftung`, `bezug` |
| `vieleck` | `punkte` (≥ 3) | wie `rechteck` |
| `linie` | `von`, `nach` | `farbe`, `linienart`, `pfeil` (Spitze bei `nach`) |
| `massangabe` | `von`, `nach` | `beschriftung` (sonst berechnete Länge, „4,5 m“), `farbe` |
| `text` | `x`, `y`, `inhalt` | – |

- **Farben** `#RRGGBB`. `stil` = Kurzname einer Vorgabe (`wiese` #C5E0B4, `weg` #EDE4D3, `kompost` #D9C3A5/#8B5A2B, `flieder` #B4A7D6/#7030A0,
  `hecke`, `beet`, `wasser`, `schacht`, `gebaeude`, `hinweis` #C00000, `entfernen`, `rahmen`, `gestrichelt`); `fuellung`/`linie`/`linienart`
  überschreiben ihn; `"fuellung": null` = keine Füllung. `linienart`: `durchgezogen` | `gestrichelt`.
- **`bezug`** `{ "liste": "aufwuchs" | "aussenanlagen" | "beseitigung", "id": "<Position.id>" }`: Name/Art folgen der Position
  (Kurzname vor dem ersten Komma, bei `entfernen` „<Name> entfernen“), falls keine `beschriftung` angegeben ist. Gespeichert wird der Verweis.
- Reihenfolge = Zeichenreihenfolge (hinten zuerst): Flächen zuerst, Bäume/Hecken danach, Beschriftungen und Hinweise zuletzt.
- Unbekannte Felder sind Fehler (z. B. `elemente[3].farbe`), ebenso Zahlen als Text, unbekannte Farben, Bezüge ohne Position. Höchstens 400 Elemente.
- Im Excel-Export gelten die Farben der Skizze; Flächen mit Füllung liegen unter Bäumen und Hecken.

## Beispiele
Die vollständige Beispielskizze liegt als `docs/skizze-agent/beispiel-vorschlag.json` (12 Elemente, Bezug zu den Positionen aus dem Test-WEP):

```json
{ "typ": "baum", "x": 14, "y": 5, "bezug": { "liste": "aufwuchs", "id": "p-apfel" } }
```
*Baum zu Aufwuchs-Position* – beschriftet sich als „Apfel“.
```json
{ "typ": "hecke", "x": 17.2, "y": 12, "breite": 0.9, "hoehe": 9, "bezug": { "liste": "aufwuchs", "id": "p-hecke" } }
```
*Heckenreihe* – die längere Seite ist die Richtung (hier senkrecht, 9 m).
```json
{ "typ": "weg", "x": 9, "y": 21, "breite": 1.4, "hoehe": 8, "beschriftung": "Weg" },
{ "typ": "tor", "x": 9.7, "y": 25.2, "breite": 1.2, "hoehe": 1.2 }
```
*Weg mit Tor.*
```json
{ "typ": "kompost", "x": 2, "y": 22, "breite": 1.6, "hoehe": 1 }
```
*Kompost.*
```json
{ "typ": "mangelhinweis", "x": 5, "y": 19, "breite": 4, "hoehe": 0.9, "beschriftung": "Rückschnitt nötig", "ziel": { "x": 8, "y": 22 } }
```
*Mängelhinweis mit Pfeil* (roter Pfeil vom Feld zum Ziel). Eigener Pfeil: `{ "typ": "linie", "von": {…}, "nach": {…}, "farbe": "#C00000", "pfeil": true }`.
```json
{ "typ": "massangabe", "von": { "x": 1, "y": 0.4 }, "nach": { "x": 17, "y": 0.4 }, "beschriftung": "16 m" }
```
*Maßlinie.*
```json
{ "typ": "vieleck", "punkte": [{ "x": 1, "y": 1 }, { "x": 17, "y": 1 }, { "x": 17, "y": 8 }, { "x": 1, "y": 9 }], "stil": "wiese", "beschriftung": "Wiese" }
```
*Wiese als Füllung.* Ein Fehler sieht so aus:
```json
{ "ok": false, "fehler": [{ "pfad": "elemente[0].bezug.id", "meldung": "Keine Position „x“ in „aufwuchs“. Vorhanden: p-apfel, p-birne …" }],
  "hinweise": [], "zusammenfassung": "Nichts angezeigt: 1 Fehler im Vorschlag.", "anzahl": 0 }
```

## Grenzen
- Kein Schreiben außer dem Vorschlag (keine Positionen, Formalien, Fotos); kein Löschen einzelner vorhandener Elemente (nur `gruen-ersetzen` insgesamt).
- Die Grundlage und Bau-Formen lassen sich nicht per Schnittstelle ändern; Bauteile kommen aus dem Bau-Teil bzw. der Bau-Excel.
- Ohne Grün-Teil (Rolle „bau“) wird kein Vorschlag angenommen. Ein Vorschlag lebt nur im geöffneten WEP; schließt der Nutzer das WEP, verfällt er.
- Der Bezug übernimmt den Namen zum Zeitpunkt des Vorschlags; wird die Position später umbenannt, bleibt die Beschriftung stehen.
- Keine Prüfung der Fachregeln (Hecke > 1,25 m …): das macht der Katalog an den Positionen; `lesen()` liefert deren Hinweise (`invasiv`, `problempflanze`, `hinweise`).
- Maße aus Fotos sind nur so genau wie der Agent sie liest – deshalb immer vom Nutzer bestätigen lassen.

## Tests und Belege
`src/agent/__tests__/` (lesen() schema-konform mit Ajv, Prüfung/Fehler, Übernehmen/Verwerfen/Rückgängig, Grundlage unantastbar, window.wep, Balken und Beschriftungen),
`src/export/__tests__/skizzeFarben.test.ts` (Farben im Export, alte Skizzen byte-gleich, Farben/Pfeile aus der Bau-Excel).
Durchlauf im Browser mit Screenshots: `npm run skizze-agent:screenshots`; Excel-Render: `npm run skizze-agent:export-bild` → `docs/skizze-agent/`.
