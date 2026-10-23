// Schreibt die Test-Bau-Excel für Beta 5, Paket 1: erfundene Formalien und handgezeichnete Formen im Blatt „Skizze Bau“
// (Grundstück, Pfosten, Laube, Schuppen, Anbau in L-Form, Terrasse, Keller gestrichelt, Maßlinie) – aus docs/WEP_Vorlage.xlsx.
// Aufruf: npx vite-node tools/beta5-paket1/erzeuge-test-bau-excel.ts -- <Ziel.xlsx>
import { writeFileSync } from 'node:fs'
import { erzeugeTestBauExcel } from '../../src/bauexcel/testBauExcel'

const ziel = process.argv.slice(2).filter((a) => a !== '--')[0]
if (!ziel) throw new Error('Zieldatei fehlt')
writeFileSync(ziel, await erzeugeTestBauExcel({ skizzeBau: true }))
console.log(ziel)
