// Erzeugt das Beispiel-WEP für die Anleitung (erfundene Daten): Parzelle, Grundriss, Aufwuchs, Außenanlagen, Beseitigung,
// Bau-Teil und eine fertige Grün-Skizze (aus docs/skizze-agent/beispiel-vorschlag.json).
// Aufruf: npx vite-node --config tools/ki-test/vite.config.ts tools/anleitung/beispiel.ts -- <ziel.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { testWep } from '../../src/agent/__tests__/testwep'
import { pruefeVorschlag } from '../../src/agent/vorschlag'
import { wendeVorschlagAn } from '../../src/skizze/editorZustand'

const ziel = process.argv.at(-1)!
let wep = testWep()
wep = {
  ...wep,
  id: '7c1e9f4a-2b3d-4c5e-8f60-1a2b3c4d5e6f',
  rolle: 'beides',
  formalien: {
    ...wep.formalien,
    vorgangsNr: '2026-152',
    kleingartenanlage: 'Rosenthal-Süd',
    unterpaechter: 'Erika Musterfrau',
    auftraggeber: 'Erika Musterfrau',
    anwesendVerein: 'Max Mustermann',
    wertermittlerBaulichkeiten: 'Hans Beispiel',
    wertermittlerAussenAufwuchs: 'Hans Beispiel',
  },
  bau: {
    ...wep.bau!,
    bauteile: wep.bau!.bauteile.map((b) =>
      b.art === 'laube'
        ? { ...b, baujahr: 1985, baujahrQuelle: 'lt. Angabe', material: 'stein' as const, wanddickeCm: 24 }
        : { ...b, baujahr: 1992, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig' as const, wanddickeCm: 10 },
    ),
  },
}
const vorschlag = JSON.parse(readFileSync('docs/skizze-agent/beispiel-vorschlag.json', 'utf-8'))
const g = pruefeVorschlag(vorschlag, wep, wep.skizze)
if (!g.ok) throw new Error(JSON.stringify(g.fehler))
wep = { ...wep, skizze: { ...wep.skizze!, elemente: wendeVorschlagAn(wep.skizze!.elemente, { elemente: g.elemente, modus: 'ergaenzen' }) } }
writeFileSync(ziel, JSON.stringify(wep))
console.log(`Beispiel-WEP ${wep.formalien.vorgangsNr} → ${ziel}`)
