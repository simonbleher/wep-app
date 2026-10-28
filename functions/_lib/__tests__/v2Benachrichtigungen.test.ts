// v2 Paket 5: Benachrichtigungen – wer bei welchem Schritt Bescheid bekommt, Mails über Resend nur mit Vorgangs-Nr.,
// Anlage, Parzelle und Link (keine Pächternamen, keine Beträge), je Konto abschaltbar. Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { neuerWep } from '../../../src/model'
import { testDb } from './sqliteDb'
import type { Konto, Rolle } from '../v2/konten'
import { neueSitzung } from '../v2/sitzung'
import { benachrichtige, mailInhalt, meineBenachrichtigungen } from '../v2/benachrichtigungen'
import { fuehreAktionAus, speichereWep } from '../v2/weps'
import { onRequestPost as aktion } from '../../api/v2/weps/[id]/aktion'
import { onRequestGet as liste } from '../../api/v2/benachrichtigungen'
import { onRequestPost as gelesen } from '../../api/v2/benachrichtigungen/gelesen'

const ORIGIN = 'https://main.wep-pankow.pages.dev'

function konto(db: ReturnType<typeof testDb>, id: string, name: string, rollen: Rolle[], mail = 1): Konto {
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh
    .prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, mail_benachrichtigung, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, 'freigegeben', ?, ?, ?, ?)")
    .run(id, id, `${id}@example.org`, name, rollen.join(','), mail, zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name, status: 'freigegeben', rollen, mailBenachrichtigung: mail === 1, erstelltAm: zeit, geaendertAm: zeit }
}

async function aufbau() {
  const db = testDb()
  const bert = konto(db, 'bau-1', 'Bert Bauer', ['bau'])
  const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
  const bea = konto(db, 'bv-1', 'Bea BV', ['bv'])
  const ohneMail = konto(db, 'bv-2', 'Bodo BV', ['bv'], 0)
  const w = neuerWep('w1')
  w.formalien.vorgangsNr = '2026-0815'
  w.formalien.kleingartenanlage = 'KGA Musterwiese'
  w.formalien.parzelle = '12'
  w.formalien.unterpaechter = 'Paula Pächterin'
  await speichereWep(db, bert, 'w1', { wep: w, basisRev: 0 })
  const env = { SERVER_MODUS: 'true', WEP_DB: db, RESEND_API_KEY: 're_test', MAIL_ABSENDER: 'WEP-App <wep@mail.example.org>' }
  const mails: { to: string[]; subject: string; text: string; html: string; from: string }[] = []
  const laden = (async (_url: string, init?: RequestInit) => {
    mails.push(JSON.parse(String(init?.body)))
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  /** Schritt mit Benachrichtigung (wie der Endpunkt, aber mit nachgebautem Resend). */
  const schritt = (k: Konto, eingabe: Record<string, unknown>) =>
    fuehreAktionAus(db, k, 'w1', eingabe, Date.now(), (n) => benachrichtige(db, env, { ...n, ausloeser: k.id, origin: ORIGIN, laden }))
  return { db, env, bert, erika, bea, ohneMail, mails, schritt }
}

describe('Benachrichtigungen', () => {
  it('Empfänger je Schritt: an Grün → Grün; an den BV → alle BV; Rückfrage → wer gefragt ist; geprüft/wieder geöffnet → beide Wertermittler', async () => {
    const { db, bert, erika, bea, ohneMail, mails, schritt } = await aufbau()
    await schritt(bert, { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })
    expect((await meineBenachrichtigungen(db, erika.id)).map((b) => b.art)).toEqual(['an_dich'])
    expect(await meineBenachrichtigungen(db, bert.id)).toEqual([]) // nicht an sich selbst
    await schritt(erika, { aktion: 'an_bv', basisRev: 2 })
    expect((await meineBenachrichtigungen(db, bea.id)).map((b) => b.art)).toEqual(['beim_bv'])
    expect((await meineBenachrichtigungen(db, ohneMail.id)).map((b) => b.art)).toEqual(['beim_bv']) // in der App ja
    await schritt(bea, { aktion: 'rueckfrage', an: 'gruen', notiz: 'Hecke fehlt', basisRev: 3 })
    expect((await meineBenachrichtigungen(db, erika.id)).map((b) => b.art)).toEqual(['rueckfrage', 'an_dich'])
    expect((await meineBenachrichtigungen(db, bert.id)).map((b) => b.art)).toEqual([])
    await schritt(erika, { aktion: 'an_bv', basisRev: 4 })
    await schritt(bea, { aktion: 'geprueft', basisRev: 5 })
    expect((await meineBenachrichtigungen(db, bert.id)).map((b) => b.art)).toEqual(['geprueft'])
    expect((await meineBenachrichtigungen(db, erika.id))[0].art).toBe('geprueft')
    await schritt(bea, { aktion: 'wiederoeffnen', begruendung: 'Betrag', basisRev: 6 })
    expect((await meineBenachrichtigungen(db, bert.id))[0].art).toBe('wiederoeffnet')
    // Mails: nur an Konten mit eingeschalteter Benachrichtigung
    expect(mails.some((m) => m.to.includes('bv-2@example.org'))).toBe(false)
    expect(mails.filter((m) => m.to.includes('bv-1@example.org'))).toHaveLength(2) // zweimal an den BV abgegeben
    expect((db.roh.prepare("SELECT mail FROM benachrichtigungen WHERE konto_id = 'bv-2'").all() as { mail: string }[]).map((x) => x.mail)).toEqual(['aus', 'aus'])
  })

  it('Mail: Absender, Betreff, Vorgangs-Nr., Anlage, Parzelle, Link – keine Namen von Pächtern oder Wertermittlern, keine Beträge', async () => {
    const { bert, mails, schritt } = await aufbau()
    await schritt(bert, { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })
    expect(mails).toHaveLength(1)
    const m = mails[0]
    expect(m.from).toBe('WEP-App <wep@mail.example.org>')
    expect(m.to).toEqual(['gruen-1@example.org'])
    expect(m.subject).toBe('WEP 2026-0815 – Bau-WEP an dich abgegeben')
    expect(m.text).toContain('Vorgangs-Nr.: 2026-0815')
    expect(m.text).toContain('Anlage: KGA Musterwiese')
    expect(m.text).toContain('Parzelle: 12')
    expect(m.text).toContain(`${ORIGIN}/?wep=w1`)
    for (const teil of [m.text, m.html, m.subject]) {
      expect(teil).not.toMatch(/Paula|Pächterin|Bert|Erika|€|EUR/)
    }
    expect(mailInhalt('beim_bv', { vorgangsNr: '', anlage: '<b>X</b>', parzelle: '' }, 'https://x/?wep=1').html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })

  it('ohne Resend-Einrichtung: nur in der App; Mailfehler ändern nichts am Schritt', async () => {
    const { db, env, bert, erika } = await aufbau()
    const ohne = { ...env, RESEND_API_KEY: '' }
    await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 }, Date.now(), (n) => benachrichtige(db, ohne, { ...n, ausloeser: bert.id, origin: ORIGIN }))
    expect((db.roh.prepare("SELECT mail FROM benachrichtigungen WHERE konto_id = 'gruen-1'").get() as { mail: string }).mail).toBe('aus')
    const kaputt = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const e = await fuehreAktionAus(db, erika, 'w1', { aktion: 'an_bv', basisRev: 2 }, Date.now(), (n) => benachrichtige(db, env, { ...n, ausloeser: erika.id, origin: ORIGIN, laden: kaputt }))
    expect(e).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })
    expect(db.roh.prepare("SELECT mail, mail_fehler FROM benachrichtigungen WHERE konto_id = 'bv-1'").get()).toMatchObject({ mail: 'fehler', mail_fehler: expect.stringMatching(/Resend 500/) })
  })

  it('Endpunkte: Schritt legt Benachrichtigung an; Liste nur die eigenen; als gelesen markieren (einzeln, alle)', async () => {
    const { db, bert, erika } = await aufbau()
    const env = { SERVER_MODUS: 'true', WEP_DB: db } // ohne Mail
    const sb = (await neueSitzung(db, bert.id)).cookie.split(';')[0]
    const sg = (await neueSitzung(db, erika.id)).cookie.split(';')[0]
    const r = await aktion({
      request: new Request(`${ORIGIN}/api/v2/weps/w1/aktion`, { method: 'POST', body: JSON.stringify({ aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 }), headers: { cookie: sb, origin: ORIGIN } }),
      env,
      params: { id: 'w1' },
    })
    expect(r.status).toBe(200)
    const holen = async (s: string) => (await (await liste({ request: new Request(`${ORIGIN}/api/v2/benachrichtigungen`, { headers: { cookie: s } }), env, params: {} })).json()).benachrichtigungen
    expect(await holen(sb)).toEqual([])
    const eigene = await holen(sg)
    expect(eigene).toEqual([expect.objectContaining({ wepId: 'w1', art: 'an_dich', vorgangsNr: '2026-0815', anlage: 'KGA Musterwiese', parzelle: '12', gelesen: false })])
    const post = (body: unknown, s = sg, origin = ORIGIN) => gelesen({ request: new Request(`${ORIGIN}/api/v2/benachrichtigungen/gelesen`, { method: 'POST', body: JSON.stringify(body), headers: { cookie: s, origin } }), env, params: {} })
    expect((await post({ ids: [eigene[0].id] }, sb)).status).toBe(200) // fremdes Konto: ändert nichts
    expect((await holen(sg))[0].gelesen).toBe(false)
    expect((await post({ ids: [eigene[0].id] }, sg, 'https://evil.example')).status).toBe(403)
    await post({ ids: [eigene[0].id] })
    expect((await holen(sg))[0].gelesen).toBe(true)
    await post({})
    expect((await holen(sg)).every((b: { gelesen: boolean }) => b.gelesen)).toBe(true)
  })
})
