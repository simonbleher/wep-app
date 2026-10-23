// @vitest-environment node
// Beta 3, Paket 6: Sicherung erstellen und einspielen (Vorschau, Konflikte, nichts still überschreiben).
// Alle Daten sind erfunden.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { neuerWep, type Foto, type Wep } from '@/model'
import type { EigenePosition } from '@/katalog'
import type { Profil } from '@/profil'
import type { PapierkorbEintrag } from '@/sync/types'
import { erstelleSicherung, sicherungsDateiname } from './erstellen'
import { leseSicherung, SicherungsFehler } from './lesen'
import { erstelleVorschau, standardEntscheidungen, type Entscheidungen } from './vorschau'
import { spieleEin } from './einspielen'
import type { SicherungsQuelle, SicherungsWep, SicherungsZiel } from './types'

const JETZT = '2026-10-20T12:00:00.000Z'
const bytes = (...n: number[]) => new Uint8Array(n)

function wep(id: string, anlage = 'KGA Musterwiese', mit: Partial<Wep> = {}): Wep {
  const w = neuerWep(id)
  w.formalien.kleingartenanlage = anlage
  w.formalien.parzelle = '42'
  w.formalien.unterpaechter = 'Erika Musterfrau'
  return { ...w, ...mit }
}
const foto = (id: string): Foto => ({ id, aufgenommenAm: JETZT, breite: 100, hoehe: 80, groesse: 3 })
const eigene = (id: string, bezeichnung: string, preis = 12, geaendertAm = '2026-10-01T00:00:00.000Z', geloescht?: boolean): EigenePosition => ({
  id, abschnitt: 'aufwuchs', bezeichnung, einheit: 'Stück', einzelpreis: preis, geaendertAm, ...(geloescht ? { geloescht } : {}),
})

interface Stand {
  weps: SicherungsWep[]
  papierkorb: PapierkorbEintrag[]
  eigene: EigenePosition[]
  profil: { profil: Profil; geaendertAm?: string }
  fotos: Map<string, Uint8Array> // `${wepId}/${fotoId}`
  bau: Map<string, Uint8Array>
}
const leer = (): Stand => ({
  weps: [], papierkorb: [], eigene: [], profil: { profil: { name: '', rolle: 'gruen', standardAnlage: '' } },
  fotos: new Map(), bau: new Map(),
})

/** Ein Gerät im Speicher: Quelle und Ziel in einem. */
function geraet(stand: Stand) {
  const protokoll: string[] = []
  const quelle: SicherungsQuelle = {
    weps: async () => stand.weps,
    papierkorb: async () => stand.papierkorb,
    eigenePositionen: async () => stand.eigene,
    profil: async () => stand.profil,
    fotoDatei: async (wepId, f) => stand.fotos.get(`${wepId}/${f.id}`),
    bauExcelDatei: async (w) => stand.bau.get(w.id),
  }
  const ziel: SicherungsZiel = {
    belegteNummern: async () => [...stand.weps.map((w) => w.wep.id), ...stand.papierkorb.map((p) => p.id)].map((id) => ({ id })),
    async speichereWep(w) {
      protokoll.push(`wep ${w.id}`)
      stand.weps = [...stand.weps.filter((x) => x.wep.id !== w.id), { wep: w, geaendertAm: JETZT }]
    },
    async legeInPapierkorb(e) {
      protokoll.push(`korb ${e.id}`)
      stand.papierkorb = [...stand.papierkorb, e]
    },
    async speichereFoto(wepId, f, b) {
      protokoll.push(`foto ${wepId}/${f.id}`)
      stand.fotos.set(`${wepId}/${f.id}`, b)
    },
    async speichereBauExcel(wepId, _w, b) {
      protokoll.push(`bau ${wepId}`)
      stand.bau.set(wepId, b)
    },
    async setzeEigenePositionen(e) {
      protokoll.push('eigene')
      stand.eigene = e
    },
    async setzeProfil(p) {
      protokoll.push('profil')
      stand.profil = { profil: p, geaendertAm: JETZT }
    },
  }
  return { quelle, ziel, protokoll }
}

/** Gerät A mit Inhalt, daraus Sicherung gelesen. */
async function sicherungAus(a: Stand, opt = { mitFotos: true, mitBauExcel: true }) {
  const s = await erstelleSicherung(geraet(a).quelle, { ...opt, jetzt: () => JETZT, appVersion: '0.1.0' })
  return { erstellt: s, gelesen: await leseSicherung(s.blob) }
}

function geraetA(): Stand {
  const a = leer()
  a.weps = [
    { wep: wep('2026-001', 'KGA Musterwiese', { fotos: [foto('f1'), foto('f2')], bauExcel: { name: 'Bau.xlsx', groesse: 3, version: 'v1', hinzugefuegtAm: JETZT } }), geaendertAm: '2026-10-19T10:00:00.000Z' },
    { wep: wep('2026-002', 'KGA Hügelblick'), geaendertAm: '2026-10-18T10:00:00.000Z' },
  ]
  a.papierkorb = [{ id: '2026-003', wep: wep('2026-003', 'KGA Seeblick'), geloeschtAm: '2026-10-15T08:00:00.000Z' }]
  a.eigene = [eigene('e1', 'Hochbeet, Lärche'), eigene('e2', 'Regentonne', 25)]
  a.profil = { profil: { name: 'Max Mustermann', rolle: 'gruen', standardAnlage: 'KGA Musterwiese' }, geaendertAm: '2026-10-10T00:00:00.000Z' }
  a.fotos.set('2026-001/f1', bytes(1, 2, 3))
  a.fotos.set('2026-001/f2', bytes(4, 5, 6))
  a.bau.set('2026-001', bytes(9, 9))
  return a
}

describe('Sicherung erstellen', () => {
  it('enthält WEPs, Papierkorb, eigene Positionen und Profil; Fotos und Bau-Excel nur auf Wunsch', async () => {
    const { erstellt, gelesen } = await sicherungAus(geraetA(), { mitFotos: false, mitBauExcel: false })
    const d = gelesen.daten
    expect(d.format).toBe('wep-sicherung/1')
    expect(d.weps.map((w) => w.wep.id)).toEqual(['2026-001', '2026-002'])
    expect(d.papierkorb.map((p) => p.id)).toEqual(['2026-003'])
    expect(d.eigenePositionen).toHaveLength(2)
    expect(d.profil.profil.name).toBe('Max Mustermann')
    expect(d.fotos).toEqual([])
    expect(d.bauExcel).toEqual([])
    expect(d.enthaelt).toEqual({ fotos: false, bauExcel: false })
    expect(await gelesen.foto('2026-001', 'f1')).toBeUndefined()
    expect(erstellt.dateiname).toBe('WEP-Sicherung_2026-10-20.zip')
    expect(sicherungsDateiname(JETZT)).toBe(erstellt.dateiname)
  })

  it('mit Fotos und Bau-Excel: Dateien liegen im ZIP und kommen unverändert zurück', async () => {
    const { erstellt, gelesen } = await sicherungAus(geraetA())
    expect(erstellt.inhalt).toMatchObject({ weps: 2, papierkorb: 1, eigenePositionen: 2, fotos: 2, bauExcel: 1, fotosOhneDatei: 0 })
    expect([...(await gelesen.foto('2026-001', 'f2'))!]).toEqual([4, 5, 6])
    expect([...(await gelesen.bauExcel('2026-001'))!]).toEqual([9, 9])
    const zip = await JSZip.loadAsync(await erstellt.blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['bau/2026-001.xlsx', 'fotos/2026-001/f1.jpg', 'fotos/2026-001/f2.jpg', 'sicherung.json'])
  })

  it('Fotos, die nur in OneDrive liegen, werden gezählt und brechen nichts ab', async () => {
    const a = geraetA()
    a.fotos.delete('2026-001/f2')
    const { erstellt, gelesen } = await sicherungAus(a)
    expect(erstellt.inhalt.fotos).toBe(1)
    expect(erstellt.inhalt.fotosOhneDatei).toBe(1)
    expect(gelesen.daten.fotos).toEqual([{ wepId: '2026-001', id: 'f1' }])
  })

  it('Fotos und Bau-Excel gelöschter WEPs kommen mit', async () => {
    const a = geraetA()
    a.papierkorb[0]!.wep = wep('2026-003', 'KGA Seeblick', { fotos: [foto('g1')] })
    a.fotos.set('2026-003/g1', bytes(7))
    const { gelesen } = await sicherungAus(a)
    expect([...(await gelesen.foto('2026-003', 'g1'))!]).toEqual([7])
  })
})

describe('Sicherung lesen: Fehler', () => {
  it('keine ZIP-Datei', async () => {
    await expect(leseSicherung(new Blob(['hallo']))).rejects.toThrow(SicherungsFehler)
    await expect(leseSicherung(new Blob(['hallo']))).rejects.toThrow('keine Sicherung')
  })

  it('ZIP ohne sicherung.json', async () => {
    const z = new JSZip()
    z.file('etwas.txt', 'x')
    await expect(leseSicherung(await z.generateAsync({ type: 'uint8array' }))).rejects.toThrow('sicherung.json fehlt')
  })

  it('kaputtes JSON und fremdes Format', async () => {
    const kaputt = new JSZip()
    kaputt.file('sicherung.json', '{')
    await expect(leseSicherung(await kaputt.generateAsync({ type: 'uint8array' }))).rejects.toThrow('nicht lesbar')
    const fremd = new JSZip()
    fremd.file('sicherung.json', JSON.stringify({ format: 'etwas-anderes/1' }))
    await expect(leseSicherung(await fremd.generateAsync({ type: 'uint8array' }))).rejects.toThrow('keine Sicherung')
    const neuer = new JSZip()
    neuer.file('sicherung.json', JSON.stringify({ format: 'wep-sicherung/2' }))
    await expect(leseSicherung(await neuer.generateAsync({ type: 'uint8array' }))).rejects.toThrow('App aktualisieren')
  })
})

describe('Einspielen auf einem leeren Gerät', () => {
  it('alles ist neu und wird standardmäßig übernommen, mit Fotos, Bau-Excel, Papierkorb, eigenen Positionen und Profil', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const b = leer()
    const g = geraet(b)
    const vorschau = await erstelleVorschau(gelesen, g.quelle)
    expect(vorschau.weps.map((p) => [p.schluessel, p.status])).toEqual([['wep:2026-001', 'neu'], ['wep:2026-002', 'neu']])
    expect(vorschau.weps[0]).toMatchObject({ fotos: 2, bauExcel: true })
    expect(vorschau.papierkorb[0]?.status).toBe('neu')
    expect(vorschau.eigene).toHaveLength(2)
    expect(vorschau.profil?.status).toBe('neu')
    const wahl = standardEntscheidungen(vorschau)
    const e = await spieleEin({ sicherung: gelesen, vorschau, wahl, lokal: g.quelle, ziel: g.ziel, jetzt: () => JETZT })
    expect(e).toMatchObject({ papierkorb: 1, eigene: 2, profil: true, fotos: 2, bauExcel: 1, fehler: [] })
    expect(e.weps.map((w) => w.id)).toEqual(['2026-001', '2026-002'])
    expect(b.weps.map((w) => w.wep.id)).toEqual(['2026-001', '2026-002'])
    expect([...b.fotos.get('2026-001/f1')!]).toEqual([1, 2, 3])
    expect([...b.bau.get('2026-001')!]).toEqual([9, 9])
    expect(b.papierkorb[0]?.id).toBe('2026-003')
    expect(b.eigene.map((x) => x.bezeichnung)).toEqual(['Hochbeet, Lärche', 'Regentonne'])
    expect(b.profil.profil.name).toBe('Max Mustermann')
  })

  it('Dateien kommen vor dem WEP, damit das WEP nie auf fehlende Fotos zeigt', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const g = geraet(leer())
    const vorschau = await erstelleVorschau(gelesen, g.quelle)
    await spieleEin({ sicherung: gelesen, vorschau, wahl: standardEntscheidungen(vorschau), lokal: g.quelle, ziel: g.ziel })
    expect(g.protokoll.indexOf('foto 2026-001/f1')).toBeLessThan(g.protokoll.indexOf('wep 2026-001'))
  })

  it('Sicherung ohne Fotos: das WEP kommt, die fehlenden Fotos werden gemeldet', async () => {
    const { gelesen } = await sicherungAus(geraetA(), { mitFotos: false, mitBauExcel: false })
    const g = geraet(leer())
    const vorschau = await erstelleVorschau(gelesen, g.quelle)
    const e = await spieleEin({ sicherung: gelesen, vorschau, wahl: standardEntscheidungen(vorschau), lokal: g.quelle, ziel: g.ziel })
    expect(e.fotos).toBe(0)
    expect(e.fotosFehlen).toBe(2)
    expect(e.weps.map((w) => w.id)).toContain('2026-001')
  })
})

describe('Einspielen mit Konflikten: nichts wird still überschrieben', () => {
  /** Gerät B hat dieselben WEPs, aber 2026-001 anders bearbeitet und 2026-002 unverändert. */
  function geraetB(): Stand {
    const b = leer()
    const a = geraetA()
    b.weps = [
      { wep: wep('2026-001', 'KGA Musterwiese Nord', { fotos: [foto('f1')] }), geaendertAm: '2026-10-20T08:00:00.000Z' },
      a.weps[1]!,
    ]
    b.eigene = [eigene('e1', 'Hochbeet, Lärche', 15, '2026-10-12T00:00:00.000Z'), eigene('e9', 'Eigene nur hier')]
    b.profil = { profil: { name: 'Max Mustermann', rolle: 'gruen', standardAnlage: 'KGA Seeblick' }, geaendertAm: '2026-10-11T00:00:00.000Z' }
    return b
  }

  it('Vorschau: gleich, abweichend (mit Zeiten und „neuer“), neu; Standard ist „behalten“', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const g = geraet(geraetB())
    const v = await erstelleVorschau(gelesen, g.quelle)
    const w1 = v.weps.find((p) => p.schluessel === 'wep:2026-001')!
    const w2 = v.weps.find((p) => p.schluessel === 'wep:2026-002')!
    expect(w1.status).toBe('anders')
    expect(w1.optionen).toEqual(['behalten', 'uebernehmen', 'kopie'])
    expect(w1.standard).toBe('behalten')
    expect(w1.detail).toContain('Der Stand hier ist neuer.')
    expect(w2.status).toBe('gleich')
    expect(w2.optionen).toEqual([])
    expect(v.eigene.find((p) => p.schluessel === 'eigen:e1')).toMatchObject({ status: 'anders', standard: 'behalten' })
    expect(v.eigene.find((p) => p.schluessel === 'eigen:e2')).toMatchObject({ status: 'neu', standard: 'uebernehmen' })
    expect(v.profil).toMatchObject({ status: 'anders', standard: 'behalten' })
    expect(v.hatAenderungen).toBe(true)
  })

  it('mit den Standardwerten bleibt der Stand hier unverändert, nur Neues kommt dazu', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const b = geraetB()
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    const e = await spieleEin({ sicherung: gelesen, vorschau: v, wahl: standardEntscheidungen(v), lokal: g.quelle, ziel: g.ziel, jetzt: () => JETZT })
    expect(b.weps.find((w) => w.wep.id === '2026-001')!.wep.formalien.kleingartenanlage).toBe('KGA Musterwiese Nord')
    expect(g.protokoll).not.toContain('wep 2026-001')
    expect(g.protokoll).not.toContain('profil')
    expect(e.weps).toEqual([])
    expect(b.eigene.find((x) => x.id === 'e1')!.einzelpreis).toBe(15)
    expect(b.eigene.map((x) => x.id).sort()).toEqual(['e1', 'e2', 'e9'])
    expect(b.profil.profil.standardAnlage).toBe('KGA Seeblick')
  })

  it('„Aus der Sicherung übernehmen“ ersetzt den Stand hier ausdrücklich; eigene Positionen gelten ab jetzt', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const b = geraetB()
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    const wahl: Entscheidungen = { ...standardEntscheidungen(v), 'wep:2026-001': 'uebernehmen', 'eigen:e1': 'uebernehmen', profil: 'uebernehmen' }
    const e = await spieleEin({ sicherung: gelesen, vorschau: v, wahl, lokal: g.quelle, ziel: g.ziel, jetzt: () => JETZT })
    expect(e.weps).toContainEqual({ id: '2026-001', von: undefined, ersetzt: true })
    expect(b.weps.find((w) => w.wep.id === '2026-001')!.wep.formalien.kleingartenanlage).toBe('KGA Musterwiese')
    expect(b.eigene.find((x) => x.id === 'e1')).toMatchObject({ einzelpreis: 12, geaendertAm: JETZT })
    expect(b.profil.profil.standardAnlage).toBe('KGA Musterwiese')
    expect(e.profil).toBe(true)
  })

  it('„Als neues WEP anlegen“ behält beide Fassungen: neue Nummer, Vorgangs-Nr. in den Formalien, Fotos unter der neuen Nummer', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const b = geraetB()
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    const wahl: Entscheidungen = { ...standardEntscheidungen(v), 'wep:2026-001': 'kopie' }
    const e = await spieleEin({ sicherung: gelesen, vorschau: v, wahl, lokal: g.quelle, ziel: g.ziel })
    const neu = e.weps[0]!
    expect(neu.von).toBe('2026-001')
    expect(neu.id).toBe('2026-004') // 001, 002 lokal; 003 liegt in der Sicherung im Papierkorb
    expect(neu.ersetzt).toBe(false)
    expect(b.weps.map((w) => w.wep.id).sort()).toEqual(['2026-001', '2026-002', '2026-004'])
    expect(b.weps.find((w) => w.wep.id === '2026-001')!.wep.formalien.kleingartenanlage).toBe('KGA Musterwiese Nord')
    const kopie = b.weps.find((w) => w.wep.id === '2026-004')!.wep
    expect(kopie.formalien.vorgangsNr).toBe('2026-004')
    expect(kopie.formalien.kleingartenanlage).toBe('KGA Musterwiese')
    expect([...b.fotos.get('2026-004/f2')!]).toEqual([4, 5, 6])
    expect([...b.bau.get('2026-004')!]).toEqual([9, 9])
  })

  it('zwei Kopien bekommen verschiedene Nummern', async () => {
    const a = leer()
    a.weps = [{ wep: wep('2026-001', 'A') }, { wep: wep('2026-002', 'B') }]
    const { gelesen } = await sicherungAus(a)
    const b = leer()
    b.weps = [{ wep: wep('2026-001', 'A anders') }, { wep: wep('2026-002', 'B anders') }]
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    const wahl: Entscheidungen = { 'wep:2026-001': 'kopie', 'wep:2026-002': 'kopie' }
    const e = await spieleEin({ sicherung: gelesen, vorschau: v, wahl, lokal: g.quelle, ziel: g.ziel })
    expect(e.weps.map((w) => w.id)).toEqual(['2026-003', '2026-004'])
  })

  it('liegt die Nummer hier im Papierkorb, wird sie nie überschrieben: überspringen oder neue Nummer', async () => {
    const a = leer()
    a.weps = [{ wep: wep('2026-005', 'Aus der Sicherung') }]
    const { gelesen } = await sicherungAus(a)
    const b = leer()
    b.papierkorb = [{ id: '2026-005', wep: wep('2026-005', 'Gelöscht hier'), geloeschtAm: '2026-10-19T00:00:00.000Z' }]
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    expect(v.weps[0]).toMatchObject({ status: 'im-papierkorb', standard: 'ueberspringen', optionen: ['ueberspringen', 'kopie'] })
    const e1 = await spieleEin({ sicherung: gelesen, vorschau: v, wahl: standardEntscheidungen(v), lokal: g.quelle, ziel: g.ziel })
    expect(e1.weps).toEqual([])
    expect(b.weps).toEqual([])
    const e2 = await spieleEin({ sicherung: gelesen, vorschau: v, wahl: { 'wep:2026-005': 'kopie' }, lokal: g.quelle, ziel: g.ziel })
    expect(e2.weps.map((w) => w.id)).toEqual(['2026-006'])
    expect(b.papierkorb[0]!.wep.formalien.kleingartenanlage).toBe('Gelöscht hier')
  })

  it('eine Wahl, die die Vorschau nicht anbietet, wird ignoriert (z. B. „übernehmen“ bei einem gleichen WEP)', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const b = geraetB()
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    const e = await spieleEin({ sicherung: gelesen, vorschau: v, wahl: { 'wep:2026-002': 'uebernehmen', 'korb:2026-999': 'uebernehmen' }, lokal: g.quelle, ziel: g.ziel })
    expect(e.weps).toEqual([])
    expect(g.protokoll).toEqual([])
  })

  it('Papierkorb der Sicherung: eine hier schon vergebene Nummer bleibt unberührt', async () => {
    const { gelesen } = await sicherungAus(geraetA())
    const b = leer()
    b.weps = [{ wep: wep('2026-003', 'Hier aktiv') }]
    const g = geraet(b)
    const v = await erstelleVorschau(gelesen, g.quelle)
    expect(v.papierkorb[0]).toMatchObject({ status: 'vorhanden', optionen: [] })
    await spieleEin({ sicherung: gelesen, vorschau: v, wahl: standardEntscheidungen(v), lokal: g.quelle, ziel: g.ziel })
    expect(b.papierkorb).toEqual([])
  })

  it('Identische Sicherung: nichts einzuspielen', async () => {
    const a = geraetA()
    const { gelesen } = await sicherungAus(a)
    const g = geraet(a)
    const v = await erstelleVorschau(gelesen, g.quelle)
    expect(v.hatAenderungen).toBe(false)
    expect(standardEntscheidungen(v)).toEqual({})
  })

  it('eigene Positionen: gelöschte Marken und gleiche Position unter anderer Kennung werden nicht doppelt angeboten', async () => {
    const a = leer()
    a.eigene = [eigene('x1', 'Regentonne', 25), eigene('x2', 'Alte Position', 5, '2026-10-02T00:00:00.000Z', true)]
    const { gelesen } = await sicherungAus(a)
    const b = leer()
    b.eigene = [eigene('y1', 'regentonne', 30)]
    const v = await erstelleVorschau(gelesen, geraet(b).quelle)
    expect(v.eigene).toEqual([])
  })
})

describe('Parzelle (Beta 6, Paket 1) in der Sicherung', () => {
  it('Parzelle und Skizzen-Maßstab kommen aus der Sicherung unverändert zurück', async () => {
    const parzelle = {
      form: 'frei' as const,
      ecken: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      seiten: [12, 20, 12, 20],
      diagonalen: [{ von: 0, nach: 2, laenge: 23.32 }],
      massketten: true,
      angelegtVon: 'gruen' as const,
      angelegtAm: JETZT,
      geaendertVon: 'bau' as const,
      geaendertAm: JETZT,
    }
    const a = leer()
    a.weps = [{ wep: wep('2026-001', 'KGA Musterwiese', { parzelle, skizze: { elemente: [], massstab: { pxProM: 30, ox: 10, oy: 20 } } }), geaendertAm: JETZT }]
    const { gelesen } = await sicherungAus(a, { mitFotos: false, mitBauExcel: false })
    const b = leer()
    const gb = geraet(b)
    const v = await erstelleVorschau(gelesen, gb.quelle)
    await spieleEin({ sicherung: gelesen, vorschau: v, wahl: standardEntscheidungen(v), lokal: gb.quelle, ziel: gb.ziel, jetzt: () => JETZT })
    expect(b.weps[0].wep.parzelle).toEqual(parzelle)
    expect(b.weps[0].wep.skizze?.massstab).toEqual({ pxProM: 30, ox: 10, oy: 20 })
  })
})
