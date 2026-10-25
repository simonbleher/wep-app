/**
 * Der Text auf dem Deckblatt (Rechtliches, Erklärung, Hinweise, Kontakt) – die einzige Stelle im Code.
 *
 * Excel-Export (Zellen A31–A40 von „Deckbl UPV“, siehe `deckblatt.ts`) und beide PDFs lesen diese Liste.
 * Zum Ändern nur diese Datei bearbeiten; ein Absatz ist eine Folge von Textstücken, `fett` hebt eines hervor.
 */

export interface TextLauf {
  text: string
  fett?: boolean
}

export type DeckblattAbsatz = readonly TextLauf[]

export const DECKBLATT_ABSAETZE: readonly DeckblattAbsatz[] = [
  [{ text: 'Die Wertermittlung erfolgt auf der Grundlage der "Wertermittlungsrichtlinie für Kleingärten" des Landesverbandes Berlin der Gartenfreunde e.V.' }],
  [{ text: 'Erklärung:', fett: true }, { text: ' Die Wertermittler haften nicht für versteckte Mängel.' }],
  [
    {
      text: 'Versteckte Mängel im Sinne dieses Protokolls sind Mängel an Baulichkeiten und baulichen Anlagen, die vom Wertermittler nicht eingesehen werden konnten. Dabei ist es unwichtig, ob die Einsehbarkeit wegen Wandverkleidungen innen und/oder außen (mit oder ohne Baugenehmigung), dichtem Pflanzenwuchs, eingebautem Mobiliar oder sonstigen Gegenständen behindert wurde.',
    },
  ],
  [
    {
      text: 'Dieses Protokoll ist das Ergebnis einer Momentaufnahme von Daten zum Zeitpunkt der Wertermittlung auf der Parzelle. Es ist rechtlich nicht mit einem Gutachten gleichzusetzen.',
    },
  ],
  [{ text: 'Der neue Unterpächter muss das Inventar nicht übernehmen, es muss dann vom scheidenden Unterpächter entfernt werden.' }],
  [{ text: 'Wir weisen Sie darauf hin, dass die durch die Wertermittler ermittelten Beträge erst bei Neuverpachtung zur Zahlung fällig werden.' }],
  [{ text: 'Ein Widerspruch gegen diese Wertermittlung ist innerhalb von 14 Tagen schriftlich an den Bezirksverband der Gartenfreunde Pankow e.V. zu richten.' }],
  [{ text: 'Kontakt: wertermittlung@gartenfreunde-pankow.de' }],
]

/** Ein Absatz als reiner Text (ohne Hervorhebung). */
export const absatzText = (a: DeckblattAbsatz): string => a.map((l) => l.text).join('')
