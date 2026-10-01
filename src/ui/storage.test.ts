import { afterEach, describe, expect, it, vi } from 'vitest'
import { key, write, read } from './storage'

/**
 * The storage guard.
 *
 * What is locked down here is the fact that the application STARTS when storage is
 * forbidden, not persistence. Everything it reads back is read at module evaluation,
 * and touching `localStorage` can raise a `SecurityError` — Chrome set to "block all
 * cookies", third-party iframe, enterprise policy. The exception propagated out of
 * `App.tsx`'s initialization and the page stayed blank: no bot, because of a browser
 * setting that has nothing to do with watching an animation.
 */

/** A `localStorage` that refuses everything, as when access is blocked. */
function forbidden() {
  const throwing = () => {
    throw new DOMException('access denied', 'SecurityError')
  }
  vi.stubGlobal('localStorage', {
    get length(): number {
      return throwing()
    },
    getItem: throwing,
    setItem: throwing,
    removeItem: throwing,
    clear: throwing,
    key: throwing
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('storage guard', () => {
  it('prefixes keys with the product name', () => {
    expect(key('cycles')).toBe('sol-de-mayo:cycles')
  })

  it('returns `null` instead of throwing when reading is denied', () => {
    forbidden()
    expect(() => read('cycles')).not.toThrow()
    expect(read('cycles')).toBeNull()
  })

  it('does not throw when writing is denied', () => {
    forbidden()
    expect(() => write('cycles', '[]')).not.toThrow()
  })

  /**
   * The quota is the other way to fail, and it happens on ALLOWED storage. That one ran
   * from a `setTimeout`, hence as an unhandled rejection: persistence stopped without
   * anything saying so.
   */
  it('does not throw when the quota is exceeded', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      }
    })
    expect(() => write('cycles', '[]')).not.toThrow()
  })

  it('really reads and writes when storage responds', () => {
    const heap = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => heap.get(k) ?? null,
      setItem: (k: string, v: string) => void heap.set(k, v)
    })
    write('shape', 'droplet')
    expect(heap.get('sol-de-mayo:shape')).toBe('droplet')
    expect(read('shape')).toBe('droplet')
    expect(read('color')).toBeNull()
  })
})
