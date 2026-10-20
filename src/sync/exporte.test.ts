import { describe, expect, it } from 'vitest'
import { FakeDrive } from './fakeDrive'
import { exportHochladen, leereExportWarteschlange, type ExportEintrag, type ExportSpeicher } from './exporte'
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
