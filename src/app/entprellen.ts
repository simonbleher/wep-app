// Entprellt einen Aufruf: erst wenn `wartezeitMs` lang nichts mehr kam, wird
// mit dem letzten Wert ausgeführt. `sofort()` schreibt Ausstehendes direkt
// (z. B. beim Verlassen des Tabs), `abbrechen()` verwirft es.

export interface Entprellt<T> {
  (wert: T): void
  sofort: () => void
  abbrechen: () => void
}

export function entprelle<T>(fn: (wert: T) => void, wartezeitMs: number): Entprellt<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let ausstehend: { wert: T } | undefined

  const ausfuehren = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    const a = ausstehend
    ausstehend = undefined
    if (a) fn(a.wert)
  }

  const aufruf = ((wert: T) => {
    ausstehend = { wert }
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(ausfuehren, wartezeitMs)
  }) as Entprellt<T>
  aufruf.sofort = ausfuehren
  aufruf.abbrechen = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    ausstehend = undefined
  }
  return aufruf
}
