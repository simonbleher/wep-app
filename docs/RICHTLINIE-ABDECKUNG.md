# Abdeckung der Richtlinie (BewRL, LV Berlin, gültig ab 01.01.2023)

Stand 30.10.2026. Vergleich von `docs/Richtlinie.pdf` mit App, Katalog (`data/katalog.json`, `data/invasive.json`,
`data/problempflanzen.json`) und Regeln (`src/gruen/`, `src/bau/`). Seiten = gedruckte Seitenzahl der Richtlinie.

**Stand:** ✅ abgedeckt · 🟨 teilweise · ❌ fehlt · ⚠️ weicht ab · ❓ Frage an Simon/BV
**Aufwand:** S = klein (< ½ Tag) · M = mittel (1–2 Tage) · L = groß

## Ergebnis in Kürze

- **Höchstwerte im Katalog:** Alle 52 Positionen von S. 12–18 stimmen mit der Richtlinie überein, ebenso die
  NHK (S. 5), Mängel-Höchstabzüge (S. 6–8), die Restnutzungstabelle (S. 10), Vorplatz, Gewächshaus, Abwasser,
  Kanal (S. 11–14) und die Bau-Beseitigungssätze (S. 19–20). Die Unionsliste (S. 25–26) ist mit 41 Arten vollständig.
- **Bau-Teil:** weitgehend abgedeckt, mit Warnungen und Quellenangabe (`src/bau/regeln.ts`).
- **Grün-Teil – Lücken:**
  1. Für die **Beseitigung Grün** (S. 20–21: Bäume nach Stammumfang, Sträucher, Hecken, Wurzelstock, Wegeplatten,
     Ortbeton, Unrat, Spielgeräte, Verwilderung …) gibt es keine Bausteine mit Höchstwerten. Der Bau-Teil hat sie.
  2. **Mengen- und Maßgrenzen** stehen nur als Text im Katalog und erzeugen keine Warnung: Hecke 1,25 m / 0,70 m,
     Hochbeet 10 % der Gartenfläche, Teich 10 m², Wasserbecken 2 m³, Zisterne 3 m³ u. a.
  3. Für **Außenanlagen** fehlt die Alterswertminderung von mindestens 3 % jährlich (S. 12). Die App rechnet nur
     Höchstwert × Zustand.
  4. **Geschützter Baum:** Die Richtlinie sagt „mit 1,00 € je Stück“. Die App schlägt bei „gut“ 0,75 € und bei
     „mittel“ 0,50 € vor.
- **Fachlich offen (❓):** die Zustandsstufen-Staffel, ob „schlecht = 1 €“ auch für Außenanlagen gilt,
  #95 (Altersabzug der Grube vom Restwert oder linear) und die Bewertung nicht geschützter Laub- und Nadelbäume.

## I. Bauliche Anlagen (S. 3–11)

| Regel / Position | Fundstelle | Stand | Beleg | Vorschlag | Aufwand |
|---|---|---|---|---|---|
| Laube ≤ 24 m², Außenmaße, Aufmaß ab Fußbodenoberkante | S. 3 Nr. 2 | ✅ | `hinweiseBau` (24-m²-Warnung, Info Außenmaße), `ZULAESSIGE_FLAECHE_M2` | – | – |
| Anbauten nur, wenn zusammen ≤ 24 m² | S. 3 Nr. 3 | ✅ | `hinweiseBau`, Anrechnung L → A → Ü1 (`verteileFlaeche`) | – | – |
| Keller nur mit Genehmigung, Bauklasse II, Restnutzung ≤ Laube, Innenmaße | S. 3 Nr. 3, S. 11 c | 🟨 | `hinweiseBauteil` (Genehmigung, BK II, Restnutzung) | Hinweis „Innenmaße“ fehlt; als Info ergänzen | S |
| Widerrechtlich/nicht nutzbar → nicht bewerten, entfernen | S. 3 Nr. 4 | ✅ | `hinweiseBauteil` mit Beseitigungsvorschlag | – | – |
| Bauklassen und NHK 2015 | S. 4–5 | ✅ | `NHK_TABELLE`, Bauklasse-Assistent `src/bau/assistent.ts`, Test gegen Vorlage | – | – |
| GL 10–19 / Holzlauben bis 4 cm → IV.1 | S. 5 Fußnote | 🟨 | IV.1 über Wanddicke erreichbar | Hinweis zu „GL 10–19“ im Assistenten | S |
| Mängeltabelle mit Höchstabzügen, begründen | S. 6–8 | ✅ | `MAENGEL_GRUPPEN`, Warnung bei Überschreiten, Info „begründen“ | – | – |
| Nicht fertiggestellt, Laube nicht beräumt (10 %) | S. 8 | ✅ | Gruppen `unfertig`, `beraeumt` | – | – |
| Alterswertminderung nach Restnutzungsjahren | S. 8–10 | ✅ | `RESTNUTZUNG` = Tabelle S. 10 (geprüft), `schlageRestnutzungVor` | – | – |
| Restnutzung bis 20 Jahre bei mangelfreiem Zustand, begründen | S. 9 | ✅ | Info „im Einzelnen zu begründen“ | – | – |
| Baujahr nachweisen oder schätzen, je Bauteil | S. 9 | ✅ | Warnung „Baujahr fehlt“ je Bauteil | – | – |
| Baupreisindex IV. Quartal Vorjahr | S. 11 | ✅ | `src/bau/baupreisindex.ts`, Warnung bei Ersatzjahr | – | – |
| Gewächshaus ≤ 12 m², First ≤ 2,20 m, NHK 160 € | S. 11 a | ✅ | `GEWAECHSHAUS`, drei Warnungen | – | – |
| Separater Schuppen nach Bauklasse des Gebäudes | S. 11 b | ⚠️❓ | BAU-1 (#83): neben einer Laube werden Schuppen nicht bewertet | Richtlinie lässt genehmigte Schuppen „je nach Vertragslage“ zu – mit Simon klären, ob #83 BV-Praxis ist | – |
| Vorplatz als Teil der Laube; 275 / 175 / 80 €/m² | S. 11 d | ✅ | `VORPLATZ_HOECHST`, Warnungen | Regelwerte 225/175 je Bauklasse stammen aus der Vorlage, nicht aus der Richtlinie (dokumentiert) | – |
| Sonstige Anlagen: ≥ 3 % Alterswertminderung jährlich | S. 11 | ✅ | `MINDERUNG_MIN`, Warnung | – | – |
| Kubatur darstellen | S. 4 Nr. 9 | ✅ | Massenberechnung nach Dachform (Flach … Mansard) | – | – |
| Wasser, WC, Trockentoilette, Strom in der Baubeschreibung | S. 24 | 🟨 | nur Info-Hinweis | Optional: Ankreuzfelder in der Baubeschreibung | M |
| Alle baulichen Anlagen erfassen, auch nicht bewertete | S. 24 | ✅ | Bauteil „nicht bewerten“ bleibt erfasst | – | – |

## II. Außenanlagen (S. 12–15)

| Regel / Position | Fundstelle | Stand | Beleg | Vorschlag | Aufwand |
|---|---|---|---|---|---|
| Alle Höchstwerte (Wasser, Bewässerung, Messergrube, Brunnen, Regenwasser, Teich, Wege, Zäune, Stützmauern, Kompost, Rankgerüste, Früh-/Hochbeete, ökologische Objekte) | S. 12–15 | ✅ | `data/katalog.json` (`aa-*`), Werte einzeln geprüft | – | – |
| Höchstbeträge nach Bauausführung und Zustand senken | S. 12 | ✅ | `berechnePreisvorschlag` (Höchstwert × Zustand) | – | – |
| **Alterswertminderung ≥ 3 % jährlich** | S. 12 | ❌❓ | `Position` hat kein Baujahr/Alter | Frage: Ist das im Zustand enthalten, oder braucht jede Außenanlage ein Alter (Vorschlag × (1 − 0,03 × Alter))? | M |
| Nur vertraglich zugelassene Anlagen; Gemeinschaftsanlagen nicht | S. 12, 24 | 🟨 | nur Regeltext | – (Ermessen vor Ort) | – |
| Wasseranschluss-Pauschale schließt Messergrube ein | S. 12 | 🟨 | Regeltext | Warnung, wenn Pauschale und Messergrube zusammen erfasst sind | S |
| Messergrube ohne trittfesten Deckel nicht bewerten | S. 12 | 🟨 | Regeltext | – | – |
| Messergrube ≤ 3 m³, Zisterne ≤ 3 m³, Wasserbecken ≤ 2 m³, Teich ≤ 10 m² | S. 12–13 | 🟨 | nur Regeltext (Info) | Mengen-Warnung wie bei Rasen (`regelhinweise.ts`) | S |
| Teiche aus Beton/Mauerwerk/Metall entfernen | S. 13 | 🟨 | Regeltext | – | – |
| Abwassergrube: Dichtheitsnachweis, 3 % jährlich, 16-Jahres-Grenze, −150 € | S. 13–14 | ✅ ⚠️❓ | Bau-Teil `GRUBEN_TYPEN`, `altersabzugVomRestwert` (#95) | **#95:** Richtlinie sagt „von den Bis-Werten ausgehend … jährlicher Abzug von 3 %“ – das liest sich linear (16 J. = 48 %); #95 rechnet vom Restwert (38,57 %). Bitte mit dem BV bestätigen | – |
| Kanalanschluss bis 2.200 €, 3 % jährlich | S. 14 | ✅ ⚠️❓ | `KANAL_HOECHSTWERT`, wie #95 | wie oben | – |
| Versiegelte Fläche ≤ 6 % von (Parzelle − 24 m²) | S. 14 | ✅ | `regelhinweise.ts` Nr. 4 | Bei genehmigter Laube > 24 m² gilt die genehmigte Fläche – im Hinweis erwähnen | S |
| Spritzschutz bis 0,80 m um die Laube ohne Bewertung | S. 14 | 🟨 | Regeltext | – | – |
| Zaun ≤ 1,25 m; Flechtzaun/Lamellen/Stacheldraht nicht bewerten; von Hecke durchwachsen nicht bewerten | S. 14 | 🟨 | Regeltext | Warnung, wenn Bezeichnung „Flechtzaun/Lamelle/Strohmatte/Stacheldraht“ enthält (wie Problempflanzen) | S |
| Stützmauer ≤ 1,25 m; Asbest-/Plastikstreifen nicht bewerten | S. 15 | 🟨 | Regeltext | – | – |
| Kompost aus Asbest nicht bewerten | S. 15 | 🟨 | Regeltext | – | – |
| Hochbeet ≤ 10 % der Gartenfläche, ≥ 50 cm, nicht gemauert | S. 15 | 🟨 | Regeltext | Warnung: Summe Hochbeet-m² > 10 % `parzellenflaecheM2` | S |
| Benjeshecke ≤ 10 m, Totholz ≤ 1 m³ | S. 15 | 🟨 | Regeltext (Variante) | – | – |
| Solaranlagen u. Ä. nicht bewerten | S. 24 | 🟨 | – | – | – |

## III. Aufwuchs (S. 16–18)

| Regel / Position | Fundstelle | Stand | Beleg | Vorschlag | Aufwand |
|---|---|---|---|---|---|
| Obstgehölze 5 Formen × 3 Altersstufen | S. 16 | ✅ | `aw-obstgehoelz` (15 Varianten geprüft, Druckfehler „75;00“ = 75 €); Altersstufe aus dem Alter (PR aufwuchs/baum-mass) | Grenzfall genau 30 Jahre: Frage an den BV | – |
| Schlechter Zustand: Abwertung bis 1,00 € | S. 16 | ✅ | `ZUSTANDSSTUFEN.schlecht` (Festpreis 1 €) | – | – |
| „schlecht = 1 €“ auch für alle übrigen Positionen | – | ⚠️❓ | `berechnePreisvorschlag` gilt für alle | Richtlinie nennt 1 € nur bei Obstgehölzen; bei Außenanlagen (z. B. Zaun 40 €/m, schlecht → 1 €/m) prüfen | S |
| Zustandsstufen sehr gut 100 % / gut 75 % / mittel 50 % | – | ❓ | `src/model/types.ts`, „vom BV zu bestätigen“ | Bestätigung durch den BV | – |
| Verkrüppelte/kranke Bäume nicht bewerten; Abschläge bei Pflegemangel/Engstand | S. 16 | 🟨 | Regeltext; Abschlag über Zustand | – | – |
| **Geschützter Baum: erhalten, 1,00 € je Stück** | S. 16 | ✅ | `berechnePreisvorschlag` (fest 1 €, PR aufwuchs/baum-mass) | – | – |
| Laub-/Nadelbäume nur, wenn laut Vertrag nicht verboten; Wert? | S. 16 | ❓ | keine Katalogposition außer „geschützt“ und Obst | Frage: Wie werden nicht geschützte Laub-/Nadelbäume (z. B. Birke) bewertet – als Ziergehölz, gar nicht (nur Beseitigung) oder Freitext? | – |
| Invasive Arten entfernen (Unionsliste) | S. 16, 25–26 | ✅ | `data/invasive.json` (41 Arten), Warnung + Beseitigungsvorschlag | – | – |
| Beerenobst, weitere Kulturen | S. 16–17 | ✅ | `aw-beerenobst`, `aw-weinrebe` … `aw-gemuese` | Beerenobst über 20 Jahre nennt die Richtlinie nicht – App bietet 5–20 J. an, ok | – |
| Ziergehölze, Kletterpflanzen, Rosen, Stauden, Gräser, Kräuter, Zwiebeln | S. 17–18 | ✅ | `aw-ziergehoelz` … `aw-knollen-zwiebeln-*` | – | – |
| Nadelgehölz Solitär ≤ 10 m² kronendeckend; großwüchsige entfernen | S. 17 | ✅🟨 | Problempflanzen `nadel-gross` (Warnung); 10 m² nur Regeltext | – | – |
| **Hecke nur bis 1,25 m Höhe und 0,70 m Breite** | S. 18 | ❌ | Regeltext als Info; `Position` hat kein Feld für Höhe/Breite | Optionale Felder Höhe/Breite bei Hecken, Warnung bei Überschreitung (nichts sperren) | M |
| Rasen/Wiese max. 100 m² | S. 18 | ✅ | `regelhinweise.ts` Nr. 3 | Prüft je Position; zwei Rasenflächen zusammen > 100 m² werden nicht erkannt → Summe prüfen | S |
| Nicht bewerteter Aufwuchs ist zu entfernen (außer BaumSchVO) | S. 24 | 🟨 | Beseitigungsvorschlag nur bei invasiven/Problempflanzen | – | – |

## IV. Beseitigungskosten (S. 19–21)

| Regel / Position | Fundstelle | Stand | Beleg | Vorschlag | Aufwand |
|---|---|---|---|---|---|
| Zuschlag für Erschwernisse bis 300 % | S. 19 | ✅ | `BESEITIGUNG_MAX_FAKTOR`, Warnung + Begründungspflicht (Bau) | Warnung auch für Beseitigung Grün | S |
| Sonderabfall (Asbest, Dachpappe) nach TRGS 519 | S. 19 | ✅ | Textbausteine Bau | – | – |
| Rückbau nach Bauklasse je m³ (180/180/150/120), Vorplatz 100 €/m², Schornstein 250, Gaube 1.500, Sonderabfall 1.000 | S. 19 | ✅ | `BESEITIGUNG_*`, `rueckbauPosition` | – | – |
| Blechschuppen = Bauklasse IV; Mischbau = höchste Bauklasse | S. 19 | 🟨 | `beseitigungsKlasse` | Hinweis ergänzen | S |
| Wegeplatten 25 €/m², Ortbeton 100 €/m², weitere Anlagen 55 €/m³, zweite Tür 250 €, Inventar 100 €/m³, Grube 250 €/m³, Abfuhr 150 €, Spielgeräte 100 €, Unrat 200 €/m³ | S. 20 | 🟨 | Inventar, Grube, Abfuhr, Unrat nur als Bau-Bausteine | **Bausteine für Beseitigung Grün** mit Höchstwert und Einheit (wie `BESEITIGUNG_TEXTBAUSTEINE`) | S |
| Bäume nach Stammumfang in 1,30 m (75 € bis 1.250 €, 13 Stufen) | S. 20–21 | ✅ | Vorlage „Baum fällen“, `src/gruen/baumMass.ts`, Staffel in `data/katalog.json` (PR aufwuchs/baum-mass) | – | – |
| Abzug fehlende Baumpflege bis 1.000 €; Sträucher 60 €/St.; Hecken 50 €/m; Wurzelstock 250 €; Beete anlegen 250 €; Verwilderung 400 € | S. 21 | ❌ | – | Bausteine wie oben | S |
| Fällzeit 1. März – 30. September | BNatSchG (Vorlage A46) | 🟨 | fester Text im Beseitigungs-Reiter (`WepDetail.tsx`) | Hinweis an Baum-/Hecken-Beseitigung, wenn das Datum der Wertermittlung in die Zeit fällt | S |
| Naturschutzgesetz, Baumschutzverordnung beachten | S. 21 | 🟨 | Text | – | – |

## V./VI. Durchführung, Pflichtangaben (S. 22–24)

| Regel | Fundstelle | Stand | Beleg | Vorschlag | Aufwand |
|---|---|---|---|---|---|
| Mindestens zwei Wertermittler, jeder für seinen Teil | S. 22 | ✅ | v2: Rollen `bau`/`gruen`, zwei verschiedene Personen (`src/server/rechte.ts`) | – | – |
| Anwesenheit scheidender Unterpächter / Verein | S. 22 | ✅ | Formalien E9–E11 | Warnung, wenn „anwesend für den Unterpächter“ leer ist | S |
| Lageskizze, bauliche Anlagen bemaßt mit Grundriss und Seitenansichten | S. 23 | 🟨 | Skizze Bau (Grundriss, Maßketten), Grün-Skizze, 3D-Ansicht | Seitenansichten fehlen (3D ersetzt sie nicht im Export) | L |
| Fotos optional | S. 23 | ✅ | Fotos je Position | – | – |
| Teilung: je Teilparzelle ein Protokoll | S. 23 | 🟨 | über „Duplizieren“ möglich | – | – |
| Rundung | – | ✅ | Richtlinie regelt keine Rundung; App rundet auf Cent (`rund2`) wie die Vorlage | – | – |

## Fragen an Simon / den BV

1. **Zustandsstufen:** Gilt die Staffel 100 / 75 / 50 % und „schlecht = 1 €“? Gilt „schlecht = 1 €“ auch für Außenanlagen und Nicht-Obst-Aufwuchs?
2. **Alterswertminderung Außenanlagen (S. 12):** Soll die App ein Alter je Außenanlage erfassen und mindestens 3 % je Jahr abziehen, oder ist das im Zustand enthalten?
3. **#95 Grube/Kanal:** linear vom Höchstwert (3 % × Alter) oder vom Restwert (1 − 0,97^Alter)? Der Wortlaut „von den Bis-Werten ausgehend“ spricht eher für linear.
4. **Laub-/Nadelbäume ohne Schutz:** Wie werden sie bewertet?
5. **Schuppen neben der Laube (#83):** Werden genehmigte separate Schuppen nach S. 11 b nie bewertet, oder hängt das vom Vertrag ab?

## Kleine, eindeutige Lücken (eigene PRs)

1. Geschützter Baum immer 1,00 €, unabhängig vom Zustand – erledigt mit „aufwuchs/baum-mass“.
2. Baumbeseitigung nach Stammumfang (S. 20–21) als Vorlage mit Vorschlag aus dem Maß – erledigt mit „aufwuchs/baum-mass“.
3. Übrige Bausteine für Beseitigung Grün (S. 20–21) mit Höchstwert, Einheit und Seite; Faktor-Warnung (300 %) auch im Grün-Teil.
4. Mengengrenzen als Warnung: Teich 10 m², Wasserbecken 2 m³, Zisterne 3 m³, Messergrube 3 m³, Hochbeet 10 % der Parzelle,
   Rasen/Wiese als Summe.
5. Hecke: optionale Höhe/Breite mit Warnung > 1,25 m / > 0,70 m.

Die Fragen 1–5 oben bleiben offen, bis Simon bzw. der BV sie beantwortet; bis dahin ändert die App dort nichts.
