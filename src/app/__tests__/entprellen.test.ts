import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entprelle } from '../entprellen'

describe('entprelle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('führt nur den letzten Wert nach der Wartezeit aus', () => {
    const fn = vi.fn()
    const e = entprelle(fn, 300)
    e(1)
    e(2)
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    e(3)
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
  })

  it('sofort() schreibt Ausstehendes direkt, danach nichts doppelt', () => {
    const fn = vi.fn()
    const e = entprelle(fn, 300)
    e('a')
    e.sofort()
    expect(fn).toHaveBeenCalledWith('a')
    vi.advanceTimersByTime(1000)
    e.sofort()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('abbrechen() verwirft', () => {
    const fn = vi.fn()
    const e = entprelle(fn, 300)
    e('x')
    e.abbrechen()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})
