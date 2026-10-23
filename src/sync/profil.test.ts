import { beforeEach, describe, expect, it } from 'vitest'
import { aendereProfil, LEERES_PROFIL, neuerWepMitProfil, type ProfilSpeicher, type ProfilStand } from '@/profil'
import { FakeDrive } from './fakeDrive'
import { synchronisiereProfil } from './profil'

function speicher(start: ProfilStand = { profil: { ...LEERES_PROFIL } }): ProfilSpeicher & { stand: ProfilStand } {
  const s = {
    stand: start,
    lade: () => structuredClone(s.stand),
    speichere: (n: ProfilStand) => void (s.stand = structuredClone(n)),
  }
  return s
}

let uhr = 0
const jetzt = () => new Date(Date.UTC(2026, 9, 20, 13, 0, ++uhr)).toISOString()

describe('Profil-Abgleich (daten/profil.json)', () => {
  let drive: FakeDrive
  beforeEach(() => {
    drive = new FakeDrive()
  })

  const abgleich = (sp: ProfilSpeicher, geraet = 'Gerät A') =>
    synchronisiereProfil({ client: drive.client('daten'), speicher: sp, geraet, jetzt })

  it('nie bearbeitet und nichts in OneDrive: nichts passiert', async () => {
    const sp = speicher()
    expect(await abgleich(sp)).toBe('unveraendert')
    expect(drive.namen('daten')).toEqual([])
  })

  it('lokale Änderung wird hochgeladen, ein zweiter Abgleich lässt alles in Ruhe', async () => {
    const sp = speicher()
    sp.stand = aendereProfil({ name: 'Erika Musterfrau', standardAnlage: 'KGA Musterwiese' }, sp, jetzt)

    expect(await abgleich(sp)).toBe('hochgeladen')
    const datei = JSON.parse(drive.dateien.get('daten/profil.json')?.inhalt as string)
    expect(datei.format).toBe('wep-profil/1')
    expect(datei.profil.name).toBe('Erika Musterfrau')

    drive.aufrufe = []
    expect(await abgleich(sp)).toBe('unveraendert')
    expect(drive.aufrufe).toEqual(['liste daten'])
  })

  it('zweites Gerät lädt das Profil herunter', async () => {
    const a = speicher()
    a.stand = aendereProfil({ name: 'Erika Musterfrau', rolle: 'beides' }, a, jetzt)
    await abgleich(a)

    const b = speicher()
    expect(await abgleich(b, 'Gerät B')).toBe('geladen')
    expect(b.stand.profil).toMatchObject({ name: 'Erika Musterfrau', rolle: 'beides' })
    expect(await abgleich(b, 'Gerät B')).toBe('unveraendert')
  })

  it('Änderung auf Gerät B kommt bei Gerät A an', async () => {
    const a = speicher()
    a.stand = aendereProfil({ name: 'Erika Musterfrau' }, a, jetzt)
    await abgleich(a)
    const b = speicher()
    await abgleich(b, 'Gerät B')

    b.stand = aendereProfil({ standardAnlage: 'KGA Beispielhain' }, b, jetzt)
    expect(await abgleich(b, 'Gerät B')).toBe('hochgeladen')
    expect(await abgleich(a)).toBe('geladen')
    expect(a.stand.profil).toMatchObject({ name: 'Erika Musterfrau', standardAnlage: 'KGA Beispielhain' })
  })

  it('beide Geräte geändert: die neuere Änderung gewinnt', async () => {
    const a = speicher()
    a.stand = aendereProfil({ name: 'Erika Musterfrau' }, a, jetzt)
    await abgleich(a)
    const b = speicher()
    await abgleich(b, 'Gerät B')

    a.stand = aendereProfil({ name: 'Erika A' }, a, jetzt)
    b.stand = aendereProfil({ name: 'Erika B' }, b, jetzt) // später → neuer
    await abgleich(a) // A lädt hoch
    expect(await abgleich(b, 'Gerät B')).toBe('hochgeladen') // B ist neuer
    expect(await abgleich(a)).toBe('geladen')
    expect(a.stand.profil.name).toBe('Erika B')
  })

  it('Geräte-Einstellungen gehören nicht in profil.json', async () => {
    const sp = speicher()
    sp.stand = aendereProfil({ name: 'Erika Musterfrau' }, sp, jetzt)
    await abgleich(sp)
    const inhalt = drive.dateien.get('daten/profil.json')?.inhalt as string
    expect(inhalt).not.toMatch(/wlan/i)
  })
})

describe('Unterschrift im Profil-Abgleich', () => {
  // Winziges, aber gültiges PNG (1 × 1, durchsichtig) – erfunden
  const PNG_1X1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=='
  let drive: FakeDrive
  beforeEach(() => {
    drive = new FakeDrive()
  })
  const abgleich = (sp: ProfilSpeicher, geraet = 'Gerät A') =>
    synchronisiereProfil({ client: drive.client('daten'), speicher: sp, geraet, jetzt })

  it('kommt mit dem Profil auf das zweite Gerät und verschwindet dort beim Löschen wieder', async () => {
    const a = speicher()
    a.stand = aendereProfil({ name: 'Erika Musterfrau', unterschrift: PNG_1X1 }, a, jetzt)
    await abgleich(a)
    const b = speicher()
    expect(await abgleich(b, 'Gerät B')).toBe('geladen')
    expect(b.stand.profil.unterschrift).toBe(PNG_1X1)

    b.stand = aendereProfil({ unterschrift: undefined }, b, jetzt)
    expect(await abgleich(b, 'Gerät B')).toBe('hochgeladen')
    expect(await abgleich(a)).toBe('geladen')
    expect(a.stand.profil.unterschrift).toBeUndefined()
    expect(a.stand.profil.name).toBe('Erika Musterfrau')
  })

  it('verwirft aus der Cloud alles, was kein PNG in vernünftiger Größe ist', async () => {
    const a = speicher()
    a.stand = aendereProfil({ name: 'Erika Musterfrau' }, a, jetzt)
    await abgleich(a)
    const roh = JSON.parse(drive.dateien.get('daten/profil.json')?.inhalt as string)
    roh.profil.unterschrift = 'data:text/html;base64,PHNjcmlwdD4='
    roh.geaendertAm = '2099-01-01T00:00:00.000Z'
    await drive.client('daten').schreibe('profil.json', JSON.stringify(roh))
    const b = speicher()
    await abgleich(b, 'Gerät B')
    expect(b.stand.profil.name).toBe('Erika Musterfrau')
    expect(b.stand.profil.unterschrift).toBeUndefined()
  })
})

describe('Vorbelegung neuer WEPs aus dem Profil', () => {
  it('übernimmt Name als Wertermittler und die Standard-Anlage', () => {
    const wep = neuerWepMitProfil('2026-001', {
      name: ' Erika Musterfrau ',
      rolle: 'gruen',
      standardAnlage: 'KGA Musterwiese',
    })
    expect(wep.formalien.wertermittlerAussenAufwuchs).toBe('Erika Musterfrau')
    expect(wep.formalien.kleingartenanlage).toBe('KGA Musterwiese')
    expect(wep.id).toBe('2026-001')
  })

  it('leeres Profil ergibt ein leeres WEP wie bisher', () => {
    const wep = neuerWepMitProfil('2026-002', LEERES_PROFIL)
    expect(wep.formalien.wertermittlerAussenAufwuchs).toBe('')
    expect(wep.formalien.kleingartenanlage).toBe('')
  })
})
