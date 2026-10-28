// @vitest-environment node
// Server-Modus (v2): Abgleich gegen die echte Server-Logik (functions/_lib/v2/weps.ts mit SQLite und denselben
// Migrationen wie D1). Zwei Geräte desselben Bau-Wertermittlers und weitere Konten; nur erfundene Daten.
import { describe, expect, it } from 'vitest'
import { neuerWep, type Wep } from '@/model'
import { FakeLokal, Uhr } from '@/sync/testHilfen'
import * as regeln from '@/sync/papierkorb'
import { testDb } from '../../functions/_lib/__tests__/sqliteDb'
import type { Konto, Rolle } from '../../functions/_lib/v2/konten'
import { fuehreAktionAus, fuehreZusammen, ladeWep, lesbareWeps, setzePapierkorb, speichereWep, type Ergebnis } from '../../functions/_lib/v2/weps'
import { AbgleichFehler, serverAbgleich, wartendeServerAenderungen, type ServerKopf, type ServerStand, type ServerZugriff } from './abgleich'
import { merkeZusammenfuehrung, nimmLokalZurueck } from './zusammenfuehrenDienst'

type TestDb = ReturnType<typeof testDb>

function konto(db: TestDb, id: string, name: string, rollen: Rolle[]): Konto {
  const zeit = '2026-10-28T08:00:00.000Z'
  db.roh.prepare("INSERT INTO konten (id, anbieter, subjekt, email, name, status, rollen, erstellt_am, geaendert_am) VALUES (?, 'google', ?, ?, ?, 'freigegeben', ?, ?, ?)").run(id, id, `${id}@example.org`, name, rollen.join(','), zeit, zeit)
  return { id, anbieter: 'google', email: `${id}@example.org`, name, status: 'freigegeben', rollen, mailBenachrichtigung: true, erstelltAm: zeit, geaendertAm: zeit }
}

/** Server-Zugriff eines Kontos direkt auf die Server-Logik (wie die Functions, ohne HTTP). */
function zugriff(db: TestDb, k: Konto, uhr: Uhr): ServerZugriff & { offline: boolean } {
  const z = {
    offline: false,
    pruefe() {
      if (z.offline) throw new TypeError('Failed to fetch')
    },
    ergebnis<T>(e: Ergebnis<T>): T {
      if (e.ok) return e.wert
      throw new AbgleichFehler(e.fehler, e.status, e.stand as ServerStand | undefined)
    },
    async liste() {
      z.pruefe()
      return (await lesbareWeps(db, k)) as ServerKopf[]
    },
    async lade(id: string) {
      z.pruefe()
      return z.ergebnis(await ladeWep(db, k, id)) as ServerStand
    },
    async speichere(wep: Wep, basisRev: number) {
      z.pruefe()
      return z.ergebnis(await speichereWep(db, k, wep.id, { wep, basisRev }, Date.parse(uhr.jetzt()))) as ServerKopf
    },
    async loesche(id: string, basisRev: number) {
      z.pruefe()
      return z.ergebnis(await setzePapierkorb(db, k, id, true, basisRev, Date.parse(uhr.jetzt()))) as ServerKopf
    },
    async stelleWiederHer(id: string) {
      z.pruefe()
      return z.ergebnis(await setzePapierkorb(db, k, id, false, undefined, Date.parse(uhr.jetzt()))) as ServerKopf
    },
    async fuehreZusammen(wep: Wep, basisRev: number, aus: string, felder: readonly string[]) {
      z.pruefe()
      return z.ergebnis(await fuehreZusammen(db, k, wep.id, { wep, basisRev, aus, felder }, Date.parse(uhr.jetzt()))).kopf as ServerKopf
    },
  }
  return z
}

function testWep(id: string, anlage = 'KGA Musterwiese'): Wep {
  const w = neuerWep(id)
  w.formalien.kleingartenanlage = anlage
  w.formalien.vorgangsNr = `NR-${id}`
  return w
}

function aufbau() {
  const db = testDb()
  const uhr = new Uhr()
  const bert = konto(db, 'bau-1', 'Bert Bauer', ['bau'])
  const geraet = (k: Konto) => {
    const lokal = new FakeLokal()
    const server = zugriff(db, k, uhr)
    return { lokal, server, abgleich: () => serverAbgleich({ server, lokal, jetzt: uhr.jetzt }), kontext: { jetzt: uhr.jetzt(), geraet: 'test' } }
  }
  return { db, uhr, bert, geraet, a: geraet(bert), b: geraet(bert) }
}

const anlage = (l: FakeLokal, id: string) => l.weps.get(id)?.formalien.kleingartenanlage

describe('Abgleich mit dem Server', () => {
  it('neues WEP wird hochgeladen und kommt auf dem zweiten Gerät an; Änderungen laufen in beide Richtungen', async () => {
    const { uhr, a, b } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    expect(wartendeServerAenderungen(await a.lokal.alleWeps(), [], await a.lokal.alleMeta())).toBe(1)
    expect((await a.abgleich()).hochgeladen).toEqual(['w1'])
    expect(wartendeServerAenderungen(await a.lokal.alleWeps(), [], await a.lokal.alleMeta())).toBe(0)
    expect((await b.abgleich()).heruntergeladen).toEqual(['w1'])
    expect(anlage(b.lokal, 'w1')).toBe('KGA Musterwiese')

    await b.lokal.speichereWep(testWep('w1', 'KGA Seeblick'), uhr.vor(5))
    expect((await b.abgleich()).hochgeladen).toEqual(['w1'])
    expect((await a.abgleich()).heruntergeladen).toEqual(['w1'])
    expect(anlage(a.lokal, 'w1')).toBe('KGA Seeblick')
    // nichts mehr zu tun
    const leer = await a.abgleich()
    expect([...leer.hochgeladen, ...leer.heruntergeladen, ...leer.konflikte]).toEqual([])
  })

  it('offline weiterarbeiten: Änderungen warten und gehen beim nächsten Abgleich hoch', async () => {
    const { uhr, a, b } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    a.server.offline = true
    await a.lokal.speichereWep(testWep('w1', 'KGA Offline'), uhr.vor(2))
    await expect(a.abgleich()).rejects.toThrow(/Failed to fetch/)
    expect(anlage(a.lokal, 'w1')).toBe('KGA Offline')
    a.server.offline = false
    expect((await a.abgleich()).hochgeladen).toEqual(['w1'])
    await b.abgleich()
    expect(anlage(b.lokal, 'w1')).toBe('KGA Offline')
  })

  it('auf zwei Geräten geändert: die neuere Änderung gilt, die andere bleibt als Fassung sichtbar – in beide Richtungen', async () => {
    const { uhr, a, b } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    await b.abgleich()
    await b.lokal.speichereWep(testWep('w1', 'KGA Gerät B (älter)'), uhr.vor(1))
    await a.lokal.speichereWep(testWep('w1', 'KGA Gerät A (neuer)'), uhr.vor(1))
    await a.abgleich() // A zuerst auf dem Server
    const e = await b.abgleich() // B ist älter → Server gewinnt, B behält seine Fassung als Konflikt
    expect(e.konflikte.map((k) => k.wepId)).toEqual(['w1'])
    expect(anlage(b.lokal, 'w1')).toBe('KGA Gerät A (neuer)')
    expect(b.lokal.meta.get('w1')?.konflikt).toMatchObject({ art: 'zwei-geraete', fassung: { formalien: { kleingartenanlage: 'KGA Gerät B (älter)' } } })
    // B wählt die eigene Fassung → wird hochgeladen und kommt bei A an
    await regeln.loeseKonflikt(b.lokal, 'w1', 'andere', { jetzt: uhr.vor(1), geraet: 'B' })
    expect((await b.abgleich()).hochgeladen).toEqual(['w1'])
    await a.abgleich()
    expect(anlage(a.lokal, 'w1')).toBe('KGA Gerät B (älter)')

    // umgekehrt: das lokale Gerät ist neuer → es gilt, die Fassung des Servers bleibt sichtbar
    await a.lokal.speichereWep(testWep('w1', 'KGA A2 (älter)'), uhr.vor(1))
    await a.abgleich()
    await b.lokal.speichereWep(testWep('w1', 'KGA B2 (neuer)'), uhr.vor(1)) // B hat A2 noch nicht
    const e2 = await b.abgleich()
    expect(e2.hochgeladen).toEqual(['w1'])
    expect(e2.konflikte).toHaveLength(1)
    expect(b.lokal.meta.get('w1')?.konflikt?.fassung?.formalien.kleingartenanlage).toBe('KGA A2 (älter)')
    await a.abgleich()
    expect(anlage(a.lokal, 'w1')).toBe('KGA B2 (neuer)')
  })

  it('Löschen gilt überall (Papierkorb); Wiederherstellen ebenso; „endgültig“ nur auf diesem Gerät', async () => {
    const { db, uhr, a, b, bert } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    await b.abgleich()
    await regeln.loescheWep(a.lokal, 'w1', { jetzt: uhr.vor(1), geraet: 'A' })
    expect(wartendeServerAenderungen([], ['w1'], await a.lokal.alleMeta())).toBe(1)
    await a.abgleich()
    expect(wartendeServerAenderungen([], ['w1'], await a.lokal.alleMeta())).toBe(0)
    expect((await lesbareWeps(db, bert))[0].geloeschtAm).toBeTruthy()
    expect((await b.abgleich()).geloescht).toEqual(['w1'])
    expect(b.lokal.korb.has('w1')).toBe(true)

    await regeln.stelleWiederHer(b.lokal, 'w1', { jetzt: uhr.vor(1), geraet: 'B' })
    expect((await b.abgleich()).wiederhergestellt).toEqual(['w1'])
    expect((await lesbareWeps(db, bert))[0].geloeschtAm).toBeUndefined()
    await a.abgleich()
    expect(a.lokal.weps.has('w1')).toBe(true)

    await regeln.loescheWep(a.lokal, 'w1', { jetzt: uhr.vor(1), geraet: 'A' })
    await regeln.loescheEndgueltig(a.lokal, 'w1', uhr.vor(1))
    expect((await a.abgleich()).bereinigt).toEqual(['w1'])
    expect(a.lokal.meta.has('w1')).toBe(false)
    expect((await lesbareWeps(db, bert))[0].geloeschtAm).toBeTruthy() // bleibt auf dem Server im Papierkorb
    await a.abgleich()
    expect(a.lokal.weps.has('w1')).toBe(false) // kommt nicht wieder
  })

  it('auf dem anderen Gerät gelöscht, hier noch geändert: nicht still löschen, sondern fragen; „behalten“ holt es zurück', async () => {
    const { db, uhr, a, b, bert } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    await b.abgleich()
    await regeln.loescheWep(a.lokal, 'w1', { jetzt: uhr.vor(1), geraet: 'A' })
    await a.abgleich()
    await b.lokal.speichereWep(testWep('w1', 'KGA noch geändert'), uhr.vor(1))
    const e = await b.abgleich()
    expect(e.konflikte.map((k) => k.wepId)).toEqual(['w1'])
    expect(b.lokal.meta.get('w1')?.konflikt).toMatchObject({ art: 'geloescht-geaendert', geloeschtWo: 'anderes-geraet' })
    expect(b.lokal.weps.has('w1')).toBe(true)
    // erneuter Abgleich ändert nichts, solange nicht entschieden ist
    expect((await b.abgleich()).konflikte).toEqual([])
    await regeln.loeseKonflikt(b.lokal, 'w1', 'diese', { jetzt: uhr.vor(1), geraet: 'B' })
    const e2 = await b.abgleich()
    expect(e2.wiederhergestellt).toEqual(['w1'])
    expect(e2.hochgeladen).toEqual(['w1'])
    const s = await lesbareWeps(db, bert)
    expect(s[0].geloeschtAm).toBeUndefined()
    await a.abgleich()
    expect(anlage(a.lokal, 'w1')).toBe('KGA noch geändert')
  })

  it('hier gelöscht, auf dem Server inzwischen geändert: WEP kommt zurück und es wird gefragt; „doch löschen“ löscht überall', async () => {
    const { db, uhr, a, b, bert } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    await b.abgleich()
    await regeln.loescheWep(b.lokal, 'w1', { jetzt: uhr.vor(1), geraet: 'B' })
    await a.lokal.speichereWep(testWep('w1', 'KGA geändert auf A'), uhr.vor(1))
    await a.abgleich()
    const e = await b.abgleich()
    expect(e.konflikte.map((k) => k.wepId)).toEqual(['w1'])
    expect(b.lokal.meta.get('w1')?.konflikt).toMatchObject({ art: 'geloescht-geaendert', geloeschtWo: 'hier' })
    expect(anlage(b.lokal, 'w1')).toBe('KGA geändert auf A')
    await regeln.loeseKonflikt(b.lokal, 'w1', 'andere', { jetzt: uhr.vor(1), geraet: 'B' })
    await b.abgleich()
    expect((await lesbareWeps(db, bert))[0].geloeschtAm).toBeTruthy()
  })

  it('Rechte: Grün legt ein eigenes WEP an (Bau sieht es nicht); fremde WEPs kommen nicht an', async () => {
    const { db, uhr, a } = aufbau()
    const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
    const g = (() => {
      const lokal = new FakeLokal()
      const server = zugriff(db, erika, uhr)
      return { lokal, abgleich: () => serverAbgleich({ server, lokal, jetzt: uhr.jetzt }) }
    })()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    await g.lokal.speichereWep(testWep('g1'), uhr.vor(1))
    const e = await g.abgleich()
    expect(e.fehler).toEqual([])
    expect(e.hochgeladen).toEqual(['g1'])
    expect(g.lokal.weps.get('g1')?.ablauf).toMatchObject({ zustand: 'gruen_in_arbeit', gruen: { id: 'gruen-1' } })
    expect(g.lokal.weps.has('w1')).toBe(false)
    await a.abgleich()
    expect(a.lokal.weps.has('g1')).toBe(false)
  })

  it('gesperrtes WEP (z. B. schon beim BV): der Stand des Servers gilt, die eigene Änderung bleibt als Fassung sichtbar', async () => {
    const { db, uhr, a } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await a.abgleich()
    db.roh.prepare("UPDATE weps SET zustand = 'beim_bv', rev = rev + 1 WHERE id = 'w1'").run()
    await a.lokal.speichereWep(testWep('w1', 'KGA zu spät'), uhr.vor(1))
    const e = await a.abgleich()
    expect(e.konflikte[0].text).toMatch(/gesperrt/)
    expect(anlage(a.lokal, 'w1')).toBe('KGA Musterwiese')
    expect(a.lokal.meta.get('w1')?.konflikt?.fassung?.formalien.kleingartenanlage).toBe('KGA zu spät')
    expect(wartendeServerAenderungen(await a.lokal.alleWeps(), [], await a.lokal.alleMeta())).toBe(0)
  })

  it('Änderung während des Uploads geht nicht verloren (wartet weiter)', async () => {
    const { uhr, a } = aufbau()
    await a.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    const speichere = a.server.speichere
    a.server.speichere = async (wep, rev) => {
      const k = await speichere(wep, rev)
      await a.lokal.speichereWep(testWep('w1', 'KGA während des Uploads'), uhr.vor(1))
      return k
    }
    await a.abgleich()
    a.server.speichere = speichere
    expect(wartendeServerAenderungen(await a.lokal.alleWeps(), [], await a.lokal.alleMeta())).toBe(1)
    expect((await a.abgleich()).hochgeladen).toEqual(['w1'])
  })
})

describe('Ablauf mit zwei Personen (Paket 3)', () => {
  it('Bau gibt an Grün ab: Grün bekommt das WEP mit Ablauf, ändert nur den Grün-Teil; Bau sieht es danach, ist aber gesperrt', async () => {
    const { db, uhr, a: bauGeraet, bert } = aufbau()
    const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
    const lokal = new FakeLokal()
    const g = { lokal, abgleich: () => serverAbgleich({ server: zugriff(db, erika, uhr), lokal, jetzt: uhr.jetzt }) }

    await bauGeraet.lokal.speichereWep(testWep('w1'), uhr.vor(1))
    await bauGeraet.abgleich()
    expect(bauGeraet.lokal.weps.get('w1')?.ablauf).toMatchObject({ zustand: 'bau_in_arbeit', bau: { name: 'Bert Bauer' } }) // nach dem Anlegen geholt
    expect(await g.abgleich()).toMatchObject({ heruntergeladen: [] }) // Entwurf: Grün sieht nichts

    const rev = bauGeraet.lokal.meta.get('w1')!.serverRev!
    expect(await fuehreAktionAus(db, bert, 'w1', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: rev })).toMatchObject({ ok: true })
    expect((await g.abgleich()).heruntergeladen).toEqual(['w1'])
    const gw = g.lokal.weps.get('w1')!
    expect(gw.ablauf).toMatchObject({ zustand: 'gruen_in_arbeit', gruen: { name: 'Erika Musterfrau' } })

    // Grün ändert Grün-Teil und (versehentlich) die Anlage: nur der Grün-Teil kommt an, der Stand wird neu geholt
    await g.lokal.speichereWep({ ...gw, gruen: { ...gw.gruen, beschreibungAufwuchs: 'Obstwiese' }, formalien: { ...gw.formalien, kleingartenanlage: 'KGA falsch' } }, uhr.vor(1))
    expect((await g.abgleich()).hochgeladen).toEqual(['w1'])
    expect(g.lokal.weps.get('w1')?.formalien.kleingartenanlage).toBe('KGA Musterwiese')
    expect(g.lokal.weps.get('w1')?.gruen.beschreibungAufwuchs).toBe('Obstwiese')

    // Bau gleicht ab: bekommt Grüns Teil; eine eigene Änderung danach ist gesperrt und bleibt als Fassung sichtbar
    await bauGeraet.abgleich()
    expect(bauGeraet.lokal.weps.get('w1')?.gruen.beschreibungAufwuchs).toBe('Obstwiese')
    await bauGeraet.lokal.speichereWep({ ...bauGeraet.lokal.weps.get('w1')!, formalien: { ...testWep('w1').formalien, parzelle: '99' } }, uhr.vor(1))
    const e = await bauGeraet.abgleich()
    expect(e.konflikte[0]?.text).toMatch(/gesperrt/)
    expect(bauGeraet.lokal.weps.get('w1')?.formalien.parzelle).toBe('')
  })

  it('Zusammenführen ohne Netz: lokal sofort, beim Abgleich übernimmt der Server; das eigene WEP verschwindet', async () => {
    const { db, uhr, a: bert, geraet } = aufbau()
    const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
    const e = geraet(erika)
    // Bert legt an und gibt an Erika ab; Erika gleicht ab und geht dann ohne Netz auf die Parzelle
    await bert.lokal.speichereWep(testWep('w-bau'), uhr.vor(1))
    await bert.abgleich()
    await fuehreAktionAus(db, konto2(db, 'bau-1'), 'w-bau', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })
    await e.abgleich()
    expect(e.lokal.weps.get('w-bau')?.ablauf?.zustand).toBe('gruen_in_arbeit')
    e.server.offline = true
    // Eigenes WEP offline angelegt (nie auf dem Server), dann zusammengeführt und danach weiter bearbeitet
    const eigenes = testWep('w-eigen')
    eigenes.rolle = 'gruen'
    eigenes.formalien.unterpaechter = 'Paula Pächterin'
    eigenes.gruen.aufwuchs = [{ id: 'p-hecke', bezeichnung: 'Hecke' } as unknown as Wep['gruen']['aufwuchs'][number]]
    await e.lokal.speichereWep(eigenes, uhr.vor(1))
    await merkeZusammenfuehrung(e.lokal, 'w-bau', 'w-eigen', ['unterpaechter'], uhr.vor(1))
    expect(e.lokal.weps.get('w-bau')?.gruen.aufwuchs.map((p) => p.id)).toEqual(['p-hecke'])
    expect(e.lokal.meta.get('w-eigen')?.zusammengefuehrtIn).toBe('w-bau')
    const weiter = structuredClone(e.lokal.weps.get('w-bau')!)
    weiter.gruen.beschreibungAufwuchs = 'nach dem Zusammenführen ergänzt'
    await e.lokal.speichereWep(weiter, uhr.vor(1))
    await expect(e.abgleich()).rejects.toThrow() // ohne Netz: alles wartet
    // Wieder Netz: erst das eigene WEP hoch, dann das Zusammenführen
    e.server.offline = false
    const erg = await e.abgleich()
    expect(erg.fehler).toEqual([])
    expect(e.lokal.weps.has('w-eigen')).toBe(false)
    expect(e.lokal.meta.get('w-bau')?.zusammenfuehrung).toBeUndefined()
    const server = await ladeWep(db, erika, 'w-bau')
    const w = (server.ok && server.wert.wep) as Wep
    expect(w.gruen.aufwuchs.map((p) => p.id)).toEqual(['p-hecke'])
    expect(w.gruen.beschreibungAufwuchs).toBe('nach dem Zusammenführen ergänzt')
    expect(w.formalien.unterpaechter).toBe('Paula Pächterin')
    expect(w.ablauf?.zusammengefuehrtAus?.id).toBe('w-eigen')
    expect((await lesbareWeps(db, erika)).map((x) => x.id)).toEqual(['w-bau'])
    expect(wartendeServerAenderungen(await e.lokal.alleWeps(), [], await e.lokal.alleMeta())).toBe(0)
    // Bert sieht den Grün-Teil (nur lesend)
    await bert.abgleich()
    expect(bert.lokal.weps.get('w-bau')?.gruen.aufwuchs).toHaveLength(1)
  })

  it('Zusammenführen lokal zurücknehmen, bevor der Server es hat; vom Server abgelehnt: sein Stand gilt, das eigene WEP kommt zurück', async () => {
    const { db, uhr, a: bert, geraet } = aufbau()
    const erika = konto(db, 'gruen-1', 'Erika Musterfrau', ['gruen'])
    const e = geraet(erika)
    await bert.lokal.speichereWep(testWep('w-bau'), uhr.vor(1))
    await bert.abgleich()
    await fuehreAktionAus(db, konto2(db, 'bau-1'), 'w-bau', { aktion: 'an_gruen', gruenKonto: 'gruen-1', basisRev: 1 })
    const eigenes = testWep('w-eigen')
    eigenes.gruen.aufwuchs = [{ id: 'p1' } as unknown as Wep['gruen']['aufwuchs'][number]]
    await e.lokal.speichereWep(eigenes, uhr.vor(1))
    await e.abgleich()
    // lokal zurücknehmen
    await merkeZusammenfuehrung(e.lokal, 'w-bau', 'w-eigen', [], uhr.vor(1))
    expect(await nimmLokalZurueck(e.lokal, 'w-bau', uhr.vor(1))).toBe(true)
    expect(e.lokal.weps.get('w-bau')?.gruen.aufwuchs).toEqual([])
    expect(e.lokal.meta.get('w-eigen')?.zusammengefuehrtIn).toBeUndefined()
    await e.abgleich()
    expect((await lesbareWeps(db, erika)).map((x) => x.id).sort()).toEqual(['w-bau', 'w-eigen'])
    // vorgemerkt, aber inzwischen auf dem Server nicht mehr bei Grün in Arbeit → abgelehnt
    await merkeZusammenfuehrung(e.lokal, 'w-bau', 'w-eigen', [], uhr.vor(1))
    db.roh.prepare("UPDATE weps SET zustand = 'beim_bv', rev = rev + 1 WHERE id = 'w-bau'").run()
    const erg = await e.abgleich()
    expect(erg.fehler).toEqual([expect.objectContaining({ wepId: 'w-bau', text: expect.stringMatching(/Zusammenführen nicht möglich.*wieder in der Liste/) })])
    expect(e.lokal.weps.get('w-bau')?.ablauf?.zustand).toBe('beim_bv')
    expect(e.lokal.meta.get('w-bau')?.konflikt?.fassung?.gruen.aufwuchs).toHaveLength(1)
    expect(e.lokal.meta.get('w-bau')?.zusammenfuehrung).toBeUndefined()
    expect(e.lokal.meta.get('w-eigen')?.zusammengefuehrtIn).toBeUndefined()
    expect(e.lokal.weps.has('w-eigen')).toBe(true)
  })
})

/** Konto aus der Test-Datenbank (für Schritte direkt auf dem Server). */
function konto2(db: TestDb, id: string): Konto {
  const z = db.roh.prepare('SELECT * FROM konten WHERE id = ?').get(id) as { id: string; name: string; email: string; rollen: string }
  return { id: z.id, anbieter: 'google', email: z.email, name: z.name, status: 'freigegeben', rollen: z.rollen.split(',') as Rolle[], mailBenachrichtigung: true, erstelltAm: '', geaendertAm: '' }
}
