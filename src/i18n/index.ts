import { useSyncExternalStore } from 'react'
import { write, read } from '@/ui/storage'
import { pluralForm, interpolate } from './format'
import { FORCED_LANGUAGE, pickLanguage, isLanguage, type Language, tagOf } from './languages'
import fr from './locales/fr'
import en from './locales/en'
import zh from './locales/zh'
import es from './locales/es'

export { LANGUAGES, type Language } from './languages'

/**
 * `Record<Language, typeof fr>` rather than a free object: adding a language to
 * `LANGUAGES` without writing its dictionary becomes a compile error.
 */
const dictionaries: Record<Language, typeof fr> = { es, fr, en, zh }

/**
 * Dotted paths of the dictionary. This type is what makes `t('reglage.x')` fail to
 * compile: `t` accepts nothing but a key that really exists in `fr.ts`.
 */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>
}[keyof T & string]

export type Key = Paths<typeof fr>

/*
 * The current language is a tiny external store rather than React state: `t()` is
 * called from plain modules too (formatting helpers, export file names), so it has
 * to be readable outside a component. Components subscribe with `useLanguage()`,
 * which re-renders them when it changes.
 *
 * The app is client-only (see `src/app/page.tsx`), but the guard keeps a stray
 * server import from crashing on `navigator`.
 */
let currentOne: Language =
  FORCED_LANGUAGE ??
  pickLanguage(
    read('language'),
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  )
const subscribers = new Set<() => void>()

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/**
 * The document's `lang` attribute follows the language: it picks the screen
 * reader's voice and the hyphenation rules. The tab title follows too, since the
 * served HTML can only carry one, static.
 */
function syncDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = tagOf(currentOne)
  document.title = t('app.title')
}

/** Current language, read-only. */
export function currentLanguage(): Language {
  return currentOne
}

/**
 * Changes the language. Only an EXPLICIT choice is written to storage: the
 * DETECTED language is not, otherwise a first visit from abroad would freeze that
 * language forever, while detection must stay a guess redone on every visit until
 * the user decides.
 */
export function changeLanguage(value: string) {
  if (!isLanguage(value) || value === currentOne) return
  currentOne = value
  write('language', value)
  syncDocument()
  for (const fn of subscribers) fn()
}

/**
 * Subscribes the calling component to language changes and returns the current
 * language. Call it at the top of any component that renders translated text.
 */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, currentLanguage, () => 'fr' as Language)
}

syncDocument()

/** Formatters are expensive to build and re-read on every frame of the track. */
const formatters = new Map<string, Intl.NumberFormat>()

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const tag = tagOf(currentOne)
  const memo = `${tag}:${key}`
  let f = formatters.get(memo)
  if (!f) {
    f = new Intl.NumberFormat(tag, options)
    formatters.set(memo, f)
  }
  return f
}

/**
 * A number in the language's convention. Essential for durations: the decimal
 * separator is a comma in French and a point in English.
 */
export function count(value: number, decimals = 0): string {
  return formatter(`n${decimals}`, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

/**
 * A percentage, from a fraction. French inserts a non-breaking space before the
 * sign, English and Chinese don't: `Intl` knows the rule, concatenation doesn't.
 */
export function percentage(fraction: number): string {
  return formatter('%', { style: 'percent', maximumFractionDigits: 0 }).format(fraction)
}

function raw(key: Key): string {
  const node = key
    .split('.')
    .reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], dictionaries[currentOne])
  return node as string
}

/** `t('panel.shape')`, `t('cycles.menuRenameAria', { name })`. */
export function t(key: Key, values?: Record<string, string | number>): string {
  return interpolate(raw(key), values)
}

/** Plural: `n` is always available as `{n}` in the template. */
export function plural(key: Key, n: number, values?: Record<string, string | number>): string {
  return interpolate(pluralForm(raw(key), n, tagOf(currentOne)), { n, ...values })
}

/**
 * A montage's name. An empty name is the seed montage's, which the user never
 * named: it therefore follows the language. A structural type rather than an
 * imported `Cycle`, so the i18n layer doesn't depend on `src/bot/`.
 */
export function cycleName(cycle: { name: string }): string {
  return cycle.name || t('cycles.defaultName')
}

/** Readable duration: `2,4 s`, `2.4 s`, `2.4 秒`. */
export function formatSeconds(value: number): string {
  return t('units.seconds', { n: count(value, 1) })
}

/**
 * Same duration, tighter, for the ruler's graduation: it is labelled every 52 px
 * and one more space would make the labels overlap.
 */
export function formatSecondsShort(value: number, decimals: number): string {
  return t('units.secondsShort', { n: count(value, decimals) })
}
