import { describe, expect, it } from 'vitest'
import { FakeDrive } from './fakeDrive'
import {
  exportHochladen,
  exportOrdnerHochladen,
  leereExportWarteschlange,
  type ExportEintrag,
  type ExportSpeicher,
} from './exporte'
import type { GraphClient } from './types'

function speicher(): ExportSpeicher & { eintraege: Map<string, ExportEintrag> } {
  const eintraege = new Map<string, ExportEintrag>()
  return {
    eintraege,
    legeAb: async (e) => void eintraege.set(e.name, e),
    alle: async () => [...eintraege.values()],
    entferne: async (n) => void eintraege.delete(n),
  }
}

const blob = (t: string) => new Blob([t])

describe('Excel-Export nach OneDrive (Exporte/)', () => {
  it('angemeldet und online: sofort in Exporte/, nichts in der Warteschlange', async () => {
    const drive = new FakeDrive()
    const sp = speicher()
    const r = await exportHochladen({
      client: drive.client('Exporte'),
      speicher: sp,
      name: '2026-001_WEP.xlsx',
      blob: blob('x'),
    })
    expect(r).toBe('hochgeladen')
    expect(drive.namen('Exporte')).toEqual(['2026-001_WEP.xlsx'])
    expect(sp.eintraege.size).toBe(0)
  })

  it('offline: kommt in die Warteschlange und geht beim nächsten Abgleich hoch', async () => {
    const drive = new FakeDrive()
    const sp = speicher()
    const r = await exportHochladen({ client: null, speicher: sp, name: '2026-001_WEP.xlsx', blob: blob('x') })
    expect(r).toBe('wartet')
    expect(sp.eintraege.size).toBe(1)
    expect(drive.namen('Exporte')).toEqual([])

    const q = await leereExportWarteschlange(drive.client('Exporte'), sp)
    expect(q.hochgeladen).toEqual(['2026-001_WEP.xlsx'])
    expect(q.fehler).toEqual([])
    expect(sp.eintraege.size).toBe(0)
    expect(drive.namen('Exporte')).toEqual(['2026-001_WEP.xlsx'])
  })

  it('Upload schlägt fehl: Datei wartet, Fehler wird gemeldet, nichts geht verloren', async () => {
    const kaputt: GraphClient = {
      ...new FakeDrive().client('Exporte'),
      schreibe: async () => {
        throw new Error('OneDrive-Fehler 503')
      },
    }
    const sp = speicher()
    expect(
      await exportHochladen({ client: kaputt, speicher: sp, name: 'a.xlsx', blob: blob('x') }),
    ).toBe('wartet')
    const q = await leereExportWarteschlange(kaputt, sp)
    expect(q.hochgeladen).toEqual([])
    expect(q.fehler[0].text).toContain('503')
    expect(sp.eintraege.size).toBe(1)
  })

  it('ein neuerer Export ersetzt die wartende Fassung gleichen Namens', async () => {
    const sp = speicher()
    await exportHochladen({ client: null, speicher: sp, name: 'a.xlsx', blob: blob('alt') })
    await exportHochladen({ client: null, speicher: sp, name: 'a.xlsx', blob: blob('neu') })
    expect(sp.eintraege.size).toBe(1)
    expect(await sp.eintraege.get('a.xlsx')?.blob.text()).toBe('neu')

    // Online später: Upload ersetzt auch die Warteschlange
    const drive = new FakeDrive()
    await exportHochladen({ client: drive.client('Exporte'), speicher: sp, name: 'a.xlsx', blob: blob('neuer') })
    expect(sp.eintraege.size).toBe(0)
  })
})

describe('Foto-Ordner im Export (Exporte/<Nr>_Fotos/)', () => {
  const dateien = [
    { name: '00 Gesamtansicht 1.jpg', blob: blob('g1') },
    { name: '03 Apfelbaum.jpg', blob: blob('a') },
  ]
  const ordner = '2026-001_Fotos'

  it('online: legt den Ordner mit sprechenden Namen an und entfernt Reste eines früheren Exports', async () => {
    const drive = new FakeDrive()
    drive.lege(`Exporte/${ordner}/07 Alter Name.jpg`, blob('alt'))
    drive.lege(`Exporte/${ordner}/03 Apfelbaum.jpg`, blob('uralt'))
    const sp = speicher()
    const r = await exportOrdnerHochladen({
      client: drive.client('Exporte'),
      ordnerClient: (o) => drive.client(`Exporte/${o}`),
      speicher: sp,
      ordner,
      dateien,
    })
    expect(r).toEqual({ status: 'hochgeladen', wartend: 0 })
    expect(drive.namen(`Exporte/${ordner}`)).toEqual(['00 Gesamtansicht 1.jpg', '03 Apfelbaum.jpg'])
    expect(await (drive.dateien.get(`Exporte/${ordner}/03 Apfelbaum.jpg`)?.inhalt as Blob).text()).toBe('a')
    expect(sp.eintraege.size).toBe(0)
  })

  it('offline: wartet in der Warteschlange und geht beim nächsten Abgleich hoch', async () => {
    const drive = new FakeDrive()
    drive.lege(`Exporte/${ordner}/07 Alter Name.jpg`, blob('alt'))
    const sp = speicher()
    const r = await exportOrdnerHochladen({ client: null, ordnerClient: null, speicher: sp, ordner, dateien })
    expect(r).toEqual({ status: 'wartet', wartend: 2 })
    expect(drive.namen(`Exporte/${ordner}`)).toEqual(['07 Alter Name.jpg'])

    const q = await leereExportWarteschlange(drive.client('Exporte'), sp, (o) => drive.client(`Exporte/${o}`))
    expect(q.fehler).toEqual([])
    expect(drive.namen(`Exporte/${ordner}`)).toEqual(['00 Gesamtansicht 1.jpg', '03 Apfelbaum.jpg'])
    expect(sp.eintraege.size).toBe(0)
  })

  it('bricht der Upload mittendrin ab, wartet nur der Rest; aufgeräumt wird erst danach', async () => {
    const drive = new FakeDrive()
    drive.lege(`Exporte/${ordner}/07 Alter Name.jpg`, blob('alt'))
    const echt = drive.client('Exporte')
    let n = 0
    const wackelig = {
      ...echt,
      schreibe: async (...a: Parameters<typeof echt.schreibe>) => {
        if (++n === 2) throw new Error('503')
        return echt.schreibe(...a)
      },
    }
    const sp = speicher()
    const r = await exportOrdnerHochladen({
      client: wackelig,
      ordnerClient: (o) => drive.client(`Exporte/${o}`),
      speicher: sp,
      ordner,
      dateien,
    })
    expect(r).toEqual({ status: 'wartet', wartend: 1 })
    expect(drive.namen(`Exporte/${ordner}`)).toEqual(['00 Gesamtansicht 1.jpg', '07 Alter Name.jpg'])

    await leereExportWarteschlange(drive.client('Exporte'), sp, (o) => drive.client(`Exporte/${o}`))
    expect(drive.namen(`Exporte/${ordner}`)).toEqual(['00 Gesamtansicht 1.jpg', '03 Apfelbaum.jpg'])
    expect(sp.eintraege.size).toBe(0)
  })

  it('ein neuerer Export ersetzt die wartende ältere Fassung des Ordners', async () => {
    const sp = speicher()
    await exportOrdnerHochladen({ client: null, ordnerClient: null, speicher: sp, ordner, dateien })
    await exportOrdnerHochladen({ client: null, ordnerClient: null, speicher: sp, ordner, dateien: [dateien[0]] })
    expect([...sp.eintraege.keys()].sort()).toEqual([`${ordner}/`, `${ordner}/00 Gesamtansicht 1.jpg`])
    expect(sp.eintraege.get(`${ordner}/`)?.behalte).toEqual(['00 Gesamtansicht 1.jpg'])
  })

  it('Fotos haben den Medientyp JPEG, Excel bleibt Excel', async () => {
    const sp = speicher()
    await exportOrdnerHochladen({ client: null, ordnerClient: null, speicher: sp, ordner, dateien })
    expect(sp.eintraege.get(`${ordner}/03 Apfelbaum.jpg`)?.typ).toBe('image/jpeg')
    await exportHochladen({ client: null, speicher: sp, name: 'a.xlsx', blob: blob('x') })
    expect(sp.eintraege.get('a.xlsx')?.typ).toBeUndefined()
  })
})
