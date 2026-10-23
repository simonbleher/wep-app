/**
 * PDF aus der exportierten Arbeitsmappe (`exportWep`) erzeugen.
 *
 * Ablauf: Arbeitsmappe lesen → Blätter je Rolle wählen → jedes Blatt wie in der Vorlage in Seiten setzen
 * (Zahlen aus den Formeln der Mappe, siehe `formeln.ts`) → Skizzen als Vektor, Unterschrift, Fotoanhang → PDF.
 * Die PDF-Bibliothek (`pdf-lib`) wird erst hier nachgeladen, also nur wenn jemand ein PDF erzeugt.
 */
import type { Rolle } from '../model'
import type { GrundrissDaten } from '../skizze/grundriss'
import type { SkizzeDaten } from '../skizze/types'
import type { ParzellenLage } from '../parzelle/lage'
import { setzeBlatt, blattBereich, type Rechteck, type SeitenInhalt } from './blatt'
import { Rechenwerk } from './formeln'
import { leseMappe, schluessel, type Blatt, type Mappe } from './mappe'
import { zeichneOps } from './schreiber'
import { ladeSchriften, messerAus } from './schrift'
import { zeichneGrundriss, zeichneGruenSkizze } from './skizzen'
import { fotoSeiten, type PdfFoto } from './fotos'

export const BLATT = {
  deckblatt: 'Deckbl UPV',
  bau: 'Baulichkeiten',
  maengel: 'Mängelliste',
  aussen: 'Außenanlagen',
  aufwuchs1: 'Aufwuchs I',
  aufwuchs2: 'Aufwuchs II',
  beseitigung: 'Beseitigungskosten',
  skizzeBau: 'Skizze Bau',
  skizzeGruen: 'Skizze Außenanlage-Aufwuchs',
  abkuerzungen: 'Abkürzungsverzeichnis',
} as const

export interface PdfSkizzen {
  /** Grün-Skizze (`wep.skizze`). */
  gruen?: SkizzeDaten
  /** Grundriss mit echten Maßen (`wep.grundriss`) und die Kürzel der Bauteile. */
  grundriss?: { daten: GrundrissDaten; bauteile: ReadonlyArray<{ id: string; kuerzel: string }>; parzelle?: ParzellenLage }
}

export interface PdfOptionen {
  rolle: Rolle
  skizzen?: PdfSkizzen
  /** Fotos für den Anhang (leer/fehlt: kein Anhang). */
  fotos?: PdfFoto[]
  /** Unterschrift als PNG (Paket 3); nur setzen, wenn der Wertermittler es beim Erzeugen bestätigt hat. */
  unterschrift?: Uint8Array | null
  /** Titel in den Dokument-Eigenschaften. */
  titel?: string
  /** Überschrift über dem Fotoanhang („Parzelle 42 – KGA Testgarten“). */
  fotoKopf?: string
}

export interface PdfBlattErgebnis {
  blatt: string
  seiten: SeitenInhalt[]
  skala: number
}

export interface PdfErgebnis {
  bytes: Uint8Array
  seitenZahl: number
  /** Gedruckte Blätter in Reihenfolge. */
  blaetter: PdfBlattErgebnis[]
  /** Hinweise für den Nutzer (z. B. Formeln, die nicht gerechnet werden konnten). */
  hinweise: string[]
  /** Das Rechenwerk (Werte aller Zellen) – zum Prüfen. */
  rechenwerk: Rechenwerk
  /** Zahl der Foto-Seiten am Ende. */
  fotoSeitenZahl: number
}

const leer = (v: unknown): boolean => v === null || v === undefined || v === ''

/** Hat die Zelle (Blatt, Zeile, Spalte) einen Wert? */
function belegt(r: Rechenwerk, blatt: string, z: number, s: number): boolean {
  return !leer(r.wert(blatt, z, s))
}

/** Zeilen der Positionslisten in der Vorlage (Spalte C bzw. B = Bezeichnung). */
const ZEILEN = {
  aufwuchs2: [10, 45, 3] as const,
  beseitigungBau: [12, 23, 2] as const,
  beseitigungGruen: [34, 44, 2] as const,
}

function bereichBelegt(r: Rechenwerk, blatt: string, [z1, z2, s]: readonly [number, number, number]): boolean {
  for (let z = z1; z <= z2; z++) if (belegt(r, blatt, z, s)) return true
  return false
}

/** Welche Blätter gehören bei dieser Rolle ins PDF? Reihenfolge wie in der Vorlage. */
export function waehleBlaetter(mappe: Mappe, rechen: Rechenwerk, o: Pick<PdfOptionen, 'rolle' | 'skizzen'>): string[] {
  const hatBau = o.rolle !== 'gruen'
  const hatGruen = o.rolle !== 'bau'
  const gibt = (n: string) => mappe.blaetter.some((b) => b.name.trim() === n && b.sichtbar)
  const liste: string[] = [BLATT.deckblatt]
  if (hatBau) liste.push(BLATT.bau, BLATT.maengel)
  if (hatGruen) {
    liste.push(BLATT.aussen, BLATT.aufwuchs1)
    if (bereichBelegt(rechen, BLATT.aufwuchs2, ZEILEN.aufwuchs2)) liste.push(BLATT.aufwuchs2)
  }
  const beseitigung =
    (hatGruen && bereichBelegt(rechen, BLATT.beseitigung, ZEILEN.beseitigungGruen)) || (hatBau && bereichBelegt(rechen, BLATT.beseitigung, ZEILEN.beseitigungBau))
  if (beseitigung) liste.push(BLATT.beseitigung)
  if (hatBau && (o.skizzen?.grundriss?.daten.teile.length || o.skizzen?.grundriss?.parzelle)) liste.push(BLATT.skizzeBau)
  if (hatGruen && o.skizzen?.gruen?.elemente.length) liste.push(BLATT.skizzeGruen)
  liste.push(BLATT.abkuerzungen)
  return liste.filter(gibt)
}

/** Unterschriftsfelder: Zellen, die auf Formalien E12 (Bau) bzw. E13 (Grün) verweisen, im Fuß des Blatts. */
interface Feld {
  z1: number
  s1: number
  z2: number
  s2: number
  teil: 'bau' | 'gruen'
}

export function unterschriftsFelder(blatt: Blatt): Feld[] {
  const bereich = blattBereich(blatt)
  const felder: Feld[] = []
  for (const [k, zelle] of blatt.zellen) {
    if (!zelle.formel || zelle.verschiebung) continue
    const m = /^=?\s*Formalien!\$E\$(12|13)\s*$/.exec(zelle.formel)
    if (!m) continue
    const z = Math.floor(k / 20000)
    const s = k % 20000
    if (z < bereich.z2 - 6 || z > bereich.z2 + 1) continue
    const v = blatt.verbunden.find((b) => b.z1 === z && b.s1 === s)
    felder.push({ z1: z, s1: s, z2: v?.z2 ?? z, s2: v?.s2 ?? s, teil: m[1] === '12' ? 'bau' : 'gruen' })
  }
  return felder.sort((a, b) => a.s1 - b.s1)
}

/** Rechteck für das Bild einer Unterschrift über dem Feld (Seitenkoordinaten). */
function unterschriftRahmen(feld: Rechteck, hoehePt: number, bildSeiten: number): Rechteck {
  const h = Math.min(hoehePt, Math.max(feld.h * 2.4, 26))
  const breite = Math.min(feld.w * 1.15, h * bildSeiten)
  const unten = feld.y + feld.h * 0.55
  return { x: feld.x + (feld.w - breite) / 2, y: unten - h, w: breite, h }
}

export async function erzeugePdf(xlsx: ArrayBuffer | Uint8Array, optionen: PdfOptionen): Promise<PdfErgebnis> {
  const lib = await import('pdf-lib')
  const mappe = await leseMappe(xlsx)
  const rechen = new Rechenwerk(mappe)
  const dok = await lib.PDFDocument.create()
  const schriften = await ladeSchriften(dok, lib.StandardFonts)
  const messer = messerAus(schriften)
  dok.setProducer('WEP-App')
  dok.setCreator('WEP-App')
  if (optionen.titel) dok.setTitle(optionen.titel)
  dok.setCreationDate(new Date())

  let unterschrift: Awaited<ReturnType<typeof dok.embedPng>> | undefined
  if (optionen.unterschrift && optionen.unterschrift.length) {
    try {
      unterschrift = await dok.embedPng(optionen.unterschrift)
    } catch {
      unterschrift = undefined
    }
  }

  const hinweise: string[] = []
  const ergebnis: PdfBlattErgebnis[] = []
  const namen = waehleBlaetter(mappe, rechen, optionen)
  const hatBauTeil = optionen.rolle !== 'gruen'
  const hatGruenTeil = optionen.rolle !== 'bau'

  for (const name of namen) {
    const blatt = mappe.blaetter.find((b) => b.name.trim() === name)!
    const blattErg = setzeBlatt(blatt, mappe, rechen, messer)
    ergebnis.push({ blatt: name, seiten: blattErg.seiten, skala: blattErg.skala })
    const felder = unterschrift ? unterschriftsFelder(blatt).filter((f) => (f.teil === 'bau' ? hatBauTeil : hatGruenTeil)) : []

    for (const si of blattErg.seiten) {
      const seite = dok.addPage([si.breite, si.hoehe])
      zeichneOps(lib, seite, si.ops, schriften)

      // Skizzen: Rahmen B7:G48 des Blatts
      if (name === BLATT.skizzeGruen && optionen.skizzen?.gruen) {
        const r = si.lage(7, 2, 48, 7)
        if (r) zeichneGruenSkizze(lib, seite, schriften, optionen.skizzen.gruen, r)
      }
      if (name === BLATT.skizzeBau && optionen.skizzen?.grundriss) {
        const r = si.lage(7, 2, 48, 7)
        if (r) zeichneGrundriss(lib, seite, schriften, optionen.skizzen.grundriss.daten, optionen.skizzen.grundriss.bauteile, r, optionen.skizzen.grundriss.parzelle)
      }

      // Unterschrift über dem Namen des Wertermittlers
      if (unterschrift) {
        for (const f of felder) {
          const r = si.lage(f.z1, f.s1, f.z2, f.s2)
          if (!r) continue
          const rahmen = unterschriftRahmen(r, 30, unterschrift.width / unterschrift.height)
          seite.drawImage(unterschrift, { x: rahmen.x, y: si.hoehe - rahmen.y - rahmen.h, width: rahmen.w, height: rahmen.h })
        }
      }
    }
  }

  let fotoSeitenZahl = 0
  if (optionen.fotos?.length) {
    const fs = await fotoSeiten(lib, dok, schriften, optionen.fotos, optionen.fotoKopf)
    fotoSeitenZahl = fs.seiten
    hinweise.push(...fs.hinweise)
  }

  if (rechen.bericht.unbekannt.length) {
    hinweise.push(`${rechen.bericht.unbekannt.length} Formel${rechen.bericht.unbekannt.length === 1 ? '' : 'n'} in der Datei konnte(n) nicht gerechnet werden; dort steht der gespeicherte Wert.`)
  }

  const bytes = await dok.save()
  return { bytes, seitenZahl: dok.getPageCount(), blaetter: ergebnis, hinweise, rechenwerk: rechen, fotoSeitenZahl }
}

export { schluessel }
