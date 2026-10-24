// Erzeugt docs/skizze-agent/beispiel-vorschlag.json: ein Beispiel-Vorschlag im Format wep-skizze/2, zusammengesetzt aus Grundformen
// (teils von Hand, teils aus window.wep.skizze.baustein). Aufruf: npx vite-node tools/skizze-agent/erzeuge-beispiel.ts
import { writeFileSync } from 'node:fs'
import { baustein } from '../../src/agent/bausteine'
import type { FormatElement } from '../../src/agent/format'

const teil = (name: string, p: Record<string, unknown>, bezug?: FormatElement['bezug']): FormatElement[] => {
  const r = baustein(name, p)
  if (!r.ok) throw new Error(JSON.stringify(r.fehler))
  // Bezug auf eine Position nur am ersten Element des Gegenstands
  return r.elemente.map((e, i) => (i === 0 && bezug ? { ...e, bezug } : e))
}

const elemente: FormatElement[] = [
  // Wiese als Füllung (Vieleck mit schräger Seite) und ein Dreieckbeet mit eigener Linienfarbe
  { typ: 'vieleck', name: 'Wiese', punkte: [{ x: 1, y: 1 }, { x: 17, y: 1 }, { x: 17, y: 8 }, { x: 1, y: 9 }], stil: 'wiese', beschriftung: 'Wiese' },
  { typ: 'vieleck', name: 'Dreieckbeet', punkte: [{ x: 7, y: 3 }, { x: 10.5, y: 3 }, { x: 7, y: 6 }], fuellung: '#EBDDC7', linie: '#7030A0', linienbreite: 2 },
  // Weg mit Tor: Rechteck, senkrechte Linie und Viertelbogen
  { typ: 'rechteck', name: 'Weg', x: 9, y: 21, breite: 1.4, hoehe: 8, fuellung: '#EDE4D3', linie: '#A6A6A6', beschriftung: 'Weg' },
  { typ: 'linie', name: 'Tor', von: { x: 10.4, y: 24.6 }, nach: { x: 10.4, y: 25.8 }, farbe: '#262626', linienbreite: 2 },
  { typ: 'bogen', name: 'Tor_Bogen', x: 10.4, y: 25.8, breite: 2.4, hoehe: 2.4, startWinkel: 180, endWinkel: 270, linie: '#262626' },
  // Bäume mit Bezug zu den Aufwuchs-Positionen (Bezug am ersten Element je Baum)
  ...teil('baum', { x: 14, y: 5, beschriftung: 'Apfel' }, { liste: 'aufwuchs', id: 'p-apfel' }),
  ...teil('baum', { x: 15.2, y: 11, beschriftung: 'Apfel' }, { liste: 'aufwuchs', id: 'p-apfel' }),
  ...teil('baum', { x: 15, y: 18, beschriftung: 'Birne' }, { liste: 'aufwuchs', id: 'p-birne' }),
  // Heckenreihe entlang der rechten Grenze
  ...teil('hecke', { x: 17.2, y: 12, breite: 0.9, hoehe: 9, beschriftung: 'Liguster' }, { liste: 'aufwuchs', id: 'p-hecke' }),
  ...teil('kompost', { x: 2, y: 22, breite: 1.6, hoehe: 1 }),
  // zu entfernende Blaufichte: Stern mit rotem X und Hinweis
  ...teil('entfernen', { x: 3, y: 12, beschriftung: 'Blaufichte entfernen' }, { liste: 'aufwuchs', id: 'p-fichte' }),
  // Mängelhinweis mit Pfeil und ein zusätzlicher Pfeil
  ...teil('mangelhinweis', { x: 5, y: 19, breite: 4, hoehe: 0.9, beschriftung: 'Rückschnitt nötig', ziel: { x: 8, y: 22 } }),
  { typ: 'linie', name: 'Pfeil', von: { x: 12, y: 3 }, nach: { x: 13.5, y: 4.5 }, farbe: '#C00000', linienbreite: 1.5, pfeil: true },
  { typ: 'massangabe', name: 'Mass_Breite', von: { x: 1, y: 0.4 }, nach: { x: 17, y: 0.4 }, beschriftung: '16 m', farbe: '#C00000' },
]
writeFileSync('docs/skizze-agent/beispiel-vorschlag.json', JSON.stringify({ format: 'wep-skizze/2', modus: 'ergaenzen', elemente }, null, 1) + '\n')
console.log(`${elemente.length} Elemente`)
