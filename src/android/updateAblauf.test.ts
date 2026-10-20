import { describe, expect, it, vi } from 'vitest'
import { installiereNativesUpdate, pruefeAufUpdate, type GemerkterStand, type UpdateDeps } from './updateAblauf'

const alt = { versionName: '0.1.0', versionCode: 0, commit: 'a', gebautAm: '2026-10-20T12:00:00Z', nativeVersion: 1, releaseUrl: '' }
const neu = {
  versionName: '0.1.0',
  commit: 'b',
  gebautAm: '2026-10-20T13:00:00Z',
  nativeVersion: 1,
  bundleUrl: 'https://wep-pankow.pages.dev/updates/b.zip',
}

function bauDeps(o: { gehostet?: object; bundles?: { id: string; version: string; status: string }[]; unmetered?: boolean; nurWlan?: boolean; online?: boolean; gemerkt?: Partial<GemerkterStand> } = {}) {
  let gemerkt: GemerkterStand = { fehlgeschlagen: [], ...o.gemerkt }
  const updater = {
    download: vi.fn(async ({ version }: { url: string; version: string }) => ({ id: `id-${version}`, version })),
    next: vi.fn(async () => undefined),
    list: vi.fn(async () => ({ bundles: o.bundles ?? [] })),
  }
  const deps: UpdateDeps = {
    holeJson: async () => o.gehostet ?? neu,
    installiert: async () => alt,
    nativInstalliert: async () => 1,
    updater,
    netz: async () => ({ online: o.online ?? true, unmetered: o.unmetered ?? true }),
    nurWlan: () => o.nurWlan ?? true,
    lade: () => gemerkt,
    speichere: (s) => void (gemerkt = s),
    jetzt: () => Date.parse('2026-10-20T14:00:00Z'),
  }
  return { deps, updater, gemerkt: () => gemerkt }
}

describe('pruefeAufUpdate (Live-Update)', () => {
  it('lädt das Paket im WLAN, merkt es als nächstes vor und merkt den Commit', async () => {
    const t = bauDeps()
    const s = await pruefeAufUpdate(t.deps)
    expect(s.art).toBe('live-bereit')
    expect(t.updater.download).toHaveBeenCalledWith({ url: neu.bundleUrl, version: 'b' })
    expect(t.updater.next).toHaveBeenCalledWith({ id: 'id-b' })
    expect(t.gemerkt().bereitCommit).toBe('b')
  })
  it('„nur WLAN“ an und Mobilfunk → nicht laden', async () => {
    const t = bauDeps({ unmetered: false })
    const s = await pruefeAufUpdate(t.deps)
    expect(s.art).toBe('wartet-wlan')
    expect(t.updater.download).not.toHaveBeenCalled()
  })
  it('„nur WLAN“ aus → auch im Mobilfunk laden', async () => {
    const t = bauDeps({ unmetered: false, nurWlan: false })
    expect((await pruefeAufUpdate(t.deps)).art).toBe('live-bereit')
  })
  it('Rückfall: Paket mit Status „error“ kommt auf die Sperrliste und wird nicht erneut geladen', async () => {
    const t = bauDeps({ bundles: [{ id: 'id-b', version: 'b', status: 'error' }], gemerkt: { bereitCommit: 'b' } })
    const s = await pruefeAufUpdate(t.deps)
    expect(s.art).toBe('aktuell')
    expect(s.meldung).toContain('zurückgenommen')
    expect(t.updater.download).not.toHaveBeenCalled()
    expect(t.gemerkt().fehlgeschlagen).toEqual(['b'])
    expect(t.gemerkt().bereitCommit).toBeUndefined()
  })
  it('anderer nativer Teil: kein Live-Update, Hinweis auf neue App-Version', async () => {
    const t = bauDeps({ gehostet: { ...neu, nativeVersion: 2 } })
    const s = await pruefeAufUpdate(t.deps)
    expect(s.art).toBe('nativ')
    expect(s.neueste?.nativeVersion).toBe(2)
    expect(t.updater.download).not.toHaveBeenCalled()
  })
  it('bereits geladen (wartet auf Neustart) → nicht noch einmal laden', async () => {
    const t = bauDeps({ gemerkt: { bereitCommit: 'b' } })
    expect((await pruefeAufUpdate(t.deps)).art).toBe('live-bereit')
    expect(t.updater.download).not.toHaveBeenCalled()
  })
  it('ohne Netz → offline, Fehler beim Laden → fehler, nie ein Wurf', async () => {
    expect((await pruefeAufUpdate(bauDeps({ online: false }).deps)).art).toBe('offline')
    const t = bauDeps()
    t.updater.download.mockRejectedValueOnce(new Error('HTTP 404'))
    const s = await pruefeAufUpdate(t.deps)
    expect(s.art).toBe('fehler')
    expect(t.gemerkt().bereitCommit).toBeUndefined()
  })
})

describe('installiereNativesUpdate', () => {
  const apk = { versionName: '0.1.0', versionCode: 5, nativeVersion: 2, sha256: 'a'.repeat(64) }
  const bau = (o: { json?: unknown; ladeFehler?: object } = {}) => {
    const ladeApk = vi.fn(async () => {
      if (o.ladeFehler) throw Object.assign(new Error('x'), o.ladeFehler)
    })
    const installiereApk = vi.fn(async () => undefined)
    return {
      ladeApk,
      installiereApk,
      d: { holeJson: async () => o.json ?? apk, nativInstalliert: async () => 1, ladeApk, installiereApk },
    }
  }
  it('lädt mit Prüfsumme und öffnet danach den Installer', async () => {
    const t = bau()
    await installiereNativesUpdate(t.d)
    expect(t.ladeApk).toHaveBeenCalledWith({ url: 'https://wep-pankow-apk.pages.dev/wep.apk', sha256: 'a'.repeat(64) })
    expect(t.installiereApk).toHaveBeenCalled()
  })
  it('APK noch nicht auf dem Server (nativeVersion nicht neuer) → Meldung, kein Download', async () => {
    const t = bau({ json: { ...apk, nativeVersion: 1 } })
    await expect(installiereNativesUpdate(t.d)).rejects.toThrow('wird noch gebaut')
    expect(t.ladeApk).not.toHaveBeenCalled()
  })
  it('fehlende Erlaubnis → erklärender Text', async () => {
    const t = bau()
    t.installiereApk.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ERLAUBNIS' }))
    await expect(installiereNativesUpdate(t.d)).rejects.toThrow('Apps installieren')
  })
})
