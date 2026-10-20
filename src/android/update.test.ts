import { describe, expect, it } from 'vitest'
import { istNeuer, type VersionInfo } from './update'

const v = (versionName: string, versionCode = 0): VersionInfo => ({ versionName, versionCode, releaseUrl: '' })

describe('istNeuer', () => {
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
})
