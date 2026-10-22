# Plan Beta 4 – Bau-Teil

Stand: 22.10.2026, mit Simon abgestimmt. Cloud-Sitzungen, eine pro Paket, nacheinander.
Grundlage: docs/Richtlinie.pdf Teil I (S. 3–11) und IV, docs/WEP_Vorlage.xlsx (Blätter
Formalien, Baulichkeiten, Mängelliste, Beseitigungskosten Teil 1, Skizze Bau, Deckbl UPV; versteckt:
Tabelle1 mit NHK-Tabelle `uwe` und Restnutzungstabelle `nelke`/„RN2020“).

## Grundsätze

- **Rolle im Profil** (Grün / Bau / Beides, gibt es schon) schaltet die Funktionen frei.
- **Getrennte Excel:** Bau exportiert seine Blätter in die Vorlage. Grün liest die Bau-Excel ein
  (gibt es seit Beta 3, Paket 5) und ergänzt seine Teile. Richtung nur **Bau → Grün**.
  Gemeinsames Arbeiten am selben WEP (OneDrive-Freigabe) später.
- Wie bisher: Höchstwerte vorschlagen, Wertermittler kann **immer** überschreiben; Regelverstöße
  nur **warnen**, nie sperren. `docs/WEP_Vorlage.xlsx` nie verändern. Nur erfundene Testdaten;
  echte Bau-WEPs dienen höchstens anonymisiert als Vorbild und kommen nicht ins Repo.
- Ändert sich `android/`, `capacitor.config.ts`, ein Plugin oder `src-tauri/`: die jeweilige
  Versionsnummer erhöhen (Workflow „Prüfen“).

## Paket 1 – Rolle schaltet Funktionen frei

- Grün: Reiter Außenanlagen, Aufwuchs, Beseitigung (Grün-Teil), Skizze Außenanlage-Aufwuchs, Fotos.
  Bau: Reiter Baulichkeiten, Mängel, Abwasser, Beseitigung Bau, Skizze Bau, Fotos (Inhalte ab Paket 2,
  bis dahin Platzhalter). Beides: alles. Formalien für alle.
- Neues WEP fragt nichts zusätzlich; die Rolle kommt aus dem Profil, pro WEP umschaltbar
  („Dieses WEP auch als Bau/Grün bearbeiten“) für Sonderfälle.
- Export: Bau schreibt nur Bau-Blätter + Formalien, Grün wie bisher (mit eingelesener Bau-Excel).
  Der Dateiname zeigt den Teil (z. B. `<Nr>_WEP_Bau.xlsx`).
- Liste/Status zeigen, welcher Teil bearbeitet ist.

## Paket 2 – Bau erfassen und bewerten

1. **Bauteile:** Laube (L), Anbauten (A1, A2 …), separate Schuppen (S/U), Gewächshaus (GWH),
   überdachter Laubenvorplatz (Ü1: integriert oder angebaut, drei Güten bis 275/175/80 €/m²),
   Keller. Je Bauteil Maße (Außenmaße), Baujahr, Bauklasse, Mängel, Notiz.
2. **Bauklasse-Assistent:** Material (Stein / Holz doppelwandig / Blockhaus / Holz einwandig) +
   Wanddicke → Bauklasse I.1–IV.3 und NHK 2015 laut Tabelle S. 5 (Sonderregel GL 10–19 und
   Holz bis 4 cm → IV.1). Vorschlag, überschreibbar.
3. **Mängelabzug:** Checkliste aus der Mängeltabelle (S. 6–8) je Gruppe mit Höchst-%; der
   Wertermittler setzt den konkreten Abzug, Begründungstext; eigene Mängel erlaubt.
4. **Alterswertminderung:** Baujahr → Restnutzungsjahre (vom Wertermittler festzulegen, Vorschlag)
   → Abzug laut Restnutzungstabelle aus `Tabelle1` (`nelke`, je Bauklasse-Spalte); Nebenanlagen
   mind. 3 %/Jahr.
5. **Baupreisindex:** App bringt die Werte je Jahr mit (IV. Quartal des Vorjahres, Amt für
   Statistik Berlin-Brandenburg, Quelle vermerken), im Profil überschreibbar; WEP merkt sich den
   verwendeten Wert.
6. **Regeln (nur Warnungen):** Laube > 24 m² (nicht berechnete Fläche ausweisen), Anbauten nur
   bis 24 m² gesamt, Keller nur mit Genehmigung, widerrechtliche Bauteile → nicht bewerten, Vorschlag
   Beseitigung; Gewächshaus > 12 m² oder Firsthöhe > 2,20 m.
7. **Abwasser:** Sammelgrube (Genehmigung, Dichtheitsgutachten, Alter, m³, 470 €/m³ − 3 %/Jahr) oder
   Kanal (max. 2.200 €, 3 %/Jahr), nicht geleerte Grube; Laube nicht beräumt (m³ × Preis).
8. **Beseitigungskosten Bau** (Anlage 4, Teil 1) mit den üblichen Textbausteinen aus der Vorlage.
9. **Baubeschreibung** (Freitext mit Vorschlag aus den Bauteil-Daten).
10. **Export** in Baulichkeiten, Mängelliste, Beseitigungskosten Teil 1, Formalien; Formeln der Vorlage
    erhalten, Ergebnis gegen die Formeln der Vorlage prüfen (Test: App-Rechnung = Excel-Rechnung).

## Paket 3 – Zeichen-Tools Bau

- Grundriss mit echten Maßen: Rechteck/Polygon zeichnen, Länge antippen und eintippen → Form passt
  sich an; Maßketten automatisch; Bauteil-Kürzel (L, A1, S, Ü1 …) verknüpft mit Paket 2 (Fläche
  fließt in die Bewertung).
- Fläche und Kubatur automatisch (Höhen, Dachform: Flach-, Pult-, Satteldach) – die Richtlinie
  verlangt die Kubatur; Ausgabe als „Massenberechnung“.
- Nutzt Zoom/Einrasten/Auswahl aus Beta 3, Paket 7. Export als bearbeitbare Formen in „Skizze Bau“.

## Paket 4 – Rechen-Tools im WEP

Flächenrechner (auch unregelmäßig), Kubatur nach Dachform, Altersabzug/Restnutzung,
Baupreisindex, 24-m²-Check (was wird nicht berechnet), Ergebnis auf Wunsch ins Bauteil übernehmen.

## Paket 5 – 3D-Ansicht (Spielerei)

3D-Modell der Laube aus Grundriss, Höhen und Dachform (z. B. three.js), mit Finger/Maus drehbar,
Bauteile farbig; nur Ansicht, keine Bewertung.

## Später

Laser-Entfernungsmesser per Bluetooth; gemeinsames Arbeiten Bau + Grün am selben WEP (OneDrive);
BV-Produkt (Planung ab ca. 28.10.2026).
