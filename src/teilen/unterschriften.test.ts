// @vitest-environment node
// Unterschriften reisen mit dem WEP: Absender-Teil, Bau → Grün → BV behält beide, Paket mit Unterschrift, PDF der
// BV-Seite zeigt sie. Erfundene Daten; die „Unterschriften“ sind kleine Test-PNGs.
import { describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { neuerWep, neueBauDaten, type Wep } from '@/model'
import type { SicherungsQuelle, SicherungsWep, SicherungsZiel } from '@/sicherung'
import { leseEingangsDateien } from '@/bv/eingang'
import { baueBvPaket } from '@/senden/paket'
import { erzeugeWepPdf, erzeugeWepUebersichtPdf } from '@/pdf'
import { liesPdf } from '@/pdf/__tests__/pdfLesen'
import { vorlageBytes } from '@/pdf/__tests__/hilfen'
import { pngAusUrl } from '@/unterschrift'
import { erstelleTeilen, erstelleTeilenVorschau, leseTeilen, spieleTeilenEin, standardTeilenWahl } from '.'
import { absenderTeile, unterschriftenFuerDatei } from './unterschriften'

const JETZT = '2026-10-27T08:00:00.000Z'
const ID = '7c1e9f4a-2b3d-4e5f-8a9b-0c1d2e3f4a5b'

function unterschrift(y: number): string {
  const c = createCanvas(200, 80)
  const g = c.getContext('2d')
  g.strokeStyle = '#10213d'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(10, y)
  g.bezierCurveTo(60, 0, 120, 80, 190, 20)
  g.stroke()
  return `data:image/png;base64,${c.toBuffer('image/png').toString('base64')}`
}
const BAU_U = unterschrift(70)
const GRUEN_U = unterschrift(40)

function wep(mit: Partial<Wep> = {}): Wep {
  const w = neuerWep(ID, '2026-152')
  w.formalien.kleingartenanlage = 'Rosenthal-Süd'
  w.formalien.parzelle = '12'
  w.formalien.wertermittlerBaulichkeiten = 'Max Mustermann'
  w.formalien.wertermittlerAussenAufwuchs = 'Erika Musterfrau'
  w.rolle = 'beides'
  return { ...w, bau: { ...neueBauDaten(), beschreibung: 'Laube' }, ...mit }
}

function geraet(weps: SicherungsWep[]) {
  const quelle: SicherungsQuelle = {
    weps: async () => weps,
    papierkorb: async () => [],
    eigenePositionen: async () => [],
    profil: async () => ({ profil: { name: '', rolle: 'gruen' } }),
    fotoDatei: async () => undefined,
    bauExcelDatei: async () => undefined,
  }
  const ziel: SicherungsZiel = {
    belegteNummern: async () => weps.map((w) => ({ id: w.wep.id })),
    async speichereWep(w) {
      const i = weps.findIndex((x) => x.wep.id === w.id)
      if (i >= 0) weps[i] = { wep: w, geaendertAm: JETZT }
      else weps.push({ wep: w, geaendertAm: JETZT })
    },
    async legeInPapierkorb() {},
    async speichereFoto() {},
    async speichereBauExcel() {},
    async setzeEigenePositionen() {},
    async setzeProfil() {},
  }
  return { quelle, ziel, weps }
}

describe('Wer unterschreibt?', () => {
  it('nach Rolle im Profil und Teilen des WEP; bei „Beides“ mit zwei Personen nur der eigene Teil', () => {
    expect(absenderTeile(wep(), { name: 'Max Mustermann', rolle: 'bau' })).toEqual(['bau'])
    expect(absenderTeile(wep(), { name: 'Erika Musterfrau', rolle: 'gruen' })).toEqual(['gruen'])
    expect(absenderTeile(wep(), { name: 'Erika Musterfrau', rolle: 'beides' })).toEqual(['gruen'])
    expect(absenderTeile(wep(), { name: 'Hans Beispiel', rolle: 'beides' })).toEqual(['bau', 'gruen'])
    const einer = wep()
    einer.formalien.wertermittlerAussenAufwuchs = 'Max Mustermann'
    expect(absenderTeile(einer, { name: 'Max Mustermann', rolle: 'beides' })).toEqual(['bau', 'gruen'])
    // reines Grün-WEP ohne Bau-Daten: kein Bau-Teil zum Unterschreiben
    expect(absenderTeile(wep({ bau: undefined, rolle: 'gruen' }), { name: 'X', rolle: 'beides' })).toEqual(['gruen'])
  })

  it('ohne eingerichtete Unterschrift bleibt es bei den mitgereisten; ungültige PNGs fallen weg', () => {
    expect(unterschriftenFuerDatei(wep(), { name: 'Max Mustermann', rolle: 'bau' })).toBeUndefined()
    expect(unterschriftenFuerDatei(wep({ unterschriften: { bau: BAU_U } }), { name: 'Erika Musterfrau', rolle: 'gruen' })).toEqual({ bau: BAU_U })
    expect(unterschriftenFuerDatei(wep({ unterschriften: { bau: 'kaputt' } }), { name: 'Erika Musterfrau', rolle: 'gruen', unterschrift: GRUEN_U })).toEqual({ gruen: GRUEN_U })
  })
})

describe('Bau → Grün → BV', () => {
  it('beide Unterschriften kommen beim BV an; das Paket enthält sie', async () => {
    // Bau teilt an Grün (mit seiner Unterschrift)
    const bau = geraet([{ wep: wep(), geaendertAm: '2026-10-25T08:00:00.000Z' }])
    const anGruen = await erstelleTeilen(bau.quelle, ID, { mitFotos: false, mitBauExcel: false, jetzt: () => JETZT, absender: { name: 'Max Mustermann', rolle: 'bau', unterschrift: BAU_U } })
    expect(anGruen.inhalt.unterschriften).toEqual(['bau'])
    // Grün öffnet (neues WEP) …
    const gruen = geraet([])
    const gelesen = await leseTeilen(anGruen.blob)
    const v = await erstelleTeilenVorschau(gelesen, gruen.quelle)
    await spieleTeilenEin({ gelesen, vorschau: v, wahl: standardTeilenWahl(v), lokal: gruen.quelle, ziel: gruen.ziel })
    expect(gruen.weps[0].wep.unterschriften).toEqual({ bau: BAU_U })
    // … und sendet an den BV (mit seiner Unterschrift)
    const wepDatei = await erstelleTeilen(gruen.quelle, ID, { mitFotos: true, mitBauExcel: true, jetzt: () => JETZT, absender: { name: 'Erika Musterfrau', rolle: 'gruen', unterschrift: GRUEN_U } })
    expect(wepDatei.inhalt.unterschriften).toEqual(['bau', 'gruen'])
    const paket = await baueBvPaket({ pdfs: [], wepDatei: { name: 'x.wep', daten: wepDatei.blob }, fotos: [] })
    const erg = await leseEingangsDateien([{ name: '2026-152_an-BV.zip', daten: paket }], JETZT)
    expect(erg.weps[0].eingang.wep.unterschriften).toEqual({ bau: BAU_U, gruen: GRUEN_U })
  })

  it('Grün hat das WEP schon: mit dem Bau-Teil kommt die Bau-Unterschrift; eine schon vorhandene Grün-Unterschrift bleibt', async () => {
    const bau = geraet([{ wep: wep(), geaendertAm: '2026-10-25T08:00:00.000Z' }])
    const anGruen = await erstelleTeilen(bau.quelle, ID, { mitFotos: false, mitBauExcel: false, jetzt: () => JETZT, absender: { name: 'Max Mustermann', rolle: 'bau', unterschrift: BAU_U } })
    const gruen = geraet([{ wep: wep({ unterschriften: { gruen: GRUEN_U } }), geaendertAm: '2026-10-24T08:00:00.000Z' }])
    const gelesen = await leseTeilen(anGruen.blob)
    const v = await erstelleTeilenVorschau(gelesen, gruen.quelle)
    expect(v.teile.map((t) => t.teil)).toContain('bau')
    await spieleTeilenEin({ gelesen, vorschau: v, wahl: { wep: 'uebernehmen', teile: { bau: 'uebernehmen' } }, lokal: gruen.quelle, ziel: gruen.ziel })
    expect(gruen.weps[0].wep.unterschriften).toEqual({ bau: BAU_U, gruen: GRUEN_U })
  })
})

describe('PDF der BV-Seite', () => {
  const eingabe = { wep: wep(), quelle: vorlageBytes(), hatBauExcel: false, rolle: 'beides' as const }
  const bilder = async (bytes: Uint8Array) => (await liesPdf(bytes)).reduce((n, s) => n + s.bilder, 0)

  it('übersichtlich: je Wertermittler seine Unterschrift; ohne Unterschrift im Paket bleibt das Feld leer', async () => {
    const beide = await erzeugeWepUebersichtPdf(eingabe, { unterschriften: { bau: pngAusUrl(BAU_U), gruen: pngAusUrl(GRUEN_U) } })
    const nurBau = await erzeugeWepUebersichtPdf(eingabe, { unterschriften: { bau: pngAusUrl(BAU_U), gruen: null } })
    const keine = await erzeugeWepUebersichtPdf(eingabe, { unterschriften: { bau: null, gruen: null } })
    expect(await bilder(beide.pdf.bytes)).toBe(2)
    expect(await bilder(nurBau.pdf.bytes)).toBe(1)
    expect(await bilder(keine.pdf.bytes)).toBe(0)
  })

  it('wie Vorlage: Unterschriften an den Feldern Bau und Grün', async () => {
    const beide = await erzeugeWepPdf(eingabe, { unterschriften: { bau: pngAusUrl(BAU_U), gruen: pngAusUrl(GRUEN_U) } })
    const nurGruen = await erzeugeWepPdf(eingabe, { unterschriften: { gruen: pngAusUrl(GRUEN_U) } })
    const keine = await erzeugeWepPdf(eingabe, {})
    const nBeide = await bilder(beide.pdf.bytes)
    const nGruen = await bilder(nurGruen.pdf.bytes)
    expect(await bilder(keine.pdf.bytes)).toBe(0)
    expect(nGruen).toBeGreaterThan(0)
    expect(nBeide).toBeGreaterThan(nGruen)
  })
})
