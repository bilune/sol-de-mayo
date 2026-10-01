/**
 * Small DOM helpers: conditional class lists and focusing on mount, which React
 * needs spelled out.
 */

/** Joins class names, dropping falsy entries: `cx('a', cond && 'b')`. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Ref callback that sets the NATIVE `autofocus` attribute.
 *
 * React's `autoFocus` prop doesn't render the attribute: it calls `focus()` once,
 * at mount. A `<dialog>` is mounted closed and opened later with `showModal()`,
 * and it is `showModal()` that looks for `[autofocus]` among its descendants —
 * with React's prop it finds nothing and focuses the first button instead.
 */
export function autofocus(el: HTMLElement | null) {
  el?.setAttribute('autofocus', '')
}
