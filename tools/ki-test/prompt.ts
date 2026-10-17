// Baut den System-Prompt aus prompt-aufnahme.md + kompaktem Katalog und
// definiert das Antwort-Schema (Gemini responseSchema). Die KI liefert NUR
// Zuordnungen, nie Preise – die rechnet die App (berechnePreisvorschlag).

import { readFileSync } from 'node:fs'
import type { Position as KatalogPosition, Variante } from '@/katalog/types'

export const ZUSTAENDE = ['sehr gut', 'gut', 'mittel', 'schlecht'] as const
export type Zustand = (typeof ZUSTAENDE)[number]

/** Eine Zeile der KI-Antwort (und von erwartet.json). */
export interface KiZeile {
  katalogId: string | null
  varianteIndex: number | null
  anzahl: number
  einheit: string
  bezeichnung: string
  zustand: Zustand
  unsicher: boolean
  grund: string
}

export interface KiAntwort {
  positionen: KiZeile[]
  kurzbeschreibung: string
}

/** Merkmale einer Variante ohne Preis, z. B. „Halbstamm, 5 bis 30 Jahre“. */
export function variantenText(v: Variante): string {
  return Object.entries(v)
    .filter(([k]) => k !== 'hoechstwert')
    .map(([, w]) => String(w))
    .join(', ')
}

/**
 * Kompakter Katalog für den Prompt: eine Zeile je Position, ohne Höchstwerte.
 * Format: id | Bezeichnung | Einheit | Varianten (Index=Merkmale) | Arten/Synonyme
 */
export function kompakterKatalog(positionen: KatalogPosition[]): string {
  return positionen
    .map((p) => {
      const varianten = p.varianten?.length
        ? p.varianten.map((v, i) => `${i}=${variantenText(v)}`).join('; ')
        : '–'
      const begriffe = [...(p.synonyme ?? []), ...p.arten].join(', ') || '–'
      return `${p.id} | ${p.bezeichnung} | ${p.einheit} | ${varianten} | ${begriffe}`
    })
    .join('\n')
}

export function baueSystemPrompt(vorlagePfad: string, positionen: KatalogPosition[]): string {
  const vorlage = readFileSync(vorlagePfad, 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '')
  if (!vorlage.includes('{{KATALOG}}')) throw new Error(`{{KATALOG}} fehlt in ${vorlagePfad}`)
  return vorlage.replace('{{KATALOG}}', kompakterKatalog(positionen))
}

export function antwortSchema(katalogIds: string[]) {
  const felder = ['katalogId', 'varianteIndex', 'anzahl', 'einheit', 'bezeichnung', 'zustand', 'unsicher', 'grund']
  return {
    type: 'OBJECT',
    properties: {
      positionen: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            katalogId: { type: 'STRING', nullable: true, enum: katalogIds, description: 'id aus dem Katalog oder null' },
            varianteIndex: { type: 'INTEGER', nullable: true, description: 'Index der Variante oder null' },
            anzahl: { type: 'NUMBER' },
            einheit: { type: 'STRING' },
            bezeichnung: { type: 'STRING' },
            zustand: { type: 'STRING', enum: [...ZUSTAENDE] },
            unsicher: { type: 'BOOLEAN' },
            grund: { type: 'STRING' },
          },
          required: felder,
          propertyOrdering: felder,
        },
      },
      kurzbeschreibung: { type: 'STRING' },
    },
    required: ['positionen', 'kurzbeschreibung'],
    propertyOrdering: ['positionen', 'kurzbeschreibung'],
  }
}
