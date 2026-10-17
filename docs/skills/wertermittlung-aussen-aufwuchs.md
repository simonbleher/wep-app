---
name: wertermittlung-aussen-aufwuchs
description: Überträgt eine Aufnahmeliste (Word/Notizen) einer Kleingartenparzelle in die Blätter „Außenanlagen“ und „Aufwuchs I/II“ und bewertet jede Position nach der Berliner Wertermittlungsrichtlinie (BewRL, Stand 01.01.2023).
---

## Wann verwenden
Der Nutzer lädt eine Aufnahmeliste hoch (Word-Datei, Notizen, Foto) mit Außenanlagen (Zäune, Türen, Wege, Kantensteine, Hochbeete, Regentonnen, Kompost, Rankgerüste …) und Aufwuchs (Obstbäume, Beerenobst, Stauden, Rosen, Hecken …) und möchte sie in die Tabellen eintragen und bewerten lassen. Auch bei /wertermittlung-aussen-aufwuchs.

## Grundregeln
- **Eine Zeile = eine Sache.** Nichts zusammenfassen (z. B. zwei Türen verschiedener Breite = zwei Zeilen; Erdbeeren im Beet und im Hochbeet = zwei Zeilen). Gleiche Dinge mit gleichem Preis dürfen als Anzahl in eine Zeile (z. B. „3 Stück Rosen“).
- **Keine Notizen/Kommentare** in Zellen. Ist etwas unklar oder angenommen (Menge geschätzt, Art/Alter unklar, Kürzel nicht lesbar) → die **ganze Zeile A:L gelb** (#FFFF00) markieren und im Chat-Bericht kurz nennen.
- Nur die Eingabezellen beschreiben: A (Anzahl), B (Einheit), C (Beschreibung), K (Einzelpreis). Die Formeln in L (`=ROUND(A*K,2)`) und die Summe in L46 nicht anfassen.
- Zahlenformat Anzahl: `#,##0.00`; ganze Zahlen ≥ 100 als `0` (sonst „####“ in der schmalen Spalte).
- Unsinnige/Test-Angaben (z. B. Fläche, die nicht zur Sache passt) nicht verwenden, im Bericht nennen.
- Kopf der Aufnahmeliste (Adresse/Parzelle) mit „Formalien“ vergleichen; Abweichung nur melden, nicht ändern.

## Schritt 1: Quellen lesen
- Word: `python-docx` im code_execution (Absätze + Tabellen).
- Richtlinie (PDF): `pdftotext -layout` per bash_code_execution (pdfplumber kann fehlschlagen); Abschnitte II (Außenanlagen, S. 12–15) und III (Aufwuchs, S. 16–18) lesen.
- Blätter „Außenanlagen“ (Positionen ab Zeile 15, bis 45), „Aufwuchs I“ (ab Zeile 18, bis 45), „Aufwuchs II“ (ab Zeile 10, Übertrag in L9) mit execute_office_js lesen (formulas A8:L46). Bereits vorhandene Einträge nicht überschreiben – dahinter weiterschreiben.
Fertig, wenn: jede Position der Aufnahmeliste einer BewRL-Kategorie zugeordnet ist.

## Schritt 2: Bewerten (BewRL 01.01.2023)
Höchstwerte („bis“) je nach Zustand/Alter senken. Außenanlagen: mind. 3 % Alterswertminderung pro Jahr; Alter unbekannt → pauschal ca. 50 % des Höchstwerts. Aufwuchs: nach Alter/Pflegezustand innerhalb der Spanne.

**Außenanlagen (Höchstwerte)**
| Position | Einheit | bis € |
|---|---|---|
| Wasserleitung außen | m | 5 |
| Zapfventil / Absperrventil | Stück | 7,50 |
| Rückflussverhinderer | Stück | 12 |
| Regenwasserbehälter bis 200 l / 300 l / 500 l | Stück | 15 / 22 / 30 |
| Regenwassersammelanlage bis 1000 l | Stück | 150 |
| Wege: Mulch/Tenne · Holz/Rasengitter · Stein | m² | 4,50 · 8 · 10 |
| Beeteinfassung (Kantensteine) | m | 2 |
| Zaun Maschendraht · Holz · Metall/Stabgitter | m | 20 · 35 · 40 |
| Türanlage einflügelig | Stück | 200 |
| Stützmauer · Stufe | m² · Stück | 20 · 10 |
| Kompostanlage | m³ | 40 |
| Rankgerüst Bogen · flächig | Stück · m² | 50 · 8 |
| Frühbeet · Hochbeet (≥ 50 cm, nicht gemauert) | m² | 25 · 100 |
| Insektenhotel/Benjeshecke/Totholz | Stück | 200 |
Nicht bewerten: Asbest-Kompost/-Einfassungen, Flechtzäune/Stacheldraht, durchwachsene Zäune, Teiche aus Beton/Metall.

**Aufwuchs (Höchstwerte)**
| Position | bis 4 J. | 5–30 J. | 30+ J. |
|---|---|---|---|
| Obst Buschbaum | 25 | 75 | 85 |
| Obst Halbstamm | 35 | 85 | 150 |
| Obst Hochstamm | 45 | 95 | 170 |
| Obst Säule / Spalier | 35 / 70 | 85 / 105 | 85 / 180 |
Beerenobst Busch 6 (≤ 4 J.) / 15 (5–20 J.); Stamm 16 / 35. Weinrebe 15 / 35; Erdbeere 2–4 €/m²; Rhabarber 1,50–2,50; Kiwi 10 / 20. Ziergehölz einfach 25 / wertvoll 65; Kletterpflanze einfach (Wilder Wein) 15 / wertvoll 35; Nadelgehölz Solitär 65; Rosen: Wild 2, Beet/Edel/Strauch 10, Kletter 15, Hochstamm 20; Stauden/Kräuter/Zwiebeln 15 €/m² (Solitär 10); Gräser 10 €/m²; Hecke Laub 5/15 €/m, immergrün 10/35 €/m (nur ≤ 1,25 m hoch, ≤ 0,70 m breit); Rasen 0,50, Wiese 2,50 €/m² (max. 100 m²).
Nicht bewerten/entfernen: kranke/verkrüppelte Bäume, invasive Arten, Nadelgehölze > 2,5/4 m Endhöhe; geschützte Bäume 1 €.

Richtwerte aus der ersten Anwendung: alte, dünne Hochstämme 30+ J. ca. 80 €, guter Hochstamm 30+ ca. 120 €, junge kleine Bäume ca. 20 €, einfache Stauden 5 €/m², Lavendel 10 €/m², Rosen 8 €, Hibiskus 20 €.
Nicht eindeutige Formen (z. B. „Viertelstamm“ → als Buschbaum gewertet) oder fehlende Mengen (Heidelbeere ohne Anzahl → 1) gelb markieren.
Fertig, wenn: jede Zeile Anzahl, Einheit, Beschreibung und Einzelpreis hat.

## Schritt 3: Eintragen
- Außenanlagen → „Außenanlagen“ ab erster freier Zeile ≥ 15.
- Aufwuchs → „Aufwuchs I“ ab erster freier Zeile ≥ 18; ist Zeile 45 voll → weiter in „Aufwuchs II“ ab Zeile 10.
- Reihenfolge: Außenanlagen (Einfriedung/Türen, Wege/Einfassungen, Beete, Wasser, Rankgerüste, Kompost); Aufwuchs (Obstbäume, Beerenobst, weitere Kulturen, Stauden/Kräuter, Rosen, Ziergehölze, Kletterpflanzen, Hecken, Rasen).
- In A8 (Beschreibungsfeld, nicht fett) kurz zusammenfassen: was vorhanden ist, Alter/Zustand, angewandter Abschlag; bei Aufwuchs auch die kleingärtnerische Nutzung (z. B. „KGN gut“).
- Rechenausdrücke in A sind erlaubt, wenn die Liste so angibt (z. B. `=8+5*17+12`).
Fertig, wenn: alle Positionen eingetragen sind und die Summen L46 rechnen.

## Schritt 4: Prüfen
Bereich A8:L46 per `getImage()` rendern: keine „####“, keine Notizen (`sheet.notes` leer), gelbe Zeilen nur bei offenen Punkten, Summen plausibel; Übertrag Aufwuchs II L9 = Aufwuchs I L46.
Fertig, wenn: das Bild sauber ist.

## Schritt 5: Bericht (kurz, Deutsch)
Summen je Blatt; Liste der gelben Zeilen mit der jeweiligen Annahme/Frage; nicht bewertete Positionen mit Grund (BewRL-Stelle); Abweichungen Kopfdaten ↔ Formalien.
