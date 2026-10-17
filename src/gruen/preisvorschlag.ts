// Preisvorschlag-Logik für die Wertermittlung.
//
// Die BewRL nennt fast überall Höchstwerte ("bis €"). Bei schlechtem Zustand
// gilt ein Festpreis von 1,00 € (Erinnerungswert). Die Zustandsstufen und
// Faktoren sind in src/model/types.ts definiert (ZUSTANDSSTUFEN).
//
// OFFENE FRAGE: Die Zuordnung Zustand → Faktor ist vorläufig und muss vom BV
// bestätigt werden (siehe ZUSTANDSSTUFEN-Kommentar in types.ts).

/**
 * Berechnet einen Preisvorschlag aus dem Höchstwert und dem Zustandsfaktor.
 *
 * Sonderfall „schlecht": Der Faktor ist 0 (kein linearer Anteil), stattdessen
 * wird ein fester Erinnerungswert von 1,00 € zurückgegeben.
 *
 * @param hoechstwert   - Höchstwert in EUR aus dem Katalog (positiv).
 * @param zustandFaktor - Faktor aus ZUSTANDSSTUFEN.faktor [0..1].
 *                        0 = schlecht → Festpreis 1 €.
 * @returns Vorgeschlagener Einzelpreis in EUR, gerundet auf 2 Dezimalstellen.
 */
export function preisvorschlag(hoechstwert: number, zustandFaktor: number): number {
  // Sonderfall: Faktor 0 entspricht Zustand "schlecht" → fester Erinnerungswert 1,00 €
  if (zustandFaktor === 0) {
    return 1
  }
  return Math.round(hoechstwert * zustandFaktor * 100) / 100
}
