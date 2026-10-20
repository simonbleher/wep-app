// Kleine Helfer für Bezeichnungen und deutsche Zahlen in der Erfassung.
//
// Reine Funktionen ohne DOM – in src/gruen/__tests__/format.test.ts getestet.

import type { Position as KatalogPosition, Variante as KatalogVariante } from '@/katalog'
import { normalisiere } from '@/katalog/util'

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

/**
 * Liest eine vom Nutzer eingegebene Zahl. Akzeptiert Komma und Punkt als
 * Dezimaltrenner sowie Leerzeichen; Tausenderpunkte werden erkannt, wenn
 * zusätzlich ein Komma vorkommt („1.234,5“). Ungültig → NaN.
 */
export function leseZahl(eingabe: string): number {
  let s = eingabe.trim().replace(/\s/g, '').replace(/€$/, '')
  if (!s) return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN
  return Number(s)
}

/** Wie leseZahl, aber mit Ersatzwert für leere/ungültige Eingaben. */
export function leseZahlOder(eingabe: string, ersatz: number): number {
  const n = leseZahl(eingabe)
  return Number.isFinite(n) ? n : ersatz
}

/** Deutsche Darstellung ohne überflüssige Nachkommastellen: 0.75 → „0,75“. */
export function zahlDe(wert: number, maxNachkomma = 2): string {
  return wert.toLocaleString('de-DE', { maximumFractionDigits: maxNachkomma })
}

/** Zahl für ein Eingabefeld (deutsches Komma, ohne Tausenderpunkt). */
export function zahlFuerEingabe(wert: number): string {
  return zahlDe(wert, 2).replace(/\./g, '')
}

// ---------------------------------------------------------------------------
// Bezeichnungen
// ---------------------------------------------------------------------------

/** Kürzt Altersangaben: „5 bis 30 Jahre“ → „5–30 J.“, „über 30 Jahre“ → „über 30 J.“ */
export function kurzeAltersstufe(alter: string): string {
  return alter
    .replace(/(\d+)\s*bis\s*(\d+)/, '$1–$2')
    .replace(/\s*Jahre?\b/, ' J.')
    .replace(/\s+und älter/, '+')
    .trim()
}

/** Entfernt Beispiel-Klammern wie „(z. B. Liguster)“ und doppelte Leerzeichen. */
function ohneBeispiel(text: string): string {
  return text.replace(/\s*\(z\.\s*B\.[^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim()
}

/** Merkmale einer Variante in Kurzform, z. B. „Halbstamm, 5–30 J.“ */
export function variantenMerkmale(v: KatalogVariante | undefined): string {
  if (!v) return ''
  return [v.form, v.altersstufe && kurzeAltersstufe(v.altersstufe), v.groesse, v.material, v.ausfuehrung, v.typ]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map(ohneBeispiel)
    .join(', ')
}

/**
 * Findet die Art (oder das Synonym), über die eine Katalog-Position gefunden
 * wurde, z. B. Suche „Liguster“ → „Liguster“ bei der Hecke. Bei Einträgen wie
 * „Thuja/Lebensbaum“ wird der passende Teil geliefert. Ohne Treffer: undefined.
 */
export function gefundeneArt(pos: KatalogPosition, suchbegriff: string): string | undefined {
  // Suchwörter, die nur den Positionsnamen anfangen („Rasen“ bei „Rasen“ → „Rasengräser“),
  // nennen keine Art: die Position behält ihren Namen.
  const nameWoerter = normalisiere(grundbezeichnung(pos)).split(/[^a-z0-9]+/).filter(Boolean)
  const tokens = normalisiere(suchbegriff)
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !nameWoerter.some((w) => w.startsWith(t)))
  if (tokens.length === 0) return undefined
  const kandidaten = [...(pos.arten ?? []), ...(pos.synonyme ?? [])]
  for (const eintrag of kandidaten) {
    for (const teil of eintrag.split('/').map((t) => t.trim())) {
      const norm = normalisiere(teil)
      if (tokens.some((t) => norm === t || norm.startsWith(t) || t.startsWith(norm))) {
        return teil.replace(/\s*\(.*\)\s*$/, '')
      }
    }
  }
  return undefined
}

/** Grundbezeichnung einer Katalog-Position ohne Einheiten-Klammer: „Hecke (je m)“ → „Hecke“. */
function grundbezeichnung(pos: KatalogPosition): string {
  return ohneBeispiel(pos.bezeichnung.replace(/\s*\((je|pro)\s[^)]*\)/gi, ''))
}

/**
 * Kurze, fachliche Bezeichnung für die Excel-Spalte „Art“.
 *
 * - mit gefundener Art bei Hecken: „Liguster-Hecke (Laub, einfache Art)“
 * - mit gefundener Art sonst:      „Apfel, Halbstamm, 5–30 J.“
 * - ohne Art:                      „Obstgehölz, Halbstamm, 5–30 J.“
 */
export function kurzeBezeichnung(
  pos: KatalogPosition,
  variante?: KatalogVariante,
  art?: string,
): string {
  const merkmale = variantenMerkmale(variante)
  const grund = grundbezeichnung(pos)
  if (art && /^hecke/i.test(grund)) {
    return merkmale ? `${art}-Hecke (${merkmale})` : `${art}-Hecke`
  }
  const name = art ?? grund
  return merkmale ? `${name}, ${merkmale}` : name
}
