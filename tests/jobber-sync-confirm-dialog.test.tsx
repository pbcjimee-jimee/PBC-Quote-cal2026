import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { JobberSyncConfirmDialog } from '@/components/quote-form/jobber-sync-confirm-dialog'
import { calculateJobberSyncPreview } from '@/components/quote-form/quote-save-payload'
import type { JobberSyncPlan } from '@/components/quote-form/jobber-sync-plan'
import { installTestDom, TestElement } from './helpers/test-dom'

vi.mock('@/lib/actions/quotes', () => ({ createQuote: vi.fn(), updateQuote: vi.fn() }))

const emptyPlan: JobberSyncPlan = { updateCount: 0, createCount: 0, deleteItems: [] }
const preview = calculateJobberSyncPreview({ pbcSubtotal: '125.25', jobberQuoteLines: [{ kind: 'line_item', quantity: 1, unitPrice: '100.25' }] })

function markup(plan = emptyPlan, isEditMode = false, syncPreview = preview) {
  return renderToStaticMarkup(createElement(JobberSyncConfirmDialog, {
    plan, isEditMode, preview: syncPreview,
    returnFocusTo: null, onCancel: vi.fn(), onConfirm: vi.fn(),
  }))
}

describe('Jobber sync confirmation content', () => {
  it('shows the exact summary, eight deletion names, unknown-name fallback and remaining count', () => {
    const html = markup({ updateCount: 2, createCount: 3, deleteItems: Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: i === 0 ? null : `Deleted name ${i}` })) })
    for (const text of ['Send these changes to Jobber?', 'Update 2 existing line(s)', 'Add 3 new line(s)', 'Delete 10 line(s) from Jobber',
      'Unnamed line', 'Deleted name 7', '+2 more', 'Deleted lines cannot be restored from this app.',
      'PBC subtotal ex GST', '$125.25', 'Jobber public line total', '$100.25', 'Difference', '$25.00']) expect(html).toContain(text)
    expect(html).not.toContain('Deleted name 8')
    expect(html).not.toContain('Deleted name 9')
    expect(html).not.toContain('No public line changes to send.')
  })

  it('omits zero summary lines and deletion instructions', () => {
    const html = markup()
    for (const text of ['existing line(s)', 'new line(s)', 'line(s) from Jobber', 'Deleted lines cannot', 'Unnamed line', 'more']) expect(html).not.toContain(text)
  })

  it('replaces the empty summary list with a no-changes message', () => {
    const html = markup()
    expect(html).toContain('No public line changes to send.')
    expect(html).not.toContain('<ul')
  })

  it.each([
    ['4321.428571', '4321.43', '$0.00', false],
    ['4321.431', '4321.43', '$0.00', false],
    ['4321.428571', '4321.42', '$0.01', true],
    ['4321.428571', '4321.44', '-$0.01', true],
    ['4321.425', '4321.424', '$0.01', true],
    ['125.25', '100.25', '$25.00', true],
    ['100.25', '125.25', '-$25.00', true],
  ])('shows the displayed-cent difference for %s versus %s', (pbcSubtotal, jobberTotal, difference, warns) => {
    const syncPreview = calculateJobberSyncPreview({
      pbcSubtotal, jobberQuoteLines: [{ kind: 'line_item', quantity: '1', unitPrice: jobberTotal }],
    })
    const html = markup(emptyPlan, false, syncPreview)
    expect(html).toContain(`<span>Difference</span><span class="mono">${difference}</span>`)
    expect(html).not.toContain('-$0.00')
    expect(html.includes('The Jobber total does not match the PBC subtotal.')).toBe(warns)
  })

  it.each([true, false])('shows the earlier-save note only in edit mode (%s)', isEditMode => {
    expect(markup(emptyPlan, isEditMode).includes('Lines removed in earlier saves that are still waiting to sync are also deleted.')).toBe(isEditMode)
  })
})

describe('Jobber sync confirmation interactions', () => {
  it.each(['Cancel', 'Escape', 'confirm'])('%s traps focus, restores the opener and only confirms once', async method => {
    const installed = installTestDom()
    const prototype = TestElement.prototype as TestElement & { focus?: () => void }
    const originalFocus = prototype.focus
    prototype.focus = function () { if (this.ownerDocument) this.ownerDocument.activeElement = this }
    const onSave = vi.fn()
    function Harness() {
      const [trigger, setTrigger] = useState<HTMLElement | null>(null)
      return createElement('div', null,
        createElement('button', { onClick: (event: React.MouseEvent<HTMLButtonElement>) => setTrigger(event.currentTarget) }, 'Open'),
        trigger ? createElement(JobberSyncConfirmDialog, {
          plan: emptyPlan, preview, isEditMode: false, returnFocusTo: trigger,
          onCancel: () => setTrigger(null), onConfirm: () => { onSave(); setTrigger(null) },
        }) : null)
    }
    const container = installed.document.createElement('div')
    installed.document.body.appendChild(container)
    const root = createRoot(container as unknown as Element)
    const key = async (dialog: TestElement, value: string, shiftKey = false) => {
      const event = new Event('keydown', { bubbles: true, cancelable: true })
      Object.assign(event, { key: value, shiftKey })
      await act(async () => dialog.dispatchEvent(event))
    }
    try {
      await act(async () => root.render(createElement(Harness)))
      const opener = container.querySelectorAll('button')[0]
      await act(async () => opener.dispatchEvent(new Event('click', { bubbles: true })))
      const dialog = container.querySelectorAll('div').find(element => element.getAttribute('role') === 'dialog')!
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.querySelectorAll('h2')[0].getAttribute('id')).toBe(dialog.getAttribute('aria-labelledby'))
      expect(dialog.querySelectorAll('div').some(element => element.getAttribute('id') === dialog.getAttribute('aria-describedby'))).toBe(true)
      const [cancel, confirm] = dialog.querySelectorAll('button')
      expect(installed.document.activeElement).toBe(cancel)
      await key(dialog, 'Tab')
      expect(installed.document.activeElement).toBe(confirm)
      await key(dialog, 'Tab')
      expect(installed.document.activeElement).toBe(cancel)
      await key(dialog, 'Tab', true)
      expect(installed.document.activeElement).toBe(confirm)
      await key(dialog, 'Tab', true)
      expect(installed.document.activeElement).toBe(cancel)
      if (method === 'Escape') await key(dialog, 'Escape')
      else await act(async () => {
        const button = method === 'Cancel' ? cancel : confirm
        button.dispatchEvent(new Event('click', { bubbles: true }))
        button.dispatchEvent(new Event('click', { bubbles: true }))
      })
      expect(onSave).toHaveBeenCalledTimes(method === 'confirm' ? 1 : 0)
      expect(container.querySelectorAll('div').some(element => element.getAttribute('role') === 'dialog')).toBe(false)
      expect(installed.document.activeElement).toBe(opener)
    } finally {
      await act(async () => root.unmount())
      if (originalFocus) prototype.focus = originalFocus
      else delete prototype.focus
      installed.cleanup()
    }
  })
})
