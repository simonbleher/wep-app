import { describe, expect, it } from 'vitest'
import { erstelleGraphClient, GraphFehler } from './graph'

type Aufruf = { methode: string; url: string }

/** Minimaler fetch-Mock: Antworten je „METHODE url-Teil“. */
function mock(regeln: Array<[string, RegExp, number, unknown?]>) {
  const aufrufe: Aufruf[] = []
  const holen = (async (url: string, init?: RequestInit) => {
    const methode = init?.method ?? 'GET'
    aufrufe.push({ methode, url })
    for (const [m, muster, status, body] of regeln) {
      if (m === methode && muster.test(url)) {
        return new Response(body === undefined ? null : JSON.stringify(body), { status })
      }
    }
    return new Response(JSON.stringify({ error: { code: 'unerwartet', message: url } }), { status: 500 })
  }) as unknown as typeof fetch
  return { holen, aufrufe }
}

const token = async () => 't'
const ALT = { name: '2026-001.json', eTag: 'e', lastModifiedDateTime: 'x', file: {} }

describe('Ordner anlegen im App-Ordner', () => {
  it('legt fehlenden Ordner über die Id des App-Ordners an (nicht special/approot/children)', async () => {
    let angelegt = false
    const { holen, aufrufe } = mock([
      ['GET', /approot:\/daten\?\$select=id$/, 404, { error: { code: 'itemNotFound' } }],
      ['GET', /approot\?\$select=id$/, 200, { id: 'ROOT!1' }],
      ['POST', /\/items\/ROOT!1\/children$/, 201, { id: 'DATEN!1', name: 'daten' }],
      ['PATCH', /approot:\/2026-001\.json:$/, 200, ALT],
    ])
    const c = erstelleGraphClient(token, holen)
    expect(await c.verschiebe('2026-001.json', 'daten')).toBe('verschoben')
    angelegt = aufrufe.some((a) => a.methode === 'POST' && a.url.includes('/items/ROOT!1/children'))
    expect(angelegt).toBe(true)
    expect(aufrufe.some((a) => a.methode === 'POST' && a.url.endsWith('special/approot/children'))).toBe(false)
  })

  it('Rückfall bei 400: Ordner per Upload anlegen, Hilfsdatei löschen', async () => {
    let ordnerDa = false
    const aufrufe: Aufruf[] = []
    const holen = (async (url: string, init?: RequestInit) => {
      const methode = init?.method ?? 'GET'
      aufrufe.push({ methode, url })
      if (methode === 'GET' && /approot:\/daten\?\$select=id$/.test(url))
        return ordnerDa
          ? new Response(JSON.stringify({ id: 'DATEN!2' }), { status: 200 })
          : new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 })
      if (methode === 'GET' && /approot\?\$select=id$/.test(url))
        return new Response(JSON.stringify({ id: 'ROOT!1' }), { status: 200 })
      if (methode === 'POST') return new Response(JSON.stringify({ error: { code: 'invalidRequest' } }), { status: 400 })
      if (methode === 'PUT' && url.includes('daten/.ordner-anlegen')) {
        ordnerDa = true
        return new Response(JSON.stringify({ name: '.ordner-anlegen', eTag: 'e', lastModifiedDateTime: 'x' }), { status: 201 })
      }
      if (methode === 'DELETE') return new Response(null, { status: 204 })
      if (methode === 'PATCH') return new Response(JSON.stringify(ALT), { status: 200 })
      return new Response(null, { status: 500 })
    }) as unknown as typeof fetch
    const c = erstelleGraphClient(token, holen)
    expect(await c.verschiebe('2026-001.json', 'daten')).toBe('verschoben')
    expect(aufrufe.some((a) => a.methode === 'DELETE' && a.url.includes('.ordner-anlegen'))).toBe(true)
  })

  it('Fehlermeldung enthält den Graph-Fehlertext', async () => {
    const { holen } = mock([['GET', /children/, 400, { error: { code: 'invalidRequest', message: 'Ungültig' } }]])
    const c = erstelleGraphClient(token, holen)
    await expect(c.liste()).rejects.toThrow(/400.*invalidRequest: Ungültig/)
    await expect(c.liste()).rejects.toBeInstanceOf(GraphFehler)
  })
})
