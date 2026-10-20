// @vitest-environment node
// Schalter KI_AKTIV: aus → im Skizzen-Tab ist nichts KI-artiges sichtbar; an → Chat da.
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Wep } from '@/model'

const wep = { skizze: undefined } as unknown as Wep

async function rendere(aktiv: boolean): Promise<string> {
  vi.resetModules()
  vi.doMock('@/funktionen', () => ({ KI_AKTIV: aktiv }))
  const { SkizzeTab } = await import('../SkizzeTab')
  return renderToStaticMarkup(createElement(SkizzeTab, { wep, onSpeichern: async () => {} }))
}

describe('KI-Schalter im Skizzen-Tab', () => {
  it('aus: kein Chat, kein KI-Hinweis', async () => {
    const html = await rendere(false)
    expect(html).toContain('Skizze Außenanlagen')
    expect(html).not.toMatch(/chat|\bKI\b|Beschreibung im Chat|Diktat/i)
  })

  it('an: Chat-Leiste ist da', async () => {
    const html = await rendere(true)
    expect(html).toMatch(/chat/i)
  })
})
