// @vitest-environment node
// Versionsname = Haupt.Neben aus package.json + Freigabe-Nummer aus RELEASE_NR (tools/versionsname.mjs).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { versionsname } from '../../../tools/versionsname.mjs'

function ordner(nr?: string): string {
  const d = mkdtempSync(join(tmpdir(), 'vers-'))
  writeFileSync(join(d, 'package.json'), JSON.stringify({ version: '0.1.0' }))
  if (nr !== undefined) writeFileSync(join(d, 'RELEASE_NR'), nr)
  return d
}

describe('versionsname', () => {
  it('ohne RELEASE_NR gilt package.json', () => expect(versionsname(ordner())).toBe('0.1.0'))
  it('mit RELEASE_NR ist sie die letzte Stelle', () => expect(versionsname(ordner('37\n'))).toBe('0.1.37'))
  it('unbrauchbare Nummer wird ignoriert', () => {
    expect(versionsname(ordner('abc'))).toBe('0.1.0')
    expect(versionsname(ordner('0'))).toBe('0.1.0')
  })
})
