/**
 * Offered languages and selection rule. Deliberately free of DOM and React: the
 * browser only comes in through the arguments, so the rule is testable without
 * simulating `navigator` or `localStorage`.
 */

/**
 * `tag` is the BCP 47 tag, not the identifier: it is used by `Intl` and by the
 * document's `lang` attribute. `zh` alone does not say whether the script is
 * simplified or traditional, hence `zh-Hans`.
 *
 * `name` is the endonym — the language's name IN that language. A translated list
 * of languages would be absurd: it is read precisely when one does not understand
 * the displayed language.
 */
export const LANGUAGES = [
  { id: 'es', tag: 'es-AR', emoji: '🇦🇷', name: 'Español' },
  { id: 'fr', tag: 'fr', emoji: '🇫🇷', name: 'Français' },
  { id: 'en', tag: 'en', emoji: '🇬🇧', name: 'English' },
  { id: 'zh', tag: 'zh-Hans', emoji: '🇨🇳', name: '简体中文' }
] as const

export type Language = (typeof LANGUAGES)[number]['id']

export const DEFAULT_LANGUAGE: Language = 'fr'

/**
 * Language imposed on everyone, ignoring the stored choice and the browser. The
 * Sol de Mayo version is Spanish-only for now; `null` restores the detection.
 */
export const FORCED_LANGUAGE: Language | null = 'es'

export function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some((l) => l.id === value)
}

export function tagOf(language: Language): string {
  return LANGUAGES.find((l) => l.id === language)!.tag
}

/**
 * Language to display at startup.
 *
 * An explicit choice always wins: someone who set the interface to English does
 * not want to find it in French again because they changed networks. Otherwise we
 * walk the browser preferences IN ORDER — it is a ranking, not a set — and keep
 * the first one we can speak.
 *
 * Parsing goes through `Intl.Locale` rather than `tag.split('-')[0]`:
 * `zh-Hans-CN` must yield `zh`, and exotic tags do not all split at the first
 * hyphen.
 */
export function pickLanguage(stored: string | null, preferences: readonly string[]): Language {
  if (isLanguage(stored)) return stored
  for (const tag of preferences) {
    let base: string
    try {
      base = new Intl.Locale(tag).language
    } catch {
      // an invalid tag in navigator.languages must not break everything
      continue
    }
    if (isLanguage(base)) return base
  }
  return DEFAULT_LANGUAGE
}
