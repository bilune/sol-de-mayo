'use client'

import { useRef } from 'react'
import { t, useLanguage } from '@/i18n'
import { autofocus } from '@/ui/dom'
import { useModalDialog } from '@/ui/useModalDialog'

/**
 * Confirmation of a destructive action. Focus opens on "Cancel": on a deletion,
 * the Enter key must not destroy. The animation comes from `globals.css`, the
 * rest of the modal behaviour from `useModalDialog`.
 */
export interface ConfirmDialogProps {
  title: string
  detail: string
  confirmLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export default function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  open,
  onOpenChange,
  onConfirm
}: ConfirmDialogProps) {
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
      aria-label={title}
      onClose={() => onOpenChange(false)}
      onCancel={(e) => {
        e.preventDefault()
        onOpenChange(false)
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-[var(--muted)]">{detail}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            ref={autofocus}
            className="h-8 cursor-pointer rounded-lg px-3 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
            onClick={() => onOpenChange(false)}
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-lg bg-[var(--danger)] px-3 text-xs text-white transition hover:opacity-90 active:scale-95"
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
