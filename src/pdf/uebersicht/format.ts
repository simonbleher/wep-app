/** Zahlen, Beträge und Daten in deutscher Schreibweise für das übersichtliche PDF (nur Zeichen aus WinAnsi). */

const de = (n: number, min: number, max: number) => n.toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max })

export const euro = (n: number): string => `${de(n === 0 ? 0 : n, 2, 2)} €`
/** Abzug mit Vorzeichen („– 250,00 €“); der Gedankenstrich steht im Zeichensatz der Schrift, das Minuszeichen nicht. */
export const abzugEuro = (n: number): string => (n === 0 ? euro(0) : `– ${euro(Math.abs(n))}`)
export const zahl = (n: number, max = 2): string => de(n, 0, max)
export const prozent = (n: number): string => `${de(n, 0, 2)} %`
export const flaeche = (n: number): string => `${de(n, 0, 2)} m²`

/** Excel-Seriennummer (1900-System) → „20.10.2026“. */
export function datum(serie: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86400000)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
}
