/**
 * Zustand des Skizzen-Editors (Elemente, Auswahl, Rückgängig-Verlauf) als reiner Reducer – ohne Oberfläche testbar.
 */
import type { SkizzeElement } from './types.js'
import { istGrundlage } from './types.js'
import { verlaufRedo, verlaufSchreiben, verlaufUndo } from './verlauf.js'
import type { Verlauf } from './verlauf.js'

export interface EditorZustand {
  elemente: SkizzeElement[]
  ausgewaehlt: string | null // id des ausgewählten Elements
  verlauf: Verlauf
}

export type EditorAktion =
  | { typ: 'elemente-setzen'; elemente: SkizzeElement[] }
  /** Wie `elemente-setzen`, aber als ein Rückgängig-Schritt (Vorschlag übernehmen). */
  | { typ: 'elemente-ersetzen'; elemente: SkizzeElement[] }
  | { typ: 'element-hinzufuegen'; element: SkizzeElement }
  | { typ: 'element-aktualisieren'; element: SkizzeElement }
  | { typ: 'element-loeschen'; id: string }
  | { typ: 'element-auswaehlen'; id: string | null }
  /** Zwischenstand beim Ziehen: ersetzt das Element, ohne einen Verlaufsschritt zu schreiben. */
  | { typ: 'verschieben-live'; element: SkizzeElement }
  /** Ende des Ziehens: ein einziger Verlaufsschritt gegenüber dem Stand vor dem Ziehen. */
  | { typ: 'verschieben-fertig'; vorher: SkizzeElement[] }
  | { typ: 'undo' }
  | { typ: 'redo' }

export function editorReducer(zustand: EditorZustand, aktion: EditorAktion): EditorZustand {
  switch (aktion.typ) {
    case 'elemente-setzen':
      return { ...zustand, elemente: aktion.elemente, ausgewaehlt: null }

    case 'elemente-ersetzen':
      return {
        elemente: aktion.elemente,
        ausgewaehlt: null,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, aktion.elemente),
      }

    case 'element-hinzufuegen': {
      const neueElemente = [...zustand.elemente, aktion.element]
      return {
        elemente: neueElemente,
        ausgewaehlt: aktion.element.id,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, neueElemente),
      }
    }

    case 'element-aktualisieren': {
      const neueElemente = zustand.elemente.map((el) =>
        el.id === aktion.element.id ? aktion.element : el,
      )
      return {
        elemente: neueElemente,
        ausgewaehlt: zustand.ausgewaehlt,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, neueElemente),
      }
    }

    case 'element-loeschen': {
      const neueElemente = zustand.elemente.filter((el) => el.id !== aktion.id)
      return {
        elemente: neueElemente,
        ausgewaehlt: null,
        verlauf: verlaufSchreiben(zustand.verlauf, zustand.elemente, neueElemente),
      }
    }

    case 'element-auswaehlen':
      return { ...zustand, ausgewaehlt: aktion.id }

    case 'verschieben-live':
      return {
        ...zustand,
        elemente: zustand.elemente.map((el) => (el.id === aktion.element.id ? aktion.element : el)),
      }

    case 'verschieben-fertig': {
      if (zustand.elemente === aktion.vorher) return zustand
      return { ...zustand, verlauf: verlaufSchreiben(zustand.verlauf, aktion.vorher, zustand.elemente) }
    }

    case 'undo': {
      const ergebnis = verlaufUndo(zustand.verlauf, zustand.elemente)
      if (!ergebnis) return zustand
      return { elemente: [...ergebnis.elemente], ausgewaehlt: null, verlauf: ergebnis.verlauf }
    }

    case 'redo': {
      const ergebnis = verlaufRedo(zustand.verlauf, zustand.elemente)
      if (!ergebnis) return zustand
      return { elemente: [...ergebnis.elemente], ausgewaehlt: null, verlauf: ergebnis.verlauf }
    }
  }
}

/** Ein offener Vorschlag der Agent-Schnittstelle: neue Elemente (Skizzen-Pixel) und wie sie eingefügt werden. */
export interface VorschlagAnzeige {
  elemente: SkizzeElement[]
  /** `ergaenzen`: zum Bestehenden dazu · `gruen-ersetzen`: alle Grün-Elemente ersetzen (die Grundlage bleibt). */
  modus: 'ergaenzen' | 'gruen-ersetzen'
}

/** Elemente nach dem Übernehmen eines Vorschlags; die Grundlage (Bau-Skizze) bleibt in beiden Modi unangetastet. */
export function wendeVorschlagAn(elemente: SkizzeElement[], vorschlag: VorschlagAnzeige): SkizzeElement[] {
  const behalten = vorschlag.modus === 'gruen-ersetzen' ? elemente.filter((el) => istGrundlage(el)) : elemente
  return [...behalten, ...vorschlag.elemente]
}
