'use client'

import { useEffect, useRef, useState } from 'react'
import { t, useLanguage } from '@/i18n'
import { useModalDialog } from '@/ui/useModalDialog'

/**
 * Naming dialog. The modal behaviour comes from `useModalDialog`; the animation
 * lives in `globals.css`: it needs `@starting-style`, out of reach of classes.
 */
export interface NameDialogProps {
  title: string
  label: string
  submitLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onValueChange: (value: string) => void
  onSubmit: (name: string) => void
}

export default function NameDialog({
  title,
  label,
  submitLabel,
  open,
  onOpenChange,
  value,
  onSubmit
}: NameDialogProps) {
  useLanguage()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useModalDialog(open, dialogRef)
  const field = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  // The proposed name arrives with the opening, and the field shows up already
  // selected. Selection waits a frame so the draft has been rendered into it.
  useEffect(() => {
    if (!open) return
    setDraft(value)
    const frame = requestAnimationFrame(() => field.current?.select())
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function submit() {
    const clean = draft.trim()
    // An empty name means nothing: keep control rather than validate.
    if (!clean) {
      field.current?.focus()
      return
    }
    onSubmit(clean)
    onOpenChange(false)
  }

  return (
    // `m-auto` restores the native centring of the modal: Tailwind's reset sets
    // `margin: 0` on everything, and it is this auto margin that centres.
    <dialog
      ref={dialogRef}
      className="dialog m-auto w-80 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-xl"
      aria-label={title}
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
          submit()
        }}
      >
        <h2 className="text-sm font-semibold">{title}</h2>

        <label className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
          {label}
          <input
            ref={field}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 rounded-lg bg-black/5 px-2.5 text-sm text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            type="text"
            maxLength={40}
            required
          />
        </label>

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
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
