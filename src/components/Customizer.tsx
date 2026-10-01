'use client'

import { memo, useMemo } from 'react'
import BotTile from '@/components/BotTile'
import { EXPRESSIONS } from '@/bot/expressions'
import { COLORS, SHAPES } from '@/bot/skins'
import { t, useLanguage } from '@/i18n'
import { cx } from '@/ui/dom'

/**
 * Tiles are frozen at the same date as the rest pose: they show the shape and face
 * as they will appear, not an abstract swatch.
 */
const PREVIEW_AT = 1

/** Expression thumbnails, px: two per row in the side panel, big enough to read a face. */
const EXPRESSION_TILE = 68

/** Sections hidden for now; flip to `true` to bring them back. */
const SHOW_SHAPES = false
const SHOW_COLORS = false

/** The expressions as listed: attentive first, the face the sun starts with. */
const LISTING = [
  ...EXPRESSIONS.filter((e) => e.id === 'attentive'),
  ...EXPRESSIONS.filter((e) => e.id !== 'attentive')
]

export interface CustomizerProps {
  shape: string
  color: string
  expression: string
  onShapeChange: (shape: string) => void
  onColorChange: (color: string) => void
  onExpressionChange: (expression: string) => void
}

function Customizer({
  shape,
  color,
  expression,
  onShapeChange,
  onColorChange,
  onExpressionChange
}: CustomizerProps) {
  useLanguage()

  // One stable handler per tile, so a tile's memo holds as long as the parent's
  // callbacks do.
  const shapeClicks = useMemo(
    () => new Map(SHAPES.map((s) => [s.id, () => onShapeChange(s.id)])),
    [onShapeChange]
  )
  const expressionClicks = useMemo(
    () => new Map(EXPRESSIONS.map((e) => [e.id, () => onExpressionChange(e.id)])),
    [onExpressionChange]
  )

  return (
    <div className="flex flex-col gap-5">
      {SHOW_SHAPES && (
        <div>
          <h2 className="text-sm font-semibold">{t('panel.shape')}</h2>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {SHAPES.map((s) => (
              <BotTile
                key={s.id}
                label={t(`shapes.${s.id}`)}
                selected={s.id === shape}
                shape={s.id}
                color={color}
                expression={expression}
                frozenAt={PREVIEW_AT}
                onClick={shapeClicks.get(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold">{t('panel.expression')}</h2>
        {/* On wide screens the eight rows shrink with the window's height, so the
          panel never scrolls: panel padding and heading take ~5.5rem, each row's
          caption and padding ~2.2rem. */}
        <div className="mt-2 grid grid-cols-4 gap-1.5 lg:grid-cols-2 lg:[&_svg]:h-auto lg:[&_svg]:w-[min(68px,calc((100dvh_-_5.5rem)/8_-_2.2rem))]">
          {LISTING.map((e) => (
            <BotTile
              key={e.id}
              label={t(`expressions.${e.id}`)}
              selected={e.id === expression}
              shape={shape}
              color={color}
              expression={e.id}
              size={EXPRESSION_TILE}
              frozenAt={PREVIEW_AT}
              onClick={expressionClicks.get(e.id)}
            />
          ))}
        </div>
      </div>

      {SHOW_COLORS && (
        <div>
          <h2 className="text-sm font-semibold">{t('panel.color')}</h2>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cx(
                  'flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition',
                  c.id === color
                    ? 'border-[var(--ink)]'
                    : 'border-transparent hover:border-[var(--line)]'
                )}
                aria-label={t(`colors.${c.id}`)}
                aria-pressed={c.id === color}
                onClick={() => onColorChange(c.id)}
              >
                {/* inner ring: otherwise the cream swatch vanishes on a light background */}
                <span
                  className="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
                  style={{ background: c.hex }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(Customizer)
