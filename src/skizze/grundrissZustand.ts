/**
 * Zustand des Grundriss-Editors (Beta 4, Paket 3): Teile mit Rückgängig/Wiederholen.
 *
 * Reine Logik wie `verlauf.ts` der Grün-Skizze, aber für `GrundrissTeil`. Beim Eintippen eines Maßes entsteht
 * nicht für jede Ziffer ein Verlaufsschritt: Änderungen mit gleichem `key` innerhalb von `ZUSAMMENFASSEN_MS`
 * zählen als ein Schritt.
 */

import type { GrundrissTeil } from './grundriss.js'

const MAX_SCHRITTE = 50
export const ZUSAMMENFASSEN_MS = 1500

export interface GrundrissZustand {
  teile: GrundrissTeil[]
  vergangenheit: GrundrissTeil[][]
  zukunft: GrundrissTeil[][]
  letzte?: { key: string; zeit: number }
}

export type GrundrissAktion =
  /** Von außen gesetzt (Laden): ohne Verlauf. */
  | { typ: 'setzen'; teile: GrundrissTeil[] }
  | { typ: 'hinzufuegen'; teil: GrundrissTeil }
  | { typ: 'aendern'; id: string; teil: Partial<GrundrissTeil> | ((t: GrundrissTeil) => GrundrissTeil); key?: string; jetzt?: number }
  | { typ: 'loeschen'; id: string }
  /** Zwischenstand beim Ziehen: ohne Verlaufsschritt. */
  | { typ: 'live'; teil: GrundrissTeil }
  /** Ende des Ziehens: ein Schritt gegenüber dem Stand davor. */
  | { typ: 'ziehen-fertig'; vorher: GrundrissTeil[] }
  | { typ: 'undo' }
  | { typ: 'redo' }

export const neuerGrundrissZustand = (teile: GrundrissTeil[] = []): GrundrissZustand => ({ teile, vergangenheit: [], zukunft: [] })

function schreibe(z: GrundrissZustand, neu: GrundrissTeil[], letzte?: GrundrissZustand['letzte']): GrundrissZustand {
  const vergangenheit = [...z.vergangenheit, z.teile]
  return {
    teile: neu,
    vergangenheit: vergangenheit.length > MAX_SCHRITTE ? vergangenheit.slice(vergangenheit.length - MAX_SCHRITTE) : vergangenheit,
    zukunft: [],
    letzte,
  }
}

export function grundrissReducer(z: GrundrissZustand, a: GrundrissAktion): GrundrissZustand {
  switch (a.typ) {
    case 'setzen':
      return { ...z, teile: a.teile, letzte: undefined }
    case 'hinzufuegen':
      return schreibe(z, [...z.teile, a.teil])
    case 'aendern': {
      const teile = z.teile.map((t) => (t.id === a.id ? (typeof a.teil === 'function' ? a.teil(t) : { ...t, ...a.teil }) : t))
      const jetzt = a.jetzt ?? Date.now()
      const zusammen = a.key !== undefined && z.letzte?.key === a.key && jetzt - z.letzte.zeit < ZUSAMMENFASSEN_MS
      if (zusammen) return { ...z, teile, letzte: { key: a.key!, zeit: jetzt } }
      return schreibe(z, teile, a.key !== undefined ? { key: a.key, zeit: jetzt } : undefined)
    }
    case 'loeschen':
      return schreibe(z, z.teile.filter((t) => t.id !== a.id))
    case 'live':
      return { ...z, teile: z.teile.map((t) => (t.id === a.teil.id ? a.teil : t)), letzte: undefined }
    case 'ziehen-fertig':
      if (z.teile === a.vorher) return z
      return { ...z, vergangenheit: [...z.vergangenheit, a.vorher].slice(-MAX_SCHRITTE), zukunft: [], letzte: undefined }
    case 'undo': {
      const vorher = z.vergangenheit[z.vergangenheit.length - 1]
      if (!vorher) return z
      return { teile: vorher, vergangenheit: z.vergangenheit.slice(0, -1), zukunft: [z.teile, ...z.zukunft], letzte: undefined }
    }
    case 'redo': {
      const [naechster, ...rest] = z.zukunft
      if (!naechster) return z
      return { teile: naechster, vergangenheit: [...z.vergangenheit, z.teile], zukunft: rest, letzte: undefined }
    }
  }
}

export const kannUndo = (z: GrundrissZustand) => z.vergangenheit.length > 0
export const kannRedo = (z: GrundrissZustand) => z.zukunft.length > 0
