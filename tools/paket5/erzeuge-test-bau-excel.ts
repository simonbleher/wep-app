// Schreibt eine Test-Bau-Excel (erfundene Werte, aus der Vorlage) in die angegebene Datei.
// Aufruf: npx vite-node tools/paket5/erzeuge-test-bau-excel.ts -- <Ziel.xlsx> [abweichend]
// „abweichend“: Parzelle und Unterpächter weichen von den Testdaten der Screenshots ab.
import { writeFileSync } from 'node:fs'
import { erzeugeTestBauExcel, TEST_FORMALIEN } from '../../src/bauexcel/testBauExcel'

const args = process.argv.slice(2).filter((a) => a !== '--')
const ziel = args[0]
if (!ziel) throw new Error('Zieldatei fehlt')
const werte = args[1] === 'abweichend' ? { ...TEST_FORMALIEN, E4: 'Parzelle 17', E6: 'Max Beispielmann' } : TEST_FORMALIEN
writeFileSync(ziel, await erzeugeTestBauExcel({ werte }))
console.log(ziel)
