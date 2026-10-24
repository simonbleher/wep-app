// Sichtprüfung des Excel-Exports nach einem Agent-Vorschlag (Skizzen-Schnittstelle window.wep):
//
//   npm run skizze-agent:export-bild
//
// Ablauf wie im Durchlauf eines Agenten, nur ohne Browser: erfundenes WEP (Parzelle 18 × 26 m, Bau-Grundlage, Aufwuchs-Positionen)
// → lesen() → Beispielvorschlag prüfen → übernehmen → als Excel exportieren (Formen im Blatt „Skizze Außenanlage-Aufwuchs“) →
// mit LibreOffice (→ PDF) und pdftoppm (→ PNG) rendern. Ergebnis in docs/skizze-agent/ (excel-gruen.png, export.xlsx).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { exportWep } from '../../src/export'
import { skizzeDatenZuFormen } from '../../src/export/skizzeFormen'
import { leseWep } from '../../src/agent/lesen'
import { pruefeVorschlag } from '../../src/agent/vorschlag'
import { wendeVorschlagAn } from '../../src/skizze/editorZustand'
import { BEISPIEL_VORSCHLAG } from '../../src/agent/__tests__/beispiel'
import { testWep } from '../../src/agent/__tests__/testwep'
import { svgZuPngNode } from '../ki-test/skizze/formen'

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function main() {
  const ziel = join(WURZEL, 'docs', 'skizze-agent')
  mkdirSync(ziel, { recursive: true })
  const vorlage = readFileSync(join(WURZEL, 'docs', 'WEP_Vorlage.xlsx'))
  const quelle = vorlage.buffer.slice(vorlage.byteOffset, vorlage.byteOffset + vorlage.byteLength) as ArrayBuffer

  // 1. lesen() → 2. Vorschlag prüfen → 3. übernehmen (so, wie es der Editor nach „Übernehmen“ tut)
  let wep = testWep()
  const gelesen = leseWep(wep, wep.skizze)
  console.log(`lesen(): ${gelesen.gruen.aufwuchs.length} Aufwuchs-Positionen, Grundlage ${gelesen.grundlage.elemente.length} Formen, Parzelle ${gelesen.parzelle.breiteM} × ${gelesen.parzelle.hoeheM} m`)
  const g = pruefeVorschlag(BEISPIEL_VORSCHLAG, wep, wep.skizze)
  if (!g.ok) throw new Error(`Vorschlag ungültig: ${JSON.stringify(g.fehler)}`)
  console.log(g.zusammenfassung)
  for (const h of g.hinweise) console.log(`Hinweis: ${h}`)
  wep = { ...wep, skizze: { ...wep.skizze!, elemente: wendeVorschlagAn(wep.skizze!.elemente, { elemente: g.elemente, modus: 'ergaenzen' }) } }

  // 4. Export
  const r = await exportWep(wep, quelle, {
    skizzeFormen: { elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(wep.skizze!, zeichenbereich, { grundlage: !hatFormen }), rasterisiere: svgZuPngNode },
  })
  console.log(`Export: ${r.skizzeFormen?.anzahlFormen} Formen (${r.skizzeFormen?.svgBilder} SVG-Bilder)`)
  const xlsx = join(ziel, 'export.xlsx')
  writeFileSync(xlsx, new Uint8Array(await r.blob.arrayBuffer()))

  // 5. Rendern
  const tmp = mkdtempSync(join(tmpdir(), 'skizze-agent-'))
  try {
    const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find((p) => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0) ?? 'soffice'
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, xlsx], { stdio: 'ignore', timeout: 240_000 })
    const pdf = join(tmp, 'export.pdf')
    const seiten = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? 0)
    let seite = 0
    for (let i = seiten; i >= 1 && !seite; i--) {
      if (execFileSync('pdftotext', ['-f', String(i), '-l', String(i), pdf, '-']).toString().includes('Skizze – Außenanlagen und Aufwuchs')) seite = i
    }
    if (!seite) throw new Error('Seite „Skizze – Außenanlagen und Aufwuchs“ nicht gefunden')
    execFileSync('pdftoppm', ['-f', String(seite), '-l', String(seite), '-png', '-r', '110', '-singlefile', pdf, join(ziel, 'excel-gruen')])
    console.log(`Bild: docs/skizze-agent/excel-gruen.png (Seite ${seite})`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
