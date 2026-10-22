// Baupreisindex (2015 = 100) für die Bewertung der Baulichkeiten.
//
// Richtlinie S. 11: „Der Baupreisindex wird für den Neubau von Wohngebäuden durch das Amt für Statistik
// Berlin-Brandenburg quartalsweise ermittelt und veröffentlicht. […] wird der Baupreisindex des IV. Quartals
// des Vorjahres für das gesamte Folgejahr verwendet.“ Die Quartalswerte der Berliner Reihe gelten für
// Februar, Mai, August und November; das IV. Quartal ist also der Novemberwert des Vorjahres.

export interface IndexEintrag {
  /** Jahr der Wertermittlung, für das der Index gilt (= Novemberwert des Vorjahres). */
  jahr: number
  wert: number
  quelle: string
}

const AFS_2024 =
  'Amt für Statistik Berlin-Brandenburg, Statistischer Bericht M I 4 – vj 1/24 (Berlin), Tabelle 3, S. 6: ' +
  'Preisindex für den Neubau von Wohngebäuden (Bauleistungen am Bauwerk) einschl. Umsatzsteuer, Land Berlin (2015 = 100)'

const nov = (vorjahr: number, wert: number): IndexEintrag => ({
  jahr: vorjahr + 1,
  wert,
  quelle: `${AFS_2024}, November ${vorjahr}`,
})

/** Werte je Jahr der Wertermittlung. Nov. 2015–2023 aus dem Statistischen Bericht, 2025 aus der Vorlage des BV. */
export const BAUPREISINDEX: readonly IndexEintrag[] = [
  nov(2015, 100.5),
  nov(2016, 103.2),
  nov(2017, 107.6),
  nov(2018, 114.7),
  nov(2019, 120.6),
  nov(2020, 121.9),
  nov(2021, 138.9),
  nov(2022, 162.1),
  nov(2023, 170.7),
  {
    jahr: 2025,
    wert: 179.2,
    quelle: 'WEP-Vorlage des BV Pankow, Blatt Baulichkeiten H7 („für 2025“); nicht gegen die Statistik geprüft',
  },
]

export interface IndexErgebnis {
  jahr: number
  wert: number
  quelle: string
  /** Aus dem Profil des Wertermittlers (überschrieben). */
  manuell: boolean
  /** Für dieses Jahr gibt es keinen Wert; es wird der des nächstälteren Jahres genommen (Hinweis anzeigen!). */
  ersatz: boolean
  /** Jahr, aus dem der Ersatzwert stammt. */
  ersatzJahr?: number
}

/**
 * Index für ein Jahr der Wertermittlung: erst die Werte aus dem Profil (überschreiben die Tabelle), dann die
 * Tabelle der App. Fehlt das Jahr, kommt der Wert des letzten bekannten früheren Jahres mit `ersatz: true`.
 * Ohne irgendeinen Wert: `null`.
 */
export function ermittleBaupreisindex(jahr: number, profil: Record<string, number> | undefined = undefined): IndexErgebnis | null {
  const ausProfil = profil?.[String(jahr)]
  if (ausProfil && ausProfil > 0) return { jahr, wert: ausProfil, quelle: 'Eingabe im Profil', manuell: true, ersatz: false }
  const tabelle = [...BAUPREISINDEX].sort((a, b) => a.jahr - b.jahr)
  const treffer = tabelle.find((e) => e.jahr === jahr)
  if (treffer) return { jahr, wert: treffer.wert, quelle: treffer.quelle, manuell: false, ersatz: false }
  const frueher = [
    ...tabelle.map((e) => ({ jahr: e.jahr, wert: e.wert, quelle: e.quelle })),
    ...Object.entries(profil ?? {}).map(([j, w]) => ({ jahr: Number(j), wert: w, quelle: 'Eingabe im Profil' })),
  ]
    .filter((e) => e.jahr < jahr && e.wert > 0)
    .sort((a, b) => b.jahr - a.jahr)[0]
  if (!frueher) return null
  return {
    jahr,
    wert: frueher.wert,
    quelle: `${frueher.quelle} (Wert für ${frueher.jahr}; für ${jahr} liegt kein Wert vor)`,
    manuell: false,
    ersatz: true,
    ersatzJahr: frueher.jahr,
  }
}
