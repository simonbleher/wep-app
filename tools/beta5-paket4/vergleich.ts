// Optischer Vergleich des PDF-Exports mit dem LibreOffice-PDF der Excel-Datei (Beta 5, Paket 4):
//
//   npm run beta5-paket4:vergleich
//
// Für jeden erfundenen Fall (src/pdf/testFaelle.ts): Excel wie im Export-Reiter erzeugen (mit Skizzen-Formen), mit
// LibreOffice (immer neu berechnen) in PDF umwandeln, daneben das PDF der App. Zu jedem gedruckten Blatt entsteht ein
// Bild „links: PDF der App, rechts: LibreOffice-PDF der Excel“ in docs/beta5-paket4/vergleich/.
// Braucht libreoffice, pdftoppm, pdftotext und Python mit Pillow.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { erzeugeTestBauExcel } from '../../src/bauexcel/testBauExcel'
import { exportWep } from '../../src/export'
import { grundrissZuFormen } from '../../src/export/grundrissFormen'
import { skizzeDatenZuFormen } from '../../src/export/skizzeFormen'
import { neueBauDaten, type Wep } from '../../src/model'
import { erzeugePdf } from '../../src/pdf'
import { testFaelle } from '../../src/pdf/testFaelle'
import { svgZuPngNode } from '../ki-test/skizze/formen'

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ZIEL = join(WURZEL, 'docs', 'beta5-paket4', 'vergleich')
const bytes = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** Kennzeichnende Überschrift je Blatt (wie sie im LibreOffice-PDF auf der Seite steht). */
const UEBERSCHRIFT: Record<string, string[]> = {
  'Deckbl UPV': ['Wertermittlung bei Unterpächterwechsel'],
  Baulichkeiten: ['Anlage 1 (Blatt 1) – Bewertung Baulichkeiten', 'Anlage 1 (Blatt 2) – Bewertung von Baulichkeiten'],
  Mängelliste: ['Mängeltabelle für Ermittlung'],
  Außenanlagen: ['Anlage 2 – Bewertung Außenanlagen'],
  'Aufwuchs I': ['Anlage 3 – Bewertung Aufwuchs'],
  'Aufwuchs II': ['Anlage 3a – Bewertung Aufwuchs'],
  Beseitigungskosten: ['Anlage 4 (Blatt 1) – Beseitigungskosten'],
  'Skizze Bau': ['Skizze – Baulichkeiten'],
  'Skizze Außenanlage-Aufwuchs': ['Skizze – Außenanlagen und Aufwuchs'],
  Abkürzungsverzeichnis: ['Abkürzungen'],
}
const DATEI: Record<string, string> = { 'Deckbl UPV': 'deckblatt', Baulichkeiten: 'baulichkeiten', Mängelliste: 'maengelliste', Außenanlagen: 'aussenanlagen', 'Aufwuchs I': 'aufwuchs-1', 'Aufwuchs II': 'aufwuchs-2', Beseitigungskosten: 'beseitigung', 'Skizze Bau': 'skizze-bau', 'Skizze Außenanlage-Aufwuchs': 'skizze-gruen', Abkürzungsverzeichnis: 'abkuerzungen' }

/** Mit welchen Fällen welche Blätter gezeigt werden (alle Fälle zu zeigen wären zu viel). */
const ZEIGE: Record<string, string[]> = {
  'Grün einfach': ['Deckbl UPV', 'Außenanlagen', 'Aufwuchs I', 'Beseitigungskosten', 'Skizze Außenanlage-Aufwuchs'],
  'Grün voll': ['Außenanlagen', 'Aufwuchs I', 'Aufwuchs II'],
  'Bau normal': ['Deckbl UPV', 'Baulichkeiten', 'Mängelliste', 'Beseitigungskosten', 'Skizze Bau'],
  Beides: ['Deckbl UPV', 'Baulichkeiten', 'Skizze Bau', 'Skizze Außenanlage-Aufwuchs'],
  'Bau abgeschrieben': ['Baulichkeiten'],
}

function seiteMit(pdf: string, ueberschrift: string, nth = 0): number {
  const n = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? 0)
  let gefunden = 0
  for (let i = 1; i <= n; i++) {
    const t = execFileSync('pdftotext', ['-f', String(i), '-l', String(i), pdf, '-']).toString().replace(/\s+/g, ' ')
    if (t.includes(ueberschrift) && gefunden++ === nth) return i
  }
  throw new Error(`Seite mit „${ueberschrift}“ nicht gefunden (${pdf})`)
}

async function main() {
  rmSync(ZIEL, { recursive: true, force: true })
  mkdirSync(ZIEL, { recursive: true })
  const tmp = mkdtempSync(join(tmpdir(), 'pdf-vergleich-'))
  try {
    const vorlage = bytes(readFileSync(join(WURZEL, 'docs', 'WEP_Vorlage.xlsx')))
    const bauExcel = bytes(await erzeugeTestBauExcel({ skizzeBau: true }))
    // LibreOffice: immer neu berechnen
    const profil = join(tmp, 'profil')
    mkdirSync(join(profil, 'user'), { recursive: true })
    writeFileSync(
      join(profil, 'user', 'registrymodifications.xcu'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>\n</oor:items>\n',
    )

    for (const f of testFaelle()) {
      const zeige = ZEIGE[f.name.split(' (')[0]] ?? ZEIGE[f.name]
      if (!zeige) continue
      const stamm = f.name.split(' (')[0].toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const quelle = f.mitBauExcel ? bauExcel : vorlage
      const ohneBau = !f.wep.bau && !f.mitBauExcel
      const wep: Wep = ohneBau ? { ...f.wep, bau: neueBauDaten() } : f.wep
      const teil = ohneBau && f.rolle === 'gruen' ? 'beides' : f.rolle
      const skizze = wep.skizze
      const grundriss = wep.grundriss
      // Excel wie im Export-Reiter
      const excel = await exportWep(wep, quelle, {
        teil,
        skizzeFormen: skizze?.elemente.length ? { elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(skizze, zeichenbereich, { grundlage: !hatFormen }), rasterisiere: svgZuPngNode } : undefined,
        grundrissFormen: grundriss?.teile.length ? { elemente: ({ zeichenbereich }) => grundrissZuFormen(grundriss, zeichenbereich, wep.bau?.bauteile ?? []) } : undefined,
      })
      const xlsxDatei = join(tmp, `${stamm}.xlsx`)
      writeFileSync(xlsxDatei, new Uint8Array(await excel.blob.arrayBuffer()))
      execFileSync('libreoffice', [`-env:UserInstallation=file://${profil}`, '--headless', '--convert-to', 'pdf', '--outdir', tmp, xlsxDatei], { stdio: 'ignore', timeout: 280_000 })
      const loPdf = join(tmp, `${stamm}.pdf`)

      // PDF der App (aus dem Excel ohne Formen, wie in der App)
      const app = await erzeugePdf(await (await exportWep(wep, quelle, { teil })).blob.arrayBuffer(), {
        rolle: f.rolle,
        skizzen: { gruen: skizze?.elemente.length ? skizze : undefined, grundriss: grundriss?.teile.length ? { daten: grundriss, bauteile: wep.bau?.bauteile ?? [] } : undefined },
      })
      const appDatei = join(tmp, `${stamm}-app.pdf`)
      writeFileSync(appDatei, app.bytes)

      let seitenNr = 0
      for (const b of app.blaetter) {
        const ersteSeite = seitenNr + 1
        seitenNr += b.seiten.length
        if (!zeige.includes(b.blatt)) continue
        for (const [i] of b.seiten.entries()) {
          const lo = seiteMit(loPdf, UEBERSCHRIFT[b.blatt][Math.min(i, UEBERSCHRIFT[b.blatt].length - 1)])
          const a = join(tmp, 'a'), l = join(tmp, 'l')
          execFileSync('pdftoppm', ['-f', String(ersteSeite + i), '-l', String(ersteSeite + i), '-png', '-r', '80', '-singlefile', appDatei, a])
          execFileSync('pdftoppm', ['-f', String(lo), '-l', String(lo), '-png', '-r', '80', '-singlefile', loPdf, l])
          const name = `${stamm}-${DATEI[b.blatt]}${b.seiten.length > 1 ? `-${i + 1}` : ''}.png`
          execFileSync('python3', [join(WURZEL, 'tools/beta5-paket4/nebeneinander.py'), `${a}.png`, `${l}.png`, join(ZIEL, name), `PDF der App - ${f.name} - ${b.blatt}`, 'LibreOffice-PDF der Excel-Datei'])
          console.log(name)
        }
      }
      writeFileSync(join(ZIEL, `${stamm}.pdf`), app.bytes)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
