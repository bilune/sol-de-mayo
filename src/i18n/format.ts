/**
 * Text mechanics of the i18n layer: substitution and form selection.
 *
 * Kept apart from `index.ts` because it is pure — no dictionary, no current
 * language, no DOM. It is the part where the rules are subtle (French counts zero
 * as singular, Chinese has only one form), hence the one that deserves to be
 * tested without having to simulate a browser.
 */

/** Separator between plural forms in the dictionaries. */
const SEPARATOR = ' | '

/**
 * Replaces each `{name}` with its value. A `{name}` with no value provided stays as
 * is: visible on screen, hence noticeable, whereas an empty string would be
 * mistaken for text that is simply badly written.
 */
export function interpolate(text: string, values?: Record<string, string | number>): string {
  if (!values) return text
  let output = text
  for (const [name, value] of Object.entries(values)) {
    output = output.replaceAll(`{${name}}`, String(value))
  }
  return output
}

/**
 * Picks the form that fits `n` among those in the template, separated by ` | `
 * in singular-then-plural order.
 *
 * `Intl.PluralRules` decides, not an `n === 1`: French groups zero with the
 * singular ("0 animation"), English with the plural ("0 animations"). A
 * single-form template always returns that form — that is the case for Chinese,
 * which has no plural.
 */
export function pluralForm(template: string, n: number, tag: string): string {
  const shapes = template.split(SEPARATOR)
  if (shapes.length < 2) return shapes[0]!
  const index = new Intl.PluralRules(tag).select(n) === 'one' ? 0 : 1
  return shapes[index] ?? shapes[0]!
}
