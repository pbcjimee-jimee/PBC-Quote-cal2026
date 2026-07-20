'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createProgressClaimDraft, saveProgressClaimDraft } from '@/lib/actions/progress-invoice-claims'
import { calculateProgressClaim } from '@/lib/progress-invoices/calculation'
import type { ProgressClaimEditorDto } from '@/lib/progress-invoices/claim-service'
import type { ProgressClaimInputMode, ProgressClaimKind } from '@/lib/progress-invoices/types'
import { TaxInvoicePreview } from './tax-invoice-preview'
import { ClaimDraftVoidDialog } from './claim-draft-void-dialog'

export function progressClaimEditorKey(editor: ProgressClaimEditorDto): string {
  return [editor.seriesVersion, editor.claimVersion ?? 'new', editor.expectedCurrentRevisionSetId ?? 'none', editor.expectedCurrentManifestHash ?? 'none'].join(':')
}

export function ClaimEditor({ editor }: { editor: ProgressClaimEditorDto }) {
  const router = useRouter()
  const [mode, setMode] = useState<ProgressClaimInputMode>(editor.inputMode)
  const [kind, setKind] = useState<ProgressClaimKind>(editor.claimKind ?? 'progress')
  const [percentage, setPercentage] = useState(editor.calculation.cumulativePercentage)
  const [amount, setAmount] = useState(editor.calculation.currentClaimIncGst)
  const [issueDate, setIssueDate] = useState(editor.issueDate)
  const [dueDate, setDueDate] = useState(editor.dueDate)
  const [description, setDescription] = useState(editor.description)
  const [notes, setNotes] = useState(editor.notes)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const retry = useRef<{ signature: string; key: string } | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const calculationInput = useMemo(() => ({
    baseContractExGst: editor.baseContractExGst,
    gstRate: '0.10' as const,
    approvedAdjustments: editor.approvedAdjustments.map((item) => ({ id: item.id, type: item.type, amountExGst: item.amountExGst })),
    previousClaims: editor.previousClaims.map((item) => ({ claimId: item.claimId, sequence: item.sequence, exGst: item.exGst, gst: item.gst, incGst: item.incGst })),
    kind, inputMode: mode, authoritativeValue: mode === 'cumulative_percentage' ? percentage : amount,
  }), [amount, editor, kind, mode, percentage])
  const preview = useMemo(() => {
    try { return { calculation: calculateProgressClaim(calculationInput), error: '' } }
    catch (cause) { return { calculation: editor.calculation, error: cause instanceof Error ? cause.message : 'Invalid Claim value' } }
  }, [calculationInput, editor.calculation])

  function switchMode(next: ProgressClaimInputMode): void {
    if (next === mode) return
    if (next === 'current_claim_amount') setAmount(preview.calculation.currentClaimIncGst)
    else setPercentage(preview.calculation.cumulativePercentage)
    setMode(next)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending || preview.error) return
    const value = mode === 'cumulative_percentage' ? percentage : amount
    const signature = JSON.stringify({ mode, value, kind, issueDate, dueDate, description, notes, editorVersion: editor.claimVersion, seriesVersion: editor.seriesVersion })
    const correlationKey = retry.current?.signature === signature ? retry.current.key : crypto.randomUUID()
    retry.current = { signature, key: correlationKey }
    setPending(true); setError(''); setConflict(false); setStatus('Saving Draft…')
    const shared = {
      inputMode: mode, authoritativeValue: value, issueDate, dueDate, description, notes,
      expectedSeriesVersion: editor.seriesVersion,
      expectedCurrentRevisionSetId: editor.expectedCurrentRevisionSetId,
      expectedCurrentManifestHash: editor.expectedCurrentManifestHash,
      correlationKey,
    }
    const result = editor.claimId && editor.claimVersion
      ? await saveProgressClaimDraft({ ...shared, claimId: editor.claimId, expectedClaimVersion: editor.claimVersion })
      : await createProgressClaimDraft({ ...shared, seriesId: editor.seriesId, kind })
    setPending(false)
    if (!result.ok) {
      const changed = result.code === 'VERSION_CONFLICT'
      setConflict(changed); setStatus(''); setError(changed ? 'This Draft changed. Reload the latest values before trying again.' : 'The Draft could not be saved.')
      const focusError = () => {
        const target = errorRef.current
        if (target && typeof target.focus === 'function') target.focus()
      }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusError)
      else focusError()
      return
    }
    retry.current = null; setStatus('Draft saved.')
    if (!editor.claimId && result.data.claimId) router.replace(`/progress-invoices/${result.data.seriesId}/claims/${result.data.claimId}`)
    else router.refresh()
  }

  return (
    <div className="pbc-progress-claim-editor-grid">
      <form className="pbc-card pbc-card--pad pbc-progress-claim-form" onSubmit={submit} aria-describedby={error ? 'claim-editor-error' : undefined}>
        <h1>{editor.claimId ? `Edit ${editor.taxInvoiceNumber}` : 'New Progress Invoice Claim'}</h1>
        {!editor.claimId ? <fieldset><legend>Claim type</legend>
          <label><input type="radio" name="claimKind" checked={kind === 'progress'} onChange={() => setKind('progress')} /> Progress</label>
          <label><input type="radio" name="claimKind" checked={kind === 'final'} onChange={() => { setKind('final'); setMode('cumulative_percentage'); setPercentage('100.000000') }} /> FINAL</label>
        </fieldset> : null}
        <fieldset><legend>Choose the authoritative input</legend>
          <label><input type="radio" name="authoritativeMode" checked={mode === 'cumulative_percentage'} onChange={() => switchMode('cumulative_percentage')} /> Cumulative Progress (%)</label>
          <label><input type="radio" name="authoritativeMode" checked={mode === 'current_claim_amount'} onChange={() => switchMode('current_claim_amount')} /> This Claim Amount (Inc GST)</label>
        </fieldset>
        <label className="pbc-field"><span className="pbc-field__label">Cumulative Progress (%)</span>
          <input name="cumulativePercentage" value={percentage} disabled={mode !== 'cumulative_percentage'} onChange={(event) => setPercentage(event.target.value)} className="pbc-input" inputMode="decimal" />
        </label>
        <label className="pbc-field"><span className="pbc-field__label">This Claim Amount (Inc GST)</span>
          <input name="currentClaimAmount" value={amount} disabled={mode !== 'current_claim_amount'} onChange={(event) => setAmount(event.target.value)} className="pbc-input" inputMode="decimal" />
        </label>
        <div className="pbc-progress-claim-date-grid">
          <label className="pbc-field"><span className="pbc-field__label">Issue date</span><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="pbc-input" /></label>
          <label className="pbc-field"><span className="pbc-field__label">Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="pbc-input" /></label>
        </div>
        <label className="pbc-field"><span className="pbc-field__label">Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="pbc-textarea" maxLength={1200} /></label>
        <label className="pbc-field"><span className="pbc-field__label">Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="pbc-textarea" maxLength={2000} /></label>
        {preview.error ? <div className="pbc-alert pbc-alert--danger" role="alert">{preview.error}</div> : null}
        {error ? <div id="claim-editor-error" ref={errorRef} className="pbc-alert pbc-alert--danger" role="alert" tabIndex={-1}>{error}</div> : null}
        {conflict ? <button type="button" className="pbc-btn pbc-btn--ghost" onClick={() => router.refresh()}>Reload latest Draft</button> : null}
        <div aria-live="polite" role="status">{status}</div>
        <button className="pbc-btn pbc-btn--primary" disabled={pending || !editor.capabilities.canSave || Boolean(preview.error)}>{pending ? 'Saving…' : 'Save Draft'}</button>
        {editor.claimId && editor.claimVersion && editor.taxInvoiceNumber ? <div className="pbc-progress-claim-delete">
        <h2>Delete Draft</h2>
        <p>Delete marks this Draft Void and permanently retains its reserved Tax Invoice number.</p>
        <ClaimDraftVoidDialog
          seriesId={editor.seriesId}
          claimId={editor.claimId}
          taxInvoiceNumber={editor.taxInvoiceNumber}
          expectedSeriesVersion={editor.seriesVersion}
          expectedClaimVersion={editor.claimVersion}
          expectedCurrentRevisionSetId={editor.expectedCurrentRevisionSetId}
          expectedCurrentManifestHash={editor.expectedCurrentManifestHash}
        />
      </div> : null}
      </form>
      <TaxInvoicePreview calculation={preview.calculation} taxInvoiceNumber={editor.taxInvoiceNumber} />
    </div>
  )
}
