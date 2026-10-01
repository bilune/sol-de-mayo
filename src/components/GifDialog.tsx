'use client'

import { useRef } from 'react'
import { t, useLanguage } from '@/i18n'
import { autofocus } from '@/ui/dom'
import { GIF_BACKGROUNDS, type GifBackground } from '@/ui/export'
import { useModalDialog } from '@/ui/useModalDialog'

/**
 * Background choice before downloading the GIF.
 *
 * This format is the only one to ask: its transparency has a single bit, so its
 * transparent edge is hard and shows. A solid background smooths it, at the cost
 * of a colour baked into the image. Neither wins in every case, hence the choice
 * left to the user.
 *
 * Real `<input type="radio">` rather than buttons: the browser gives the group,
 * arrow-key navigation and the "1 of 2" announcement to screen readers. The modal
 * behaviour comes from `useModalDialog`, the animation from `globals.css`.
 */
export interface GifDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  background: GifBackground
  onBackgroundChange: (background: GifBackground) => void
  onConfirm: () => void
}

export default function GifDialog({
  open,
  onOpenChange,
  background,
  onBackgroundChange,
  onConfirm
}: GifDialogProps) {
  useLanguage()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useModalDialog(open, dialogRef)

  function confirm() {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog m-auto w-80 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-xl"
      aria-label={t('export.gifTitle')}
      onClose={() => onOpenChange(false)}
      onCancel={(e) => {
        e.preventDefault()
        onOpenChange(false)
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
          <h2 className="text-sm font-semibold">{t('export.gifTitle')}</h2>
          <p className="text-xs text-[var(--muted)]">{t('export.gifDetail')}</p>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">{t('export.gifBackground')}</legend>
          {GIF_BACKGROUNDS.map((choice, i) => (
            <label
              key={choice}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-black/5"
            >
              <input
                type="radio"
                name="fond"
                value={choice}
                checked={background === choice}
                onChange={() => onBackgroundChange(choice)}
                ref={i === 0 ? autofocus : undefined}
                className="accent-[var(--ink)]"
              />
              <span className="flex flex-col">
                {t(`export.background_${choice}`)}
                <span className="text-xs text-[var(--muted)]">{t(`export.background_${choice}_help`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-lg px-3 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
            onClick={() => onOpenChange(false)}
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="submit"
            className="h-8 cursor-pointer rounded-lg bg-[var(--ink)] px-3 text-xs text-[var(--paper)] transition hover:opacity-90 active:scale-95"
          >
            {t('export.gifConfirm')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
