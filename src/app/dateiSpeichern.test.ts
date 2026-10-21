import { afterEach, describe, expect, it, vi } from 'vitest'

// Die Weiche in speichereDatei: Browser = Download, Android-App = Plugin, Windows-Programm = Rust-Befehl.
const { capacitor, windows, wepNative, wepWindows } = vi.hoisted(() => ({
  capacitor: { nativ: false },
  windows: { app: false },
  wepNative: { dateiBeginnen: vi.fn(), dateiAnhaengen: vi.fn(), dateiSpeichern: vi.fn() },
  wepWindows: { dateiSpeichern: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => capacitor.nativ } }))
vi.mock('@/android/native', () => ({ WepNative: wepNative }))
vi.mock('@/windows/plattform', () => ({ istWindowsApp: () => windows.app }))
vi.mock('@/windows/api', () => ({ WepWindows: wepWindows }))

import { speichereDatei, speicherText, waehleSpeicherWeg } from './dateiSpeichern'

afterEach(() => {
  capacitor.nativ = false
  windows.app = false
  vi.clearAllMocks()
})

describe('waehleSpeicherWeg', () => {
  it('Browser', () => expect(waehleSpeicherWeg({ androidApp: false, windowsApp: false })).toBe('browser'))
  it('Android-App', () => expect(waehleSpeicherWeg({ androidApp: true, windowsApp: false })).toBe('android'))
  it('Windows-Programm', () => expect(waehleSpeicherWeg({ androidApp: false, windowsApp: true })).toBe('windows'))
  it('Android hat Vorrang', () => expect(waehleSpeicherWeg({ androidApp: true, windowsApp: true })).toBe('android'))
})

describe('speichereDatei', () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/zip' })

  it('Windows: Bytes und Name gehen an den Windows-Dialog; gespeichert / abgebrochen', async () => {
    windows.app = true
    wepWindows.dateiSpeichern.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await speichereDatei(blob, 'Sicherung.zip')).toBe('gespeichert')
    expect(await speichereDatei(blob, 'Sicherung.zip')).toBe('abgebrochen')
    const [daten, name] = wepWindows.dateiSpeichern.mock.calls[0]
    expect(Array.from(daten as Uint8Array)).toEqual([1, 2, 3, 4])
    expect(name).toBe('Sicherung.zip')
    expect(wepNative.dateiBeginnen).not.toHaveBeenCalled()
  })

  it('Android: über das Plugin in Stücken, nicht über Windows', async () => {
    capacitor.nativ = true
    wepNative.dateiSpeichern.mockResolvedValueOnce({ gespeichert: true })
    expect(await speichereDatei(blob, 'a.zip')).toBe('gespeichert')
    expect(wepNative.dateiBeginnen).toHaveBeenCalledOnce()
    expect(wepNative.dateiAnhaengen).toHaveBeenCalledOnce()
    expect(wepNative.dateiSpeichern).toHaveBeenCalledWith({ name: 'a.zip', typ: 'application/zip' })
    expect(wepWindows.dateiSpeichern).not.toHaveBeenCalled()
  })

  it('Browser: Download über einen Link', async () => {
    const klicks: string[] = []
    const erzeugt = vi.fn(() => 'blob:test')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: erzeugt, revokeObjectURL: vi.fn() }))
    vi.stubGlobal('document', {
      createElement: () => ({ click() { klicks.push((this as unknown as { download: string }).download) } }),
    })
    expect(await speichereDatei(blob, 'wep.xlsx')).toBe('heruntergeladen')
    expect(klicks).toEqual(['wep.xlsx'])
    expect(wepWindows.dateiSpeichern).not.toHaveBeenCalled()
    expect(wepNative.dateiBeginnen).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('speicherText', () => {
  it('Meldungen', () => {
    expect(speicherText('gespeichert', 'a.zip')).toBe('a.zip gespeichert')
    expect(speicherText('abgebrochen', 'a.zip')).toContain('nicht gespeichert')
    expect(speicherText('heruntergeladen', 'a.zip')).toBe('a.zip heruntergeladen')
  })
})
