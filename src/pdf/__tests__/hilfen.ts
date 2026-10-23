// Gemeinsame Hilfen der PDF-Tests: Vorlage laden, Fälle erzeugen, LibreOffice rechnen lassen.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { erzeugeTestBauExcel } from '../../bauexcel/testBauExcel'
import { erzeugeWepPdf, type WepPdfAusgabe } from '../index'
import { testFaelle, type TestFall } from '../testFaelle'

export const VORLAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/WEP_Vorlage.xlsx')

export function libreOfficeDa(): boolean {
  try {
    execSync('libreoffice --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function vorlageBytes(): ArrayBuffer {
  const b = fs.readFileSync(VORLAGE)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

export interface FallErgebnis {
  fall: TestFall
  ausgabe: WepPdfAusgabe
  xlsx: ArrayBuffer
}

/** Erzeugt für alle Testfälle Excel + PDF (mit Skizzen, ohne Fotos). */
export async function erzeugeAlleFaelle(optionen: { fotos?: boolean; unterschrift?: Uint8Array | null } = {}): Promise<FallErgebnis[]> {
  const ergebnisse: FallErgebnis[] = []
  const bauExcel = await erzeugeTestBauExcel({ skizzeBau: true })
  const bauBuffer = bauExcel.buffer.slice(bauExcel.byteOffset, bauExcel.byteOffset + bauExcel.byteLength) as ArrayBuffer
  for (const fall of testFaelle()) {
    const ausgabe = await erzeugeWepPdf(
      { wep: fall.wep, quelle: fall.mitBauExcel ? bauBuffer : vorlageBytes(), hatBauExcel: Boolean(fall.mitBauExcel), rolle: fall.rolle },
      {
        skizzen: {
          gruen: fall.wep.skizze,
          grundriss: fall.wep.grundriss ? { daten: fall.wep.grundriss, bauteile: fall.wep.bau?.bauteile ?? [] } : undefined,
        },
        unterschrift: optionen.unterschrift,
      },
    )
    ergebnisse.push({ fall, ausgabe, xlsx: await ausgabe.export.blob.arrayBuffer() })
  }
  return ergebnisse
}

/** Lässt LibreOffice alle Dateien neu berechnen; Ergebnis: neu gespeicherte Bytes in gleicher Reihenfolge. */
export function rechneMitLibreOffice(dateien: ArrayBuffer[]): Uint8Array[] {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wep-pdf-'))
  try {
    const eingang = path.join(tmp, 'in')
    const ausgang = path.join(tmp, 'out')
    fs.mkdirSync(eingang)
    fs.mkdirSync(ausgang)
    const namen = dateien.map((d, i) => {
      const n = path.join(eingang, `fall${String(i).padStart(2, '0')}.xlsx`)
      fs.writeFileSync(n, Buffer.from(d))
      return n
    })
    // eigenes Profil: läuft auch neben anderen LibreOffice-Tests. „Immer neu berechnen“ (OOXMLRecalcMode = 0),
    // sonst zeigt LibreOffice die gespeicherten Zwischenwerte der Blätter, die der Export nicht geleert hat.
    const profil = path.join(tmp, 'profil')
    fs.mkdirSync(path.join(profil, 'user'), { recursive: true })
    fs.writeFileSync(
      path.join(profil, 'user', 'registrymodifications.xcu'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
        '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>\n</oor:items>\n',
    )
    execFileSync('libreoffice', [`-env:UserInstallation=file://${profil}`, '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', ausgang, ...namen], {
      stdio: 'pipe',
      timeout: 280000,
    })
    return dateien.map((_, i) => new Uint8Array(fs.readFileSync(path.join(ausgang, `fall${String(i).padStart(2, '0')}.xlsx`))))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
