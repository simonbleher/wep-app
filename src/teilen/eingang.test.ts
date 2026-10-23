// @vitest-environment node
// Beta 5, Paket 2: Eingang von außen („Öffnen mit WEP“, Doppelklick) – Datei wird stückweise geholt und verworfen.
import { describe, expect, it, vi } from 'vitest'
import { holeAndroidEingang, holeWindowsEingang } from './eingang'

const base64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

describe('Eingang Android', () => {
  it('liest die Datei in Stücken zusammen und verwirft sie danach', async () => {
    const inhalt = new Uint8Array(700 * 1024).map((_, i) => i % 251)
    const plugin = {
      eingangPruefen: vi.fn().mockResolvedValue({ vorhanden: true, name: '2026-001_KGA.wep', groesse: inhalt.length }),
      eingangLesen: vi.fn(async ({ pos, laenge }: { pos: number; laenge: number }) => ({ daten: base64(inhalt.subarray(pos, pos + laenge)) })),
      eingangVerwerfen: vi.fn().mockResolvedValue(undefined),
    }
    const e = await holeAndroidEingang(plugin)
    expect(e?.name).toBe('2026-001_KGA.wep')
    expect(plugin.eingangLesen).toHaveBeenCalledTimes(2) // 512 KB + Rest
    expect(new Uint8Array(await e!.blob.arrayBuffer())).toEqual(inhalt)
    expect(plugin.eingangVerwerfen).toHaveBeenCalledOnce()
  })
  it('nichts wartet → nichts zu tun', async () => {
    const plugin = { eingangPruefen: vi.fn().mockResolvedValue({ vorhanden: false }), eingangLesen: vi.fn(), eingangVerwerfen: vi.fn() }
    expect(await holeAndroidEingang(plugin)).toBeUndefined()
    expect(plugin.eingangLesen).not.toHaveBeenCalled()
  })
  it('auch bei einem Lesefehler wird verworfen (die Datei bleibt nicht liegen)', async () => {
    const plugin = {
      eingangPruefen: vi.fn().mockResolvedValue({ vorhanden: true, name: 'a.wep', groesse: 10 }),
      eingangLesen: vi.fn().mockRejectedValue(new Error('kaputt')),
      eingangVerwerfen: vi.fn().mockResolvedValue(undefined),
    }
    await expect(holeAndroidEingang(plugin)).rejects.toThrow('kaputt')
    expect(plugin.eingangVerwerfen).toHaveBeenCalledOnce()
  })
})

describe('Eingang Windows', () => {
  it('Name und Bytes, danach verworfen', async () => {
    const api = {
      eingangPruefen: vi.fn().mockResolvedValue('2026-002.wep'),
      eingangLesen: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      eingangVerwerfen: vi.fn().mockResolvedValue(undefined),
    }
    const e = await holeWindowsEingang(api)
    expect(e?.name).toBe('2026-002.wep')
    expect([...new Uint8Array(await e!.blob.arrayBuffer())]).toEqual([1, 2, 3])
    expect(api.eingangVerwerfen).toHaveBeenCalledOnce()
  })
  it('keine Datei', async () => {
    const api = { eingangPruefen: vi.fn().mockResolvedValue(null), eingangLesen: vi.fn(), eingangVerwerfen: vi.fn() }
    expect(await holeWindowsEingang(api)).toBeUndefined()
  })
})
