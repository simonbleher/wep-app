// Papierkorb und sichtbare Konflikte (Beta 3, Paket 2): zwei Geräte gleichen über ein
// gemeinsames FakeDrive ab; die Uhr wird von Hand vorgestellt.
import { describe, expect, it } from 'vitest'
import { entpacke } from './engine'
import { FakeDrive } from './fakeDrive'
import { PAPIERKORB_TAGE, istAbgelaufen, verbleibendeTage } from './papierkorb'
import { FakeLokal, Geraet, Uhr, anlage, wep } from './testHilfen'

const ID = '2026-001'
const KORB = `daten/papierkorb/${ID}.json`
const DATEI = `daten/${ID}.json`

/** Zwei Geräte, auf beiden ist 2026-001 („Start“) bereits abgeglichen. */
async function zweiGeraete() {
  const drive = new FakeDrive()
  const uhr = new Uhr()
  const handy = new Geraet('Handy', drive, uhr)
  const tablet = new Geraet('Tablet', drive, uhr)
  await handy.bearbeite(wep(ID, 'Start'))
  await handy.sync()
  await tablet.sync()
  expect(tablet.hat(ID)).toBe(true)
  drive.aufrufe = []
  return { drive, uhr, handy, tablet }
}

describe('Fristen', () => {
  it('30 Tage: genau am 30. Tag ist die Frist abgelaufen', () => {
    const von = '2026-10-01T10:00:00.000Z'
    expect(PAPIERKORB_TAGE).toBe(30)
    expect(istAbgelaufen(von, '2026-10-31T09:59:59.000Z')).toBe(false)
    expect(istAbgelaufen(von, '2026-10-31T10:00:00.000Z')).toBe(true)
    expect(istAbgelaufen('kaputt', '2026-10-31T10:00:00.000Z')).toBe(false)
  })

  it('verbleibende Tage werden aufgerundet', () => {
    const von = '2026-10-01T10:00:00.000Z'
    expect(verbleibendeTage(von, von)).toBe(30)
    expect(verbleibendeTage(von, '2026-10-30T11:00:00.000Z')).toBe(1)
    expect(verbleibendeTage(von, '2026-12-01T00:00:00.000Z')).toBe(0)
  })
})

describe('Löschen gilt auf allen Geräten', () => {
  it('verschiebt die Datei nach daten/papierkorb/ und trägt den Löschzeitpunkt ein', async () => {
    const { drive, handy } = await zweiGeraete()
    expect(await handy.loesche(ID)).toBe(true)
    expect(handy.hat(ID)).toBe(false)
    expect(handy.imKorb(ID)).toBe(true)

    await handy.sync()
    expect(drive.namen('daten')).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([`${ID}.json`])
    expect(drive.aufrufe).toContain(`verschiebe ${DATEI} -> daten/papierkorb`)
    const datei = entpacke(drive.text(KORB))
    expect(datei.geloeschtAm).toBe(handy.lokal.korb.get(ID)?.geloeschtAm)
    expect(datei.geloeschtVon).toBe('Handy')
    expect(datei.wep.formalien.kleingartenanlage).toBe('Start')
    expect(handy.meta(ID)?.papierkorbETag).toBeTruthy()
  })

  it('das andere Gerät legt das WEP beim Abgleich in seinen Papierkorb', async () => {
    const { handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()

    const e = await tablet.sync()
    expect(e.geloescht).toEqual([ID])
    expect(tablet.hat(ID)).toBe(false)
    expect(tablet.imKorb(ID)).toBe(true)
    expect(tablet.lokal.korb.get(ID)?.geloeschtAm).toBe(handy.lokal.korb.get(ID)?.geloeschtAm)
    expect(tablet.lokal.ereignisse).toContain(`geloescht ${ID}`) // Android-Warteschlange wird bereinigt
  })

  it('ist idempotent: weitere Abgleiche ändern nichts und verschieben nicht erneut', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.sync()
    drive.aufrufe = []

    for (const g of [handy, tablet, handy, tablet]) {
      const e = await g.sync()
      expect(e).toEqual({
        hochgeladen: [],
        heruntergeladen: [],
        konflikte: [],
        fehler: [],
        geloescht: [],
        wiederhergestellt: [],
        bereinigt: [],
        umnummeriert: [],
      })
    }
    expect(drive.aufrufe.filter((a) => a.startsWith('verschiebe') || a.startsWith('schreibe'))).toEqual([])
    expect(await handy.loesche(ID)).toBe(false) // doppelt löschen: nichts zu tun
  })

  it('heilt einen Abbruch zwischen Verschieben und Löschzeitpunkt', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    // Der Lauf bricht nach dem Move ab: Datei liegt ohne Stempel im Papierkorb
    await drive.client('daten').verschiebe(`${ID}.json`, 'daten/papierkorb')
    expect(entpacke(drive.text(KORB)).geloeschtAm).toBeUndefined()

    const e = await handy.sync()
    expect(e.fehler).toEqual([])
    expect(entpacke(drive.text(KORB)).geloeschtAm).toBe(handy.lokal.korb.get(ID)?.geloeschtAm)
    expect(drive.namen('daten')).toEqual([])
    await tablet.sync()
    expect(tablet.imKorb(ID)).toBe(true)
  })

  it('Offline löschen: erst beim nächsten Abgleich erfährt OneDrive davon', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    handy.online = false
    await handy.loesche(ID)
    await expect(handy.sync()).rejects.toThrow()
    await tablet.sync()
    expect(tablet.hat(ID)).toBe(true) // noch nichts bekannt
    expect(drive.namen('daten')).toEqual([`${ID}.json`])

    handy.online = true
    await handy.sync()
    expect(drive.namen('daten')).toEqual([])
    await tablet.sync()
    expect(tablet.hat(ID)).toBe(false)
    expect(tablet.imKorb(ID)).toBe(true)
  })

  it('Ohne Konto: lokaler Papierkorb; nach der Anmeldung geht er nach OneDrive', async () => {
    const drive = new FakeDrive()
    const uhr = new Uhr()
    const handy = new Geraet('Handy', drive, uhr)
    await handy.bearbeite(wep(ID, 'Nur lokal'))
    await handy.loesche(ID)
    expect(handy.imKorb(ID)).toBe(true)
    expect(handy.meta(ID)?.remoteETag).toBeUndefined()
    expect(drive.dateien.size).toBe(0)

    await handy.sync() // „Anmeldung“: erster Abgleich
    expect(drive.namen('daten')).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([`${ID}.json`])
    const tablet = new Geraet('Tablet', drive, uhr)
    await tablet.sync()
    expect(tablet.hat(ID)).toBe(false)
    expect(tablet.imKorb(ID)).toBe(true)
  })

  it('verlorene Speicherungen nach dem Löschen (verzögertes Speichern) legen das WEP nicht wieder an', async () => {
    const { drive, handy } = await zweiGeraete()
    await handy.loesche(ID)
    handy.lokal.ereignisse = []
    expect(await handy.bearbeite(wep(ID, 'Zu spät gespeichert'))).toBe(false)
    expect(handy.hat(ID)).toBe(false)
    expect(handy.lokal.ereignisse).toEqual([])
    await handy.sync()
    expect(drive.namen('daten')).toEqual([])
  })
})

describe('Wiederherstellen', () => {
  it('überall wieder da, Papierkorb in OneDrive leer', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.sync()

    const r = await handy.stelleWiederHer(ID)
    expect(r).toEqual({ id: ID, neueNummer: false })
    expect(handy.hat(ID)).toBe(true)
    expect(handy.imKorb(ID)).toBe(false)
    expect(handy.lokal.ereignisse).toContain(`wiederhergestellt ${ID}`)

    const e1 = await handy.sync()
    expect(e1.hochgeladen).toEqual([ID])
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(entpacke(drive.text(DATEI)).geloeschtAm).toBeUndefined()

    const e2 = await tablet.sync()
    expect(e2.wiederhergestellt).toEqual([ID])
    expect(tablet.hat(ID)).toBe(true)
    expect(tablet.imKorb(ID)).toBe(false)
    expect(anlage(tablet.lokal, ID)).toBe('Start')
    expect(tablet.meta(ID)?.geloescht).toBe(false)
    // danach Ruhe
    expect((await tablet.sync()).wiederhergestellt).toEqual([])
    expect((await handy.sync()).hochgeladen).toEqual([])
  })

  it('auch vom Gerät aus, das den Papierkorb nur gespiegelt hat', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.sync()

    await tablet.stelleWiederHer(ID)
    await tablet.sync()
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    const e = await handy.sync()
    expect(e.wiederhergestellt).toEqual([ID])
    expect(handy.hat(ID)).toBe(true)
  })

  it('offline wiederhergestellt: beim nächsten Abgleich zurückgeholt, nicht erneut gelöscht', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    handy.online = false
    await handy.stelleWiederHer(ID)
    await expect(handy.sync()).rejects.toThrow()
    handy.online = true

    const e = await handy.sync()
    expect(e.konflikte).toEqual([])
    expect(handy.hat(ID)).toBe(true)
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    expect(drive.namen('daten/papierkorb')).toEqual([])
    await tablet.sync()
    expect(tablet.hat(ID)).toBe(true)
  })

  it('wiederhergestellt, bevor die Löschung in OneDrive angekommen ist', async () => {
    const { drive, handy } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.stelleWiederHer(ID)
    const e = await handy.sync()
    expect(e.fehler).toEqual([])
    expect(handy.hat(ID)).toBe(true)
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    expect(drive.namen('daten/papierkorb')).toEqual([])
  })

  it('ist die Nummer inzwischen vergeben, wird als neues WEP wiederhergestellt – nichts wird überschrieben', async () => {
    const { handy } = await zweiGeraete()
    await handy.loesche(ID)
    handy.lokal.weps.set(ID, wep(ID, 'Neues WEP mit alter Nummer')) // z. B. vom anderen Gerät übernommen
    const r = await handy.stelleWiederHer(ID)
    expect(r).toEqual({ id: '2026-002', neueNummer: true })
    expect(anlage(handy.lokal, ID)).toBe('Neues WEP mit alter Nummer')
    expect(anlage(handy.lokal, '2026-002')).toBe('Start')
    expect(handy.lokal.weps.get('2026-002')?.formalien.vorgangsNr).toBe('2026-002')
    expect(handy.imKorb(ID)).toBe(true) // Original bleibt, bis man es endgültig löscht
  })

  it('was nicht im Papierkorb liegt, lässt sich nicht wiederherstellen', async () => {
    const { handy } = await zweiGeraete()
    expect(await handy.stelleWiederHer(ID)).toBeUndefined()
    expect(await handy.stelleWiederHer('2026-999')).toBeUndefined()
  })
})

describe('30 Tage und „Endgültig löschen“', () => {
  it('nach 29 Tagen noch da, nach 31 Tagen überall endgültig weg', async () => {
    const { drive, uhr, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.sync()

    uhr.tage(29)
    await handy.sync()
    await tablet.sync()
    expect(drive.namen('daten/papierkorb')).toEqual([`${ID}.json`])
    expect(handy.imKorb(ID) && tablet.imKorb(ID)).toBe(true)

    uhr.tage(2)
    const e = await handy.sync()
    expect(e.bereinigt).toEqual([ID])
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(drive.namen('daten')).toEqual([])
    expect(handy.imKorb(ID)).toBe(false)
    expect(handy.lokal.meta.has(ID)).toBe(false)

    await tablet.sync()
    expect(tablet.imKorb(ID)).toBe(false)
    expect(tablet.hat(ID)).toBe(false)
    expect(tablet.lokal.meta.has(ID)).toBe(false)
  })

  it('ohne Konto räumt das Aufräumen allein lokal auf', async () => {
    const drive = new FakeDrive()
    const uhr = new Uhr()
    const handy = new Geraet('Handy', drive, uhr)
    await handy.bearbeite(wep(ID, 'A'))
    await handy.bearbeite(wep('2026-002', 'B'))
    await handy.loesche(ID)
    uhr.tage(10)
    await handy.loesche('2026-002')
    uhr.tage(21) // ID: 31 Tage, 2026-002: 21 Tage
    expect(await handy.raeumeAuf()).toEqual([ID])
    expect(handy.imKorb(ID)).toBe(false)
    expect(handy.imKorb('2026-002')).toBe(true)
    expect(handy.lokal.meta.has(ID)).toBe(false) // keine Spuren in OneDrive → keine Marke nötig
  })

  it('ein neues Gerät findet einen abgelaufenen Eintrag nur noch zum Aufräumen', async () => {
    const { drive, uhr, handy } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    uhr.tage(40)
    const neu = new Geraet('Neu', drive, uhr)
    const e = await neu.sync()
    expect(e.bereinigt).toEqual([ID])
    expect(neu.imKorb(ID)).toBe(false)
    expect(drive.namen('daten/papierkorb')).toEqual([])
  })

  it('„Endgültig löschen“ entfernt die Dateien in OneDrive und auf den anderen Geräten', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.sync()

    expect(await tablet.loescheEndgueltig(ID)).toBe(true)
    expect(tablet.imKorb(ID)).toBe(false)
    expect(tablet.meta(ID)?.endgueltig).toBe(true) // Marke, bis OneDrive aufgeräumt ist

    await tablet.sync()
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(tablet.lokal.meta.has(ID)).toBe(false)
    const e = await handy.sync()
    expect(e.bereinigt).toEqual([ID])
    expect(handy.imKorb(ID)).toBe(false)
    expect(handy.lokal.meta.has(ID)).toBe(false)
  })

  it('endgültig gelöscht ohne Abgleich dazwischen: auch die Datei in daten/ geht', async () => {
    const { drive, handy } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.loescheEndgueltig(ID)
    await handy.sync()
    expect(drive.namen('daten')).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(handy.lokal.meta.has(ID)).toBe(false)
  })

  it('entfernt auch übrig gebliebene Konflikt-Kopien des WEP', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.bearbeite(wep(ID, 'Handy'))
    await tablet.bearbeite(wep(ID, 'Tablet'))
    await tablet.sync()
    await handy.sync()
    expect(drive.namen('daten').filter((n) => n.includes('.konflikt-'))).toHaveLength(1)

    await handy.loesche(ID)
    await handy.sync()
    await handy.loescheEndgueltig(ID)
    await handy.sync()
    expect(drive.namen('daten')).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([])
  })

  it('endgültig gelöscht, aber danach auf einem anderen Gerät geändert: Konflikt statt Löschen', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.loescheEndgueltig(ID) // noch nichts in OneDrive passiert
    await tablet.bearbeite(wep(ID, 'Tablet danach'))
    await tablet.sync()

    const e = await handy.sync()
    expect(e.konflikte).toHaveLength(1)
    expect(handy.hat(ID)).toBe(true)
    expect(anlage(handy.lokal, ID)).toBe('Tablet danach')
    expect(handy.meta(ID)?.konflikt?.art).toBe('geloescht-geaendert')
    expect(handy.meta(ID)?.endgueltig).toBeUndefined()
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
  })
})

describe('Änderung nach dem Löschzeitpunkt → Konflikt', () => {
  it('anderes Gerät hat nach dem Löschen noch geändert: nicht still löschen, Konflikt melden', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.bearbeite(wep(ID, 'Tablet nach dem Löschen')) // Tablet kennt die Löschung noch nicht

    const e = await tablet.sync()
    expect(e.konflikte).toHaveLength(1)
    expect(e.konflikte[0].wepId).toBe(ID)
    expect(e.geloescht).toEqual([])
    expect(tablet.hat(ID)).toBe(true)
    expect(tablet.imKorb(ID)).toBe(false)
    expect(tablet.meta(ID)?.konflikt).toMatchObject({
      art: 'geloescht-geaendert',
      geloeschtWo: 'anderes-geraet',
      geraet: 'Handy',
    })
    // In OneDrive liegt wieder die geänderte Fassung, der Papierkorb ist leer
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(entpacke(drive.text(DATEI)).wep.formalien.kleingartenanlage).toBe('Tablet nach dem Löschen')

    // Das löschende Gerät bekommt das WEP zurück
    const e2 = await handy.sync()
    expect(e2.wiederhergestellt).toEqual([ID])
    expect(anlage(handy.lokal, ID)).toBe('Tablet nach dem Löschen')
  })

  it('geändert VOR dem Löschzeitpunkt: die Löschung gilt', async () => {
    const { handy, tablet } = await zweiGeraete()
    await tablet.bearbeite(wep(ID, 'Tablet vorher')) // offline, noch nicht abgeglichen
    await handy.loesche(ID)
    await handy.sync()

    const e = await tablet.sync()
    expect(e.konflikte).toEqual([])
    expect(e.geloescht).toEqual([ID])
    expect(tablet.imKorb(ID)).toBe(true)
    expect(tablet.lokal.korb.get(ID)?.wep.formalien.kleingartenanlage).toBe('Tablet vorher') // jüngere Fassung bleibt im Korb
  })

  it('hier offline gelöscht, auf dem anderen Gerät danach noch geändert: Konflikt, WEP bleibt', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    handy.online = false
    await handy.loesche(ID)
    await tablet.bearbeite(wep(ID, 'Tablet nach dem Löschen'))
    await tablet.sync()
    handy.online = true

    const e = await handy.sync()
    expect(e.konflikte).toHaveLength(1)
    expect(handy.hat(ID)).toBe(true)
    expect(handy.imKorb(ID)).toBe(false)
    expect(anlage(handy.lokal, ID)).toBe('Tablet nach dem Löschen')
    expect(handy.meta(ID)?.konflikt).toMatchObject({ art: 'geloescht-geaendert', geloeschtWo: 'hier', geraet: 'Tablet' })
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    expect(drive.namen('daten/papierkorb')).toEqual([])
  })

  it('hier offline gelöscht, anderswo nur VOR dem Löschen geändert: Löschung gilt, jüngste Fassung im Papierkorb', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await tablet.bearbeite(wep(ID, 'Tablet vorher'))
    await tablet.sync()
    handy.online = false
    await handy.loesche(ID)
    handy.online = true

    const e = await handy.sync()
    expect(e.konflikte).toEqual([])
    expect(handy.imKorb(ID)).toBe(true)
    expect(entpacke(drive.text(KORB)).wep.formalien.kleingartenanlage).toBe('Tablet vorher')
    expect(handy.lokal.korb.get(ID)?.wep.formalien.kleingartenanlage).toBe('Tablet vorher')
  })

  it('Entscheidung „Doch löschen“ beendet den Konflikt und löscht überall', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.bearbeite(wep(ID, 'Tablet nach dem Löschen'))
    await tablet.sync()
    await handy.sync()

    expect(await tablet.loeseKonflikt(ID, 'andere')).toEqual({})
    expect(tablet.imKorb(ID)).toBe(true)
    expect(tablet.meta(ID)?.konflikt).toBeUndefined()
    await tablet.sync()
    expect(drive.namen('daten')).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([`${ID}.json`])
    const e = await handy.sync()
    expect(e.geloescht).toEqual([ID])
    expect(handy.imKorb(ID)).toBe(true)
  })

  it('Entscheidung „WEP behalten“ löscht nur den Hinweis', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    await tablet.bearbeite(wep(ID, 'Tablet nach dem Löschen'))
    await tablet.sync()

    const r = await tablet.loeseKonflikt(ID, 'diese')
    expect(anlage(tablet.lokal, ID)).toBe('Tablet nach dem Löschen')
    expect(r?.wep?.id).toBe(ID)
    expect(tablet.meta(ID)?.konflikt).toBeUndefined()
    await tablet.sync()
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
  })

  it('neues WEP mit einer Nummer aus dem Papierkorb eines anderen Geräts bekommt eine neue Nummer', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.loesche(ID)
    await handy.sync()
    // Das Tablet kennt die Löschung nicht und legt (aus anderem Grund) offline ein WEP mit gleicher Nummer an
    tablet.lokal.weps.delete(ID)
    tablet.lokal.meta.delete(ID)
    await tablet.bearbeite(wep(ID, 'Ganz anderes WEP'))

    const e = await tablet.sync()
    expect(e.konflikte[0].text).toContain('2026-002')
    expect(anlage(tablet.lokal, '2026-002')).toBe('Ganz anderes WEP')
    expect(tablet.hat(ID)).toBe(false)
    expect(entpacke(drive.text(KORB)).wep.formalien.kleingartenanlage).toBe('Start') // gelöschtes WEP unangetastet
    expect(drive.namen('daten')).toEqual(['2026-002.json'])
  })
})

describe('Konflikte sichtbar machen', () => {
  async function konflikt() {
    const t = await zweiGeraete()
    await t.tablet.bearbeite(wep(ID, 'Tablet-Fassung'))
    await t.handy.bearbeite(wep(ID, 'Handy-Fassung'))
    await t.tablet.sync()
    const e = await t.handy.sync()
    expect(e.konflikte).toHaveLength(1)
    return t
  }

  it('merkt sich den Konflikt am WEP: neuere Fassung gilt, die andere ist gesichert', async () => {
    const { drive, handy } = await konflikt()
    const k = handy.meta(ID)?.konflikt
    expect(k).toMatchObject({ art: 'zwei-geraete', geraet: 'Tablet' })
    expect(k?.fassung?.formalien.kleingartenanlage).toBe('Tablet-Fassung')
    expect(k?.kopien).toHaveLength(1)
    expect(drive.namen('daten')).toContain(k?.kopien[0])
    expect(anlage(handy.lokal, ID)).toBe('Handy-Fassung')
  })

  it('auch auf der Seite, deren Fassung unterliegt, wird der Konflikt vermerkt', async () => {
    const { drive, handy, tablet } = await zweiGeraete()
    await handy.bearbeite(wep(ID, 'Handy alt'))
    await tablet.bearbeite(wep(ID, 'Tablet neu'))
    await tablet.sync()
    await handy.sync()
    expect(anlage(handy.lokal, ID)).toBe('Tablet neu')
    const k = handy.meta(ID)?.konflikt
    expect(k).toMatchObject({ art: 'zwei-geraete', geraet: 'Handy' })
    expect(k?.fassung?.formalien.kleingartenanlage).toBe('Handy alt')
    expect(drive.namen('daten').filter((n) => n.includes('.konflikt-'))).toHaveLength(1)
  })

  it('„Diese Fassung behalten“: Hinweis weg, Konflikt-Kopie wird beim Abgleich aufgeräumt', async () => {
    const { drive, handy, tablet } = await konflikt()
    const kopie = handy.meta(ID)?.konflikt?.kopien[0] as string

    const r = await handy.loeseKonflikt(ID, 'diese')
    expect(r?.wep?.formalien.kleingartenanlage).toBe('Handy-Fassung')
    expect(handy.meta(ID)?.konflikt).toBeUndefined()
    expect(handy.meta(ID)?.aufraeumen).toEqual([kopie])
    expect(drive.namen('daten')).toContain(kopie) // noch da, bis zum Abgleich

    await handy.sync()
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    expect(handy.meta(ID)?.aufraeumen).toBeUndefined()
    await tablet.sync()
    expect(anlage(tablet.lokal, ID)).toBe('Handy-Fassung')
    expect(tablet.meta(ID)?.konflikt).toBeUndefined()
  })

  it('Konflikt mit Fotos auf beiden Geräten: jede Entscheidung behält die Fotos beider Fassungen', async () => {
    const foto = (id: string) => ({ id, aufgenommenAm: '2026-10-20T10:00:00Z', breite: 10, hoehe: 10, groesse: 100 })
    for (const wahl of ['diese', 'andere'] as const) {
      const { handy, tablet } = await zweiGeraete()
      await tablet.bearbeite({ ...wep(ID, 'Tablet-Fassung'), fotos: [foto('t1')] })
      await handy.bearbeite({ ...wep(ID, 'Handy-Fassung'), fotos: [foto('h1'), foto('h2')] })
      await tablet.sync()
      await handy.sync()
      expect(handy.meta(ID)?.konflikt?.art).toBe('zwei-geraete')

      const r = await handy.loeseKonflikt(ID, wahl)
      const ids = (r?.wep?.fotos ?? []).map((f) => f.id).sort()
      expect(ids).toEqual(['h1', 'h2', 't1'])
      expect(r?.wep?.formalien.kleingartenanlage).toBe(wahl === 'diese' ? 'Handy-Fassung' : 'Tablet-Fassung')
      await handy.sync()
      await tablet.sync()
      expect((tablet.lokal.weps.get(ID)?.fotos ?? []).map((f) => f.id).sort()).toEqual(['h1', 'h2', 't1'])
    }
  })

  it('„Andere Fassung übernehmen“: die andere Fassung gilt jetzt überall, Kopie wird aufgeräumt', async () => {
    const { drive, handy, tablet } = await konflikt()
    handy.lokal.ereignisse = []

    const r = await handy.loeseKonflikt(ID, 'andere')
    expect(r?.wep?.formalien.kleingartenanlage).toBe('Tablet-Fassung')
    expect(anlage(handy.lokal, ID)).toBe('Tablet-Fassung')
    expect(handy.lokal.ereignisse).toContain(`geaendert ${ID}`) // geht in die Android-Warteschlange

    const e = await handy.sync()
    expect(e.hochgeladen).toEqual([ID])
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
    expect(entpacke(drive.text(DATEI)).wep.formalien.kleingartenanlage).toBe('Tablet-Fassung')
    await tablet.sync()
    expect(anlage(tablet.lokal, ID)).toBe('Tablet-Fassung')
    expect(tablet.meta(ID)?.konflikt).toBeUndefined()
  })

  it('ohne Konflikt passiert bei einer Entscheidung nichts', async () => {
    const { handy } = await zweiGeraete()
    expect(await handy.loeseKonflikt(ID, 'andere')).toBeUndefined()
    expect(anlage(handy.lokal, ID)).toBe('Start')
  })

  it('mehrere Konflikte hintereinander sammeln ihre Kopien, die Entscheidung räumt alle auf', async () => {
    const { drive, uhr, handy, tablet } = await konflikt()
    await tablet.sync() // übernimmt die Handy-Fassung
    uhr.vor(5)
    await tablet.bearbeite(wep(ID, 'Tablet zweite Änderung'))
    await handy.bearbeite(wep(ID, 'Handy zweite Änderung'))
    await tablet.sync()
    await handy.sync()
    expect(handy.meta(ID)?.konflikt?.kopien).toHaveLength(2)

    await handy.loeseKonflikt(ID, 'diese')
    await handy.sync()
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
  })

  it('beim Löschen bleibt ein offener Konflikt für später erhalten', async () => {
    const { handy } = await konflikt()
    await handy.loesche(ID)
    expect(handy.meta(ID)?.konflikt?.art).toBe('zwei-geraete')
    await handy.stelleWiederHer(ID)
    expect(handy.meta(ID)?.konflikt?.art).toBe('zwei-geraete')
  })
})

describe('Umstieg von der Beta-Regel „Löschen wird nicht synchronisiert“', () => {
  it('altes „gelöscht“-Merkmal: die Datei wandert in den Papierkorb, nichts wird zurückgeladen', async () => {
    const drive = new FakeDrive()
    const uhr = new Uhr()
    const tablet = new Geraet('Tablet', drive, uhr)
    await tablet.bearbeite(wep(ID, 'Altbestand'))
    await tablet.sync()
    const handy = new Geraet('Handy', drive, uhr)
    await handy.sync()
    // Zustand nach der Beta-Regel: WEP lokal weg, nur die Marke „geloescht“ bleibt, OneDrive unverändert
    handy.lokal.weps.delete(ID)
    handy.lokal.meta.set(ID, { ...handy.meta(ID)!, geloescht: true })

    const e = await handy.sync()
    expect(e.heruntergeladen).toEqual([])
    expect(e.fehler).toEqual([])
    expect(handy.hat(ID)).toBe(false)
    expect(handy.imKorb(ID)).toBe(true)
    expect(handy.lokal.korb.get(ID)?.wep.formalien.kleingartenanlage).toBe('Altbestand')
    expect(drive.namen('daten')).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([`${ID}.json`])

    // Das andere Gerät zieht jetzt nach – die Löschung gilt endlich überall
    await tablet.sync()
    expect(tablet.hat(ID)).toBe(false)
    expect(tablet.imKorb(ID)).toBe(true)
  })

  it('mit Löschzeitpunkt aus der Datenbank-Migration: 30 Tage ab Migration', async () => {
    const drive = new FakeDrive()
    const uhr = new Uhr()
    const handy = new Geraet('Handy', drive, uhr)
    await handy.bearbeite(wep(ID, 'Altbestand'))
    await handy.sync()
    handy.lokal.weps.delete(ID)
    const migriert = uhr.vor(10)
    handy.lokal.meta.set(ID, { ...handy.meta(ID)!, geloescht: true, geloeschtAm: migriert })

    await handy.sync()
    expect(handy.lokal.korb.get(ID)?.geloeschtAm).toBe(migriert)
    expect(entpacke(drive.text(KORB)).geloeschtAm).toBe(migriert)
  })

  it('altes „gelöscht“-Merkmal ohne Datei in OneDrive wird verworfen', async () => {
    const drive = new FakeDrive()
    const handy = new Geraet('Handy', drive, new Uhr())
    handy.lokal.meta.set(ID, { id: ID, lokalGeaendertAm: '2026-10-01T00:00:00.000Z', geloescht: true })
    await handy.sync()
    expect(handy.lokal.meta.has(ID)).toBe(false)
    expect(handy.imKorb(ID)).toBe(false)
  })
})

describe('Weitere Absicherungen', () => {
  it('ein Fehler bei einem WEP lässt die anderen weiter abgleichen', async () => {
    const { drive, handy } = await zweiGeraete()
    drive.lege('daten/2026-009.json', 'kaputt')
    drive.lege('daten/papierkorb/2026-008.json', 'auch kaputt')
    await handy.bearbeite(wep('2026-002', 'B'))
    const e = await handy.sync()
    expect(e.hochgeladen).toEqual(['2026-002'])
    expect(e.fehler.map((f) => f.wepId).sort()).toEqual(['2026-008', '2026-009'])
  })

  it('FakeLokal-Speicher bleibt über alle Abläufe konsistent: nie ein WEP gleichzeitig aktiv und im Papierkorb', async () => {
    const { handy, tablet } = await zweiGeraete()
    const pruefe = (l: FakeLokal) => {
      for (const id of l.weps.keys()) expect(l.korb.has(id)).toBe(false)
    }
    await handy.loesche(ID)
    await handy.sync()
    await tablet.sync()
    pruefe(handy.lokal)
    pruefe(tablet.lokal)
    await tablet.stelleWiederHer(ID)
    await tablet.sync()
    await handy.sync()
    pruefe(handy.lokal)
    pruefe(tablet.lokal)
  })
})
