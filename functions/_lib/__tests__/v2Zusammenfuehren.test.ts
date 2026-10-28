// v2: Grün legt eigene WEPs an und führt sie mit einem an ihn abgegebenen Bau-WEP zusammen – Rechte (eigenes Grün-WEP,
// nur eigene WEPs zusammenführen), beide Wege (mit/ohne eigenes Grün-WEP), Rückgängig, Grün-WEP ohne Bau an den BV.
// Alle Namen und Daten sind erfunden.
import { describe, expect, it } from 'vitest'
import { darfLesen, darfLoeschen, moeglicheAktionen, neuerKopf, pruefeZusammenfuehren, schreibrecht, wendeAn, type KontoRolle, type WepKopf } from '../../../src/server/rechte'
import { mitEigenemTeil } from '../../../src/server/teile'
import type { Wep } from '../../../src/model/types'
import { neuerWep } from '../../../src/model'
import { testDb } from './sqliteDb'
import { fakeR2 } from './fakeR2'
import type { Konto, Rolle } from '../v2/konten'
import { neueSitzung } from '../v2/sitzung'
import { fuehreAktionAus, fuehreZusammen, ladeVerlauf, ladeWep, lesbareWeps, nimmZusammenfuehrungZurueck, setzePapierkorb, speichereWep } from '../v2/weps'
import { onRequestPost as zusammenfuehrenEndpunkt } from '../../api/v2/weps/[id]/zusammenfuehren'
import { onRequestPost as zuruecknehmenEndpunkt } from '../../api/v2/weps/[id]/zusammenfuehren-zuruecknehmen'

const ORIGIN = 'https://wep-pankow.pages.dev'
const k = (id: string, ...rollen: KontoRolle[]) => ({ id, rollen })

describe('Rechte: eigenes Grün-WEP und Zusammenführen', () => {
  const gruenWep = (extra: Partial<WepKopf> = {}): WepKopf => ({ zustand: 'gruen_in_arbeit', bauKonto: null, gruenKonto: 'g', ...extra })
  const bauWep = (extra: Partial<WepKopf> = {}): WepKopf => ({ zustand: 'gruen_in_arbeit', bauKonto: 'b', gruenKonto: 'g', ...extra })

  it('Anlegen: Bau → Bau-WEP, Grün → eigenes Grün-WEP, sonst niemand', () => {
    expect(neuerKopf(k('b', 'bau'))).toEqual({ zustand: 'bau_in_arbeit', bauKonto: 'b', gruenKonto: null })
    expect(neuerKopf(k('g', 'gruen'))).toEqual({ zustand: 'gruen_in_arbeit', bauKonto: null, gruenKonto: 'g' })
    expect(neuerKopf(k('v', 'bv'))).toBeNull()
    expect(neuerKopf(k('a', 'admin'))).toBeNull()
  })

  it('eigenes Grün-WEP: Grün darf alles außer dem Bau-Teil, löschen, an den BV abgeben; Bau sieht es nicht', () => {
    expect(schreibrecht(gruenWep(), k('g', 'gruen'))).toBe('ohne_bau')
    expect(schreibrecht(gruenWep(), k('b', 'bau'))).toBeNull()
    expect(darfLesen(gruenWep(), k('b', 'bau'))).toBe(false)
    expect(darfLesen(gruenWep(), k('v', 'bv'))).toBe(false)
    expect(darfLesen(gruenWep({ zustand: 'beim_bv' }), k('v', 'bv'))).toBe(true)
    expect(moeglicheAktionen(gruenWep(), k('g', 'gruen'))).toEqual(['an_bv'])
    expect(darfLoeschen(gruenWep(), k('g', 'gruen'))).toBe(true)
    expect(darfLoeschen(bauWep(), k('g', 'gruen'))).toBe(false)
    // Rückfrage geht nur an Grün (es gibt keinen Bau-Teil); danach wieder 'ohne_bau'
    expect(wendeAn(gruenWep({ zustand: 'beim_bv' }), k('v', 'bv'), { aktion: 'rueckfrage', an: 'beide', notiz: 'x' })).toMatchObject({ ok: false, status: 400 })
    const r = wendeAn(gruenWep({ zustand: 'beim_bv' }), k('v', 'bv'), { aktion: 'rueckfrage', an: 'gruen', notiz: 'Hecke fehlt' })
    expect(r).toMatchObject({ ok: true, kopf: { zustand: 'rueckfrage', rueckfrageBei: 'gruen' } })
    expect(r.ok && schreibrecht(r.kopf, k('g', 'gruen'))).toBe('ohne_bau')
    // zusammengeführt: für niemanden mehr sichtbar, nichts mehr möglich
    const weg = gruenWep({ zusammengefuehrtIn: 'w-bau' })
    expect(darfLesen(weg, k('g', 'gruen'))).toBe(false)
    expect(schreibrecht(weg, k('g', 'gruen'))).toBeNull()
    expect(moeglicheAktionen(weg, k('g', 'gruen'))).toEqual([])
    expect(darfLoeschen(weg, k('g', 'gruen'))).toBe(false)
  })

  it('Zusammenführen nur durch das Grün-Konto, an das abgegeben wurde, nur mit eigenen WEPs und vor der Abgabe an den BV', () => {
    const G = k('g', 'gruen')
    expect(pruefeZusammenfuehren(bauWep(), gruenWep(), G)).toEqual({ ok: true })
    expect(pruefeZusammenfuehren(bauWep(), gruenWep(), k('g', 'bau'))).toMatchObject({ ok: false, status: 403 })
    expect(pruefeZusammenfuehren(bauWep({ gruenKonto: 'g2' }), gruenWep(), G)).toMatchObject({ ok: false, status: 403, fehler: expect.stringMatching(/nicht an dich/) })
    expect(pruefeZusammenfuehren(bauWep(), gruenWep({ gruenKonto: 'g2' }), G)).toMatchObject({ ok: false, status: 403, fehler: expect.stringMatching(/eigenen WEPs/) })
    expect(pruefeZusammenfuehren(bauWep(), bauWep({ bauKonto: 'b2' }), G)).toMatchObject({ ok: false, status: 403 }) // ein anderes Bau-WEP ist kein eigenes
    expect(pruefeZusammenfuehren(bauWep({ zustand: 'beim_bv' }), gruenWep(), G)).toMatchObject({ ok: false, status: 409 })
    expect(pruefeZusammenfuehren(bauWep({ zustand: 'bau_in_arbeit' }), gruenWep(), G)).toMatchObject({ ok: false, status: 409 })
    expect(pruefeZusammenfuehren(bauWep({ zusammengefuehrtAus: 'x' }), gruenWep(), G)).toMatchObject({ ok: false, status: 409 })
    expect(pruefeZusammenfuehren(bauWep(), gruenWep({ zustand: 'beim_bv' }), G)).toMatchObject({ ok: false, status: 409 })
    expect(pruefeZusammenfuehren(bauWep(), gruenWep({ geloeschtAm: 'x' }), G)).toMatchObject({ ok: false, status: 409 })
    expect(pruefeZusammenfuehren(bauWep(), gruenWep({ zusammengefuehrtIn: 'y' }), G)).toMatchObject({ ok: false, status: 409 })
  })

  it('Speichern im eigenen Grün-WEP: der Bau-Teil bleibt, wie er auf dem Server ist', () => {
    const server = { ...neuerWep('w'), rolle: 'gruen' as const }
    const app: Wep = { ...server, formalien: { ...server.formalien, unterpaechter: 'Paula Pächterin' }, bau: { bauteile: [{ id: 'x' }] } as unknown as Wep['bau'], unterschriften: { bau: 'data:image/png;base64,AA', gruen: 'data:image/png;base64,BB' } }
    const neu = mitEigenemTeil(server, app, 'ohne_bau')
    expect(neu.formalien.unterpaechter).toBe('Paula Pächterin')
    expect(neu.bau).toBeUndefined()
    expect(neu.unterschriften).toEqual({ gruen: 'data:image/png;base64,BB' })
  })
})

function konto(db: ReturnType<typeof testDb>, id: string, name: string, rollen: Rolle[]): Konto {
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh
    .prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, 'freigegeben', ?, ?, ?)")
    .run(id, id, `${id}@example.org`, name, rollen.join(','), zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name, status: 'freigegeben', rollen, mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
}

const position = (id: string, bezeichnung: string) => ({ id, bezeichnung, menge: 1, einheit: 'Stück', einzelpreis: 10, zustand: 'gut' }) as unknown as Wep['gruen']['aufwuchs'][number]

async function aufbau() {
  const db = testDb()
  const bert = konto(db, 'bau-1', 'Bert Bauer', ['bau'])
  const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
  const gerd = konto(db, 'gruen-2', 'Gerd Grün', ['gruen'])
  const bea = konto(db, 'bv-1', 'Bea BV', ['bv'])
  // Bau-WEP von Bert
  const b = neuerWep('w-bau')
  b.rolle = 'bau'
  b.formalien = { ...b.formalien, vorgangsNr: '2026-0815', kleingartenanlage: 'KGA Musterwiese', parzelle: '12', unterpaechter: 'Paula Pächterin' }
  b.bau = { bauteile: [{ id: 'laube' }], beseitigung: [], beschreibung: 'Laube' } as unknown as Wep['bau']
  b.fotos = [{ id: 'f-bau', name: 'Laube', aufgenommenAm: '2026-10-28' } as unknown as NonNullable<Wep['fotos']>[number]]
  await speichereWep(db, bert, 'w-bau', { wep: b, basisRev: 0 })
  // Eigenes Grün-WEP von Erika (vorher erfasst, wie in v1)
  const g = neuerWep('w-gruen')
  g.rolle = 'gruen'
  g.formalien = { ...g.formalien, vorgangsNr: '2026-0815', kleingartenanlage: 'KGA Musterwiese', parzelle: '12', unterpaechter: 'Paula Pächterin-Neu', weg: 'Rosenweg' }
  g.gruen = { ...g.gruen, aufwuchs: [position('p-hecke', 'Hecke')], beschreibungAufwuchs: 'gepflegt' }
  g.fotos = [
    { id: 'f-hecke', positionId: 'p-hecke' } as unknown as NonNullable<Wep['fotos']>[number],
    { id: 'f-allg' } as unknown as NonNullable<Wep['fotos']>[number],
  ]
  g.unterschriften = { gruen: 'data:image/png;base64,R1JVRU4=' }
  await speichereWep(db, erika, 'w-gruen', { wep: g, basisRev: 0 })
  // Bert gibt an Erika ab
  await fuehreAktionAus(db, bert, 'w-bau', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })
  return { db, bert, erika, gerd, bea, b, g }
}

/** Was die App beim Zusammenführen schickt: Bau-WEP mit dem Grün-Teil des eigenen WEP (wie src/server/zusammenfuehren.ts). */
const zusammengefuehrtInApp = (bau: Wep, gruen: Wep): Wep => ({ ...bau, gruen: gruen.gruen, skizze: gruen.skizze, unterschriften: { ...bau.unterschriften, gruen: gruen.unterschriften?.gruen }, fotos: [...(bau.fotos ?? []), ...(gruen.fotos ?? [])] })

const serverWep = async (db: ReturnType<typeof testDb>, k: Konto, id: string) => {
  const e = await ladeWep(db, k, id)
  if (!e.ok) throw new Error(e.fehler)
  return e.wert.wep as Wep
}

describe('Zusammenführen auf dem Server', () => {
  it('Weg a: Erika führt ihr eigenes WEP mit dem Bau-WEP zusammen – ein WEP, Bau-Teil von Bau, Grün-Teil von Grün, Stammdaten je Feld', async () => {
    const { db, bert, erika, bea } = await aufbau()
    const bau = await serverWep(db, erika, 'w-bau')
    const gruen = await serverWep(db, erika, 'w-gruen')
    // Versuch, dabei den Bau-Teil zu ändern, wird ignoriert
    const app = { ...zusammengefuehrtInApp(bau, gruen), bau: { bauteile: [], beseitigung: [], beschreibung: 'manipuliert' } as unknown as Wep['bau'] }
    const e = await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gruen', wep: app, felder: ['unterpaechter', 'weg'], basisRev: 2 })
    expect(e).toMatchObject({ ok: true, wert: { kopf: { id: 'w-bau', rev: 3, zustand: 'gruen_in_arbeit', zusammengefuehrt: true }, gruenId: 'w-gruen', fotoIds: ['f-hecke', 'f-allg'] } })
    const neu = await serverWep(db, erika, 'w-bau')
    expect(neu.bau).toEqual(bau.bau)
    expect(neu.gruen.aufwuchs.map((p) => p.id)).toEqual(['p-hecke'])
    expect(neu.unterschriften?.gruen).toBe('data:image/png;base64,R1JVRU4=')
    expect(neu.fotos?.map((f) => f.id)).toEqual(['f-bau', 'f-hecke', 'f-allg'])
    expect(neu.formalien).toMatchObject({ unterpaechter: 'Paula Pächterin-Neu', weg: 'Rosenweg', kleingartenanlage: 'KGA Musterwiese' })
    expect(neu.ablauf?.zusammengefuehrtAus).toMatchObject({ id: 'w-gruen', vorgangsNr: '2026-0815' })
    // Das eigene Grün-WEP verschwindet aus der Liste, bleibt aber auf dem Server (markiert)
    expect((await lesbareWeps(db, erika)).map((w) => w.id)).toEqual(['w-bau'])
    expect(await ladeWep(db, erika, 'w-gruen')).toMatchObject({ ok: false, status: 404 })
    expect(db.roh.prepare("SELECT zusammengefuehrt_in FROM weps WHERE id = 'w-gruen'").get()).toEqual({ zusammengefuehrt_in: 'w-bau' })
    // Verlauf in beiden WEPs
    const v = await ladeVerlauf(db, erika, 'w-bau')
    expect(v.ok && v.wert.at(-1)).toMatchObject({ aktion: 'zusammengefuehrt', wer: 'Erika Musterfrau', notiz: expect.stringMatching(/2026-0815.*unterpaechter, weg/) })
    expect(db.roh.prepare("SELECT aktion FROM verlauf WHERE wep_id = 'w-gruen' ORDER BY id DESC LIMIT 1").get()).toEqual({ aktion: 'zusammengefuehrt_in' })
    // Bau sieht weiter nur lesend; Erika gibt an den BV ab
    const bertSicht = await serverWep(db, bert, 'w-bau')
    expect(bertSicht.gruen.aufwuchs).toHaveLength(1)
    expect(await speichereWep(db, bert, 'w-bau', { wep: bertSicht, basisRev: 3 })).toMatchObject({ ok: false, status: 403 })
    expect(await fuehreAktionAus(db, erika, 'w-bau', { aktion: 'an_bv', basisRev: 3 })).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })
    expect((await lesbareWeps(db, bea)).map((w) => w.id)).toEqual(['w-bau'])
  })

  it('Weg b: ohne eigenes WEP weiterarbeiten – Grün füllt den Grün-Teil im Bau-WEP (wie bisher)', async () => {
    const { db, erika } = await aufbau()
    const bau = await serverWep(db, erika, 'w-bau')
    const e = await speichereWep(db, erika, 'w-bau', { wep: { ...bau, gruen: { ...bau.gruen, aufwuchs: [position('p-neu', 'Rasen')] } }, basisRev: 2 })
    expect(e).toMatchObject({ ok: true })
    expect((await serverWep(db, erika, 'w-bau')).gruen.aufwuchs.map((p) => p.id)).toEqual(['p-neu'])
    expect((await lesbareWeps(db, erika)).map((w) => w.id).sort()).toEqual(['w-bau', 'w-gruen']) // eigenes WEP bleibt
    expect(await fuehreAktionAus(db, erika, 'w-bau', { aktion: 'an_bv', basisRev: 3 })).toMatchObject({ ok: true })
  })

  it('fremdes WEP zusammenführen ist verboten; nur auf dem aktuellen Stand; höchstens einmal', async () => {
    const { db, bert, erika, gerd } = await aufbau()
    const bau = await serverWep(db, erika, 'w-bau')
    const gruen = await serverWep(db, erika, 'w-gruen')
    const app = zusammengefuehrtInApp(bau, gruen)
    // Gerd: das Bau-WEP ist nicht an ihn abgegeben, das Grün-WEP gehört Erika (für ihn unsichtbar)
    expect(await fuehreZusammen(db, gerd, 'w-bau', { aus: 'w-gruen', wep: app, basisRev: 2 })).toMatchObject({ ok: false, status: 404 })
    const gg = neuerWep('w-gerd')
    await speichereWep(db, gerd, 'w-gerd', { wep: gg, basisRev: 0 })
    expect(await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gerd', wep: app, basisRev: 2 })).toMatchObject({ ok: false, status: 404 })
    expect(await fuehreZusammen(db, gerd, 'w-bau', { aus: 'w-gerd', wep: app, basisRev: 2 })).toMatchObject({ ok: false, status: 404 })
    // Bert (Bau) kann nicht zusammenführen
    expect(await fuehreZusammen(db, bert, 'w-bau', { aus: 'w-gruen', wep: app, basisRev: 2 })).toMatchObject({ ok: false, status: 404 })
    // falsche Revision
    expect(await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gruen', wep: app, basisRev: 1 })).toMatchObject({ ok: false, status: 409, stand: { kopf: { rev: 2 } } })
    // einmal geht, ein zweites eigenes WEP nicht mehr
    expect(await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gruen', wep: app, basisRev: 2 })).toMatchObject({ ok: true })
    const g2 = neuerWep('w-gruen-2')
    await speichereWep(db, erika, 'w-gruen-2', { wep: g2, basisRev: 0 })
    expect(await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gruen-2', wep: app, basisRev: 3 })).toMatchObject({ ok: false, status: 409, fehler: expect.stringMatching(/schon/) })
  })

  it('Rückgängig: Bau-WEP wie vorher, eigenes WEP wieder da; nach der Abgabe an den BV nicht mehr', async () => {
    const { db, erika } = await aufbau()
    const bau = await serverWep(db, erika, 'w-bau')
    const gruen = await serverWep(db, erika, 'w-gruen')
    await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gruen', wep: zusammengefuehrtInApp(bau, gruen), felder: ['unterpaechter'], basisRev: 2 })
    expect(await nimmZusammenfuehrungZurueck(db, erika, 'w-bau', { basisRev: 2 })).toMatchObject({ ok: false, status: 409 })
    expect(await nimmZusammenfuehrungZurueck(db, erika, 'w-bau', { basisRev: 3 })).toMatchObject({ ok: true, wert: { rev: 4 } })
    const zurueck = await serverWep(db, erika, 'w-bau')
    expect(zurueck.gruen.aufwuchs).toEqual([])
    expect(zurueck.formalien.unterpaechter).toBe('Paula Pächterin')
    expect(zurueck.ablauf?.zusammengefuehrtAus).toBeUndefined()
    expect((await lesbareWeps(db, erika)).map((w) => w.id).sort()).toEqual(['w-bau', 'w-gruen'])
    expect((await serverWep(db, erika, 'w-gruen')).gruen.aufwuchs.map((p) => p.id)).toEqual(['p-hecke'])
    const v = await ladeVerlauf(db, erika, 'w-gruen')
    expect(v.ok && v.wert.map((x) => x.aktion)).toEqual(['angelegt', 'zusammengefuehrt_in', 'zusammenfuehrung_zurueck'])
    // noch einmal zusammenführen, an den BV abgeben → kein Rückgängig mehr
    await fuehreZusammen(db, erika, 'w-bau', { aus: 'w-gruen', wep: zusammengefuehrtInApp(zurueck, gruen), basisRev: 4 })
    await fuehreAktionAus(db, erika, 'w-bau', { aktion: 'an_bv', basisRev: 5 })
    expect(await nimmZusammenfuehrungZurueck(db, erika, 'w-bau', { basisRev: 6 })).toMatchObject({ ok: false, status: 403 })
  })

  it('Grün-WEP ohne Bau: Grün gibt direkt an den BV ab (Name in E13 ergänzt), BV prüft; Papierkorb nur vorher', async () => {
    const { db, erika, bea, bert } = await aufbau()
    const g = await serverWep(db, erika, 'w-gruen')
    expect(g.ablauf).toMatchObject({ zustand: 'gruen_in_arbeit', gruen: { id: 'gruen-1', name: 'Erika Musterfrau' } })
    expect(g.ablauf?.bau).toBeUndefined()
    expect(await fuehreAktionAus(db, erika, 'w-gruen', { aktion: 'an_bv', basisRev: 1 })).toMatchObject({ ok: true, wert: { zustand: 'beim_bv' } })
    const beimBv = await serverWep(db, bea, 'w-gruen')
    expect(beimBv.formalien.wertermittlerAussenAufwuchs).toBe('Erika Musterfrau')
    expect(await fuehreAktionAus(db, bea, 'w-gruen', { aktion: 'rueckfrage', an: 'bau', notiz: 'x', basisRev: 2 })).toMatchObject({ ok: false, status: 400 })
    expect(await fuehreAktionAus(db, bea, 'w-gruen', { aktion: 'geprueft', basisRev: 2 })).toMatchObject({ ok: true, wert: { zustand: 'geprueft' } })
    expect(await ladeWep(db, bert, 'w-gruen')).toMatchObject({ ok: false, status: 404 })
    // Papierkorb: eigenes Grün-WEP solange in Arbeit
    const g2 = neuerWep('w-gruen-2')
    await speichereWep(db, erika, 'w-gruen-2', { wep: g2, basisRev: 0 })
    expect(await setzePapierkorb(db, erika, 'w-gruen-2', true, 1)).toMatchObject({ ok: true })
  })
})

describe('Endpunkte', () => {
  it('Zusammenführen kopiert die Fotodateien des Grün-WEP zum Bau-WEP; Rückgängig über den Endpunkt; fremde Herkunft abgelehnt', async () => {
    const { db, erika } = await aufbau()
    const r2 = fakeR2()
    await r2.put('weps/w-gruen/fotos/f-hecke.jpg', new Uint8Array([1, 2, 3]).buffer)
    await r2.put('weps/w-bau/fotos/f-bau.jpg', new Uint8Array([9]).buffer)
    const env = { SERVER_MODUS: 'true', WEP_DB: db, WEP_DATEIEN: r2 }
    const cookie = (await neueSitzung(db, erika.id)).cookie.split(';')[0]
    const bau = await serverWep(db, erika, 'w-bau')
    const gruen = await serverWep(db, erika, 'w-gruen')
    const post = (pfad: string, body: unknown, origin = ORIGIN) =>
      (pfad.endsWith('zuruecknehmen') ? zuruecknehmenEndpunkt : zusammenfuehrenEndpunkt)({
        request: new Request(`${ORIGIN}/api/v2/weps/w-bau/${pfad}`, { method: 'POST', body: JSON.stringify(body), headers: { cookie, origin } }),
        env,
        params: { id: 'w-bau' },
      })
    expect((await post('zusammenfuehren', {}, 'https://evil.example')).status).toBe(403)
    const r = await post('zusammenfuehren', { aus: 'w-gruen', wep: zusammengefuehrtInApp(bau, gruen), felder: [], basisRev: 2 })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ kopf: { rev: 3 }, fotosKopiert: 1 }) // f-allg liegt noch nicht in R2: lädt die App hoch
    expect([...r2.daten.get('weps/w-bau/fotos/f-hecke.jpg')!.bytes]).toEqual([1, 2, 3])
    expect(r2.daten.has('weps/w-gruen/fotos/f-hecke.jpg')).toBe(true) // kopiert, nicht verschoben
    const z = await post('zusammenfuehren-zuruecknehmen', { basisRev: 3 })
    expect(z.status).toBe(200)
  })
})
