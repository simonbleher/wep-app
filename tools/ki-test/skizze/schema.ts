// Antwort-Schema für Assistent B (Skizzenfoto → Elemente) und Prompt-Aufbau.
// Die KI liefert NUR Typ, Lage (box_2d) und Text – Stil, Ausrichtung und
// Zeichnen übernimmt die App.

import { readFileSync } from 'node:fs'

export const ELEMENT_TYPEN = [
  'laube',
  'anbau',
  'terrasse',
  'lvp',
  'pavillon',
  'schuppen',
  'asg',
  'hw',
  'weg',
  'tor',
  'zugang',
  'kompost',
  'baum',
  'strauch',
  'hecke',
  'beet',
  'hochbeet',
  'brunnen',
  'schacht',
  'entfernen',
  'mangelhinweis',
  'massangabe',
  'text',
] as const
export type ElementTyp = (typeof ELEMENT_TYPEN)[number]

/** [ymin, xmin, ymax, xmax], 0–1000 bezogen auf das ganze Foto (Gemini-Format). */
export type Box2d = [number, number, number, number]

export interface SkizzenElement {
  typ: ElementTyp
  box_2d: Box2d
  beschriftung: string
  bezug: string
  wert: string
  unsicher: boolean
  grund: string
}

export interface SkizzenAntwort {
  grundstueck: Box2d | null
  elemente: SkizzenElement[]
}

/** soll.json: wie die Antwort, je Element optional `neu` (nicht in den Bau-Formen). */
export interface SkizzenSoll extends SkizzenAntwort {
  elemente: (SkizzenElement & { neu?: boolean })[]
}

export function baueSkizzenPrompt(vorlagePfad: string): string {
  const vorlage = readFileSync(vorlagePfad, 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '')
  if (!vorlage.includes('{{TYPEN}}')) throw new Error(`{{TYPEN}} fehlt in ${vorlagePfad}`)
  return vorlage.replace('{{TYPEN}}', ELEMENT_TYPEN.join(', '))
}

const BOX = {
  type: 'ARRAY',
  items: { type: 'INTEGER' },
  minItems: 4,
  maxItems: 4,
  description: '[ymin, xmin, ymax, xmax], 0–1000 bezogen auf das ganze Foto',
}

export function skizzenSchema() {
  const felder = ['typ', 'box_2d', 'beschriftung', 'bezug', 'wert', 'unsicher', 'grund']
  return {
    type: 'OBJECT',
    properties: {
      grundstueck: { ...BOX, nullable: true, description: 'Rahmen der Parzelle oder null' },
      elemente: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            typ: { type: 'STRING', enum: [...ELEMENT_TYPEN] },
            box_2d: BOX,
            beschriftung: { type: 'STRING' },
            bezug: { type: 'STRING' },
            wert: { type: 'STRING' },
            unsicher: { type: 'BOOLEAN' },
            grund: { type: 'STRING' },
          },
          required: felder,
          propertyOrdering: felder,
        },
      },
    },
    required: ['grundstueck', 'elemente'],
    propertyOrdering: ['grundstueck', 'elemente'],
  }
}

/** Antwort prüfen und bereinigen (Boxen sortieren/klemmen, unbekannte Typen verwerfen). */
export function bereinigeAntwort(roh: unknown): { antwort: SkizzenAntwort; fehler: string[] } {
  const fehler: string[] = []
  const r = (roh ?? {}) as Partial<SkizzenAntwort>
  const box = (b: unknown): Box2d | null => {
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number' || !isFinite(v))) return null
    const k = b.map((v) => Math.max(0, Math.min(1000, Math.round(v))))
    return [Math.min(k[0], k[2]), Math.min(k[1], k[3]), Math.max(k[0], k[2]), Math.max(k[1], k[3])]
  }
  const elemente: SkizzenElement[] = []
  for (const e of Array.isArray(r.elemente) ? r.elemente : []) {
    const b = box(e?.box_2d)
    if (!b) {
      fehler.push(`Box ungültig: ${e?.typ ?? '?'} „${e?.beschriftung ?? ''}“`)
      continue
    }
    if (!ELEMENT_TYPEN.includes(e.typ)) {
      fehler.push(`Typ unbekannt: ${e.typ}`)
      continue
    }
    elemente.push({
      typ: e.typ,
      box_2d: b,
      beschriftung: String(e.beschriftung ?? ''),
      bezug: String(e.bezug ?? ''),
      wert: String(e.wert ?? ''),
      unsicher: Boolean(e.unsicher),
      grund: String(e.grund ?? ''),
    })
  }
  return { antwort: { grundstueck: box(r.grundstueck), elemente }, fehler }
}
