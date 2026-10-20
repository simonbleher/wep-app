// Foto-Teil der Android-Upload-Warteschlange: Sperre für gelöschte WEPs, Aufräumen, Ergebnisse.
import { describe, expect, it } from 'vitest'
import { neuerWep } from '@/model'
import { FakeFotos, FakeLokal } from '@/sync/testHilfen'
import { fotoKey } from '@/fotos/types'
import type { FotoUploadErgebnis, FotoWarteschlangenEintrag } from './native'
import { blobZuBase64, erstelleFotoWarteschlange } from './fotoWarteschlange'

function aufbau() {
  const lokal = new FakeLokal()
  const fotos = new FakeFotos()
  /** Nachbildung von FotoWarteschlange.kt: Einträge + Sperre je WEP. */
  const queue = new Map<string, FotoWarteschlangenEintrag & { base64: string }>()
  const gesperrt = new Set<string>()
  let ergebnisse: FotoUploadErgebnis[] = []
  const native = {
    async reiheFotoEin(a: { wepId: string; fotoId: string; base64: string }) {
      if (gesperrt.has(a.wepId)) return
      queue.set(`${a.wepId}/${a.fotoId}`, { wepId: a.wepId, fotoId: a.fotoId, eingereihtAm: 'jetzt', groesse: a.base64.length, base64: a.base64 })
    },
    async entferneFoto(a: { wepId: string; fotoId: string }) {
      queue.delete(`${a.wepId}/${a.fotoId}`)
    },
    async sperreFotos(a: { wepId: string; gesperrt: boolean }) {
      if (a.gesperrt) {
        gesperrt.add(a.wepId)
        for (const k of [...queue.keys()]) if (k.startsWith(`${a.wepId}/`)) queue.delete(k)
      } else gesperrt.delete(a.wepId)
    },
    async listeFotos() {
      return { eintraege: [...queue.values()] }
    },
    async holeFotoErgebnisse() {
      const e = ergebnisse
      ergebnisse = []
      return { ergebnisse: e }
    },
  }
  const q = erstelleFotoWarteschlange(native, fotos, lokal)
  const lebt = async (id: string) => void (await lokal.schreibe({ id, wep: neuerWep(id), meta: { id, lokalGeaendertAm: 'x' } }))
  const foto = (wepId: string, id: string, inhalt = 'bild') =>
    fotos.speichere(
      { key: fotoKey(wepId, id), wepId, id, hatDatei: true, hochgeladen: false, erstelltAm: 'x' },
      new Blob([inhalt]),
    )
  return { q, queue, gesperrt, lokal, fotos, lebt, foto, setzeErgebnisse: (e: FotoUploadErgebnis[]) => void (ergebnisse = e) }
}

describe('Upload-Warteschlange für Fotos (JS-Teil)', () => {
  it('reiht ein Foto eines lebenden WEP als Base64 ein', async () => {
    const t = aufbau()
    await t.lebt('A')
    await t.q.einreihen('A', 'f1', new Blob(['hallo']))
    expect(t.queue.get('A/f1')?.base64).toBe(btoa('hallo'))
    expect(await blobZuBase64(new Blob([new Uint8Array(100_000).fill(65)]))).toHaveLength(Math.ceil(100_000 / 3) * 4)
  })

  it('reiht nichts ein, wenn das WEP gelöscht oder gerade erst wiederhergestellt ist', async () => {
    const t = aufbau()
    await t.lebt('A')
    await t.lokal.legeInPapierkorb('A', 'jetzt', 'Test')
    await t.q.einreihen('A', 'f1', new Blob(['x']))
    expect(t.queue.size).toBe(0)

    await t.lebt('B')
    t.lokal.meta.set('B', { id: 'B', lokalGeaendertAm: 'x', wiederhergestellt: true })
    await t.q.einreihen('B', 'f1', new Blob(['x']))
    expect(t.queue.size).toBe(0)
  })

  it('WEP in den Papierkorb: Einträge fliegen raus, danach wird nichts mehr angenommen', async () => {
    const t = aufbau()
    await t.lebt('A')
    await t.q.einreihen('A', 'f1', new Blob(['x']))
    await t.q.einreihen('A', 'f2', new Blob(['y']))
    await t.lokal.legeInPapierkorb('A', 'jetzt', 'Test')
    await t.q.sperren('A')
    expect(t.queue.size).toBe(0)
    expect(t.gesperrt.has('A')).toBe(true)
    await t.q.einreihen('A', 'f3', new Blob(['z']))
    expect(t.queue.size).toBe(0)
    expect(t.gesperrt.has('A')).toBe(true) // die Sperre wird nicht versehentlich aufgehoben
  })

  it('abstimmen: Gelöschtes, Hochgeladenes und Fremdes raus, Offenes (auch nach Wiederherstellen) rein', async () => {
    const t = aufbau()
    await t.lebt('A')
    await t.lebt('B')
    await t.foto('A', 'neu')
    await t.foto('A', 'fertig')
    await t.fotos.setzeRecord({ ...t.fotos.record('A', 'fertig')!, hochgeladen: true })
    await t.foto('A', 'weg')
    await t.fotos.markiereGeloescht('A', 'weg', 'x')
    t.queue.set('A/fertig', { wepId: 'A', fotoId: 'fertig', eingereihtAm: 'x', groesse: 1, base64: '' })
    t.queue.set('A/weg', { wepId: 'A', fotoId: 'weg', eingereihtAm: 'x', groesse: 1, base64: '' })
    t.queue.set('X/ohne-wep', { wepId: 'X', fotoId: 'ohne-wep', eingereihtAm: 'x', groesse: 1, base64: '' })

    const e = await t.q.abstimmen()
    expect(e).toMatchObject({ eingereiht: 1, entfernt: 3 })
    expect([...t.queue.keys()]).toEqual(['A/neu'])
  })

  it('abstimmen: Papierkorb-WEPs werden gesperrt, ihre Fotos nicht eingereiht', async () => {
    const t = aufbau()
    await t.lebt('A')
    await t.foto('A', 'f1')
    await t.lokal.legeInPapierkorb('A', 'jetzt', 'Test')
    await t.q.abstimmen()
    expect(t.gesperrt.has('A')).toBe(true)
    expect(t.queue.size).toBe(0)

    // Wiederherstellen: erst wenn der Abgleich es in OneDrive zurückgeholt hat, geht der Upload wieder
    await t.lokal.schreibe({ id: 'A', wep: neuerWep('A'), papierkorb: null, meta: { id: 'A', lokalGeaendertAm: 'x', wiederhergestellt: true } })
    await t.q.abstimmen()
    expect(t.queue.size).toBe(0)
    t.lokal.meta.set('A', { id: 'A', lokalGeaendertAm: 'x' })
    await t.q.abstimmen()
    expect(t.gesperrt.has('A')).toBe(false)
    expect([...t.queue.keys()]).toEqual(['A/f1'])
  })

  it('Ergebnisse des Workers: Foto gilt als hochgeladen (gelöschte bleiben gelöscht)', async () => {
    const t = aufbau()
    await t.lebt('A')
    await t.foto('A', 'f1')
    await t.foto('A', 'f2')
    await t.fotos.markiereGeloescht('A', 'f2', 'x')
    t.setzeErgebnisse([
      { wepId: 'A', fotoId: 'f1', zeit: 'z' },
      { wepId: 'A', fotoId: 'f2', zeit: 'z' },
      { wepId: 'A', fotoId: 'unbekannt', zeit: 'z' },
    ])
    expect(await t.q.uebernimmErgebnisse()).toBe(3)
    expect(t.fotos.record('A', 'f1')?.hochgeladen).toBe(true)
    expect(t.fotos.record('A', 'f2')?.hochgeladen).toBe(false)
    expect(await t.q.uebernimmErgebnisse()).toBe(0)
  })
})
