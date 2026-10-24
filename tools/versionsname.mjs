// Versionsname der App: Haupt- und Nebenversion aus package.json, die letzte Stelle ist die Freigabe-Nummer.
// Die Nummer steht in der Datei RELEASE_NR im Branch `release`; der Workflow „Version freigeben“ zählt sie bei jeder
// Freigabe um 1 hoch (docs/FREIGABE.md). Ohne die Datei (main, lokal) gilt die Zahl aus package.json.
// Aufruf: node tools/versionsname.mjs
import { existsSync, readFileSync } from 'node:fs'

export function versionsname(wurzel = '.') {
  const basis = JSON.parse(readFileSync(`${wurzel}/package.json`, 'utf-8')).version
  const datei = `${wurzel}/RELEASE_NR`
  if (!existsSync(datei)) return basis
  const nr = Number.parseInt(readFileSync(datei, 'utf-8').trim(), 10)
  if (!Number.isInteger(nr) || nr < 1) return basis
  const [haupt, neben] = basis.split('.')
  return `${haupt}.${neben}.${nr}`
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(versionsname())
