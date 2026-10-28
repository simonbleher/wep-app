// v2 Paket 2: WEPs auf dem Server – Anlegen mit Rolle Bau oder Grün, Speichern mit Revision (409 mit Serverstand), Lesen nur
// für Beteiligte (BV/Admin erst ab der Abgabe), Papierkorb nur für den Besitzer, Verlauf.
import { describe, expect, it } from 'vitest'
import { darfLesen, schreibrecht, type RechteKonto } from '../../../src/server/rechte'
import { testDb } from './sqliteDb'
import type { Db } from '../v2/db'
import type { Konto, Rolle } from '../v2/konten'
import { neueSitzung } from '../v2/sitzung'
import { ladeVerlauf, ladeWep, lesbareWeps, setzePapierkorb, speichereWep, MAX_WEP_BYTES } from '../v2/weps'
import { onRequestGet as liste } from '../../api/v2/weps'
import { onRequestDelete as loeschen, onRequestGet as holen, onRequestPut as speichern } from '../../api/v2/weps/[id]'
import { onRequestPost as wiederherstellen } from '../../api/v2/weps/[id]/wiederherstellen'
import { onRequestGet as verlaufHolen } from '../../api/v2/weps/[id]/verlauf'

const ORIGIN = 'https://main.wep-pankow.pages.dev'

async function konto(db: Db & { roh: { prepare: (s: string) => { run: (...a: unknown[]) => unknown } } }, id: string, name: string, rollen: Rolle[], status = 'freigegeben'): Promise<Konto> {
  const zeit = '2026-10-28T10:00:00.000Z'
  db.roh.prepare('INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'google', id, `${id}@example.org`, name, status, rollen.join(','), zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name, status: status as Konto['status'], rollen, mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
}

const wep = (id: string, extra: Record<string, unknown> = {}) => ({ id, formalien: { vorgangsNr: '2026-0815', kleingartenanlage: 'KGA Musterwiese', parzelle: '12' }, aussenanlagen: [], ...extra })

async function aufbau() {
  const db = testDb()
  return {
    db,
    bau: await konto(db, 'bau-1', 'Bert Bauer', ['bau']),
    bau2: await konto(db, 'bau-2', 'Berta Bau', ['bau']),
    gruen: await konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen']),
    bv: await konto(db, 'bv-1', 'Bea BV', ['bv']),
    admin: await konto(db, 'admin-1', 'Ada Admin', ['admin']),
  }
}

describe('Rechte (gemeinsam mit der App)', () => {
  const k = (id: string, rollen: RechteKonto['rollen']) => ({ id, rollen })
  it('lesen: Beteiligte immer; BV und Admin erst ab „beim_bv“; Gelöschtes nur Beteiligte', () => {
    const kopf = { zustand: 'bau_in_arbeit' as const, bauKonto: 'b', gruenKonto: 'g' }
    expect(darfLesen(kopf, k('b', ['bau']))).toBe(true)
    expect(darfLesen(kopf, k('g', ['gruen']))).toBe(true)
    expect(darfLesen(kopf, k('x', ['bv']))).toBe(false)
    expect(darfLesen(kopf, k('x', ['admin']))).toBe(false)
    for (const zustand of ['beim_bv', 'rueckfrage', 'geprueft'] as const) {
      expect(darfLesen({ ...kopf, zustand }, k('x', ['bv']))).toBe(true)
      expect(darfLesen({ ...kopf, zustand }, k('x', ['admin']))).toBe(true)
      expect(darfLesen({ ...kopf, zustand }, k('x', ['bau']))).toBe(false)
    }
    expect(darfLesen({ ...kopf, zustand: 'beim_bv', geloeschtAm: 'x' }, k('x', ['bv']))).toBe(false)
  })

  it('schreiben in „bau_in_arbeit“: nur der Besitzer mit Rolle Bau', () => {
    const kopf = { zustand: 'bau_in_arbeit' as const, bauKonto: 'b' }
    expect(schreibrecht(kopf, k('b', ['bau']))).toBe('alles')
    expect(schreibrecht(kopf, k('b', ['gruen']))).toBeNull() // Rolle inzwischen gewechselt
    expect(schreibrecht(kopf, k('x', ['bau', 'admin']))).toBeNull()
    expect(schreibrecht({ ...kopf, geloeschtAm: 'x' }, k('b', ['bau']))).toBeNull()
  })
})

describe('WEPs speichern und lesen', () => {
  it('Bau legt an (wird Besitzer, rev 1, Verlauf „angelegt“); Grün legt ein eigenes Grün-WEP an; BV kann nicht anlegen', async () => {
    const { db, bau, gruen, bv } = await aufbau()
    const e = await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 0 })
    expect(e).toMatchObject({ ok: true, wert: { id: 'w1', rev: 1, zustand: 'bau_in_arbeit', bauKonto: 'bau-1', vorgangsNr: '2026-0815', anlage: 'KGA Musterwiese', parzelle: '12' } })
    const g = await speichereWep(db, gruen, 'w2', { wep: wep('w2'), basisRev: 0 })
    expect(g).toMatchObject({ ok: true, wert: { zustand: 'gruen_in_arbeit', bauKonto: null, gruenKonto: 'gruen-1' } })
    expect((await lesbareWeps(db, bau)).map((x) => x.id)).toEqual(['w1']) // Bau sieht das Grün-WEP nicht
    expect(await speichereWep(db, bv, 'w3', { wep: wep('w3'), basisRev: 0 })).toMatchObject({ ok: false, status: 403 })
    expect(await speichereWep(db, bau, 'w4', { wep: wep('anders'), basisRev: 0 })).toMatchObject({ ok: false, status: 400 })
    const v = await ladeVerlauf(db, bau, 'w1')
    expect(v.ok && v.wert).toEqual([expect.objectContaining({ aktion: 'angelegt', wer: 'Bert Bauer', zustandNachher: 'bau_in_arbeit' })])
  })

  it('Speichern nur mit passender Revision; sonst 409 mit dem Stand des Servers', async () => {
    const { db, bau } = await aufbau()
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 0 })
    const zwei = await speichereWep(db, bau, 'w1', { wep: wep('w1', { notiz: 'Gerät A' }), basisRev: 1 })
    expect(zwei).toMatchObject({ ok: true, wert: { rev: 2 } })
    const alt = await speichereWep(db, bau, 'w1', { wep: wep('w1', { notiz: 'Gerät B' }), basisRev: 1 })
    expect(alt).toMatchObject({ ok: false, status: 409, stand: { kopf: { rev: 2 }, wep: { notiz: 'Gerät A' } } })
    expect(await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: '2' })).toMatchObject({ ok: false, status: 409 })
  })

  it('Fremde sehen das WEP nicht (404) und können nichts ändern; BV/Admin erst ab der Abgabe', async () => {
    const { db, bau, bau2, gruen, bv, admin } = await aufbau()
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 0 })
    for (const k of [bau2, gruen, bv, admin]) {
      expect(await ladeWep(db, k, 'w1')).toMatchObject({ ok: false, status: 404 })
      expect(await speichereWep(db, k, 'w1', { wep: wep('w1'), basisRev: 1 })).toMatchObject({ ok: false, status: 404 })
      expect(await lesbareWeps(db, k)).toEqual([])
    }
    // nach der Abgabe an den BV (Paket 3/4 setzen den Zustand; hier direkt)
    db.roh.prepare("UPDATE weps SET zustand = 'beim_bv' WHERE id = 'w1'").run()
    expect((await lesbareWeps(db, bv)).map((w) => w.id)).toEqual(['w1'])
    expect((await lesbareWeps(db, admin)).map((w) => w.id)).toEqual(['w1'])
    expect(await ladeWep(db, bv, 'w1')).toMatchObject({ ok: true })
    // lesen ja, schreiben nein – auch nicht der Besitzer
    expect(await speichereWep(db, bv, 'w1', { wep: wep('w1'), basisRev: 1 })).toMatchObject({ ok: false, status: 403 })
    expect(await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 1 })).toMatchObject({ ok: false, status: 403, stand: { kopf: { zustand: 'beim_bv' } } })
  })

  it('zu große WEPs werden abgelehnt (413)', async () => {
    const { db, bau } = await aufbau()
    expect(await speichereWep(db, bau, 'w1', { wep: wep('w1', { gross: 'x'.repeat(MAX_WEP_BYTES) }), basisRev: 0 })).toMatchObject({ ok: false, status: 413 })
  })

  it('„bearbeitet“ steht höchstens einmal je Person und Stunde im Verlauf', async () => {
    const { db, bau } = await aufbau()
    const t0 = Date.parse('2026-10-28T08:00:00Z')
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 0 }, t0)
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 1 }, t0 + 10 * 60_000)
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 2 }, t0 + 70 * 60_000)
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 3 }, t0 + 80 * 60_000)
    const v = await ladeVerlauf(db, bau, 'w1')
    expect(v.ok && v.wert.map((e) => e.aktion)).toEqual(['angelegt', 'bearbeitet'])
  })
})

describe('Papierkorb', () => {
  it('nur der Besitzer; mit Revision; gelöscht nicht mehr speicherbar; zurückholen; Verlauf', async () => {
    const { db, bau, bau2 } = await aufbau()
    await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 0 })
    expect(await setzePapierkorb(db, bau2, 'w1', true, 1)).toMatchObject({ ok: false, status: 404 })
    expect(await setzePapierkorb(db, bau, 'w1', true, 0)).toMatchObject({ ok: false, status: 409 })
    const weg = await setzePapierkorb(db, bau, 'w1', true, 1)
    expect(weg).toMatchObject({ ok: true, wert: { rev: 2, geloeschtAm: expect.any(String) } })
    expect(await speichereWep(db, bau, 'w1', { wep: wep('w1'), basisRev: 2 })).toMatchObject({ ok: false, status: 409, fehler: expect.stringMatching(/Papierkorb/) })
    expect((await lesbareWeps(db, bau))[0].geloeschtAm).toBeTruthy()
    const zurueck = await setzePapierkorb(db, bau, 'w1', false, undefined)
    expect(zurueck.ok && zurueck.wert.geloeschtAm).toBeUndefined()
    const v = await ladeVerlauf(db, bau, 'w1')
    expect(v.ok && v.wert.map((e) => e.aktion)).toEqual(['angelegt', 'geloescht', 'wiederhergestellt'])
  })
})

describe('Endpunkte', () => {
  it('Liste, Laden, Speichern (409 mit Stand), Löschen; schreibend nur mit passendem Origin; nur freigegebene Konten', async () => {
    const { db, bau } = await aufbau()
    const env = { SERVER_MODUS: 'true', WEP_DB: db }
    const { cookie } = await neueSitzung(db, bau.id)
    const sitzung = cookie.split(';')[0]
    const req = (pfad: string, init: RequestInit = {}, origin = ORIGIN) => new Request(`${ORIGIN}${pfad}`, { ...init, headers: { origin, cookie: sitzung } })

    const put = await speichern({ request: req('/api/v2/weps/w1', { method: 'PUT', body: JSON.stringify({ wep: wep('w1'), basisRev: 0 }) }), env, params: { id: 'w1' } })
    expect((await put.json()).kopf.rev).toBe(1)
    const konflikt = await speichern({ request: req('/api/v2/weps/w1', { method: 'PUT', body: JSON.stringify({ wep: wep('w1'), basisRev: 0 }) }), env, params: { id: 'w1' } })
    expect(konflikt.status).toBe(409)
    expect((await konflikt.json()).stand.kopf.rev).toBe(1)
    expect((await speichern({ request: req('/api/v2/weps/w1', { method: 'PUT', body: '{}' }, 'https://evil.example'), env, params: { id: 'w1' } })).status).toBe(403)
    expect((await (await liste({ request: req('/api/v2/weps'), env, params: {} })).json()).weps.map((w: { id: string }) => w.id)).toEqual(['w1'])
    const geholt = await (await holen({ request: req('/api/v2/weps/w1'), env, params: { id: 'w1' } })).json()
    expect(geholt).toMatchObject({ kopf: { rev: 1 }, wep: { id: 'w1' } })
    expect((await holen({ request: req('/api/v2/weps/fremd'), env, params: { id: 'fremd' } })).status).toBe(404)
    const del = await loeschen({ request: req('/api/v2/weps/w1', { method: 'DELETE', body: JSON.stringify({ basisRev: 1 }) }), env, params: { id: 'w1' } })
    expect((await del.json()).kopf.geloeschtAm).toBeTruthy()
    const zurueck = await wiederherstellen({ request: req('/api/v2/weps/w1/wiederherstellen', { method: 'POST' }), env, params: { id: 'w1' } })
    expect((await zurueck.json()).kopf.geloeschtAm).toBeUndefined()
    const v = await (await verlaufHolen({ request: req('/api/v2/weps/w1/verlauf'), env, params: { id: 'w1' } })).json()
    expect(v.verlauf.map((e: { aktion: string }) => e.aktion)).toEqual(['angelegt', 'geloescht', 'wiederhergestellt'])

    // wartendes Konto: kein Zugriff
    db.roh.prepare("UPDATE konten SET status = 'wartet' WHERE id = 'bau-1'").run()
    expect((await liste({ request: req('/api/v2/weps'), env, params: {} })).status).toBe(403)
  })
})
