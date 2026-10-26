// @vitest-environment node
// BV-Kontrollseite: .wep-Dateien und Pakete einlesen, Hinweise zu fehlender und doppelter Vorgangs-Nr. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { neuerWep, type Wep } from '@/model'
import { bvZeilen, eingangsSchluessel, leseEingangsDateien, type BvEingang } from '../eingang'

const JETZT = '2026-10-27T09:00:00.000Z'
const UUID = '7c1e9f4a-2b3d-4e5f-8a9b-0c1d2e3f4a5b'

function wep(nr: string, id = UUID): Wep {
  const w = neuerWep(id, nr)
  w.formalien.kleingartenanlage = 'Rosenthal-Süd'
  w.formalien.parzelle = '12'
  w.formalien.unterpaechter = 'Erika Musterfrau'
  return w
}

async function wepDatei(w: Wep, opt: { geaendertAm?: string; fotos?: string[]; bauExcel?: boolean } = {}): Promise<Uint8Array> {
  const z = new JSZip()
  const fotos = opt.fotos ?? []
  z.file(
    'wep.json',
    JSON.stringify({
      format: 'wep-teilen/1',
      erstelltAm: '2026-10-26T10:00:00.000Z',
      appVersion: '1.2.3',
      wep: { ...w, ...(fotos.length ? { fotos: fotos.map((id) => ({ id, aufgenommenAm: JETZT, breite: 4, hoehe: 3, groesse: 3 })) } : {}), ...(opt.bauExcel ? { bauExcel: { name: 'b.xlsx', groesse: 3, version: 'v', hinzugefuegtAm: JETZT } } : {}) },
      geaendertAm: opt.geaendertAm,
      enthaelt: { fotos: fotos.length > 0, bauExcel: Boolean(opt.bauExcel) },
      fotos: fotos.map((id) => ({ id })),
    }),
  )
  for (const id of fotos) z.file(`fotos/${id}.jpg`, new Uint8Array([1, 2, 3]))
  if (opt.bauExcel) z.file('bau.xlsx', new Uint8Array([9, 9, 9]))
  return z.generateAsync({ type: 'uint8array' })
}

describe('Dateien einlesen', () => {
  it('.wep mit Fotos und Bau-Excel: Stand aus der Datei, Status „neu“', async () => {
    const d = await wepDatei(wep('2026-152'), { geaendertAm: '2026-10-25T08:00:00.000Z', fotos: ['f1', 'f2'], bauExcel: true })
    const erg = await leseEingangsDateien([{ name: '2026-152_Rosenthal-Süd.wep', daten: d }], JETZT)
    expect(erg.fehler).toEqual([])
    expect(erg.weps).toHaveLength(1)
    const g = erg.weps[0]
    expect(g.eingang).toMatchObject({ id: `${UUID}|2026-10-25T08:00:00.000Z`, stand: '2026-10-25T08:00:00.000Z', status: 'neu', notiz: '', eingangAm: JETZT, fotoIds: ['f1', 'f2'], hatBauExcel: true, appVersion: '1.2.3' })
    expect(g.fotos.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(g.bauExcel).toEqual(new Uint8Array([9, 9, 9]))
  })

  it('Paket „…_an-BV.zip“: die WEP-Datei darin wird gelesen, PDFs und Fotos daneben übersprungen', async () => {
    const paket = new JSZip()
    paket.file('2026-152_Rosenthal-Süd.wep', await wepDatei(wep('2026-152')))
    paket.file('2026-152_WEP_uebersichtlich.pdf', 'pdf')
    paket.file('Fotos/01_Apfel.jpg', new Uint8Array([1]))
    const erg = await leseEingangsDateien(
      [
        { name: '2026-152_Rosenthal-Süd_Parzelle_12_an-BV.zip', daten: await paket.generateAsync({ type: 'uint8array' }) },
        { name: 'Anschreiben.pdf', daten: new Uint8Array([1]) },
        { name: 'Foto.jpg', daten: new Uint8Array([1]) },
      ],
      JETZT,
    )
    expect(erg.weps.map((w) => w.eingang.wep.formalien.vorgangsNr)).toEqual(['2026-152'])
    expect(erg.uebersprungen).toEqual(['Anschreiben.pdf', 'Foto.jpg'])
    // ohne Stand in der Datei gilt „erstellt am“
    expect(erg.weps[0].eingang.stand).toBe('2026-10-26T10:00:00.000Z')
  })

  it('ohne passende Endung: am Inhalt als WEP-Datei bzw. Paket erkannt', async () => {
    const paket = new JSZip()
    paket.file('x.wep', await wepDatei(wep('2026-152')))
    const erg = await leseEingangsDateien(
      [
        { name: 'Anhang', daten: await wepDatei(wep('2026-150', 'a1b2c3d4-0000-4000-8000-000000000005')) },
        { name: 'Anhang (1)', daten: new Blob([await paket.generateAsync({ type: 'uint8array' })]) },
      ],
      JETZT,
    )
    expect(erg.weps.map((w) => w.eingang.wep.formalien.vorgangsNr)).toEqual(['2026-150', '2026-152'])
  })

  it('mehrere WEPs in einem Paket, ZIP ohne WEP übersprungen, kaputte Datei gemeldet', async () => {
    const paket = new JSZip()
    paket.file('a.wep', await wepDatei(wep('2026-001', 'a1b2c3d4-0000-4000-8000-000000000001')))
    paket.file('b.wep', await wepDatei(wep('2026-002', 'a1b2c3d4-0000-4000-8000-000000000002')))
    paket.file('kaputt.wep', 'kein zip')
    const leer = new JSZip()
    leer.file('liesmich.txt', 'hallo')
    const erg = await leseEingangsDateien(
      [
        { name: 'sammel.zip', daten: await paket.generateAsync({ type: 'uint8array' }) },
        { name: 'nichts.zip', daten: await leer.generateAsync({ type: 'uint8array' }) },
        { name: 'falsch.wep', daten: new TextEncoder().encode('Hallo') },
      ],
      JETZT,
    )
    expect(erg.weps.map((w) => w.eingang.wep.formalien.vorgangsNr).sort()).toEqual(['2026-001', '2026-002'])
    expect(erg.uebersprungen).toEqual(['nichts.zip'])
    expect(erg.fehler.map((f) => f.datei)).toEqual(['sammel.zip → kaputt.wep', 'falsch.wep'])
    expect(erg.fehler[1].meldung).toMatch(/keine WEP-Datei/)
  })
})

describe('Liste: Hinweise', () => {
  const eingang = (w: Wep, stand: string, eingangAm: string): BvEingang => ({
    id: eingangsSchluessel(w, stand),
    wep: w,
    stand,
    appVersion: '',
    dateiname: 'x.wep',
    eingangAm,
    status: 'neu',
    notiz: '',
    fotoIds: [],
    hatBauExcel: false,
  })

  it('fehlende Vorgangs-Nr.; doppelte Nr. mit Kennzeichnung der neueren Fassung; neueste Eingänge zuerst', () => {
    const alt = eingang(wep('2026-152'), '2026-10-20T08:00:00.000Z', '2026-10-21T08:00:00.000Z')
    const neu = eingang(wep('2026-152'), '2026-10-25T08:00:00.000Z', '2026-10-25T09:00:00.000Z')
    const anderes = eingang(wep('2026-152', 'a1b2c3d4-0000-4000-8000-000000000009'), '2026-10-22T08:00:00.000Z', '2026-10-23T08:00:00.000Z')
    const ohne = eingang(wep('', 'a1b2c3d4-0000-4000-8000-000000000003'), '2026-10-24T08:00:00.000Z', '2026-10-24T08:00:00.000Z')
    const einzeln = eingang(wep('2026-200', 'a1b2c3d4-0000-4000-8000-000000000004'), '2026-10-19T08:00:00.000Z', '2026-10-19T08:00:00.000Z')
    const z = bvZeilen([alt, ohne, einzeln, neu, anderes])
    expect(z.map((x) => x.eingang.id)).toEqual([neu.id, ohne.id, anderes.id, alt.id, einzeln.id])
    const nach = (e: BvEingang) => z.find((x) => x.eingang.id === e.id)!.hinweise
    expect(nach(neu)).toEqual([{ art: 'doppelt', neueste: true, anzahl: 3 }])
    expect(nach(alt)).toEqual([{ art: 'doppelt', neueste: false, anzahl: 3 }])
    expect(nach(anderes)).toEqual([{ art: 'doppelt', neueste: false, anzahl: 3 }])
    expect(nach(ohne)).toEqual([{ art: 'fehlt' }])
    expect(nach(einzeln)).toEqual([])
  })
})
