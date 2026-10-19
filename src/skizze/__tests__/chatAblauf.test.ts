import { describe, expect, it } from 'vitest'
import { fuehreChatAus, type ChatAnfrage } from '../chatAblauf'
import type { Szene } from '../szene'

const szene = (): Szene => ({
  masse: { b: 445, h: 600 },
  elemente: [{ id: 'b1', typ: 'bau', x: 300, y: 400, b: 400, h: 150, beschriftung: 'Laube', fest: true }],
})

function deps(antworten: Array<{ aufrufe: { name: string; args?: Record<string, unknown> }[] } | Error>) {
  const anfragen: ChatAnfrage[] = []
  let i = 0
  return {
    anfragen,
    d: {
      rendere: async () => 'PNG',
      rufe: async (a: ChatAnfrage) => {
        anfragen.push(a)
        const r = antworten[i++]
        if (r instanceof Error) throw r
        return { ...r, modell: 'test-modell' }
      },
    },
  }
}

describe('fuehreChatAus', () => {
  it('wendet die Aufrufe an und prüft danach genau einmal', async () => {
    const { d, anfragen } = deps([
      { aufrufe: [{ name: 'hinzufuegen', args: { typ: 'baum', x: 100, y: 100 } }] },
      { aufrufe: [{ name: 'fertig' }] },
    ])
    const e = await fuehreChatAus(szene(), 'ein Baum oben links', d)
    expect(e.szene.elemente).toHaveLength(2)
    expect(e.schritte).toHaveLength(1)
    expect(anfragen.map((a) => a.modus)).toEqual(['bearbeiten', 'pruefen'])
    expect(anfragen[1].szene).toContain('"typ":"baum"')
    expect(e.pruefung).toBe('passt')
  })

  it('macht höchstens eine Korrekturrunde', async () => {
    const { d, anfragen } = deps([
      { aufrufe: [{ name: 'hinzufuegen', args: { typ: 'baum', x: 100, y: 100 } }] },
      { aufrufe: [{ name: 'verschieben', args: { id: 'e1', x: 150, y: 100 } }] },
      { aufrufe: [{ name: 'verschieben', args: { id: 'e1', x: 900, y: 900 } }] },
    ])
    const e = await fuehreChatAus(szene(), 'x', d)
    expect(anfragen).toHaveLength(2)
    expect(e.schritte.map((s) => !!s.pruefung)).toEqual([false, true])
    const baum = e.szene.elemente.find((x) => x.id === 'e1')!
    expect(baum.x + baum.b / 2).toBeCloseTo(150, 0)
  })

  it('übergibt Befunde des Codes an die Prüfung', async () => {
    const { d, anfragen } = deps([
      { aufrufe: [{ name: 'hinzufuegen', args: { typ: 'hochbeet', x: 500, y: 470 } }] },
      { aufrufe: [{ name: 'fertig' }] },
    ])
    await fuehreChatAus(szene(), 'x', d)
    expect(anfragen[1].befunde?.some((b) => b.includes('Laube'))).toBe(true)
  })

  it('lässt feste Elemente unverändert und meldet es', async () => {
    const { d } = deps([{ aufrufe: [{ name: 'loeschen', args: { id: 'b1' } }] }])
    const e = await fuehreChatAus(szene(), 'Laube weg', d)
    expect(e.szene.elemente).toHaveLength(1)
    expect(e.schritte[0].ok).toBe(false)
  })

  it('ohne Änderung keine Prüfung; Hinweis der KI wird durchgereicht', async () => {
    const { d, anfragen } = deps([{ aufrufe: [{ name: 'hinweis', args: { text: 'Welches Beet?' } }] }])
    const e = await fuehreChatAus(szene(), 'das Beet', d)
    expect(anfragen).toHaveLength(1)
    expect(e.hinweise).toEqual(['Welches Beet?'])
  })

  it('Serverfehler: Szene bleibt, Fehler wird gemeldet', async () => {
    const { d } = deps([new Error('ausgelastet')])
    const s = szene()
    const e = await fuehreChatAus(s, 'x', d)
    expect(e.fehler).toBe('ausgelastet')
    expect(e.szene).toBe(s)
  })

  it('Prüfung fällt aus: Änderungen bleiben', async () => {
    const { d } = deps([{ aufrufe: [{ name: 'hinzufuegen', args: { typ: 'baum', x: 100, y: 100 } }] }, new Error('503')])
    const e = await fuehreChatAus(szene(), 'x', d)
    expect(e.szene.elemente).toHaveLength(2)
    expect(e.pruefung).toContain('nicht möglich')
  })
})
