// Beta 6, Paket 1: Parzelle im PDF – beide Skizzen-Blätter zeigen sie (Vektor), auch ohne Bauteile.
import { describe, expect, it } from 'vitest'
import { neueBauDaten, neuerWep, type Wep } from '../../model'
import { lageVon, setzeParzelle, skizzeMitParzelle, type Parzelle } from '../../parzelle'
import { rechteckPunkte } from '../../skizze/grundriss'
import { BLATT } from '../erzeugen'
import { erzeugeWepPdf } from '../index'
import { vorlageBytes } from './hilfen'
import { liesPdf } from './pdfLesen'

const jetzt = '2026-10-23T10:00:00.000Z'
const trapez: Parzelle = {
  form: 'frei',
  ecken: [{ x: 30, y: 0 }, { x: 130, y: 0 }, { x: 160, y: 240 }, { x: 0, y: 240 }],
  seiten: [10, Math.hypot(3, 24), 16, Math.hypot(3, 24)],
  diagonalen: [{ von: 0, nach: 2, laenge: Math.hypot(13, 24) }],
  massketten: true,
  angelegtVon: 'bau',
  angelegtAm: jetzt,
}

function wep(mitGrundriss: boolean): Wep {
  const w = neuerWep('2026-871')
  w.formalien.kleingartenanlage = 'KGA Musterwiese'
  w.formalien.unterpaechter = 'Erika Musterfrau'
  w.bau = neueBauDaten()
  if (mitGrundriss) w.grundriss = { massketten: true, teile: [{ id: 'g1', kuerzel: 'L', punkte: rechteckPunkte(4, 8, 6, 4), hoehe: 2.2 }] }
  return setzeParzelle(w, trapez, jetzt)
}

async function pdfFuer(w: Wep) {
  const lage = lageVon(w)
  const skizze = skizzeMitParzelle(w)
  return erzeugeWepPdf(
    { wep: w, quelle: vorlageBytes(), hatBauExcel: false, rolle: 'beides' },
    { skizzen: { gruen: skizze, grundriss: { daten: w.grundriss ?? { teile: [] }, bauteile: [], parzelle: lage } } },
  )
}

describe('Parzelle im PDF', () => {
  it('mit Grundriss: Skizze Bau und Skizze Grün zeigen die Parzelle als Vektor (Pfade, keine Bilder)', async () => {
    const a = await pdfFuer(wep(true))
    const namen = a.pdf.blaetter.map((b) => b.blatt)
    expect(namen).toContain(BLATT.skizzeBau)
    expect(namen).toContain(BLATT.skizzeGruen)
    const seiten = await liesPdf(a.pdf.bytes)
    const index = (blatt: string) => namen.slice(0, namen.indexOf(blatt as never)).reduce((n, b) => n + a.pdf.blaetter.find((x) => x.blatt === b)!.seiten.length, 0)
    const bau = seiten[index(BLATT.skizzeBau)]
    const gruen = seiten[index(BLATT.skizzeGruen)]
    expect(bau.text).toContain('Massenberechnung')
    expect(bau.text).toContain('24,19 m')
    expect(bau.bilder).toBe(0)
    expect(bau.pfade).toBeGreaterThan(20)
    expect(gruen.text).toContain('24,19 m')
    expect(gruen.bilder).toBe(0)
    expect(gruen.pfade).toBeGreaterThan(20)
  })

  it('nur die Parzelle (noch kein Grundriss): das Blatt „Skizze Bau“ erscheint trotzdem und zeigt sie', async () => {
    const a = await pdfFuer(wep(false))
    const namen = a.pdf.blaetter.map((b) => b.blatt)
    expect(namen).toContain(BLATT.skizzeBau)
    const seiten = await liesPdf(a.pdf.bytes)
    const index = namen.slice(0, namen.indexOf(BLATT.skizzeBau as never)).reduce((n, b) => n + a.pdf.blaetter.find((x) => x.blatt === b)!.seiten.length, 0)
    expect(seiten[index].pfade).toBeGreaterThan(8)
    expect(seiten[index].text).toContain('16 m')
  })
})
