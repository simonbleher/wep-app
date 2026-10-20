import { describe, expect, it } from 'vitest'
import { alsApkInfo, alsVersion, apkFehlerText, entscheideUpdate, istNeuer, type VersionInfo } from './update'

const v = (versionName: string, versionCode = 0, rest: Partial<VersionInfo> = {}): VersionInfo => ({
  versionName,
  versionCode,
  releaseUrl: '',
  ...rest,
})
const c = (commit: string, gebautAm: string) => v('0.1.0', 0, { commit, gebautAm })

describe('istNeuer über den Commit', () => {
  it('anderer Commit und später gebaut → neuer', () => {
    expect(istNeuer(c('b', '2026-10-20T13:00:00Z'), c('a', '2026-10-20T12:00:00Z'))).toBe(true)
  })
  it('gleicher Commit (Cloudflare und APK aus demselben Stand) → kein Update', () => {
    expect(istNeuer(c('a', '2026-10-20T12:05:00Z'), c('a', '2026-10-20T12:00:00Z'))).toBe(false)
  })
  it('anderer Commit, aber früher gebaut (ältere APK, neu installiert) → kein Update', () => {
    expect(istNeuer(c('a', '2026-10-20T12:00:00Z'), c('b', '2026-10-20T13:00:00Z'))).toBe(false)
  })
  it('Commit entscheidet vor Versionsname und -code', () => {
    const neu = v('0.1.0', 0, { commit: 'b', gebautAm: '2026-10-20T13:00:00Z' })
    const alt = v('0.2.0', 9, { commit: 'a', gebautAm: '2026-10-20T12:00:00Z' })
    expect(istNeuer(neu, alt)).toBe(true)
  })
})

describe('istNeuer ohne Commit (früherer Vergleich)', () => {
  it('vergleicht den Versionsnamen numerisch', () => {
    expect(istNeuer(v('0.2.0'), v('0.1.0'))).toBe(true)
    expect(istNeuer(v('0.10.0'), v('0.9.0'))).toBe(true)
    expect(istNeuer(v('1.0'), v('1.0.1'))).toBe(false)
  })
  it('gleicher Name: versionCode entscheidet nur, wenn beide ihn kennen', () => {
    expect(istNeuer(v('0.1.0', 8), v('0.1.0', 7))).toBe(true)
    expect(istNeuer(v('0.1.0', 7), v('0.1.0', 7))).toBe(false)
    expect(istNeuer(v('0.1.0', 0), v('0.1.0', 7))).toBe(false)
    expect(istNeuer(v('0.1.0', 9), v('0.1.0', 0))).toBe(false)
  })
  it('Commit nur auf einer Seite → früherer Vergleich', () => {
    expect(istNeuer(c('b', '2026-10-20T13:00:00Z'), v('0.1.0'))).toBe(false)
    expect(istNeuer({ ...c('b', '2026-10-20T13:00:00Z'), versionName: '0.2.0' }, v('0.1.0'))).toBe(true)
  })
  it('unlesbare Zeit → früherer Vergleich', () => {
    expect(istNeuer(c('b', 'kaputt'), c('a', '2026-10-20T12:00:00Z'))).toBe(false)
  })
})

describe('entscheideUpdate: Live-Update oder natives Update', () => {
  const neuZeit = '2026-10-20T13:00:00Z'
  const altZeit = '2026-10-20T12:00:00Z'
  const installiert = v('0.1.0', 0, { commit: 'a', gebautAm: altZeit, nativeVersion: 1 })
  const gehostet = (rest: Partial<VersionInfo> = {}) =>
    v('0.1.0', 0, { commit: 'b', gebautAm: neuZeit, nativeVersion: 1, bundleUrl: 'https://x.pages.dev/updates/b.zip', ...rest })

  it('neuer Commit, gleicher nativer Teil → Live-Update', () => {
    expect(entscheideUpdate(installiert, gehostet(), { nativInstalliert: 1 }).art).toBe('live')
  })
  it('nativeVersion der gehosteten Fassung höher → natives Update (kein Live-Update)', () => {
    expect(entscheideUpdate(installiert, gehostet({ nativeVersion: 2 }), { nativInstalliert: 1 }).art).toBe('nativ')
  })
  it('natives Update auch ohne neuen Commit-Vergleich (gleicher Commit, aber höherer nativer Teil)', () => {
    const gleich = gehostet({ commit: 'a', gebautAm: altZeit, nativeVersion: 3 })
    expect(entscheideUpdate(installiert, gleich, { nativInstalliert: 1 }).art).toBe('nativ')
  })
  it('gehostetes Paket für älteren nativen Teil als installiert → nichts anwenden', () => {
    expect(entscheideUpdate(installiert, gehostet({ nativeVersion: 1 }), { nativInstalliert: 2 }).art).toBe('keins')
  })
  it('gleicher Commit → nichts zu tun', () => {
    expect(entscheideUpdate(installiert, gehostet({ commit: 'a', gebautAm: altZeit }), { nativInstalliert: 1 }).art).toBe('keins')
  })
  it('Paket ohne nativeVersion (alter Build) oder ohne bundleUrl → kein Live-Update', () => {
    expect(entscheideUpdate(installiert, gehostet({ nativeVersion: undefined }), { nativInstalliert: 1 }).art).toBe('keins')
    expect(entscheideUpdate(installiert, gehostet({ bundleUrl: undefined }), { nativInstalliert: 1 }).art).toBe('keins')
  })
  it('Rückfall: zurückgerollter Commit wird nicht erneut geladen', () => {
    const e = entscheideUpdate(installiert, gehostet(), { nativInstalliert: 1, fehlgeschlagen: ['b'] })
    expect(e.art).toBe('keins')
    // ein späterer Commit wird wieder versucht
    const c = gehostet({ commit: 'c', bundleUrl: 'https://x.pages.dev/updates/c.zip' })
    expect(entscheideUpdate(installiert, c, { nativInstalliert: 1, fehlgeschlagen: ['b'] }).art).toBe('live')
  })
  it('schon geladenes Paket wird nicht noch einmal geladen', () => {
    expect(entscheideUpdate(installiert, gehostet(), { nativInstalliert: 1, bereitCommit: 'b' }).art).toBe('keins')
  })
})

describe('alsVersion / alsApkInfo', () => {
  it('liest nativeVersion und bundleUrl, verwirft unsichere Adressen', () => {
    const i = alsVersion({ versionName: '0.1.0', nativeVersion: 2, bundleUrl: 'http://x/y.zip', commit: 'abc' })
    expect(i?.nativeVersion).toBe(2)
    expect(i?.bundleUrl).toBeUndefined()
  })
  it('apk.json: prüft Pflichtfelder und Hash', () => {
    expect(alsApkInfo({ versionName: '0.1.0' })).toBeNull()
    const a = alsApkInfo({ nativeVersion: 2, versionCode: 9, sha256: 'AB'.repeat(32), apkUrl: 'ftp://x' })
    expect(a?.sha256).toBe('ab'.repeat(32))
    expect(a?.apkUrl).toBe('https://wep-pankow-apk.pages.dev/wep.apk')
  })
  it('Fehlertexte: einmalige Erlaubnis wird erklärt', () => {
    expect(apkFehlerText('ERLAUBNIS', '')).toContain('Apps installieren')
    expect(apkFehlerText('PRUEFSUMME', '')).toContain('beschädigt')
  })
})
