# Plan Beta 6 – Parzellenform, gemeinsamer Maßstab, Dachformen, KGA-Auswahl

Stand: 23.10.2026, mit Simon abgestimmt. Grundsätze wie bisher (nichts sperren, nur warnen; Vorlage nie
verändern; nur erfundene Testdaten; Versionsnummern bei nativen Änderungen erhöhen). Updates gehen erst nach
„Version freigeben“ auf die Geräte (docs/FREIGABE.md).

## Paket 1 – Parzellenform und gleicher Maßstab für Bau- und Grün-Skizze

1. **Parzelle eingeben** (eigener Bereich in „Skizze Bau“ und „Skizze Grün“, dieselben Daten):
   - **Rechteckig:** Länge × Breite in Metern.
   - **Andere Form:** Ecken grob zeichnen (tippen/klicken), dann jede Seitenlänge eintippen; bei Vierecken
     zusätzlich eine Diagonale (sonst ist die Form nicht eindeutig), bei mehr Ecken die nötigen Diagonalen
     oder Winkel – die App sagt, welche Angabe noch fehlt. Ecken bleiben ziehbar.
   - Die App zeigt die berechnete Fläche und warnt (nur Hinweis), wenn sie deutlich von der
     **Parzellenfläche laut Vertrag** (Formalien) abweicht.
2. **Eine Parzelle je WEP**, angelegt von dem, der das WEP zuerst bearbeitet; beide Teile können sie
   korrigieren (Rückfrage, wenn schon Bau- oder Grün-Elemente darauf liegen). Abgleich, Teilen (.wep) und
   Sicherung nehmen sie mit; aus einer Bau-Excel wird die Form „Grundstück“ übernommen.
3. **Gleicher Maßstab:** Bau- und Grün-Skizze haben **dieselbe Größe und Lage**: Die Parzelle füllt den
   Skizzenkasten der Vorlage (B7:G49) mit Rand, Maßstab in m je Kästchen gleich für beide Blätter; Bau-
   Grundriss und Grün-Elemente liegen in echten Metern auf der Parzelle. Die Grundlage der Grün-Skizze
   (Beta 5, Paket 1) passt dadurch genau. Maßketten der Parzellenseiten auf Wunsch.
4. **Export:** Parzelle als Form „Grundstück“ (Bau: wie bisher hell, Grün: Wiese) in beiden Skizzen-Blättern,
   gleiche Position/Größe; bestehende Formen und Tests bleiben stimmig.

## Paket 2 – Weitere Dachformen

- Zusätzlich zu Flach-, Pult- und Satteldach: **Walmdach, Zeltdach/Pyramide, Krüppelwalmdach,
  Mansarddach**. Eingaben je Form (Traufhöhe, Firsthöhe, Firstlänge/Walmtiefe, Knickhöhe …), mit kleiner
  Skizze, was gemeint ist.
- **Kubatur** je Form richtig berechnen (Formeln mit Quelle in ENTSCHEIDUNGEN.md), Massenberechnung,
  Rechner (Beta 4, Paket 4) und 3D-Ansicht (Paket 5) zeigen die neuen Formen. Nicht rechteckige Grundrisse:
  Näherung mit Hinweis wie beim Satteldach.

## Paket 3 – KGA-Auswahl (wenn Simon die Liste schickt)

Kleingartenanlage aus einer Liste wählen statt tippen (Suche, Standard aus dem Profil), eigene Eingabe
bleibt möglich.
