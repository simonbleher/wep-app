// @vitest-environment node
// „Ohne Excel arbeiten“ (Standard): keine Excel-Funktionen in der Oberfläche, das PDF bleibt.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ladeGeraeteEinstellungen } from '@/profil'
import { neuerWep } from '@/model'
import { PdfBereich } from '../PdfExport'
import { TeilenDialog } from '../TeilenDialog'

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

describe('Ohne Excel arbeiten', () => {
  it('ist standardmäßig an', () => {
    expect(ladeGeraeteEinstellungen().ohneExcel).toBe(true)
  })

  it('PDF-Export nennt keine Excel-Datei', () => {
    const h = render(createElement(PdfBereich, { wep: neuerWep('2026-001'), rolle: 'gruen' }))
    expect(h).toContain('Export als PDF')
    expect(h).not.toContain('Excel')
  })

  it('Teilen bietet keine Bau-Excel an', () => {
    const h = render(createElement(TeilenDialog, { wep: neuerWep('2026-001'), appVersion: 'test', onSchliessen: () => {} }))
    expect(h).toContain('Fotos mitschicken')
    expect(h).not.toContain('Bau-Excel')
  })
})
