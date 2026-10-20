// Fotos und OneDrive (Beta 3, Paket 4): Abgleich zweier Geräte über ein gemeinsames FakeDrive,
// „nur WLAN“, Löschen, Papierkorb mit Fotos (Wiederherstellen, endgültig löschen) und das
// Nachladen auf dem zweiten Gerät.
import { describe, expect, it } from 'vitest'
import { ladeFehlendeFotos, loeseFotosVonPosition } from '@/fotos'
import { neuerWep } from '@/model'
import { FakeDrive } from './fakeDrive'
import { FakeLokal, Geraet, Uhr, wep } from './testHilfen'

const ID = '2026-001'
const D = `daten/fotos/${ID}`
const P = `daten/papierkorb/fotos/${ID}`

/** Handy mit WEP 2026-001 (Position „Apfelbaum“), Tablet ist abgeglichen und leer. */
async function aufbau() {
  const drive = new FakeDrive()
  const uhr = new Uhr()
  const handy = new Geraet('Handy', drive, uhr)
  const tablet = new Geraet('Tablet', drive, uhr)
  const w = wep(ID, 'Anlage')
  w.gruen.aufwuchs.push({
    id: 'p-apfel',
    bezeichnung: 'Apfelbaum',
    anzahl: 1,
    einheit: 'Stück',
    einzelpreis: 10,
    preisManuell: false,
    hinweise: [],
  })
  await handy.bearbeite(w)
  await handy.syncMitFotos()
  await tablet.syncMitFotos()
  drive.aufrufe = []
  return { drive, uhr, handy, tablet }
}

/** Holt die Fotos des WEP aus OneDrive auf das Gerät (wie das Öffnen des WEP). */
async function laden(g: Geraet) {
  const w = g.lokal.weps.get(ID) ?? g.lokal.korb.get(ID)?.wep
  return ladeFehlendeFotos({
    wep: w!,
    quelle: {
      async hole(wepId, fotoId) {
        for (const ordner of [D, P]) {
          try {
            return await g.drive.client(ordner.replace(ID, wepId)).ladeBlob(`${fotoId}.jpg`)
          } catch {
            /* nächster Ordner */
          }
        }
        return undefined
      },
    },
    werkzeuge: {
      ablage: g.fotos,
      jetzt: () => g.uhr.jetzt(),
      bild: {
        // Test: Vorschau = die Bytes selbst
        dekodiere: async () => ({ bild: null, breite: 10, hoehe: 10 }),
        leinwand: () => ({
          zeichner: { setTransform() {}, drawImage() {}, fillStyle: '', fillRect() {} },
          nachJpeg: async () => new Uint8Array([1, 2, 3]),
        }),
        dreheSelbst: async () => true,
      },
    },
  })
}

describe('Abgleich zweier Geräte', () => {
  it('lädt neue Fotos nach daten/fotos/<Nr>/ hoch und merkt sie als hochgeladen', async () => {
    const { drive, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins', 'p-apfel', 'Astbruch')
    await handy.neuesFoto(ID, 'f2', 'bild-zwei')
    const { fotos } = await handy.syncMitFotos()

    expect(fotos.hochgeladen.sort()).toEqual([`${ID}/f1`, `${ID}/f2`])
    expect(drive.namen(D)).toEqual(['f1.jpg', 'f2.jpg'])
    expect(await (drive.dateien.get(`${D}/f1.jpg`)?.inhalt as Blob).text()).toBe('bild-eins')
    expect(handy.fotos.record(ID, 'f1')?.hochgeladen).toBe(true)
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
  })

  it('das zweite Gerät bekommt das WEP samt Fotoangaben und lädt die Dateien beim Öffnen nach', async () => {
    const { handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins', 'p-apfel', 'Astbruch')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()

    const w = tablet.lokal.weps.get(ID)
    expect(w?.fotos).toEqual([expect.objectContaining({ id: 'f1', positionId: 'p-apfel', text: 'Astbruch' })])
    expect(tablet.fotos.hat(ID, 'f1')).toBe(false) // nicht alle Fotos auf jedes Gerät

    expect(await laden(tablet)).toEqual({ geladen: 1, fehlgeschlagen: 0 })
    expect(await tablet.fotos.dateien.get(`${ID}/f1`)?.text()).toBe('bild-eins')
    expect(tablet.fotos.record(ID, 'f1')).toMatchObject({ hatDatei: true, hochgeladen: true })
  })

  it('ein weiterer Abgleich ändert nichts (keine Uploads, keine Verschiebungen)', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await laden(tablet)
    drive.aufrufe = []
    const a = await handy.syncMitFotos()
    const b = await tablet.syncMitFotos()
    expect(a.fotos).toMatchObject({ hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0 })
    expect(b.fotos).toMatchObject({ hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0 })
    expect(drive.aufrufe.filter((x) => x.startsWith('schreibe') || x.startsWith('verschiebe') || x.startsWith('loesche'))).toEqual([])
  })

  it('Fotos beider Geräte kommen zusammen: jedes lädt nur seine eigenen hoch', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'h1', 'vom-handy')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await tablet.neuesFoto(ID, 't1', 'vom-tablet')
    await tablet.syncMitFotos()
    await handy.syncMitFotos()
    expect(drive.namen(D)).toEqual(['h1.jpg', 't1.jpg'])
    expect(handy.lokal.weps.get(ID)?.fotos?.map((f) => f.id)).toEqual(['h1', 't1'])
  })
})

describe('„Nur WLAN“', () => {
  it('im Mobilfunk bleiben Fotos offen, die WEP-Datei geht trotzdem hoch', async () => {
    const { drive, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    handy.wlan = false
    const { fotos } = await handy.syncMitFotos()
    expect(fotos.hochgeladen).toEqual([])
    expect(fotos.aufgeschoben).toBe(1)
    expect(drive.namen(D)).toEqual([])
    expect(JSON.parse(drive.text(`daten/${ID}.json`)).wep.fotos).toHaveLength(1)
    expect(handy.fotos.record(ID, 'f1')?.hochgeladen).toBe(false)

    handy.wlan = true
    const spaeter = await handy.syncMitFotos()
    expect(spaeter.fotos.hochgeladen).toEqual([`${ID}/f1`])
    expect(drive.namen(D)).toEqual(['f1.jpg'])
  })
})

describe('Foto löschen', () => {
  it('entfernt das Foto auf beiden Geräten und in OneDrive – nach dem Abgleich der WEP-Datei', async () => {
    const { drive, uhr, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.neuesFoto(ID, 'f2', 'bild-zwei')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await laden(tablet)

    await handy.loescheFoto(ID, 'f1')
    expect(handy.fotos.record(ID, 'f1')).toMatchObject({ geloescht: expect.any(String), hatDatei: false })
    expect(drive.namen(D)).toEqual(['f1.jpg', 'f2.jpg']) // noch nicht abgeglichen

    await handy.syncMitFotos()
    expect(drive.namen(D)).toEqual(['f2.jpg'])
    expect(handy.fotos.record(ID, 'f1')).toBeUndefined()
    expect(JSON.parse(drive.text(`daten/${ID}.json`)).wep.fotos.map((f: { id: string }) => f.id)).toEqual(['f2'])

    // Tablet: Verweis weg; die lokale Kopie verschwindet, sobald sie nicht mehr „frisch“ ist
    uhr.vor(120)
    await tablet.syncMitFotos()
    expect(tablet.lokal.weps.get(ID)?.fotos?.map((f) => f.id)).toEqual(['f2'])
    expect(tablet.fotos.record(ID, 'f1')).toBeUndefined()
    expect(tablet.fotos.hat(ID, 'f2')).toBe(true)
  })

  it('ein Foto, das nie hochgeladen war, ist einfach weg (nichts in OneDrive)', async () => {
    const { drive, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.loescheFoto(ID, 'f1')
    expect(handy.fotos.record(ID, 'f1')).toBeUndefined()
    const { fotos } = await handy.syncMitFotos()
    expect(fotos).toMatchObject({ hochgeladen: [], geloescht: 0 })
    expect(drive.namen(D)).toEqual([])
  })

  it('bei offenem Konflikt bleibt die Datei in OneDrive liegen', async () => {
    const { drive, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await handy.loescheFoto(ID, 'f1')
    // Konflikt am WEP (andere Fassung kennt das Foto noch)
    const m = handy.meta(ID)!
    handy.lokal.meta.set(ID, { ...m, konflikt: { art: 'zwei-geraete', erkanntAm: 'x', geraet: 'Tablet', kopien: [] } })
    await handy.syncMitFotos()
    expect(drive.namen(D)).toEqual(['f1.jpg'])
    expect(handy.fotos.record(ID, 'f1')?.geloescht).toBeTruthy()
  })

  it('Position gelöscht: ihre Fotos bleiben und hängen am WEP allgemein', () => {
    const w = wep(ID, 'A')
    w.fotos = [
      { id: 'f1', positionId: 'p1', aufgenommenAm: 'a', breite: 1, hoehe: 1, groesse: 1 },
      { id: 'f2', positionId: 'p1', text: 'Rinde', aufgenommenAm: 'b', breite: 1, hoehe: 1, groesse: 1 },
      { id: 'f3', positionId: 'p2', aufgenommenAm: 'c', breite: 1, hoehe: 1, groesse: 1 },
    ]
    const neu = loeseFotosVonPosition(w, 'p1', 'Apfelbaum')
    expect(neu.fotos?.map((f) => [f.id, f.positionId, f.text])).toEqual([
      ['f1', undefined, 'Zu: Apfelbaum'],
      ['f2', undefined, 'Apfelbaum: Rinde'],
      ['f3', 'p2', undefined],
    ])
    expect(loeseFotosVonPosition(w, 'gibt-es-nicht', 'X')).toBe(w)
  })
})

describe('Papierkorb mit Fotos (Regeln aus Paket 2)', () => {
  it('Löschen nimmt die Fotos mit: daten/fotos/ → daten/papierkorb/fotos/, auch auf dem anderen Gerät', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.neuesFoto(ID, 'f2', 'bild-zwei')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await laden(tablet)

    await handy.loesche(ID)
    drive.aufrufe = []
    await handy.syncMitFotos()
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual(['f1.jpg', 'f2.jpg'])
    expect(drive.namen('daten/papierkorb')).toEqual([`${ID}.json`])
    expect(drive.aufrufe).toContain(`verschiebe ${D}/f1.jpg -> ${P}`)
    // die Dateien bleiben auf dem Gerät (Wiederherstellen bringt sie zurück)
    expect(handy.fotos.hat(ID, 'f1')).toBe(true)

    // Tablet: WEP wandert in den Papierkorb, die Fotos werden dort nicht wieder nach daten/fotos/ gelegt
    const e = await tablet.syncMitFotos()
    expect(e.wep.geloescht).toEqual([ID])
    expect(e.fotos).toMatchObject({ hochgeladen: [], verschoben: 0 })
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual(['f1.jpg', 'f2.jpg'])
  })

  it('Wiederherstellen bringt die Fotos zurück – auf allen Geräten', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await handy.loesche(ID)
    await handy.syncMitFotos()
    await tablet.syncMitFotos()

    expect((await tablet.stelleWiederHer(ID))?.id).toBe(ID)
    await tablet.syncMitFotos()
    expect(drive.namen(D)).toEqual(['f1.jpg'])
    expect(drive.namen(P)).toEqual([])
    expect(drive.namen('daten')).toContain(`${ID}.json`)

    await handy.syncMitFotos()
    expect(handy.hat(ID)).toBe(true)
    expect(handy.lokal.weps.get(ID)?.fotos?.map((f) => f.id)).toEqual(['f1'])
    expect(drive.namen(D)).toEqual(['f1.jpg'])
    expect(await laden(handy)).toMatchObject({ fehlgeschlagen: 0 })
  })

  it('ein noch nicht hochgeladenes Foto eines gelöschten WEP geht direkt in den Papierkorb-Ordner', async () => {
    const { drive, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.loesche(ID) // gelöscht, bevor das Foto in OneDrive war
    drive.aufrufe = []
    await handy.syncMitFotos()
    expect(drive.aufrufe.some((a) => a.startsWith(`schreibe ${D}/`))).toBe(false)
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual(['f1.jpg'])
    expect(handy.fotos.record(ID, 'f1')?.hochgeladen).toBe(true)
  })

  it('ein Foto, das noch in daten/fotos/ ankommt (laufender Upload), wird beim Abgleich nachgezogen', async () => {
    const { drive, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await handy.loesche(ID)
    await handy.syncMitFotos()
    // Hintergrunddienst hat während des Löschens noch hochgeladen
    drive.lege(`${D}/f9.jpg`, new Blob(['spaet']))
    await handy.syncMitFotos()
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual(['f1.jpg', 'f9.jpg'])
  })

  it('Endgültig löschen entfernt die Fotos in OneDrive und auf beiden Geräten', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await laden(tablet)
    await handy.loesche(ID)
    await handy.syncMitFotos()
    await tablet.syncMitFotos()

    expect(await handy.loescheEndgueltigMitFotos(ID)).toBe(true)
    expect(handy.fotos.records.size).toBe(0)
    await handy.syncMitFotos()
    expect(drive.namen(P)).toEqual([])
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(handy.aufraeumen.ids).toEqual([])

    const e = await tablet.syncMitFotos()
    expect(e.wep.bereinigt).toEqual([ID])
    expect(tablet.fotos.records.size).toBe(0)
    expect(tablet.aufraeumen.ids).toEqual([])
  })

  it('nach 30 Tagen im Papierkorb gehen die Fotos mit', async () => {
    const { drive, uhr, handy } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await handy.loesche(ID)
    await handy.syncMitFotos()
    expect(drive.namen(P)).toEqual(['f1.jpg'])

    uhr.tage(31)
    // die App räumt Abgelaufenes auf (aktionen.ts): lokale Fotos weg + Merkliste
    for (const id of await handy.raeumeAuf()) {
      for (const r of await handy.fotos.recordsVon(id)) await handy.fotos.entferne(id, r.id)
      handy.aufraeumen.speichere([...handy.aufraeumen.lade(), id])
    }
    await handy.syncMitFotos()
    expect(drive.namen(P)).toEqual([])
    expect(drive.namen('daten/papierkorb')).toEqual([])
    expect(handy.fotos.records.size).toBe(0)
  })

  it('Löschen auf dem einen, danach noch geändert auf dem anderen Gerät: nichts geht verloren', async () => {
    const { drive, uhr, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await laden(tablet)

    await handy.loesche(ID)
    await handy.syncMitFotos()
    uhr.vor(5)
    // Tablet ändert danach noch (neues Foto), ohne vom Löschen zu wissen
    await tablet.neuesFoto(ID, 't1', 'neu-vom-tablet')
    const e = await tablet.syncMitFotos()
    expect(e.wep.konflikte.length).toBe(1)
    expect(tablet.hat(ID)).toBe(true)
    // Das WEP lebt, die Fotos liegen wieder in daten/fotos/, nichts im Papierkorb-Ordner
    expect(drive.namen(D)).toEqual(['f1.jpg', 't1.jpg'])
    expect(drive.namen(P)).toEqual([])

    // „Doch löschen“ auf dem Tablet: wieder alles im Papierkorb
    await tablet.loeseKonflikt(ID, 'andere')
    await tablet.syncMitFotos()
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual(['f1.jpg', 't1.jpg'])
  })

  it('endgültig gelöscht, aber anderswo danach noch geändert: WEP und Fotos bleiben', async () => {
    const { drive, uhr, handy, tablet } = await aufbau()
    await handy.neuesFoto(ID, 'f1', 'bild-eins')
    await handy.syncMitFotos()
    await tablet.syncMitFotos()
    await laden(tablet)
    await handy.loesche(ID)
    await handy.syncMitFotos()

    // Tablet kennt das Löschen noch nicht und ändert das WEP
    uhr.vor(5)
    await tablet.neuesFoto(ID, 't1', 'neu-vom-tablet')
    // … währenddessen löscht das Handy endgültig
    expect(await handy.loescheEndgueltigMitFotos(ID)).toBe(true)
    await handy.syncMitFotos()
    expect(drive.namen(P)).toEqual([])

    // Das Tablet gleicht ab: Das geänderte WEP wird nicht verworfen, sondern neu hochgeladen
    await tablet.syncMitFotos()
    expect(tablet.hat(ID)).toBe(true)
    expect(tablet.fotos.hat(ID, 'f1')).toBe(true) // lokale Dateien nie ohne Not entfernt
    expect(tablet.fotos.hat(ID, 't1')).toBe(true)
    expect(drive.namen(D).sort()).toEqual(['f1.jpg', 't1.jpg'])
  })
})

describe('Umnummerieren', () => {
  it('die Fotos ziehen auf die neue Nummer um, die alte bleibt dem gelöschten WEP', async () => {
    const drive = new FakeDrive()
    const uhr = new Uhr()
    const handy = new Geraet('Handy', drive, uhr)
    const tablet = new Geraet('Tablet', drive, uhr)
    await handy.bearbeite(wep(ID, 'Original'))
    await handy.neuesFoto(ID, 'a1', 'altes-foto')
    await handy.syncMitFotos()
    await handy.loesche(ID)
    await handy.syncMitFotos()

    // Das Tablet kennt die Nummer nicht und legt offline ein eigenes WEP 2026-001 an
    const neu = neuerWep(ID)
    neu.formalien.kleingartenanlage = 'Neu am Tablet'
    await tablet.bearbeite(neu)
    await tablet.neuesFoto(ID, 'n1', 'neues-foto')
    const e = await tablet.syncMitFotos()
    expect(e.wep.umnummeriert).toEqual([{ von: ID, nach: '2026-002' }])
    expect(await tablet.fotos.recordsVon(ID)).toEqual([]) // alte Nummer aufgeräumt
    expect(tablet.fotos.hat('2026-002', 'n1')).toBe(true)
    expect(drive.namen('daten/fotos/2026-002')).toEqual(['n1.jpg'])
    // Das gelöschte WEP behält seine Fotos
    expect(drive.namen(P)).toEqual(['a1.jpg'])
    expect(drive.namen(D)).toEqual([])
  })
})

describe('Hilfsklassen', () => {
  it('FakeLokal bleibt unverändert nutzbar', () => {
    expect(new FakeLokal().weps.size).toBe(0)
  })
})
