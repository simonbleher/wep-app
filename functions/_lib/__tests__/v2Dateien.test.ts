// v2 Paket 2b: Fotos und Bau-Excel in R2 – nur erlaubte Namen, Rechte wie beim WEP, Größe und Art geprüft.
import { describe, expect, it } from 'vitest'
import { testDb } from './sqliteDb'
import { fakeR2 } from './fakeR2'
import { dateiArt } from '../v2/dateien'
import { neueSitzung } from '../v2/sitzung'
import { speichereWep } from '../v2/weps'
import type { Konto, Rolle } from '../v2/konten'
import { onRequestGet as liste } from '../../api/v2/weps/[id]/dateien'
import { onRequestDelete as loeschen, onRequestGet as holen, onRequestPut as hochladen } from '../../api/v2/weps/[id]/dateien/[datei]'

const ORIGIN = 'https://main.wep-pankow.pages.dev'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const XLSX = new Uint8Array([0x50, 0x4b, 3, 4, 9, 9])

function konto(db: ReturnType<typeof testDb>, id: string, rollen: Rolle[]): Konto {
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh.prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, 'freigegeben', ?, ?, ?)").run(id, id, `${id}@example.org`, id, rollen.join(','), zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name: id, status: 'freigegeben', rollen, mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
}

async function aufbau() {
  const db = testDb()
  const r2 = fakeR2()
  const env = { SERVER_MODUS: 'true', WEP_DB: db, WEP_DATEIEN: r2 }
  const bau = konto(db, 'bau-1', ['bau'])
  const fremd = konto(db, 'bau-2', ['bau'])
  await speichereWep(db, bau, 'w1', { wep: { id: 'w1', formalien: {} }, basisRev: 0 })
  const sitzung = async (k: Konto) => (await neueSitzung(db, k.id)).cookie.split(';')[0]
  return { db, r2, env, bau, fremd, sitzung }
}

const req = (pfad: string, sitzung: string, init: RequestInit = {}) => new Request(`${ORIGIN}${pfad}`, { ...init, headers: { origin: ORIGIN, cookie: sitzung, ...(init.headers ?? {}) } })

describe('Dateien in R2', () => {
  it('nur foto-<Id>.jpg und bau.xlsx; keine Pfade', () => {
    expect(dateiArt('w1', 'foto-abc_1.jpg')?.key).toBe('weps/w1/fotos/abc_1.jpg')
    expect(dateiArt('w1', 'bau.xlsx')?.key).toBe('weps/w1/bau.xlsx')
    for (const boese of ['../x.jpg', 'foto-../x.jpg', 'foto-a.png', 'bau.xls', 'foto-a/b.jpg']) expect(dateiArt('w1', boese)).toBeUndefined()
    expect(dateiArt('../w1', 'bau.xlsx')).toBeUndefined()
  })

  it('Besitzer lädt hoch, holt, listet und löscht; Fremde bekommen 404; Art und Größe werden geprüft', async () => {
    const { r2, env, bau, fremd, sitzung } = await aufbau()
    const s = await sitzung(bau)
    const p = (datei: string) => ({ id: 'w1', datei })
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f1.jpg', s, { method: 'PUT', body: JPEG }), env, params: p('foto-f1.jpg') })).status).toBe(200)
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/bau.xlsx', s, { method: 'PUT', body: XLSX }), env, params: p('bau.xlsx') })).status).toBe(200)
    expect(r2.daten.get('weps/w1/fotos/f1.jpg')?.typ).toBe('image/jpeg')
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f2.jpg', s, { method: 'PUT', body: XLSX }), env, params: p('foto-f2.jpg') })).status).toBe(415)
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f2.jpg', s, { method: 'PUT', body: new Uint8Array() }), env, params: p('foto-f2.jpg') })).status).toBe(400)
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f2.jpg', s, { method: 'PUT', body: JPEG, headers: { 'content-length': String(16 * 1024 * 1024) } }), env, params: p('foto-f2.jpg') })).status).toBe(413)

    const geholt = await holen({ request: req('/api/v2/weps/w1/dateien/foto-f1.jpg', s), env, params: p('foto-f1.jpg') })
    expect(new Uint8Array(await geholt.arrayBuffer())).toEqual(JPEG)
    expect(geholt.headers.get('cache-control')).toBe('private, no-store')
    const namen = (await (await liste({ request: req('/api/v2/weps/w1/dateien', s), env, params: { id: 'w1' } })).json()).dateien.map((d: { name: string }) => d.name).sort()
    expect(namen).toEqual(['bau.xlsx', 'foto-f1.jpg'])

    const sf = await sitzung(fremd)
    expect((await holen({ request: req('/api/v2/weps/w1/dateien/foto-f1.jpg', sf), env, params: p('foto-f1.jpg') })).status).toBe(404)
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f9.jpg', sf, { method: 'PUT', body: JPEG }), env, params: p('foto-f9.jpg') })).status).toBe(404)
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f9.jpg', s, { method: 'PUT', body: JPEG, headers: { origin: 'https://evil.example' } }), env, params: p('foto-f9.jpg') })).status).toBe(403)

    expect((await loeschen({ request: req('/api/v2/weps/w1/dateien/foto-f1.jpg', s, { method: 'DELETE' }), env, params: p('foto-f1.jpg') })).status).toBe(200)
    expect(r2.daten.has('weps/w1/fotos/f1.jpg')).toBe(false)
    expect((await holen({ request: req('/api/v2/weps/w1/dateien/foto-f1.jpg', s), env, params: p('foto-f1.jpg') })).status).toBe(404)
  })

  it('gesperrtes WEP: lesen ja, hochladen nein; ohne R2-Bindung 503', async () => {
    const { db, env, bau, sitzung } = await aufbau()
    const s = await sitzung(bau)
    db.roh.prepare("UPDATE weps SET zustand = 'beim_bv' WHERE id = 'w1'").run()
    expect((await hochladen({ request: req('/api/v2/weps/w1/dateien/foto-f1.jpg', s, { method: 'PUT', body: JPEG }), env, params: { id: 'w1', datei: 'foto-f1.jpg' } })).status).toBe(403)
    expect((await liste({ request: req('/api/v2/weps/w1/dateien', s), env, params: { id: 'w1' } })).status).toBe(200)
    expect((await liste({ request: req('/api/v2/weps/w1/dateien', s), env: { ...env, WEP_DATEIEN: undefined }, params: { id: 'w1' } })).status).toBe(503)
  })
})
