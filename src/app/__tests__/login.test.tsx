// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LoginBildschirm } from '../LoginBildschirm'

describe('Login-Bildschirm', () => {
  const html = renderToStaticMarkup(
    createElement(LoginBildschirm, { onAnmelden: () => {}, onOhneKonto: () => {} }),
  )

  it('zeigt App-Name, den großen Knopf und darunter den unauffälligen Textlink', () => {
    expect(html).toContain('WEP-App')
    expect(html).toContain('Mit Microsoft anmelden')
    expect(html).toContain('Ohne Konto fortfahren (nur auf diesem Gerät)')
    expect(html.indexOf('Mit Microsoft anmelden')).toBeLessThan(
      html.indexOf('Ohne Konto fortfahren'),
    )
    expect(html).toMatch(/class="btn btn-primary"[^>]*>Mit Microsoft anmelden/)
    expect(html).toMatch(/class="text-knopf login-ohne"[^>]*>Ohne Konto fortfahren/)
  })

  it('kommt ohne Emojis aus', () => {
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
