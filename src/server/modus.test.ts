// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { istServerModus } from './modus'

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
