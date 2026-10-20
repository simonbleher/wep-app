import { describe, expect, it } from 'vitest'
import { neuerWep, type Wep } from '@/model'
import {
  entpacke,
  konfliktName,
  synchronisiere,
  verpacke,
  wartetAufUpload,
  wepIdAusName,
} from './engine'
import { erstelleGraphClient } from './graph'
import { FakeLokal as BasisLokal } from './testHilfen'
import type { GraphClient, RemoteDatei } from './types'

// --- Test-Doubles ----------------------------------------------------------

class FakeOneDrive implements GraphClient {
  dateien = new Map<string, { inhalt: string; eTag: string; geaendertAm: string }>()
  private zaehler = 0
  aufrufe: string[] = []

  async liste(): Promise<RemoteDatei[]> {
    this.aufrufe.push('liste')
    return [...this.dateien].map(([name, d]) => ({ name, eTag: d.eTag, geaendertAm: d.geaendertAm }))
  }
  async lade(name: string): Promise<string> {
    this.aufrufe.push(`lade ${name}`)
    const d = this.dateien.get(name)
    if (!d) throw new Error(`404 ${name}`)
    return d.inhalt
  }
  async schreibe(name: string, inhalt: string): Promise<RemoteDatei> {
    this.aufrufe.push(`schreibe ${name}`)
    const eTag = `etag-${++this.zaehler}`
    const geaendertAm = new Date(Date.UTC(2026, 9, 17, 12, 0, this.zaehler)).toISOString()
    this.dateien.set(name, { inhalt, eTag, geaendertAm })
    return { name, eTag, geaendertAm }
  }
  async verschiebe(): Promise<'verschoben' | 'vorhanden'> {
    throw new Error('wird im Engine-Test nicht gebraucht')
  }
  async loesche(name: string): Promise<void> {
    this.dateien.delete(name)
  }
}

/** Wie FakeLokal aus testHilfen, mit der alten Test-Abkürzung `bearbeite(wep, zeit)`. */
class FakeLokal extends BasisLokal {
  /** Simuliert speichereWep() der App (setzt die Änderungsmarke). */
  bearbeite(wep: Wep, zeit: string) {
    this.weps.set(wep.id, structuredClone(wep))
    const alt = this.meta.get(wep.id)
    this.meta.set(wep.id, { ...alt, id: wep.id, lokalGeaendertAm: zeit, geloescht: false })
  }
}

function wep(id: string, anlage: string): Wep {
  const w = neuerWep(id)
  w.formalien.kleingartenanlage = anlage
  return w
}

let uhr = 0
const jetzt = () => new Date(Date.UTC(2026, 9, 17, 13, 0, ++uhr)).toISOString()

async function sync(drive: FakeOneDrive, lokal: FakeLokal, geraet: string) {
  // Der Papierkorb gehört zu papierkorb.test.ts; hier bleibt er leer
  return synchronisiere({ client: drive, papierkorb: new FakeOneDrive(), lokal, geraet, jetzt })
}

// --- Tests -----------------------------------------------------------------

describe('Hilfsfunktionen', () => {
  it('Dateinamen und Konfliktkopien', () => {
    expect(wepIdAusName('2026-001.json')).toBe('2026-001')
    expect(wepIdAusName('2026-001.konflikt-2026-10-17T10-00-00-000Z.json')).toBeNull()
    expect(wepIdAusName('notiz.txt')).toBeNull()
    expect(konfliktName('2026-001', '2026-10-17T10:00:00.000Z')).toBe(
      '2026-001.konflikt-2026-10-17T10-00-00-000Z.json',
    )
  })

  it('verpacken und entpacken ist verlustfrei', () => {
    const w = wep('2026-001', 'KGA Sonnenschein')
    const d = entpacke(verpacke(w, '2026-10-17T10:00:00.000Z', 'Handy'))
    expect(d.wep).toEqual(w)
    expect(d.geraet).toBe('Handy')
    expect(() => entpacke('{"x":1}')).toThrow()
  })

  it('Warteschlange: ohne Abgleich oder nach lokaler Änderung wartet ein WEP', () => {
    expect(wartetAufUpload(undefined)).toBe(true)
    expect(wartetAufUpload({ id: 'a', lokalGeaendertAm: '2026-01-02' })).toBe(true)
    expect(
      wartetAufUpload({ id: 'a', lokalGeaendertAm: '2026-01-02', letzterSyncAm: '2026-01-03' }),
    ).toBe(false)
    expect(
      wartetAufUpload({ id: 'a', lokalGeaendertAm: '2026-01-04', letzterSyncAm: '2026-01-03' }),
    ).toBe(true)
  })
})

describe('Abgleich zwischen zwei Geräten', () => {
  it('Upload vom Handy, Download auf dem Tablet', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    const tablet = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'KGA Sonnenschein'), jetzt())

    const e1 = await sync(drive, handy, 'Handy')
    expect(e1.hochgeladen).toEqual(['2026-001'])
    expect(drive.dateien.has('2026-001.json')).toBe(true)

    const e2 = await sync(drive, tablet, 'Tablet')
    expect(e2.heruntergeladen).toEqual(['2026-001'])
    expect(tablet.weps.get('2026-001')?.formalien.kleingartenanlage).toBe('KGA Sonnenschein')
    // Tablet hat danach nichts zu tun
    const e3 = await sync(drive, tablet, 'Tablet')
    expect(e3.hochgeladen).toEqual([])
    expect(e3.heruntergeladen).toEqual([])
  })

  it('ohne Änderungen wird nichts hoch- oder heruntergeladen', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    await sync(drive, handy, 'Handy')
    drive.aufrufe = []
    const e = await sync(drive, handy, 'Handy')
    expect(e).toEqual({
      hochgeladen: [],
      heruntergeladen: [],
      konflikte: [],
      fehler: [],
      geloescht: [],
      wiederhergestellt: [],
      bereinigt: [],
      umnummeriert: [],
    })
    expect(drive.aufrufe).toEqual(['liste'])
  })

  it('Offline-Warteschlange: Änderungen ohne Netz werden beim nächsten Abgleich hochgeladen', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    await sync(drive, handy, 'Handy')

    // Offline bearbeitet (kein Abgleich möglich) – mehrere WEPs
    const geaendert = wep('2026-001', 'A geändert')
    handy.bearbeite(geaendert, jetzt())
    handy.bearbeite(wep('2026-002', 'B'), jetzt())
    const wartend = [...handy.meta.values()].filter(wartetAufUpload).map((m) => m.id)
    expect(wartend.sort()).toEqual(['2026-001', '2026-002'])

    // Wieder online
    const e = await sync(drive, handy, 'Handy')
    expect(e.hochgeladen.sort()).toEqual(['2026-001', '2026-002'])
    expect(entpacke(drive.dateien.get('2026-001.json')!.inhalt).wep.formalien.kleingartenanlage).toBe(
      'A geändert',
    )
    expect([...handy.meta.values()].filter(wartetAufUpload)).toEqual([])
  })

  it('Änderung auf dem Tablet kommt beim Handy an', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    const tablet = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    await sync(drive, handy, 'Handy')
    await sync(drive, tablet, 'Tablet')

    tablet.bearbeite(wep('2026-001', 'vom Tablet'), jetzt())
    await sync(drive, tablet, 'Tablet')
    const e = await sync(drive, handy, 'Handy')
    expect(e.heruntergeladen).toEqual(['2026-001'])
    expect(handy.weps.get('2026-001')?.formalien.kleingartenanlage).toBe('vom Tablet')
  })

  it('Konflikt: neuere Änderung gewinnt, ältere bleibt als Konflikt-Kopie', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    const tablet = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    await sync(drive, handy, 'Handy')
    await sync(drive, tablet, 'Tablet')

    // Beide ändern offline; das Handy später
    tablet.bearbeite(wep('2026-001', 'Tablet-Fassung'), jetzt())
    handy.bearbeite(wep('2026-001', 'Handy-Fassung'), jetzt())

    await sync(drive, tablet, 'Tablet') // Tablet lädt zuerst hoch (kein Konflikt für das Tablet)
    const e = await sync(drive, handy, 'Handy')

    expect(e.konflikte).toHaveLength(1)
    expect(e.konflikte[0].wepId).toBe('2026-001')
    // Handy-Fassung ist neuer und steht jetzt in OneDrive
    expect(entpacke(drive.dateien.get('2026-001.json')!.inhalt).wep.formalien.kleingartenanlage).toBe(
      'Handy-Fassung',
    )
    // Tablet-Fassung ist als Konflikt-Kopie erhalten
    const kopien = [...drive.dateien.keys()].filter((n) => n.includes('.konflikt-'))
    expect(kopien).toHaveLength(1)
    expect(entpacke(drive.dateien.get(kopien[0])!.inhalt).wep.formalien.kleingartenanlage).toBe(
      'Tablet-Fassung',
    )

    // Das Tablet übernimmt beim nächsten Abgleich die gewinnende Fassung
    const e2 = await sync(drive, tablet, 'Tablet')
    expect(e2.heruntergeladen).toEqual(['2026-001'])
    expect(tablet.weps.get('2026-001')?.formalien.kleingartenanlage).toBe('Handy-Fassung')
  })

  it('Konflikt: OneDrive-Fassung ist neuer → wird übernommen, lokale wird gesichert', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    const tablet = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    await sync(drive, handy, 'Handy')
    await sync(drive, tablet, 'Tablet')

    handy.bearbeite(wep('2026-001', 'Handy alt'), jetzt())
    tablet.bearbeite(wep('2026-001', 'Tablet neu'), jetzt())
    await sync(drive, tablet, 'Tablet')
    const e = await sync(drive, handy, 'Handy')

    expect(e.konflikte).toHaveLength(1)
    expect(handy.weps.get('2026-001')?.formalien.kleingartenanlage).toBe('Tablet neu')
    const kopie = [...drive.dateien.keys()].find((n) => n.includes('.konflikt-'))!
    expect(entpacke(drive.dateien.get(kopie)!.inhalt).wep.formalien.kleingartenanlage).toBe('Handy alt')
  })

  it('gleiches WEP auf beiden Seiten ohne Unterschied ist kein Konflikt', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    const tablet = new FakeLokal()
    const w = wep('2026-001', 'A')
    handy.bearbeite(w, jetzt())
    tablet.bearbeite(w, jetzt())
    await sync(drive, handy, 'Handy')
    const e = await sync(drive, tablet, 'Tablet')
    expect(e.konflikte).toEqual([])
    expect([...drive.dateien.keys()]).toEqual(['2026-001.json'])
  })

  it('lokal gelöschtes WEP wird nicht wieder heruntergeladen (Papierkorb, siehe papierkorb.test.ts)', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    await sync(drive, handy, 'Handy')
    await handy.legeInPapierkorb('2026-001', jetzt(), 'Handy')
    const e = await sync(drive, handy, 'Handy')
    expect(e.heruntergeladen).toEqual([])
    expect(handy.weps.has('2026-001')).toBe(false)
    expect(handy.korb.has('2026-001')).toBe(true)
  })

  it('Fehler bei einer Datei bricht den Abgleich der anderen nicht ab', async () => {
    const drive = new FakeOneDrive()
    const handy = new FakeLokal()
    drive.dateien.set('2026-009.json', { inhalt: 'kaputt', eTag: 'x', geaendertAm: '2026-01-01' })
    handy.bearbeite(wep('2026-001', 'A'), jetzt())
    const e = await sync(drive, handy, 'Handy')
    expect(e.hochgeladen).toEqual(['2026-001'])
    expect(e.fehler.map((f) => f.wepId)).toEqual(['2026-009'])
  })
})

describe('Graph-Client', () => {
  it('nutzt nur den App-Ordner und schickt das Token mit', async () => {
    const aufrufe: { url: string; init?: RequestInit }[] = []
    const holen = (async (url: string, init?: RequestInit) => {
      aufrufe.push({ url, init })
      if (url.includes('/children')) {
        return new Response(
          JSON.stringify({
            value: [
              { name: '2026-001.json', eTag: 'e1', lastModifiedDateTime: '2026-10-17T10:00:00Z', file: {} },
              { name: 'Unterordner', eTag: 'e2', lastModifiedDateTime: '2026-10-17T10:00:00Z' },
            ],
          }),
        )
      }
      if (init?.method === 'PUT') {
        return new Response(
          JSON.stringify({ name: '2026-001.json', eTag: 'e3', lastModifiedDateTime: '2026-10-17T11:00:00Z' }),
        )
      }
      return new Response('{"inhalt":1}')
    }) as typeof fetch
    const client = erstelleGraphClient(async () => 'TOKEN', holen)

    expect(await client.liste()).toEqual([
      { name: '2026-001.json', eTag: 'e1', geaendertAm: '2026-10-17T10:00:00Z' },
    ])
    expect(await client.lade('2026-001.json')).toBe('{"inhalt":1}')
    expect((await client.schreibe('2026-001.json', '{}')).eTag).toBe('e3')

    for (const a of aufrufe) {
      expect(a.url.startsWith('https://graph.microsoft.com/v1.0/me/drive/special/approot')).toBe(true)
      expect((a.init?.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
    }
  })

  it('arbeitet in Ordnern: Pfade, fehlender Ordner = leere Liste, Verschieben per Ordner-Id', async () => {
    const aufrufe: { url: string; methode: string; body?: string }[] = []
    const holen = (async (url: string, init?: RequestInit) => {
      aufrufe.push({ url, methode: init?.method ?? 'GET', body: init?.body as string | undefined })
      if (url.includes('/daten:/children')) return new Response('', { status: 404 })
      if (url.includes('?$select=id')) return new Response('{"id":"ORDNER-ID"}')
      if (init?.method === 'PATCH') return new Response('{}')
      return new Response('{"name":"a.xlsx","eTag":"e9","lastModifiedDateTime":"2026-10-20T10:00:00Z"}')
    }) as unknown as typeof fetch
    const basis = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'

    const daten = erstelleGraphClient(async () => 'T', holen, 'daten')
    expect(await daten.liste()).toEqual([])
    await daten.schreibe('2026-001.json', '{}')
    const exporte = erstelleGraphClient(async () => 'T', holen, 'Exporte')
    await exporte.schreibe('2026-001_WEP.xlsx', new Blob(['x']), 'application/xlsx')

    const wurzel = erstelleGraphClient(async () => 'T', holen)
    expect(await wurzel.verschiebe('2026-001.json', 'daten')).toBe('verschoben')

    expect(aufrufe.map((a) => a.url)).toEqual([
      `${basis}:/daten:/children?$select=name,eTag,lastModifiedDateTime,file&$top=200`,
      `${basis}:/daten/2026-001.json:/content`,
      `${basis}:/Exporte/2026-001_WEP.xlsx:/content`,
      `${basis}:/daten?$select=id`,
      `${basis}:/2026-001.json:`,
    ])
    expect(JSON.parse(aufrufe[4].body as string)).toMatchObject({
      parentReference: { id: 'ORDNER-ID' },
      '@microsoft.graph.conflictBehavior': 'fail',
    })
  })

  it('Verschieben: Konflikt 409 heißt „vorhanden“, ein fehlender Zielordner wird angelegt', async () => {
    const aufrufe: string[] = []
    const holen = (async (url: string, init?: RequestInit) => {
      aufrufe.push(`${init?.method ?? 'GET'} ${url.replace(/^.*\/me\/drive/, '')}`)
      if (url.endsWith('approot?$select=id')) return new Response('{"id":"ROOT"}')
      if (url.includes('?$select=id')) return new Response('', { status: 404 })
      if (init?.method === 'POST') return new Response('{"id":"NEU"}')
      return new Response('', { status: 409 })
    }) as unknown as typeof fetch

    const wurzel = erstelleGraphClient(async () => 'T', holen)
    expect(await wurzel.verschiebe('a.json', 'daten')).toBe('vorhanden')
    expect(aufrufe).toEqual([
      'GET /special/approot:/daten?$select=id',
      'GET /special/approot?$select=id',
      'POST /items/ROOT/children',
      'PATCH /special/approot:/a.json:',
    ])
  })

  it('meldet HTTP-Fehler', async () => {
    const holen = (async () => new Response('nein', { status: 401 })) as unknown as typeof fetch
    const client = erstelleGraphClient(async () => 'TOKEN', holen)
    await expect(client.liste()).rejects.toThrow('401')
  })
})
