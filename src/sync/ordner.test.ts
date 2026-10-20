import { describe, expect, it } from 'vitest'
import { FakeDrive } from './fakeDrive'
import { neuerWep } from '@/model'
import { synchronisiere, verpacke, wepIdAusName } from './engine'
import { FakeLokal } from './testHilfen'
import { LIESMICH_TEXT, richteOrdnerEin } from './ordner'

describe('Ordner-Migration (richteOrdnerEin)', () => {
  it('verschiebt WEP- und Konflikt-Dateien nach daten/ und legt LIESMICH.txt an', async () => {
    const drive = new FakeDrive()
    drive.lege('2026-001.json')
    drive.lege('2026-002.json')
    drive.lege('2026-001.konflikt-2026-10-17T10-00-00-000Z.json')

    const e = await richteOrdnerEin(drive.client())

    expect(e.verschoben.sort()).toEqual([
      '2026-001.json',
      '2026-001.konflikt-2026-10-17T10-00-00-000Z.json',
      '2026-002.json',
    ])
    expect(e.liesmichAngelegt).toBe(true)
    expect(drive.namen()).toEqual(['LIESMICH.txt'])
    expect(drive.namen('daten')).toHaveLength(3)
    expect(drive.dateien.get('LIESMICH.txt')?.inhalt).toBe(LIESMICH_TEXT)
    expect(LIESMICH_TEXT).toContain('bitte nichts von Hand ändern')
    expect(LIESMICH_TEXT).toContain('Exporte/')
  })

  it('ist idempotent: zweiter Lauf tut nichts mehr', async () => {
    const drive = new FakeDrive()
    drive.lege('2026-001.json', '{"alt":1}')
    await richteOrdnerEin(drive.client())
    const vorher = new Map(drive.dateien)
    drive.aufrufe = []

    const e = await richteOrdnerEin(drive.client())

    expect(e).toEqual({ verschoben: [], vorhanden: [], liesmichAngelegt: false })
    expect(drive.aufrufe).toEqual(['liste '])
    expect(drive.dateien).toEqual(vorher)
  })

  it('überschreibt nie: gibt es die Datei in daten/ schon, bleibt die alte unberührt', async () => {
    const drive = new FakeDrive()
    drive.lege('2026-001.json', '{"alt":true}')
    drive.lege('daten/2026-001.json', '{"neu":true}')

    const e = await richteOrdnerEin(drive.client())

    expect(e.verschoben).toEqual([])
    expect(e.vorhanden).toEqual(['2026-001.json'])
    expect(drive.dateien.get('daten/2026-001.json')?.inhalt).toBe('{"neu":true}')
    expect(drive.dateien.get('2026-001.json')?.inhalt).toBe('{"alt":true}')
  })

  it('lässt fremde Dateien, profil.json und eine vorhandene LIESMICH.txt in Ruhe', async () => {
    const drive = new FakeDrive()
    drive.lege('notizen.txt')
    drive.lege('Bau.xlsx')
    drive.lege('profil.json')
    drive.lege('LIESMICH.txt', 'von Hand')

    const e = await richteOrdnerEin(drive.client())

    expect(e).toEqual({ verschoben: [], vorhanden: [], liesmichAngelegt: false })
    expect(drive.namen()).toEqual(['Bau.xlsx', 'LIESMICH.txt', 'notizen.txt', 'profil.json'])
    expect(drive.dateien.get('LIESMICH.txt')?.inhalt).toBe('von Hand')
  })

  it('der Abgleich arbeitet danach nur in daten/ und hält profil.json für kein WEP', async () => {
    const drive = new FakeDrive()
    drive.lege('2026-001.json', verpacke(neuerWep('2026-001'), '2026-10-01T10:00:00.000Z', 'alt'))
    drive.lege('daten/profil.json', '{"format":"wep-profil/1"}')
    await richteOrdnerEin(drive.client())

    const lokal = new FakeLokal()
    const e = await synchronisiere({
      client: drive.client('daten'),
      papierkorb: drive.client('daten/papierkorb'),
      lokal,
      geraet: 'test',
    })
    const geladen = [...lokal.weps.keys()]

    expect(wepIdAusName('profil.json')).toBeNull()
    expect(geladen).toEqual(['2026-001'])
    expect(e.fehler).toEqual([])
    expect(drive.aufrufe.filter((a) => a.includes('profil.json'))).toEqual([])
  })

  it('„ohne Konto“ angelegte WEPs gehen beim ersten Abgleich nach der Anmeldung nach daten/', async () => {
    const drive = new FakeDrive()
    // ohne Konto gespeichert: Änderungsmarke, aber nie abgeglichen
    const lokal = new FakeLokal()
    for (const w of [neuerWep('2026-001'), neuerWep('2026-002')]) {
      await lokal.speichereWep(w, '2026-10-19T10:00:00.000Z')
    }
    await richteOrdnerEin(drive.client())
    const e = await synchronisiere({
      client: drive.client('daten'),
      papierkorb: drive.client('daten/papierkorb'),
      lokal,
      geraet: 'test',
    })

    expect(e.hochgeladen.sort()).toEqual(['2026-001', '2026-002'])
    expect(drive.namen('daten')).toEqual(['2026-001.json', '2026-002.json'])
    expect(drive.namen()).toEqual(['LIESMICH.txt'])
  })
})
