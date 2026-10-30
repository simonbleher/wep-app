// @vitest-environment node
// Server-Modus (v2): Zusammenführen eigenes Grün-WEP → abgegebenes Bau-WEP – Vorschläge, Vorschau (Stammdaten, Hinweise),
// Ergebnis (Bau-Teil von Bau, Grün-Teil von Grün, Fotos, Unterschriften, Skizze auf der Bau-Grundlage). Erfundene Daten.
import { describe, expect, it } from 'vitest'
import { neuerWep, type Foto, type Wep } from '@/model'
import { istGrundlage, leereSkizze, type SkizzeRechteck } from '@/skizze/types'
import { eigeneZurAuswahl, fuehreZusammen, skizzeZusammen, vorschau } from './zusammenfuehren'
import { eigeneOffeneWeps, kannZusammenfuehren } from './zusammenfuehrenDienst'

const JETZT = '2026-10-28T12:00:00.000Z'

function bauWep(): Wep {
  const w = neuerWep('w-bau')
  w.rolle = 'beides'
  w.formalien = { ...w.formalien, vorgangsNr: '2026-0815', kleingartenanlage: 'KGA Musterwiese', parzelle: '12', unterpaechter: 'Paula Pächterin', wertermittlerAussenAufwuchs: 'Erika M.' }
  w.bau = { bauteile: [{ id: 'bt1', kuerzel: 'L' }], beseitigung: [], beschreibung: 'Laube' } as unknown as Wep['bau']
  w.grundriss = { teile: [{ id: 't1', kuerzel: 'L', bauteilId: 'bt1', punkte: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }] }] }
  w.fotos = [{ id: 'f-laube' } as Foto]
  w.unterschriften = { bau: 'data:image/png;base64,QkFV' }
  w.ablauf = { zustand: 'gruen_in_arbeit', bau: { id: 'bau-1', name: 'Bert Bauer' }, gruen: { id: 'gruen-1', name: 'Erika Musterfrau' } }
  return w
}

function gruenWep(id = 'w-gruen', extra: Partial<Wep['formalien']> = {}): Wep {
  const w = neuerWep(id)
  w.rolle = 'gruen'
  w.formalien = { ...w.formalien, vorgangsNr: '2026-0815', kleingartenanlage: 'KGA Musterwiese', parzelle: '12', unterpaechter: 'Paula Pächterin-Neu', weg: 'Rosenweg', wertermittlerAussenAufwuchs: 'Erika Musterfrau', ...extra }
  w.gruen = { ...w.gruen, aufwuchs: [{ id: 'p-hecke', bezeichnung: 'Hecke' } as unknown as Wep['gruen']['aufwuchs'][number]] }
  const hecke: SkizzeRechteck = { id: 's1', typ: 'rechteck', x: 10, y: 10, breite: 50, hoehe: 20 }
  w.skizze = { ...leereSkizze(), elemente: [hecke] }
  w.fotos = [{ id: 'f-hecke', positionId: 'p-hecke' } as Foto, { id: 'f-allg' } as Foto]
  w.unterschriften = { gruen: 'data:image/png;base64,R1JVRU4=' }
  w.ablauf = { zustand: 'gruen_in_arbeit', gruen: { id: 'gruen-1', name: 'Erika Musterfrau' } }
  return w
}

describe('Auswahl eigener WEPs', () => {
  it('passende zuerst: gleiche Vorgangs-Nr., sonst Anlage und Parzelle; dann alle übrigen', () => {
    const andere = gruenWep('w-x', { vorgangsNr: '2026-0001', kleingartenanlage: 'KGA Sonnenschein', parzelle: '3' })
    const ort = gruenWep('w-ort', { vorgangsNr: '', kleingartenanlage: 'kga musterwiese ', parzelle: '12' })
    const nr = gruenWep('w-nr', { vorgangsNr: ' 2026-0815', kleingartenanlage: '' })
    const liste = eigeneZurAuswahl(bauWep(), [andere, ort, nr])
    expect(liste.map((e) => [e.wep.id, e.grund])).toEqual([
      ['w-nr', 'vorgangsNr'],
      ['w-ort', 'anlageParzelle'],
      ['w-x', undefined],
    ])
  })

  it('eigene offene WEPs: ohne Bau, mir gehörend, in Arbeit oder hier neu angelegt; nicht schon zusammengeführte', () => {
    const ich = { id: 'gruen-1', rollen: ['gruen' as const] }
    const neu = { ...gruenWep('w-neu'), ablauf: undefined }
    const fremd = { ...gruenWep('w-fremd'), ablauf: { zustand: 'gruen_in_arbeit' as const, gruen: { id: 'gruen-2', name: 'Gerd' } } }
    const beimBv = { ...gruenWep('w-bv'), ablauf: { zustand: 'beim_bv' as const, gruen: { id: 'gruen-1', name: 'Erika' } } }
    const weg = gruenWep('w-weg')
    const weps = [bauWep(), gruenWep(), neu, fremd, beimBv, weg]
    const metas = [{ id: 'w-weg', lokalGeaendertAm: JETZT, zusammengefuehrtIn: 'w-bau' }, { id: 'w-gruen', lokalGeaendertAm: JETZT, serverRev: 1 }]
    expect(eigeneOffeneWeps(weps, metas, ich).map((w) => w.id)).toEqual(['w-gruen', 'w-neu'])
    expect(eigeneOffeneWeps(weps, metas, { id: 'bau-1', rollen: ['bau'] })).toEqual([])
    expect(kannZusammenfuehren(bauWep(), undefined, ich)).toBe(true)
    expect(kannZusammenfuehren(bauWep(), { id: 'w-bau', lokalGeaendertAm: JETZT, zusammenfuehrung: { aus: 'w-gruen', felder: [], am: JETZT, vorher: bauWep() } }, ich)).toBe(false)
    expect(kannZusammenfuehren({ ...bauWep(), ablauf: { ...bauWep().ablauf!, zustand: 'beim_bv' } }, undefined, ich)).toBe(false)
    expect(kannZusammenfuehren(bauWep(), undefined, { id: 'gruen-2', rollen: ['gruen'] })).toBe(false)
  })
})

describe('Vorschau', () => {
  it('Stammdaten: Bau gilt; leere Felder und der eigene Name sind vorgewählt, andere Unterschiede nicht', () => {
    const v = vorschau(bauWep(), gruenWep(), JETZT)
    expect(v.stammdaten.map((f) => [f.feld, f.art, f.vorgewaehlt, f.bau, f.gruen])).toEqual([
      ['weg', 'leer', true, '', 'Rosenweg'],
      ['unterpaechter', 'anders', false, 'Paula Pächterin', 'Paula Pächterin-Neu'],
      ['wertermittlerAussenAufwuchs', 'anders', true, 'Erika M.', 'Erika Musterfrau'],
    ])
    expect(v.gruen).toEqual({ aussenanlagen: 0, aufwuchs: 1, beseitigung: 0, skizze: 1, fotos: 2, unterschrift: true })
    expect(v.ersetztGruenImBau).toBe(false)
    expect(v.hinweise).toEqual([expect.stringMatching(/ohne Bau-Grundlage gezeichnet: Lage der Grün-Elemente zur Laube prüfen/)])
  })

  it('Grün-Teil im Bau-WEP schon vorbereitet: wird ersetzt (Hinweis in der Vorschau)', () => {
    const b = bauWep()
    b.gruen = { ...b.gruen, aussenanlagen: [{ id: 'p-zaun' } as unknown as Wep['gruen']['aussenanlagen'][number]] }
    expect(vorschau(b, gruenWep(), JETZT).ersetztGruenImBau).toBe(true)
  })
})

describe('Ergebnis', () => {
  it('ein WEP mit der Kennung des Bau-WEP: Bau-Teil von Bau, Grün-Teil, Fotos und Unterschrift von Grün, Stammdaten je Feld', () => {
    const b = bauWep()
    b.gruen = { ...b.gruen, aussenanlagen: [{ id: 'p-zaun' } as unknown as Wep['gruen']['aussenanlagen'][number]] }
    b.fotos = [...b.fotos!, { id: 'f-zaun', positionId: 'p-zaun' } as Foto]
    const neu = fuehreZusammen(b, gruenWep(), ['unterpaechter'], JETZT)
    expect(neu.id).toBe('w-bau')
    expect(neu.bau).toEqual(b.bau)
    expect(neu.grundriss).toEqual(b.grundriss)
    expect(neu.gruen.aussenanlagen).toEqual([]) // der von Bau vorbereitete Grün-Teil wird ersetzt
    expect(neu.gruen.aufwuchs.map((p) => p.id)).toEqual(['p-hecke'])
    expect(neu.fotos?.map((f) => f.id)).toEqual(['f-laube', 'f-hecke', 'f-allg'])
    expect(neu.unterschriften).toEqual({ bau: 'data:image/png;base64,QkFV', gruen: 'data:image/png;base64,R1JVRU4=' })
    expect(neu.formalien).toMatchObject({ unterpaechter: 'Paula Pächterin-Neu', weg: '', kleingartenanlage: 'KGA Musterwiese' })
    expect(neu.ablauf).toEqual(b.ablauf)
  })

  it('Skizze: Grün-Elemente bleiben, die Bau-Skizze kommt als gesperrte Grundlage darunter; ohne Grün-Skizze keine', () => {
    const { skizze, hinweise } = skizzeZusammen(bauWep(), gruenWep(), JETZT)
    expect(skizze?.grundlage).toMatchObject({ quelle: 'bau', gesperrt: true })
    expect(skizze?.elemente.filter((e) => !istGrundlage(e)).map((e) => e.id)).toEqual(['s1'])
    expect(skizze?.elemente.some((e) => istGrundlage(e) && e.typ === 'bauform' && e.art === 'bauteil')).toBe(true)
    expect(hinweise).toHaveLength(1)
    // schon auf der Bau-Grundlage gezeichnet (z. B. aus der Bau-Excel): kein Hinweis
    const mitGrundlage = gruenWep()
    mitGrundlage.skizze = skizze
    expect(skizzeZusammen(bauWep(), mitGrundlage, JETZT).hinweise).toEqual([])
    const ohne = gruenWep()
    delete ohne.skizze
    expect(skizzeZusammen(bauWep(), ohne, JETZT)).toEqual({ hinweise: [] })
    expect(fuehreZusammen(bauWep(), ohne, [], JETZT).skizze).toBeUndefined()
  })

  it('Parzelle: die des Bau-WEP gilt; Unterschied nur als Hinweis', () => {
    const b = bauWep()
    b.parzelle = { form: 'rechteck', laenge: 20, breite: 12 }
    const g = gruenWep()
    g.parzelle = { form: 'rechteck', laenge: 25, breite: 12 }
    const v = vorschau(b, g, JETZT)
    expect(v.hinweise[0]).toMatch(/Parzelle des Bau-WEP gilt/)
    const neu = fuehreZusammen(b, g, [], JETZT)
    expect(neu.parzelle).toEqual(b.parzelle)
    expect(neu.skizze?.grundlage?.quelle).toBe('bau')
  })

  it('Parzelle: hat das Bau-WEP keine, kommt die von Grün – mit Hinweis „bitte mit Bau abstimmen“; die Skizze liegt darauf', () => {
    const b = bauWep()
    delete b.grundriss
    const g = gruenWep()
    g.parzelle = { form: 'rechteck', laenge: 25, breite: 12 }
    expect(vorschau(b, g, JETZT).hinweise).toContain('Parzelle von Grün übernommen – bitte mit Bau abstimmen.')
    const neu = fuehreZusammen(b, g, [], JETZT)
    expect(neu.parzelle).toEqual(g.parzelle)
    expect(neu.skizze?.grundlage?.quelle).toBe('parzelle')
    expect(neu.skizze?.massstab).toBeDefined()
    // weder Bau noch Grün haben eine: keine
    expect(fuehreZusammen(bauWep(), gruenWep(), [], JETZT).parzelle).toBeUndefined()
  })
})

describe('Felder des Bau-Teils (Sicherheitsprüfung N12)', () => {
  it('die Vorschau bietet den Namen des Bau-Wertermittlers nicht an, und das Zusammenführen übernimmt ihn nie', () => {
    const bau = neuerWep('bau-n12')
    bau.formalien.wertermittlerBaulichkeiten = 'Bert Bauer'
    const gruen = neuerWep('gruen-n12')
    gruen.formalien.wertermittlerBaulichkeiten = 'Falscher Name'
    gruen.formalien.auftraggeber = 'Gartenfreunde e. V.'
    const v = vorschau(bau, gruen)
    expect(v.stammdaten.map((f) => f.feld)).not.toContain('wertermittlerBaulichkeiten')
    expect(v.stammdaten.map((f) => f.feld)).toContain('auftraggeber')
    const erg = fuehreZusammen(bau, gruen, ['wertermittlerBaulichkeiten', 'auftraggeber'])
    expect(erg.formalien.wertermittlerBaulichkeiten).toBe('Bert Bauer')
    expect(erg.formalien.auftraggeber).toBe('Gartenfreunde e. V.')
  })
})
