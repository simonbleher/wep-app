import { describe, expect, it } from 'vitest'
import { istNeuer, type VersionInfo } from './update'

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
