# Fehlerbericht zur WEP-Vorlage des BV Pankow

- **Geprüfte Datei:** `docs/WEP_Vorlage.xlsx` (Stand der Datei: 2026-10-16, SHA-256 `29309bdc6cc47deb…`)
- **Fachliche Grundlage:** Wertermittlungsrichtlinie für Kleingärten (BewRL), Landesverband Berlin der Gartenfreunde, gültig ab 01.01.2023 (`docs/Richtlinie.pdf`)
- **Geprüft am:** 29.10.2026
- **Prüfskript:** `tools/vorlage-pruefen.py` (Version 1.0) – prüft auch jede neue Fassung der Vorlage erneut
- **Korrekturvorschlag:** `docs/WEP_Vorlage_Korrekturvorschlag.xlsx` (geänderte Zellen gelb, mit Kommentar; das Original bleibt unverändert)


## 1. Zusammenfassung für den BV

Wir haben die Excel-Vorlage Zelle für Zelle durchgesehen, alle Formeln gelesen und mit erfundenen Beispielen (ohne echte Personendaten) durchgerechnet. Jede Zahl haben wir mit einer eigenen Handrechnung verglichen und die Texte und Werte gegen die Richtlinie gehalten. Alles, was wir gefunden haben, steht in der Tabelle in Abschnitt 2 – mit der Zelle, was dort steht, was daran falsch ist und wie es richtig heißen muss.

**Ergebnis: 46 Funde.** 16 davon ändern einen Betrag im Protokoll, 15 betreffen falsche oder fehlende Angaben, 8 die Bedienung und 7 sind Schönheitsfehler. 27 Funde sind sicher (nachgerechnet oder an der Datei ablesbar), 7 sind sehr wahrscheinlich, bei 12 brauchen wir Ihre Entscheidung (Abschnitt 3: „Bitte BV fragen“) – das sind keine bestätigten Fehler, sondern Punkte, bei denen die Richtlinie mehrdeutig ist oder der BV festlegen muss, was gelten soll.

| Auswirkung | sicher | wahrscheinlich | bitte BV fragen | zusammen |
|---|---|---|---|---|
| falscher Betrag | 12 | 2 | 2 | 16 |
| falsche oder fehlende Angabe | 2 | 4 | 9 | 15 |
| Bedienung | 7 | 1 | 0 | 8 |
| kosmetisch | 6 | 0 | 1 | 7 |
| **zusammen** | **27** | **7** | **12** | **46** |


### Die fünf wichtigsten Funde

**1. F02 – Schuppen wird in „Baulichkeiten insgesamt“ doppelt gezählt** (Baulichkeiten, K81)

- *Wirkung:* Im Testfall T1 (Laube, zwei Anbauten, Schuppen …) zeigt die Vorlage 12.199,00 € statt 11.869,90 €; davon 325,20 € allein durch den doppelt gezählten Schuppen.
- *So sehen Sie es selbst:* Blatt „Baulichkeiten“, Zelle K81 anklicken: In der Bearbeitungsleiste steht =K52+K61+K71+K75+K77+K79. K61 ist der Übertrag von K53 (=SUMME(K14:K52)), und diese Summe enthält K52 (Schuppen) schon. Einen Schuppen eintragen: K81 ist um dessen Wert höher als K53 + K71 + K75 + K77 + K79.
- *Korrektur:* =K61+K71+K75+K77+K79

**2. F05 – Laubenvorplatz b) „angebaut“: Altersabzug fest 100 %** (Baulichkeiten, G68 (E66, H66))

- *Wirkung:* Im Testfall T4 (angebauter Vorplatz, 6 m²) bleibt der Wert bei 0,00 € statt 1.287,00 €.
- *So sehen Sie es selbst:* Blatt „Baulichkeiten“, Zelle G68 anklicken: Dort steht die Zahl 100, keine Formel. Unter „2.3 b) angebaut“ Güte „hochwertig“, Altersminderung 3 %, Alter 8 Jahre, Fläche 6 m² eintragen: K71 bleibt 0,00 €.
- *Korrektur:* =MIN(100;E66*H66)   (Abzug in %, höchstens 100; wie beim Gewächshaus E42)

**3. F03 – Überdachter Laubenvorplatz a) „integriert“: Wert geht verloren** (Baulichkeiten, C64)

- *Wirkung:* Im Testfall T3 (integrierter Vorplatz, 6 m²) bleibt der Wert bei 0,00 € statt 1.064,46 €.
- *So sehen Sie es selbst:* Blatt „Baulichkeiten“, „2.3 a) integriert“: 275 € bei NHK und 6 m² bei F71 eintragen (Güte bei b) auf „ohne“ lassen): K71 bleibt 0,00 €. Zelle C64 anklicken: Sie ist leer.
- *Korrektur:* =I63

**4. F12 – Beispielwerte in der leeren Vorlage** (Baulichkeiten F104, G104, H105, I19, I28, I37; Beseitigungskosten F12:F21, H12, J12:J21, A26; Mängelliste F44)

- *Wirkung:* Die leere Vorlage zeigt als Gesamtbetrag −400,00 €.
- *So sehen Sie es selbst:* Leere Vorlage öffnen, Blatt „Deckbl UPV“: E25 zeigt 250,00 €, E26 150,00 €, E28 −400,00 €.
- *Korrektur:* Zellen leeren (Mengen/Preise/Texte); ggf. nur Zeile 12 „Einbehalt Fäkalienabfuhr“ als Hinweis stehen lassen

**5. F01 – Anbau A2 rechnet mit dem Ergebnis von Anbau A1** (Baulichkeiten, C33)

- *Wirkung:* Im Testfall T1 rechnet Anbau A2 mit 172,80 € statt 168,90 €.
- *So sehen Sie es selbst:* Blatt „Baulichkeiten“, Zelle C33 (Anbau A2) anklicken: =$H$23. Bei A1 steht in C24 richtig =$H$23, bei A2 muss in C33 der Bezug auf H32 stehen (die eigene Zeile „Mängelabzug“).
- *Korrektur:* =$H$32


### Was jetzt zu tun ist

- **Formelfehler beheben** (F01–F05, F10, F11): Die Datei `WEP_Vorlage_Korrekturvorschlag.xlsx` enthält die Änderungen, jede gelb markiert und mit Kommentar. Sie kann als Vorlage dienen oder zeigt, was in der eigenen Vorlage zu ändern ist.
- **Rückfragen beantworten** (Abschnitt 3): Dort stehen die Punkte, bei denen die Richtlinie mehrdeutig ist oder die Vorlage etwas anderes tut als die App.
- **Leere Vorlage säubern** (F12): Beispielwerte löschen, damit ein neues Protokoll nicht mit Abzügen beginnt.
- **Neue Fassung prüfen:** `python tools/vorlage-pruefen.py NEUE_DATEI.xlsx` zeigt je Fund „VORHANDEN“ oder „behoben“ (Anhang D).


### Was in Ordnung ist

- Die versteckte Tabelle „Tabelle1“ stimmt mit der Richtlinie überein: Restnutzungstabelle aller drei Bauklassen (Seite 10), NHK 2015 je Bauklasse (Seite 5) und Abrisskosten je m³ (Seite 19). Jede Zahl wurde einzeln verglichen.
- Die Rechenkette Laube / Anbau A1 / Schuppen (Mängelabzug → Altersabzug → Baupreisindex → Betrag) rechnet bei richtigen Eingaben genau wie die Handrechnung.
- Die Summen der Blätter Außenanlagen, Aufwuchs I und Aufwuchs II sowie der Übertrag von Aufwuchs I nach II sind richtig, auch mit allen Zeilen voll.
- Die Verweise vom Deckblatt auf die Anlagen 1 bis 4 zeigen auf die richtigen Zellen; im sichtbaren Teil der Vorlage gibt es keinen Fehlerwert wie #BEZUG!.
- Feste Zahlen in Formeln: 2.200 € (Kanal), 24 m² und 6 % (versiegelte Fläche) passen zur Richtlinie; Auffälligkeiten stehen in F08 und F29.


## 2. Alle Funde

Die Nummern gelten auch im Prüfskript und im Korrekturvorschlag (dort steht die Nummer am Anfang jedes Kommentars). **Gewissheit:** *sicher* = an der Datei ablesbar oder nachgerechnet; *wahrscheinlich* = sehr wahrscheinlich ein Fehler, bitte bestätigen; *bitte BV fragen* = kein Fehler, solange der BV nicht entschieden hat (siehe Abschnitt 3). **Formeln** stehen in der Schreibweise des deutschen Excel (Funktionsnamen deutsch, Semikolon als Trennzeichen); die Datei selbst speichert sie englisch.


### falscher Betrag (16)

| Nr. | Blatt | Zelle(n) | Was steht da | Was ist falsch | Beleg (Richtlinie / Testfall) | Korrekturvorschlag | Gewissheit |
|---|---|---|---|---|---|---|---|
| **F01** | Baulichkeiten | C33 | =$H$23 (Wert von A1 nach Mängelabzug) | **Anbau A2 rechnet mit dem Ergebnis von Anbau A1.** In der Rechenkette von Anbau A2 zeigt C33 auf die Zeile von A1 (H23) statt auf die eigene (H32). A2 wird deshalb mit den NHK und dem Mängelabzug von A1 weitergerechnet; nur der Altersabzug ist der eigene. | Vergleich der vier Bauteil-Blöcke (Laube/A1/A2/Schuppen sind gleich aufgebaut); Testfall T1.<br>*Prüfung:* C33 enthält =$H$23, soll H32. Testfall T1: Anbau A2 (E35) 172,80 €, Handrechnung 168,90 €. | =$H$32 | sicher |
| **F02** | Baulichkeiten | K81 | =K52+K61+K71+K75+K77+K79 | **Schuppen wird in „Baulichkeiten insgesamt“ doppelt gezählt.** K61 ist der Übertrag der Zwischensumme K53 =SUMME(K14:K52); die enthält den Schuppen (K52) schon. K81 addiert K52 noch einmal. Bei jedem Protokoll mit Schuppen ist die Summe um den Schuppenwert zu hoch (und damit der Gesamtbetrag auf dem Deckblatt). | Testfall T1.<br>*Prüfung:* K81 enthält =K52+K61+K71+K75+K77+K79; K53 (= K61) enthält K52 bereits. Testfall T1: Baulichkeiten insgesamt (K81) 12.199,00 €, Handrechnung 11.869,90 €; Zwischensumme K53 8.499,80 €, Handrechnung 8.495,90 €. | =K61+K71+K75+K77+K79 | sicher |
| **F03** | Baulichkeiten | C64 | C64 ist leer (I64 und E64 rechnen damit) | **Überdachter Laubenvorplatz a) „integriert“: Wert geht verloren.** Zwischen I63 (NHK nach Mängelabzug) und I64 (Altersabzug) fehlt die Verbindung. C64 bleibt leer, I64 ist 0, der integrierte Laubenvorplatz wird mit 0 € bewertet, wenn b) „angebaut“ nicht ausgefüllt ist. | Testfall T3.<br>*Prüfung:* C64 ist leer, I64 und E64 rechnen damit. Testfall T3 (275 €/m², 6 m²): Wert des Vorplatzes K71 0,00 €, Handrechnung 1.064,46 €. | =I63 | sicher |
| **F04** | Beseitigungskosten | K21 | K21 hat keine Formel (K12:K20 und K22:K23 haben sie) | **Zeile 9 (Abschnitt 1) fehlt in der Summe.** Menge × Einzelpreis × Faktor der 9. Zeile werden nicht berechnet und fehlen in K24, damit auch in den Beseitigungskosten Bau auf dem Deckblatt (E26): Abzug zu niedrig. | Testfall T2.<br>*Prüfung:* Zellen ohne Formel in K12:K23 / K34:K44: K21. Testfall T2: Summe Anlage 4 Abschnitt 1 (K24) 737,65 €, Handrechnung 774,79 €. | =RUNDEN(F21*H21*J21;2)  (wie alle anderen Zeilen) | sicher |
| **F05** | Baulichkeiten | G68 (E66, H66) | G68 = 100 (Zahl, gesperrt); die Felder „Altersminderung pro Jahr“ (E66) und „Alter“ (H66) werden von keiner Formel gelesen | **Laubenvorplatz b) „angebaut“: Altersabzug fest 100 %.** Der Altersabzug des angebauten Vorplatzes ist fest 100 %. I68 ist deshalb immer 0, C70 fällt auf den Wert von a) zurück: ein angebauter Vorplatz wird nie bewertet, was auch immer in Güte, Mängel, Alter eingetragen wird. Beim Gewächshaus ist der entsprechende Abzug richtig als Formel gelöst (E42 = I40*G40). | Testfall T4; Vergleich mit Gewächshaus (E42); Richtlinie S. 11 (Alterswertminderung mindestens 3 % jährlich).<br>*Prüfung:* G68 enthält 100; E66 und H66 werden von keiner Formel gelesen. Testfall T4 (hochwertig 175 €/m², 3 % × 8 Jahre, 6 m²): K71 0,00 €, Handrechnung 1.287,00 €. | =MIN(100;E66*H66)   (Abzug in %, höchstens 100; wie beim Gewächshaus E42) | wahrscheinlich |
| **F06** | Baulichkeiten | C75 (F75, K75) | =C74*3 | **Abwassergrube: Altersabzug kann über 100 % steigen (negativer Wert).** Der Abzug wächst linear ohne Obergrenze: ab 34 Jahren ist er über 100 %, der Wert der Grube wird negativ und mindert die Baulichkeiten. Die Regel „Tanks und monolithische Betongruben nach 16 Jahren nicht weiter abschreiben“ (Hinweis M104) ist in keiner Formel umgesetzt. | Richtlinie S. 13–14; Testfall T5.<br>*Prüfung:* C75 enthält =C74*3. Testfall T5 (Alter 40 J., 6 m³): Altersabzug 120 %, Wert K75 −564,00 €. | =MIN(100;C74*3)  (linear) – oder nach BV-Entscheidung F29: =(1-0,97^C74)*100 | sicher |
| **F07** | Baulichkeiten | H79 (K79) | =G78/100*3 | **Kanalanschluss: Altersabzug kann über 100 % steigen (negativer Wert).** Wie F06: ab 34 Jahren ist H79 über 100 %, der Kanalanschluss wird negativ bewertet. | Richtlinie S. 14; Testfall T5.<br>*Prüfung:* H79 enthält =G78/100*3. Testfall T5 (Alter 40 J., 2.000 €): Abzug 1.2, Wert K79 −400,00 €. | =MIN(1;G78*3%)  – oder nach BV-Entscheidung F29: =1-0,97^G78 | sicher |
| **F08** | Baulichkeiten | E79, K79 | E79 =WENN(G78>0;MIN(2200;C79);0); K79 =WENN(C79>74;RUNDEN(E79-E79*H79;2);0) | **Kanalanschluss: unklare Bedingungen „Alter > 0“ und „Kosten > 74“.** Ein im Jahr der Wertermittlung gebauter Anschluss (Alter 0) wird mit 0 € bewertet, obwohl er nach der Richtlinie den vollen Erstellungspreis (bis 2.200 €) bringt. Kosten bis 74 € ergeben immer 0 €; woher die 74 stammen, ist nicht erkennbar. | Richtlinie S. 14 (Erstellungspreis bis 2.200 €, 3 % jährlich); Testfälle T6, T7.<br>*Prüfung:* E79 enthält =WENN(G78>0;MIN(2200;C79);0); K79 enthält =WENN(C79>74;RUNDEN(E79-E79*H79;2);0). Testfall T6 (Alter 0, 2.000 €): K79 0,00 € (Handrechnung 2.000,00 €); T7 (Alter 10, 70 €): K79 0,00 € (Handrechnung 49,00 €, linear gerechnet). | E79 =WENN(G78="";0;MIN(2200;C79)); K79 =RUNDEN(E79-E79*H79;2) | bitte BV fragen |
| **F09** | Tabelle1 → Baulichkeiten | Tabelle1 D64:D83, E44:E83; Baulichkeiten E15, E24, E33, E50 | Die Restnutzungstabelle endet bei Bauklasse IV nach 40 Jahren, bei II/III nach 60 Jahren; darüber sind die Zellen leer | **Restnutzungsjahre jenseits der Tabelle ergeben 0 % Altersabzug.** Wer mehr Restnutzungsjahre einträgt (z. B. 45 bei Bauklasse IV), bekommt statt des Abzugs von 10 % (letzter Wert) 0 %: Der Betrag ist stillschweigend viel zu hoch. Es erscheint weder Fehler noch Warnung. | Richtlinie S. 10 (Tabelle endet bei 40/60/80 Jahren; S. 9: bei mangelfreiem Zustand bis 20 Jahre); Testfall T5.<br>*Prüfung:* Tabelle1: Spalte ohne Werte nach dem Tabellenende (Bauklasse IV ab 41 J., II/III ab 61 J.): IV, II/III. Testfall T5: Restnutzungsjahre 61 (Bauklasse II) → Altersabzug E24 = 0 %, 41 (Bauklasse IV) → E33 = 0 % (Richtlinie: Tabelle endet bei 10 %). | Tabelle1 D64:D83 und E44:E83 mit 10 füllen (letzter Tabellenwert) – oder in E15 usw. mit MIN(…;Tabellenende) begrenzen | wahrscheinlich |
| **F10** | Deckbl UPV | E23 | =MAX('Aufwuchs I'!L46;'Aufwuchs II'!L46) | **Aufwuchs: MAX() statt Wert aus Aufwuchs II.** Aufwuchs II enthält die Summe von Aufwuchs I als Übertrag, ist also immer die Gesamtsumme. MAX() liefert aber den größeren der beiden Werte: Steht in Aufwuchs II ein Abzug (negativer Preis), gewinnt Aufwuchs I und der Abzug fehlt. | Testfall T8.<br>*Prüfung:* E23 enthält =MAX('Aufwuchs I'!L46;'Aufwuchs II'!L46). Testfall T8 (Aufwuchs I 100 €, Aufwuchs II mit Abzug: 80 €): E23 100,00 €, Handrechnung 80,00 €. | ='Aufwuchs II'!L46 | sicher |
| **F11** | Beseitigungskosten | K12:K23, K34:K44 | =(F12*H12*J12) | **Zeilensummen nicht auf Cent gerundet.** Alle anderen Blätter runden die Zeilensumme (=RUNDEN(A*K;2)). Hier nicht: Bei Faktoren wie 150 % entstehen halbe Cent (z. B. 45,225 €). Angezeigt wird gerundet, gerechnet mit dem Rest, die Summe kann um 1 Cent von der Summe der angezeigten Zeilen abweichen. | Testfall T8.<br>*Prüfung:* Formeln ohne RUNDEN: 22 von 23 Zeilen. Testfall T8 (3 × 10,05 € × 150 %): K34 = 45,225 € (Handrechnung 45,23 €), Summe K45 = 90,45 €. | =RUNDEN(F12*H12*J12;2) in allen 23 Zeilen | sicher |
| **F12** | Baulichkeiten, Beseitigungskosten, Mängelliste | Baulichkeiten F104, G104, H105, I19, I28, I37; Beseitigungskosten F12:F21, H12, J12:J21, A26; Mängelliste F44 | 5 m³ × 50 € „nicht beräumt“, 150 € Fäkalienabfuhr, 1/2/3 m² „nicht berechnete Baufläche“, Begründungstext, 0,05 Mängelabzug | **Beispielwerte in der leeren Vorlage.** Die leere Vorlage ist nicht leer: 5 m³ × 50 € „nicht beräumt“ (250 €), 150 € Fäkalienabfuhr, 1/2/3 m² „nicht berechnete Baufläche“, ein Begründungstext zu bitumenhaltigen Stoffen und 5 % Mängelabzug in der Mängelliste (angezeigt als „0“). Wer sie nicht löscht, zieht Abzüge ab, die es nicht gibt. Das Deckblatt zeigt in der leeren Vorlage −400,00 €. | Testfall T0.<br>*Prüfung:* Vorbelegt: Baulichkeiten!F104 = '5'; Baulichkeiten!G104 = '50'; Baulichkeiten!H105 = '150'; Baulichkeiten!I19 = '1'; Baulichkeiten!I28 = '2'; Baulichkeiten!I37 = '3'; Beseitigungskosten!H12 = '150'; Mängelliste!F44 = '0.05'; Beseitigungskosten!A26 = 'bitumenhaltige Stoffe sind ent'. Testfall T0 (leere Vorlage): Gesamtbetrag mit Abzügen (Deckblatt E28) = −400,00 €. | Zellen leeren (Mengen/Preise/Texte); ggf. nur Zeile 12 „Einbehalt Fäkalienabfuhr“ als Hinweis stehen lassen | sicher |
| **F13** | Baulichkeiten | K77 (Auswahlliste) | Datenüberprüfung K77: Liste „-100“ | **Abzug „nicht geleerte Abwassergrube“: Liste bietet −100 € statt −150 €.** Die Richtlinie sagt: Bei nicht geleerten Abwassersammelanlagen ist die Bewertung um 150 € zu senken. Die Vorlage bietet nur −100 € an; H105 zeigt dagegen 150 €. | Richtlinie S. 14.<br>*Prüfung:* Auswahlliste K77: "-100". | Liste auf „-150“ ändern | sicher |
| **F14** | Baulichkeiten | E63 (Auswahlliste) | Datenüberprüfung E63: „0,275,225,175“ | **Laubenvorplatz a): Liste enthält 225 €, die Richtlinie nicht.** Die Richtlinie kennt für Laubenvorplätze bis 275 € (verlängertes Dach), bis 175 € (hochwertig angebaut) und bis 80 € (einfach angebaut). 225 € kommt nicht vor. | Richtlinie S. 11.<br>*Prüfung:* Auswahlliste E63: "0,275,225,175". | Liste „0,275“ für a) integriert; die Werte 175/80 gehören zu b) | bitte BV fragen |
| **F15** | Baulichkeiten, Mängelliste | E14, E23, E32, E49 (G63, G67); Mängelliste F5:F44, F46 | Mängel-Prozente werden von Hand in E14/E23/E32/E49 eingetragen (Zahl = Prozent), in G67 als Bruchteil (0,1 = 10 %), in der Mängelliste ebenfalls als Bruchteil | **Mängelabzug: nicht verknüpft, keine Obergrenze, uneinheitliche Einheit.** Die Mängelliste hat „Abzug konkret“ und eine Summe, die Baulichkeiten lesen sie aber nicht: Dieselbe Zahl muss doppelt (und in anderer Einheit) eingegeben werden. 0,1 in E14 bedeutet 0,1 %, nicht 10 %. Es gibt keine Obergrenze: Die Höchstwerte der Mängeltabelle summieren sich auf 120 %; bei Mängel über 100 % wird der NHK-Betrag negativ. | Richtlinie S. 6–8 (Abzug maximal je Bauteil); Testfall T5.<br>*Prüfung:* Eingabezellen ohne Grenzwert-Prüfung: E14, E23, E32, E49; G67 erwartet einen Bruchteil, E14 Prozent. Testfall T5 (Mängel 120 %): NHK nach Mängelabzug H49 = -53, Betrag E52 = −81,28 €. | Datenüberprüfung 0–100 für E14/E23/E32/E49; Verweis aus der Mängelliste (Summe × 100) | sicher |
| **F16** | Außenanlagen | J3 | =(E3-24)/100*6 | **Versiegelbare Fläche kann negativ oder ungerundet sein.** Bei kleiner oder fehlender Parzellenfläche erscheint ein negativer Wert (−1,44 m² in der leeren Vorlage, −0,24 m² bei 20 m²); keine Rundung. Die Regel selbst stimmt mit der Richtlinie überein (6 % der Fläche ohne 24 m²), gilt aber nur, wenn die Laube genau 24 m² hat („bzw. genehmigte bebaute Grundfläche“). | Richtlinie S. 14 (Wege- und Platzbefestigung); Testfall T0, T8.<br>*Prüfung:* J3 enthält =(E3-24)/100*6. Testfall T8 (Parzelle 20 m²): J3 = -0.24 m²; T0 (leer): -1.44 m². | =MAX(0;RUNDEN((E3-24)/100*6;2)) | sicher |


### falsche oder fehlende Angabe (15)

| Nr. | Blatt | Zelle(n) | Was steht da | Was ist falsch | Beleg (Richtlinie / Testfall) | Korrekturvorschlag | Gewissheit |
|---|---|---|---|---|---|---|---|
| **F17** | Beseitigungskosten | M29 | „Aussenhecke auf zul. Höhe (1,80m) schneiden“ | **Textbaustein „Aussenhecke auf zul. Höhe (1,80m)“ widerspricht der Richtlinie.** Die Richtlinie lässt Hecken höchstens 1,25 m hoch zu; dieselbe Seite der Vorlage (A51, M32) nennt 1,25 m. | Richtlinie S. 14 (Einfriedungen) und S. 18 (Hecken); Vorlage A51, M32.<br>*Prüfung:* M29: „Aussenhecke auf zul. Höhe (1,80m) schneiden“; A51 und M32 nennen 1,25 m. | „Außenhecke auf zul. Höhe (1,25 m) schneiden“ | sicher |
| **F18** | Mängelliste | A5:D43, E-Spalte | siehe Beleg | **Mängeltabelle weicht von der Richtlinie ab.** Es fehlen Mängel der Richtlinie (u. a. Schornstein, Moose und Flechten, Risse bei Decken, Belag verschlissen, Fliesen fehlerhaft); „Feuchtigkeit in der Dachkonstruktion“ steht zweimal; „unzulässige Höhe der Laube“ steht nicht in der Richtlinie; bei Sonderabfall fehlt „bei Weiternutzung“. | Richtlinie S. 6–8.<br>*Prüfung:* Fehlende Positionen (6): Dach: Schornstein fehlerhaft; Dach: Schornstein ohne Kehrbescheinigung; Dach: Moose und Flechten; Decken: Risse; Fußboden: Belag verschlissen; Ausbau innen: Fliesen fehlerhaft. Nicht in der Richtlinie (1): Dach: unzulässige Höhe der Laube. Doppelt (1): Dach: Feuchtigkeit in der Dachkonstruktion. Abzug-maximal-Werte weichen ab: keine. | Zeilen ergänzen/streichen laut Beleg; Prozent-Höchstwerte sind richtig | sicher |
| **F19** | Mängelliste ↔ Baulichkeiten | F46; Baulichkeiten E14 … | Mängelliste hat nur „Abzug konkret“ und die Summe F46 | **Mängelabzug ist nicht begründet und nicht verknüpft.** Die Richtlinie verlangt, dass die Senkung der NHK „rechnerisch dargestellt und erläutert“ wird, die Mängel „genau zu bezeichnen“ sind und die Abzüge „textlich zu erläutern“. Es gibt keine Spalte für Erläuterung/Begründung, die Summe landet nicht im Blatt Baulichkeiten (siehe F15), das Zahlenformat der Summe zeigt „0“. | Richtlinie S. 4 und S. 8.<br>*Prüfung:* Kein Verweis von Baulichkeiten auf die Mängelliste; Zahlenformat der Summe F46: „0“. | Spalte „Erläuterung“ ergänzen; E14 =Mängelliste!F46*100 (Laube) bzw. Teil-Summen je Bauteil | wahrscheinlich |
| **F20** | Baulichkeiten | H13, I13 (und I22, I31, I48), C13 | Felder „Baujahr“ und „Restnutzungsjahre“ ohne Zusatz | **Keine Begründung der Restnutzungsdauer, kein Nachweis „Baujahr nachgewiesen/geschätzt“.** Die Richtlinie verlangt, die Restnutzungsdauer „im Einzelnen zu begründen“ und das Jahr der Errichtung nachzuweisen oder als geschätzt zu kennzeichnen. Die Restnutzungsjahre sind außerdem reine Handeingabe (keine Rechnung aus dem Baujahr). | Richtlinie S. 9.<br>*Prüfung:* Im Blatt Baulichkeiten kein Feld/Hinweis zu Begründung der Restnutzungsdauer oder Nachweis des Baujahrs. | Feld „Begründung / Nachweis Baujahr“ je Bauteil | bitte BV fragen |
| **F21** | Baulichkeiten | – | „Keller“ kommt nur in einem Beseitigungs-Textbaustein vor | **Kein Bewertungsblock für Kellerräume.** Die Richtlinie lässt vertraglich zulässige Kellerräume bewerten (Innenmaße, Bauklasse II, Restnutzungsjahre nicht über denen der Laube). Dafür gibt es keinen Block. | Richtlinie S. 11 c).<br>*Prüfung:* Im Blatt Baulichkeiten kommt „Keller“ nicht vor. | Block „2.x Keller“ oder Hinweis, den Keller als Anbau (A1/A2) einzutragen | bitte BV fragen |
| **F22** | Baulichkeiten | A82:K100 | freies Textfeld | **Baubeschreibung ohne die Pflichtangaben der Richtlinie.** Die Richtlinie verlangt für die Baubeschreibung Angaben zu Wasseranschluss, WC, Trockentoilette und Elektrizitätsanschluss (auch „fehlt“). Das Textfeld nennt sie nicht. | Richtlinie S. 24.<br>*Prüfung:* In der Baubeschreibung (A82:K100) kein Raster für Wasser/WC/Trockentoilette/Elektro. | Vier Zeilen vorbelegen: Wasser / WC / Trockentoilette / Elektro: vorhanden – fehlt | wahrscheinlich |
| **F23** | Baulichkeiten | F74, E76, A76:D76 | F74 = 470 (Zahl), E76 nur „fehlt“ | **Abwasser: Grundwert, Sanierung und Tank-Regel nicht abgebildet.** Die Richtlinie kennt drei Grundwerte (Schachtringe 180, sanierte Anlagen 370, Kunststoff/monolithisch 470) und die Altersregel 16 Jahre für Tanks und Betongruben. Vorbelegt ist nur 470; ein Feld für Anlagenart und Sanierungsdatum fehlt. | Richtlinie S. 13–14.<br>*Prüfung:* Fehlt: Auswahl Grundwert 470/370/180, Sanierungsdatum, 16-Jahre-Regel für Tanks/monolithische Gruben. | Auswahlliste „470,370,180“ an F74; Zusatzzeile Anlagenart/Sanierungsdatum | wahrscheinlich |
| **F24** | Baulichkeiten | F101, I38 | F101 =A17+A26+A35+A52 | **„Bewertete bebaute Fläche“ ohne Laubenvorplatz und ohne Prüfung gegen 24 m².** Ein überdachter Laubenvorplatz zählt zur Laube und darf zusammen mit ihr 24 m² nicht überschreiten. F71 fehlt in der Summe. Weder F101 noch I38 werden weiterverwendet oder geprüft (besser als Hinweis, nicht als Sperre). | Richtlinie S. 3 (Nr. 2, 3) und S. 11 d).<br>*Prüfung:* F101 enthält =A17+A26+A35+A52; I38 und F101 werden nirgends weiterverwendet, keine Prüfung gegen 24 m². | =A17+A26+A35+A52+F71 und Hinweiszelle „über 24 m²“ | wahrscheinlich |
| **F25** | Baulichkeiten | D41, F41, A40:K44 | D41 leer, F41 = 10 % Mängel (fest) | **Gewächshaus: NHK 160 € nicht vorbelegt, Grenzen fehlen.** Die Richtlinie nennt NHK 160 €/m², höchstens 12 m² Grundfläche und 2,20 m Firsthöhe. Die Vorlage nennt die Grenzen nicht. Der Mängelabzug von 10 % ist als Vorbelegung ohne Grundlage. | Richtlinie S. 11.<br>*Prüfung:* D41 = None (Richtlinie 160 €/m²); Grenzen 12 m² / 2,20 m Firsthöhe stehen nicht im Blatt; F41 (Mängel) fest 0.1. | D41 = 160 vorbelegen, Hinweis „max. 12 m², 2,20 m First“ | bitte BV fragen |
| **F26** | Baulichkeiten | Schuppenblock A47:K53 | Altersabzug nur aus der Restnutzungstabelle | **Schuppen: Mindestabzug 3 % jährlich nicht geprüft.** Für „sonstige bauliche Anlagen“ (Gewächshaus, Schuppen, Keller, Laubenvorplatz) verlangt die Richtlinie „mindestens 3 % jährlich“. Beim Schuppen rechnet die Vorlage nur mit der Restnutzungstabelle der Bauklasse, die bei hoher Restnutzung weniger abzieht. | Richtlinie S. 11.<br>*Prüfung:* Fachfrage an den BV (Richtlinie S. 11: „bei allen Anlagen mindestens 3 % jährlich“); nicht automatisch prüfbar. | Entscheidung des BV: Tabelle oder 3 %/Jahr (größerer Abzug) | bitte BV fragen |
| **F27** | Außenanlagen, Aufwuchs I/II | Spalten A–L | Spalten: Anzahl, Einheit, Art, Einzelpreis, Gesamtpreis | **Keine Spalte für Alter/Zustand, keine Hinweise auf Höchstwerte.** Die Richtlinie verlangt für alle Außenanlagen eine Alterswertminderung von mindestens 3 % jährlich und Abschläge je Zustand; die Vorlage hat dafür kein Feld, der Abzug steckt unsichtbar im Einzelpreis. Höchstwerte, Mengengrenzen (Rasen 100 m², Hecke 1,25 m) und die Pauschalen (Wasseranschluss 500 €) stehen nicht im Blatt. | Richtlinie S. 12 und S. 16–18.<br>*Prüfung:* Spaltenüberschriften Außenanlagen: 'An- zahl Maß- einheit Auflistung Außenanlagen - Art Entschädigungswert Einzelpreis Gesamtpreis'; Aufwuchs analog. | Spalten „Alter/Zustand“ und „Höchstwert lt. Richtlinie“ ergänzen oder bewusst weglassen (BV) | bitte BV fragen |
| **F28** | Baulichkeiten | H7, I7 | H7 = 179,2 mit Beschriftung „für 2025“ | **Baupreisindex „für 2025“ ist veraltet?.** Die Richtlinie nimmt den Index des IV. Quartals des Vorjahres für das ganze Folgejahr. Für Wertermittlungen im Jahr 2026 braucht es den Wert vom Herbst 2025; die Vorlage trägt noch „für 2025“. Der Wert kann nicht gegen die Statistik geprüft werden (kein Netz in der Prüfung). | Richtlinie S. 3 (Nr. 6) und S. 11; Amt für Statistik Berlin-Brandenburg.<br>*Prüfung:* H7 enthält 179.2, Beschriftung I7: „für 2025“; heute ist 2026. | Jährlich aktualisieren; Quelle/Quartal in I7 nennen | bitte BV fragen |
| **F29** | Baulichkeiten | C75, D75, H79 (und AnlIV Blatt 3 B49) | C75 =C74*3 (linear), H79 =G78/100*3 | **Altersabzug 3 % je Jahr: linear oder vom Restwert?.** Die Vorlage zieht 3 % vom Grundwert je Jahr ab (16 Jahre = 48 %). Die App rechnet nach Vorgabe des Wertermittlers „vom Restwert“ (16 Jahre = 38,57 %, PR #95). Die Richtlinie sagt „von den Bis-Werten ausgehend … jährlicher Abzug von 3 %“ – das lässt sich beides lesen. Die Rechnung der App und die der Vorlage weichen damit ab. | Richtlinie S. 13 (Abwassersammelanlagen) und S. 14 (Kanalisationsanschlüsse).<br>*Prüfung:* C75 enthält =C74*3, H79 enthält =G78/100*3 (linear: Alter × 3 %); die App rechnet (1 − 0,97^Alter), PR #95. | BV legt fest; dann dieselbe Formel in Vorlage und App | bitte BV fragen |
| **F30** | Baulichkeiten, Beseitigungskosten | K77, H105, Beseitigungskosten Zeile 12 | K77 (−100 per Liste), H105 = 150 (angezeigt, nicht verrechnet), Beseitigungskosten H12 = 150 (vorbelegt) | **„Nicht geleerte Grube“ an drei Stellen, 150 €/100 € und Gefahr des doppelten Abzugs.** Die Richtlinie nennt den Betrag zweimal: „Bewertung um 150 € senken“ (S. 14) und „Abfuhrkosten pauschal 150 €“ als Beseitigungskosten (S. 20). In der Vorlage gibt es drei Stellen mit unterschiedlichen Beträgen; H105 wird nirgends gerechnet. | Richtlinie S. 14 und S. 20.<br>*Prüfung:* H105 enthält 150 wird nirgends verrechnet; K77 bietet nur −100 € an (Auswahlliste); Beseitigungskosten H12 = 150. | BV legt fest, ob beide Abzüge gewollt sind; H105 mit K77 verbinden | bitte BV fragen |
| **F31** | Beseitigungskosten | M30 | „Beetflächen auf 10% Parzellenfläche erhöhen“ | **Textbaustein „Beetflächen auf 10 % Parzellenfläche erhöhen“ ohne Fundstelle.** In der Richtlinie steht 10 % nur bei Hochbeeten (S. 15). Ob der Baustein einen anderen Hintergrund hat (Gartenordnung, Kleingartengesetz: ein Drittel), ist nicht erkennbar. | Richtlinie S. 15, S. 21 („Kosten für das Anlegen von Beeten“).<br>*Prüfung:* M30: „Beetflächen auf 10% Parzellenfläche erhöhen“ – in der Richtlinie nicht zu finden. | Quelle nennen oder Text ändern | bitte BV fragen |


### Bedienung (8)

| Nr. | Blatt | Zelle(n) | Was steht da | Was ist falsch | Beleg (Richtlinie / Testfall) | Korrekturvorschlag | Gewissheit |
|---|---|---|---|---|---|---|---|
| **F32** | alle Eingabeblätter | Blattschutz | Formalien H23: „Die Blätter sind geschützt …“; im Dateiinhalt steht bei den meisten Blättern ein Schutz-Element ohne Schalter („sheet=1“ fehlt), beim Deckblatt gar keins | **Blattschutz ist nicht aktiv, obwohl das Formalien-Blatt ihn verspricht.** Alle Formelzellen sind frei überschreibbar; ein versehentlich überschriebener Wert fällt nicht auf. Nur das versteckte Blatt Tabelle1 ist (mit Passwort) geschützt. | Dateiinhalt (xl/worksheets/sheet*.xml); Formalien H23–H27.<br>*Prüfung:* Blattschutz nicht aktiv bei: Formalien, Deckbl UPV , Baulichkeiten, Mängelliste, Außenanlagen, Aufwuchs I, Aufwuchs II, Beseitigungskosten (Formalien H23 verspricht ihn). | Blattschutz ohne Passwort wieder einschalten (nach Korrektur von F33/F34) | sicher |
| **F33** | Formalien, Außenanlagen, Beseitigungskosten, Baulichkeiten | Formalien E17; Außenanlagen A8:L11, B15:B18, C15:J45; Beseitigungskosten B12:K44; Baulichkeiten I19, I28, I37 | Zellschutz „gesperrt“ an Zellen, in die der Wertermittler schreiben muss | **Eingabefelder sind als „gesperrt“ markiert.** Sobald der Blattschutz (F32) wieder eingeschaltet wird, kann man die Vorgangs-Nr., die Beschreibung und die Art der Außenanlagen, alle Beseitigungspositionen und die „nicht berechnete Baufläche“ nicht mehr eintragen. | Zellschutz je Zelle (Eigenschaft „Gesperrt“).<br>*Prüfung:* Gesperrt (wären bei aktivem Blattschutz nicht bedienbar): Formalien!E17, Außenanlagen!B15, Außenanlagen!C15, Außenanlagen!C20, Außenanlagen!A8, Beseitigungskosten!B12, Beseitigungskosten!F12, Beseitigungskosten!H12, Beseitigungskosten!J12, Beseitigungskosten!F34, Beseitigungskosten!H34, Beseitigungskosten!J34, Beseitigungskosten!B34, Baulichkeiten!I19, Baulichkeiten!I28, Baulichkeiten!I37. | Diese Zellen vor dem Einschalten des Schutzes entsperren | sicher |
| **F34** | Baulichkeiten, Mängelliste | Baulichkeiten J35, J44, F101; Mängelliste E1, E2 | Formeln in entsperrten Zellen | **Formelzellen sind als „nicht gesperrt“ markiert.** Auch bei aktivem Blattschutz könnte man diese Formeln überschreiben. | Zellschutz je Zelle.<br>*Prüfung:* Formelzellen, die nicht gesperrt sind: Baulichkeiten!J35, Baulichkeiten!J44, Baulichkeiten!F101, Mängelliste!E1, Mängelliste!E2. | Diese Zellen sperren | sicher |
| **F35** | Baulichkeiten | G12, G21, G30, G47; I13, I22, I31, I48 | Auswahl- und Zahlenfelder ohne Prüfmeldung bei Löschen/Text/negativ | **Leere/ungültige Auswahl führt zu #NV im ganzen Protokoll.** Wird die Bauklasse-Auswahl gelöscht (Entf-Taste) oder stehen die Restnutzungsjahre als Text/negativ da, wird die Rechenkette zu #NV; der Fehler läuft bis K81 und auf das Deckblatt. Eine Fehlermeldung gibt es nicht. | Testfälle T5, T9.<br>*Prüfung:* Auswahlfelder G12/G21/G30/G47 und Restnutzungsjahre I13/I22/I31/I48 ohne Eingabeprüfung für leer/Text/negativ. Testfall T5 (Typ leer): K53 = #N/A, K81 = #N/A; T9 (Restnutzungsjahre „zwanzig“): E15 = #N/A, Deckblatt E21 = #N/A. | Datenüberprüfung für I13, I22, I31, I48 (ganze Zahl 0–80); bei leerer Typ-Auswahl WENNFEHLER in Tabelle1 D88/F88/B90 (und die drei weiteren Blöcke) | sicher |
| **F36** | Deckbl UPV, alle Köpfe | z. B. C7:C10, C11, E13:E17 | =Formalien!$E$6 ohne Abfrage | **Leere Formalien erscheinen als „0“ und als Datum 1899/1900.** Verweise auf leere Zellen liefern 0. Auf allen Blättern stehen „0“ statt leer, und Datumsfelder zeigen „30.12.1899“ (Excel: 00.01.1900). | Testfall T0, Druckvorschau.<br>*Prüfung:* Deckblatt C7 enthält =Formalien!$E$6 (ohne WENN-Abfrage). Testfall T0 (leer): C7 zeigt 0 statt leer; das Datum C11 ist der Wert 0 (= 00.01.1900). | =WENN(Formalien!$E$6="";"";Formalien!$E$6); beim Datum ebenso | sicher |
| **F37** | Mängelliste | F5:F44, F46 | Format „0“ in Zellen, die Bruchteile (0,05) erwarten | **Zahlenformat „0“ zeigt Prozent als 0.** Eine Eingabe 0,05 (5 %) erscheint als „0“, die Summe F46 ebenso; ohne Blick in die Eingabezeile kann man nicht sehen, was eingetragen ist. | Zahlenformat der Zellen.<br>*Prüfung:* Zahlenformate der Spalte „Abzug konkret“: ['0']; Eingaben wie 0,05 erscheinen als „0“. | Format „0 %“ | sicher |
| **F38** | Baulichkeiten, Formalien, Aufwuchs II | Seitenumbruch Zeile 54; Druckbereiche | Baulichkeiten: Skalierung 86 %, manueller Umbruch nach Zeile 54; Formalien und Aufwuchs II ohne Druckbereich | **Druckbild: leere Seite, fehlende Druckbereiche.** Seite 1 der Baulichkeiten ist rechnerisch länger als die Druckseite; die Zeile 54 („Seite 2“) landet auf einer eigenen, fast leeren Seite (in LibreOffice sichtbar; bitte in der Excel-Seitenansicht prüfen). Formalien druckt die Hinweise rechts mit und kommt auf 2–3 Seiten; Aufwuchs II hat keinen Druckbereich. | Berechnung Zeilenhöhen × Skalierung; PDF-Ausdruck der Vorlage über LibreOffice.<br>*Prüfung:* Baulichkeiten Seite 1 (Zeilen 1–54): 745 pt Inhalt, 729 pt nutzbar → Zeile 54 („Seite 2“) rutscht auf eine leere Seite; Formalien: kein Druckbereich; Aufwuchs II: kein Druckbereich | Skalierung 82 % oder „Auf eine Seite“; Druckbereiche setzen | wahrscheinlich |
| **F39** | versteckte Blätter | 10 versteckte Blätter (Anl IV Schuppen/Dach, Deckbl-Varianten, Beseitigungsauflagen, Bewertung …, Tabelle1) | z. B. „Anl IV Schuppen“ 167, „Anl IV Dach“ 165 Zellen mit #BEZUG!; „Beseitigungsauflagen“ H22 =SUMME(E22*G33) (falsche Zeile) | **Versteckte Altblätter mit über 300 Fehlerwerten (#BEZUG!).** Die Blätter sind versteckt und werden nicht gedruckt, sind aber in der Datei und täuschen Fehler vor (z. B. bei Suche nach Fehlerwerten). Die Deckblatt-Varianten verweisen auf zerstörte Bezüge; Beseitigungsauflagen rechnet in H22 mit der falschen Zeile. | Bestandsaufnahme (alle Formeln mit openpyxl gelesen).<br>*Prüfung:* 10 versteckte Blätter; Zellen mit #BEZUG! je Blatt: Anl IV Schuppen (versteckt) 167, Anl IV Dach (versteckt) 165, Deckbl UPV neu (Sicherheit) (versteckt) 2, Deckbl UPV  (alt) (versteckt) 1, Deckbl Auftragsgutachten (versteckt) 2, Tabelle1 (versteckt) 3; Beseitigungsauflagen H22 =SUMME(E22*G33). | Blätter löschen (Original behalten) oder reparieren; ungenutzte Namen entfernen | sicher |


### kosmetisch (7)

| Nr. | Blatt | Zelle(n) | Was steht da | Was ist falsch | Beleg (Richtlinie / Testfall) | Korrekturvorschlag | Gewissheit |
|---|---|---|---|---|---|---|---|
| **F40** | Baulichkeiten | J52, B19, B28, B37, E34, H7-Bezüge, H42, N79:N80 | J52 =$B$21 („Wert BT A1“ beim Schuppen); B19 „L“, B28 „A1“, B37 „A2“ als Text; E34 =$E$16; E16/E25/E43/E51 =H7/100 ohne $; H42 = 5; N79 „Summe K56:K74“ mit anderer Formel | **Falsche Beschriftung beim Schuppen, feste Kopien statt Verweise, Reste.** Die Beschriftung neben dem Schuppenwert (J52) zeigt das Kürzel von A1 statt „S oder U“. Ändert jemand die Bezeichnung (B12, B21, B30), bleiben die Kopien in B19/B28/B37 alt. E34 holt den Index von der Laube statt aus H7. Die 5 in H42 hat keine Funktion, steht aber auf dem Ausdruck neben „% Altersabzug“; der Rest in N79/N80 beschreibt einen anderen Bereich, als er rechnet. | Formelvergleich der vier Bauteilblöcke; Ausdruck Blatt 1.<br>*Prüfung:* B19 = 'L' statt =B12; B28 = 'A1' statt =B21; B37 = 'A2' statt =B30; J52 enthält =$B$21 (zeigt beim Schuppen das Kürzel von A1; soll =$B$47 sein); E34 enthält =$E$16 (Muster der anderen Bauteile: =H7/100); H7 in E16/E25/E43/E51 ohne $ (beim Kopieren verschiebt sich der Bezug); H42 enthält 5 ohne Funktion; N79/N80: Rest-Summe „Summe K56:K74“ (Formel =SUMME(K61:K77)) | J52 =$B$47; B19 =B12, B28 =B21, B37 =B30; E34 =$H$7/100; H42, N79:N80 löschen | sicher |
| **F41** | Tabelle1 | D103, F5, Namen | D103: 22-fach verschachteltes WENN, das mit =J19:J109 endet; F5 =-I10; ungenutzte Namen (BKL.Beschreibung, Jürgen, rose, ungeprüft, uwe.2) | **Versteckte Hilfstabelle mit kaputtem Rest.** Funktioniert, solange eine Auswahl aus der Liste getroffen ist; alle anderen Bauteile nutzen SVERWEIS. Der Rest kann bei Änderungen der Liste zu falschen Werten führen. | Formelvergleich Tabelle1 D88/D93/D98/D103.<br>*Prüfung:* D103: verschachtelte WENN-Formel endet mit kaputtem Bezug (J19:J109); F5 enthält =-I10; ungenutzte Namen: BKL.Beschreibung, Jürgen, rose, ungeprüft, uwe.2 | D103 =SVERWEIS(D105;uwe;2) wie die anderen Bauteile; Namen löschen | sicher |
| **F42** | mehrere | siehe Beleg | u. a. „horizentral“, „maßgrecht“, „Gladichtung“, „enstsprechend“, „Sepzember“, „entfernene“, „Anfalll“, „Aussenhecke“, „lotgerecht“, „nich ordnungsgemäß“, „unddicht“; „wir.“ in Formalien H6:H19 | **Tippfehler und Reste in Beschriftungen.** Rechtschreibfehler in Mängelliste, Beseitigungskosten, Baulichkeiten; die „wir.“ in Formalien sind Reste (vermutlich verlorene Aufzählungszeichen). | Textsuche in allen Zellen.<br>*Prüfung:* 13 Stellen: Baulichkeiten!L62 „Anfalll“; Mängelliste!D6 „horizentral“; Mängelliste!C19 „lotgerecht“; Mängelliste!D26 „maßgrecht“; Mängelliste!C34 „Gladichtung“; Mängelliste!C36 „nich ordnungsgemäß“; Mängelliste!C38 „unddicht“; Beseitigungskosten!M12 „enstsprechend“; Beseitigungskosten!M25 „enstsprechend“; Beseitigungskosten!M29 „Aussenhecke“; Beseitigungskosten!A32 „entfernene“; Beseitigungskosten!A46 „Sepzember“; Formalien H6, H7, H8, H10, H15, H16, H17, H19 „wir.“ | Texte korrigieren (siehe Beleg) | sicher |
| **F43** | Beseitigungskosten | A21:A24, A42:A44 | „9.“ steht zweimal (A42, A43); „12.“ steht in der Summenzeile (A24) | **Nummerierung fehlerhaft.** Abschnitt 2 hat die Nummern 1–9, 9, 10. In Abschnitt 1 sind die Positionen 1–11 nummeriert, die „12.“ steht in der Summenzeile. | Blattansicht.<br>*Prüfung:* Nummern in A34:A44: 1., 2., 3., 4., 5., 6., 7., 8., 9., 9., 10.; A24 trägt „12.“ in der Summenzeile. | A43 „10.“, A44 „11.“, A24 leeren | sicher |
| **F44** | Skizze Außenanlage-Aufwuchs | A1 | „Skizze – Baulichkeiten“ | **Überschrift lautet „Skizze – Baulichkeiten“.** Das Blatt ist für Außenanlagen und Aufwuchs gedacht; die Überschrift ist von „Skizze Bau“ kopiert. | Blattansicht.<br>*Prüfung:* Skizze Außenanlage-Aufwuchs A1: „Skizze – Baulichkeiten“. | „Skizze – Außenanlagen und Aufwuchs“ | sicher |
| **F45** | Baulichkeiten | L62 | „… unter E58 bzw. B62 …“ | **Hinweis zum Laubenvorplatz nennt falsche Zellen.** Die Felder heißen E63 (NHK a) und B67 (Güte b); „Anfalll“ ist ein Tippfehler. | Blattansicht.<br>*Prüfung:* L62 nennt „E58 bzw. B62“; die Felder sind E63 und B67. | „… unter E63 bzw. B67 bei einem Anfall von a) oder b) …“ | sicher |
| **F46** | Deckblatt, Formalien, Abkürzungen | Deckbl A34/A38, Formalien I16/I17, Abkürzungen C12, C38 u. a. | Widerspruch „direkt an die Wertermittler“ (A34) und „an den Bezirksverband“ (A38); „Dichtheits-/Dichtigkeitsgutachten“; „Aufwuchs 2 ggf. 3“ statt „Aufwuchs I/II“; „Anlage 4 Blatt 1“ vs. „Seite 1 und 2“; „Anlage IV“ vs. „Anlage 4“; U = Unterstand/Toilettenhaus; „RiLW“ nennt die Richtlinie anders als das Deckblatt | **Widersprüchliche Texte und uneinheitliche Begriffe.** Der Unterpächter erfährt zwei verschiedene Stellen für den Widerspruch (die Richtlinie sagt: der Bezirksverband bearbeitet ihn, S. 23). Die übrigen Begriffe sind uneinheitlich. | Richtlinie S. 23 (Einspruch); Textvergleich.<br>*Prüfung:* Deckblatt A34: Widerspruch „direkt an die Wertermittler“; A38: „an den Bezirksverband“. | Eine Stelle festlegen, Begriffe vereinheitlichen | bitte BV fragen |


## 3. Bitte BV fragen

Hier braucht es eine Entscheidung des BV: Die Richtlinie ist nicht eindeutig, die Vorlage tut etwas anderes als die App, oder wir wissen nicht, was gewollt ist. Solange nicht entschieden ist, behandeln wir diese Punkte nicht als bestätigte Fehler.

| Nr. | Thema | Frage |
|---|---|---|
| **F05** | Laubenvorplatz b) „angebaut“: Altersabzug fest 100 % | Soll der angebaute Laubenvorplatz (b) wie das Gewächshaus mit „Altersminderung pro Jahr × Alter“ gerechnet werden (Vorschlag G68 =MIN(100;E66*H66))? |
| **F08** | Kanalanschluss: unklare Bedingungen „Alter > 0“ und „Kosten > 74“ | Woher kommt die Grenze „Kosten > 74 €“ im Kanalanschluss (K79), und soll ein Anschluss mit Alter 0 den vollen Erstellungspreis bringen? |
| **F09** | Restnutzungsjahre jenseits der Tabelle ergeben 0 % Altersabzug | Was soll gelten, wenn die Restnutzungsjahre über das Ende der Tabelle gehen (Bauklasse IV über 40, II/III über 60 Jahre)? Vorschlag: 10 % wie der letzte Tabellenwert. |
| **F14** | Laubenvorplatz a): Liste enthält 225 €, die Richtlinie nicht | Warum bietet die Liste für den integrierten Laubenvorplatz 225 € an? Die Richtlinie kennt 275 / 175 / 80 €. |
| **F18** | Mängeltabelle weicht von der Richtlinie ab | Sollen die fehlenden Mängel der Richtlinie (Schornstein, Moose und Flechten, Risse bei Decken, Belag verschlissen, Fliesen) in die Mängelliste, und ist „unzulässige Höhe der Laube“ gewollt? |
| **F20** | Keine Begründung der Restnutzungsdauer, kein Nachweis „Baujahr nachgewiesen/geschätzt“ | Soll das Blatt Baulichkeiten Felder für die Begründung der Restnutzungsdauer und „Baujahr nachgewiesen/geschätzt“ bekommen (Richtlinie S. 9)? |
| **F21** | Kein Bewertungsblock für Kellerräume | Wie werden Kellerräume eingetragen (als Anbau A1/A2, oder soll es einen eigenen Block geben)? |
| **F25** | Gewächshaus: NHK 160 € nicht vorbelegt, Grenzen fehlen | Soll das Gewächshaus mit NHK 160 € vorbelegt werden und die Grenzen (12 m², 2,20 m First) im Blatt stehen? Woher kommen die 10 % Mängelabzug? |
| **F26** | Schuppen: Mindestabzug 3 % jährlich nicht geprüft | Gilt für Schuppen der Mindestabzug von 3 % je Jahr (Richtlinie S. 11) zusätzlich zur Restnutzungstabelle? |
| **F27** | Keine Spalte für Alter/Zustand, keine Hinweise auf Höchstwerte | Sollen Außenanlagen und Aufwuchs Spalten für Alter/Zustand bekommen (Mindestabzug 3 % je Jahr, Richtlinie S. 12)? |
| **F28** | Baupreisindex „für 2025“ ist veraltet? | Welcher Index gilt für Wertermittlungen 2026 – der Wert des IV. Quartals 2025? In H7 steht 179,2 „für 2025“. |
| **F29** | Altersabzug 3 % je Jahr: linear oder vom Restwert? | Wird der Altersabzug von Abwassergrube und Kanal linear (Alter × 3 %, 16 Jahre = 48 %) oder vom Restwert gerechnet (16 Jahre = 38,57 %, so rechnet die App)? |
| **F30** | „Nicht geleerte Grube“ an drei Stellen, 150 €/100 € und Gefahr des doppelten Abzugs | Gilt die Absenkung bei nicht geleerter Grube (150 €, S. 14) zusätzlich zum Einbehalt Fäkalienabfuhr (150 €, S. 20), oder ist einer von beiden gemeint? |
| **F31** | Textbaustein „Beetflächen auf 10 % Parzellenfläche erhöhen“ ohne Fundstelle | Auf welche Regel stützt sich „Beetflächen auf 10 % Parzellenfläche erhöhen“? |
| **F32** | Blattschutz ist nicht aktiv, obwohl das Formalien-Blatt ihn verspricht | Soll der Blattschutz (ohne Passwort) wieder eingeschaltet werden? Dann müssen vorher F33 und F34 behoben sein. |
| **F46** | Widersprüchliche Texte und uneinheitliche Begriffe | An wen geht der Widerspruch – an die Wertermittler (Deckblatt A34) oder an den Bezirksverband (A38; Richtlinie S. 23)? |


## Anhang A – Testfälle (alle Zahlen erfunden)

Die Eingaben wurden in eine Kopie der Vorlage geschrieben, mit LibreOffice neu berechnet und mit einer unabhängigen Handrechnung (Python, Excel-Rundung) verglichen. Das Original wurde nicht verändert. „Vorlage“ ist das Ergebnis der Vorlage, „Handrechnung“ das richtige Ergebnis.

| Fall | Eingabe |
|---|---|
| **T0** | leere Vorlage ohne Eingaben |
| **T1** | typischer Fall: Laube, Anbau A1, Anbau A2, Schuppen, Gewächshaus, Grube 10 J., Kanal 10 J. |
| **T2** | alle Zeilen voll: Außenanlagen 31, Aufwuchs I 28, Aufwuchs II 36, Beseitigung 12 + 11 Zeilen |
| **T3** | Laubenvorplatz a) integriert, 275 €/m² bis, 6 m² |
| **T4** | Laubenvorplatz b) angebaut, hochwertig 175 €/m², 3 %/Jahr × 8 Jahre, 6 m² |
| **T5** | Randfälle: Auswahl leer, Restnutzungsjahre 61 (III) und 41 (IV), Mängel 120 %, Grube/Kanal 40 Jahre |
| **T6** | Kanal erstellt im Jahr der Wertermittlung (Alter 0), Kosten 2.000 € |
| **T7** | Kanal Alter 10, Kosten 70 € |
| **T8** | Aufwuchs I 100 €, Aufwuchs II mit Abzug −20 €; Beseitigung 3 × 10,05 € × 150 %; Parzelle 20 m² |
| **T9** | Restnutzungsjahre als Text, negativ und mit Komma (7,5) |

| Fall | Zelle | Was | Vorlage | Handrechnung | Ergebnis |
|---|---|---|---|---|---|
| T0 | Deckbl UPV!E28 | Gesamtbetrag mit Abzügen (leere Vorlage) | −400,00 € | 0,00 € | ✘ weicht ab |
| T1 | Baulichkeiten!E17 | Wert Laube | 5.419,00 € | 5.419,00 € | ✔ gleich |
| T1 | Baulichkeiten!E26 | Wert Anbau A1 | 518,40 € | 518,40 € | ✔ gleich |
| T1 | Baulichkeiten!E35 | Wert Anbau A2 | 172,80 € | 168,90 € | ✘ weicht ab |
| T1 | Baulichkeiten!E52 | Wert Schuppen | 325,20 € | 325,20 € | ✔ gleich |
| T1 | Baulichkeiten!K44 | Gewächshaus 10 m² | 2.064,40 € | 2.064,40 € | ✔ gleich |
| T1 | Baulichkeiten!K75 | Abwassergrube 6 m³, 10 Jahre (linear, 30 %) | 1.974,00 € | 1.974,00 € | ✔ gleich |
| T1 | Baulichkeiten!K79 | Kanalanschluss 2.000 €, 10 Jahre (linear, 30 %) | 1.400,00 € | 1.400,00 € | ✔ gleich |
| T1 | Baulichkeiten!K53 | Zwischensumme Baulichkeiten | 8.499,80 € | 8.495,90 € | ✘ weicht ab |
| T1 | Baulichkeiten!K81 | Baulichkeiten insgesamt | 12.199,00 € | 11.869,90 € | ✘ weicht ab |
| T1 | Baulichkeiten!F101 | Bewertete bebaute Fläche | 28 m² | 28 m² | ✔ gleich |
| T2 | Außenanlagen!L46 | Außenanlagen insgesamt (31 Zeilen) | 689,28 € | 689,28 € | ✔ gleich |
| T2 | Aufwuchs I!L46 | Aufwuchs I (28 Zeilen) | 471,64 € | 471,64 € | ✔ gleich |
| T2 | Aufwuchs II!L46 | Aufwuchs II einschließlich Übertrag (36 + 28 Zeilen) | 1.383,74 € | 1.383,74 € | ✔ gleich |
| T2 | Beseitigungskosten!K24 | Beseitigung Bau, Summe (12 Zeilen) | 737,65 € | 774,79 € | ✘ weicht ab |
| T2 | Beseitigungskosten!K45 | Beseitigung Außenanlagen, Summe (11 Zeilen) | 1.226,95 € | 1.226,96 € | ✘ weicht ab |
| T2 | Deckbl UPV!E28 | Gesamtbetrag mit Abzügen | 108,42 € | 71,27 € | ✘ weicht ab |
| T3 | Baulichkeiten!K71 | Laubenvorplatz a) integriert | 0,00 € | 1.064,46 € | ✘ weicht ab |
| T4 | Baulichkeiten!K71 | Laubenvorplatz b) angebaut | 0,00 € | 1.287,00 € | ✘ weicht ab |
| T6 | Baulichkeiten!K79 | Kanal Alter 0, 2.000 € | 0,00 € | 2.000,00 € | ✘ weicht ab |
| T7 | Baulichkeiten!K79 | Kanal Alter 10, 70 € | 0,00 € | 49,00 € | ✘ weicht ab |
| T8 | Deckbl UPV!E23 | Aufwuchs (Aufwuchs II enthält einen Abzug) | 100,00 € | 80,00 € | ✘ weicht ab |
| T8 | Beseitigungskosten!K34 | Beseitigung 3 × 10,05 € × 150 % | 45,225 € | 45,23 € | ✘ weicht ab |
| T8 | Außenanlagen!J3 | versiegelbare Fläche bei 20 m² Parzelle | −0,24 m² | 0 m² | ✘ weicht ab |
| T9 | Baulichkeiten!E33 | Altersabzug bei 7,5 Restnutzungsjahren (Bauklasse IV; Tabelle: 7 Jahre) | 82,4 % | 82,4 % | ✔ gleich |

**Fehlerwerte nach der Neuberechnung** (alle Zellen der sichtbaren Blätter, #NV, #WERT!, #BEZUG!, #DIV/0! …): keine in T0, T1, T2, T3, T4, T6, T7, T8; Fehlerwerte in T5 (18), T9 (21) (Randfälle F35).

**Randfälle ohne Handrechnung** (Beobachtung): T5 Bauteil-Auswahl leer → K53 = #N/A, K81 = #N/A. Restnutzungsjahre 61 (Bauklasse II) → Altersabzug 0 %; 41 (Bauklasse IV) → 0 %. Mängel 120 % → Betrag −81,28 €. Grube und Kanal 40 Jahre → −564,00 € und −400,00 €. T9 Restnutzungsjahre „zwanzig“ → E15 = #N/A, −3 → E24 = #N/A.


## Anhang B – Bestandsaufnahme

| Blatt | Formeln | verbundene Zellen | Auswahllisten | Druckbereich | Blattschutz |
|---|---|---|---|---|---|
| Formalien | 0 | 13 | 0 | – | aus |
| Deckbl UPV | 18 | 48 | 0 | $A$1:$G$45 | nicht vorhanden |
| Baulichkeiten | 144 | 81 | 8 | $A$1:$K$109 | aus |
| Mängelliste | 4 | 34 | 0 | $A$1:$F$48 | aus |
| Außenanlagen | 39 | 46 | 0 | $A$1:$L$48 | aus |
| Aufwuchs I | 35 | 45 | 0 | $A$1:$L$48 | aus |
| Aufwuchs II | 44 | 50 | 0 | – | aus |
| AnlIV (Blatt 3)ASG (versteckt) | 10 | 11 | 0 | – | aus |
| Anl IV Schuppen (versteckt) | 179 | 108 | 3 | $A$1:$K$124 | aus |
| Anl IV Dach (versteckt) | 177 | 106 | 3 | $A$1:$K$116 | aus |
| Deckbl UPV neu (Sicherheit) (versteckt) | 25 | 33 | 0 | – | aus |
| Deckbl UPV  (alt) (versteckt) | 23 | 27 | 0 | – | aus |
| Deckbl Auftragsgutachten (versteckt) | 26 | 34 | 0 | – | aus |
| Beseitigungsauflagen (versteckt) | 25 | 14 | 0 | – | nicht vorhanden |
| Bewertung Aufwuchs (versteckt) | 37 | 45 | 0 | – | nicht vorhanden |
| Bewertung Außenanlagen (versteckt) | 33 | 3 | 0 | – | nicht vorhanden |
| Beseitigungskosten | 30 | 80 | 0 | $A$2:$K$61 | aus |
| Skizze Bau | 7 | 9 | 0 | $A$1:$H$50 | nicht vorhanden |
| Skizze Außenanlage-Aufwuchs | 7 | 9 | 0 | $A$1:$H$50 | nicht vorhanden |
| Abkürzungsverzeichnis | 0 | 0 | 0 | – | nicht vorhanden |
| Tabelle1 (versteckt) | 35 | 10 | 1 | – | aktiv |

**Blattschutz:** „aktiv“ nur bei Tabelle1 (mit Passwort). Bei den anderen Blättern ist ein Schutz-Element ohne den Schalter vorhanden („aus“) oder gar keines („nicht vorhanden“). **Bedingte Formatierungen:** keine. **Definierte Namen:** `uwe` (Typen-Tabelle), `nelke` (Restnutzungstabelle), `typen` (Auswahlliste) werden benutzt; `BKL.Beschreibung`, `Jürgen`, `rose`, `ungeprüft`, `uwe.2` und drei blattbezogene Namen nicht. **Auswahllisten** in Baulichkeiten: E63, K77, B67:C67, E76, G12:J12, G21/G30/G47/J47, E66/G40, D76 (Datum).

**Zirkelbezüge:** keine gefunden (Abhängigkeitsgraph aller Formeln). **Fehlerwerte** in sichtbaren Blättern (in der Datei gespeicherte Werte): 0. **Versteckte Blätter** mit #BEZUG!: siehe F39.


## Anhang C – Geprüft und ohne Befund

- Tabelle1 gegen Richtlinie: Restnutzungstabelle (3 Bauklassen, bis 80/60/40 Jahre), NHK-Stufen, Abrisskosten – alle Zahlen gleich.
- Zeilenformeln Außenanlagen L15:L45, Aufwuchs I L18:L45, Aufwuchs II L10:L45: überall `=RUNDEN(A*K;2)`, Summen mit richtigem Bereich (bei allen Zeilen voll nachgerechnet, T2).
- Rechenkette Laube / A1 / Schuppen: Formeln der vier Bauteil-Blöcke bis auf C33 und J52 gleich aufgebaut (Mustervergleich).
- Deckblatt: E21 = K81, E22 = L46 (Außenanlagen), E24 = Summe, E25 = H104, E26 = K24, E27 = K45; Gesamtbetrag E28 = E24 − E25 − E26 − E27 (T2).
- Gewächshaus (E42 = Alter × Minderung je Jahr, „abgeschrieben“ ab 100 %), Laubenvorplatz-Güte (b: 175 / 80 € wie Richtlinie S. 11), Grundwert 470 €, Höchstwert Kanal 2.200 €.
- Mängeltabelle: alle „Abzug maximal“-Werte der Richtlinie stimmen (Dach 20 %, Decken 10 %, Wände 13 %, Fußboden 10 %, Fundament 20 %, Ausbau außen 5 %, innen 7 %, Bauelemente 5 %, Schädlinge 10 %, Sonderabfall 10 %, Laube nicht beräumt 10 %).
- Rundung: Die Vorlage rundet bei jedem Zwischenschritt (€/m² nach Mängelabzug, nach Altersabzug, nach Index) auf Cent; gegenüber einer ungerundeten Rechnung sind das wenige Cent je m², bei 24 m² höchstens etwa 0,50 €. Das ist kein Fehler, muss aber in der App genauso gerundet werden (der Export lässt die Vorlage rechnen).
- Formeln mit festen Zahlen: Baulichkeiten!C75: =C74*3 (Zahlen 3); Baulichkeiten!E79: =WENN(G78>0;MIN(2200;C79);0) (Zahlen 2200); Baulichkeiten!H79: =G78/100*3 (Zahlen 3); Baulichkeiten!K79: =WENN(C79>74;RUNDEN(E79-E79*H79;2);0) (Zahlen 74); Außenanlagen!J3: =(E3-24)/100*6 (Zahlen 24, 6)


## Anhang D – Prüfskript und Korrekturvorschlag

**Neue Fassung der Vorlage prüfen:**

```
python tools/vorlage-pruefen.py NEUE_VORLAGE.xlsx          # Zustand je Fund: VORHANDEN / behoben
python tools/vorlage-pruefen.py NEUE_VORLAGE.xlsx -v       # mit Beleg je Fund
python tools/vorlage-pruefen.py --ohne-rechentests         # ohne LibreOffice (nur Formeln, Formate, Texte)
python tools/vorlage-pruefen.py --bericht docs/VORLAGE-FEHLERBERICHT.md --pdf docs/VORLAGE-FEHLERBERICHT.pdf
python tools/vorlage-pruefen.py --korrekturvorschlag docs/WEP_Vorlage_Korrekturvorschlag.xlsx
```

Voraussetzungen: Python 3.10+, `pip install openpyxl lxml`, für die Rechentests LibreOffice, für `--pdf` Chrome, Edge oder Chromium. Der Exit-Code ist die Zahl der noch vorhandenen sicheren Funde (0 = alles behoben). Das Skript liest die Datei nur; Rechentests laufen in Kopien im temporären Ordner.

**Änderungen im Korrekturvorschlag** (gelb = geändert; Zellsperren sind nicht gelb markiert; Blattschutz bleibt aus; Kontrollkästchen, Skizzen und Formatierung bleiben erhalten – es wird direkt im Dateiinhalt geändert):

| Fund | Blatt | Zelle(n) | vorher | nachher |
|---|---|---|---|---|
| F01 | Baulichkeiten | C33 | =$H$23 | =$H$32 |
| F40 | Baulichkeiten | J52 | =$B$21 | =$B$47 |
| F02 | Baulichkeiten | K81 | =K52+K61+K71+K75+K77+K79 | =K61+K71+K75+K77+K79 |
| F03 | Baulichkeiten | C64 | leer | =I63 |
| F05 | Baulichkeiten | G68 | 100 | =MIN(100;E66*H66) |
| F06 | Baulichkeiten | C75 | =C74*3 | =(1-0,97^C74)*100 |
| F07 | Baulichkeiten | H79 | =G78/100*3 | =1-0,97^G78 |
| F08 | Baulichkeiten | E79 | =WENN(G78>0;MIN(2200;C79);0) | =WENN(G78="";0;MIN(2200;C79)) |
| F08 | Baulichkeiten | K79 | =WENN(C79>74;RUNDEN(E79-E79*H79;2);0) | =RUNDEN(E79-E79*H79;2) |
| F24 | Baulichkeiten | F101 | =A17+A26+A35+A52 | =A17+A26+A35+A52+F71 |
| F30 | Baulichkeiten | H105 | 150 | =-K77 |
| F13 | Baulichkeiten | K77 | Liste "-100" | Eingabeprüfung Zahl -150 bis 0 |
| F14 | Baulichkeiten | E63 | Liste "0,275,225,175" | Eingabeprüfung Zahl 0 bis 275 |
| F15 | Baulichkeiten | E14, E23, E32, E49 | keine Prüfung | Eingabeprüfung Zahl 0 bis 100 |
| F35 | Baulichkeiten | I13, I22, I31, I48 | keine Prüfung | Eingabeprüfung ganze Zahl 0 bis 80 |
| F12 | Baulichkeiten | F104, G104, I19, I28, I37 | 5, 50, 1, 2, 3 | leer |
| F40 | Baulichkeiten | B19 | L | =B12 |
| F40 | Baulichkeiten | B28 | A1 | =B21 |
| F40 | Baulichkeiten | B37 | A2 | =B30 |
| F40 | Baulichkeiten | E34 | =$E$16 | =$H$7/100 |
| F40 | Baulichkeiten | H42, N79, N80 | 5, Summe K56:K74, =SUMME(K61:K77) | leer |
| F45 | Baulichkeiten | L62 | Hinweis: Beim Laubenvorplatz immer darauf achten, dass unter E58 bzw. B62 bei einem Anfal… | „Hinweis: Beim Laubenvorplatz immer darauf achten, dass unter E63 bzw. B67 bei einem Anfall von a) oder b) beim anderen… |
| F38 | Baulichkeiten | K54 | 86 % | Skalierung 82 % |
| F33 | Baulichkeiten | I19, I28, I37 | gesperrt | entsperrt |
| F34 | Baulichkeiten | J35, J44, F101, H105 | nicht gesperrt | gesperrt |
| F40 | Baulichkeiten | E16, E25, E43, E51 | =H7/100 | =$H$7/100 (entsprechend in jeder Zeile) |
| F10 | Deckbl UPV | E23 | =MAX('Aufwuchs I'!L46;'Aufwuchs II'!L46) | ='Aufwuchs II'!L46 |
| F36 | Deckbl UPV | C7, C8, C10, E13, E14, E15 … (8 Zellen) | =Formalien!$E$6, =Formalien!$E$3, =Formalien!$E$17, =Formalien!$E$12, =Formalien!$E$13 … | =WENN(Formalien!$E$6="";"";Formalien!$E$6) (entsprechend in jeder Zeile) |
| F36 | Deckbl UPV | C9 | =WENN(Formalien!$E$5="";Formalien!$E$4;Formalien!$E$4&" / "&Formalien!$E$5) | =WENN(Formalien!$E$4="";"";WENN(Formalien!$E$5="";Formalien!$E$4;Formalien!$E$4&" / "&Formalien!$E$5)) |
| F36 | Deckbl UPV | C11 | =Formalien!$E$14 | =WENN(Formalien!$E$14="";"";Formalien!$E$14) |
| F16 | Außenanlagen | J3 | =(E3-24)/100*6 | =MAX(0;RUNDEN((E3-24)/100*6;2)) |
| F11 | Beseitigungskosten | K12, K13, K14, K15, K16, K17 … (22 Zellen) | =(F12*H12*J12), =(F13*H13*J13), =(F14*H14*J14), =(F15*H15*J15), =(F16*H16*J16) … | =RUNDEN(F12*H12*J12;2) (entsprechend in jeder Zeile) |
| F04 | Beseitigungskosten | K21 | leer | =RUNDEN(F21*H21*J21;2) |
| F12 | Beseitigungskosten | H12, A26 | 150, bitumenhaltige Stoffe sind entsprechend der GefStoffV i.V.m. der TRGS 519 zu demonti… | leer |
| F17 | Beseitigungskosten | M29 | Aussenhecke auf zul. Höhe (1,80m) schneiden | „Außenhecke auf zul. Höhe (1,25 m) schneiden“ |
| F42 | Beseitigungskosten | M12 | bitumenhaltige Stoffe sind enstsprechend der GefStoffV i.V.m. der TRGS 519 zu demontieren… | „bitumenhaltige Stoffe sind entsprechend der GefStoffV i.V.m. der TRGS 519 zu demontieren und zu entsorgen.“ |
| F42 | Beseitigungskosten | M25 | Well-/Ebenasbest ist Sondermüll, es ist enstsprechend der GefStoffV i.V.m. der TRGS 519 z… | „Well-/Ebenasbest ist Sondermüll, es ist entsprechend der GefStoffV i.V.m. der TRGS 519 zu demontieren und zu entsorgen… |
| F42 | Beseitigungskosten | A32 | 2. Zu entfernene Außenanlagen laut Skizze Außenanlagen-Aufwuchs | „2. Zu entfernende Außenanlagen laut Skizze Außenanlagen-Aufwuchs“ |
| F42 | Beseitigungskosten | A46 | In der Zeit vom 1.März bis 30.Sepzember eines jeden Jahres dürfen aus Gründen des Natursc… | „In der Zeit vom 1. März bis 30. September eines jeden Jahres dürfen aus Gründen des Naturschutzes, insbesondere des“ |
| F43 | Beseitigungskosten | A43 | 9. | „10.“ |
| F43 | Beseitigungskosten | A44 | 10. | „11.“ |
| F43 | Beseitigungskosten | A24 | 12. | leer |
| F33 | Beseitigungskosten | B12, F12, G12, H12, J12, B13 … (115 Zellen) | gesperrt | entsperrt |
| F33 | Außenanlagen | A8, B15, B16, B17, B18, C15 … (36 Zellen) | gesperrt | entsperrt |
| F33 | Formalien | E17 | gesperrt | entsperrt |
| F42 | Mängelliste | D6 | Dach nicht horizentral | „Dach nicht horizontal“ |
| F42 | Mängelliste | D26 | nicht maßgrecht | „nicht maßgerecht“ |
| F42 | Mängelliste | C34 | Fenster - Gladichtung fehlerhaft (Kitt) | „Fenster - Glasdichtung fehlerhaft (Kitt)“ |
| F42 | Mängelliste | C36 | Fensterläden nich ordnungsgemäß | „Fensterläden nicht ordnungsgemäß“ |
| F42 | Mängelliste | C38 | Tür unddicht | „Tür undicht“ |
| F42 | Mängelliste | C19 | Wände nicht lotgerecht | „Wände nicht lotrecht“ |
| F18 | Mängelliste | D10 | Feuchtigkeit in der Dachkonstruktion | „Schornstein fehlerhaft“ |
| F12 | Mängelliste | F44 | 0.05 | leer |
| F34 | Mängelliste | E1, E2 | nicht gesperrt | gesperrt |
| F37 | Mängelliste | F5, F13, F16, F21, F24, F28 … (13 Zellen) | 0 | Zahlenformat „0 %“ |
| F44 | Skizze Außenanlage-Aufwuchs | A1 | Skizze – Baulichkeiten | „Skizze – Außenanlagen und Aufwuchs“ |
| F42 | Formalien | H6, H7, H8, H10, H15, H16 … (8 Zellen) | wir., wir | leer |
| F38 | Formalien | A1 | kein Druckbereich | Druckbereich $A$1:$F$24 |
| F38 | Aufwuchs II | L48 | kein Druckbereich | Druckbereich $A$1:$L$48 |
| F09 | Tabelle1 | D64, D65, D66, D67, D68, D69 … (60 Zellen) | leer | 10 |
| F35 | Tabelle1 | D88, F88, B90, D93, F93, B95 … (12 Zellen) | =SVERWEIS(D90;uwe;2), =SVERWEIS(D90;uwe;5), =SVERWEIS(D90;uwe;3), =SVERWEIS(D95;uwe;2), =… | =WENNFEHLER(SVERWEIS(D90;uwe;2);0) (entsprechend in jeder Zeile) |
| F41 | Tabelle1 | D103 | =WENN(D105=J87;K87;WENN(D105=J88;K88;WENN(D105=J89;K89;WENN(D105=J90;K90;WENN(D105=J91;K9… | =WENNFEHLER(SVERWEIS(D105;uwe;2);0) |
| F41 | Tabelle1 | F5 | =-I10 | leer |
| F41 | Tabelle1 | Namen | vorhanden | gelöscht: BKL.Beschreibung, Jürgen, rose, ungeprüft, uwe.2, Gutachten, Kinderspielhaus, wasserlos |
| F39 | Beseitigungsauflagen | H22 | =SUMME(E22*G33) | =SUMME(E22*G22) |
