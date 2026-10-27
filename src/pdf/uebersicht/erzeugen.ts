/**
 * Übersichtliches PDF aus der exportierten Arbeitsmappe: schlichtes Protokoll im Stil der App statt der Blätter der
 * Vorlage. Zahlen stammen aus denselben Zellen (Rechenwerk der Mappe) wie beim PDF „wie Vorlage“.
 */
import type { PDFPage } from 'pdf-lib'
import type { Wep } from '../../model'
import type { Op } from '../blatt'
import { Rechenwerk } from '../formeln'
import { leseMappe } from '../mappe'
import { fotoSeiten } from '../fotos'
import { zeichneOps } from '../schreiber'
import { kodierbar, ladeSchriften, messerAus, type Schriften } from '../schrift'
import { unterschriftsBilder, type PdfOptionen } from '../erzeugen'
import { leseProtokoll, type Protokoll } from './daten'
import { setzeProtokoll } from './inhalt'
import { A4, FARBE, RAENDER, Satz, type SeiteU } from './seitenbau'

export interface UebersichtOptionen extends PdfOptionen {
  /** Das WEP (für die Mängel mit Begründung); ohne Bau-Daten kommen sie aus der Mängelliste der Datei. */
  wep: Wep
}

export interface UebersichtErgebnis {
  bytes: Uint8Array
  seitenZahl: number
  /** Die Seiten des Protokolls (ohne Fotoanhang) mit ihren Zeichenbefehlen – zum Prüfen. */
  seiten: SeiteU[]
  /** Was gedruckt wurde, mit den Zahlen aus der Mappe. */
  protokoll: Protokoll
  hinweise: string[]
  rechenwerk: Rechenwerk
  fotoSeitenZahl: number
}

/** Kopf- und Fußzeile auf alle Seiten (Seitenzahl „n von N“). */
function kopfFuss(seite: PDFPage, schriften: Schriften, lib: typeof import('pdf-lib'), kopf: Protokoll['kopf'], nr: number, von: number, verband: string): void {
  const h = seite.getHeight()
  const farbe = (hex: string) => {
    const v = hex.replace('#', '')
    return lib.rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255)
  }
  const grau = farbe(FARBE.text2)
  const links = [kopf.nr && `Vorgangs-Nr. ${kopf.nr}`].filter(Boolean).join('')
  const rechts = [kopf.anlage, kopf.parzelle && (/^parzelle\b/i.test(kopf.parzelle) ? kopf.parzelle : `Parzelle ${kopf.parzelle}`)].filter(Boolean).join(' · ')
  const y = h - 38
  if (links) seite.drawText(kodierbar(links), { x: RAENDER.links, y, size: 9, font: schriften.fett, color: grau })
  if (rechts) {
    const b = schriften.normal.widthOfTextAtSize(kodierbar(rechts), 9)
    seite.drawText(kodierbar(rechts), { x: A4[0] - RAENDER.rechts - b, y, size: 9, font: schriften.normal, color: grau })
  }
  seite.drawLine({ start: { x: RAENDER.links, y: y - 7 }, end: { x: A4[0] - RAENDER.rechts, y: y - 7 }, thickness: 0.6, color: farbe(FARBE.linie) })
  const fuss = 28
  seite.drawText(kodierbar(verband), { x: RAENDER.links, y: fuss, size: 8, font: schriften.normal, color: grau })
  const nummer = `Seite ${nr} von ${von}`
  seite.drawText(nummer, { x: A4[0] - RAENDER.rechts - schriften.normal.widthOfTextAtSize(nummer, 8), y: fuss, size: 8, font: schriften.normal, color: grau })
}

export async function erzeugeUebersichtPdf(xlsx: ArrayBuffer | Uint8Array, optionen: UebersichtOptionen): Promise<UebersichtErgebnis> {
  const lib = await import('pdf-lib')
  const mappe = await leseMappe(xlsx)
  const rechen = new Rechenwerk(mappe)
  const protokoll = leseProtokoll(rechen, optionen.wep, optionen.rolle)

  const dok = await lib.PDFDocument.create()
  const schriften = await ladeSchriften(dok, lib.StandardFonts)
  dok.setProducer('WEP-App')
  dok.setCreator('WEP-App')
  if (optionen.titel) dok.setTitle(optionen.titel)
  dok.setCreationDate(new Date())

  const unterschriften = await unterschriftsBilder(dok, optionen)

  const satz = new Satz(messerAus(schriften))
  setzeProtokoll(satz, protokoll, { rolle: optionen.rolle, skizzen: optionen.skizzen, unterschriften: { bau: Boolean(unterschriften.bau), gruen: Boolean(unterschriften.gruen) } })

  for (const si of satz.seiten) {
    const seite = dok.addPage(A4)
    zeichneOps(lib, seite, si.ops as Op[], schriften)
    for (const h of si.haken) h.zeichne({ lib, dok, seite, schriften, unterschriften })
  }

  const hinweise: string[] = []
  let fotoSeitenZahl = 0
  if (optionen.fotos?.length) {
    const fs = await fotoSeiten(lib, dok, schriften, optionen.fotos, optionen.fotoKopf, false)
    fotoSeitenZahl = fs.seiten
    hinweise.push(...fs.hinweise)
  }
  if (rechen.bericht.unbekannt.length) {
    hinweise.push(`${rechen.bericht.unbekannt.length} Formel${rechen.bericht.unbekannt.length === 1 ? '' : 'n'} in der Datei konnte(n) nicht gerechnet werden; dort steht der gespeicherte Wert.`)
  }

  const seiten = dok.getPages()
  seiten.forEach((seite, i) => kopfFuss(seite, schriften, lib, protokoll.kopf, i + 1, seiten.length, protokoll.verband.name))

  const bytes = await dok.save()
  return { bytes, seitenZahl: dok.getPageCount(), seiten: satz.seiten, protokoll, hinweise, rechenwerk: rechen, fotoSeitenZahl }
}
