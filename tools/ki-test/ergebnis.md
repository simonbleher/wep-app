# KI-Testlauf Assistent A – Ergebnis

Stand: 17.10.2026, 23:03:22 · 3 Fälle · Prompt: `prompt-aufnahme.md` (11242 Zeichen) · Erzeugt mit `npm run ki-test`.

Preise rechnet `berechnePreisvorschlag` (Höchstwert × Zustandsstufe), Zeilensumme = ROUND(Anzahl × Einzelpreis; 2).
ID/Variante/Menge/Zustand ok = Anteil der gefundenen Positionen. „unsicher Ist/Soll (getr.)“ = von der KI markiert / im Soll markiert (davon beide).

## Modellvorschlag (models.list + Probe)

| Rang | Modell | Name | Status | Meldung |
|---|---|---|---|---|
| 1 | gemini-4-argon | Gemini 4 Argon | kein-freikontingent | You exceeded your current quota, please check your plan and billing details. For more information on this error, head to |
| 2 | gemini-3.8-flash | Gemini 3.8 Flash | frei |  |
| 3 | gemini-3.7-flash | Gemini 3.7 Flash | frei |  |
| 4 | gemini-3.6-flash | Gemini 3.6 Flash | frei |  |
| 5 | gemini-3.5-flash | Gemini 3.5 Flash | frei |  |
| 6 | gemini-3.5-flash-lite | Gemini 3.5 Flash Lite | frei |  |
| 7 | gemini-3.1-pro-preview | Gemini 3.1 Pro Preview | kein-freikontingent | You exceeded your current quota, please check your plan and billing details. For more information on this error, head to |
| 8 | gemini-3.1-flash-lite | Gemini 3.1 Flash Lite | frei |  |
| 9 | gemini-3.1-flash-lite-preview | Gemini 3.1 Flash Lite Preview | frei |  |
| 10 | gemini-3-flash-preview | Gemini 3 Flash Preview | frei |  |
| 11 | gemini-2.5-pro | Gemini 2.5 Pro | nicht-nutzbar | HTTP 404: This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use models/gemini-3.1-p |
| 12 | gemini-2.5-flash | Gemini 2.5 Flash | nicht-nutzbar | HTTP 404: This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8 |
| 13 | gemini-2.5-flash-lite | Gemini 2.5 Flash-Lite | nicht-nutzbar | HTTP 404: This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemin |
| 14 | gemma-4-31b-it | Gemma 4 31B IT | frei |  |
| 15 | gemma-4-26b-a4b-it | Gemma 4 26B A4B IT | frei |  |

## Je Modell

| Modell | Fälle | Recall | Precision | ID ok | Variante ok | Σ |Δ €| | Ø Zeit s |
|---|---|---|---|---|---|---|---|
| gemini-3.8-flash | 3 | 100 % | 100 % | 100 % | 99 % | 128,75 | 26.4 |
| gemini-3.7-flash | 3 | 100 % | 100 % | 100 % | 100 % | 38,75 | 52.2 |
| gemini-3.6-flash | 1 | 100 % | 100 % | 100 % | 100 % | 0,00 | 27.5 |
| gemini-3.5-flash | 3 | 100 % | 100 % | 100 % | 100 % | 91,25 | 23.1 |
| gemini-3.5-flash-lite | 3 | 100 % | 100 % | 97 % | 96 % | 110,25 | 7.1 |
| gemini-3.1-flash-lite | 3 | 100 % | 100 % | 99 % | 99 % | 201,63 | 12.0 |
| gemini-3.1-flash-lite-preview | 3 | 100 % | 100 % | 97 % | 97 % | 245,00 | 8.9 |
| gemini-3-flash-preview | 3 | 100 % | 100 % | 100 % | 100 % | 15,00 | 27.6 |
| gemma-4-31b-it | 2 | 100 % | 98 % | 98 % | 95 % | 101,25 | 91.7 |
| gemma-4-26b-a4b-it | 0 | – | – | – | – | – | – |

## Je Modell und Fall

| Fall | Modell | Antwort von | Zeit s | Ist/Soll | Recall | Precision | ID ok | Var. ok | Menge ok | Zustand ok | Σ Ist € | Σ Soll € | Δ € | Δ % | unsicher Ist/Soll (getr.) | KGN | Vermerk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-notizen-sauber | gemini-3.8-flash | = | 17.8 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 19/19 | 1.176,38 | 1.176,38 | +0,00 | +0 % | 1/1 (1) | ja |  |
| 02-kuerzel-chaos | gemini-3.8-flash | = | 26.5 | 27/27 | 100 % | 100 % | 27/27 | 26/27 | 27/27 | 23/27 | 1.308,00 | 1.425,50 | -117,50 | -8 % | 3/4 (3) | ja |  |
| 03-diktat | gemini-3.8-flash | = | 34.8 | 22/22 | 100 % | 100 % | 22/22 | 22/22 | 22/22 | 21/22 | 1.648,25 | 1.637,00 | +11,25 | +1 % | 1/1 (1) | ja |  |
| 01-notizen-sauber | gemini-3.7-flash | = | 77.5 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 19/19 | 1.176,38 | 1.176,38 | +0,00 | +0 % | 1/1 (1) | ja |  |
| 02-kuerzel-chaos | gemini-3.7-flash | = | 50.1 | 27/27 | 100 % | 100 % | 27/27 | 27/27 | 27/27 | 25/27 | 1.453,00 | 1.425,50 | +27,50 | +2 % | 4/4 (3) | ja |  |
| 03-diktat | gemini-3.7-flash | = | 28.9 | 22/22 | 100 % | 100 % | 22/22 | 22/22 | 22/22 | 21/22 | 1.648,25 | 1.637,00 | +11,25 | +1 % | 1/1 (1) | ja |  |
| 01-notizen-sauber | gemini-3.6-flash | = | 27.5 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 19/19 | 1.176,38 | 1.176,38 | +0,00 | +0 % | 1/1 (1) | nein |  |
| 02-kuerzel-chaos | gemini-3.6-flash | = | 4.4 | – | – | – | – | – | – | – | – | – | – | – | – | – | HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. |
| 03-diktat | gemini-3.6-flash | = | 18.8 | – | – | – | – | – | – | – | – | – | – | – | – | – | HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. |
| 01-notizen-sauber | gemini-3.5-flash | = | 23.1 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 18/19 | 1.221,38 | 1.176,38 | +45,00 | +4 % | 2/1 (1) | nein | HTTP 503 bei gemini-3.5-flash, neuer Versuch |
| 02-kuerzel-chaos | gemini-3.5-flash | = | 20.9 | 27/27 | 100 % | 100 % | 27/27 | 27/27 | 27/27 | 26/27 | 1.460,50 | 1.425,50 | +35,00 | +2 % | 6/4 (3) | ja |  |
| 03-diktat | gemini-3.5-flash | = | 25.3 | 22/22 | 100 % | 100 % | 22/22 | 22/22 | 22/22 | 21/22 | 1.648,25 | 1.637,00 | +11,25 | +1 % | 2/1 (1) | ja |  |
| 01-notizen-sauber | gemini-3.5-flash-lite | = | 6.6 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 18/19 | 1.221,38 | 1.176,38 | +45,00 | +4 % | 1/1 (0) | ja |  |
| 02-kuerzel-chaos | gemini-3.5-flash-lite | = | 7.8 | 27/27 | 100 % | 100 % | 26/27 | 25/27 | 27/27 | 22/27 | 1.393,75 | 1.425,50 | -31,75 | -2 % | 7/4 (3) | ja |  |
| 03-diktat | gemini-3.5-flash-lite | = | 6.9 | 22/22 | 100 % | 100 % | 21/22 | 21/22 | 22/22 | 18/22 | 1.670,50 | 1.637,00 | +33,50 | +2 % | 1/1 (0) | nein |  |
| 01-notizen-sauber | gemini-3.1-flash-lite | = | 8.7 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 18/19 | 1.221,38 | 1.176,38 | +45,00 | +4 % | 1/1 (0) | ja |  |
| 02-kuerzel-chaos | gemini-3.1-flash-lite | = | 16.0 | 27/27 | 100 % | 100 % | 26/27 | 26/27 | 27/27 | 22/27 | 1.351,25 | 1.425,50 | -74,25 | -5 % | 3/4 (2) | ja |  |
| 03-diktat | gemini-3.1-flash-lite | = | 11.5 | 22/22 | 100 % | 100 % | 22/22 | 22/22 | 22/22 | 15/22 | 1.719,38 | 1.637,00 | +82,38 | +5 % | 0/1 (0) | nein |  |
| 01-notizen-sauber | gemini-3.1-flash-lite-preview | = | 8.6 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 18/19 | 1.221,38 | 1.176,38 | +45,00 | +4 % | 1/1 (0) | nein |  |
| 02-kuerzel-chaos | gemini-3.1-flash-lite-preview | = | 10.2 | 27/27 | 100 % | 100 % | 25/27 | 25/27 | 27/27 | 17/27 | 1.236,75 | 1.425,50 | -188,75 | -13 % | 1/4 (1) | nein |  |
| 03-diktat | gemini-3.1-flash-lite-preview | = | 8.1 | 22/22 | 100 % | 100 % | 22/22 | 22/22 | 22/22 | 21/22 | 1.648,25 | 1.637,00 | +11,25 | +1 % | 0/1 (0) | nein |  |
| 01-notizen-sauber | gemini-3-flash-preview | = | 32.2 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 19/19 | 1.176,38 | 1.176,38 | +0,00 | +0 % | 4/1 (1) | nein |  |
| 02-kuerzel-chaos | gemini-3-flash-preview | = | 31.8 | 27/27 | 100 % | 100 % | 27/27 | 27/27 | 27/27 | 27/27 | 1.410,50 | 1.425,50 | -15,00 | -1 % | 3/4 (2) | nein |  |
| 03-diktat | gemini-3-flash-preview | = | 18.7 | 22/22 | 100 % | 100 % | 22/22 | 22/22 | 22/22 | 22/22 | 1.637,00 | 1.637,00 | +0,00 | +0 % | 1/1 (1) | nein |  |
| 01-notizen-sauber | gemma-4-31b-it | = | 70.7 | 19/19 | 100 % | 100 % | 19/19 | 19/19 | 19/19 | 19/19 | 1.176,38 | 1.176,38 | +0,00 | +0 % | 0/1 (0) | ja |  |
| 02-kuerzel-chaos | gemma-4-31b-it | = | 44.9 | – | – | – | – | – | – | – | – | – | – | – | – | – | HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later. |
| 03-diktat | gemma-4-31b-it | = | 112.7 | 23/22 | 100 % | 96 % | 21/22 | 20/22 | 21/22 | 21/22 | 1.535,75 | 1.637,00 | -101,25 | -6 % | 0/1 (0) | ja | aw-obstgehoelz: Variante null fehlt/ungültig |
| 01-notizen-sauber | gemma-4-26b-a4b-it | = | 308.8 | – | – | – | – | – | – | – | – | – | – | – | – | – | HTTP 0: Netzwerkfehler: fetch failed |
| 02-kuerzel-chaos | gemma-4-26b-a4b-it | = | 18.3 | – | – | – | – | – | – | – | – | – | – | – | – | – | Antwort unlesbar: Unexpected non-whitespace character after JSON at position 2545 (line 29 column 1) |
| 03-diktat | gemma-4-26b-a4b-it | = | 308.8 | – | – | – | – | – | – | – | – | – | – | – | – | – | HTTP 0: Netzwerkfehler: fetch failed |

## Details

### 01-notizen-sauber · gemini-3.8-flash

A8: „Kleingärtnerische Nutzung gut (KGN gut). Ausgewogener Aufwuchs mit Obstbäumen, Beerenobst, Gemüsekulturen (Erdbeeren, Rhabarber), Stauden, Rosen und Ligusterhecke. Außenanlagen mit Maschendrahtzaun, Plattenweg, Beeteinfassungen, Holzkomposter und Regentonnen vorhanden.“

### 02-kuerzel-chaos · gemini-3.8-flash

A8: „Parzelle mit Holzzaun, Türen, Rindenmulchweg, Hochbeet, Wasseranschluss sowie Insektenhotel. Guter Obst- und Beerenbaumbestand, Ziergehölze, Kirschlorbeerhecke und Rasen. Nicht bewertet werden der durchwachsene Maschendrahtzaun, der Asbestkomposter, die überhohe Thuja (6 m) und der invasive Riesenbärenklau; KGN mittel, Beete teils verwildert.“

**Abweichungen (Soll → Ist):**
- Insektenhotel: Zustand mittel → gut („Ökologisches Objekt: Insektenhotel“)
- Pflaume, Hochstamm, über 30 J.: unsicher true → false („Hochstamm als alt deklariert (über 30 J.)“)
- Kräuterbeet: Zustand gut → mittel („Kräuterbeet flächig, Zustand wegen teils verwilderter Beete mittel“)
- Tulpen/Narzissen: Zustand gut → mittel („Zwiebelblumen flächig erfasst, Zustand mittel wegen Verwilderung“)
- Rasen: Zustand gut → mittel („Rasenfläche im Gesamtkontext durchschnittlich gepflegt“)
- Kirschlorbeer-Hecke: Variante 3 → 2 („Immergrüne Hecke einfacher Art, Höhe 1,10 m liegt innerhalb der zulässigen 1,25 m“)

### 03-diktat · gemini-3.8-flash

A8: „Gepflegte Parzelle mit neuwertiger Stabgitter-Einfriedung, Plattenweg und Regentonnen. Reichhaltiger Obst-, Beeren- und Gemüseanbau sowie Buchenhecke und Blumenwiese; eine Sauerkirsche ist krank und verbleibt unbewertet, der Walnussbaum ist nach Baumschutzverordnung erfasst. KGN gut.“

**Abweichungen (Soll → Ist):**
- Johannisbeere, Busch, 5–20 J.: Zustand mittel → gut („Drei ältere Johannisbeersträucher“)

### 01-notizen-sauber · gemini-3.7-flash

A8: „Solide Außenanlagen mit Maschendrahtzaun, Plattenweg, Regentonnen und Komposter. Ausgewogener Aufwuchs mit Obstbäumen, Beerenobst, Erdbeeren, Stauden, Rosen und Ligusterhecke. KGN gut.“

### 02-kuerzel-chaos · gemini-3.7-flash

A8: „Außenanlagen mit Holzzaun, Rindenmulchweg, Wasserleitung und Hochbeet; durchwachsener Maschendrahtzaun und asbesthaltiger Komposter nicht bewertbar. Aufwuchs umfasst Obstgehölze, Beerenobst, Weinrebe, Ziersträucher, Hecke und Rasen; überhohe Thuja (ca. 6 m) sowie Riesenbärenklau (invasiv) nicht bewertbar. KGN mittel, Beete teils verwildert.“

**Abweichungen (Soll → Ist):**
- Insektenhotel: Zustand mittel → gut („Ökologisches Objekt: Insektenhotel.“)
- Pflaume, Hochstamm, über 30 J.: unsicher true → false („Hochstamm als alt beschrieben, Zustand mittel.“)
- Kräuterbeet: Zustand gut → mittel („Kräuter flächig, Beete laut Notiz teils verwildert daher Zustand mittel.“)
- Kompost aus Asbestplatten: unsicher false → true („nicht bewerten: Material Asbest; Volumen nicht angegeben.“)

### 03-diktat · gemini-3.7-flash

A8: „Neuwertige Stabgitter-Einfriedung mit Tor, Plattenweg, Regentonnen sowie Rankgerüste und Frühbeet vorhanden. Aufwuchs mit Obst-, Gemüse- und Beerenanbau, Buchenhecke und Blumenwiese; eine Sauerkirsche krank/abgestorben (nicht bewertet), geschützter Walnussbaum vorhanden. KGN gut.“

**Abweichungen (Soll → Ist):**
- Johannisbeere, Busch, 5–20 J.: Zustand mittel → gut („Drei ältere Johannisbeersträucher“)

### 01-notizen-sauber · gemini-3.6-flash

A8: „Auf der Parzelle befinden sich zweckmäßige Außenanlagen (Maschendrahtzaun mit Metalltor, Plattenweg mit Kantensteinen, Regentonnen, Holzkomposter und Rosenbogen) in durchschnittlichem Zustand. Der Aufwuchs besteht aus einem vielseitigen Obstbaumbestand, Beerenobst, Erdbeeren, Rhabarber, Stauden, Edelrosen, einer Ligusterhecke sowie Rasen. Die kleingärtnerische Nutzung ist gut.“

### 02-kuerzel-chaos · gemini-3.6-flash

Fehler: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.

### 03-diktat · gemini-3.6-flash

Fehler: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.

### 01-notizen-sauber · gemini-3.5-flash

A8: „Die Parzelle verfügt über grundlegende Außenanlagen in überwiegend mittlerem Zustand. Der reichhaltige Aufwuchs besteht aus Obstgehölzen, Beerenobst, Erdbeeren, Rhabarber, Stauden, Edelrosen, einer Ligusterhecke sowie Rasen. Die kleingärtnerische Nutzung ist gut.“

**Abweichungen (Soll → Ist):**
- Rosenbogen: unsicher false → true („Anzahl nicht angegeben, 1 Stück angenommen“)
- Stauden: Zustand mittel → gut („Staudenfläche 12 m²“)

### 02-kuerzel-chaos · gemini-3.5-flash

A8: „Die Parzelle weist Außenanlagen wie Holzzaun, Tore, Rindenmulchweg, Hochbeet und Wasserinstallationen auf. Der Aufwuchs besteht aus Obstgehölzen, Beerenobst, Weinrebe, Kräutern, Ziergehölzen, einer Kirschlorbeerhecke und Rasen. Ein durchwachsener Maschendrahtzaun, ein Komposter aus Asbest, ein Riesenbärenklau sowie eine über 4 m hohe Thuja werden nicht bewertet. KGN mittel, Beete teils verwildert.“

**Abweichungen (Soll → Ist):**
- Insektenhotel: Zustand mittel → gut („Ökologisches Objekt.“)
- Pflaume, Hochstamm, über 30 J.: unsicher true → false („Alter Hochstamm über 30 Jahre.“)
- Forsythie: unsicher false → true („Anzahl fehlt, 1 Stück angenommen.“)
- Flieder: unsicher false → true („Anzahl fehlt, 1 Stück angenommen.“)
- Clematis: unsicher false → true („Anzahl fehlt, 1 Stück angenommen.“)

### 03-diktat · gemini-3.5-flash

A8: „Gepflegte Parzelle mit neuwertiger Einfriedung, Tor und Plattenweg. Guter, vielseitiger Aufwuchs aus Obstgehölzen, Beerenobst, Gemüsekulturen, Rosen und Ziergehölzen. Eine kranke Sauerkirsche wurde nicht bewertet. KGN gut.“

**Abweichungen (Soll → Ist):**
- Johannisbeere, Busch, 5–20 J.: Zustand mittel → gut, unsicher false → true („Wuchsform nicht näher spezifiziert, Buschform angenommen“)

### 01-notizen-sauber · gemini-3.5-flash-lite

A8: „KGN gut. Die Parzelle verfügt über eine klassische Aufteilung mit Maschendrahtzaun, Plattenweg, Beeteinfassungen sowie verschiedenen Wasser- und Kompostierungsanlagen. Der Aufwuchs umfasst gut gepflegte Obstgehölze, Beerenobst, Gemüse- und Staudenkulturen sowie eine Ligusterhecke.“

**Abweichungen (Soll → Ist):**
- Rosenbogen: unsicher false → true („Anzahl fehlend, auf 1 Stueck gesetzt.“)
- Rhabarber: unsicher true → false („Rhabarberpflanzen älter als 5 Jahre.“)
- Stauden: Zustand mittel → gut („Flächige Staudenpflanzung.“)

### 02-kuerzel-chaos · gemini-3.5-flash-lite

A8: „KGN mittel, Beete teils verwildert. Die Parzelle verfügt über gemischte Einfriedungen, Wege, Wasseranschluss, diverse Obstgehölze, Beerenobst und Zierpflanzen.“

**Abweichungen (Soll → Ist):**
- Hochbeet 60 cm: Zustand mittel → gut („Hochbeet 2x1m (2 m²), 60cm hoch.“)
- Insektenhotel: Zustand mittel → gut („Ökologisches Objekt Insektenhotel.“)
- Süßkirsche, Spalier: Zustand gut → mittel („Süßkirsche Spalier mit Fragezeichen, Variante geschätzt.“)
- Himbeere, Busch: unsicher true → false („Sechs Himbeer-Sträucher.“)
- Forsythie: unsicher false → true („Ziergehölz einfache Art, Anzahl 1 angenommen.“)
- Flieder: unsicher false → true („Ziergehölz einfache Art, Anzahl 1 angenommen.“)
- Clematis: unsicher false → true („Schling- und Kletterpflanze einfache Art, Anzahl 1 angenommen.“)
- Kirschlorbeer-Hecke: unsicher false → true („Hecke Kirschlorbeer 6 m, Höhe 1,10 m (unter 1,25 m zulässig).“)
- Rasen: Zustand gut → mittel („Rasenfläche 140 m².“)
- Apfel, Halbstamm, über 30 J.: Variante 5 → 8, Zustand mittel → schlecht („nicht bewerten: Apfel Hochstamm 40J und dünn.“)
- Thuja, ca. 6 m: ID null → aw-nadelgehoelz-solitaer („nicht bewerten: Nadelgehölz mit Höhe über 4 m.“)

### 03-diktat · gemini-3.5-flash-lite

A8: „Die Parzelle zeigt eine gut gepflegte kleingärtnerische Nutzung mit Gemüseanbau, Spargel und Beerenobst. Neben einem geschützten Walnussbaum und Obstgehölzen prägen eine Buchenhecke, eine Blumenwiese sowie Zier- und Kletterpflanzen den Garten.“

**Abweichungen (Soll → Ist):**
- Regentonne 500 l: Zustand mittel → gut („Größere Regentonne mit 500 Litern.“)
- Regentonne 200 l: Zustand mittel → gut („Kleine Regentonne mit 200 Litern.“)
- Rosenbogen: Zustand mittel → gut („Rosenbogen vorhanden.“)
- Apfel, Säule, bis 4 J.: Zustand gut → sehr gut („Apfel als Säule, 3 Jahre alt.“)
- Spargel: unsicher true → false („Spargelreihe, 5 Meter lang.“)
- Japanischer Fächerahorn: unsicher false → true („Wertvolleres Ziergehölz als Strauch angenommen.“)
- Sauerkirsche, krank: ID null → aw-obstgehoelz („nicht bewerten: Baum ist krank und halb abgestorben.“)

### 01-notizen-sauber · gemini-3.1-flash-lite

A8: „Gepflegte Gartenanlage mit solidem Obstbaumbestand und ordentlichem Rasen. KGN gut.“

**Abweichungen (Soll → Ist):**
- Rosenbogen: unsicher false → true („Anzahl fehlte, auf 1 Stück gesetzt“)
- Rhabarber: unsicher true → false („Alter über 5J angenommen“)
- Stauden: Zustand mittel → gut („KGN insgesamt gut“)

### 02-kuerzel-chaos · gemini-3.1-flash-lite

A8: „KGN mittel, Beete teils verwildert. Einfriedung teils Holz, teils Maschendraht. Aufwuchs überwiegend gut bis mittel.“

**Abweichungen (Soll → Ist):**
- Insektenhotel: Zustand mittel → gut („Zustand gut angenommen.“)
- Apfel, Halbstamm, über 30 J.: Zustand mittel → schlecht („nicht bewerten: kranker/dünner Baum.“)
- Pflaume, Hochstamm, über 30 J.: unsicher true → false („Alter/Zustand alt.“)
- Süßkirsche, Spalier: Zustand gut → mittel („Variante und Zustand geschätzt.“)
- Himbeere, Busch: unsicher true → false („Zustand gut angenommen.“)
- Kräuterbeet: Zustand gut → mittel („Zustand mittel angenommen.“)
- Rasen: Zustand gut → mittel („Zustand mittel gemäß KGN-Angabe.“)
- Kompost aus Asbestplatten: unsicher false → true („nicht bewerten: Kompost aus Asbestplatten.“)
- Thuja, ca. 6 m: ID null → aw-nadelgehoelz-solitaer („nicht bewerten: Nadelgehölz über 4m Höhe.“)

### 03-diktat · gemini-3.1-flash-lite

A8: „Die Parzelle befindet sich in einem gepflegten, gut bewirtschafteten Zustand. Die kleingärtnerische Nutzung ist durch eine Vielzahl von Obstbäumen, Beerensträuchern, Gemüse- und Spargelanbau sowie Ziergehölze sehr gut gegeben.“

**Abweichungen (Soll → Ist):**
- Plattenweg: Zustand mittel → gut („Zustand aus Gesamteindruck abgeleitet.“)
- Frühbeet: Zustand mittel → gut („Zustand aus Gesamteindruck abgeleitet.“)
- Regentonne 500 l: Zustand mittel → gut („Regelmäßige Nutzung/Zustand abgeleitet.“)
- Regentonne 200 l: Zustand mittel → gut („Regelmäßige Nutzung/Zustand abgeleitet.“)
- Rosenbogen: Zustand mittel → gut („Zustand aus Gesamteindruck abgeleitet.“)
- Rankgitter am Schuppen: Zustand mittel → gut („Zustand aus Gesamteindruck abgeleitet.“)
- Johannisbeere, Busch, 5–20 J.: Zustand mittel → gut („Alter gemäß Liste als älter definiert.“)
- Spargel: unsicher true → false („Zustand aus Gesamteindruck abgeleitet.“)

### 01-notizen-sauber · gemini-3.1-flash-lite-preview

A8: „Der Garten befindet sich in einem gepflegten Zustand. Es ist eine kleingärtnerische Nutzung vorhanden.“

**Abweichungen (Soll → Ist):**
- Rosenbogen: unsicher false → true („Anzahl fehlte, auf 1 gesetzt; Zustand nicht angegeben, pauschal mittel.“)
- Rhabarber: unsicher true → false („KGN gut impliziert einen gepflegten Zustand.“)
- Stauden: Zustand mittel → gut („KGN gut impliziert einen gepflegten Zustand.“)

### 02-kuerzel-chaos · gemini-3.1-flash-lite-preview

A8: „Die Parzelle weist eine kleingärtnerische Nutzung auf, die insgesamt als mittel eingestuft wird. Die Beete sind teilweise verwildert.“

**Abweichungen (Soll → Ist):**
- Insektenhotel: Zustand mittel → gut („Ökologisches Objekt“)
- Himbeere, Busch: Zustand gut → mittel, unsicher true → false („Beerenobst, Zustand mittel“)
- Heidelbeere, Busch: Zustand gut → mittel, unsicher true → false („Beerenobst, Zustand mittel“)
- Kräuterbeet: Zustand gut → mittel („Gemischte Kräuterfläche“)
- Tulpen/Narzissen: Zustand gut → mittel („Zwiebelpflanzen flächig“)
- Forsythie: Zustand gut → mittel („Ziergehölz einfach“)
- Flieder: Zustand gut → mittel („Ziergehölz einfach“)
- Rasen: Zustand gut → mittel („Rasenfläche“)
- Apfel, Halbstamm, über 30 J.: ID aw-obstgehoelz → null, Zustand mittel → schlecht („nicht bewerten: kränklicher/dünner Baum“)
- Pflaume, Hochstamm, über 30 J.: ID aw-obstgehoelz → null, Zustand mittel → schlecht, unsicher true → false („nicht bewerten: verkrüppelter/alter Baum“)

### 03-diktat · gemini-3.1-flash-lite-preview

A8: „Die Parzelle befindet sich in einem gut bewirtschafteten Zustand mit kleingärtnerischer Nutzung. Ein krankes Sauerkirschbäumchen ist von der Bewertung ausgenommen.“

**Abweichungen (Soll → Ist):**
- Spargel: unsicher true → false
- Johannisbeere, Busch, 5–20 J.: Zustand mittel → gut

### 01-notizen-sauber · gemini-3-flash-preview

A8: „Gepflegte Parzelle mit Maschendrahtzaun, Plattenwegen und mehreren Regentonnen. Der Aufwuchs umfasst diverse Obstgehölze in verschiedenen Altersstufen, Beerenobst sowie Erdbeer- und Staudenflächen; die kleingärtnerische Nutzung ist gut.“

**Abweichungen (Soll → Ist):**
- Kantensteine: unsicher false → true („Separate Bewertung unsicher, da Kantensteine oft Bestandteil des Wegebelags sind.“)
- Rosenbogen: unsicher false → true („Anzahl fehlte, 1 angenommen; keine Zustandsangabe, daher mittel.“)
- Kirsche, Buschbaum, bis 4 J.: unsicher false → true („Anzahl fehlte, 1 angenommen.“)

### 02-kuerzel-chaos · gemini-3-flash-preview

A8: „Kleingärtnerische Nutzung insgesamt mittel, Beete teilweise verwildert. Ein Teil der Einfriedung ist durchwachsen und ein Komposter aus Asbestplatten sowie eine überhohe Thuja sind vorhanden (nicht bewertet).“

**Abweichungen (Soll → Ist):**
- Pflaume, Hochstamm, über 30 J.: unsicher true → false („Zustand alt entspricht mittel“)
- Himbeere, Busch: unsicher true → false („Busch (5-20J angenommen)“)
- Kompost aus Asbestplatten: unsicher false → true („nicht bewerten: aus Asbestplatten; Volumen geschätzt“)

### 03-diktat · gemini-3-flash-preview

A8: „Die Parzelle weist eine gute kleingärtnerische Nutzung auf. Die Einfriedung und das Tor sind neuwertig. Der Aufwuchs ist vielfältig und gepflegt, wobei ein Sauerkirschbaum aufgrund von Krankheit nicht bewertet wurde.“

### 01-notizen-sauber · gemma-4-31b-it

A8: „KGN gut. Außenanlagen teilweise alt. Aufwuchs gepflegt.“

**Abweichungen (Soll → Ist):**
- Rhabarber: unsicher true → false („Alter nicht angegeben, daher Variante 2 angenommen“)

### 02-kuerzel-chaos · gemma-4-31b-it

Fehler: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.

### 03-diktat · gemma-4-31b-it

A8: „Außenanlagen und Aufwuchs in gutem Zustand. KGN gut. Eine Sauerkirsche ist krank und wird nicht bewertet.“

**Zusätzlich/nicht zugeordnet:**
- 1 Stück Strauchrose [aw-rose#1, gut] – Strauchrosen

**Abweichungen (Soll → Ist):**
- Johannisbeere, Busch, 5–20 J.: Zustand mittel → gut („schon älter“)
- Spargel: unsicher true → false („5 Meter Reihe; Alter nicht explizit angegeben, aber meist als alt angenommen“)
- Strauchrose: Anzahl 2 → 1 („Strauchrosen“)
- Buchen-Hecke: Variante 1 → 0 („gut geschnitten“)
- Sauerkirsche, krank: ID null → aw-obstgehoelz („nicht bewerten: krank und halb abgestorben“)

**Ungültig:** aw-obstgehoelz: Variante null fehlt/ungültig

### 01-notizen-sauber · gemma-4-26b-a4b-it

Fehler: HTTP 0: Netzwerkfehler: fetch failed

### 02-kuerzel-chaos · gemma-4-26b-a4b-it

Fehler: Antwort unlesbar: Unexpected non-whitespace character after JSON at position 2545 (line 29 column 1)

### 03-diktat · gemma-4-26b-a4b-it

Fehler: HTTP 0: Netzwerkfehler: fetch failed

