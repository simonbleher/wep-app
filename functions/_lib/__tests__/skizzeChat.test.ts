import { beforeEach, describe, expect, it } from 'vitest'
import { leereSperren } from '../kette'
import { skizzeChat, type ChatEingabe } from '../skizzeChat'

const KEY = 'GEHEIMER-SCHLUESSEL-123'
const eingabe: ChatEingabe = { nachricht: 'oben drei Beete', szene: '{"masse_pt":[445,600],"elemente":[]}', bild: 'AAAA' }

const antwortOk = (name = 'fertig') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args: {} } }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } }), { status: 200 })
const fehler = (status: number, message: string, details: unknown[] = []) =>
  new Response(JSON.stringify({ error: { message, details } }), { status })

function fake(antworten: Record<string, () => Response>) {
  const aufrufe: { modell: string; body: any; kopf: Record<string, string>; url: string }[] = []
  const f = (async (url: string, init: RequestInit) => {
    const modell = /models\/([^:]+):/.exec(url)![1]
    aufrufe.push({ modell, body: JSON.parse(String(init.body)), kopf: init.headers as Record<string, string>, url })
    return antworten[modell]()
  }) as unknown as typeof fetch
  return { f, aufrufe }
}

beforeEach(() => leereSperren())

describe('POST skizze-chat (Kern)', () => {
  it('schickt Funktionen im Modus ANY, Bild und Szene; Key nur im Header', async () => {
    const { f, aufrufe } = fake({ a: () => antwortOk('hinzufuegen') })
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a'], fetch: f })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ modell: 'a', aufrufe: [{ name: 'hinzufuegen' }], tokensEin: 5 })
    const a = aufrufe[0]
    expect(a.url).not.toContain(KEY)
    expect(a.kopf['x-goog-api-key']).toBe(KEY)
    expect(a.body.toolConfig.functionCallingConfig.mode).toBe('ANY')
    expect(a.body.tools[0].functionDeclarations.map((x: { name: string }) => x.name)).toContain('reihe')
    expect(a.body.contents[0].parts[1].inlineData.data).toBe('AAAA')
    expect(a.body.contents[0].parts[0].text).toContain('oben drei Beete')
  })

  it('429 sperrt das Modell und nimmt das nächste; 503 genauso', async () => {
    const { f, aufrufe } = fake({
      a: () => fehler(429, 'Quota', [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }]),
      b: () => fehler(503, 'overloaded'),
      c: () => antwortOk(),
    })
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b', 'c'], fetch: f })
    expect(r.status).toBe(200)
    expect((r.body as { modell: string }).modell).toBe('c')
    // zweite Anfrage: a und b sind noch gesperrt → direkt c
    await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b', 'c'], fetch: f })
    expect(aufrufe.map((x) => x.modell)).toEqual(['a', 'b', 'c', 'c'])
  })

  it('nach Ablauf der Sperre geht es wieder beim besten Modell los', async () => {
    let jetzt = 1_000_000
    let a429 = true
    const { f, aufrufe } = fake({ a: () => (a429 ? fehler(429, 'Quota', [{ '@type': 'x.RetryInfo', retryDelay: '10s' }]) : antwortOk()), b: () => antwortOk() })
    await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b'], fetch: f, jetzt: () => jetzt })
    a429 = false
    jetzt += 11_000
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b'], fetch: f, jetzt: () => jetzt })
    expect((r.body as { modell: string }).modell).toBe('a')
    expect(aufrufe.map((x) => x.modell)).toEqual(['a', 'b', 'a'])
  })

  it('alle Modelle 429/503 → HTTP 503 mit Wartezeit', async () => {
    const { f } = fake({ a: () => fehler(429, 'Quota'), b: () => fehler(503, 'overloaded') })
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b'], fetch: f })
    expect(r.status).toBe(503)
    expect((r.body as { erneutNachSek: number }).erneutNachSek).toBeGreaterThan(0)
  })

  it('Antwort ohne Function Call → nächstes Modell', async () => {
    const leer = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hallo' }] } }] }), { status: 200 })
    const { f } = fake({ a: leer, b: () => antwortOk() })
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b'], fetch: f })
    expect((r.body as { modell: string }).modell).toBe('b')
  })

  it('verrät den Key nie, auch nicht in Fehlertexten', async () => {
    const { f } = fake({ a: () => fehler(400 + 29 === 429 ? 400 : 400, `bad key ${KEY}`), b: () => fehler(500, `kaputt ${KEY}`) })
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b'], fetch: f })
    expect(JSON.stringify(r)).not.toContain(KEY)
  })

  it('Key abgelehnt (403) → 502 ohne weitere Modelle', async () => {
    const { f, aufrufe } = fake({ a: () => fehler(403, 'denied'), b: () => antwortOk() })
    const r = await skizzeChat(eingabe, { apiKey: KEY, modelle: ['a', 'b'], fetch: f })
    expect(r.status).toBe(502)
    expect(aufrufe).toHaveLength(1)
  })

  it('prüft die Eingabe', async () => {
    const { f } = fake({ a: () => antwortOk() })
    for (const kaputt of [{ ...eingabe, nachricht: '' }, { ...eingabe, szene: '' }, { ...eingabe, bild: 'x'.repeat(4_000_000) }, { ...eingabe, modus: 'foo' as never }, { ...eingabe, nachricht: 'x'.repeat(3000) }]) {
      expect((await skizzeChat(kaputt, { apiKey: KEY, modelle: ['a'], fetch: f })).status).toBe(400)
    }
    expect((await skizzeChat(eingabe, { apiKey: '', modelle: ['a'], fetch: f })).status).toBe(500)
  })

  it('Modus pruefen nutzt den Prüf-Prompt mit Befunden', async () => {
    const { f, aufrufe } = fake({ a: () => antwortOk() })
    await skizzeChat({ ...eingabe, modus: 'pruefen', befunde: ['Beet überlappt Laube'] }, { apiKey: KEY, modelle: ['a'], fetch: f })
    expect(aufrufe[0].body.systemInstruction.parts[0].text).toContain('Selbstprüfung')
    expect(aufrufe[0].body.contents[0].parts[0].text).toContain('Beet überlappt Laube')
  })
})
