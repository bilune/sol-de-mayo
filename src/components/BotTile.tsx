'use client'

import { memo, type MouseEventHandler } from 'react'
import SolDeMayo from '@/components/SolDeMayo'
import { DEFAULT_EXPRESSION } from '@/bot/expressions'
import { DEFAULT_COLOR, DEFAULT_SHAPE } from '@/bot/skins'
import type { StateId } from '@/bot/states'
import { cx } from '@/ui/dom'

/**
 * Clickable tile of the right-hand panel: a frozen bot, its name below, a border
 * when selected. Used for shapes, expressions and animations: the three grids must
 * look identical, hence a shared component rather than the same class string copied.
 *
 * `frozenAt` is required: an animated tile would run as many rAF loops as there
 * are tiles.
 */
export interface BotTileProps {
  label: string
  selected: boolean
  frozenAt: number
  state?: StateId
  shape?: string
  color?: string
  expression?: string
  size?: number
  onClick?: MouseEventHandler<HTMLButtonElement>
}

function BotTile({
  label,
  selected,
  frozenAt,
  state = 'idle',
  shape = DEFAULT_SHAPE,
  color = DEFAULT_COLOR,
  expression = DEFAULT_EXPRESSION,
  size = 60,
  onClick
}: BotTileProps) {
  return (
    <button
      type="button"
      className={cx(
        'flex cursor-pointer flex-col items-center rounded-xl border-2 p-1 transition',
        selected ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
      )}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
    >
      <SolDeMayo
        state={state}
        size={size}
        shape={shape}
        color={color}
        expression={expression}
        frozenAt={frozenAt}
        // no corona in thumbnails: the face is what tells them apart
        rays={false}
      />
      {/* 12 px: below that, a caption is no longer readable for everyone */}
      <span className="text-center text-xs leading-tight text-[var(--muted)]">{label}</span>
    </button>
  )
}

export default memo(BotTile)
