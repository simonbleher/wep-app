import { describe, expect, it, vi } from 'vitest'
import type { VersionInfo } from '@/android/update'
import type { WebInfo } from './api'
import { alsWindowsVersion, entscheideWindowsUpdate } from './update'
import { installiereProgrammUpdate, pruefeWindowsUpdate, type WindowsUpdateDeps } from './updateAblauf'

const alt: VersionInfo = { versionName: '0.1.0', versionCode: 0, commit: 'a', gebautAm: '2026-10-20T12:00:00Z', nativeVersion: 1, releaseUrl: '' }
const neu: VersionInfo = {
  versionName: '0.1.0',
  versionCode: 0,
  commit: 'b',
  gebautAm: '2026-10-20T13:00:00Z',
  nativeVersion: 1, // = windowsHuelle der gehosteten Fassung
  bundleUrl: 'https://wep-pankow.pages.dev/updates/b.zip',
  bundleSha256: 'ab'.repeat(32),
  releaseUrl: '',
}
const gehostet = (extra: object = {}) => ({ ...neu, windowsHuelle: 1, nativeVersion: 99, ...extra })

describe('alsWindowsVersion', () => {
  it('nimmt windowsHuelle (nicht die Android-nativeVersion) als Hüllen-Nummer', () => {
    expect(alsWindowsVersion(gehostet({ windowsHuelle: 3 }))?.nativeVersion).toBe(3)
  })
  it('ältere version.json ohne windowsHuelle: keine Nummer, also kein Live-Update', () => {
    const { windowsHuelle: _w, ...ohne } = gehostet()
    expect(alsWindowsVersion(ohne)?.nativeVersion).toBeUndefined()
  })
  it('ungültige Eingabe', () => {
    expect(alsWindowsVersion(null)).toBeNull()
    expect(alsWindowsVersion({})).toBeNull()
  })
})

describe('entscheideWindowsUpdate', () => {
  const opt = { huelleInstalliert: 1 }
  it('neuer Commit, gleiche Hülle: Live-Update', () => {
    expect(entscheideWindowsUpdate(alt, neu, opt).art).toBe('live')
  })
  it('gleicher Commit: nichts zu tun', () => {
    expect(entscheideWindowsUpdate(neu, neu, opt).art).toBe('keins')
  })
  it('höhere Hüllen-Nummer: neues Programm nötig, kein Live-Update', () => {
    expect(entscheideWindowsUpdate(alt, { ...neu, nativeVersion: 2 }, opt).art).toBe('nativ')
  })
  it('Paket für eine ältere Hülle wird nicht angewendet', () => {
    expect(entscheideWindowsUpdate(alt, { ...neu, nativeVersion: 0 }, { huelleInstalliert: 1 }).art).toBe('keins')
  })
  it('Tauri-Updater kennt eine neuere .exe: neues Programm, auch ohne neue Hülle', () => {
    expect(entscheideWindowsUpdate(neu, neu, { ...opt, programmNeu: '0.2.0' }).art).toBe('nativ')
  })
  it('gesperrter Commit (Rückfall nach Fehlstart) wird nicht erneut geladen', () => {
    const e = entscheideWindowsUpdate(alt, neu, { ...opt, fehlgeschlagen: ['b'] })
    expect(e.art).toBe('keins')
    expect(e.grund).toMatch(/^Rückfall/)
  })
  it('schon geladenes Paket wartet auf den Neustart', () => {
    const e = entscheideWindowsUpdate(alt, neu, { ...opt, bereitCommit: 'b' })
    expect(e.art).toBe('keins')
    expect(e.grund).toMatch(/^schon geladen/)
  })
  it('Paket ohne Prüfsumme wird nicht geladen', () => {
    expect(entscheideWindowsUpdate(alt, { ...neu, bundleSha256: undefined }, opt).art).toBe('keins')
  })
})

function bauDeps(o: { gehostet?: object; info?: Partial<WebInfo['zustand']>; huelle?: number; programm?: { version: string; notizen: null } | null | Error; online?: boolean } = {}) {
  const info: WebInfo = {
    zustand: { aktiv: null, naechste: null, unbestaetigt: null, fehlgeschlagen: [], ...o.info },
    huelle: o.huelle ?? 1,
    programm: '0.1.0',
  }
  const paketLaden = vi.fn(async () => undefined)
  const deps: WindowsUpdateDeps = {
    holeJson: async () => o.gehostet ?? gehostet(),
    installiert: async () => alt,
    info: async () => info,
    programmPruefen: async () => {
      if (o.programm instanceof Error) throw o.programm
      return o.programm ?? null
    },
    paketLaden,
    online: () => o.online ?? true,
    jetzt: () => Date.parse('2026-10-20T14:00:00Z'),
  }
  return { deps, paketLaden }
}

describe('pruefeWindowsUpdate', () => {
  it('lädt das Paket über das Programm (Commit + Prüfsumme) und meldet „bereit“', async () => {
    const t = bauDeps()
    const s = await pruefeWindowsUpdate(t.deps)
    expect(s.art).toBe('live-bereit')
    expect(t.paketLaden).toHaveBeenCalledWith('b', neu.bundleSha256)
  })

  it('offline: nichts laden', async () => {
    const t = bauDeps({ online: false })
    expect((await pruefeWindowsUpdate(t.deps)).art).toBe('offline')
    expect(t.paketLaden).not.toHaveBeenCalled()
  })

  it('aktuell, wenn der Commit gleich ist', async () => {
    const t = bauDeps({ gehostet: gehostet({ commit: 'a', gebautAm: alt.gebautAm }) })
    expect((await pruefeWindowsUpdate(t.deps)).art).toBe('aktuell')
  })

  it('neue Programmversion hat Vorrang vor dem Web-Paket', async () => {
    const t = bauDeps({ programm: { version: '0.2.0', notizen: null } })
    const s = await pruefeWindowsUpdate(t.deps)
    expect(s.art).toBe('nativ')
    expect(s.meldung).toContain('0.2.0')
    expect(t.paketLaden).not.toHaveBeenCalled()
  })

  it('höhere Hüllen-Nummer ohne Programm-Update: „nativ“ (die .exe wird noch gebaut)', async () => {
    const t = bauDeps({ gehostet: gehostet({ windowsHuelle: 2 }) })
    expect((await pruefeWindowsUpdate(t.deps)).art).toBe('nativ')
  })

  it('Fehler des Programm-Updaters (Schlüssel fehlt) stoppen das Live-Update nicht', async () => {
    const t = bauDeps({ programm: new Error('Programm-Update nicht eingerichtet') })
    expect((await pruefeWindowsUpdate(t.deps)).art).toBe('live-bereit')
  })

  it('gesperrter Commit wird nicht erneut geladen', async () => {
    const t = bauDeps({ info: { fehlgeschlagen: ['b'] } })
    const s = await pruefeWindowsUpdate(t.deps)
    expect(s.art).toBe('aktuell')
    expect(s.meldung).toContain('zurückgenommen')
    expect(t.paketLaden).not.toHaveBeenCalled()
  })

  it('bereits vorgemerktes Paket wird nicht noch einmal geladen', async () => {
    const t = bauDeps({ info: { naechste: 'b' } })
    expect((await pruefeWindowsUpdate(t.deps)).art).toBe('live-bereit')
    expect(t.paketLaden).not.toHaveBeenCalled()
  })

  it('Fehler beim Laden wird gemeldet, wirft nicht', async () => {
    const t = bauDeps()
    t.paketLaden.mockRejectedValueOnce(new Error('Prüfsumme stimmt nicht – Paket verworfen'))
    const s = await pruefeWindowsUpdate(t.deps)
    expect(s.art).toBe('fehler')
    expect(s.meldung).toContain('Prüfsumme')
  })
})

describe('installiereProgrammUpdate', () => {
  it('lädt und installiert mit Fortschritt', async () => {
    const programmInstallieren = vi.fn(async (f: (x: { geladen: number; gesamt: number }) => void) => f({ geladen: 5, gesamt: 10 }))
    const fortschritt = vi.fn()
    const u = await installiereProgrammUpdate({ programmPruefen: async () => ({ version: '0.2.0', notizen: null }), programmInstallieren }, fortschritt)
    expect(u.version).toBe('0.2.0')
    expect(fortschritt).toHaveBeenCalledWith({ geladen: 5, gesamt: 10 })
  })

  it('noch keine .exe veröffentlicht: Hinweis statt Download', async () => {
    const programmInstallieren = vi.fn()
    await expect(installiereProgrammUpdate({ programmPruefen: async () => null, programmInstallieren }, vi.fn())).rejects.toThrow('wird noch gebaut')
    expect(programmInstallieren).not.toHaveBeenCalled()
  })

  it('Installation scheitert (z. B. Signatur): verständlicher Text', async () => {
    await expect(
      installiereProgrammUpdate(
        { programmPruefen: async () => ({ version: '0.2.0', notizen: null }), programmInstallieren: async () => Promise.reject(new Error('Signatur ungültig')) },
        vi.fn(),
      ),
    ).rejects.toThrow('Die Installation ist fehlgeschlagen: Signatur ungültig')
  })
})
