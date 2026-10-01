'use client'

import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import BotTile from '@/components/BotTile'
import { POSES, SEQUENCE, STATE_BY_ID, type StateId } from '@/bot/states'
import { t, useLanguage } from '@/i18n'

interface BlockPickerProps {
  shape: string
  color: string
  expression: string
  onPick: (state: StateId) => void
}

/** The animations, in the catalogue order. */
const PALETTE = SEQUENCE.map((id) => STATE_BY_ID.get(id)!)

/** Palette width, in pixels — also used to position it. */
const WIDTH = 288

/**
 * The track's "+" card and its palette. Adding from the track saves a trip to
 * the right-hand panel while editing.
 *
 * Memoized: it lives inside the track, which re-renders on every frame.
 */
function BlockPicker({ shape, color, expression, onPick }: BlockPickerProps) {
  useLanguage()

  const trigger = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<CSSProperties>({})

  /**
   * Is the palette open? For `aria-expanded`, which the trigger must carry like
   * those of the export bar and the cycle menu.
   *
   * Tracked through the popover's `toggle` event rather than our own `toggle()`:
   * LIGHT dismiss — click outside, Escape — is done by the browser, so a flag we
   * held ourselves would stay stuck on "open".
   */
  const [open, setOpen] = useState(false)

  /**
   * Opens the palette above the "+". It lives in the browser's top layer, so its
   * position is computed here, in screen coordinates, and clamped so it doesn't
   * leave through the right when the button sits at the end of the track.
   */
  function toggle() {
    const button = trigger.current
    const dialogRef = panel.current
    if (!button || !dialogRef) return
    // with the keyboard, `Enter` doesn't trigger light dismiss (which listens to
    // the pointer): without this guard we'd reopen an already open palette, and
    // `showPopover` throws in that case
    if (dialogRef.matches(':popover-open')) {
      dialogRef.hidePopover()
      return
    }
    const r = button.getBoundingClientRect()
    const next: CSSProperties = {
      position: 'fixed',
      // a popover's default styles set `inset: 0`: without resetting top and right
      // to `auto`, the placement is over-constrained and `top: 0` wins — the
      // palette sticks to the top of the screen
      top: 'auto',
      right: 'auto',
      left: `${Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8))}px`,
      bottom: `${window.innerHeight - r.top + 8}px`
    }
    setPosition(next)
    // React applies the state on the next render, after `showPopover`: write the style
    // on the node now too, so the first open frame is already placed
    Object.assign(dialogRef.style, next)
    dialogRef.showPopover()
  }

  /*
   * One stable click handler per tile, reading the latest `onPick` from a ref:
   * `BotTile` is memoized, and opening the palette must not redraw its frozen bots.
   */
  const onPickRef = useRef(onPick)
  useLayoutEffect(() => {
    onPickRef.current = onPick
  })
  const picks = useMemo(
    () =>
      new Map(
        PALETTE.map((s) => [
          s.id,
          () => {
            onPickRef.current(s.id)
            panel.current?.hidePopover()
          }
        ])
      ),
    []
  )

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="flex h-full w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--line)] text-lg leading-none text-[var(--muted)] transition hover:border-[var(--muted)] hover:text-[var(--ink)]"
        aria-label={t('timeline.addAnimation')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
      >
        +
      </button>

      {/*
        `popover` promotes the palette to the browser's top layer: that's what lets
        it escape the track container, which clips vertically — it was cut in half
        there. As a bonus, clicking outside and Escape close it with no code of
        ours. `m-0`: a popover is centred by an auto margin, like a modal.
      */}
      <div
        ref={panel}
        popover=""
        onToggle={(e) => setOpen(e.newState === 'open')}
        className="m-0 w-72 rounded-xl bg-white p-2 shadow-lg ring-1 ring-black/5"
        style={position}
      >
        <div className="grid grid-cols-4 gap-1.5">
          {PALETTE.map((s) => (
            <BotTile
              key={s.id}
              label={t(`states.${s.id}`)}
              selected={false}
              state={s.id}
              shape={shape}
              color={color}
              expression={expression}
              frozenAt={POSES[s.id]}
              onClick={picks.get(s.id)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

export default memo(BlockPicker)
