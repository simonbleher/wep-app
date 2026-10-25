// Beta 3, Paket 6: Suche, Status-Filter und Sortierung der WEP-Liste.
import { describe, expect, it } from 'vitest'
import { neuerWep, type Wep } from '@/model'
import { passtZurSuche, waehleWeps, type ListenAuswahl } from '../wepListe'

function wep(id: string, f: Partial<Wep['formalien']> = {}, status?: Wep['status']): Wep {
  const w = neuerWep(id)
  w.formalien = { ...w.formalien, ...f }
  if (status) w.status = status
  return w
}

const LISTE = [
  wep('2026-001', { kleingartenanlage: 'KGA Musterwiese', parzelle: '42', unterpaechter: 'Erika Musterfrau', weg: 'Lindenweg' }),
  wep('2026-002', { kleingartenanlage: 'KGA Hügelblick', parzelle: '7a', unterpaechter: 'Familie Beispiel' }, 'fertig'),
  wep('2026-010', { kleingartenanlage: 'KGA Musterwiese', parzelle: '108', unterpaechter: 'Hans Beispiel' }, 'exportiert'),
  wep('2025-120', { kleingartenanlage: 'KGA Seeblick', parzelle: '3', auftraggeber: 'Verein Beispielstadt' }),
]

const auswahl = (a: Partial<ListenAuswahl> = {}): ListenAuswahl => ({
  suchbegriff: '',
  status: 'alle',
  sortierung: 'nummer',
  geaendertAm: new Map(),
  ...a,
})
const ids = (a: Partial<ListenAuswahl>) => waehleWeps(LISTE, auswahl(a)).map((w) => w.id)

describe('Suche in der WEP-Liste', () => {
  it('findet nach Vorgangs-Nr., Anlage, Parzelle, Pächter und Weg', () => {
    expect(ids({ suchbegriff: '2025-120' })).toEqual(['2025-120'])
    expect(ids({ suchbegriff: 'seeblick' })).toEqual(['2025-120'])
    expect(ids({ suchbegriff: '108' })).toEqual(['2026-010'])
    expect(ids({ suchbegriff: 'erika' })).toEqual(['2026-001'])
    expect(ids({ suchbegriff: 'Lindenweg' })).toEqual(['2026-001'])
    expect(ids({ suchbegriff: 'Verein Beispielstadt' })).toEqual(['2025-120'])
  })

  it('ignoriert Groß-/Kleinschreibung und Umlaute', () => {
    expect(ids({ suchbegriff: 'HUEGELBLICK' })).toEqual(['2026-002'])
    expect(ids({ suchbegriff: 'hügelblick' })).toEqual(['2026-002'])
  })

  it('jedes Wort muss vorkommen, in beliebiger Reihenfolge', () => {
    expect(ids({ suchbegriff: 'beispiel 108' })).toEqual(['2026-010'])
    expect(ids({ suchbegriff: '108 beispiel' })).toEqual(['2026-010'])
    expect(ids({ suchbegriff: 'musterwiese beispiel' })).toEqual(['2026-010'])
    expect(ids({ suchbegriff: 'musterwiese seeblick' })).toEqual([])
  })

  it('leere oder nur aus Leerzeichen bestehende Suche zeigt alles', () => {
    expect(ids({ suchbegriff: '' })).toHaveLength(4)
    expect(ids({ suchbegriff: '   ' })).toHaveLength(4)
  })

  it('ohne Treffer: leere Liste', () => {
    expect(ids({ suchbegriff: 'Nirgendwo' })).toEqual([])
  })

  it('passtZurSuche einzeln', () => {
    expect(passtZurSuche(LISTE[0]!, 'Musterfrau')).toBe(true)
    expect(passtZurSuche(LISTE[0]!, 'Beispiel')).toBe(false)
  })
})

describe('Status-Filter zusammen mit der Suche', () => {
  it('filtert nach Status; fehlender Status heißt „in Arbeit“', () => {
    expect(ids({ status: 'in Arbeit' })).toEqual(['2026-001', '2025-120'])
    expect(ids({ status: 'fertig' })).toEqual(['2026-002'])
    expect(ids({ status: 'exportiert' })).toEqual(['2026-010'])
  })

  it('beides zusammen: Suche UND Status', () => {
    expect(ids({ suchbegriff: 'beispiel', status: 'fertig' })).toEqual(['2026-002'])
    expect(ids({ suchbegriff: 'beispiel', status: 'in Arbeit' })).toEqual(['2025-120'])
    expect(ids({ suchbegriff: 'musterfrau', status: 'fertig' })).toEqual([])
  })
})

describe('Sortierung', () => {
  it('nach Nummer: neueste zuerst, 2026-010 nach 2026-002', () => {
    expect(ids({ sortierung: 'nummer' })).toEqual(['2026-010', '2026-002', '2026-001', '2025-120'])
  })

  it('zuletzt geändert: nach Zeitpunkt aus den Sync-Metadaten', () => {
    const geaendertAm = new Map([
      ['2026-001', '2026-10-20T10:00:00.000Z'],
      ['2026-002', '2026-10-18T09:00:00.000Z'],
      ['2026-010', '2026-10-19T09:00:00.000Z'],
      ['2025-120', '2026-10-20T11:00:00.000Z'],
    ])
    expect(ids({ sortierung: 'geaendert', geaendertAm })).toEqual(['2025-120', '2026-001', '2026-010', '2026-002'])
  })

  it('zuletzt geändert: ohne Zeitpunkt nach hinten, dann nach Nummer', () => {
    const geaendertAm = new Map([['2026-002', '2026-10-20T10:00:00.000Z']])
    expect(ids({ sortierung: 'geaendert', geaendertAm })).toEqual(['2026-002', '2026-010', '2026-001', '2025-120'])
  })

  it('Nummer: nach Vorgangs-Nr. (nicht nach der internen UUID), ohne Nummer am Ende', () => {
    const mit = (id: string, nr: string) => ({ ...neuerWep(id), formalien: { ...neuerWep(id).formalien, vorgangsNr: nr } })
    const liste = [mit('ffff-1', '2026-003'), mit('0000-2', '2026-152'), mit('aaaa-3', ''), mit('9999-4', '2026-020')]
    expect(waehleWeps(liste, auswahl({ sortierung: 'nummer' })).map((w) => w.formalien.vorgangsNr)).toEqual(['2026-152', '2026-020', '2026-003', ''])
  })

  it('verändert die Eingabeliste nicht', () => {
    const vorher = LISTE.map((w) => w.id)
    waehleWeps(LISTE, auswahl({ sortierung: 'geaendert', suchbegriff: 'a' }))
    expect(LISTE.map((w) => w.id)).toEqual(vorher)
  })
})
