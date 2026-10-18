/**
 * Function Calls und Prompts des Skizzen-Chats.
 *
 * Gemini antwortet ausschließlich mit Function Calls (Modus ANY). Hier stehen die
 * Deklarationen (Server und Tests nutzen dieselben), der Prüfer, der aus einem Aufruf
 * eine `Operation` macht, und die Prompts. Der Server importiert diese Datei; sie
 * hängt nur von reinem TypeScript ab (kein DOM, kein Node).
 */

import { KANTEN, type Operation } from './operationen'
import { TYP_BESCHREIBUNG } from './szene'
import { SYMBOL_ARTEN, type SymbolArt } from './types'

// ---------------------------------------------------------------------------
// Deklarationen (Gemini-Schema, Typnamen in Großbuchstaben)
// ---------------------------------------------------------------------------

const TYP = { type: 'STRING', enum: [...SYMBOL_ARTEN], description: 'Elementtyp' }
const ID = { type: 'STRING', description: 'id eines vorhandenen Elements aus der Szene' }
const ZAHL = (beschreibung: string) => ({ type: 'NUMBER', description: beschreibung })
const TEXT = (beschreibung: string) => ({ type: 'STRING', description: beschreibung })

const MITTE_X = ZAHL('Mitte, 0–1000 von links')
const MITTE_Y = ZAHL('Mitte, 0–1000 von oben')
const ABSTAND = ZAHL('Lücke in Promille, Standard 20')

export const FUNKTIONEN = [
  {
    name: 'hinzufuegen',
    description: 'Neues Element an eine absolute Position setzen. Nur nehmen, wenn keine relative Funktion passt.',
    parameters: {
      type: 'OBJECT',
      properties: {
        typ: TYP,
        x: MITTE_X,
        y: MITTE_Y,
        b: ZAHL('Breite in Promille (optional, sonst Standardgröße)'),
        h: ZAHL('Höhe in Promille (optional)'),
        beschriftung: TEXT('Anzeigetext, z. B. Artname (optional)'),
      },
      required: ['typ', 'x', 'y'],
    },
  },
  {
    name: 'aendern',
    description: 'Typ und/oder Beschriftung eines vorhandenen Elements ändern.',
    parameters: { type: 'OBJECT', properties: { id: ID, typ: TYP, beschriftung: TEXT('neuer Text') }, required: ['id'] },
  },
  {
    name: 'verschieben',
    description: 'Element verschieben: entweder neue Mitte (x, y) oder Versatz (dx, dy) in Promille.',
    parameters: {
      type: 'OBJECT',
      properties: { id: ID, x: MITTE_X, y: MITTE_Y, dx: ZAHL('Versatz nach rechts'), dy: ZAHL('Versatz nach unten') },
      required: ['id'],
    },
  },
  {
    name: 'groesse',
    description: 'Größe ändern (Mitte bleibt).',
    parameters: { type: 'OBJECT', properties: { id: ID, b: ZAHL('Breite in Promille'), h: ZAHL('Höhe in Promille') }, required: ['id', 'b', 'h'] },
  },
  {
    name: 'loeschen',
    description: 'Element löschen.',
    parameters: { type: 'OBJECT', properties: { id: ID }, required: ['id'] },
  },
  {
    name: 'beschriften',
    description: 'Beschriftung setzen oder (leerer Text) entfernen.',
    parameters: { type: 'OBJECT', properties: { id: ID, text: TEXT('neue Beschriftung') }, required: ['id', 'text'] },
  },
  {
    name: 'reihe',
    description:
      'Mehrere gleiche Elemente gleichmäßig in einem Bereich anordnen („drei Beete nebeneinander“). Die Reihe läuft entlang der längeren Seite des Bereichs.',
    parameters: {
      type: 'OBJECT',
      properties: {
        typ: TYP,
        anzahl: ZAHL('Anzahl, 1–20'),
        bereich: {
          type: 'OBJECT',
          properties: { x1: ZAHL('links'), y1: ZAHL('oben'), x2: ZAHL('rechts'), y2: ZAHL('unten') },
          required: ['x1', 'y1', 'x2', 'y2'],
        },
        beschriftung: TEXT('gemeinsame Beschriftung der Reihe (steht einmal in der Mitte)'),
      },
      required: ['typ', 'anzahl', 'bereich'],
    },
  },
  {
    name: 'entlangKante',
    description:
      'Am Rand des Grundstücks (am Zaun) entlang: Hecke und Weg als durchgehende Linie, andere Typen als Reihe.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kante: { type: 'STRING', enum: [...KANTEN], description: 'Rand des Grundstücks' },
        typ: TYP,
        beschriftung: TEXT('Beschriftung, z. B. „Flieder“'),
        abstand: ZAHL('Abstand zum Rand in Promille, Standard 12'),
        anzahl: ZAHL('nur bei Nicht-Linien: Anzahl, Standard 3'),
      },
      required: ['kante', 'typ'],
    },
  },
  ...(['neben', 'unter', 'ueber'] as const).map((name) => ({
    name,
    description:
      name === 'neben'
        ? 'Neues Element links oder rechts neben ein vorhandenes setzen.'
        : name === 'unter'
          ? 'Neues Element direkt unter ein vorhandenes setzen.'
          : 'Neues Element direkt über ein vorhandenes setzen.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: ID,
        typ: TYP,
        ...(name === 'neben' ? { seite: { type: 'STRING', enum: ['links', 'rechts'], description: 'Seite, Standard rechts' } } : {}),
        abstand: ABSTAND,
        beschriftung: TEXT('Anzeigetext (optional)'),
        b: ZAHL('Breite in Promille (optional)'),
        h: ZAHL('Höhe in Promille (optional)'),
      },
      required: ['id', 'typ'],
    },
  })),
  {
    name: 'hinweis',
    description: 'Eine kurze Rückfrage oder Erklärung an den Nutzer, wenn etwas unklar ist oder nicht geht. Keine Änderung.',
    parameters: { type: 'OBJECT', properties: { text: TEXT('ein bis zwei Sätze') }, required: ['text'] },
  },
  {
    name: 'fertig',
    description: 'Nichts (mehr) zu ändern. Immer aufrufen, wenn die Skizze so passt.',
    parameters: { type: 'OBJECT', properties: { zusammenfassung: TEXT('ein Satz') }, required: [] },
  },
] as const

export const FUNKTIONS_NAMEN: string[] = FUNKTIONEN.map((f) => f.name)

// ---------------------------------------------------------------------------
// Aufruf → Operation
// ---------------------------------------------------------------------------

export type AufrufErgebnis =
  | { art: 'operation'; operation: Operation }
  | { art: 'hinweis'; text: string }
  | { art: 'fertig'; text: string }
  | { art: 'fehler'; text: string }

export interface Aufruf {
  name: string
  args?: Record<string, unknown>
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const typOf = (v: unknown): SymbolArt | undefined =>
  typeof v === 'string' && (SYMBOL_ARTEN as readonly string[]).includes(v) ? (v as SymbolArt) : undefined

/** Prüft die Argumente eines Function Calls. Ungültiges wird nicht geraten, sondern gemeldet. */
export function aufrufZuOperation(aufruf: Aufruf): AufrufErgebnis {
  const a = aufruf.args ?? {}
  const fehlt = (was: string): AufrufErgebnis => ({ art: 'fehler', text: `${aufruf.name}: ${was} fehlt oder ist ungültig` })
  switch (aufruf.name) {
    case 'hinzufuegen': {
      const typ = typOf(a.typ)
      const x = num(a.x)
      const y = num(a.y)
      if (!typ) return fehlt('typ')
      if (x === undefined || y === undefined) return fehlt('x/y')
      return { art: 'operation', operation: { op: 'hinzufuegen', typ, x, y, b: num(a.b), h: num(a.h), beschriftung: str(a.beschriftung) } }
    }
    case 'aendern': {
      const id = str(a.id)
      if (!id) return fehlt('id')
      return { art: 'operation', operation: { op: 'aendern', id, typ: typOf(a.typ), beschriftung: str(a.beschriftung) } }
    }
    case 'verschieben': {
      const id = str(a.id)
      if (!id) return fehlt('id')
      return { art: 'operation', operation: { op: 'verschieben', id, x: num(a.x), y: num(a.y), dx: num(a.dx), dy: num(a.dy) } }
    }
    case 'groesse': {
      const id = str(a.id)
      const b = num(a.b)
      const h = num(a.h)
      if (!id) return fehlt('id')
      if (b === undefined || h === undefined) return fehlt('b/h')
      return { art: 'operation', operation: { op: 'groesse', id, b, h } }
    }
    case 'loeschen': {
      const id = str(a.id)
      return id ? { art: 'operation', operation: { op: 'loeschen', id } } : fehlt('id')
    }
    case 'beschriften': {
      const id = str(a.id)
      if (!id) return fehlt('id')
      return { art: 'operation', operation: { op: 'beschriften', id, text: str(a.text) ?? '' } }
    }
    case 'reihe': {
      const typ = typOf(a.typ)
      const anzahl = num(a.anzahl)
      const bb = (a.bereich ?? {}) as Record<string, unknown>
      const [x1, y1, x2, y2] = [num(bb.x1), num(bb.y1), num(bb.x2), num(bb.y2)]
      if (!typ) return fehlt('typ')
      if (anzahl === undefined) return fehlt('anzahl')
      if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return fehlt('bereich')
      return { art: 'operation', operation: { op: 'reihe', typ, anzahl, bereich: { x1, y1, x2, y2 }, beschriftung: str(a.beschriftung) } }
    }
    case 'entlangKante': {
      const typ = typOf(a.typ)
      const kante = (KANTEN as string[]).includes(String(a.kante)) ? (a.kante as (typeof KANTEN)[number]) : undefined
      if (!typ) return fehlt('typ')
      if (!kante) return fehlt('kante')
      return { art: 'operation', operation: { op: 'entlangKante', kante, typ, beschriftung: str(a.beschriftung), abstand: num(a.abstand), anzahl: num(a.anzahl) } }
    }
    case 'neben':
    case 'unter':
    case 'ueber': {
      const id = str(a.id)
      const typ = typOf(a.typ)
      if (!id) return fehlt('id')
      if (!typ) return fehlt('typ')
      const gemeinsam = { id, typ, abstand: num(a.abstand), beschriftung: str(a.beschriftung), b: num(a.b), h: num(a.h) }
      if (aufruf.name === 'neben') {
        return { art: 'operation', operation: { op: 'neben', ...gemeinsam, seite: a.seite === 'links' ? 'links' : 'rechts' } }
      }
      return { art: 'operation', operation: aufruf.name === 'unter' ? { op: 'unter', ...gemeinsam } : { op: 'ueber', ...gemeinsam } }
    }
    case 'hinweis':
      return { art: 'hinweis', text: str(a.text) ?? '' }
    case 'fertig':
      return { art: 'fertig', text: str(a.zusammenfassung) ?? '' }
    default:
      return { art: 'fehler', text: `Unbekannte Funktion „${aufruf.name}“` }
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const TYPEN_ZEILEN = SYMBOL_ARTEN.map((t) => `- ${t}: ${TYP_BESCHREIBUNG[t]}`).join('\n')

const GRUNDREGELN = `Du bearbeitest die Lageskizze einer Kleingartenparzelle für ein Wertermittlungsprotokoll.
Du antwortest AUSSCHLIESSLICH mit Function Calls, nie mit Fließtext.

Koordinaten: Promille des Grundstücks. x = 0 links, 1000 rechts; y = 0 oben, 1000 unten. Bei absoluten
Funktionen sind x/y die MITTE des Elements. Das Bild zeigt dieselbe Szene (grüne Wiese = Grundstück).
Im JSON stehen alle Elemente mit id, Typ, Kasten (x, y = linke obere Ecke; b, h = Breite, Höhe) und Text t.
"fest":1 = Bau-Element (Laube, ASG, Terrasse …): nie ändern, nie löschen, nur als Bezug nutzen.

Elementtypen (nur diese):
${TYPEN_ZEILEN}

Regeln:
- Bevorzuge relative Funktionen (neben, unter, ueber, reihe, entlangKante); Zahlen rechnet der Code, nicht du.
- Bezugselemente immer über ihre id aus dem JSON ansprechen (z. B. „ASG“ → id des Elements mit t „ASG“).
- „X entfernen“ / „X muss weg“: typ=entfernen mit beschriftung „X entfernen“ (z. B. „Holzpferd entfernen“). Kein zweites Symbol.
- Vorhandene Dinge, die bleiben: passender Typ (holzpferd, schaukel, baum …). Unbekannter Gegenstand: typ=gegenstand mit seinem Namen als beschriftung.
- Beschriftungen auf Deutsch, kurz, so wie der Nutzer sie sagt (Artnamen, „Hochbeete“, „Brunnen“).
- Nichts erfinden, was der Nutzer nicht gesagt hat. Ist etwas unklar, rufe hinweis mit einer kurzen Rückfrage auf.
- Mehrere Dinge in einer Nachricht: mehrere Function Calls, in der Reihenfolge des Satzes.`

export const SYSTEM_BEARBEITEN = `${GRUNDREGELN}

Aufgabe: Setze die Nachricht des Nutzers um. Beispiele:
- „oben drei Beete nebeneinander“ → reihe(typ=beet, anzahl=3, bereich={x1:150,y1:60,x2:850,y2:180}, beschriftung=„Beete“)
- „rechts eine Hecke am Zaun entlang“ → entlangKante(kante=rechts, typ=hecke)
- „links neben das Holzpferd eine Schaukel“ → neben(id=<id Holzpferd>, typ=schaukel, seite=links)
- „der Apfelbaum steht unten links“ → hinzufuegen(typ=baum, x=150, y=800, beschriftung=„Apfel“)`

export const SYSTEM_PRUEFEN = `${GRUNDREGELN}

Aufgabe: Selbstprüfung. Die Änderungen wurden angewendet; das Bild zeigt das Ergebnis. Prüfe nur:
1. Überlappen sich Elemente unschön? 2. Liegt etwas außerhalb des Grundstücks? 3. Verdeckt etwas eine Beschriftung?
Dazu kommen die Befunde des Codes. Korrigiere NUR echte Fehler dieser drei Arten mit möglichst wenigen Function Calls
(meist verschieben). Ändere nichts, was der Nutzer so gewünscht hat. Passt alles, rufe nur fertig auf.`

export function baueNachricht(szeneJson: string, nachricht: string): string {
  return `Szene (JSON):\n${szeneJson}\n\nNachricht des Nutzers:\n${nachricht}`
}

export function bauePruefNachricht(szeneJson: string, nachricht: string, befunde: string[]): string {
  return (
    `Szene nach den Änderungen (JSON):\n${szeneJson}\n\nUrsprüngliche Nachricht des Nutzers:\n${nachricht}\n\n` +
    `Befunde des Codes:\n${befunde.length ? befunde.map((b) => `- ${b}`).join('\n') : '- keine'}`
  )
}
