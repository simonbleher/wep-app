// Kleingartenanlagen (KGA) des Bezirksverbands Pankow: Auswahlliste für die Formalien (Liste von Simon, 24.10.2026).
// Eine eigene Eingabe bleibt immer möglich („Andere …“); nichts wird gesperrt.

export const KGA_LISTE: readonly string[] = [
  'Alt-Rosenthal',
  'Alte Baumschule',
  'Am Anger',
  'Am Feldweg',
  'Am Koppelgraben',
  'Am Möllersfelder Weg',
  'Am Rollberg',
  'Am Schlosspark I',
  'An den Teichen',
  'An der Autobahn',
  'An der Bahn',
  'Birkengrund',
  'Gartengemeinschaft Buch',
  'Daheim 2',
  'Edelweiß',
  'Erholung',
  'Fleißiges Lieschen',
  'Gartenbau Nordend',
  'Gartenfreunde Nordend',
  'Gartenvörde',
  'Gauert',
  'Gravensteiner Aue',
  'Hasenheide',
  'Hoffnung',
  'Humboldt',
  'In Pankow am Schloßpark',
  'Kapellenweg',
  'Kirschplantage',
  'Kissingen II',
  'Krugpfuhl',
  'Lindenhof',
  'Möbius',
  'Möllersfelde',
  'Neuland Buchholz',
  'Neuland Rosenthal',
  'Nordlicht',
  'Pankeglück',
  'Pankegrund',
  'Pankeland',
  'Pankepark',
  'Pankewiesen I',
  'Pankewiesen II',
  'Pappelgrund',
  'Parkfriede',
  'Parkidyll',
  'Rosenthal-Nord',
  'Rosenthal-Süd',
  'Schüssler',
  'Sonnental',
  'Steintal Buch',
  'Str. vor Schönholz',
  'Tiefland',
  'Wasserwerk Rosenthal',
  'Windige Ecke',
  'Zingertal',
  'Zur Neuen Baumschule',
]

/** Vergleichsform: Groß-/Kleinschreibung, Leer- und Satzzeichen, ß/ss egal („Rosenthal Süd“ = „Rosenthal-Süd“). */
const schluessel = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]/gu, '')

/** Der Listeneintrag, der zum Text passt (auch bei anderer Schreibweise, z. B. aus einer Bau-Excel); sonst `undefined`. */
export function findeKga(text: string): string | undefined {
  const k = schluessel(text)
  return k ? KGA_LISTE.find((e) => schluessel(e) === k) : undefined
}
