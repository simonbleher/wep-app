// Sichtprüfung des Excel-Exports mit Parzelle (Beta 6, Paket 1):
//
//   npm run beta6-paket1:export-bild
//
// Ablauf: zwei erfundene WEPs (rechteckige Parzelle 18 × 26 m; freie Form: Trapez mit schrägen Seiten) mit Grundriss und Grün
// in echten Metern → exportieren (beides, Bau und Grün) → mit LibreOffice (→ PDF) und pdftoppm (→ PNG) rendern → die Blätter
// „Skizze Bau“ und „Skizze Außenanlage-Aufwuchs“ nebeneinander (Montage). Ergebnis in docs/beta6-paket1/.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { exportWep } from '../../src/export'
import { grundrissZuFormen } from '../../src/export/grundrissFormen'
import { skizzeDatenZuFormen, type Kasten } from '../../src/export/skizzeFormen'
import { neuerWep, neueBauDaten, type Wep } from '../../src/model'
import { lageVon, meterZuPx, setzeParzelle, skizzeMitParzelle, type Parzelle } from '../../src/parzelle'
import { rechteckPunkte } from '../../src/skizze/grundriss'
import { uebernehmeGrundlage } from '../../src/skizze/grundlage'
import type { SkizzeSymbol } from '../../src/skizze/types'
import { svgZuPngNode } from '../ki-test/skizze/formen'

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const JETZT = '2026-10-23T10:00:00.000Z'

const rechteck: Parzelle = { form: 'rechteck', laenge: 26, breite: 18, massketten: true, angelegtVon: 'bau', angelegtAm: JETZT }
// Trapez: Rückseite 10 m, Wegseite 16 m, Tiefe 24 m; Seiten und eine Diagonale eingetippt, Ecken grob gezeichnet
const trapez: Parzelle = {
  form: 'frei',
  ecken: [{ x: 30, y: 0 }, { x: 130, y: 0 }, { x: 160, y: 240 }, { x: 0, y: 240 }],
  seiten: [10, Math.hypot(3, 24), 16, Math.hypot(3, 24)],
  diagonalen: [{ von: 0, nach: 2, laenge: Math.hypot(13, 24) }],
  massketten: true,
  angelegtVon: 'gruen',
  angelegtAm: JETZT,
}

const sym = (id: string, art: SkizzeSymbol['art'], lage: NonNullable<ReturnType<typeof lageVon>>, xm: number, ym: number, bm: number, hm: number, beschriftung?: string): SkizzeSymbol => {
  const p = meterZuPx(lage.abb, { x: xm, y: ym })
  return { id, typ: 'symbol', art, x: p.x, y: p.y, breite: Math.round(bm * lage.abb.pxProM * 10) / 10, hoehe: Math.round(hm * lage.abb.pxProM * 10) / 10, ...(beschriftung ? { beschriftung } : {}) }
}

function wepFuer(id: string, p: Parzelle): Wep {
  const w = neuerWep(id)
  w.formalien.kleingartenanlage = 'KGA Musterwiese'
  w.formalien.parzelle = '42'
  w.formalien.unterpaechter = 'Erika Musterfrau'
  w.formalien.parzellenflaecheM2 = 300
  w.bau = neueBauDaten()
  w.grundriss = {
    massketten: true,
    teile: [
      { id: 'g1', kuerzel: 'L', punkte: rechteckPunkte(5, 9, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
      { id: 'g2', kuerzel: 'A1', punkte: rechteckPunkte(11, 10, 2, 3), hoehe: 2.3, dachform: 'flach' },
      { id: 'g3', kuerzel: 'S', punkte: rechteckPunkte(5, 4, 3, 2), hoehe: 2, dachform: 'flach' },
    ],
  }
  let wep = setzeParzelle(w, p, JETZT)
  const lage = lageVon(wep)!
  // Grundlage wie in der App: Parzelle + Bauteile aus dem Grundriss („Bauteile aus Bau-Teil dazu“)
  const start = uebernehmeGrundlage(skizzeMitParzelle(wep, JETZT)!, { art: 'parzelle', lage, grundriss: wep.grundriss!, bauteile: [] }, JETZT)!.daten
  wep = {
    ...wep,
    skizze: {
      ...start,
      elemente: [
        ...start.elemente,
        sym('g1', 'weg', lage, 5, 13.8, 1.2, 10, 'Weg'),
        sym('g2', 'tor', lage, 5, 23.2, 1.2, 1.2),
        sym('g3', 'hecke', lage, 8.8, 15, 1, 7, 'Fliederhecke'),
        sym('g4', 'baum', lage, 11, 17, 3, 4, 'Apfel'),
        sym('g5', 'baum', lage, 2.5, 1.5, 3, 4, 'Bergahorn'),
        sym('g6', 'kompost', lage, 9.5, 4.5, 2.2, 1.2, 'Kompost'),
      ],
    },
  }
  return wep
}

async function main() {
  const ziel = join(WURZEL, 'docs', 'beta6-paket1')
  mkdirSync(ziel, { recursive: true })
  const vorlage = readFileSync(join(WURZEL, 'docs', 'WEP_Vorlage.xlsx'))
  const quelle = vorlage.buffer.slice(vorlage.byteOffset, vorlage.byteOffset + vorlage.byteLength) as ArrayBuffer

  const tmp = mkdtempSync(join(tmpdir(), 'parzelle-'))
  try {
    const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find((p) => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0) ?? 'soffice'
    for (const [name, wep] of [
      ['rechteck', wepFuer('2026-601', rechteck)],
      ['trapez', wepFuer('2026-602', trapez)],
    ] as const) {
      const lage = lageVon(wep)!
      const skizze = skizzeMitParzelle(wep)!
      const r = await exportWep(wep, quelle, {
        teil: 'beides',
        grundrissFormen: {
          elemente: ({ zeichenbereich, hatFormen }: { zeichenbereich: Kasten; hatFormen: boolean }) =>
            grundrissZuFormen(wep.grundriss!, zeichenbereich, [], { parzelle: lage, hatFormen }),
          rasterisiere: svgZuPngNode,
        },
        skizzeFormen: {
          elemente: ({ zeichenbereich, hatFormen }) => skizzeDatenZuFormen(skizze, zeichenbereich, { grundlage: !hatFormen }),
          rasterisiere: svgZuPngNode,
        },
      })
      console.log(`${name}: Bau ${r.grundriss?.anzahlFormen} Formen, Grün ${r.skizzeFormen?.anzahlFormen} Formen (${r.skizzeFormen?.svgBilder} SVG-Bilder)`)
      const xlsx = join(ziel, `export-${name}.xlsx`)
      writeFileSync(xlsx, new Uint8Array(await r.blob.arrayBuffer()))
      execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, xlsx], { stdio: 'ignore', timeout: 240_000 })
      const pdf = join(tmp, `export-${name}.pdf`)
      const seiten = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? 0)
      const finde = (titel: string) => {
        for (let i = seiten; i >= 1; i--) if (execFileSync('pdftotext', ['-f', String(i), '-l', String(i), pdf, '-']).toString().includes(titel)) return i
        throw new Error(`Seite mit „${titel}“ nicht gefunden`)
      }
      const bilder: string[] = []
      for (const [titel, teil] of [
        ['Skizze – Baulichkeiten', 'skizze-bau'],
        ['Skizze – Außenanlagen und Aufwuchs', 'skizze-gruen'],
      ] as const) {
        const seite = finde(titel)
        const datei = join(ziel, `excel-${name}-${teil}`)
        execFileSync('pdftoppm', ['-f', String(seite), '-l', String(seite), '-png', '-r', '110', '-singlefile', pdf, datei])
        bilder.push(`${datei}.png`)
        console.log(`Bild: docs/beta6-paket1/excel-${name}-${teil}.png (Seite ${seite})`)
      }
      // Beide Blätter nebeneinander: gleiche Position und Größe der Parzelle sind sofort zu sehen
      execFileSync('convert', [...bilder, '+append', join(ziel, `excel-${name}-beide-blaetter.png`)])
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
