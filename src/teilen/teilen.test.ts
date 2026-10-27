// @vitest-environment node
// Beta 5, Paket 2: WEP als .wep-Datei teilen (Hin- und Rückweg, Bau → Grün, Konflikte, kaputte/fremde Dateien).
// Alle Daten sind erfunden.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { neuerWep, neueBauDaten, type Foto, type Wep } from '@/model'
import { erstelleSicherung, type SicherungsQuelle, type SicherungsWep, type SicherungsZiel } from '@/sicherung'
import type { PapierkorbEintrag } from '@/sync/types'
import {
  anhangGroessen,
  anzahlGewaehlt,
  erstelleTeilen,
  erstelleTeilenVorschau,
  leseTeilen,
  spieleTeilenEin,
  standardTeilenWahl,
  teilenDateiname,
  TeilenFehler,
  type TeilenWahl,
} from '.'

const JETZT = '2026-10-23T12:00:00.000Z'
const bytes = (...n: number[]) => new Uint8Array(n)
const foto = (id: string): Foto => ({ id, aufgenommenAm: JETZT, breite: 100, hoehe: 80, groesse: 3 })

function wep(id: string, mit: Partial<Wep> = {}): Wep {
  const w = neuerWep(id)
  w.formalien.kleingartenanlage = 'KGA Musterwiese'
  w.formalien.parzelle = '42'
  w.formalien.unterpaechter = 'Erika Musterfrau'
  return { ...w, ...mit }
}
const bau = (text: string) => ({ ...neueBauDaten(), beschreibung: text })
const BAU_EXCEL = { name: 'Bau.xlsx', groesse: 2, version: 'v1', hinzugefuegtAm: JETZT }

interface Stand {
  weps: SicherungsWep[]
  papierkorb: PapierkorbEintrag[]
  fotos: Map<string, Uint8Array>
  bau: Map<string, Uint8Array>
}
const leer = (): Stand => ({ weps: [], papierkorb: [], fotos: new Map(), bau: new Map() })

function geraet(stand: Stand) {
  const protokoll: string[] = []
  const quelle: SicherungsQuelle = {
    weps: async () => stand.weps,
    papierkorb: async () => stand.papierkorb,
    eigenePositionen: async () => [],
    profil: async () => ({ profil: { name: '', rolle: 'gruen' } }),
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
    async setzeEigenePositionen() {
      throw new Error('Teilen fasst eigene Positionen nie an')
    },
    async setzeProfil() {
      throw new Error('Teilen fasst das Profil nie an')
    },
  }
  return { quelle, ziel, protokoll }
}

/** Bau-Wertermittler: WEP mit Bau-Teil, Fotos und Bau-Excel. */
function geraetBau(): Stand {
  const s = leer()
  s.weps = [
    {
      wep: wep('2026-001', { bau: bau('Laube 24 m²'), fotos: [foto('f1'), foto('f2')], bauExcel: BAU_EXCEL }),
      geaendertAm: '2026-10-20T10:00:00.000Z',
    },
  ]
  s.fotos.set('2026-001/f1', bytes(1, 2, 3))
  s.fotos.set('2026-001/f2', bytes(4, 5, 6))
  s.bau.set('2026-001', bytes(9, 9))
  return s
}

async function teile(s: Stand, id: string, opt = { mitFotos: true, mitBauExcel: true }) {
  const erstellt = await erstelleTeilen(geraet(s).quelle, id, { ...opt, jetzt: () => JETZT, appVersion: '0.1.0' })
  return { erstellt, gelesen: await leseTeilen(erstellt.blob) }
}

describe('Teilen: erstellen', () => {
  it('Dateiname <Vorgangs-Nr>_<Anlage>.wep, ohne Zeichen, die in Dateinamen stören', () => {
    expect(teilenDateiname(wep('2026-001'))).toBe('2026-001_KGA_Musterwiese.wep')
    const w = wep('2026-002')
    w.formalien.kleingartenanlage = '  Am See/Süd: "Nord"? '
    expect(teilenDateiname(w)).toBe('2026-002_Am_See_Süd_Nord.wep')
    w.formalien.kleingartenanlage = ''
    expect(teilenDateiname(w)).toBe('2026-002.wep')
  })

  it('ZIP mit wep.json (wep-teilen/1); Fotos und Bau-Excel nur auf Wunsch', async () => {
    const ohne = await teile(geraetBau(), '2026-001', { mitFotos: false, mitBauExcel: false })
    const zip = await JSZip.loadAsync(await ohne.erstellt.blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['wep.json'])
    expect(ohne.gelesen.daten.format).toBe('wep-teilen/1')
    // Was nicht mitgeht, steht auch nicht im WEP der Datei
    expect(ohne.gelesen.daten.wep.fotos).toBeUndefined()
    expect(ohne.gelesen.daten.wep.bauExcel).toBeUndefined()
    expect(ohne.gelesen.daten.wep.bau?.beschreibung).toBe('Laube 24 m²')

    const mit = await teile(geraetBau(), '2026-001')
    const zip2 = await JSZip.loadAsync(await mit.erstellt.blob.arrayBuffer())
    expect(Object.keys(zip2.files).sort()).toEqual(['bau.xlsx', 'fotos/f1.jpg', 'fotos/f2.jpg', 'wep.json'])
    expect(mit.erstellt.inhalt).toEqual({ fotos: 2, bauExcel: true, unterschriften: [] })
  })

  it('Dateien, die nur in OneDrive liegen, werden gezählt und brechen nichts ab', async () => {
    const s = geraetBau()
    s.fotos.delete('2026-001/f2')
    s.bau.clear()
    const { erstellt, gelesen } = await teile(s, '2026-001')
    expect(erstellt.fotosOhneDatei).toBe(1)
    expect(erstellt.bauExcelOhneDatei).toBe(true)
    expect(gelesen.daten.wep.fotos?.map((f) => f.id)).toEqual(['f1'])
    expect(gelesen.daten.wep.bauExcel).toBeUndefined()
  })

  it('Größenangabe für die Schalter', () => {
    const g = anhangGroessen(geraetBau().weps[0].wep)
    expect(g).toEqual({ fotos: 6, fotoAnzahl: 2, bauExcel: 2 })
  })

  it('enthält nur das eine WEP – keine anderen WEPs, kein Papierkorb, kein Profil', async () => {
    const s = geraetBau()
    s.weps.push({ wep: wep('2026-002'), geaendertAm: JETZT })
    s.papierkorb = [{ id: '2026-003', wep: wep('2026-003'), geloeschtAm: JETZT }]
    const { erstellt } = await teile(s, '2026-001')
    const text = await (await JSZip.loadAsync(await erstellt.blob.arrayBuffer())).file('wep.json')!.async('string')
    expect(text).not.toContain('2026-002')
    expect(text).not.toContain('2026-003')
    expect(JSON.parse(text)).not.toHaveProperty('profil')
  })
})

describe('Teilen: Hin- und Rückweg auf ein leeres Gerät', () => {
  it('alles ist neu; Standard übernimmt; Fotos und Bau-Excel kommen unverändert an, Dateien vor dem WEP', async () => {
    const { gelesen } = await teile(geraetBau(), '2026-001')
    const b = leer()
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    expect(v.punkt.status).toBe('neu')
    expect(v.teile).toEqual([])
    const wahl = standardTeilenWahl(v)
    expect(wahl.wep).toBe('uebernehmen')
    expect(anzahlGewaehlt(v, wahl)).toBe(1)
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl, lokal: g.quelle, ziel: g.ziel })
    expect(e).toMatchObject({ fotos: 2, bauExcel: 1, fehler: [], fotosFehlen: 0 })
    expect(b.weps[0].wep).toEqual(geraetBau().weps[0].wep)
    expect([...b.fotos.get('2026-001/f1')!]).toEqual([1, 2, 3])
    expect([...b.bau.get('2026-001')!]).toEqual([9, 9])
    expect(g.protokoll.at(-1)).toBe('wep 2026-001')
  })

  it('Rückweg: Grün-Teil ergänzt, zurück an den Absender – mit Wahl „Grün-Teil übernehmen, Bau-Teil behalten“', async () => {
    // A (Bau) → B (Grün) → A
    const a = geraetBau()
    const hin = await teile(a, '2026-001')
    const b = leer()
    const gb = geraet(b)
    const vb = await erstelleTeilenVorschau(hin.gelesen, gb.quelle)
    await spieleTeilenEin({ gelesen: hin.gelesen, vorschau: vb, wahl: standardTeilenWahl(vb), lokal: gb.quelle, ziel: gb.ziel })
    // B erfasst Grün
    const gruen = { ...b.weps[0].wep.gruen, beschreibungAussen: 'Rasen und Hochbeet' }
    b.weps[0] = { wep: { ...b.weps[0].wep, gruen }, geaendertAm: '2026-10-22T10:00:00.000Z' }
    const zurueck = await teile(b, '2026-001', { mitFotos: false, mitBauExcel: false })
    // A hat inzwischen den Bau-Teil geändert
    a.weps[0] = { wep: { ...a.weps[0].wep, bau: bau('Laube 24 m², Anbau 6 m²') }, geaendertAm: '2026-10-22T09:00:00.000Z' }
    const ga = geraet(a)
    const v = await erstelleTeilenVorschau(zurueck.gelesen, ga.quelle)
    expect(v.punkt.status).toBe('anders')
    expect(v.teile.map((t) => t.teil)).toEqual(['bau', 'gruen'])
    // nichts ist vorgewählt
    const wahl = standardTeilenWahl(v)
    expect(anzahlGewaehlt(v, wahl)).toBe(0)
    const vorher = JSON.stringify(a.weps[0].wep)
    await spieleTeilenEin({ gelesen: zurueck.gelesen, vorschau: v, wahl, lokal: ga.quelle, ziel: ga.ziel })
    expect(JSON.stringify(a.weps[0].wep)).toBe(vorher)

    const gewaehlt: TeilenWahl = { wep: 'uebernehmen', teile: { bau: 'behalten', gruen: 'uebernehmen' } }
    expect(anzahlGewaehlt(v, gewaehlt)).toBe(1)
    const e = await spieleTeilenEin({ gelesen: zurueck.gelesen, vorschau: v, wahl: gewaehlt, lokal: ga.quelle, ziel: ga.ziel })
    expect(e.teile).toEqual(['gruen'])
    expect(e.weps).toEqual([{ id: '2026-001', ersetzt: true }])
    const ergebnis = a.weps[0].wep
    expect(ergebnis.gruen.beschreibungAussen).toBe('Rasen und Hochbeet')
    expect(ergebnis.bau?.beschreibung).toBe('Laube 24 m², Anbau 6 m²') // Bau-Teil von A bleibt
    expect(ergebnis.fotos?.map((f) => f.id)).toEqual(['f1', 'f2']) // Fotos von A bleiben
    expect(ergebnis.bauExcel).toEqual(BAU_EXCEL)
    expect(ergebnis.formalien).toEqual(b.weps[0].wep.formalien)
  })
})

describe('Teilen: Bau → Grün direkt in der App', () => {
  it('Bau-Teil einer neueren Fassung übernehmen, Grün-Teil (hier erfasst) behalten', async () => {
    const bauGeraet = geraetBau()
    const hin = await teile(bauGeraet, '2026-001', { mitFotos: false, mitBauExcel: false })
    // Grün-Gerät: hat dasselbe WEP mit eigenem Grün-Teil und älterem Bau-Teil
    const gruenGeraet = leer()
    gruenGeraet.weps = [
      {
        wep: wep('2026-001', { bau: bau('Laube (alt)'), gruen: { ...neuerWep('x').gruen, beschreibungAussen: 'Mein Grün' } }),
        geaendertAm: '2026-10-21T10:00:00.000Z',
      },
    ]
    const g = geraet(gruenGeraet)
    const v = await erstelleTeilenVorschau(hin.gelesen, g.quelle)
    expect(v.punkt.status).toBe('anders')
    // Die Datei hat keinen Grün-Inhalt: den Grün-Teil gibt es nicht zum Übernehmen (kein Löschen durch Leere)
    expect(v.teile.map((t) => t.teil)).toEqual(['bau'])
    const e = await spieleTeilenEin({
      gelesen: hin.gelesen,
      vorschau: v,
      wahl: { wep: 'uebernehmen', teile: { bau: 'uebernehmen' } },
      lokal: g.quelle,
      ziel: g.ziel,
    })
    expect(e.teile).toEqual(['bau'])
    expect(gruenGeraet.weps[0].wep.bau?.beschreibung).toBe('Laube 24 m²')
    expect(gruenGeraet.weps[0].wep.gruen.beschreibungAussen).toBe('Mein Grün')
  })

  it('Fotos: nur neue kommen dazu, vorhandene Fotos hier bleiben; Bau-Excel ersetzt nur auf Wahl', async () => {
    const hin = await teile(geraetBau(), '2026-001')
    const b = leer()
    b.weps = [{ wep: wep('2026-001', { fotos: [foto('f1'), foto('eigen')], bauExcel: { ...BAU_EXCEL, version: 'v0' } }), geaendertAm: JETZT }]
    b.fotos.set('2026-001/f1', bytes(7))
    b.fotos.set('2026-001/eigen', bytes(8))
    b.bau.set('2026-001', bytes(5))
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(hin.gelesen, g.quelle)
    expect(v.teile.map((t) => t.teil)).toEqual(['bau', 'fotos', 'bauExcel'])
    const e = await spieleTeilenEin({
      gelesen: hin.gelesen,
      vorschau: v,
      wahl: { wep: 'uebernehmen', teile: { fotos: 'uebernehmen' } },
      lokal: g.quelle,
      ziel: g.ziel,
    })
    expect(e).toMatchObject({ teile: ['fotos'], fotos: 1, bauExcel: 0 })
    expect(b.weps[0].wep.fotos?.map((f) => f.id)).toEqual(['f1', 'eigen', 'f2'])
    expect([...b.fotos.get('2026-001/f1')!]).toEqual([7]) // nicht überschrieben
    expect([...b.fotos.get('2026-001/f2')!]).toEqual([4, 5, 6])
    expect([...b.bau.get('2026-001')!]).toEqual([5])
    expect(b.weps[0].wep.bauExcel?.version).toBe('v0')
    expect(b.weps[0].wep.bau).toBeUndefined()

    const e2 = await spieleTeilenEin({
      gelesen: hin.gelesen,
      vorschau: await erstelleTeilenVorschau(hin.gelesen, g.quelle),
      wahl: { wep: 'uebernehmen', teile: { bauExcel: 'uebernehmen' } },
      lokal: g.quelle,
      ziel: g.ziel,
    })
    expect(e2.bauExcel).toBe(1)
    expect([...b.bau.get('2026-001')!]).toEqual([9, 9])
    expect(b.weps[0].wep.bauExcel?.version).toBe('v1')
  })
})

describe('Teilen: Konflikte – nichts wird still überschrieben', () => {
  it('gleiches WEP: nichts zu tun, Wahl wird ignoriert', async () => {
    const { gelesen } = await teile(geraetBau(), '2026-001')
    const b = geraetBau()
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    expect(v.punkt.status).toBe('gleich')
    expect(v.hatAenderungen).toBe(false)
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl: { wep: 'uebernehmen', teile: {} }, lokal: g.quelle, ziel: g.ziel })
    expect(e.weps).toEqual([])
    expect(g.protokoll).toEqual([])
  })

  it('Vorgabe bei Abweichung: nichts wird eingespielt; ein Teil, den die Vorschau nicht anbietet, wird ignoriert', async () => {
    const { gelesen } = await teile(geraetBau(), '2026-001', { mitFotos: false, mitBauExcel: false })
    const b = leer()
    b.weps = [{ wep: wep('2026-001', { bau: bau('anders') }), geaendertAm: JETZT }]
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl: standardTeilenWahl(v), lokal: g.quelle, ziel: g.ziel })
    expect(e.weps).toEqual([])
    expect(g.protokoll).toEqual([])
    const e2 = await spieleTeilenEin({ gelesen, vorschau: v, wahl: { wep: 'uebernehmen', teile: { gruen: 'uebernehmen' } }, lokal: g.quelle, ziel: g.ziel })
    expect(e2.weps).toEqual([])
    expect(g.protokoll).toEqual([])
  })

  it('„Als neues WEP anlegen“: neue Kennung (UUID), beide Fassungen bleiben', async () => {
    const { gelesen } = await teile(geraetBau(), '2026-001')
    const b = leer()
    b.weps = [{ wep: wep('2026-001', { bau: bau('hier') }), geaendertAm: JETZT }]
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    const wahl: TeilenWahl = { wep: 'kopie', teile: {} }
    expect(anzahlGewaehlt(v, wahl)).toBe(1)
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl, lokal: g.quelle, ziel: g.ziel })
    expect(e.weps).toHaveLength(1)
    const neu = e.weps[0]!.id
    expect(neu).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(e.weps[0]).toMatchObject({ von: '2026-001', ersetzt: false })
    expect(b.weps.map((w) => w.wep.id).sort()).toEqual(['2026-001', neu].sort())
    expect(b.weps.find((w) => w.wep.id === '2026-001')!.wep.bau?.beschreibung).toBe('hier')
    expect(b.weps.find((w) => w.wep.id === neu)!.wep.formalien.vorgangsNr).toBe('2026-001') // Vorgangs-Nr. aus der Datei
    expect(b.fotos.has(`${neu}/f1`)).toBe(true)
  })

  it('liegt die Nummer hier im Papierkorb, wird sie nie überschrieben', async () => {
    const { gelesen } = await teile(geraetBau(), '2026-001')
    const b = leer()
    b.papierkorb = [{ id: '2026-001', wep: wep('2026-001'), geloeschtAm: JETZT }]
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    expect(v.punkt.status).toBe('im-papierkorb')
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl: standardTeilenWahl(v), lokal: g.quelle, ziel: g.ziel })
    expect(e.weps).toEqual([])
    expect(b.weps).toEqual([])
  })

  it('Zeitangabe „neuer“ kommt aus der Sicherungslogik', async () => {
    const { gelesen } = await teile(geraetBau(), '2026-001')
    const b = leer()
    b.weps = [{ wep: wep('2026-001', { bau: bau('hier') }), geaendertAm: '2026-10-22T00:00:00.000Z' }]
    const v = await erstelleTeilenVorschau(gelesen, geraet(b).quelle)
    expect(v.punkt.detail).toContain('Der Stand hier ist neuer.')
    expect(v.punkt.detail).toContain('Datei:')
    expect(v.punkt.detail).not.toContain('Sicherung')
  })
})

describe('Teilen: kaputte und fremde Dateien', () => {
  const zipMit = async (dateien: Record<string, string>) => {
    const z = new JSZip()
    for (const [n, t] of Object.entries(dateien)) z.file(n, t)
    return z.generateAsync({ type: 'uint8array' })
  }
  const gueltig = (wepTeil: unknown = wep('2026-001')) => JSON.stringify({ format: 'wep-teilen/1', erstelltAm: JETZT, appVersion: '', wep: wepTeil, enthaelt: { fotos: false, bauExcel: false }, fotos: [] })

  it('keine ZIP-Datei', async () => {
    await expect(leseTeilen(new TextEncoder().encode('Hallo'))).rejects.toThrow(/keine WEP-Datei/)
    await expect(leseTeilen(new Uint8Array())).rejects.toBeInstanceOf(TeilenFehler)
  })
  it('ZIP ohne wep.json, fremde ZIP-Datei', async () => {
    await expect(leseTeilen(await zipMit({ 'foto.jpg': 'x' }))).rejects.toThrow(/wep\.json fehlt/)
  })
  it('eine Sicherung wird erkannt und nicht als WEP-Datei geöffnet', async () => {
    const s = leer()
    const sicherung = await erstelleSicherung(geraet(s).quelle, { mitFotos: false, mitBauExcel: false })
    await expect(leseTeilen(sicherung.blob)).rejects.toThrow(/Sicherung/)
  })
  it('kaputtes JSON', async () => {
    await expect(leseTeilen(await zipMit({ 'wep.json': '{ kaputt' }))).rejects.toThrow(/beschädigt/)
  })
  it('fremdes Format und neuere Version werden abgelehnt', async () => {
    await expect(leseTeilen(await zipMit({ 'wep.json': JSON.stringify({ format: 'was-anderes/1' }) }))).rejects.toThrow(/keine WEP-Datei/)
    await expect(leseTeilen(await zipMit({ 'wep.json': gueltig().replace('wep-teilen/1', 'wep-teilen/2') }))).rejects.toThrow(/wep-teilen\/2.*aktualisieren/)
    await expect(leseTeilen(await zipMit({ 'wep.json': 'null' }))).rejects.toBeInstanceOf(TeilenFehler)
  })
  it('unbrauchbares WEP: ohne Nummer, ungültige Nummer, Grün-Teil fehlt, ungültige Foto-Kennung', async () => {
    const ok = wep('2026-001')
    const faelle: unknown[] = [
      null,
      { ...ok, id: '../../x' },
      { ...ok, id: undefined },
      { ...ok, gruen: undefined },
      { ...ok, formalien: 'x' },
      { ...ok, fotos: [{ id: '../evil' }] },
    ]
    for (const f of faelle) await expect(leseTeilen(await zipMit({ 'wep.json': gueltig(f) }))).rejects.toBeInstanceOf(TeilenFehler)
  })
  it('eine gültige Minimal-Datei wird gelesen', async () => {
    const g = await leseTeilen(await zipMit({ 'wep.json': gueltig() }))
    expect(g.daten.wep.id).toBe('2026-001')
    expect(g.sicherung.daten.weps).toHaveLength(1)
  })
  it('neues WEP mit UUID als Kennung wird gelesen (Teilen und Wieder-Öffnen)', async () => {
    const id = '7c1e9f4a-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
    const g = await leseTeilen(await zipMit({ 'wep.json': gueltig({ ...wep('2026-001'), id }) }))
    expect(g.daten.wep.id).toBe(id)
    await expect(leseTeilen(await zipMit({ 'wep.json': gueltig({ ...wep('2026-001'), id: id.toUpperCase() + '/..' }) }))).rejects.toBeInstanceOf(TeilenFehler)
  })
  it('Fotos fehlen im ZIP, obwohl das WEP sie nennt: das WEP kommt, die Fotos werden gemeldet', async () => {
    const s = geraetBau()
    const hin = await teile(s, '2026-001')
    const z = await JSZip.loadAsync(await hin.erstellt.blob.arrayBuffer())
    z.remove('fotos/f2.jpg')
    const gelesen = await leseTeilen(await z.generateAsync({ type: 'uint8array' }))
    const b = leer()
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl: standardTeilenWahl(v), lokal: g.quelle, ziel: g.ziel })
    expect(e).toMatchObject({ fotos: 1, fotosFehlen: 1, fehler: [] })
  })
})

describe('Parzelle (Beta 6, Paket 1) reist mit', () => {
  const PARZELLE = { form: 'rechteck', laenge: 26, breite: 18, angelegtVon: 'bau', angelegtAm: JETZT } as const
  const mitParzelle = (): Stand => {
    const s = geraetBau()
    s.weps[0] = { wep: { ...s.weps[0].wep, parzelle: PARZELLE }, geaendertAm: '2026-10-20T10:00:00.000Z' }
    return s
  }

  it('Bau → Grün auf ein leeres Gerät: die Parzelle kommt unverändert an', async () => {
    const { gelesen } = await teile(mitParzelle(), '2026-001')
    expect(gelesen.daten.wep.parzelle).toEqual(PARZELLE)
    const b = leer()
    const g = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, g.quelle)
    await spieleTeilenEin({ gelesen, vorschau: v, wahl: standardTeilenWahl(v), lokal: g.quelle, ziel: g.ziel })
    expect(b.weps[0].wep.parzelle).toEqual(PARZELLE)
  })

  it('bei Abweichung gehört die Parzelle zu „Formalien und Status“: nichts ist vorgewählt, gewählt wird sie übernommen', async () => {
    const a = mitParzelle()
    const { gelesen } = await teile(a, '2026-001')
    // Grün-Gerät kennt das WEP schon, ohne Parzelle
    const b = leer()
    b.weps = [{ wep: wep('2026-001', { bau: bau('Laube 24 m²'), fotos: [foto('f1'), foto('f2')], bauExcel: BAU_EXCEL }), geaendertAm: '2026-10-21T10:00:00.000Z' }]
    const gb = geraet(b)
    const v = await erstelleTeilenVorschau(gelesen, gb.quelle)
    expect(v.punkt.status).toBe('anders')
    const formalien = v.teile.find((t) => t.teil === 'formalien')
    expect(formalien?.detail).toMatch(/Datei: .*Parzelle/)
    expect(anzahlGewaehlt(v, standardTeilenWahl(v))).toBe(0)

    // behalten: keine Parzelle
    await spieleTeilenEin({ gelesen, vorschau: v, wahl: standardTeilenWahl(v), lokal: gb.quelle, ziel: gb.ziel })
    expect(b.weps[0].wep.parzelle).toBeUndefined()

    // übernehmen
    const wahl: TeilenWahl = { wep: 'uebernehmen', teile: { formalien: 'uebernehmen' } }
    const e = await spieleTeilenEin({ gelesen, vorschau: v, wahl, lokal: gb.quelle, ziel: gb.ziel })
    expect(e.teile).toEqual(['formalien'])
    expect(b.weps[0].wep.parzelle).toEqual(PARZELLE)
    // die Teile Bau und Grün blieben, wie sie waren
    expect(b.weps[0].wep.bau?.beschreibung).toBe('Laube 24 m²')
  })

  it('die Parzelle entfällt auch beim Übernehmen: war sie in der Datei weg, ist sie hier weg', async () => {
    const hier = mitParzelle()
    const ohne = geraetBau()
    const { gelesen } = await teile(ohne, '2026-001')
    const gb = geraet(hier)
    const v = await erstelleTeilenVorschau(gelesen, gb.quelle)
    const wahl: TeilenWahl = { wep: 'uebernehmen', teile: { formalien: 'uebernehmen' } }
    await spieleTeilenEin({ gelesen, vorschau: v, wahl, lokal: gb.quelle, ziel: gb.ziel })
    expect(hier.weps[0].wep.parzelle).toBeUndefined()
  })

  it('eine unlesbare Parzelle in einer fremden Datei bringt nichts zum Absturz', async () => {
    const s = mitParzelle()
    s.weps[0] = { wep: { ...s.weps[0].wep, parzelle: { form: 'frei', ecken: [null, 'x'] } as never }, geaendertAm: JETZT }
    const { gelesen } = await teile(s, '2026-001')
    expect(gelesen.daten.wep.parzelle).toBeDefined()
  })
})
