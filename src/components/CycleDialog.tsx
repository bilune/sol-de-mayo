'use client'

import { useEffect, useRef, useState } from 'react'
import { t, useLanguage } from '@/i18n'
import { autofocus } from '@/ui/dom'
import {
  GIF_BACKGROUNDS,
  CYCLE_FORMATS,
  cycleSupportsTransparency,
  videoPossible,
  type GifBackground,
  type CycleFormat
} from '@/ui/export'
import { useModalDialog } from '@/ui/useModalDialog'

/**
 * Format choice before exporting the montage.
 *
 * The "background" group appears ONLY for the GIF, instead of being shown greyed
 * out: video has no alpha channel at all, so there is no choice to refuse, there
 * is no choice.
 */
export interface CycleDialogProps {
  progress: number | null
  /** true = the last attempt failed. The box says so and offers to retry. */
  error: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  format: CycleFormat
  onFormatChange: (format: CycleFormat) => void
  background: GifBackground
  onBackgroundChange: (background: GifBackground) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function CycleDialog({
  progress,
  error,
  open,
  onOpenChange,
  format,
  onFormatChange,
  background,
  onBackgroundChange,
  onConfirm,
  onCancel
}: CycleDialogProps) {
  useLanguage()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useModalDialog(open, dialogRef)

  /*
   * Video is only offered where the browser can encode it, same rule as the image
   * copy in the export bar. Without this filter, picking MP4 on a browser without
   * `VideoEncoder` failed on the generic error.
   *
   * The guard comes from `export.ts` and NOT from `video.ts`: importing the latter
   * from here would pull mediabunny into the entry chunk (see `videoPossible`).
   *
   * Filtered after mount: the server has no `VideoEncoder`, so filtering during
   * render would make the hydrated markup disagree with the server's.
   */
  const [formats, setFormats] = useState<CycleFormat[]>(CYCLE_FORMATS)

  /*
   * The model is corrected, not just the list. The default is `mp4`, so on a
   * browser without `VideoEncoder` the box showed a single, UNCHECKED "GIF" radio:
   * the option was hidden but its value still won, and the export went to the
   * video encoder anyway only to fail at once. Hiding a choice isn't enough, it
   * must no longer be carried either.
   */
  useEffect(() => {
    const possible = CYCLE_FORMATS.filter((f) => f !== 'mp4' || videoPossible())
    setFormats(possible)
    if (!possible.includes(format)) onFormatChange(possible[0]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Until the parent applies the correction, render as if it already had.
  const chosen = formats.includes(format) ? format : formats[0]!

  const busy = progress !== null
  const percent = Math.round((progress ?? 0) * 100)

  function confirm() {
    // The box stays open during encoding: it carries the progress, and a
    // thirty-second cycle doesn't export instantly.
    if (!busy) onConfirm()
  }

  /**
   * Closing means ABORTING while encoding runs.
   *
   * Without it, Escape or the button closed the box while the export went on to
   * the end and triggered the download of a file nobody was waiting for anymore.
   */
  function close() {
    if (busy) onCancel()
    onOpenChange(false)
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog m-auto w-80 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-xl"
      aria-label={t('timeline.export')}
      onClose={() => onOpenChange(false)}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          confirm()
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{t('timeline.export')}</h2>
          <p className="text-xs text-[var(--muted)]">{t('export.cycleDetail')}</p>
        </div>

        <fieldset className="flex flex-col gap-1" disabled={busy}>
          <legend className="sr-only">{t('export.cycleFormat')}</legend>
          {formats.map((choice, i) => (
            <label
              key={choice}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-black/5"
            >
              <input
                type="radio"
                name="format"
                value={choice}
                checked={chosen === choice}
                onChange={() => onFormatChange(choice)}
                ref={i === 0 ? autofocus : undefined}
                className="accent-[var(--ink)]"
              />
              <span className="flex flex-col">
                {t(`export.cycle_${choice}`)}
                <span className="text-xs text-[var(--muted)]">{t(`export.cycle_${choice}_help`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* Only the GIF has an alpha to offer: see the component doc. */}
        {cycleSupportsTransparency(chosen) && (
          <fieldset className="flex flex-col gap-1" disabled={busy}>
            <legend className="sr-only">{t('export.gifBackground')}</legend>
            {GIF_BACKGROUNDS.map((choice) => (
              <label
                key={choice}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-black/5"
              >
                <input
                  type="radio"
                  name="fondCycle"
                  value={choice}
                  checked={background === choice}
                  onChange={() => onBackgroundChange(choice)}
                  className="accent-[var(--ink)]"
                />
                {t(`export.background_${choice}`)}
              </label>
            ))}
          </fieldset>
        )}

        {/* Progress replaces the buttons: nothing else to do but wait. */}
        {/* The failure shows HERE and not in the export bar: that one is only
            rendered in the Customise view, while this box lives in Animations,
            so the message went to a component absent from the screen. */}
        {error && !busy && (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {t('export.failed')}
          </p>
        )}

        {busy ? (
          <div className="flex flex-col gap-1.5">
            {/*
              No `transition` on the width: a transition on `width` goes through
              layout, hence the main thread, which encoding saturates. The bar
              stayed frozen on its first value while the percentage kept moving.
              And it adds nothing: the value changes hundreds of times.
            */}
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${percent}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs tabular-nums text-[var(--muted)]">
                {t('export.cycleProgress')} {percent} %
              </p>
              <button
                type="button"
                className="h-7 cursor-pointer rounded-lg px-2 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
                onClick={close}
              >
                {t('dialog.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-8 cursor-pointer rounded-lg px-3 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
              onClick={close}
            >
              {t('dialog.cancel')}
            </button>
            <button
              type="submit"
              className="h-8 cursor-pointer rounded-lg bg-[var(--ink)] px-3 text-xs text-[var(--paper)] transition hover:opacity-90 active:scale-95"
            >
              {error ? t('export.cycleRetry') : t('export.gifConfirm')}
            </button>
          </div>
        )}
      </form>
    </dialog>
  )
}
