'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AiQuoteAvailability } from '@/lib/ai-quote/config'
import type { AiQuoteDraft, DraftJobberContext } from '@/lib/ai-quote/types'
import type { AiDraftSelection, AiLineApplyMode } from './ai-draft-apply'
import { AREA_SCOPE_LABELS } from '@/lib/areas/constants'

export interface AiDraftPanelProps {
  availability: AiQuoteAvailability
  hasActiveKnowledge: boolean
  jobberContext: DraftJobberContext | null
  hasExistingPublicLines: boolean
  appliedRunId: string | null
  onApply(input: { runId: string; draft: AiQuoteDraft; selection: AiDraftSelection; mode: AiLineApplyMode }): Promise<void>
  onReallocate(): void
}

type DraftResult = { runId: string; draft: AiQuoteDraft }
const APPLIED_STATUS = 'AI draft applied - review the lines and prices before Save & Sync.'

function Checklist({ title, items, selected, onToggle }: {
  title: string
  items: Array<{ id: string; label: string; rationale: string }>
  selected: Set<string>
  onToggle(id: string): void
}) {
  const id = useId()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleRationale(key: string) {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <fieldset className="pbc-ai-draft__group">
      <legend>{title}</legend>
      {items.length === 0 ? <p className="pbc-bodytext">None suggested.</p> : items.map((item, index) => (
        <div key={item.id} className="pbc-ai-draft__item">
          <div className="pbc-ai-draft__row">
            <label><input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} /> <span>{item.label}</span></label>
            <button type="button" className="pbc-ai-draft__why" aria-expanded={expanded.has(item.id)} aria-controls={`${id}-rationale-${index}`} aria-label={`Why? ${item.label}`} onClick={() => toggleRationale(item.id)}>Why?</button>
          </div>
          {expanded.has(item.id) ? <p id={`${id}-rationale-${index}`} className="pbc-ai-draft__rationale">{item.rationale}</p> : null}
        </div>
      ))}
    </fieldset>
  )
}

export function AiDraftPanel({ availability, hasActiveKnowledge, jobberContext, hasExistingPublicLines, appliedRunId, onApply, onReallocate }: AiDraftPanelProps) {
  const id = useId()
  const [memo, setMemo] = useState('')
  const [result, setResult] = useState<DraftResult | null>(null)
  const [selection, setSelection] = useState<AiDraftSelection>({ areas: new Set(), publicLines: new Set(), workItems: new Set(), formulaScopes: new Set() })
  const [mode, setMode] = useState<AiLineApplyMode>('append')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<'request' | 'apply' | null>(null)
  const [dailyLimit, setDailyLimit] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [status, setStatus] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const applyingRef = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const disabled = !availability.enabled || !hasActiveKnowledge || dailyLimit
  const hasSelection = [selection.publicLines, selection.workItems, selection.formulaScopes].some(items => items.size > 0)

  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => {
    if (!loading) return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [loading])
  useEffect(() => { if (result) headingRef.current?.focus?.() }, [result])

  async function createDraft() {
    if (requestRef.current || applyingRef.current || disabled || !memo.trim()) return
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setElapsed(0)
    setError(null)
    setResult(null)
    setStatus('Creating draft.')
    const timeout = setTimeout(() => {
      if (requestRef.current !== controller) return
      controller.abort()
      requestRef.current = null
      setLoading(false)
      setError('request')
      setStatus('The draft took too long. Try again.')
    }, 300000)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true })
    try {
      const context = jobberContext ? {
        jobberQuoteId: jobberContext.jobberQuoteId,
        workType: jobberContext.workType,
        customerType: jobberContext.customerType,
        areaSqft: jobberContext.areaSqft,
        existingLines: jobberContext.existingLines.slice(0, 60).map(line => ({ name: line.name, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
      } : null
      const response = await fetch('/api/ai/quote-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo: memo.trim(), jobberContext: context }), signal: controller.signal,
      })
      const body = await response.json()
      if (controller.signal.aborted) return
      if (response.status === 429) {
        setDailyLimit(true)
        setStatus('The daily limit has been reached. Try again tomorrow.')
        return
      }
      if (!response.ok || !body.ok || !body.data?.runId || !body.data?.draft) throw new Error('Draft unavailable')
      const next: DraftResult = body.data
      setSelection({
        areas: new Set(next.draft.areas.map(area => `${area.scope}:${area.name}`)),
        publicLines: new Set(next.draft.publicLines.map(line => line.id)),
        workItems: new Set(next.draft.workItems.map(item => item.id)),
        formulaScopes: new Set(next.draft.formulaSelections.map(formula => formula.scope)),
      })
      setMode('append')
      setResult(next)
      setStatus('Draft ready for review.')
    } catch {
      if (!controller.signal.aborted) {
        setError('request')
        setStatus('Unable to create a draft. Please try again.')
      }
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  function cancel() {
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(false)
    setStatus('Draft cancelled.')
  }

  async function apply() {
    if (!result || applyingRef.current || !hasSelection) return
    applyingRef.current = true
    setApplying(true)
    setError(null)
    try {
      await onApply({ ...result, selection, mode })
      setHasApplied(true)
      setResult(null)
      setStatus(APPLIED_STATUS)
      inputRef.current?.focus?.()
    } catch {
      setError('apply')
      setStatus('Unable to apply the draft. Your quote has not changed. Please try again.')
    } finally {
      applyingRef.current = false
      setApplying(false)
    }
  }

  function toggle(group: Exclude<keyof AiDraftSelection, 'areas'>, key: string) {
    setSelection(current => {
      const next = new Set<string>(current[group])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...current, [group]: next }
    })
  }

  const draft = result?.draft
  return (
    <section className="pbc-card pbc-card--pad pbc-ai-draft" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="pbc-paneltitle">Draft with AI</h2>
      <p>Describe the job and list the items to quote. AI fills the quote lines and prices for you to review.</p>
      {!availability.enabled ? <p className="pbc-bodytext">{availability.message}</p> : !hasActiveKnowledge ? <p className="pbc-bodytext">An approved AI guide is needed. <a href="/settings?tab=ai">Approve an AI guide in Settings &gt; AI</a></p> : null}
      {appliedRunId ? <div className="pbc-alert pbc-alert--warning"><p>{APPLIED_STATUS}</p><button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={onReallocate} disabled={loading || applying}>Recalculate AI prices</button></div> : null}
      {!draft ? <>
        <label className="pbc-field__label" htmlFor={`${id}-notes`}>Job notes</label>
        <textarea ref={inputRef} id={`${id}-notes`} className="pbc-textarea" rows={5} maxLength={8000} value={memo} onChange={event => setMemo(event.target.value.slice(0, 8000))} disabled={disabled || loading || applying} aria-describedby={`${id}-privacy ${id}-count`} placeholder="e.g. Interior repaint: 3 bedrooms walls and ceilings, hallway, living room walls only. Bed 2 cracks above window need patching. Doors and frames in enamel. Low sheen." />
        <div className="pbc-ai-draft__notes"><span id={`${id}-privacy`}>Do not include client names or phone numbers.</span><span id={`${id}-count`}>{memo.length} / 8000</span></div>
        <div className="pbc-ai-draft__actions"><button type="button" className="pbc-btn pbc-btn--primary" disabled={disabled || loading || applying || !memo.trim()} onClick={() => void createDraft()}>{loading ? `Creating draft... ${elapsed}s` : appliedRunId || hasApplied ? 'Create new draft' : 'Create draft'}</button>{loading ? <button type="button" className="pbc-btn pbc-btn--ghost" onClick={cancel}>Cancel</button> : null}</div>
      </> : null}
      <div aria-live="polite" aria-atomic="true"><p role="status" className={status === APPLIED_STATUS ? 'sr-only' : undefined}>{status}</p>{error ? <button type="button" className="pbc-btn pbc-btn--ghost" disabled={applying} onClick={() => void (error === 'apply' ? apply() : createDraft())}>Try again</button> : null}</div>
      {draft ? <div className="pbc-ai-draft__result" aria-live="polite">
        <h3 ref={headingRef} tabIndex={-1}>Review AI draft</h3>
        <p>{draft.summary}</p>
        {draft.questions.length + draft.warnings.length > 0 ? <div className="pbc-alert pbc-alert--warning pbc-ai-draft__warnings"><h4>Check before saving</h4><ul>{[...draft.questions, ...draft.warnings].map((text, index) => <li key={index}>{text}</li>)}</ul></div> : null}
        {draft.findings.length > 0 ? <><h4>Findings</h4><ul>{draft.findings.map((finding, index) => <li key={index}>{finding.area}: {finding.issue} — {finding.evidence} <span className="pbc-bodytext">({finding.confidence} confidence)</span></li>)}</ul></> : null}
        <Checklist title="Quote lines" items={draft.publicLines.map(line => ({ id: line.id, label: `${line.name} · Qty ${line.quantity}`, rationale: line.rationale }))} selected={selection.publicLines} onToggle={key => toggle('publicLines', key)} />
        <Checklist title="Materials and labour" items={draft.workItems.map(item => ({ id: item.id, label: `${item.product.name} · ${item.areaName} · Qty ${item.quantity} · ${item.workingDays} ${Number(item.workingDays) === 1 ? 'day' : 'days'} · ${item.labourPerDay} ${Number(item.labourPerDay) === 1 ? 'person' : 'people'}`, rationale: item.rationale }))} selected={selection.workItems} onToggle={key => toggle('workItems', key)} />
        <Checklist title="Formula picks" items={draft.formulaSelections.map(formula => ({ id: formula.scope, label: `${AREA_SCOPE_LABELS[formula.scope]}: low Formula ${formula.selectedMin}, high Formula ${formula.selectedMax}`, rationale: formula.rationale }))} selected={selection.formulaScopes} onToggle={key => toggle('formulaScopes', key)} />
        {hasExistingPublicLines ? <fieldset className="pbc-ai-draft__group"><legend>Apply quote lines</legend><label><input type="radio" name={`${id}-mode`} checked={mode === 'append'} onChange={() => setMode('append')} /> Add to existing lines</label><label><input type="radio" name={`${id}-mode`} checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace AI-editable lines</label></fieldset> : null}
        {!hasSelection ? <p className="pbc-bodytext" role="status">Select at least one item to apply.</p> : null}
        <div className="pbc-ai-draft__actions"><button type="button" className="pbc-btn pbc-btn--primary" disabled={applying || !hasSelection} onClick={() => void apply()}>{applying ? 'Applying draft...' : 'Apply to quote'}</button><button type="button" className="pbc-btn pbc-btn--ghost" disabled={applying} onClick={() => { setResult(null); setError(null); setStatus('Draft discarded.') }}>Discard</button></div>
      </div> : null}
    </section>
  )
}

