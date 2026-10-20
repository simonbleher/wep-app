// Bau-Excel und OneDrive (Beta 3, Paket 5): Abgleich zweier Geräte über ein gemeinsames FakeDrive,
// „nur WLAN“, Austauschen, Entfernen, Papierkorb (Wiederherstellen, endgültig löschen) und Konflikt –
// dieselben Regeln wie für die Fotos. Die Bau-Excel ist eine Test-Datei aus der Vorlage mit erfundenen Werten.
import { beforeAll, describe, expect, it } from 'vitest'
import { bauExcelFuerExport, leseHinterlegteFormalien } from '@/bauexcel'
import { erzeugeTestBauExcel, TEST_FORMALIEN } from '@/bauexcel/testBauExcel'
import { inhaltsKennung } from '@/bauexcel/kennung'
import { exportWep } from '@/export'
import { synchronisiereBauExcel, offeneBauExcel } from './bauExcel'
import { FakeDrive } from './fakeDrive'
import { Geraet, Uhr, wep } from './testHilfen'

const ID = '2026-001'
const D = 'daten/bau'
const P = 'daten/papierkorb/bau'
const DATEI = `${ID}.xlsx`

let altBytes: Uint8Array
let neuBytes: Uint8Array
beforeAll(async () => {
  altBytes = await erzeugeTestBauExcel()
  neuBytes = await erzeugeTestBauExcel({ werte: { ...TEST_FORMALIEN, E4: 'Parzelle 17' } })
})

async function inhalt(drive: FakeDrive, pfad: string): Promise<Uint8Array> {
  return new Uint8Array(await (drive.dateien.get(pfad)?.inhalt as Blob).arrayBuffer())
}

/** Handy mit WEP 2026-001; Tablet ist abgeglichen und leer. */
async function aufbau() {
  const drive = new FakeDrive()
  const uhr = new Uhr()
  const handy = new Geraet('Handy', drive, uhr)
  const tablet = new Geraet('Tablet', drive, uhr)
  await handy.bearbeite(wep(ID, 'Anlage'))
  await handy.syncMitBau()
  await tablet.syncMitBau()
  drive.aufrufe = []
  return { drive, uhr, handy, tablet }
}

describe('Abgleich zweier Geräte', () => {
  it('lädt die Bau-Excel nach daten/bau/<Nr>.xlsx hoch und merkt sie als hochgeladen', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes, 'WEP Bau Testgarten.xlsx')
    expect(handy.bau.record(ID)).toMatchObject({ hatDatei: true, hochgeladen: false })

    const { bau } = await handy.syncMitBau()
    expect(bau.hochgeladen).toEqual([ID])
    expect(drive.namen(D)).toEqual([DATEI])
    expect(await inhalt(drive, `${D}/${DATEI}`)).toEqual(altBytes)
    expect(handy.bau.record(ID)?.hochgeladen).toBe(true)
    // Nur der Verweis steht in der WEP-Datei, nicht die Datei selbst
    const ref = JSON.parse(drive.text(`daten/${ID}.json`)).wep.bauExcel
    expect(ref).toMatchObject({ name: 'WEP Bau Testgarten.xlsx', groesse: altBytes.length, version: await inhaltsKennung(altBytes) })
    expect(drive.namen('daten')).toEqual([`${ID}.json`])
  })

  it('das zweite Gerät bekommt den Verweis und lädt die Datei beim Öffnen nach', async () => {
    const { handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()

    expect(tablet.lokal.weps.get(ID)?.bauExcel?.name).toBe('Bau.xlsx')
    expect(tablet.bau.dateien.has(ID)).toBe(false) // nicht automatisch auf jedes Gerät

    expect(await tablet.ladeBauExcel(ID)).toBe('geladen')
    expect(new Uint8Array(await tablet.bau.dateien.get(ID)!.arrayBuffer())).toEqual(altBytes)
    expect(tablet.bau.record(ID)).toMatchObject({ hatDatei: true, hochgeladen: true })
    expect(await tablet.ladeBauExcel(ID)).toBe('vorhanden')
  })

  it('ein weiterer Abgleich ändert nichts (keine Uploads, keine Verschiebungen)', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    await tablet.ladeBauExcel(ID)
    drive.aufrufe = []
    const a = await handy.syncMitBau()
    const b = await tablet.syncMitBau()
    expect(a.bau).toMatchObject({ hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0 })
    expect(b.bau).toMatchObject({ hochgeladen: [], verschoben: 0, geloescht: 0, aufgeschoben: 0 })
    expect(drive.aufrufe.filter((x) => /^(schreibe|verschiebe|loesche)/.test(x))).toEqual([])
  })

  it('„nur WLAN“: im Mobilfunk bleibt die Datei offen und zählt in der Upload-Anzeige', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    handy.wlan = false
    const { bau } = await handy.syncMitBau()
    expect(bau).toMatchObject({ hochgeladen: [], aufgeschoben: 1 })
    expect(drive.namen(D)).toEqual([])
    // Die WEP-Datei mit dem Verweis geht trotzdem hoch
    expect(JSON.parse(drive.text(`daten/${ID}.json`)).wep.bauExcel).toBeTruthy()
    expect(offeneBauExcel(await handy.bau.alleRecords(), new Set([ID]))).toBe(1)

    handy.wlan = true
    expect((await handy.syncMitBau()).bau.hochgeladen).toEqual([ID])
    expect(offeneBauExcel(await handy.bau.alleRecords(), new Set([ID]))).toBe(0)
  })

  it('ohne Netz wirft der Abgleich; nichts geht verloren, der nächste holt es nach', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    handy.online = false
    await expect(handy.syncMitBau()).rejects.toThrow()
    expect(handy.bau.record(ID)).toMatchObject({ hatDatei: true, hochgeladen: false })
    handy.online = true
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([DATEI])
  })
})

describe('Austauschen', () => {
  it('überschreibt die Datei in OneDrive (immer genau eine je WEP) und gleicht neu ab', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    await tablet.ladeBauExcel(ID)

    // Die alte Fassung war schon abgeglichen; die neue muss es wieder werden
    const w = structuredClone(handy.lokal.weps.get(ID)!)
    w.bauExcel!.abgeglichen = true
    await handy.bearbeite(w)

    const erg = await handy.waehleBauExcel(ID, neuBytes, 'Bau neu.xlsx')
    expect(erg).toMatchObject({ ersetzt: true, unveraendert: false })
    expect(handy.lokal.weps.get(ID)?.bauExcel).toMatchObject({ name: 'Bau neu.xlsx' })
    expect(handy.lokal.weps.get(ID)?.bauExcel).not.toHaveProperty('abgeglichen')
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([DATEI])
    expect(await inhalt(drive, `${D}/${DATEI}`)).toEqual(neuBytes)

    // Das Tablet hat noch die alte Fassung: sie wird nicht hochgeladen, die neue wird geladen
    await tablet.syncMitBau()
    expect(tablet.bau.record(ID)?.version).not.toBe(tablet.lokal.weps.get(ID)?.bauExcel?.version)
    expect((await tablet.syncMitBau()).bau.hochgeladen).toEqual([])
    expect(await tablet.ladeBauExcel(ID)).toBe('geladen')
    expect(new Uint8Array(await tablet.bau.dateien.get(ID)!.arrayBuffer())).toEqual(neuBytes)
    expect(await inhalt(drive, `${D}/${DATEI}`)).toEqual(neuBytes)
  })

  it('dieselbe Datei noch einmal wählen ändert nichts', async () => {
    const { handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    const vorher = handy.lokal.weps.get(ID)!.bauExcel
    expect(await handy.waehleBauExcel(ID, altBytes)).toMatchObject({ unveraendert: true })
    expect(handy.lokal.weps.get(ID)!.bauExcel).toEqual(vorher)
  })

  it('das andere Gerät sieht „veraltet“, solange die neue Fassung noch nicht in OneDrive liegt', async () => {
    const { handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()

    await handy.waehleBauExcel(ID, neuBytes)
    handy.wlan = false
    await handy.syncMitBau() // WEP-Datei mit neuer Kennung geht hoch, die Datei wartet auf WLAN
    await tablet.syncMitBau()
    expect(await tablet.ladeBauExcel(ID)).toBe('veraltet') // OneDrive hat noch die alte Fassung
    expect(tablet.bau.dateien.has(ID)).toBe(false)

    handy.wlan = true
    await handy.syncMitBau()
    expect(await tablet.ladeBauExcel(ID)).toBe('geladen')
  })

  it('ohne erreichbare Datei verweigert der Export die stille leere Vorlage', async () => {
    const { handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    const w = tablet.lokal.weps.get(ID)!
    await expect(
      bauExcelFuerExport({ wep: w, quelle: { hole: async () => undefined }, werkzeuge: { ablage: tablet.bau } }),
    ).rejects.toThrow(/liegt noch nicht auf diesem Gerät/)
  })
})

describe('Export nimmt die gemerkte Bau-Excel', () => {
  it('lokal gemerkt: die Formalien der Bau-Excel stehen im Export, ohne dass sie noch einmal gewählt wird', async () => {
    const { handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    const w = handy.lokal.weps.get(ID)!
    const bytes = await bauExcelFuerExport({ wep: w, quelle: { hole: async () => undefined }, werkzeuge: { ablage: handy.bau } })
    expect(bytes).toBeDefined()
    const r = await exportWep(w, bytes!)
    const f = await leseHinterlegteFormalien(w, { ablage: handy.bau })
    expect(f?.parzelle).toBe('Parzelle 42')
    expect(r.konflikte.map((k) => k.feld)).toContain('kleingartenanlage') // das WEP hat noch „Anlage“, nicht abgeglichen
  })

  it('auf dem zweiten Gerät wird sie beim Export aus OneDrive geholt', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    const w = tablet.lokal.weps.get(ID)!
    const bytes = await bauExcelFuerExport({
      wep: w,
      quelle: { hole: (id) => drive.client(D).ladeBlob(`${id}.xlsx`) },
      werkzeuge: { ablage: tablet.bau },
    })
    expect(new Uint8Array(bytes!)).toEqual(altBytes)
    expect(tablet.bau.record(ID)?.hatDatei).toBe(true)
  })

  it('ohne Bau-Excel am WEP: undefined (der Export nimmt die leere Vorlage)', async () => {
    const { handy } = await aufbau()
    expect(await bauExcelFuerExport({ wep: handy.lokal.weps.get(ID)!, quelle: { hole: async () => undefined } })).toBeUndefined()
  })
})

describe('Entfernen', () => {
  it('die Datei in OneDrive geht erst weg, wenn die WEP-Datei ohne Verweis dort angekommen ist', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()

    await handy.entferneBauExcel(ID)
    expect(handy.lokal.weps.get(ID)?.bauExcel).toBeUndefined()
    expect(handy.bau.record(ID)).toMatchObject({ geloescht: expect.any(String), hatDatei: false })
    expect(offeneBauExcel(await handy.bau.alleRecords(), new Set([ID]))).toBe(1)

    // Nur der Bau-Excel-Schritt, ohne dass die WEP-Datei hochgegangen ist: nichts wird gelöscht
    await synchronisiereBauExcel({
      daten: drive.client(D),
      papierkorb: drive.client(P),
      lokal: handy.lokal,
      bau: handy.bau,
      aufraeumen: handy.bauAufraeumen,
      uploadErlaubt: async () => true,
    })
    expect(drive.namen(D)).toEqual([DATEI])

    const { bau } = await handy.syncMitBau()
    expect(bau.geloescht).toBe(1)
    expect(drive.namen(D)).toEqual([])
    expect(handy.bau.record(ID)).toBeUndefined()
    expect(JSON.parse(drive.text(`daten/${ID}.json`)).wep.bauExcel).toBeUndefined()
  })

  it('eine nie hochgeladene Bau-Excel ist einfach weg (nichts in OneDrive)', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.entferneBauExcel(ID)
    expect(handy.bau.record(ID)).toBeUndefined()
    expect((await handy.syncMitBau()).bau).toMatchObject({ hochgeladen: [], geloescht: 0 })
    expect(drive.namen(D)).toEqual([])
  })

  it('das andere Gerät räumt seine Kopie auf, löscht aber nichts in OneDrive', async () => {
    const { drive, uhr, handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    await tablet.ladeBauExcel(ID)
    await handy.entferneBauExcel(ID)
    await handy.syncMitBau()

    uhr.vor(120)
    const { bau } = await tablet.syncMitBau()
    expect(tablet.lokal.weps.get(ID)?.bauExcel).toBeUndefined()
    expect(bau.geloescht).toBe(0)
    expect(tablet.bau.record(ID)).toBeUndefined()
    expect(drive.namen(D)).toEqual([])
  })

  it('bei offenem Konflikt bleibt die Datei in OneDrive liegen', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await handy.entferneBauExcel(ID)
    const m = handy.meta(ID)!
    handy.lokal.meta.set(ID, { ...m, konflikt: { art: 'zwei-geraete', erkanntAm: 'x', geraet: 'Tablet', kopien: [] } })
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([DATEI])
    expect(handy.bau.record(ID)?.geloescht).toBeTruthy()
  })
})

describe('Konflikt', () => {
  /** Das Handy hängt eine Bau-Excel an, das Tablet ändert das WEP und ist zuerst in OneDrive. */
  async function konflikt() {
    const r = await aufbau()
    await r.handy.waehleBauExcel(ID, altBytes)
    const w = structuredClone(r.tablet.lokal.weps.get(ID)!)
    w.formalien.parzelle = 'Parzelle 99'
    await r.tablet.bearbeite(w)
    await r.tablet.syncMitBau()
    const { wep: e } = await r.handy.syncMitBau()
    expect(e.konflikte).toHaveLength(1)
    return r
  }

  it('bei offenem Konflikt wird nichts hochgeladen und die lokale Datei bleibt, auch nach Stunden', async () => {
    const { drive, uhr, handy } = await konflikt()
    expect(drive.namen(D)).toEqual([])
    uhr.vor(300)
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([])
    expect(handy.bau.record(ID)).toMatchObject({ hatDatei: true, hochgeladen: false }) // in der anderen Fassung referenziert
  })

  it('wird die Fassung mit der Bau-Excel gewählt, geht die Datei hoch', async () => {
    const { drive, handy } = await konflikt()
    await handy.loeseKonflikt(ID, 'andere')
    expect(handy.lokal.weps.get(ID)?.bauExcel?.name).toBe('Bau.xlsx')
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([DATEI])
    expect(await inhalt(drive, `${D}/${DATEI}`)).toEqual(altBytes)
  })

  it('wird die Fassung ohne Bau-Excel gewählt, räumt das Gerät seine Kopie später auf – ohne OneDrive anzufassen', async () => {
    const { drive, uhr, handy } = await konflikt()
    await handy.loeseKonflikt(ID, 'diese')
    uhr.vor(120)
    await handy.syncMitBau()
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([])
    expect(handy.bau.record(ID)).toBeUndefined()
  })
})

describe('Papierkorb', () => {
  it('ein gelöschtes WEP nimmt seine Bau-Excel mit; Wiederherstellen bringt sie zurück', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()

    await handy.loesche(ID)
    const { bau } = await handy.syncMitBau()
    expect(bau.verschoben).toBe(1)
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual([DATEI])
    expect(await inhalt(drive, `${P}/${DATEI}`)).toEqual(altBytes)
    expect(handy.bau.record(ID)?.hatDatei).toBe(true) // lokal bleibt sie für „Wiederherstellen“

    await tablet.syncMitBau()
    expect(tablet.imKorb(ID)).toBe(true)

    await handy.stelleWiederHer(ID)
    await handy.syncMitBau()
    expect(drive.namen(P)).toEqual([])
    expect(drive.namen(D)).toEqual([DATEI])
    expect(handy.lokal.weps.get(ID)?.bauExcel).toBeTruthy()

    await tablet.syncMitBau()
    expect(tablet.hat(ID)).toBe(true)
    expect(await tablet.ladeBauExcel(ID)).toBe('geladen')
  })

  it('noch nicht hochgeladen: sie geht direkt in den Papierkorb-Ordner, nie nach daten/bau/', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.loesche(ID)
    const { bau } = await handy.syncMitBau()
    expect(bau.hochgeladen).toEqual([ID])
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual([DATEI])
  })

  it('Datei, die ein Hintergrund-Upload noch nach daten/bau/ gelegt hat, zieht ebenfalls mit um', async () => {
    const { drive, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await handy.loesche(ID)
    drive.lege(`${D}/${DATEI}`, new Blob(['nachzuegler'])) // dieselbe Datei erneut in daten/bau/
    await handy.syncMitBau()
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual([DATEI])
  })

  it('endgültig löschen entfernt beide Ordner und die lokalen Dateien (auch auf dem anderen Gerät)', async () => {
    const { drive, handy, tablet } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    await tablet.ladeBauExcel(ID)
    await handy.loesche(ID)
    await handy.syncMitBau()
    await tablet.syncMitBau()
    expect(tablet.imKorb(ID)).toBe(true)
    drive.lege(`${D}/${DATEI}`, new Blob(['rest'])) // Rest in beiden Ordnern

    // Wie aktionen.ts: lokal sofort weg, die Nummer wird für den Abgleich vorgemerkt
    await handy.loescheEndgueltig(ID)
    await handy.bau.entferne(ID)
    handy.bauAufraeumen.speichere([ID])
    const { bau } = await handy.syncMitBau()
    expect(bau.geloescht).toBe(2)
    expect(drive.namen(D)).toEqual([])
    expect(drive.namen(P)).toEqual([])
    expect(handy.bauAufraeumen.ids).toEqual([])

    await tablet.syncMitBau()
    expect(tablet.hat(ID) || tablet.imKorb(ID)).toBe(false)
    expect(tablet.bau.record(ID)).toBeUndefined()
  })

  it('nach 30 Tagen im Papierkorb räumt der Abgleich die Bau-Excel in OneDrive auf', async () => {
    const { drive, uhr, handy } = await aufbau()
    await handy.waehleBauExcel(ID, altBytes)
    await handy.syncMitBau()
    await handy.loesche(ID)
    await handy.syncMitBau()
    uhr.tage(31)
    await handy.syncMitBau() // merkt die Nummer vor, WEP-Abgleich räumt auf
    expect(drive.namen(P)).toEqual([])
    expect(drive.namen(D)).toEqual([])
  })
})
