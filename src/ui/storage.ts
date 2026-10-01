/**
 * `localStorage` keys, in a single place.
 *
 * The prefix carries the product name: it is a shared constant and not a string
 * copied at every call, otherwise the next rename will miss one and the user will
 * lose their settings without anything flagging it.
 *
 * No migration from the old prefix: the rename was done before any release, there
 * is no installation to catch up with.
 */
const PREFIX = 'sol-de-mayo:'

/** Everything the application persists. */
const NAMES = ['cycles', 'cycle', 'shape', 'color', 'expression', 'language'] as const

export type StoredName = (typeof NAMES)[number]

/** `key('cycles')` -> `'sol-de-mayo:cycles'`. */
export function key(name: StoredName): string {
  return `${PREFIX}${name}`
}

/**
 * GUARDED storage read.
 *
 * Touching `localStorage` can throw, not just fail: when access is denied — Chrome set
 * to "block all cookies", third-party iframe, enterprise policy — merely reading the
 * property raises a `SecurityError`. And everything the application reads back is read
 * at module evaluation, so the exception propagated out of `App.tsx`'s initialization
 * and the page stayed BLANK: no bot at all, because of a browser setting that has
 * nothing to do with watching an animation.
 *
 * We lose persistence, never the application. It is the only possible trade-off here:
 * there is nothing that must be saved at all costs, only an avatar to restore if we can.
 */
export function read(name: StoredName): string | null {
  try {
    return localStorage.getItem(key(name))
  } catch {
    return null
  }
}

/**
 * GUARDED storage write.
 *
 * Same reason as for reading, plus the quota: a `setItem` can raise
 * `QuotaExceededError`. The cycle's write ran from a `setTimeout`, hence as an
 * unhandled rejection — persistence stopped without anything saying so.
 */
export function write(name: StoredName, value: string) {
  try {
    localStorage.setItem(key(name), value)
  } catch {
    // storage denied or full: carry on without persisting
  }
}
