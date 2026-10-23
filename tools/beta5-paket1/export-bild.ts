// Sichtprüfung des Exports mit Grundlage (Beta 5, Paket 1):
//
//   npm run beta5-paket1:export-bild
//
// Ablauf: Test-Bau-Excel mit handgezeichneten Formen (erfundene Daten) erzeugen → Grundlage aus „Skizze Bau“ einlesen →
// Grün-Elemente darüber legen → exportieren → mit LibreOffice (→ PDF) und pdftoppm (→ PNG) rendern.
// Ergebnis in docs/beta5-paket1/: Test-Bau-Excel.xlsx, export-aufwuchs.xlsx,
// excel-skizze-bau.png (Original, unverändert) und excel-skizze-aussenanlage-aufwuchs.png (Grundlage + Grün).

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { exportWep } from '../../src/export'
import { leseBauSkizze } from '../../src/export/bauSkizzeLesen'
import { skizzeDatenZuFormen } from '../../src/export/skizzeFormen'
import { erzeugeTestBauExcel } from '../../src/bauexcel/testBauExcel'
import { neuerWep } from '../../src/model'
import { uebernehmeGrundlage } from '../../src/skizze/grundlage'
import { leereSkizze, type SkizzeDaten, type SkizzeSymbol } from '../../src/skizze/types'
import { svgZuPngNode } from '../ki-test/skizze/formen'

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const sym = (id: string, art: SkizzeSymbol['art'], x: number, y: number, breite: number, hoehe: number, beschriftung?: string): SkizzeSymbol => ({
  id, typ: 'symbol', art, x, y, breite, hoehe, ...(beschriftung ? { beschriftung } : {}),
})

/** Beispiel-Grün auf der Fläche 600 × 825 (Grundstück ≈ x 11–589, y 11–814). */
export const BEISPIEL_GRUEN = [
  sym('g1', 'weg', 235, 345, 60, 425, 'Weg'),
  sym('g2', 'tor', 235, 770, 60, 40),
  sym('g3', 'hecke', 30, 380, 30, 300, 'Fliederhecke'),
  sym('g4', 'baum', 450, 580, 50, 62, 'Apfel'),
  sym('g5', 'baum', 40, 25, 56, 70, 'Bergahorn'),
  sym('g6', 'kompost', 470, 360, 70, 40, 'Kompost'),
  sym('g7', 'beet', 340, 500, 90, 45, 'Beet'),
  sym('g8', 'mangelhinweis', 330, 690, 120, 28, 'Rückschnitt'),
]

async function main() {
  const ziel = join(WURZEL, 'docs', 'beta5-paket1')
  mkdirSync(ziel, { recursive: true })
  const bauExcel = await erzeugeTestBauExcel({ skizzeBau: true })
  const bauDatei = join(ziel, 'Test-Bau-Excel.xlsx')
  writeFileSync(bauDatei, bauExcel)

  const lesen = await leseBauSkizze(bauExcel)
  const erg = uebernehmeGrundlage(leereSkizze(), { art: 'excel', lesen, excelName: 'Test-Bau-Excel.xlsx' }, '2026-10-23T10:00:00.000Z')!
  console.log(`Grundlage: ${erg.anzahl} Formen, Hinweise: ${erg.hinweise.join(' | ') || '-'}`)
  const skizze: SkizzeDaten = { ...erg.daten, elemente: [...erg.daten.elemente, ...BEISPIEL_GRUEN] }

  const wep = neuerWep('2026-501')
  wep.formalien.unterpaechter = 'Erika Musterfrau'
  wep.skizze = skizze
  const r = await exportWep(wep, bauExcel, {
    skizzeFormen: {
      elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(skizze, zeichenbereich, { grundlage: !hatFormen }),
      rasterisiere: svgZuPngNode,
    },
  })
  console.log(`Export: ${r.skizzeFormen?.anzahlFormen} Formen (${r.skizzeFormen?.svgBilder} SVG-Bilder), Wiese ergänzt: ${r.skizzeFormen?.graswiese}`)
  const xlsx = join(ziel, 'export-aufwuchs.xlsx')
  writeFileSync(xlsx, new Uint8Array(await r.blob.arrayBuffer()))

  const tmp = mkdtempSync(join(tmpdir(), 'grundlage-'))
  try {
    const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find((p) => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0) ?? 'soffice'
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, xlsx], { stdio: 'ignore', timeout: 240_000 })
    const pdf = join(tmp, 'export-aufwuchs.pdf')
    const seiten = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? 0)
    const finde = (titel: string) => {
      for (let i = seiten; i >= 1; i--) if (execFileSync('pdftotext', ['-f', String(i), '-l', String(i), pdf, '-']).toString().includes(titel)) return i
      throw new Error(`Seite mit „${titel}“ nicht gefunden`)
    }
    for (const [titel, name] of [
      ['Skizze – Baulichkeiten', 'excel-skizze-bau'],
      ['Skizze – Außenanlagen und Aufwuchs', 'excel-skizze-aussenanlage-aufwuchs'],
    ] as const) {
      const seite = finde(titel)
      execFileSync('pdftoppm', ['-f', String(seite), '-l', String(seite), '-png', '-r', '110', '-singlefile', pdf, join(ziel, name)])
      console.log(`Bild: docs/beta5-paket1/${name}.png (Seite ${seite})`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
