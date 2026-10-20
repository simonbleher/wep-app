import { describe, expect, it } from 'vitest'
import { neuerWep } from '@/model'
import { entpacke } from '@/sync/engine'
import type { SyncMeta } from '@/sync/types'
import type { UploadErgebnis, WarteschlangenEintrag } from './native'
import { erstelleWarteschlange } from './warteschlange'

function aufbau(start: SyncMeta[] = []) {
  const metas = new Map(start.map((m) => [m.id, m]))
  const queue = new Map<string, WarteschlangenEintrag & { inhalt: string }>()
  /** Löschsperre des nativen Teils (Warteschlange.kt): Name → Löschzeitpunkt. */
  const gesperrt = new Map<string, string>()
  let ergebnisse: UploadErgebnis[] = []
  const native = {
    async reiheEin(a: { name: string; inhalt: string; eTag?: string; geaendertAm: string; sperreAufheben?: boolean }) {
      if (a.sperreAufheben) gesperrt.delete(a.name)
      else if (gesperrt.has(a.name)) return // wie nativ: gesperrte Namen werden nicht eingereiht
      queue.set(a.name, {
        name: a.name,
        inhalt: a.inhalt,
        eTag: a.eTag,
        geaendertAm: a.geaendertAm,
        eingereihtAm: 'jetzt',
        blockiert: false,
        groesse: a.inhalt.length,
      })
    },
    async entferne(a: { name: string }) {
      queue.delete(a.name)
    },
    async markiereGeloescht(a: { name: string; geloeschtAm: string }) {
      queue.delete(a.name)
      gesperrt.set(a.name, a.geloeschtAm)
    },
    async liste() {
      return { eintraege: [...queue.values()] }
    },
    async holeErgebnisse() {
      const e = ergebnisse
      ergebnisse = []
      return { ergebnisse: e }
    },
  }
  const meta = {
    alleMeta: async () => [...metas.values()],
    setzeMeta: async (m: SyncMeta) => void metas.set(m.id, m),
  }
  return {
    q: erstelleWarteschlange(native, meta, () => 'Testgerät'),
    native,
    queue,
    gesperrt,
    metas,
    setzeErgebnisse: (e: UploadErgebnis[]) => void (ergebnisse = e),
  }
}

describe('Upload-Warteschlange (JS-Teil)', () => {
  it('reiht die WEP-Datei im Sync-Format mit letztem bekannten eTag ein', async () => {
    const t = aufbau([{ id: '2026-001', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', letzterSyncAm: '2026-10-19T10:00:00.000Z', remoteETag: '"E1"' }])
    const wep = neuerWep('2026-001')
    await t.q.einreihen(wep)
    const e = t.queue.get('2026-001.json')
    expect(e).toMatchObject({ eTag: '"E1"', geaendertAm: '2026-10-20T10:00:00.000Z' })
    const datei = entpacke(e?.inhalt as string)
    expect(datei.wep.id).toBe('2026-001')
    expect(datei.geraet).toBe('Testgerät')
    expect(datei.geaendertAm).toBe('2026-10-20T10:00:00.000Z')
  })

  it('ersetzt bei erneuter Speicherung die alte Fassung (eine Datei je WEP)', async () => {
    const t = aufbau([{ id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z' }])
    const wep = neuerWep('A')
    await t.q.einreihen(wep)
    t.metas.set('A', { id: 'A', lokalGeaendertAm: '2026-10-20T11:00:00.000Z' })
    await t.q.einreihen({ ...wep, formalien: { ...wep.formalien, kleingartenanlage: 'Neu' } })
    expect(t.queue.size).toBe(1)
    expect(entpacke(t.queue.get('A.json')?.inhalt as string).wep.formalien.kleingartenanlage).toBe('Neu')
  })

  it('übernimmt Worker-Ergebnisse: neuer eTag, WEP gilt als abgeglichen', async () => {
    const t = aufbau([{ id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', remoteETag: '"E1"' }])
    t.setzeErgebnisse([{ name: 'A.json', eTag: '"E2"', geaendertAm: '2026-10-20T10:00:00.000Z', zeit: '2026-10-20T12:00:00.000Z' }])
    expect(await t.q.uebernimmErgebnisse()).toBe(1)
    expect(t.metas.get('A')).toMatchObject({ remoteETag: '"E2"', letzterSyncAm: '2026-10-20T10:00:00.000Z' })
  })

  it('markiert ein WEP, das nach dem Upload erneut geändert wurde, weiter als wartend', async () => {
    const t = aufbau([{ id: 'A', lokalGeaendertAm: '2026-10-20T11:00:00.000Z' }])
    t.setzeErgebnisse([{ name: 'A.json', eTag: '"E2"', geaendertAm: '2026-10-20T10:00:00.000Z', zeit: '2026-10-20T10:30:00.000Z' }])
    await t.q.uebernimmErgebnisse()
    const m = t.metas.get('A') as SyncMeta
    expect(m.remoteETag).toBe('"E2"')
    expect(m.lokalGeaendertAm > (m.letzterSyncAm as string)).toBe(true)
  })

  it('lässt einen neueren Stand der App unberührt und ignoriert unbekannte/gelöschte WEPs', async () => {
    const t = aufbau([
      { id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', letzterSyncAm: '2026-10-20T13:00:00.000Z', remoteETag: '"APP"' },
      { id: 'G', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', geloescht: true },
    ])
    t.setzeErgebnisse([
      { name: 'A.json', eTag: '"ALT"', geaendertAm: '2026-10-20T10:00:00.000Z', zeit: '2026-10-20T12:00:00.000Z' },
      { name: 'G.json', eTag: '"X"', geaendertAm: '2026-10-20T10:00:00.000Z', zeit: '2026-10-20T12:00:00.000Z' },
      { name: 'unbekannt.json', eTag: '"Y"', geaendertAm: '2026-10-20T10:00:00.000Z', zeit: '2026-10-20T12:00:00.000Z' },
    ])
    await t.q.uebernimmErgebnisse()
    expect(t.metas.get('A')?.remoteETag).toBe('"APP"')
    expect(t.metas.get('G')?.remoteETag).toBeUndefined()
    expect(t.metas.has('unbekannt')).toBe(false)
  })

  it('bereinigt Einträge, die die App schon abgeglichen hat, und gelöschte WEPs', async () => {
    const t = aufbau([
      { id: 'wartet', lokalGeaendertAm: '2026-10-20T10:00:00.000Z' },
      { id: 'erledigt', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', letzterSyncAm: '2026-10-20T10:00:00.000Z' },
      { id: 'weg', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', geloescht: true },
    ])
    for (const id of ['wartet', 'erledigt', 'ohne-meta']) await t.q.einreihen(neuerWep(id))
    // Ein Eintrag, der vor dem Löschen schon in der Warteschlange lag
    await t.native.reiheEin({ name: 'weg.json', inhalt: '{}', geaendertAm: 'x', sperreAufheben: true })
    expect(await t.q.bereinige()).toBe(3)
    expect([...t.queue.keys()]).toEqual(['wartet.json'])
    expect(t.gesperrt.has('weg.json')).toBe(true) // auch gesperrt, nicht nur entfernt
  })

  it('entfernt die Datei eines gelöschten WEP und sperrt den Namen für Uploads', async () => {
    const t = aufbau([{ id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z' }])
    await t.q.einreihen(neuerWep('A'))
    await t.q.entfernen('A', '2026-10-21T08:00:00.000Z')
    expect(t.queue.size).toBe(0)
    expect(t.gesperrt.get('A.json')).toBe('2026-10-21T08:00:00.000Z')
  })

  it('reiht ein gelöschtes WEP nie wieder ein (verzögerte Speicherung, Abgleich, App-Neustart)', async () => {
    const t = aufbau([{ id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z' }])
    await t.q.einreihen(neuerWep('A'))
    t.metas.set('A', { id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z', geloescht: true, geloeschtAm: '2026-10-21T08:00:00.000Z' })
    await t.q.entfernen('A', '2026-10-21T08:00:00.000Z')

    await t.q.einreihen(neuerWep('A')) // z. B. eine entprellte Speicherung, die zu spät kommt
    await t.native.reiheEin({ name: 'A.json', inhalt: '{}', geaendertAm: 'x' }) // anderer Aufrufer ohne Aufhebung
    expect(t.queue.size).toBe(0)
    await t.q.bereinige()
    expect(t.queue.size).toBe(0)
  })

  it('nach dem Wiederherstellen wartet der Abgleich der App, nicht der Hintergrunddienst', async () => {
    const t = aufbau([
      { id: 'A', lokalGeaendertAm: '2026-10-22T08:00:00.000Z', wiederhergestellt: true, letzterSyncAm: '2026-10-20T10:00:00.000Z' },
    ])
    await t.q.entfernen('A', '2026-10-21T08:00:00.000Z')
    await t.q.einreihen(neuerWep('A'))
    expect(t.queue.size).toBe(0) // die Papierkorb-Datei in OneDrive muss erst zurückgeholt werden

    // Nach dem Abgleich ist die Marke weg: normale Speicherungen werden wieder eingereiht und heben die Sperre auf
    t.metas.set('A', { id: 'A', lokalGeaendertAm: '2026-10-22T09:00:00.000Z', letzterSyncAm: '2026-10-22T08:30:00.000Z', remoteETag: '"E3"' })
    await t.q.einreihen(neuerWep('A'))
    expect(t.queue.get('A.json')?.eTag).toBe('"E3"')
    expect(t.gesperrt.has('A.json')).toBe(false)
  })

  it('ein Name darf nach „Endgültig löschen“ für ein neues WEP wieder benutzt werden', async () => {
    const t = aufbau([{ id: 'A', lokalGeaendertAm: '2026-10-20T10:00:00.000Z' }])
    await t.q.entfernen('A', '2026-10-21T08:00:00.000Z')
    t.metas.delete('A') // endgültig gelöscht, Meta weg
    t.metas.set('A', { id: 'A', lokalGeaendertAm: '2026-11-25T10:00:00.000Z' }) // neues WEP gleicher Nummer
    await t.q.einreihen(neuerWep('A'))
    expect(t.queue.has('A.json')).toBe(true)
  })
})
