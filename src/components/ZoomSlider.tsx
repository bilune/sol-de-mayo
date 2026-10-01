'use client'

import { percentage, t, useLanguage } from '@/i18n'

/**
 * Zoom control for the track. A native `<input type="range">` rather than a
 * custom slider: it brings the keyboard (arrows, Home/End), the step, and the
 * screen reader announcement. Only the look is restyled.
 *
 * The value isn't written directly: the parent receives it and decides the zoom's
 * anchor point, so the track doesn't jump elsewhere.
 */
export interface ZoomSliderProps {
  zoom: number
  min: number
  max: number
  onZoomChange?: (value: number) => void
}

export default function ZoomSlider({ zoom, min, max, onZoomChange }: ZoomSliderProps) {
  useLanguage()
  const percent = percentage(zoom)

  return (
    <div className="flex items-center gap-1.5">
      {/* the two dots tell the direction: small on the left, large on the right */}
      <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden="true" />
      <input
        type="range"
        className="h-1 w-28 cursor-pointer accent-[var(--ink)] max-sm:w-20"
        min={min}
        max={max}
        step="0.01"
        value={zoom}
        aria-label={t('timeline.zoom')}
        aria-valuetext={percent}
        onChange={(e) => onZoomChange?.(Number(e.currentTarget.value))}
      />
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden="true" />
      {/* fixed width so the bar doesn't move when the number changes digit count,
          but LEFT aligned: right-aligned, the percentage drifted away from the
          slider whenever it lost a digit */}
      <span className="w-11 text-left text-xs tabular-nums text-[var(--muted)]">{percent}</span>
    </div>
  )
}
