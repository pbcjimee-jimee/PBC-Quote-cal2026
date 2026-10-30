'use client'

import { useEffect, useRef, useState } from 'react'
import {
  activateAiQuoteKnowledge, listAiQuoteKnowledge, updateAiQuoteKnowledgeDraft, type AiKnowledgeRecord,
} from '@/lib/actions/ai-quote'
import type { AiQuoteAvailability } from '@/lib/ai-quote/config'
import type { StatSummary } from '@/lib/ai-quote/knowledge-stats'
import AiEvalSection from '@/components/settings/tabs/ai-eval-section'

interface AiKnowledgeTabProps {
  initialKnowledge: AiKnowledgeRecord[]
  aiAvailability: AiQuoteAvailability
  onKnowledgeChange?: (knowledge: AiKnowledgeRecord[]) => void
}

type Operation = 'analyzing' | 'saving' | 'approving' | 'refreshing'

export default function AiKnowledgeTab({ initialKnowledge, aiAvailability, onKnowledgeChange }: AiKnowledgeTabProps) {
  const [knowledge, setKnowledge] = useState(initialKnowledge)
  const draft = knowledge.find(guide => guide.status === 'draft')
  const active = knowledge.find(guide => guide.status === 'active')
  const guide = draft ?? active
  const [styleGuide, setStyleGuide] = useState(draft?.styleGuide ?? '')
  const [pricingGuide, setPricingGuide] = useState(draft?.pricingGuide ?? '')
  const [pending, setPending] = useState<Operation | null>(null)
  const [confirmation, setConfirmation] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<{ message: string; retry: Operation } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirmation) return
    cancelRef.current?.focus?.()
    const trigger = triggerRef.current
    return () => trigger?.focus?.()
  }, [confirmation])

  useEffect(() => {
    if (pending !== 'analyzing') return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [pending])

  useEffect(() => () => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  function applyKnowledge(records: AiKnowledgeRecord[]) {
    setKnowledge(records)
    onKnowledgeChange?.(records)
    const nextDraft = records.find(record => record.status === 'draft')
    setStyleGuide(nextDraft?.styleGuide ?? '')
    setPricingGuide(nextDraft?.pricingGuide ?? '')
  }

  async function refreshKnowledge() {
    const result = await listAiQuoteKnowledge()
    if (!result.ok) throw new Error('Unable to load guides')
    applyKnowledge(result.data)
  }

  async function analyze() {
    if (runningRef.current || !aiAvailability.enabled) return
    runningRef.current = true
    setConfirmation(false)
    setError(null)
    setNotice('')
    setElapsed(0)
    setPending('analyzing')
    const controller = new AbortController()
    controllerRef.current = controller
    let generated = false
    try {
      const response = await fetch('/api/ai/knowledge', { method: 'POST', signal: controller.signal })
      if (controller.signal.aborted) return
      const result: unknown = await response.json()
      if (controller.signal.aborted) return
      if (!response.ok || !result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
        throw new Error('Analysis failed')
      }
      generated = true
      const records = await listAiQuoteKnowledge()
      if (controller.signal.aborted) return
      if (!records.ok) {
        setError({ message: 'Your guide was generated, but we couldn’t load it.', retry: 'refreshing' })
        return
      }
      applyKnowledge(records.data)
      setNotice('Analysis complete; your draft is ready to review.')
    } catch {
      if (!controller.signal.aborted) setError(generated
        ? { message: 'Your guide was generated, but we couldn’t load it.', retry: 'refreshing' }
        : { message: 'We couldn’t analyze your past quotes; please try again.', retry: 'analyzing' })
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        runningRef.current = false
        setPending(null)
      }
    }
  }

  function cancelAnalysis() {
    controllerRef.current?.abort()
    controllerRef.current = null
    runningRef.current = false
    setPending(null)
    setNotice('Analysis cancelled; no guide has been approved.')
  }

  const dirty = !!draft && (styleGuide !== draft.styleGuide || pricingGuide !== draft.pricingGuide)
  const validGuides = styleGuide.trim().length > 0 && pricingGuide.trim().length > 0
    && styleGuide.length <= 40000 && pricingGuide.length <= 40000

  async function saveOrApprove(operation: 'saving' | 'approving') {
    if (!draft || runningRef.current || !validGuides) return
    runningRef.current = true
    setPending(operation)
    setError(null)
    setNotice('')
    try {
      if (dirty) {
        const result = await updateAiQuoteKnowledgeDraft({ id: draft.id, styleGuide, pricingGuide })
        if (!result.ok) throw new Error('Save failed')
        applyKnowledge(knowledge.map(record => record.id === draft.id ? result.data : record))
      }
      if (operation === 'approving') {
        const result = await activateAiQuoteKnowledge({ id: draft.id })
        if (!result.ok) throw new Error('Approval failed')
        applyKnowledge(knowledge.map(record => record.id === draft.id
          ? { ...record, styleGuide, pricingGuide, status: 'active', approvedAt: new Date().toISOString() }
          : record.status === 'active' ? { ...record, status: 'archived' } : record))
        try {
          await refreshKnowledge()
        } catch {
          setError({ message: 'Your guide is active, but we couldn’t reload its details.', retry: 'refreshing' })
        }
        setNotice('Guide approved and ready to use.')
      } else {
        setNotice('Changes saved.')
      }
    } catch {
      setError({ message: operation === 'saving'
        ? 'We couldn’t save your changes; please try again.'
        : 'We couldn’t approve this guide; your edits are still here.', retry: operation })
    } finally {
      runningRef.current = false
      setPending(null)
    }
  }

  async function retry() {
    if (!error || runningRef.current) return
    if (error.retry === 'analyzing') {
      setConfirmation(true)
    } else if (error.retry === 'refreshing') {
      runningRef.current = true
      setPending('refreshing')
      try {
        await refreshKnowledge()
        setError(null)
      } catch {
        setError({ message: 'We couldn’t load your guide; please try again.', retry: 'refreshing' })
      } finally {
        runningRef.current = false
        setPending(null)
      }
    } else {
      await saveOrApprove(error.retry)
    }
  }

  const status = draft ? 'Draft ready for review'
    : active ? `Active guide v${active.version}${active.approvedAt ? ` (approved ${new Date(active.approvedAt).toLocaleDateString('en-AU')})` : ''}`
      : 'No guide yet'
  const statsRows: Array<{ label: string; summary: StatSummary }> = guide ? [
    ...Object.entries(guide.stats.areas).map(([label, area]) => ({ label: `${label.replaceAll(':', ' · ')} — days`, summary: area.workingDays })),
    ...Object.entries(guide.stats.publicLines).map(([label, line]) => ({ label: `${label} — unit price`, summary: line.unitPrice })),
    { label: 'Public / calculator ratio', summary: guide.stats.publicVsCalculator },
  ] : []

  return (
    <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow">
      <div className="space-y-5" inert={confirmation}>
        <header>
          <h2 className="pbc-paneltitle">AI</h2>
          <p className="pbc-panelsub mt-2">AI studies past quotes to learn PBC wording and pricing patterns; you review and approve the guide before it is used.</p>
        </header>
        <p className="pbc-panelsub" role="status" aria-live="polite" aria-atomic="true">
          <strong>{status}</strong>
          {pending === 'analyzing' ? ` · Analyzing past quotes — ${elapsed} seconds elapsed.` : notice ? ` · ${notice}` : ''}
        </p>
        {!aiAvailability.enabled ? <p className="pbc-alert pbc-alert--warning">{aiAvailability.message}</p> : null}
        {error ? <div className="space-y-3">
          <p role="alert" className="pbc-alert pbc-alert--danger">{error.message}</p>
          <button type="button" className="pbc-btn pbc-btn--ghost" disabled={pending !== null} onClick={() => void retry()}>Try again</button>
        </div> : null}
        {!draft ? <div className="flex flex-wrap gap-3">
          <button ref={triggerRef} type="button" className="pbc-btn pbc-btn--primary" disabled={!aiAvailability.enabled || pending !== null} onClick={() => setConfirmation(true)}>
            {pending === 'analyzing' ? 'Analyzing…' : 'Analyze past quotes'}
          </button>
          {pending === 'analyzing' ? <button type="button" className="pbc-btn pbc-btn--ghost" onClick={cancelAnalysis}>Cancel</button> : null}
        </div> : null}
        {draft ? <section className="pbc-formgroup space-y-4" aria-labelledby="ai-guide-review-title">
          <h3 id="ai-guide-review-title" className="pbc-paneltitle">Review draft</h3>
          <label className="pbc-field" htmlFor="ai-style-guide"><span className="pbc-field__label">Style guide</span>
            <textarea id="ai-style-guide" className="pbc-textarea" rows={9} maxLength={40000} value={styleGuide} disabled={pending !== null} onChange={event => setStyleGuide(event.target.value)} />
          </label>
          <label className="pbc-field" htmlFor="ai-pricing-guide"><span className="pbc-field__label">Pricing guide</span>
            <textarea id="ai-pricing-guide" className="pbc-textarea" rows={9} maxLength={40000} value={pricingGuide} disabled={pending !== null} onChange={event => setPricingGuide(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="pbc-btn pbc-btn--ghost" disabled={pending !== null || !dirty || !validGuides} onClick={() => void saveOrApprove('saving')}>
              {pending === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="pbc-btn pbc-btn--primary" disabled={pending !== null || !validGuides} onClick={() => void saveOrApprove('approving')}>
              {pending === 'approving' ? 'Approving…' : 'Approve and use'}
            </button>
          </div>
        </section> : active ? <details className="pbc-formula-description">
          <summary>View active guide</summary>
          <h3 className="pbc-paneltitle mt-3">Style guide</h3><p className="whitespace-pre-wrap">{active.styleGuide}</p>
          <h3 className="pbc-paneltitle mt-4">Pricing guide</h3><p className="whitespace-pre-wrap">{active.pricingGuide}</p>
        </details> : null}
        {guide ? <details className="pbc-formula-description">
          <summary>Statistics used</summary>
          <p>{guide.sourceCounts.quotes} quotes, {guide.sourceCounts.publicLines} public lines and {guide.sourceCounts.items} calculation rows.</p>
          <div className="pbc-tablewrap mt-3">
            <table className="pbc-table">
              <thead><tr><th scope="col">Pattern</th><th scope="col">n</th><th scope="col">Median</th><th scope="col">Sample</th></tr></thead>
              <tbody>{statsRows.map(row => <tr key={row.label}>
                <th scope="row">{row.label}</th><td>{row.summary.n}</td><td>{row.summary.median}</td><td>{row.summary.lowSample ? 'Low sample' : 'Sufficient sample'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details> : null}
        <AiEvalSection key={active?.id ?? 'no-active-guide'} hasActiveGuide={Boolean(active)} aiAvailability={aiAvailability} />
      </div>
      {confirmation ? <div className="pbc-dialogbackdrop" role="presentation">
        <div className="pbc-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-analyze-title" aria-describedby="ai-analyze-description" onKeyDown={event => {
          if (event.key === 'Escape') setConfirmation(false)
          if (event.key === 'Tab') {
            event.preventDefault()
            if (document.activeElement === cancelRef.current) confirmRef.current?.focus?.()
            else cancelRef.current?.focus?.()
          }
        }}>
          <h2 id="ai-analyze-title">Analyze past quotes?</h2>
          <p id="ai-analyze-description">This takes up to a few minutes and costs about $1; you’ll review the draft before it is used.</p>
          <div className="pbc-dialog__actions">
            <button ref={cancelRef} type="button" className="pbc-btn pbc-btn--ghost" onClick={() => setConfirmation(false)}>Cancel</button>
            <button ref={confirmRef} type="button" className="pbc-btn pbc-btn--primary" onClick={() => void analyze()}>Start analysis</button>
          </div>
        </div>
      </div> : null}
    </div>
  )
}
