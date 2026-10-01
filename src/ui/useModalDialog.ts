import { useEffect, type RefObject } from 'react'

/**
 * Drives a native `<dialog>` opened as a modal from a boolean.
 *
 * The native element rather than a div: the browser then provides the focus
 * trap, closing on Escape, returning focus to the trigger, the inertness of the
 * rest of the page and the backdrop — everything we would rewrite worse by hand.
 *
 * The caller still has to route the native close back to its boolean:
 * `onClose={() => setOpen(false)}` and
 * `onCancel={(e) => { e.preventDefault(); setOpen(false) }}`.
 */
export function useModalDialog(open: boolean, el: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = el.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) dialog.close()
  }, [open, el])

  // The component can disappear while the box is open (view change): a
  // `<dialog>` left modal would block the whole page.
  useEffect(() => {
    const dialog = el.current
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [el])
}
