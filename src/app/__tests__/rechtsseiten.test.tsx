// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LoginBildschirm } from '../LoginBildschirm'
import { RechtLinks } from '../RechtLinks'

const lies = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf-8')

describe('Datenschutz und Nutzungsbedingungen', () => {
  const ds = lies('public/datenschutz.html')
  const nb = lies('public/nutzungsbedingungen.html')

  it('sind als Entwurf markiert und nennen den Kontakt nur per E-Mail', () => {
    for (const html of [ds, nb]) {
      expect(html).toContain('Entwurf – rechtlich noch nicht geprüft')
      expect(html).toContain('simon@bleher.name')
      expect(html).toContain('Stand: 28.10.2026')
      expect(html).not.toMatch(/straße|str\.\s*\d/i)
    }
  })

  it('nennen in der Testphase Simon Bleher als Verantwortlichen, keine offenen Platzhalter', () => {
    for (const html of [ds, nb]) expect(html).toContain('Testphase: Die App wird derzeit nur zu Testzwecken mit erfundenen Daten betrieben.')
    expect(ds).toContain('Verantwortlicher</strong> ist in der Testphase <strong>Simon Bleher')
    expect(ds).toContain('Art. 6 Abs. 1 lit. b DSGVO')
    expect(ds).toContain('höchstens 90 Tage')
    for (const html of [ds, nb]) expect(html).not.toContain('BITTE ERGÄNZEN')
    expect(ds).toContain('Version 6.4 vom 03.04.2026')
    expect(ds).toContain('Resend, Inc. (USA)')
    expect(ds).toContain('Stand 31.12.2025')
    expect(ds).toContain('Übermittlung in Drittländer')
    expect(ds).toContain('Art. 6 Abs. 1 lit. f DSGVO')
    expect(nb).toContain('werden diese Bedingungen angepasst (der BV übernimmt dann den Einsatz der App)')
  })

  it('sprechen nicht von „wir“', () => {
    for (const html of [ds, nb]) expect(html).not.toMatch(/\b[Ww]ir\b/)
    expect(ds).toContain('Berliner Beauftragte für Datenschutz und Informationsfreiheit')
  })

  it('brauchen keine Anmeldung, kein Skript und keine externen Dateien (offline lesbar)', () => {
    for (const html of [ds, nb]) {
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/(src|href)="https?:\/\/(?!www\.datenschutz-berlin\.de|www\.cloudflare\.com\/gdpr\/subprocessors\/)/)
    }
  })

  it('der Service Worker fällt für beide Adressen nicht auf die App zurück', () => {
    const cfg = lies('vite.config.ts')
    expect(cfg).toContain('/^\\/datenschutz/')
    expect(cfg).toContain('/^\\/nutzungsbedingungen/')
    expect(cfg).not.toMatch(/globIgnores:[^\n]*(datenschutz|nutzungsbedingungen)/)
  })

  it('sind von Anmeldung, Startseite, Profil und Anleitungen aus verlinkt', () => {
    const links = renderToStaticMarkup(createElement(RechtLinks))
    expect(links).toContain('datenschutz.html')
    expect(links).toContain('nutzungsbedingungen.html')
    expect(renderToStaticMarkup(createElement(LoginBildschirm, { onAnmelden: () => {}, onOhneKonto: () => {} }))).toContain('datenschutz.html')
    for (const p of ['src/app/Startseite.tsx', 'src/app/Profil.tsx', 'src/server/V2Tor.tsx']) expect(lies(p)).toContain('<RechtLinks')
    for (const p of ['public/anleitung/index.html', 'public/anleitung-v2/index.html']) expect(lies(p)).toContain('datenschutz.html')
  })
})
