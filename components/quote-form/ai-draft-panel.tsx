'use client'

import { startTransition, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AiQuoteAvailability } from '@/lib/ai-quote/config'
import type { AiQuoteDraft, DraftJobberContext } from '@/lib/ai-quote/types'
import type { AiDraftSelection, AiLineApplyMode } from './ai-draft-apply'
import { AREA_SCOPE_LABELS } from '@/lib/areas/constants'

export interface AiDraftPanelProps {
  availability: AiQuoteAvailability
  hasActiveKnowledge: boolean
  jobberContext: DraftJobberContext | null
  photoLookup: { quoteNumber: string; address: string } | null
  hasExistingPublicLines: boolean
  appliedRunId: string | null
  onApply(input: { runId: string; draft: AiQuoteDraft; selection: AiDraftSelection; mode: AiLineApplyMode }): Promise<void>
  onReallocate(): void
}

type DraftResult = { runId: string; draft: AiQuoteDraft }
type PhotoFolder = { id: string; name: string }
type PhotoFolders = { connected: boolean; selected: PhotoFolder | null; candidates: PhotoFolder[]; photoCount: number | null }
type PhotoLabel = { ref: number; name: string }
const APPLIED_STATUS = 'AI draft applied - review the lines and prices before Save & Sync.'

// Show only the values the photos changed, e.g. "2 → 2.5 days".
function adjustmentSummary(days: string, labour: string, adjustment: { workingDays: string; labourPerDay: string }): string {
  const parts: string[] = []
  if (Number(adjustment.workingDays) !== Number(days)) parts.push(`${days} → ${adjustment.workingDays} ${Number(adjustment.workingDays) === 1 ? 'day' : 'days'}`)
  if (Number(adjustment.labourPerDay) !== Number(labour)) parts.push(`${labour} → ${adjustment.labourPerDay} ${Number(adjustment.labourPerDay) === 1 ? 'person' : 'people'}`)
  return parts.join(' · ')
}

function PhotoRefs({ refs, labels }: { refs: number[]; labels: PhotoLabel[] }) {
  return <>{refs.map((ref, index) => <span key={ref} title={labels.find(label => label.ref === ref)?.name}>{index === 0 ? 'photo ' : ', '}{String(ref).padStart(2, '0')}</span>)}</>
}

function Checklist({ title, items, selected, onToggle }: {
  title: string
  items: Array<{ id: string; label: string; rationale: string; detail?: ReactNode }>
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
          {item.detail}
        </div>
      ))}
    </fieldset>
  )
}

export function AiDraftPanel({ availability, hasActiveKnowledge, jobberContext, photoLookup, hasExistingPublicLines, appliedRunId, onApply, onReallocate }: AiDraftPanelProps) {
  const id = useId()
  const [memo, setMemo] = useState('')
  const [result, setResult] = useState<DraftResult | null>(null)
  const [selection, setSelection] = useState<AiDraftSelection>({ areas: new Set(), publicLines: new Set(), workItems: new Set(), formulaScopes: new Set(), photoAdjustments: new Set() })
  const [mode, setMode] = useState<AiLineApplyMode>('append')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<'photos' | 'draft'>('draft')
  const [photos, setPhotos] = useState<PhotoFolders | null>(null)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [lookupPending, setLookupPending] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoLabels, setPhotoLabels] = useState<PhotoLabel[]>([])
  const [skippedCount, setSkippedCount] = useState(0)
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
  const quoteNumber = photoLookup?.quoteNumber
  const address = photoLookup?.address
  const progress = `${phase === 'photos' ? 'Analysing photos…' : 'Writing the quote…'} ${elapsed}s`
  const canContinueWithoutPhotos = photoError || (error === 'request' && photoLookup && includePhotos && photos?.selected)

  useEffect(() => {
    const canLookup = quoteNumber !== undefined && address !== undefined && availability.enabled
    const controller = new AbortController()
    startTransition(() => {
      setPhotos(null)
      setPhotoError(null)
      setIncludePhotos(true)
      setChoosingFolder(false)
      setLookupPending(canLookup)
    })
    if (!canLookup) return
    const timeout = setTimeout(() => {
      controller.abort()
      setLookupPending(false)
      setPhotoError('Unable to find photo folders.')
    }, 30000)
    void (async () => {
      try {
        const response = await fetch('/api/ai/photos/folders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteNumber, address }), signal: controller.signal,
        })
        const body = await response.json()
        if (controller.signal.aborted) return
        if (response.status === 409) {
          setPhotoError('Reconnect OneDrive in Settings > AI.')
          return
        }
        if (!response.ok || !body.ok || !body.data) throw new Error('Folders unavailable')
        setPhotos(body.data)
      } catch {
        if (!controller.signal.aborted) setPhotoError('Unable to find photo folders.')
      } finally {
        clearTimeout(timeout)
        if (!controller.signal.aborted) setLookupPending(false)
      }
    })()
    return () => { clearTimeout(timeout); controller.abort() }
  }, [quoteNumber, address, availability.enabled])

  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => {
    if (!loading) return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [loading, phase])
  useEffect(() => { if (result) headingRef.current?.focus?.() }, [result])

  async function createDraft(withoutPhotos = false) {
    if (requestRef.current || applyingRef.current || disabled || !memo.trim()) return
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setElapsed(0)
    setError(null)
    setResult(null)
    setPhotoError(null)
    setPhotoLabels([])
    setSkippedCount(0)
    setStatus('')
    const analyzePhotos = !withoutPhotos && photoLookup && includePhotos && photos?.selected && photos.photoCount !== 0
    let analyzing = Boolean(analyzePhotos)
    setPhase(analyzing ? 'photos' : 'draft')
    let timeout: ReturnType<typeof setTimeout>
    function startTimeout() {
      return setTimeout(() => {
        if (requestRef.current !== controller) return
        controller.abort()
        requestRef.current = null
        setLoading(false)
        if (analyzing) {
          setPhotoError("Photos couldn't be analysed.")
          setStatus('')
        } else {
          setError('request')
          setStatus('The draft took too long. Try again.')
        }
      }, 300000)
    }
    timeout = startTimeout()
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true })
    try {
      const context = jobberContext ? {
        jobberQuoteId: jobberContext.jobberQuoteId,
        workType: jobberContext.workType,
        customerType: jobberContext.customerType,
        areaSqft: jobberContext.areaSqft,
        existingLines: jobberContext.existingLines.slice(0, 60).map(line => ({ name: line.name, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
      } : null
      let photoAnalysisRunId: string | undefined
      if (analyzePhotos && photos?.selected) {
        const response = await fetch('/api/ai/photos/analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: photos.selected.id, memo: memo.trim(), jobberContext: context }), signal: controller.signal,
        })
        const body = await response.json()
        if (controller.signal.aborted) return
        if (response.status === 409) {
          setPhotoError('Reconnect OneDrive in Settings > AI.')
          return
        }
        if (!response.ok || !body.ok || !body.data?.runId) throw new Error('Photos unavailable')
        photoAnalysisRunId = body.data.runId
        setPhotoLabels(body.data.photoLabels ?? [])
        setSkippedCount(body.data.skippedCount ?? 0)
        analyzing = false
        clearTimeout(timeout)
        timeout = startTimeout()
        setPhase('draft')
        setElapsed(0)
      }
      const response = await fetch('/api/ai/quote-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo: memo.trim(), jobberContext: context, ...(photoAnalysisRunId ? { photoAnalysisRunId } : {}) }), signal: controller.signal,
      })
      const body = await response.json()
      if (controller.signal.aborted) return
      if (response.status === 429) {
        setDailyLimit(true)
        setStatus(typeof body?.error === 'string' && body.error ? body.error : 'The daily limit has been reached. Try again tomorrow.')
        return
      }
      if (!response.ok || !body.ok || !body.data?.runId || !body.data?.draft) throw new Error('Draft unavailable')
      const next: DraftResult = body.data
      setSelection({
        areas: new Set(next.draft.areas.map(area => `${area.scope}:${area.name}`)),
        publicLines: new Set(next.draft.publicLines.map(line => line.id)),
        workItems: new Set(next.draft.workItems.map(item => item.id)),
        formulaScopes: new Set(next.draft.formulaSelections.map(formula => formula.scope)),
        photoAdjustments: new Set(next.draft.workItems.filter(item => item.photoAdjustment).map(item => item.id)),
      })
      setMode('append')
      setResult(next)
      setStatus('Draft ready for review.')
    } catch {
      if (!controller.signal.aborted) {
        if (analyzing) {
          setPhotoError("Photos couldn't be analysed.")
          setStatus('')
        } else {
          setError('request')
          setStatus('Unable to create a draft. Please try again.')
        }
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
        <div className="pbc-ai-draft__notes"><span id={`${id}-privacy`}>Do not include client names, addresses or phone numbers.</span><span id={`${id}-count`}>{memo.length} / 8000</span></div>
        {photoLookup ? <div className="pbc-ai-draft__photos">
          {lookupPending ? <p role="status">Finding site photos…</p> : photos && !photos.connected ? <p><a href="/settings?tab=ai">Connect OneDrive in Settings &gt; AI to include site photos.</a></p> : photos?.connected ? <>
            {photos.selected ? <>
              <label className="pbc-ai-draft__photo-check"><input type="checkbox" checked={includePhotos && photos.photoCount !== 0} disabled={disabled || loading || applying || photos.photoCount === 0} onChange={event => setIncludePhotos(event.target.checked)} /> Include site photos</label>
              <div className="pbc-ai-draft__photo-meta"><span>{photos.selected.name}{photos.photoCount === null ? '' : photos.photoCount === 0 ? ' · No photos in this folder' : photos.photoCount > 30 ? ` · First 30 of ${photos.photoCount} photos` : ` · ${photos.photoCount} photos`}</span><button type="button" className="pbc-ai-draft__why" disabled={disabled || loading || applying} aria-expanded={choosingFolder} aria-controls={`${id}-folders`} onClick={() => setChoosingFolder(current => !current)}>Change folder</button></div>
            </> : includePhotos ? <p>No folder found for quote {photoLookup.quoteNumber}</p> : <div className="pbc-ai-draft__photo-meta"><span>Site photos excluded.</span><button type="button" className="pbc-ai-draft__why" disabled={disabled || loading || applying} aria-expanded={choosingFolder} aria-controls={`${id}-folders`} onClick={() => setChoosingFolder(current => !current)}>Change folder</button></div>}
            {(!photos.selected && includePhotos) || choosingFolder ? <fieldset id={`${id}-folders`} className="pbc-ai-draft__group" disabled={disabled || loading || applying}>
              <legend>Photo folder</legend>
              {[...(photos.selected ? [photos.selected] : []), ...photos.candidates.filter(folder => folder.id !== photos.selected?.id)].slice(0, 3).map(folder => <label key={folder.id}><input type="radio" name={`${id}-folder`} checked={photos.selected?.id === folder.id} onChange={() => { setPhotos(current => current ? { ...current, selected: folder, photoCount: current.selected?.id === folder.id ? current.photoCount : null } : null); setIncludePhotos(true); setChoosingFolder(false); setPhotoError(null) }} /> <span>{folder.name}</span></label>)}
              <button type="button" className="pbc-ai-draft__why" onClick={() => { setIncludePhotos(false); setChoosingFolder(false) }}>Don&apos;t use photos</button>
            </fieldset> : null}
          </> : null}
        </div> : null}
        <div className="pbc-ai-draft__actions"><button type="button" className="pbc-btn pbc-btn--primary" disabled={disabled || loading || applying || lookupPending || !memo.trim()} onClick={() => void createDraft()}>{loading ? progress : appliedRunId || hasApplied ? 'Create new draft' : 'Create draft'}</button>{loading ? <button type="button" className="pbc-btn pbc-btn--ghost" onClick={cancel}>Cancel</button> : null}</div>
      </> : null}
      <div aria-live="polite" aria-atomic="true">
        <p role="status" className={loading || status === APPLIED_STATUS ? 'sr-only' : undefined}>{loading ? progress : status}</p>
        {photoError ? <p>{photoError.startsWith('Reconnect') ? <>Reconnect OneDrive in <a href="/settings?tab=ai">Settings &gt; AI</a>.</> : photoError}</p> : null}
        {canContinueWithoutPhotos ? <button type="button" className="pbc-btn pbc-btn--ghost" disabled={disabled || loading || applying || !memo.trim()} onClick={() => void createDraft(true)}>Continue without photos</button> : null}
        {error ? <button type="button" className="pbc-btn pbc-btn--ghost" disabled={applying} onClick={() => void (error === 'apply' ? apply() : createDraft())}>Try again</button> : null}
      </div>
      {draft ? <div className="pbc-ai-draft__result" aria-live="polite">
        <h3 ref={headingRef} tabIndex={-1}>Review AI draft</h3>
        <p>{draft.summary}</p>
        {skippedCount > 0 ? <p className="pbc-bodytext">{skippedCount} {skippedCount === 1 ? 'photo skipped' : 'photos skipped'} during analysis.</p> : null}
        {draft.photoFindings.length > 0 ? <div><h4>Found in photos</h4><ul>{draft.photoFindings.map((finding, index) => <li key={index}>{finding.area} — {finding.issue} (<PhotoRefs refs={finding.photoRefs} labels={photoLabels} />)</li>)}</ul></div> : null}
        {draft.questions.length + draft.warnings.length > 0 ? <div className="pbc-alert pbc-alert--warning pbc-ai-draft__warnings"><h4>Check before saving</h4><ul>{[...draft.questions, ...draft.warnings].map((text, index) => <li key={index}>{text}</li>)}</ul></div> : null}
        {draft.findings.length > 0 ? <><h4>Findings</h4><ul>{draft.findings.map((finding, index) => <li key={index}>{finding.area}: {finding.issue} — {finding.evidence} <span className="pbc-bodytext">({finding.confidence} confidence)</span></li>)}</ul></> : null}
        <Checklist title="Quote lines" items={draft.publicLines.map(line => ({ id: line.id, label: `${line.name} · Qty ${line.quantity}`, rationale: line.rationale }))} selected={selection.publicLines} onToggle={key => toggle('publicLines', key)} />
        <p className="pbc-bodytext">The Basic template and a Total line are added automatically.</p>
        <Checklist title="Materials and labour" items={draft.workItems.map(item => ({ id: item.id, label: `${item.product.name} · ${item.areaName} · Qty ${item.quantity} · ${item.workingDays} ${Number(item.workingDays) === 1 ? 'day' : 'days'} · ${item.labourPerDay} ${Number(item.labourPerDay) === 1 ? 'person' : 'people'}`, rationale: item.rationale,
          detail: item.photoAdjustment ? <div className="pbc-ai-draft__adjustment">
            <p>{adjustmentSummary(item.workingDays, item.labourPerDay, item.photoAdjustment)}</p>
            <p>{item.photoAdjustment.reason} (<PhotoRefs refs={item.photoAdjustment.photoRefs} labels={photoLabels} />)</p>
            <label><input type="checkbox" checked={selection.photoAdjustments.has(item.id)} disabled={!selection.workItems.has(item.id) || applying} aria-label={`Include photo adjustment for ${item.product.name} · ${item.areaName}`} onChange={() => toggle('photoAdjustments', item.id)} /> Include photo adjustment</label>
          </div> : null,
        }))} selected={selection.workItems} onToggle={key => toggle('workItems', key)} />
        <Checklist title="Formula picks" items={draft.formulaSelections.map(formula => ({ id: formula.scope, label: `${AREA_SCOPE_LABELS[formula.scope]}: low Formula ${formula.selectedMin}, high Formula ${formula.selectedMax}`, rationale: formula.rationale }))} selected={selection.formulaScopes} onToggle={key => toggle('formulaScopes', key)} />
        {hasExistingPublicLines ? <fieldset className="pbc-ai-draft__group"><legend>Apply quote lines</legend><label><input type="radio" name={`${id}-mode`} checked={mode === 'append'} onChange={() => setMode('append')} /> Add to existing lines</label><label><input type="radio" name={`${id}-mode`} checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace AI-editable lines</label></fieldset> : null}
        {!hasSelection ? <p className="pbc-bodytext" role="status">Select at least one item to apply.</p> : null}
        <div className="pbc-ai-draft__actions"><button type="button" className="pbc-btn pbc-btn--primary" disabled={applying || !hasSelection} onClick={() => void apply()}>{applying ? 'Applying draft...' : 'Apply to quote'}</button><button type="button" className="pbc-btn pbc-btn--ghost" disabled={applying} onClick={() => { setResult(null); setError(null); setStatus('Draft discarded.') }}>Discard</button></div>
      </div> : null}
    </section>
  )
}

