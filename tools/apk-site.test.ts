import { describe, expect, it } from 'vitest'
// @ts-expect-error reines JS-Modul ohne Typen
import { baueLatestJson, baueWindowsJson, BASIS_URL, headersFuer, HEADERS_ANDROID } from './apk-site.mjs'

describe('apk-site', () => {
  it('latest.json für den Tauri-Updater', () => {
    const j = baueLatestJson({ version: '0.2.0', notizen: 'Neu', signatur: 'SIG\n', url: `${BASIS_URL}/windows/wep-setup.exe`, zeit: '2026-10-21T12:00:00.000Z' })
    expect(j).toEqual({
      version: '0.2.0',
      notes: 'Neu',
      pub_date: '2026-10-21T12:00:00.000Z',
      platforms: { 'windows-x86_64': { signature: 'SIG', url: 'https://wep-pankow-apk.pages.dev/windows/wep-setup.exe' } },
    })
  })

  it('windows.json mit Prüfsumme', () => {
    const j = baueWindowsJson({ version: '0.2.0', daten: Buffer.from('abc'), zeit: 'Z' })
    expect(j.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(j.installerUrl).toBe('https://wep-pankow-apk.pages.dev/windows/wep-setup.exe')
  })

  it('_headers: Android-Regeln unverändert, Windows kommt dazu', () => {
    expect(headersFuer({ android: true, windows: false })).toBe(HEADERS_ANDROID)
    const beide = headersFuer({ android: true, windows: true })
    expect(beide.startsWith(HEADERS_ANDROID)).toBe(true)
    expect(beide).toContain('/windows/latest.json')
    expect(headersFuer({ android: false, windows: false })).toBe('')
  })
})
