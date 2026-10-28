// v2 Paket 3: Ablauf Bau → Grün → BV – Zustandsautomat (vollständige Tabelle), jeder nur in seinem Teil, Abgabe nur auf
// dem aktuellen Stand, Verlauf mit Zustand und Notiz. Erfundene Konten und WEPs.
import { describe, expect, it } from 'vitest'
import { darfLoeschen, moeglicheAktionen, schreibrecht, wendeAn, type AblaufAktionName, type KontoRolle, type WepKopf, type Zustand } from '../../../src/server/rechte'
import { mitEigenemTeil } from '../../../src/server/teile'
import type { Wep } from '../../../src/model/types'
import { neuerWep } from '../../../src/model'
import { testDb } from './sqliteDb'
import type { Konto, Rolle } from '../v2/konten'
import { neueSitzung } from '../v2/sitzung'
import { fuehreAktionAus, ladeVerlauf, ladeWep, lesbareWeps, speichereWep } from '../v2/weps'
import { onRequestPost as aktionEndpunkt } from '../../api/v2/weps/[id]/aktion'
import { onRequestGet as gruenListe } from '../../api/v2/konten/gruen'

const k = (id: string, ...rollen: KontoRolle[]) => ({ id, rollen })
const BAU = k('b', 'bau')
const GRUEN = k('g', 'gruen')
const BV = k('v', 'bv')
const ADMIN = k('a', 'admin')
const FREMD = k('x', 'bau')

describe('Zustandsautomat', () => {
  const kopf = (zustand: Zustand, extra: Partial<WepKopf> = {}): WepKopf => ({ zustand, bauKonto: 'b', gruenKonto: zustand === 'bau_in_arbeit' ? null : 'g', ...extra })

  it('wer in welchem Zustand was darf (vollständige Tabelle)', () => {
    const faelle: [WepKopf, Record<string, AblaufAktionName[]>, Record<string, ReturnType<typeof schreibrecht>>][] = [
      [kopf('bau_in_arbeit'), { b: ['an_gruen'], g: [], v: [], a: [], x: [] }, { b: 'alles', g: null, v: null, a: null, x: null }],
      [kopf('gruen_in_arbeit'), { b: [], g: ['an_bv'], v: [], a: [], x: [] }, { b: null, g: 'gruen', v: null, a: null, x: null }],
      [kopf('beim_bv'), { b: [], g: [], v: ['rueckfrage', 'geprueft'], a: [], x: [] }, { b: null, g: null, v: null, a: null, x: null }],
      [kopf('rueckfrage', { rueckfrageAn: 'bau', rueckfrageBei: 'bau' }), { b: ['an_bv'], g: [], v: [], a: [], x: [] }, { b: 'bau', g: null, v: null, a: null, x: null }],
      [kopf('rueckfrage', { rueckfrageAn: 'gruen', rueckfrageBei: 'gruen' }), { b: [], g: ['an_bv'], v: [], a: [], x: [] }, { b: null, g: 'gruen', v: null, a: null, x: null }],
      [kopf('rueckfrage', { rueckfrageAn: 'beide', rueckfrageBei: 'bau' }), { b: ['an_gruen'], g: [], v: [], a: [], x: [] }, { b: 'bau', g: null, v: null, a: null, x: null }],
      [kopf('rueckfrage', { rueckfrageAn: 'beide', rueckfrageBei: 'gruen' }), { b: [], g: ['an_bv'], v: [], a: [], x: [] }, { b: null, g: 'gruen', v: null, a: null, x: null }],
      [kopf('geprueft'), { b: [], g: [], v: ['wiederoeffnen'], a: ['wiederoeffnen'], x: [] }, { b: null, g: null, v: null, a: null, x: null }],
    ]
    const konten = { b: BAU, g: GRUEN, v: BV, a: ADMIN, x: FREMD }
    for (const [kf, aktionen, rechte] of faelle) {
      for (const [id, konto] of Object.entries(konten)) {
        expect([kf.zustand, kf.rueckfrageAn, id, moeglicheAktionen(kf, konto)]).toEqual([kf.zustand, kf.rueckfrageAn, id, aktionen[id]])
        expect([kf.zustand, kf.rueckfrageAn, id, schreibrecht(kf, konto)]).toEqual([kf.zustand, kf.rueckfrageAn, id, rechte[id]])
      }
    }
    // Rückfrage „beide“: nachdem Grün beteiligt ist, darf Bau den Grün-Teil nicht mehr ändern
    expect(schreibrecht(kopf('bau_in_arbeit', { gruenKonto: 'g' }), BAU)).toBe('bau')
    // gelöscht: nichts
    expect(moeglicheAktionen(kopf('bau_in_arbeit', { geloeschtAm: 'x' }), BAU)).toEqual([])
    // Rolle gewechselt: der frühere Bau-Wertermittler ist jetzt Grün → darf nicht mehr als Bau handeln
    expect(schreibrecht(kopf('bau_in_arbeit'), k('b', 'gruen'))).toBeNull()
    expect(darfLoeschen(kopf('bau_in_arbeit'), BAU)).toBe(true)
    expect(darfLoeschen(kopf('bau_in_arbeit', { gruenKonto: 'g' }), BAU)).toBe(false)
  })

  it('Schritte: Grün wählen (zwei Personen), Rückfrage mit Notiz und Ziel, wieder öffnen mit Begründung', () => {
    expect(wendeAn(kopf('bau_in_arbeit'), BAU, { aktion: 'an_gruen', gruenKonto: 'g' }, ['g'])).toMatchObject({ ok: true, kopf: { zustand: 'gruen_in_arbeit', gruenKonto: 'g' } })
    expect(wendeAn(kopf('bau_in_arbeit'), BAU, { aktion: 'an_gruen' }, ['g'])).toMatchObject({ ok: false, status: 400 })
    expect(wendeAn(kopf('bau_in_arbeit'), BAU, { aktion: 'an_gruen', gruenKonto: 'b' }, ['b'])).toMatchObject({ ok: false, fehler: expect.stringMatching(/zwei verschiedene/) })
    expect(wendeAn(kopf('bau_in_arbeit'), BAU, { aktion: 'an_gruen', gruenKonto: 'z' }, ['g'])).toMatchObject({ ok: false, fehler: expect.stringMatching(/kein freigegebener/) })
    expect(wendeAn(kopf('gruen_in_arbeit'), GRUEN, { aktion: 'an_bv' })).toMatchObject({ ok: true, kopf: { zustand: 'beim_bv' } })
    expect(wendeAn(kopf('gruen_in_arbeit'), BAU, { aktion: 'an_bv' })).toMatchObject({ ok: false, status: 403 })
    expect(wendeAn(kopf('beim_bv'), BV, { aktion: 'rueckfrage', an: 'gruen', notiz: ' ' })).toMatchObject({ ok: false, status: 400 })
    expect(wendeAn(kopf('beim_bv'), BV, { aktion: 'rueckfrage', an: 'beide', notiz: 'Hecke fehlt' })).toMatchObject({ ok: true, kopf: { zustand: 'rueckfrage', rueckfrageAn: 'beide', rueckfrageBei: 'bau' }, notiz: 'Hecke fehlt' })
    expect(wendeAn(kopf('beim_bv'), BV, { aktion: 'rueckfrage', an: 'gruen', notiz: 'x' })).toMatchObject({ ok: true, kopf: { rueckfrageBei: 'gruen' } })
    // „beide“: Bau gibt an Grün weiter (Rückfrage bleibt offen), Grün dann an den BV
    const beide = kopf('rueckfrage', { rueckfrageAn: 'beide', rueckfrageBei: 'bau' })
    const weiter = wendeAn(beide, BAU, { aktion: 'an_gruen' })
    expect(weiter).toMatchObject({ ok: true, kopf: { zustand: 'rueckfrage', rueckfrageBei: 'gruen' } })
    if (weiter.ok) expect(wendeAn(weiter.kopf, GRUEN, { aktion: 'an_bv' })).toMatchObject({ ok: true, kopf: { zustand: 'beim_bv', rueckfrageAn: null } })
    expect(wendeAn(kopf('geprueft'), ADMIN, { aktion: 'wiederoeffnen', begruendung: '' })).toMatchObject({ ok: false, status: 400 })
    expect(wendeAn(kopf('geprueft'), ADMIN, { aktion: 'wiederoeffnen', begruendung: 'Tippfehler im Betrag' })).toMatchObject({ ok: true, kopf: { zustand: 'beim_bv' } })
  })
})

describe('Jeder nur in seinem Teil', () => {
  function testWep(): Wep {
    const w = neuerWep('w1')
    w.formalien.kleingartenanlage = 'KGA Musterwiese'
    w.gruen.aufwuchs = [{ id: 'p-gruen' } as Wep['gruen']['aufwuchs'][number]]
    w.bau = { bauteile: [] } as unknown as Wep['bau']
    w.fotos = [
      { id: 'f-allg', aufgenommenAm: '', breite: 1, hoehe: 1, groesse: 1 },
      { id: 'f-gruen', positionId: 'p-gruen', aufgenommenAm: '', breite: 1, hoehe: 1, groesse: 1 },
    ]
    w.unterschriften = { bau: 'data:image/png;base64,QkFV' }
    return w
  }

  it('Grün: nur Grün-Teil, Fotos an Grün-Positionen und neue Fotos; Formalien, Bau-Teil und Bau-Fotos bleiben', () => {
    const server = testWep()
    const app: Wep = {
      ...structuredClone(server),
      formalien: { ...server.formalien, kleingartenanlage: 'KGA Geändert von Grün' },
      gruen: { ...server.gruen, beschreibungAufwuchs: 'Obstbäume, gepflegt' },
      bau: { bauteile: [{ id: 'eingeschmuggelt' }] } as unknown as Wep['bau'],
      fotos: [
        { id: 'f-gruen', positionId: 'p-gruen', text: 'Apfelbaum', aufgenommenAm: '', breite: 1, hoehe: 1, groesse: 1 },
        { id: 'f-neu', aufgenommenAm: '', breite: 1, hoehe: 1, groesse: 1 },
      ], // f-allg (Bau) „gelöscht“
      unterschriften: { bau: 'data:image/png;base64,RkFMU0NI', gruen: 'data:image/png;base64,R1JVRU4=' },
      ablauf: { zustand: 'geprueft' },
    }
    const neu = mitEigenemTeil(server, app, 'gruen')
    expect(neu.formalien.kleingartenanlage).toBe('KGA Musterwiese')
    expect(neu.bau).toEqual(server.bau)
    expect(neu.gruen.beschreibungAufwuchs).toBe('Obstbäume, gepflegt')
    expect(neu.fotos?.map((f) => f.id)).toEqual(['f-allg', 'f-gruen', 'f-neu'])
    expect(neu.fotos?.find((f) => f.id === 'f-gruen')?.text).toBe('Apfelbaum')
    expect(neu.unterschriften).toEqual({ bau: 'data:image/png;base64,QkFV', gruen: 'data:image/png;base64,R1JVRU4=' })
    expect(neu.ablauf).toBeUndefined()
  })

  it('Bau (Grün beteiligt): alles außer dem Grün-Teil', () => {
    const server = testWep()
    server.gruen.beschreibungAufwuchs = 'von Grün'
    const app: Wep = { ...structuredClone(server), formalien: { ...server.formalien, parzelle: '12' }, gruen: { ...server.gruen, beschreibungAufwuchs: 'von Bau überschrieben' }, fotos: [] }
    const neu = mitEigenemTeil(server, app, 'bau')
    expect(neu.formalien.parzelle).toBe('12')
    expect(neu.gruen.beschreibungAufwuchs).toBe('von Grün')
    expect(neu.fotos?.map((f) => f.id)).toEqual(['f-gruen']) // Bau darf sein Foto löschen, das Grün-Foto bleibt
  })
})

function konto(db: ReturnType<typeof testDb>, id: string, name: string, rollen: Rolle[], status = 'freigegeben'): Konto {
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh.prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, ?, ?, ?, ?)").run(id, id, `${id}@example.org`, name, status, rollen.join(','), zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name, status: status as Konto['status'], rollen, mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
}

describe('Ablauf auf dem Server', () => {
  async function aufbau() {
    const db = testDb()
    const bert = konto(db, 'bau-1', 'Bert Bauer', ['bau'])
    const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
    konto(db, 'gruen-2', 'Gesperrte Grün', ['gruen'], 'gesperrt')
    const bea = konto(db, 'bv-1', 'Bea BV', ['bv'])
    const w = neuerWep('w1')
    w.formalien.kleingartenanlage = 'KGA Musterwiese'
    w.formalien.wertermittlerBaulichkeiten = ''
    await speichereWep(db, bert, 'w1', { wep: w, basisRev: 0 })
    return { db, bert, erika, bea }
  }

  it('ganzer Weg Bau → Grün → BV → Rückfrage (beide) → BV → geprüft → wieder geöffnet; Verlauf mit Zustand und Notiz', async () => {
    const { db, bert, erika, bea } = await aufbau()
    // BV sieht den Entwurf nicht
    expect(await lesbareWeps(db, bea)).toEqual([])
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', gruenKonto: 'gruen-2', basisRev: 1 })).toMatchObject({ ok: false, status: 400 }) // gesperrtes Konto
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 0 })).toMatchObject({ ok: false, status: 409 }) // nicht aktuell
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })).toMatchObject({ ok: true, wert: { zustand: 'gruen_in_arbeit', gruenKonto: 'gruen-1', rev: 2 } })
    const nachAbgabe = await ladeWep(db, erika, 'w1')
    expect(nachAbgabe.ok && nachAbgabe.wert.wep).toMatchObject({
      rolle: 'beides',
      formalien: { wertermittlerBaulichkeiten: 'Bert Bauer', wertermittlerAussenAufwuchs: 'Erika Musterfrau' },
      ablauf: { zustand: 'gruen_in_arbeit', bau: { name: 'Bert Bauer' }, gruen: { name: 'Erika Musterfrau' } },
    })
    // Bau ist jetzt gesperrt; Grün speichert nur den Grün-Teil (Server meldet „zusammengeführt“)
    expect(await speichereWep(db, bert, 'w1', { wep: neuerWep('w1'), basisRev: 2 })).toMatchObject({ ok: false, status: 403 })
    const g = (nachAbgabe.ok && nachAbgabe.wert.wep) as Wep
    const gespeichert = await speichereWep(db, erika, 'w1', { wep: { ...g, gruen: { ...g.gruen, beschreibungAussen: 'Zaun neu' }, formalien: { ...g.formalien, parzelle: 'von Grün' } }, basisRev: 2 })
    expect(gespeichert).toMatchObject({ ok: true, wert: { rev: 3, zusammengefuehrt: true } })
    const s3 = await ladeWep(db, erika, 'w1')
    expect(s3.ok && (s3.wert.wep as Wep).gruen.beschreibungAussen).toBe('Zaun neu')
    expect(s3.ok && (s3.wert.wep as Wep).formalien.parzelle).toBe('')

    expect(await fuehreAktionAus(db, erika, 'w1', { aktion: 'an_bv', basisRev: 3 })).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })
    expect((await lesbareWeps(db, bea)).map((w) => w.id)).toEqual(['w1'])
    expect(await speichereWep(db, erika, 'w1', { wep: g, basisRev: 4 })).toMatchObject({ ok: false, status: 403 })

    expect(await fuehreAktionAus(db, bea, 'w1', { aktion: 'rueckfrage', an: 'beide', notiz: 'Laube: Baujahr prüfen; Hecke fehlt', basisRev: 4 })).toMatchObject({ ok: true, wert: { zustand: 'rueckfrage' } })
    const r = await ladeWep(db, bert, 'w1')
    expect(r.ok && r.wert.wep.ablauf).toMatchObject({ zustand: 'rueckfrage', rueckfrage: { an: 'beide', bei: 'bau', notiz: 'Laube: Baujahr prüfen; Hecke fehlt', von: 'Bea BV' } })
    // Bau zuerst, Grün wartet
    expect(await speichereWep(db, erika, 'w1', { wep: g, basisRev: 5 })).toMatchObject({ ok: false, status: 403 })
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', basisRev: 5 })).toMatchObject({ ok: true, wert: { zustand: 'rueckfrage' } })
    const r2 = await ladeWep(db, erika, 'w1')
    expect(r2.ok && r2.wert.wep.ablauf?.rueckfrage).toMatchObject({ bei: 'gruen', notiz: 'Laube: Baujahr prüfen; Hecke fehlt' })
    expect(await fuehreAktionAus(db, erika, 'w1', { aktion: 'an_bv', basisRev: 6 })).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })
    const r3 = await ladeWep(db, bea, 'w1')
    expect(r3.ok && r3.wert.wep.ablauf?.rueckfrage).toBeUndefined()

    expect(await fuehreAktionAus(db, bea, 'w1', { aktion: 'geprueft', basisRev: 7 })).toMatchObject({ ok: true, wert: { zustand: 'geprueft' } })
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'wiederoeffnen', begruendung: 'x', basisRev: 8 })).toMatchObject({ ok: false, status: 403 })
    expect(await fuehreAktionAus(db, bea, 'w1', { aktion: 'wiederoeffnen', begruendung: 'Betrag Laube korrigieren', basisRev: 8 })).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })

    const v = await ladeVerlauf(db, bea, 'w1')
    expect(v.ok && v.wert.map((e) => [e.aktion, e.wer, e.zustandVorher ?? null, e.zustandNachher ?? null, e.notiz ?? null])).toEqual([
      ['angelegt', 'Bert Bauer', null, 'bau_in_arbeit', null],
      ['an_gruen', 'Bert Bauer', 'bau_in_arbeit', 'gruen_in_arbeit', null],
      ['bearbeitet', 'Erika Musterfrau', null, null, null],
      ['an_bv', 'Erika Musterfrau', 'gruen_in_arbeit', 'beim_bv', null],
      ['rueckfrage', 'Bea BV', 'beim_bv', 'rueckfrage', 'Laube: Baujahr prüfen; Hecke fehlt'],
      ['an_gruen', 'Bert Bauer', 'rueckfrage', 'rueckfrage', null],
      ['an_bv', 'Erika Musterfrau', 'rueckfrage', 'beim_bv', null],
      ['geprueft', 'Bea BV', 'beim_bv', 'geprueft', null],
      ['wiederoeffnen', 'Bea BV', 'geprueft', 'beim_bv', 'Betrag Laube korrigieren'],
    ])
  })

  it('Rückfrage nur an Bau: Bau gibt direkt an den BV zurück', async () => {
    const { db, bert, erika, bea } = await aufbau()
    await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })
    await fuehreAktionAus(db, erika, 'w1', { aktion: 'an_bv', basisRev: 2 })
    await fuehreAktionAus(db, bea, 'w1', { aktion: 'rueckfrage', an: 'bau', notiz: 'Baujahr?', basisRev: 3 })
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', basisRev: 4 })).toMatchObject({ ok: false, status: 403 })
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_bv', basisRev: 4 })).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })
  })

  it('Endpunkte: Schritt mit Origin-Prüfung; Liste der Grün-Wertermittler nur für Bau, ohne gesperrte', async () => {
    const { db, bert, erika } = await aufbau()
    const env = { SERVER_MODUS: 'true', WEP_DB: db }
    const s = (await neueSitzung(db, bert.id)).cookie.split(';')[0]
    const sg = (await neueSitzung(db, erika.id)).cookie.split(';')[0]
    const liste = await gruenListe({ request: new Request('https://x.example/api/v2/konten/gruen', { headers: { cookie: s } }), env, params: {} })
    expect((await liste.json()).konten).toEqual([{ id: 'gruen-1', name: 'Erika Musterfrau', email: 'gruen-1@example.org' }])
    expect((await gruenListe({ request: new Request('https://x.example/api/v2/konten/gruen', { headers: { cookie: sg } }), env, params: {} })).status).toBe(403)
    const req = (origin: string) => new Request('https://x.example/api/v2/weps/w1/aktion', { method: 'POST', body: JSON.stringify({ aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 }), headers: { cookie: s, origin } })
    expect((await aktionEndpunkt({ request: req('https://evil.example'), env, params: { id: 'w1' } })).status).toBe(403)
    const ok = await aktionEndpunkt({ request: req('https://x.example'), env, params: { id: 'w1' } })
    expect((await ok.json()).kopf.zustand).toBe('gruen_in_arbeit')
  })
})
