'use client'

import type { KeyboardEvent } from 'react'
import { changeLanguage, LANGUAGES, t, useLanguage } from '@/i18n'
import { cx } from '@/ui/dom'

/**
 * Radio group keyboard handling.
 *
 * Declaring `role="radiogroup"` PROMISES this behaviour, and `<button>`s don't give
 * it on their own: arrows must move the choice, and the whole group must count as
 * ONE tab stop. Hence the roving `tabindex` in the markup: only the checked option
 * is reachable with Tab, arrows do the rest, like a native radio group.
 */
function onArrowKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
  const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[
    event.key
  ]
  if (!step) return
  event.preventDefault()
  // wraps around, like a native radio group
  const target = LANGUAGES[(index + step + LANGUAGES.length) % LANGUAGES.length]!
  changeLanguage(target.id)
  // focus follows the choice, otherwise the next arrows start from the old one
  const buttons = event.currentTarget.parentElement?.children
  const next = buttons?.[LANGUAGES.indexOf(target)]
  if (next instanceof HTMLElement) next.focus()
}

export default function Settings() {
  const language = useLanguage()

  return (
    <div>
      <h2 className="text-sm font-semibold">{t('settings.language')}</h2>

      {/*
        A radio button group rather than a `<select>`: three choices show in full,
        and the flag can't be read in a closed dropdown.

        Each button carries its `aria-label` explicitly rather than relying on the
        name computed from its content: on a rebuilt radio, that computation isn't
        rendered the same everywhere, and the name is what makes the choice
        announceable. It repeats the visible text exactly, as "label in name"
        requires.

        `lang` is on the button, not the text: the accessible name inherits it, so
        speech synthesis pronounces "简体中文" in Chinese and not with the current
        language's voice.
      */}
      <div className="mt-2 flex flex-col gap-1" role="radiogroup" aria-label={t('settings.language')}>
        {LANGUAGES.map((l, i) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={l.id === language}
            aria-label={l.name}
            lang={l.tag}
            tabIndex={l.id === language ? 0 : -1}
            onKeyDown={(e) => onArrowKey(e, i)}
            className={cx(
              'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition',
              l.id === language
                ? 'border-[var(--ink)] bg-white font-medium'
                : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--ink)]'
            )}
            onClick={() => changeLanguage(l.id)}
          >
            {/* the flag is decorative: the language name says it all, and a screen
                reader would announce "flag of France" for nothing */}
            <span className="text-base leading-none" aria-hidden="true">
              {l.emoji}
            </span>
            <span className="flex-1">{l.name}</span>
            {l.id === language && (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
                <path
                  d="M2.5 6.4 4.8 8.7 9.5 3.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
