import { beforeEach, describe, expect, it } from 'vitest'
import {
  aendereEigenePosition,
  aktiveEigene,
  loescheEigenePosition,
  merkeEigenePosition,
  type EigeneSpeicher,
  type EigeneStand,
} from '@/katalog'
import { FakeDrive } from './fakeDrive'
import { synchronisiereEigenePositionen } from './eigenePositionen'

function speicher(): EigeneSpeicher & { stand: EigeneStand } {
  const s = {
    stand: { eintraege: [] } as EigeneStand,
    lade: () => structuredClone(s.stand),
    speichere: (n: EigeneStand) => void (s.stand = structuredClone(n)),
  }
  return s
}

let uhr = 0
const jetzt = () => new Date(Date.UTC(2026, 9, 20, 13, 0, ++uhr)).toISOString()

/** Ein Gerät mit eigenem Speicher, das gegen ein gemeinsames FakeDrive abgleicht. */
function geraet(drive: FakeDrive, name: string) {
  const sp = speicher()
  return {
    sp,
    merke: (bezeichnung: string, einzelpreis?: number, abschnitt: 'aussenanlagen' | 'aufwuchs' = 'aufwuchs') =>
      merkeEigenePosition({ abschnitt, bezeichnung, einheit: 'Stück', einzelpreis }, sp, jetzt),
    aendere: (id: string, teil: Parameters<typeof aendereEigenePosition>[1]) => aendereEigenePosition(id, teil, sp, jetzt),
    loesche: (id: string) => loescheEigenePosition(id, sp, jetzt),
    sync: () => synchronisiereEigenePositionen({ client: drive.client('daten'), speicher: sp, geraet: name, jetzt }),
    namen: () => aktiveEigene(sp.stand.eintraege).map((e) => e.bezeichnung).sort(),
    id: (bezeichnung: string) => sp.stand.eintraege.find((e) => e.bezeichnung === bezeichnung)!.id,
  }
}

describe('Abgleich eigener Positionen (daten/eigene-positionen.json)', () => {
  let drive: FakeDrive
  beforeEach(() => {
    drive = new FakeDrive()
  })

  it('nichts gemerkt und nichts in OneDrive: nichts passiert', async () => {
    const a = geraet(drive, 'Handy')
    expect(await a.sync()).toBe('unveraendert')
    expect(drive.namen('daten')).toEqual([])
  })

  it('lädt hoch; ein zweiter Abgleich lässt alles in Ruhe', async () => {
    const a = geraet(drive, 'Handy')
    a.merke('Zaubernuss', 40)
    expect(await a.sync()).toBe('hochgeladen')
    const datei = JSON.parse(drive.text('daten/eigene-positionen.json'))
    expect(datei.format).toBe('wep-eigene-positionen/1')
    expect(datei.eintraege).toHaveLength(1)

    drive.aufrufe = []
    expect(await a.sync()).toBe('unveraendert')
    expect(drive.aufrufe).toEqual(['liste daten'])
  })

  it('zweites Gerät bekommt die Positionen, auch Änderungen und Preise', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    a.merke('Zaubernuss', 40)
    a.merke('Hochbeet', 25, 'aussenanlagen')
    await a.sync()

    expect(await b.sync()).toBe('geladen')
    expect(b.namen()).toEqual(['Hochbeet', 'Zaubernuss'])
    expect(b.sp.stand.eintraege.find((e) => e.bezeichnung === 'Hochbeet')).toMatchObject({ abschnitt: 'aussenanlagen', einzelpreis: 25 })

    b.aendere(b.id('Zaubernuss'), { einzelpreis: 55 })
    expect(await b.sync()).toBe('hochgeladen')
    expect(await a.sync()).toBe('geladen')
    expect(a.sp.stand.eintraege.find((e) => e.bezeichnung === 'Zaubernuss')?.einzelpreis).toBe(55)
  })

  it('beide Geräte merken Verschiedenes: danach hat jedes alles', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    await a.sync()
    a.merke('Zaubernuss')
    b.merke('Hochbeet')
    expect(await a.sync()).toBe('hochgeladen')
    expect(await b.sync()).toBe('beides') // lädt Zaubernuss, lädt Hochbeet hoch
    expect(await a.sync()).toBe('geladen')
    expect(a.namen()).toEqual(['Hochbeet', 'Zaubernuss'])
    expect(b.namen()).toEqual(['Hochbeet', 'Zaubernuss'])
    expect(await b.sync()).toBe('unveraendert')
  })

  it('dieselbe Position, je Eintrag gewinnt die neuere Änderung', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    a.merke('Zaubernuss', 40)
    await a.sync()
    await b.sync()

    a.aendere(a.id('Zaubernuss'), { einzelpreis: 50 })
    b.aendere(b.id('Zaubernuss'), { einzelpreis: 60 }) // später → gewinnt
    await a.sync()
    await b.sync()
    await a.sync()
    expect(a.sp.stand.eintraege[0].einzelpreis).toBe(60)
    expect(b.sp.stand.eintraege[0].einzelpreis).toBe(60)
  })

  it('Änderungen an verschiedenen Einträgen gehen nicht verloren', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    a.merke('Zaubernuss', 40)
    a.merke('Hochbeet', 25)
    await a.sync()
    await b.sync()

    a.aendere(a.id('Zaubernuss'), { einzelpreis: 41 })
    b.aendere(b.id('Hochbeet'), { einzelpreis: 26 })
    await a.sync()
    await b.sync()
    await a.sync()
    for (const g of [a, b]) {
      const preis = (n: string) => g.sp.stand.eintraege.find((e) => e.bezeichnung === n)?.einzelpreis
      expect([preis('Zaubernuss'), preis('Hochbeet')]).toEqual([41, 26])
    }
  })

  it('gelöschte Einträge bleiben gelöscht – auch gegen eine ältere Fassung auf einem Gerät', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    a.merke('Zaubernuss', 40)
    a.merke('Hochbeet', 25)
    await a.sync()
    await b.sync()

    // Handy löscht; Tablet ändert den Eintrag früher (offline) und gleicht erst danach ab
    b.aendere(b.id('Zaubernuss'), { einzelpreis: 41 })
    a.loesche(a.id('Zaubernuss'))
    await a.sync()
    expect(drive.text('daten/eigene-positionen.json')).toContain('"geloescht": true')

    await b.sync() // Löschung ist neuer als die Änderung → bleibt gelöscht
    expect(b.namen()).toEqual(['Hochbeet'])
    await a.sync()
    expect(a.namen()).toEqual(['Hochbeet'])

    // Auch ein Gerät, das nie abgeglichen hat und den alten Stand hochlädt, bringt ihn nicht zurück
    const c = geraet(drive, 'Windows')
    await c.sync()
    expect(c.namen()).toEqual(['Hochbeet'])
    expect(await c.sync()).toBe('unveraendert')
  })

  it('Änderung nach der Löschung (anderes Gerät) bringt den Eintrag zurück – die neuere Änderung gewinnt', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    a.merke('Zaubernuss', 40)
    await a.sync()
    await b.sync()
    a.loesche(a.id('Zaubernuss'))
    await a.sync()
    b.aendere(b.id('Zaubernuss'), { einzelpreis: 99 }) // nach der Löschung
    await b.sync()
    await a.sync()
    expect(a.namen()).toEqual(['Zaubernuss'])
    expect(b.namen()).toEqual(['Zaubernuss'])
  })

  it('überschreibt ein anderes Gerät die Datei, heilt der nächste Abgleich', async () => {
    const a = geraet(drive, 'Handy')
    const b = geraet(drive, 'Tablet')
    await a.sync()
    await b.sync()
    a.merke('Zaubernuss')
    b.merke('Hochbeet')
    // Beide haben "gleichzeitig" die leere Datei gelesen; B schreibt zuletzt und überschreibt A
    await a.sync()
    drive.lege('daten/eigene-positionen.json', JSON.stringify({ format: 'wep-eigene-positionen/1', geaendertAm: jetzt(), geraet: 'Tablet', eintraege: b.sp.stand.eintraege }))
    await a.sync() // sieht fremde Datei, fügt zusammen und lädt das Ganze hoch
    expect(a.namen()).toEqual(['Hochbeet', 'Zaubernuss'])
    await b.sync()
    expect(b.namen()).toEqual(['Hochbeet', 'Zaubernuss'])
  })

  it('beschädigte Datei in OneDrive: Fehler, lokale Daten bleiben unangetastet', async () => {
    const a = geraet(drive, 'Handy')
    a.merke('Zaubernuss')
    drive.lege('daten/eigene-positionen.json', '{"quatsch":1}')
    await expect(a.sync()).rejects.toThrow(/Format/)
    expect(a.namen()).toEqual(['Zaubernuss'])
    expect(a.sp.stand.wartet).toBe(true)
  })

  it('die Datei wird vom WEP-Abgleich nicht als WEP angesehen', async () => {
    const { wepIdAusName } = await import('./engine')
    expect(wepIdAusName('eigene-positionen.json')).toBeNull()
  })
})
