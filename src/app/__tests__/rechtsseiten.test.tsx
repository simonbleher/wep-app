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

  it('markieren fehlende Angaben des BV', () => {
    expect(ds).toContain('[BITTE ERGÄNZEN')
    expect(ds).toContain('Auftragsverarbeiter')
    expect(ds).toContain('Berliner Beauftragte für Datenschutz und Informationsfreiheit')
  })

  it('brauchen keine Anmeldung, kein Skript und keine externen Dateien (offline lesbar)', () => {
    for (const html of [ds, nb]) {
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/(src|href)="https?:\/\/(?!www\.datenschutz-berlin\.de)/)
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
