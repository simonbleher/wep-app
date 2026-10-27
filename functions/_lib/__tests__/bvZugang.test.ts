// BV-Kontrollseite, Zugang (Ziel 4): ID-Token-Prüfung (echte RS256-Signatur mit Testschlüssel) und Anträge/Freigaben.
import { beforeAll, describe, expect, it } from 'vitest'
import { pruefeIdToken, TokenFehler, type Jwk } from '../idToken'
import { aendereNutzer, alleNutzer, istAdmin, zugang, type KvAblage } from '../freigaben'

const CLIENT = '11111111-2222-3333-4444-555555555555'
const TID = '0a1b2c3d-1111-2222-3333-444455556666'
const JETZT = 1_800_000_000

let paar: CryptoKeyPair
let jwk: Jwk
let fremd: CryptoKeyPair

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const teil = (o: object) => b64(new TextEncoder().encode(JSON.stringify(o)))

async function token(inhalt: Record<string, unknown>, opt: { kid?: string; alg?: string; schluessel?: CryptoKey } = {}): Promise<string> {
  const kopf = teil({ alg: opt.alg ?? 'RS256', kid: opt.kid ?? 'k1', typ: 'JWT' })
  const koerper = teil({ aud: CLIENT, iss: `https://login.microsoftonline.com/${TID}/v2.0`, tid: TID, oid: 'aaaa-bbbb', name: 'Erika Musterfrau', preferred_username: 'erika@bv.example', exp: JETZT + 3600, nbf: JETZT - 10, ...inhalt })
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opt.schluessel ?? paar.privateKey, new TextEncoder().encode(`${kopf}.${koerper}`)))
  return `${kopf}.${koerper}.${b64(sig)}`
}

beforeAll(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>
  paar = await gen()
  fremd = await gen()
  const e = (await crypto.subtle.exportKey('jwk', paar.publicKey)) as { n: string; e: string }
  jwk = { kid: 'k1', kty: 'RSA', n: e.n, e: e.e }
})

const pruefe = (t: string, extra: { clientId?: string; neuGeladen?: Jwk[] } = {}) =>
  pruefeIdToken(t, { clientId: extra.clientId ?? CLIENT, schluessel: async (neu) => (neu ? (extra.neuGeladen ?? [jwk]) : [jwk]), jetztS: JETZT })

describe('ID-Token prüfen', () => {
  it('gültiges Token: Konto-Angaben', async () => {
    expect(await pruefe(await token({}))).toEqual({ oid: 'aaaa-bbbb', tid: TID, name: 'Erika Musterfrau', email: 'erika@bv.example' })
    // persönliches Konto: Tenant der Microsoft-Konten
    const msa = '9188040d-6c67-4c5b-b112-36a304b66dad'
    expect((await pruefe(await token({ tid: msa, iss: `https://login.microsoftonline.com/${msa}/v2.0` }))).tid).toBe(msa)
  })

  it('lehnt ab: falsche Signatur, fremde App, falscher Aussteller, abgelaufen, noch nicht gültig, falscher Algorithmus, Unsinn', async () => {
    const faelle: [Promise<string> | string, RegExp][] = [
      [token({}, { schluessel: fremd.privateKey }), /Signatur/],
      [token({ aud: 'andere-app' }), /nicht für diese App/],
      [token({ iss: 'https://login.microsoftonline.com/anderer-tenant/v2.0' }), /Aussteller/],
      [token({ exp: JETZT - 3600 }), /abgelaufen/],
      [token({ nbf: JETZT + 3600 }), /noch nicht gültig/],
      [token({}, { alg: 'HS256' }), /Algorithmus/],
      [token({ oid: '../x' }), /Konto-Angaben/],
      ['kein.token', /lesbar|JWT/],
      ['abc', /JWT/],
    ]
    for (const [t, meldung] of faelle) {
      const p = pruefe(await t)
      await expect(p).rejects.toBeInstanceOf(TokenFehler)
      await expect(p).rejects.toThrow(meldung)
    }
    await expect(pruefe(await token({}), { clientId: '' })).rejects.toThrow(/nicht für diese App/)
  })

  it('unbekannte kid: Schlüssel neu laden (Microsoft wechselt Schlüssel), sonst ablehnen', async () => {
    const t = await token({}, { kid: 'k2' })
    await expect(pruefe(t)).rejects.toThrow(/Unbekannter Schlüssel/)
    expect((await pruefe(t, { neuGeladen: [{ ...jwk, kid: 'k2' }] })).oid).toBe('aaaa-bbbb')
  })
})

function kv(): KvAblage & { daten: Map<string, string> } {
  const daten = new Map<string, string>()
  return {
    daten,
    get: async (k) => daten.get(k) ?? null,
    put: async (k, v) => void daten.set(k, v),
    delete: async (k) => void daten.delete(k),
    list: async ({ prefix }) => ({ keys: [...daten.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  }
}

const erika = { oid: 'aaaa-bbbb', tid: TID, name: 'Erika Musterfrau', email: 'erika@bv.example' }
const simon = { oid: 'cccc-dddd', tid: TID, name: 'Admin', email: 'admin@example.org' }

describe('Anträge und Freigaben', () => {
  it('erste Anmeldung legt einen Antrag an; Admin gibt frei, sperrt, löscht; nur Konto-Angaben werden gespeichert', async () => {
    const ablage = kv()
    expect(await zugang(ablage, erika, 'admin@example.org', '2026-10-27T08:00:00.000Z')).toEqual({ status: 'beantragt', admin: false, name: 'Erika Musterfrau', email: 'erika@bv.example' })
    // zweites Mal: bleibt beantragt, kein zweiter Eintrag
    expect((await zugang(ablage, erika, 'admin@example.org')).status).toBe('beantragt')
    expect(ablage.daten.size).toBe(1)
    expect(Object.keys(JSON.parse([...ablage.daten.values()][0])).sort()).toEqual(['beantragtAm', 'email', 'geaendertAm', 'name', 'oid', 'status', 'tid'])

    expect(await aendereNutzer(ablage, { tid: TID, oid: erika.oid }, 'freigeben', simon, '2026-10-27T09:00:00.000Z')).toBe(true)
    expect((await zugang(ablage, erika, 'admin@example.org')).status).toBe('freigegeben')
    expect((await alleNutzer(ablage))[0]).toMatchObject({ status: 'freigegeben', geaendertVon: 'admin@example.org' })
    await aendereNutzer(ablage, { tid: TID, oid: erika.oid }, 'sperren', simon)
    expect((await zugang(ablage, erika, 'admin@example.org')).status).toBe('gesperrt')
    await aendereNutzer(ablage, { tid: TID, oid: erika.oid }, 'loeschen', simon)
    expect(await alleNutzer(ablage)).toEqual([])
    expect(await aendereNutzer(ablage, { tid: TID, oid: 'gibt-es-nicht' }, 'freigeben', simon)).toBe(false)
  })

  it('Admins (E-Mail oder Objekt-ID, Groß-/Kleinschreibung egal) sind immer freigegeben, ohne Eintrag', async () => {
    const ablage = kv()
    expect(await zugang(ablage, simon, ' Admin@Example.org , x')).toMatchObject({ status: 'freigegeben', admin: true })
    expect(ablage.daten.size).toBe(0)
    expect(istAdmin(simon, 'CCCC-DDDD')).toBe(true)
    expect(istAdmin(erika, 'admin@example.org')).toBe(false)
    expect(istAdmin({ oid: 'x', email: '' }, '')).toBe(false)
  })
})
