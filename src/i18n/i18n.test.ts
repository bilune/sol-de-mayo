import { describe, expect, it } from 'vitest'
import { EXPRESSIONS } from '@/bot/expressions'
import { COLORS, SHAPES } from '@/bot/skins'
import { STATES } from '@/bot/states'
import { pluralForm, interpolate } from './format'
import { pickLanguage, LANGUAGES, tagOf } from './languages'
import fr from './locales/fr'
import en from './locales/en'
import zh from './locales/zh'

/**
 * We import the dictionaries and the pure modules, never `./index`: that one reads
 * `localStorage`, `navigator` and `document` on import, so it requires a browser.
 * That is precisely why the language selection rule and the text mechanics live
 * in separate files.
 */
const DICTIONARIES = { fr, en, zh }

describe('language choice at startup', () => {
  it('respects the stored choice, whatever the browser preferences', () => {
    expect(pickLanguage('en', ['fr-FR', 'fr'])).toBe('en')
    expect(pickLanguage('zh', ['fr-FR'])).toBe('zh')
  })

  it('ignores a stored choice that is not a known language', () => {
    // localStorage can be edited by hand: we do not trust it
    expect(pickLanguage('de', ['en-GB'])).toBe('en')
    expect(pickLanguage('', ['en-GB'])).toBe('en')
  })

  it('follows the order of the browser preferences, not their mere presence', () => {
    expect(pickLanguage(null, ['zh-CN', 'en-US', 'fr'])).toBe('zh')
    expect(pickLanguage(null, ['en-US', 'zh-CN', 'fr'])).toBe('en')
  })

  it('reduces a full tag to its language', () => {
    // the trap: `zh-Hans-CN` does not split at the first hyphen by chance
    expect(pickLanguage(null, ['zh-Hans-CN'])).toBe('zh')
    expect(pickLanguage(null, ['en-GB-oxendict'])).toBe('en')
  })

  it('skips unsupported languages and invalid tags', () => {
    expect(pickLanguage(null, ['de-DE', 'ja', 'en'])).toBe('en')
    expect(pickLanguage(null, ['not a tag', 'zh'])).toBe('zh')
  })

  it('falls back to French when nothing matches', () => {
    expect(pickLanguage(null, ['de-DE', 'ja-JP'])).toBe('fr')
    expect(pickLanguage(null, [])).toBe('fr')
  })
})

describe('dictionary completeness', () => {
  /**
   * The presence of the keys is already guaranteed at compile time (`en` and `zh`
   * are typed `typeof fr`). What we check here is what the type cannot see: an
   * empty value, or a translation accidentally left in French.
   */
  function leaves(object: object, prefix = ''): Array<[string, string]> {
    return Object.entries(object).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[`${prefix}${key}`, value] as [string, string]]
        : leaves(value as object, `${prefix}${key}.`)
    )
  }

  it('has no empty value, in any language', () => {
    for (const [language, dict] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of leaves(dict)) {
        expect(value.trim(), `${language}.${key}`).not.toBe('')
      }
    }
  })

  it('really translates the catalog labels, without copying them from French', () => {
    // Brand names and pure templates ("{state}, {duration}") are identical from
    // one language to another, which is normal — so we only look at the
    // catalogs, where each entry is a real word to translate.
    for (const family of ['states', 'shapes', 'colors', 'expressions'] as const) {
      for (const [key, value] of leaves(fr[family])) {
        expect(leaves(zh[family]).find(([k]) => k === key)![1], `zh ${family}.${key}`).not.toBe(
          value
        )
      }
    }
  })

  it('covers the four bot catalogs, entry by entry', () => {
    const keys = (family: object) => leaves(family).map(([k]) => k)
    expect(keys(fr.states).sort()).toEqual(STATES.map((s) => s.id).sort())
    expect(keys(fr.shapes).sort()).toEqual(SHAPES.map((s) => s.id).sort())
    expect(keys(fr.colors).sort()).toEqual(COLORS.map((c) => c.id).sort())
    expect(keys(fr.expressions).sort()).toEqual(EXPRESSIONS.map((e) => e.id).sort())
  })
})

describe('substitution', () => {
  it('replaces every occurrence of a parameter', () => {
    expect(interpolate('{a} and {a}', { a: 'x' })).toBe('x and x')
  })

  it('accepts numbers and several parameters', () => {
    expect(interpolate('{state}, {duration}', { state: 'Rest', duration: 2 })).toBe('Rest, 2')
  })

  it('keeps a parameter without a value visible, rather than emptying it', () => {
    // a "{name}" on screen gets noticed; an empty string goes unnoticed
    expect(interpolate('Delete {name}?', {})).toBe('Delete {name}?')
  })
})

describe('plural', () => {
  it('puts zero with the singular in French, with the plural in English', () => {
    const template = 'one | several'
    expect(pluralForm(template, 0, 'fr')).toBe('one')
    expect(pluralForm(template, 0, 'en')).toBe('several')
  })

  it('tells one from two in both languages', () => {
    const template = 'one | several'
    for (const tag of ['fr', 'en']) {
      expect(pluralForm(template, 1, tag)).toBe('one')
      expect(pluralForm(template, 2, tag)).toBe('several')
    }
  })

  it('returns the single form when the language has no plural', () => {
    // Chinese: a single form written in the dictionary, with no separator
    for (const n of [0, 1, 2, 17]) {
      expect(pluralForm('{n} 个动画', n, 'zh-Hans')).toBe('{n} 个动画')
    }
  })

  it('gives Chinese a single form, French and English two', () => {
    expect(zh.dialog.removeDetail.includes(' | ')).toBe(false)
    expect(fr.dialog.removeDetail.split(' | ')).toHaveLength(2)
    expect(en.dialog.removeDetail.split(' | ')).toHaveLength(2)
  })
})

describe('language catalog', () => {
  it('offers the languages, each with a flag and an endonym', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['es', 'fr', 'en', 'zh'])
    for (const l of LANGUAGES) {
      expect(l.emoji.length, l.id).toBeGreaterThan(0)
      expect(l.name.trim(), l.id).not.toBe('')
    }
  })

  it('gives a BCP 47 tag that `Intl` can read', () => {
    for (const l of LANGUAGES) {
      const tag = tagOf(l.id)
      expect(new Intl.Locale(tag).language, l.id).toBe(l.id)
      // this tag is what formats numbers: it must be usable
      expect(new Intl.NumberFormat(tag).format(2.4), l.id).toMatch(/2[.,]4/)
    }
  })

  it('specifies the Chinese script, which `zh` alone leaves undetermined', () => {
    expect(tagOf('zh')).toBe('zh-Hans')
  })
})
