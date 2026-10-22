// Sichtprüfung des Grundriss-Exports (Beta 4, Paket 3):
//
//   npm run beta4-paket3:export-bild
//
// Schreibt einen Beispiel-Grundriss (erfundene Daten) ins Blatt „Skizze Bau“ der Vorlage und rendert das Blatt
// mit LibreOffice (→ PDF) und pdftoppm (→ PNG). Ergebnis: docs/beta4-paket3/export-skizze-bau.{xlsx,png}

import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { exportWep, grundrissZuFormen } from '../../src/export'
import { neueBauDaten, neuerWep } from '../../src/model'
import { rechteckPunkte, type GrundrissDaten } from '../../src/skizze/grundriss'

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const BEISPIEL: GrundrissDaten = {
  massketten: true,
  teile: [
    { id: 'g1', kuerzel: 'L', bauteilId: 'b1', punkte: rechteckPunkte(2, 2, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
    { id: 'g2', kuerzel: 'A1', bauteilId: 'b2', punkte: rechteckPunkte(8, 3, 2, 3), hoehe: 2.3, dachform: 'flach' },
    { id: 'g3', kuerzel: 'S', punkte: rechteckPunkte(12, 8, 2.5, 2), hoehe: 2, dachform: 'pult', hoeheOben: 2.4 },
    {
      id: 'g4', kuerzel: 'K', gestrichelt: true, hoehe: 2,
      punkte: [{ x: 2, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 8.5 }, { x: 4, y: 8.5 }, { x: 4, y: 10 }, { x: 2, y: 10 }],
    },
  ],
}

async function main() {
  const datei = readFileSync(join(WURZEL, 'docs', 'WEP_Vorlage.xlsx'))
  const vorlage = datei.buffer.slice(datei.byteOffset, datei.byteOffset + datei.byteLength)
  const wep = neuerWep('2026-777')
  wep.formalien.unterpaechter = 'Erika Musterfrau'
  wep.bau = neueBauDaten()
  const bauteile = [{ id: 'b1', kuerzel: 'L' }, { id: 'b2', kuerzel: 'A1' }]
  const r = await exportWep(wep, vorlage, {
    teil: 'bau',
    grundrissFormen: { elemente: ({ zeichenbereich }) => grundrissZuFormen(BEISPIEL, zeichenbereich, bauteile) },
  })
  console.log(`Grundriss: ${r.grundriss?.anzahlFormen} Formen, verschoben: ${r.grundriss?.verschoben.join(', ') || '-'}`)
  const ziel = join(WURZEL, 'docs', 'beta4-paket3')
  mkdirSync(ziel, { recursive: true })
  const xlsx = join(ziel, 'export-skizze-bau.xlsx')
  writeFileSync(xlsx, new Uint8Array(await r.blob.arrayBuffer()))

  const tmp = mkdtempSync(join(tmpdir(), 'grundriss-'))
  try {
    const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find((p) => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0) ?? 'soffice'
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, xlsx], { stdio: 'ignore', timeout: 180_000 })
    const pdf = join(tmp, 'export-skizze-bau.pdf')
    const seiten = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? 0)
    let seite = 0
    for (let i = 1; i <= seiten; i++) {
      const text = execFileSync('pdftotext', ['-f', String(i), '-l', String(i), pdf, '-']).toString()
      if (text.includes('Massenberechnung')) seite = i
    }
    if (!seite) throw new Error('Seite „Skizze Bau“ nicht gefunden')
    execFileSync('pdftoppm', ['-f', String(seite), '-l', String(seite), '-png', '-r', '110', '-singlefile', pdf, join(ziel, 'export-skizze-bau')])
    console.log(`Bild: docs/beta4-paket3/export-skizze-bau.png (Seite ${seite})`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
