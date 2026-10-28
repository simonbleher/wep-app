// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { istServerModus, modusFuer } from './modus'

describe('Schalter Server-Modus', () => {
  it('nur genau "true" schaltet ein; ohne Variable bleibt alles wie v1', () => {
    expect(istServerModus({})).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: '' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: 'false' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: '1' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: 'TRUE' })).toBe(false)
    expect(istServerModus({ VITE_SERVER_MODUS: 'true' })).toBe(true)
  })
})

describe('Android- und Windows-App', () => {
  it('Build mit Schalter: im Browser Server-Modus, in den Apps v1 mit Hinweis', () => {
    expect(modusFuer(true, false)).toEqual({ serverModus: true, appOhneServer: false })
    expect(modusFuer(true, true)).toEqual({ serverModus: false, appOhneServer: true })
  })

  it('Build ohne Schalter: überall v1 ohne Hinweis', () => {
    expect(modusFuer(false, false)).toEqual({ serverModus: false, appOhneServer: false })
    expect(modusFuer(false, true)).toEqual({ serverModus: false, appOhneServer: false })
  })
})
