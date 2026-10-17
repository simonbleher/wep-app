// Excel-Blatt als Bild rendern (Testlauf, nicht Teil der App): LibreOffice → PDF (alle Blätter;
// LibreOffice druckt auch versteckte), danach die Skizzen-Seite → PNG mit PyMuPDF
// (python -m pip install pymupdf). Die Skizzen-Seite ist die letzte Seite, deren Text mit „Skizze“ beginnt
// (Blattreihenfolge der Vorlage: „Skizze Bau“, „Skizze Außenanlage-Aufwuchs“).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Pfad zu soffice/libreoffice (Umgebungsvariable SOFFICE, typische Installationsorte, PATH). */
export function findeLibreOffice(): string | undefined {
  const kandidaten = [
    process.env.SOFFICE,
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ].filter(Boolean) as string[]
  for (const k of kandidaten) if (existsSync(k)) return k
  for (const name of ['libreoffice', 'soffice']) {
    if (spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0) return name
  }
  return undefined
}

function pythonMitPyMuPdf(): string | undefined {
  for (const py of [process.env.PYTHON, 'python', 'python3', 'py'].filter(Boolean) as string[]) {
    if (spawnSync(py, ['-c', 'import pymupdf'], { stdio: 'ignore', env: process.env }).status === 0) return py
  }
  return undefined
}

const PYTHON_SEITE = [
  'import sys, pymupdf',
  'd = pymupdf.open(sys.argv[1])',
  'n = [i for i, p in enumerate(d) if p.get_text().lstrip().startswith("Skizze")]',
  'd[n[-1] if n else 0].get_pixmap(dpi=int(sys.argv[3])).save(sys.argv[2])',
].join('\n')

/** Skizzen-Seite des PDFs → PNG. Gibt false zurück, wenn PyMuPDF fehlt. */
export function pdfZuPng(pdf: string, png: string, dpi = 130): boolean {
  const py = pythonMitPyMuPdf()
  if (py) {
    execFileSync(py, [
      '-c',
      PYTHON_SEITE,
      pdf,
      png,
      String(dpi),
    ])
    return true
  }
  return false
}

export interface RenderErgebnis {
  pdf: Uint8Array
  /** PNG der ersten Seite, falls ein PDF→PNG-Werkzeug gefunden wurde */
  png?: Uint8Array
}

/** xlsx → PDF (+ PNG der Skizzen-Seite) mit LibreOffice. Wirft, wenn LibreOffice fehlt. */
export async function rendereSkizzenBlatt(xlsx: ArrayBuffer | Uint8Array, dpi = 130): Promise<RenderErgebnis> {
  const soffice = findeLibreOffice()
  if (!soffice) throw new Error('LibreOffice nicht gefunden (Umgebungsvariable SOFFICE setzen)')
  const dir = mkdtempSync(join(tmpdir(), 'wep-render-'))
  try {
    const datei = join(dir, 'blatt.xlsx')
    writeFileSync(datei, new Uint8Array(xlsx))
    const profil = `file:///${join(dir, 'profil').replace(/\\/g, '/')}`
    execFileSync(soffice, [`-env:UserInstallation=${profil}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, datei], {
      stdio: 'pipe',
      timeout: 120000,
    })
    const pdf = new Uint8Array(readFileSync(join(dir, 'blatt.pdf')))
    const pngPfad = join(dir, 'blatt.png')
    const png = pdfZuPng(join(dir, 'blatt.pdf'), pngPfad, dpi) && existsSync(pngPfad) ? new Uint8Array(readFileSync(pngPfad)) : undefined
    return { pdf, png }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
