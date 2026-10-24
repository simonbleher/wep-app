import { describe, expect, it } from 'vitest'
import { versionText } from '../versionText'

describe('versionText', () => {
  it('Version, Stand und Commit', () => {
    const t = versionText('0.1.0', { commit: '6a3c4a1', gebautAm: '2026-10-24T13:30:53.156Z' })
    expect(t).toMatch(/^0\.1\.0 · Stand 24\.10\.2026, \d{2}:\d{2} · 6a3c4a1$/)
  })
  it('lokaler Build ohne Commit', () => {
    expect(versionText('0.1.0', { commit: '', gebautAm: 'kaputt' })).toBe('0.1.0 · lokal')
  })
})
