# WEP-Schnittstelle für Browser-Agenten (`window.wep`)

## Zweck
Ein Browser-Agent (z. B. Claude in Chrome) soll die **Grün-Skizze** zuverlässig erstellen können – ohne Pixel-Klicken. Dafür gibt es
im Browser, in der Android-App und im Windows-Programm (derselbe Web-Teil) ein JavaScript-Objekt `window.wep`, **solange ein WEP
geöffnet ist**. Für den Nutzer bleibt die Skizze fast unverändert; der Agent *schlägt vor*, der Nutzer *entscheidet*.

- **Nur lesend**, außer den Vorschlägen (Skizze, Positionen). Der Vorschlag wird hervorgehoben angezeigt; **ohne „Übernehmen“ wird nichts gespeichert**.
- **Keine Netzwerkzugriffe** (alles läuft lokal im Browser; Formalien mit Namen verlassen das Gerät nicht).
- Code: `src/agent/` (`format.ts`, `schema.ts`, `lesen.ts`, `vorschlag.ts`, `umrechnung.ts`, `bruecke.ts`).

## Ablauf für einen Agenten
1. WEP öffnen lassen (Nutzer), Reiter egal. Prüfen: `typeof window.wep` ist `'object'`.
2. `window.wep.schema()` einmal lesen (JSON-Schema mit Beschreibung je Feld).
3. `const d = window.wep.lesen()` – Parzelle, Bau, Grundlage, Aufwuchs/Außenanlagen (mit `id`), vorhandene Skizze, Stile.
4. Skizze planen **in Metern** (siehe Koordinatensystem) und aus **Grundformen** zeichnen (Kreise, Linien, Vierecke, Dreiecke …; Hilfe: `window.wep.skizze.baustein('baum', { x, y })`); je Gegenstand ein Element mit `bezug` auf die `id` der Position verknüpfen.
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
**`x`/`y` sind immer Mittelpunkte** (rechteck, ellipse, bogen, text); `breite`/`hoehe` sind die vollen Maße. Vieleck, Linie und Maßlinie
nutzen absolute Punkte `{ "x": …, "y": … }`. Ohne Parzelle gilt eine Zeichenfläche von 20 × 15 m (`lesen().parzelle.hinweis` sagt es).

## Format `wep-skizze/2`: alles aus Grundformen
Der Vorschlag kennt **keine fertigen Symbole** (Baum, Hecke, Weg …). Alles wird – wie im Skill `parzellen-skizze` für Excel – aus **Grundformen**
gezeichnet: Rechtecke, Ellipsen/Kreise, Vielecke (Dreiecke, Sterne, schräge Flächen), Bögen, Linien, Maßlinien und Text. Jede Form kann **gefüllt** werden
und hat eine **eigene Linienfarbe, -stärke und -art**, unabhängig von der Füllung. Die Reihenfolge der Liste ist die Zeichenreihenfolge (was später kommt, liegt oben).

```json
{ "format": "wep-skizze/2", "modus": "ergaenzen", "elemente": [ … ] }
```
| typ | Pflichtfelder | weitere Felder |
|---|---|---|
| `rechteck` | `x`, `y`, `breite`, `hoehe` | `stil`, `fuellung`, `linie`, `linienart`, `linienbreite`, `beschriftung` |
| `ellipse` (Kreis: `breite` = `hoehe`) | `x`, `y`, `breite`, `hoehe` | wie `rechteck` |
| `vieleck` (Dreieck = 3 Punkte) | `punkte` (≥ 3; mit `offen: true` ≥ 2) | `offen` (Linienzug ohne Füllung), sonst wie `rechteck` |
| `bogen` (Viertelbogen, Rundung) | `x`, `y`, `breite`, `hoehe`, `startWinkel`, `endWinkel` | `linie`, `linienart`, `linienbreite` – nur Linie |
| `linie` | `von`, `nach` | `farbe`, `linienart`, `linienbreite`, `pfeil` (Spitze bei `nach`) |
| `massangabe` | `von`, `nach` | `beschriftung` (sonst berechnete Länge, „4,5 m“), `farbe` |
| `text` | `x`, `y` und `inhalt` (oder `bezug`) | `farbe`, `groesse` (pt, 5–28, üblich 9) |

Für alle Formen: `name` (sprechend, wird zum Formnamen im Excel, z. B. „Stamm“, „Krone“) und `bezug`.
- **Farben** `#RRGGBB`. `fuellung` = Fläche, `linie` (bei Linien/Maß/Text: `farbe`) = Rand bzw. Strich – beide unabhängig. `"fuellung": null` = keine Füllung.
  `stil` = Kurzname einer Vorgabe, die Füllung **und** Linie setzt (`wiese` #C5E0B4, `weg` #EDE4D3, `kompost` #D9C3A5/#8B5A2B, `flieder` #B4A7D6/#7030A0, `hecke`, `beet`,
  `wasser`, `schacht`, `gebaeude`, `hinweis` #C00000, `entfernen`, `rahmen`, `gestrichelt`); Einzelangaben überschreiben ihn.
- **`linienbreite`** in pt des Excel-Blatts (0,25–6; üblich 1, Maßlinien und Tor 2), **`linienart`** `durchgezogen` | `gestrichelt`.
- **Bogen:** Mittelpunkt `x`/`y`, `breite`/`hoehe` = Durchmesser des vollen Kreises; Winkel in Grad, 0 = rechts, 90 = unten, 180 = links, 270 = oben (Uhrzeigersinn), 1°–360°.
  Viertelbogen am Tor: 180 → 270.
- **`bezug`** `{ "liste": "aufwuchs" | "aussenanlagen" | "beseitigung", "id": "<Position.id>" }` verknüpft die Zeichnung mit einer Position.
  **Nur an ein Element je Gegenstand setzen** (z. B. den ersten Kronenkreis): die App zählt die Verweise gegen die Stückzahl und meldet Aufwuchs-Positionen ohne Element.
- Unbekannte Felder, Zahlen als Text, unbekannte Farben, Symbole und Bezüge ohne Position sind Fehler mit Pfad (`elemente[3].fuellung`). Höchstens 400 Elemente, alles oder nichts.
- Im Excel liegen die Formen in Listenreihenfolge übereinander (eine Ebene), werden nicht verschoben oder verkleinert; Füllung, Linienfarbe/-stärke/-art und Textfarbe gelten.

### Bausteine: fertige Grundformen als Hilfe
`window.wep.skizze.baustein(name, { x, y, breite?, hoehe?, beschriftung?, ziel? })` → `{ ok, fehler[], elemente[] }` liefert die Grundformen für einen Gegenstand
(`baum`, `strauch`, `wildling`, `kletterpflanze`, `hecke`, `beet`, `hochbeet`, `blumenbeet`, `kompost`, `brunnen`, `schacht`, `weg`, `tor`, `holzpferd`, `schaukel`,
`gegenstand`, `entfernen`, `mangelhinweis`). Sie sind genau wie im Skill gebaut (Baum = Stamm #7F5A2E + drei Kronenkreise #548235/#385723; Hecke = Reihe überlappender,
versetzter Kreise, bei „Flieder“ in der Beschriftung lila; Tor = Linie + Viertelbogen; Entfernen = grüner Stern mit rotem X und Hinweisfeld; Mängelhinweis = Feld mit rotem Pfeil).
Der Agent hängt die Elemente an seine Liste an (und setzt den `bezug` am ersten), ändert Farben/Größen nach Bedarf oder zeichnet selbst. `lesen().stile.bausteine` nennt Namen und Standardgrößen.

## Beispiele
`docs/skizze-agent/beispiel-vorschlag.json` (51 Grundformen, erzeugt mit `tools/skizze-agent/erzeuge-beispiel.ts`) – Excel-Render: `docs/skizze-agent/excel-gruen.png`. Von Hand:
```json
{ "typ": "vieleck", "name": "Dreieckbeet", "punkte": [{ "x": 7, "y": 3 }, { "x": 10.5, "y": 3 }, { "x": 7, "y": 6 }], "fuellung": "#EBDDC7", "linie": "#7030A0", "linienbreite": 2 }
```
*Dreieck, gefüllt, mit eigener Linienfarbe und -stärke.*
```json
{ "typ": "rechteck", "name": "Stamm", "x": 14, "y": 5.6, "breite": 0.25, "hoehe": 0.8, "fuellung": "#7F5A2E", "linie": "#7F5A2E", "bezug": { "liste": "aufwuchs", "id": "p-apfel" } },
{ "typ": "ellipse", "name": "Krone", "x": 14, "y": 4.7, "breite": 1.3, "hoehe": 1.3, "fuellung": "#548235", "linie": "#385723" }
```
*Baum zu Aufwuchs-Position:* Stamm und Krone (weitere Kronenkreise genauso), Bezug nur am Stamm.
```json
{ "typ": "ellipse", "name": "Hecke", "x": 17.2, "y": 6.5, "breite": 0.9, "hoehe": 0.9, "fuellung": "#A9D18E", "linie": "#548235" }
```
*Heckenreihe:* Kreise entlang der Grenze, jeweils um etwa 0,6 m versetzt (oder `baustein('hecke', …)`).
```json
{ "typ": "rechteck", "name": "Weg", "x": 9, "y": 21, "breite": 1.4, "hoehe": 8, "fuellung": "#EDE4D3", "linie": "#A6A6A6", "beschriftung": "Weg" },
{ "typ": "linie", "name": "Tor", "von": { "x": 10.4, "y": 24.6 }, "nach": { "x": 10.4, "y": 25.8 }, "farbe": "#262626", "linienbreite": 2 },
{ "typ": "bogen", "name": "Tor_Bogen", "x": 10.4, "y": 25.8, "breite": 2.4, "hoehe": 2.4, "startWinkel": 180, "endWinkel": 270, "linie": "#262626" }
```
*Weg mit Tor.*
```json
{ "typ": "rechteck", "name": "Kompost", "x": 2, "y": 22, "breite": 1.6, "hoehe": 1, "stil": "kompost" },
{ "typ": "linie", "name": "Latte", "von": { "x": 1.8, "y": 21.6 }, "nach": { "x": 1.8, "y": 22.4 }, "farbe": "#8B5A2B", "linienbreite": 2.5 }
```
*Kompost* (weitere Latten bei x = 2,0 und 2,2).
```json
{ "typ": "rechteck", "name": "Hinweis", "x": 5, "y": 19, "breite": 4, "hoehe": 0.9, "fuellung": "#FFFFFF", "linie": "#C00000", "beschriftung": "Rückschnitt nötig" },
{ "typ": "linie", "name": "Hinweis_Pfeil", "von": { "x": 6, "y": 19.5 }, "nach": { "x": 8, "y": 22 }, "farbe": "#C00000", "pfeil": true }
```
*Mängelhinweis mit Pfeil.*
```json
{ "typ": "massangabe", "von": { "x": 1, "y": 0.4 }, "nach": { "x": 17, "y": 0.4 }, "beschriftung": "16 m", "farbe": "#C00000" }
```
*Maßlinie.* Ein Fehler sieht so aus:
```json
{ "ok": false, "fehler": [{ "pfad": "elemente[0].typ", "meldung": "„baum“ ist keine Grundform – der Vorschlag besteht nur aus Grundformen (rechteck, ellipse, …). Zeichne es aus Kreisen, Linien, Vierecken, Dreiecken … oder hole dir fertige Grundformen mit window.wep.skizze.baustein('baum', { x, y })." }],
  "hinweise": [], "zusammenfassung": "Nichts angezeigt: 1 Fehler im Vorschlag.", "anzahl": 0 }
```

## Positionen aus Text (Außenanlagen, Aufwuchs, Beseitigung)
Zweiter Teil der Schnittstelle: Der Nutzer gibt dem Agenten einen Text (Aufnahmeliste, Notizen, Diktat), der Agent schlägt die Positionen vor,
**der Nutzer übernimmt**. Preise, Bezeichnungen und Regelhinweise rechnet die App wie im Formular „Position hinzufügen“ – der Agent nennt nur,
was er gelesen hat.

| Aufruf | Zweck |
|---|---|
| `window.wep.positionen.katalogSuchen(begriff, liste?)` | Katalogsuche (`liste` = `aufwuchs` (Standard) oder `aussenanlagen`), nur lesend: `katalogId`, Einheit, Höchstwert bzw. `varianten[]` mit `index`, `merkmale`, `hoechstwert` |
| `window.wep.positionen.vorschlagen(json)` | prüft, zeigt den Vorschlag oben im Reiter (Balken „Vorschlag: N Positionen für Aufwuchs · Summe – Übernehmen / Verwerfen“, mit Liste und Hinweisen) und liefert `{ ok, fehler[], hinweise[], zusammenfassung, anzahl, vorschau[], summe }` |
| `window.wep.positionen.status()` | `{ offen, zustand: 'kein-vorschlag' \| 'offen' \| 'uebernommen' \| 'verworfen' \| 'zurueckgenommen', nr, liste, anzahl, entschiedenAm }` |

Ablauf: `lesen()` (vorhandene Positionen mit `id`, damit nichts doppelt angelegt wird) → Text in Positionen zerlegen („eine Zeile = eine Sache“) →
`vorschlagen` → Fehler korrigieren → `hinweise` und `vorschau` dem Nutzer berichten → Nutzer entscheidet (nach „Übernehmen“ bietet die App „Rückgängig“,
solange die Liste offen ist). Die App öffnet den passenden Reiter selbst. Ein neuer Vorschlag ersetzt einen offenen; ohne Bestätigung wird nichts gespeichert,
nichts wird gesperrt (Warnungen, keine Blockaden).

```json
{ "format": "wep-positionen/1", "liste": "aufwuchs", "positionen": [
  { "suche": "Apfel", "variante": "Halbstamm 5–30", "anzahl": 2, "zustand": "gut" },
  { "suche": "Liguster Hecke", "variante": 0, "anzahl": 12, "zustand": "mittel" },
  { "bezeichnung": "Kirschbaum, alt", "einheit": "Stück", "anzahl": 1, "einzelpreis": 30 }
] }
```
- **Katalog** (Aufwuchs/Außenanlagen): `suche` (wie die Suche in der App, tippfehlertolerant, auch Arten und Alltagsbegriffe) **oder** `katalogId`.
  Hat der Eintrag mehrere Preisvarianten, ist `variante` Pflicht (Index oder Merkmal-Text); fehlt sie, listet der Fehler alle Varianten mit Höchstwert auf – der Agent soll **nicht raten**.
- **Freitext:** ohne `suche`/`katalogId`, dafür `bezeichnung` und `einheit` (+ `einzelpreis`, sonst 0 € mit Hinweis).
- `anzahl` (> 0, Dezimalpunkt), `einheit` (Standard: die des Katalogs: Stück, m, m², m³, lfdm, Pauschale), `zustand` (sehr gut · gut (Standard) · mittel · schlecht).
  Preis = Höchstwert × Stufe (sehr gut 100 %, gut 75 %, mittel 50 %, schlecht = 1 €); `einzelpreis` überschreibt ihn (zählt als eigener Preis).
- **Beseitigung:** `"liste": "beseitigung"`, Einträge `{ "gegenstand", "menge", "einheit", "einzelpreis", "faktor"?, "begruendung"? }`.
- **Bäume aus dem Maß** (abwärtskompatibel, alte Vorschläge gelten unverändert):
  - Obstgehölz mit `"alter"` (volle Jahre): `variante` nennt nur die Baumform, die App wählt die Altersstufe (BewRL S. 16),
    z. B. `{ "suche": "Apfel", "variante": "Halbstamm", "alter": 12, "anzahl": 1 }` → „Apfel, Halbstamm, 12 J.“, bis 85 €.
    Ohne `alter` gilt wie bisher die Variante, mit Hinweis „Alter fehlt“.
  - Beseitigung `"vorlage": "baum-faellen"` mit `"baumart"`? und `"stammumfang"` **oder** `"durchmesser"` (cm, in 1,30 m Höhe):
    Gegenstand („Birke fällen inkl. Wurzelstock, StU 85 cm“), Einheit (Stück) und Einzelpreis (Satz der Stufe, S. 20–21)
    bildet die App; `einzelpreis` überschreibt. Ohne Maß: 0 € und Hinweis „Maß fehlt“.
  - Geschützter Baum (`aw-baum-geschuetzt`): immer 1,00 €.
- Hinweise (verhindern nichts): Unionsliste/Problempflanze, Preis über Höchstwert, Rasen > 100 m², Zeile gibt es schon, Faktor > 1 ohne Begründung.
- Unbekannte Felder, Zahlen als Text, unbekannte Einheiten/Zustände und Katalogbegriffe ohne Treffer sind Fehler mit Pfad (`positionen[1].variante`). Höchstens 100 Positionen; alles oder nichts.
- Grenzen: nur Anlegen (kein Ändern oder Löschen vorhandener Positionen, keine Fotos); bei `liste` ≠ `beseitigung` keine Einträge für Bau; ohne Grün-Teil wird nichts angenommen.

## Grenzen
- Kein Schreiben außer den Vorschlägen (Skizze, Positionen; keine Formalien, Fotos); kein Löschen einzelner vorhandener Elemente (nur `gruen-ersetzen` insgesamt).
- Die Grundlage und Bau-Formen lassen sich nicht per Schnittstelle ändern; Bauteile kommen aus dem Bau-Teil bzw. der Bau-Excel.
- Symbole, die der Nutzer mit dem Symbol-Werkzeug gesetzt hat, kommen in `lesen()` als `typ: "symbol"` (nur lesend) vor; sie lassen sich nicht vorschlagen. `gruen-ersetzen` ersetzt sie (der Hinweis nennt es).
- Der Bogen wird als offener Linienzug gespeichert und kommt in `lesen()` als `vieleck` mit `offen: true` zurück.
- Ohne Grün-Teil (Rolle „bau“) wird kein Vorschlag angenommen. Ein Vorschlag lebt nur im geöffneten WEP; schließt der Nutzer das WEP, verfällt er.
- Keine Prüfung der Fachregeln (Hecke > 1,25 m …): das macht der Katalog an den Positionen; `lesen()` liefert deren Hinweise (`invasiv`, `problempflanze`, `hinweise`).
- Maße aus Fotos sind nur so genau wie der Agent sie liest – deshalb immer vom Nutzer bestätigen lassen.

## Tests und Belege
`src/agent/__tests__/` (lesen() schema-konform mit Ajv, Prüfung/Fehler, Übernehmen/Verwerfen/Rückgängig, Grundlage unantastbar, window.wep, Balken und Beschriftungen),
`src/export/__tests__/skizzeFarben.test.ts` (Farben im Export, alte Skizzen byte-gleich, Farben/Pfeile aus der Bau-Excel).
Durchlauf im Browser mit Screenshots: `npm run skizze-agent:screenshots`; Excel-Render: `npm run skizze-agent:export-bild` → `docs/skizze-agent/`.
