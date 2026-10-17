// Vergleichsbild für den Formen-Export (PR export/skizze-formen):
//
//   npm run ki-test-skizze-export                  Fall 1, Elemente aus soll.json
//   npm run ki-test-skizze-export -- --fall fall1
//   npm run ki-test-skizze-export -- --antwort tools/ki-test/ausgaben/skizze/<modell>/fall1.json
//
// Ablauf: Bau-Formen aus aussen-vorher.json als Drawing in die Vorlage schreiben → neue Elemente
// ausrichten (richteAus) → als Excel-Formen exportieren (exportWep) → mit LibreOffice rendern.
// Ergebnis: tools/ki-test/ergebnis-skizze/<fall>/formen-export.{xlsx,png}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportWep } from '../../src/export'
import { neuerWep } from '../../src/model'
import { richteAus, type BauForm } from './skizze/ausrichtung'
import { svgZuPngNode, vorlageMitBauFormen, zuordnungenZuFormen } from './skizze/formen'
import { rendereSkizzenBlatt } from './skizze/render'
import { stilprobe } from './skizze/stilprobe'
import { bereinigeAntwort } from './skizze/schema'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = resolve(HIER, '../..')
const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const fall = arg('fall') ?? 'fall1'
const dir = join(HIER, 'faelle-skizze', fall)
const antwortDatei = arg('antwort') ?? join(dir, 'soll.json')

async function main() {
  const formen = (JSON.parse(readFileSync(join(dir, 'aussen-vorher.json'), 'utf8')) as { formen: BauForm[] }).formen
  const { antwort, fehler } = bereinigeAntwort(JSON.parse(readFileSync(antwortDatei, 'utf8')))
  if (fehler.length) console.log('Hinweise zur Antwort:', fehler.join('; '))

  const ausrichtung = richteAus(antwort.elemente, antwort.grundstueck, formen)
  const elemente = zuordnungenZuFormen(ausrichtung)
  console.log(
    `${antwort.elemente.length} Elemente, davon ${ausrichtung.zuordnungen.filter((z) => z.neu).length} neu → ${elemente.length} Form-Elemente`,
  )

  const vorlageDatei = readFileSync(join(WURZEL, 'docs', 'WEP_Vorlage.xlsx'))
  const vorlage = vorlageDatei.buffer.slice(vorlageDatei.byteOffset, vorlageDatei.byteOffset + vorlageDatei.byteLength)
  const basis = await vorlageMitBauFormen(vorlage, formen)

  const wep = neuerWep(`ki-test-${fall}`)
  wep.formalien.unterpaechter = 'Erika Musterfrau'
  wep.formalien.vorgangsNr = `TEST-${fall}`
  const r = await exportWep(wep, basis, { skizzeFormen: { elemente, rasterisiere: svgZuPngNode } })
  console.log(
    `Export: ${r.skizzeFormen?.anzahlFormen} Formen (${r.skizzeFormen?.svgBilder} SVG-Bilder), Wiese ergänzt: ${r.skizzeFormen?.graswiese}`,
  )

  if (r.skizzeFormen?.verschoben.length) console.log(`Beschriftungen verschoben: ${r.skizzeFormen.verschoben.join(', ')}`)
  if (r.skizzeFormen?.versetzt.length) console.log(`Versetzt: ${r.skizzeFormen.versetzt.join(', ')}${r.skizzeFormen.verkleinert.length ? ` (verkleinert: ${r.skizzeFormen.verkleinert.join(', ')})` : ''}`)
  if (r.skizzeFormen?.ueberdeckt.length) console.log(`Überdeckt (nicht verschiebbar): ${r.skizzeFormen.ueberdeckt.join('; ')}`)

  const ziel = join(HIER, 'ergebnis-skizze', fall)
  mkdirSync(ziel, { recursive: true })
  const xlsx = new Uint8Array(await r.blob.arrayBuffer())
  writeFileSync(join(ziel, 'formen-export.xlsx'), xlsx)
  const vorher = await rendereSkizzenBlatt(basis)
  const nachher = await rendereSkizzenBlatt(xlsx)
  if (vorher.png) writeFileSync(join(ziel, 'formen-vorher.png'), vorher.png)
  if (nachher.png) writeFileSync(join(ziel, 'formen-export.png'), nachher.png)
  else {
    writeFileSync(join(ziel, 'formen-export.pdf'), nachher.pdf)
    console.log('Kein PDF→PNG-Werkzeug gefunden (python -m pip install pymupdf) – PDF geschrieben.')
  }
  // Stilprobe: alle Typen auf dem leeren Blatt der Vorlage (Wiese + Gras vom Export)
  const probe = await exportWep(wep, vorlage, {
    skizzeFormen: { elemente: ({ zeichenbereich }) => stilprobe(zeichenbereich), rasterisiere: svgZuPngNode },
  })
  const probeBild = await rendereSkizzenBlatt(await probe.blob.arrayBuffer())
  if (probeBild.png) writeFileSync(join(ziel, 'formen-stilprobe.png'), probeBild.png)
  console.log(`Stilprobe: ${probe.skizzeFormen?.anzahlFormen} Formen (${probe.skizzeFormen?.svgBilder} SVG-Bilder)`)
  console.log(`Ergebnis: ${ziel.replace(WURZEL, '.')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
