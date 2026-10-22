# WEP-Prüfung (Vorlagenfehler finden)

Dieses kleine Programm prüft **fertige WEPs** (Excel-Dateien) darauf, ob sie von den Fehlern der
WEP-Vorlage des BV Pankow betroffen sind, und rechnet aus, **um wie viel Euro** der Gesamtbetrag
dadurch falsch ist. Es ist für WEPs gedacht, die **vor** der Korrektur der Vorlage erstellt wurden.

* Die Excel-Dateien werden **nur gelesen**, nie verändert.
* Es wird **nichts ins Internet gesendet.** (Nur wenn Sie die Installation von `openpyxl`
  erlauben, lädt Python dieses eine Zusatzpaket einmalig herunter.)
* Ergebnis sind zwei Dateien **in dem geprüften Ordner**: `pruefbericht.html` (zum Lesen) und
  `pruefbericht.csv` (zum Filtern in Excel).

## Was wird geprüft?

| Stelle | Fehler in der Vorlage | Wirkung |
|---|---|---|
| Baulichkeiten **C33** | Anbau A2 rechnete mit dem Ergebnis von Anbau A1 | Betrag der Baulichkeiten |
| Baulichkeiten **K81** | Der Schuppen wurde in „Baulichkeiten insgesamt“ doppelt gezählt | Betrag der Baulichkeiten (zu hoch) |
| Baulichkeiten **J52** | Beschriftung beim Schuppen zeigt das Kürzel von A1 | nur Anzeige, kein Betrag |
| Baulichkeiten **C64** | Integrierter überdachter Laubenvorplatz: Wert ging verloren | Betrag der Baulichkeiten |
| Beseitigungskosten **K21** | Zeile 9 fehlte in der Summe | Beseitigungskosten zu niedrig |
| Baulichkeiten **F104 / G104** | Beispielwert „nicht beräumt“ (5 m³ × 50 € = 250 €) blieb stehen | Abzug 250 € – nur **Verdacht**, es kann auch richtig sein |
| Baulichkeiten **I19 / I28 / I37** | Beispielwerte 1/2/3 m² „nicht berechnete Baufläche“ | nur Hinweis, kein Betrag |

Für jede Datei wird gezeigt, ob die fehlerhafte Formel enthalten ist und ob sie das Ergebnis beeinflusst.
Die Auswirkung wird bis zum **Deckblatt** (E21 Baulichkeiten, E25 nicht beräumt, E26 Beseitigung Bau,
E28 Gesamtbetrag) verfolgt. Gerechnet wird mit den Werten, die Excel in der Datei gespeichert hat, und
mit einer eigenen Nachrechnung der richtigen Formel.

## Einmalig: Python installieren (Windows)

1. Auf <https://www.python.org/downloads/> den Knopf „Download Python 3.x“ drücken und die Datei starten.
2. **Wichtig:** Im ersten Fenster unten **„Add python.exe to PATH“ ankreuzen**, dann „Install Now“.
3. Fertig. Das Zusatzpaket `openpyxl` installiert `pruefe_weps.bat` beim ersten Start nach Rückfrage selbst.

Voraussetzung: Python 3.10 oder neuer. (Auf Mac/Linux: `python3 -m pip install -r requirements.txt` und weiter wie unten.)

## Aufruf

**Windows (einfach):** Doppelklick auf `pruefe_weps.bat`, den Ordner mit den WEPs angeben
(oder den Ordner aus dem Explorer ins Fenster ziehen) und Enter drücken. Unterordner werden mitgeprüft.
Am Ende fragt das Programm, ob der Bericht gleich im Browser geöffnet werden soll.

**Eingabeaufforderung / Terminal:**

```
python pruefe_weps.py "C:\Pfad\zu\den\WEPs"
```

Optional mit `--ausgabe ANDERER_ORDNER`, wenn der Bericht nicht in den geprüften Ordner soll
(zum Beispiel bei einem schreibgeschützten Ordner).

## Den Bericht lesen

`pruefbericht.html` (Doppelklick, öffnet im Browser):

1. **Zusammenfassung** – wie viele Dateien geprüft wurden und wie viele betroffen sind.
2. **Betroffene WEPs** – ganz oben. Je Datei: Anlage, Parzelle, Vorgangs-Nr., die gefundenen Fehler mit Euro-Betrag
   und die **Abweichung beim Gesamtbetrag**.
   * **Minus** (z. B. „−80,00 €“, „Gesamtbetrag zu hoch“): Im Protokoll steht zu viel, mit richtiger Formel wäre der Betrag niedriger.
   * **Plus** („Gesamtbetrag zu niedrig“): Im Protokoll steht zu wenig.
   * „Abweichung“ ist immer: *richtiger Betrag minus Betrag in der Datei.*
3. **Einzelheiten je Datei** – jede auffällige Stelle mit Erklärung und eine kleine Tabelle für das Deckblatt:
   Wert in der Datei, Wert mit richtigen Formeln, Differenz.
4. **Weitere Dateien** – Dateien ohne Befund sowie Dateien, die nicht geprüft werden konnten, mit Grund:
   * *keine WEP-Vorlage* – eine andere Excel-Datei;
   * *keine gespeicherten Werte* – die Datei wurde nie in Excel berechnet. Einmal in Excel öffnen, speichern und erneut prüfen;
   * *nicht lesbar* – beschädigt, verschlüsselt oder gerade in Excel geöffnet.

Status-Begriffe: **Ergebnis betroffen** (ein Fehler verändert einen Betrag), **Verdacht (Beispielwert)** (nur der Beispielwert
„nicht beräumt“ steht noch drin), **Hinweise, ohne Euro-Wirkung** (fehlerhafte Formel, aber bei den eingetragenen Werten ohne
Folge, oder Formel von Hand geändert), **ohne Befund**.

`pruefbericht.csv` enthält dieselben Befunde, eine Zeile je Datei und Stelle (Trennzeichen Semikolon, Dezimalkomma). Doppelklick öffnet
sie in Excel; mit „Daten → Filter“ lässt sich nach Status oder Anlage filtern.

Der Prüfer gibt **keine Rechtsaussage**. Ob eine Korrektur nötig ist, entscheidet der Bezirksverband; das Programm zeigt nur,
wo und um wie viel die Vorlage abweichend gerechnet hat.

## ⚠ Personendaten

Der Bericht enthält **Kleingartenanlage, Parzelle und Vorgangs-Nr.** der geprüften WEPs, der Ordner in der Regel die WEPs selbst.
Bericht und WEPs deshalb nicht öffentlich ablegen, nicht in ein Repository einchecken und nur an Berechtigte weitergeben.
Die Dateien `pruefbericht.*` sind in `.gitignore` ausgeschlossen. Nach der Auswertung den Bericht löschen, wenn er nicht mehr gebraucht wird.

## Für Entwickler

```
pip install -r requirements-test.txt
python -m pytest tools/pruef-weps        # braucht LibreOffice; ohne wird übersprungen
```

Die Tests erzeugen erfundene WEPs aus `docs/WEP_Vorlage.xlsx` (mit und ohne Fehlerwirkung), lassen LibreOffice die Werte
speichern und vergleichen die Beträge des Skripts mit der LibreOffice-Rechnung der korrigierten Dateien. Es liegen keine echten WEPs im Repository.
