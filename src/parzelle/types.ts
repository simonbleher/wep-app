// Parzelle (Beta 6, Paket 1): die Form des Grundstücks je WEP, gemeinsam für „Skizze Bau“ und „Skizze Grün“.
//
// Gespeichert werden nur die Eingaben des Wertermittlers (Länge × Breite oder grob gezeichnete Ecken mit
// eingetippten Seiten, Diagonalen und Winkeln). Die Form in Metern rechnet `geometrie.ts` daraus; beide Skizzen
// legen sie über `lage.ts` gleich groß und an dieselbe Stelle des Skizzenkastens.

/** Punkt in Metern (oder bei den grob gezeichneten Ecken in beliebigen Einheiten). */
export interface ParzellePunkt {
  x: number
  y: number
}

/** Diagonale zwischen zwei Ecken (Index in `ecken`); die Länge fehlt, solange sie nicht eingetippt ist. */
export interface ParzelleDiagonale {
  von: number
  nach: number
  laenge?: number
}

/** Innenwinkel an einer Ecke in Grad; die Angabe ersetzt die Diagonale „über die Ecke“ (Seite – Winkel – Seite). */
export interface ParzelleWinkel {
  ecke: number
  grad?: number
}

/** Wer die Parzelle angelegt oder zuletzt geändert hat. */
export type ParzelleTeil = 'bau' | 'gruen' | 'excel'

export interface Parzelle {
  /** `rechteck`: Länge × Breite · `frei`: Ecken grob gezeichnet, Seiten (und Diagonalen/Winkel) eingetippt. */
  form: 'rechteck' | 'frei'
  /** Rechteck: Länge in m – in der Skizze von oben nach unten (vom Weg zur Rückseite). */
  laenge?: number
  /** Rechteck: Breite in m – in der Skizze von links nach rechts. */
  breite?: number
  /** Frei: grobe Lage der Ecken (mindestens 3, in der Reihenfolge um die Parzelle); nur Reihenfolge und Richtung zählen. */
  ecken?: ParzellePunkt[]
  /** Frei: Länge der Seite i (von Ecke i zu Ecke i+1) in m; `null` = noch nicht eingetippt. */
  seiten?: (number | null)[]
  diagonalen?: ParzelleDiagonale[]
  winkel?: ParzelleWinkel[]
  /** Seitenlängen der Parzelle als Maßlinien in beide Skizzen zeichnen (auf Wunsch). */
  massketten?: boolean
  /** Von welchem Teil und wann angelegt (Erster, der das WEP bearbeitet) … */
  angelegtVon: ParzelleTeil
  angelegtAm: string
  /** … und zuletzt geändert. */
  geaendertVon?: ParzelleTeil
  geaendertAm?: string
}

export const PARZELLE_TEIL_TEXT: Record<ParzelleTeil, string> = {
  bau: 'Bau-Teil',
  gruen: 'Grün-Teil',
  excel: 'Bau-Excel',
}

/** Name einer Ecke: A, B, C … (ab 27 Ecken E27 …). */
export const eckenName = (i: number): string => (i >= 0 && i < 26 ? String.fromCharCode(65 + i) : `E${i + 1}`)

/** Eine Parzelle als Rechteck; Länge oder Breite dürfen noch fehlen. */
export function neuesRechteck(teil: ParzelleTeil, jetzt: string, laenge?: number, breite?: number): Parzelle {
  return {
    form: 'rechteck',
    ...(laenge ? { laenge } : {}),
    ...(breite ? { breite } : {}),
    angelegtVon: teil,
    angelegtAm: jetzt,
  }
}
