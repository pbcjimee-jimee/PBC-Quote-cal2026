'use client'

import { useEffect, useId, useRef } from 'react'
import type { calculateJobberSyncPreview } from './quote-save-payload'
import type { JobberSyncPlan } from './jobber-sync-plan'

interface JobberSyncConfirmDialogProps {
  plan: JobberSyncPlan
  preview: ReturnType<typeof calculateJobberSyncPreview>
  isEditMode: boolean
  returnFocusTo: HTMLElement | null
  onCancel: () => void
  onConfirm: () => void
}

export function JobberSyncConfirmDialog({ plan, preview, isEditMode, returnFocusTo, onCancel, onConfirm }: JobberSyncConfirmDialogProps) {
  const id = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dismissedRef = useRef(false)
  useEffect(() => {
    cancelRef.current?.focus()
    return () => returnFocusTo?.focus()
  }, [returnFocusTo])

  function dismiss(action: () => void) {
    if (dismissedRef.current) return
    dismissedRef.current = true
    action()
  }

  return (
    <div className="pbc-dialogbackdrop" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        className="pbc-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto wrap-anywhere"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            dismiss(onCancel)
          }
          if (event.key === 'Tab') {
            event.preventDefault()
            const buttons = [cancelRef.current, confirmRef.current]
            const index = buttons.findIndex(button => button === document.activeElement)
            buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
          }
        }}
      >
        <h2 id={`${id}-title`}>Send these changes to Jobber?</h2>
        <div id={`${id}-description`}>
          {plan.updateCount > 0 || plan.createCount > 0 || plan.deleteItems.length > 0 ? <ul className="pbc-bodytext mt-3">
            {plan.updateCount > 0 ? <li>Update {plan.updateCount} existing line(s)</li> : null}
            {plan.createCount > 0 ? <li>Add {plan.createCount} new line(s)</li> : null}
            {plan.deleteItems.length > 0 ? <li>Delete {plan.deleteItems.length} line(s) from Jobber</li> : null}
          </ul> : <p className="pbc-bodytext">No public line changes to send.</p>}
          {plan.deleteItems.length > 0 ? <>
            <ul className="pbc-bodytext mt-2 list-disc pl-5">
              {plan.deleteItems.slice(0, 8).map(item => <li key={item.id}>{item.name || 'Unnamed line'}</li>)}
              {plan.deleteItems.length > 8 ? <li>+{plan.deleteItems.length - 8} more</li> : null}
            </ul>
            <p>Deleted lines cannot be restored from this app.</p>
          </> : null}
          <div className="pbc-summary__rows">
            <div className="pbc-srow flex-wrap gap-x-3"><span>PBC subtotal ex GST</span><span className="mono">${preview.pbcSubtotal.toFixed(2)}</span></div>
            <div className="pbc-srow flex-wrap gap-x-3"><span>Jobber public line total</span><span className="mono">${preview.jobberPublicLineTotal.toFixed(2)}</span></div>
            <div className="pbc-srow pbc-srow--strong flex-wrap gap-x-3"><span>Difference</span><span className="mono">{preview.difference.isNegative() ? '-' : ''}${preview.difference.abs().toFixed(2)}</span></div>
          </div>
          {!preview.difference.isZero() ? <p role="alert" className="pbc-alert pbc-alert--warning">The Jobber total does not match the PBC subtotal.</p> : null}
          {isEditMode ? <p>Lines removed in earlier saves that are still waiting to sync are also deleted.</p> : null}
        </div>
        <div className="pbc-dialog__actions">
          <button ref={cancelRef} type="button" className="pbc-btn pbc-btn--ghost" onClick={() => dismiss(onCancel)}>Cancel</button>
          <button ref={confirmRef} type="button" className="pbc-btn pbc-btn--primary" onClick={() => dismiss(onConfirm)}>Save &amp; Sync to Jobber</button>
        </div>
      </div>
    </div>
  )
}
