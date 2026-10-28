// @vitest-environment node
// Server-Modus (v2): Fotos und Bau-Excel gegen die echte Server-Logik (WEPs in SQLite, Dateien in einem R2-Ersatz).
import { describe, expect, it } from 'vitest'
import { neuerWep, type Wep } from '@/model'
import { fotoKey } from '@/fotos/types'
import { FakeBau, FakeFotos, FakeLokal, Uhr } from '@/sync/testHilfen'
import { testDb } from '../../functions/_lib/__tests__/sqliteDb'
import { fakeR2 } from '../../functions/_lib/__tests__/fakeR2'
import { dateiArt, pruefeZugriff } from '../../functions/_lib/v2/dateien'
import type { Konto } from '../../functions/_lib/v2/konten'
import { ladeWep, lesbareWeps, setzePapierkorb, speichereWep, type Ergebnis } from '../../functions/_lib/v2/weps'
import { AbgleichFehler, serverAbgleich, type ServerKopf, type ServerStand, type ServerZugriff } from './abgleich'
import { serverDateienAbgleichen, type DateiZugriff } from './dateiAbgleich'

const JPEG = () => new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3])], { type: 'image/jpeg' })
const XLSX = () => new Blob([new Uint8Array([0x50, 0x4b, 7, 7])])

function aufbau() {
  const db = testDb()
  const r2 = fakeR2()
  const uhr = new Uhr()
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh.prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES ('bau-1', 'google', 's', 'b@example.org', 'Bert Bauer', 'freigegeben', 'bau', ?, ?)").run(zeit, zeit)
  const bert: Konto = { id: 'bau-1', anbieter: 'google', email: 'b@example.org', name: 'Bert Bauer', status: 'freigegeben', rollen: ['bau'], mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
  const erg = <T,>(e: Ergebnis<T>): T => {
    if (e.ok) return e.wert
    throw new AbgleichFehler(e.fehler, e.status, e.stand as ServerStand | undefined)
  }
  const server: ServerZugriff = {
    liste: async () => (await lesbareWeps(db, bert)) as ServerKopf[],
    lade: async (id) => erg(await ladeWep(db, bert, id)) as ServerStand,
    speichere: async (w, rev) => erg(await speichereWep(db, bert, w.id, { wep: w, basisRev: rev }, Date.parse(uhr.jetzt()))) as ServerKopf,
    loesche: async (id, rev) => erg(await setzePapierkorb(db, bert, id, true, rev)) as ServerKopf,
    stelleWiederHer: async (id) => erg(await setzePapierkorb(db, bert, id, false, undefined)) as ServerKopf,
  }
  const dateien: DateiZugriff & { aufrufe: string[] } = {
    aufrufe: [],
    async hochladen(wepId, name, datei) {
      const art = dateiArt(wepId, name)!
      const z = await pruefeZugriff(db, bert, wepId, art)
      if (!z.ok) throw new AbgleichFehler(z.fehler, z.status)
      await r2.put(art.key, await datei.arrayBuffer())
      dateien.aufrufe.push(`PUT ${name}`)
    },
    async loesche(wepId, name) {
      const art = dateiArt(wepId, name)!
      const z = await pruefeZugriff(db, bert, wepId, art)
      if (!z.ok) throw new AbgleichFehler(z.fehler, z.status)
      await r2.delete(art.key)
      dateien.aufrufe.push(`DELETE ${name}`)
    },
  }
  const lokal = new FakeLokal()
  const fotos = new FakeFotos()
  const bau = new FakeBau()
  let wlan = true
  const abgleich = async () => {
    await serverAbgleich({ server, lokal, jetzt: uhr.jetzt })
    return serverDateienAbgleichen({ server: dateien, lokal, fotos, bau, uploadErlaubt: async () => wlan })
  }
  return { db, r2, uhr, lokal, fotos, bau, dateien, abgleich, setzeWlan: (w: boolean) => (wlan = w) }
}

function mitFoto(w: Wep, id: string): Wep {
  return { ...w, fotos: [...(w.fotos ?? []), { id, aufgenommenAm: '2026-10-28', breite: 10, hoehe: 10, groesse: 5 }] }
}

async function fotoAufnehmen(fotos: FakeFotos, wepId: string, id: string) {
  await fotos.speichere({ key: fotoKey(wepId, id), wepId, id, hatDatei: true, hochgeladen: false, erstelltAm: '2026-10-28T08:00:00.000Z' }, JPEG())
}

describe('Fotos und Bau-Excel auf dem Server', () => {
  it('Foto geht erst hoch, wenn das WEP auf dem Server ist; danach als hochgeladen markiert', async () => {
    const t = aufbau()
    await t.lokal.speichereWep(mitFoto(neuerWep('w1'), 'f1'), t.uhr.vor(1))
    await fotoAufnehmen(t.fotos, 'w1', 'f1')
    const e = await t.abgleich()
    expect(e.hochgeladen).toEqual(['w1/f1'])
    expect(t.r2.daten.has('weps/w1/fotos/f1.jpg')).toBe(true)
    expect(t.fotos.record('w1', 'f1')?.hochgeladen).toBe(true)
    expect((await t.abgleich()).hochgeladen).toEqual([]) // nichts doppelt
  })

  it('„nur WLAN“: Fotos warten und zählen als aufgeschoben', async () => {
    const t = aufbau()
    await t.lokal.speichereWep(mitFoto(neuerWep('w1'), 'f1'), t.uhr.vor(1))
    await fotoAufnehmen(t.fotos, 'w1', 'f1')
    t.setzeWlan(false)
    expect((await t.abgleich()).aufgeschoben).toBe(1)
    expect(t.r2.daten.size).toBe(0)
    t.setzeWlan(true)
    expect((await t.abgleich()).hochgeladen).toEqual(['w1/f1'])
  })

  it('gelöschtes Foto wird auf dem Server erst entfernt, wenn das WEP ohne das Foto dort ist', async () => {
    const t = aufbau()
    const w = mitFoto(neuerWep('w1'), 'f1')
    await t.lokal.speichereWep(w, t.uhr.vor(1))
    await fotoAufnehmen(t.fotos, 'w1', 'f1')
    await t.abgleich()
    // Foto löschen: aus dem WEP nehmen und markieren – WEP noch nicht hochgeladen
    await t.lokal.speichereWep({ ...w, fotos: [] }, t.uhr.vor(1))
    await t.fotos.setzeRecord({ ...t.fotos.record('w1', 'f1')!, geloescht: t.uhr.jetzt() })
    // Der Abgleich lädt erst das WEP hoch, dann wird das Foto entfernt (gleiche Runde)
    const e = await t.abgleich()
    expect(e.geloescht).toBe(1)
    expect(t.r2.daten.has('weps/w1/fotos/f1.jpg')).toBe(false)
    expect(t.fotos.record('w1', 'f1')).toBeUndefined()
  })

  it('steht ein gelöschtes Foto wieder im WEP (andere Fassung übernommen), bleibt es', async () => {
    const t = aufbau()
    const w = mitFoto(neuerWep('w1'), 'f1')
    await t.lokal.speichereWep(w, t.uhr.vor(1))
    await fotoAufnehmen(t.fotos, 'w1', 'f1')
    await t.abgleich()
    await t.fotos.setzeRecord({ ...t.fotos.record('w1', 'f1')!, geloescht: t.uhr.jetzt() })
    await t.abgleich()
    expect(t.r2.daten.has('weps/w1/fotos/f1.jpg')).toBe(true)
    expect(t.fotos.record('w1', 'f1')?.geloescht).toBeUndefined()
  })

  it('Bau-Excel: aktuelle Fassung hoch; entfernt → auf dem Server gelöscht', async () => {
    const t = aufbau()
    const w: Wep = { ...neuerWep('w1'), bauExcel: { name: 'Bau Testgarten.xlsx', groesse: 4, version: 'v1', hinzugefuegtAm: '2026-10-28' } }
    await t.lokal.speichereWep(w, t.uhr.vor(1))
    await t.bau.speichere({ wepId: 'w1', version: 'v1', hatDatei: true, hochgeladen: false, erstelltAm: '2026-10-28' }, XLSX())
    expect((await t.abgleich()).hochgeladen).toEqual(['w1/bau.xlsx'])
    expect(t.r2.daten.has('weps/w1/bau.xlsx')).toBe(true)
    // ältere Fassung im Speicher als im WEP: nicht hochladen
    await t.bau.speichere({ wepId: 'w1', version: 'v0', hatDatei: true, hochgeladen: false, erstelltAm: '2026-10-28' }, XLSX())
    expect((await t.abgleich()).hochgeladen).toEqual([])
    // entfernen
    const { bauExcel: _weg, ...ohne } = w
    await t.lokal.speichereWep(ohne as Wep, t.uhr.vor(1))
    await t.bau.setzeRecord({ wepId: 'w1', version: 'v1', hatDatei: false, hochgeladen: true, geloescht: t.uhr.jetzt(), erstelltAm: '2026-10-28' })
    await t.abgleich()
    expect(t.r2.daten.has('weps/w1/bau.xlsx')).toBe(false)
    expect(t.bau.record('w1')).toBeUndefined()
  })

  it('gesperrtes WEP: nichts hochladen, Hinweis; Papierkorb: Dateien bleiben auf dem Server', async () => {
    const t = aufbau()
    await t.lokal.speichereWep(mitFoto(neuerWep('w1'), 'f1'), t.uhr.vor(1))
    await t.abgleich() // WEP ohne Datei hoch
    t.db.roh.prepare("UPDATE weps SET zustand = 'beim_bv', rev = rev + 1 WHERE id = 'w1'").run()
    await fotoAufnehmen(t.fotos, 'w1', 'f1')
    const e = await t.abgleich()
    expect(e.fehler[0]?.text).toMatch(/gesperrt/)
    expect(t.r2.daten.size).toBe(0)
    expect(t.dateien.aufrufe).toEqual([])
  })
})
