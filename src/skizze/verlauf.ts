/**
 * Undo-/Redo-Stack für den SkizzeEditor.
 *
 * Der Verlauf speichert vollständige Snapshots der Elemente-Liste (shallow copy
 * reicht, da Elemente unveränderlich behandelt werden). Das ist einfacher und
 * robuster als ein Command-Pattern bei einer Zeichenfläche dieser Größe.
 *
 * Reine Logik, kein React-State – kann gut getestet werden.
 */

import type { SkizzeElement } from './types.js'

/** Maximale Anzahl gespeicherter Schritte (inkl. Ausgangszustand). */
const MAX_SCHRITTE = 50

export interface Verlauf {
  /** Vergangene Zustände; Einträge[0] ist der älteste. */
  vergangenheit: ReadonlyArray<ReadonlyArray<SkizzeElement>>
  /** Zukünftige Zustände (nach Undo); Einträge[0] ist der nächste. */
  zukunft: ReadonlyArray<ReadonlyArray<SkizzeElement>>
}

/** Erzeugt einen neuen, leeren Verlauf. */
export function neuerVerlauf(): Verlauf {
  return { vergangenheit: [], zukunft: [] }
}

/**
 * Schreibt einen neuen Zustand in den Verlauf.
 * Löscht dabei alle gespeicherten Redo-Schritte.
 */
export function verlaufSchreiben(
  verlauf: Verlauf,
  vorheriger: ReadonlyArray<SkizzeElement>,
  _aktuell: ReadonlyArray<SkizzeElement>,
): Verlauf {
  const vergangenheit = [...verlauf.vergangenheit, vorheriger]
  return {
    vergangenheit:
      vergangenheit.length > MAX_SCHRITTE
        ? vergangenheit.slice(vergangenheit.length - MAX_SCHRITTE)
        : vergangenheit,
    zukunft: [],
  }
}

/**
 * Führt Undo aus.
 * Gibt `null` zurück, wenn kein Undo verfügbar ist.
 */
export function verlaufUndo(
  verlauf: Verlauf,
  aktuell: ReadonlyArray<SkizzeElement>,
): { verlauf: Verlauf; elemente: ReadonlyArray<SkizzeElement> } | null {
  if (verlauf.vergangenheit.length === 0) return null

  const vergangenheit = [...verlauf.vergangenheit]
  const vorheriger = vergangenheit.pop()! // letzter gespeicherter Zustand
  return {
    verlauf: {
      vergangenheit,
      zukunft: [aktuell, ...verlauf.zukunft],
    },
    elemente: vorheriger,
  }
}

/**
 * Führt Redo aus.
 * Gibt `null` zurück, wenn kein Redo verfügbar ist.
 */
export function verlaufRedo(
  verlauf: Verlauf,
  aktuell: ReadonlyArray<SkizzeElement>,
): { verlauf: Verlauf; elemente: ReadonlyArray<SkizzeElement> } | null {
  if (verlauf.zukunft.length === 0) return null

  const zukunft = [...verlauf.zukunft]
  const naechster = zukunft.shift()! // nächster Redo-Zustand
  return {
    verlauf: {
      vergangenheit: [...verlauf.vergangenheit, aktuell],
      zukunft,
    },
    elemente: naechster,
  }
}

/** `true` wenn Undo verfügbar. */
export function kannUndo(verlauf: Verlauf): boolean {
  return verlauf.vergangenheit.length > 0
}

/** `true` wenn Redo verfügbar. */
export function kannRedo(verlauf: Verlauf): boolean {
  return verlauf.zukunft.length > 0
}
