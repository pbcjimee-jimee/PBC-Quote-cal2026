'use client'

import Decimal from 'decimal.js'
import { useEffect, useId, useRef, useState } from 'react'
import { listEvalCases, proposeEvalSet, removeEvalCase, updateEvalCaseMemo, type AiEvalCaseRecord } from '@/lib/actions/ai-quote'
import type { AiQuoteAvailability } from '@/lib/ai-quote/config'
import { summarizeEvalMetrics, type AiDraftComparison } from '@/lib/ai-quote/eval-metrics'

interface AiEvalSectionProps {
  hasActiveGuide: boolean
  aiAvailability: AiQuoteAvailability
}

type Sample = Omit<AiEvalCaseRecord, 'id'> & { id: string | null }
type Batch = 'notes' | 'comparison'
const SET_LABEL = 'Accuracy check'
const LEAK_LABELS: Record<string, string> = { price: 'price', days_or_litres: 'days or litres', product: 'a product name' }

class LimitError extends Error {}

async function postEval<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  signal.throwIfAborted()
  const result: { ok?: boolean; data?: T; error?: unknown } = await response.json()
  signal.throwIfAborted()
  // Daily and monthly limit messages come from our own routes, so they are shown as-is.
  if (response.status === 429 && typeof result?.error === 'string') throw new LimitError(result.error)
  if (!response.ok || !result?.ok || !result.data) throw new Error('Comparison request failed')
  return result.data
}

export default function AiEvalSection({ hasActiveGuide, aiAvailability }: AiEvalSectionProps) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [busy, setBusy] = useState<{ message: string; cancelable: boolean } | null>(null)
  const [confirmation, setConfirmation] = useState<Batch | null>(null)
  const [editing, setEditing] = useState<{ quoteId: string; memo: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const loadedRef = useRef(false)
  const disposedRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const prefix = useId()
  const enabled = hasActiveGuide && aiAvailability.enabled
  const disabled = !enabled || busy !== null
  const pendingNotes = samples.filter(sample => !sample.memo.trim())
  const pendingComparisons = samples.filter(sample => sample.id && sample.memo.trim() && !sample.lastMetrics)
  const allHaveNotes = samples.length > 0 && samples.every(sample => sample.id && sample.memo.trim())
  const results = samples.filter(sample => sample.lastMetrics)
  const summary = results.length ? summarizeEvalMetrics(results.map(sample => sample.lastMetrics!)) : null

  useEffect(() => {
    disposedRef.current = false
    return () => { disposedRef.current = true; controllerRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (!confirmation) return
    cancelRef.current?.focus?.()
    const trigger = triggerRef.current
    return () => trigger?.focus?.()
  }, [confirmation])

  async function action(label: string, message: string, retry: () => void, task: () => Promise<void>) {
    if (runningRef.current || !enabled) return
    runningRef.current = true
    setBusy({ message: label, cancelable: false })
    setError(null)
    setNotice('')
    try {
      await task()
    } catch {
      if (!disposedRef.current) setError({ message, retry })
    } finally {
      runningRef.current = false
      if (!disposedRef.current) setBusy(null)
    }
  }

  async function load() {
    await action('Loading samples…', 'We couldn’t load your sample quotes; please try again.', () => void load(), async () => {
      const result = await listEvalCases({ setLabel: SET_LABEL })
      if (!result.ok) throw new Error('Load failed')
      if (disposedRef.current) return
      loadedRef.current = true
      setSamples(result.data)
    })
  }

  async function suggest() {
    await action('Finding sample quotes…', 'We couldn’t suggest sample quotes; please try again.', () => void suggest(), async () => {
      const result = await proposeEvalSet({ setLabel: SET_LABEL })
      if (!result.ok) throw new Error('Suggestion failed')
      if (disposedRef.current) return
      setSamples(current => result.data.quotes.map(quote => current.find(sample => sample.quoteId === quote.quoteId)
        ?? { ...quote, id: null, memo: '', leaks: [], lastMetrics: null }))
      setEditing(null)
      if (!result.data.quotes.length) setNotice('No eligible sample quotes yet; quotes need calculation rows and a priced public line.')
    })
  }

  async function remove(sample: Sample) {
    await action('Removing sample…', 'We couldn’t remove this sample; please try again.', () => void remove(sample), async () => {
      if (sample.id) {
        const result = await removeEvalCase({ id: sample.id })
        if (!result.ok) throw new Error('Removal failed')
      }
      if (!disposedRef.current) setSamples(current => current.filter(record => record.quoteId !== sample.quoteId))
    })
  }

  async function save(sample: Sample, memo: string) {
    if (!sample.id) return
    await action('Saving notes…', 'We couldn’t save your sample notes; your edits are still here.', () => void save(sample, memo), async () => {
      const result = await updateEvalCaseMemo({ id: sample.id, memo })
      if (!result.ok) throw new Error('Save failed')
      if (disposedRef.current) return
      setSamples(current => current.map(record => record.quoteId === sample.quoteId ? { ...record, ...result.data, lastMetrics: null } : record))
      setEditing(null)
      setNotice('Sample notes saved.')
    })
  }

  async function runBatch(kind: Batch) {
    if (runningRef.current || !enabled) return
    const cases = kind === 'notes' ? pendingNotes : pendingComparisons
    if (!cases.length) return
    runningRef.current = true
    setConfirmation(null)
    setError(null)
    setNotice('')
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      for (let i = 0; i < cases.length; i++) {
        controller.signal.throwIfAborted()
        const sample = cases[i]
        setBusy({ message: kind === 'notes' ? `Writing notes ${i + 1} of ${cases.length}…` : `Comparing ${i + 1} of ${cases.length}…`, cancelable: true })
        if (kind === 'notes') {
          const data = await postEval<{ caseId: string; memo: string; leaks: string[] }>('/api/ai/eval/memo',
            { setLabel: SET_LABEL, quoteId: sample.quoteId }, controller.signal)
          if (disposedRef.current || controller.signal.aborted) return
          setSamples(current => current.map(record => record.quoteId === sample.quoteId
            ? { ...record, id: data.caseId, memo: data.memo, leaks: data.leaks, lastMetrics: null } : record))
        } else {
          const data = await postEval<{ runId: string; metrics: AiDraftComparison }>('/api/ai/eval/run', { caseId: sample.id }, controller.signal)
          if (disposedRef.current || controller.signal.aborted) return
          setSamples(current => current.map(record => record.quoteId === sample.quoteId ? { ...record, lastMetrics: data.metrics } : record))
        }
      }
      setNotice(kind === 'notes' ? 'Sample notes are ready; review them before comparing.' : 'Comparison complete.')
    } catch (caught) {
      if (!controller.signal.aborted && !disposedRef.current) setError({
        message: caught instanceof LimitError ? caught.message : kind === 'notes' ? 'We couldn’t finish writing notes; completed notes are saved.' : 'We couldn’t finish the comparison; completed results are saved.',
        retry: () => setConfirmation(kind),
      })
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        runningRef.current = false
        if (!disposedRef.current) setBusy(null)
      }
    }
  }

  function cancel() {
    controllerRef.current?.abort()
    controllerRef.current = null
    runningRef.current = false
    setBusy(null)
    setNotice('Cancelled; completed samples have been kept.')
  }

  function confirm(kind: Batch, button: HTMLButtonElement) {
    triggerRef.current = button
    setConfirmation(kind)
  }

  return <details className="pbc-ai-eval" onToggle={event => {
    if (event.currentTarget.open && enabled && !loadedRef.current) void load()
  }}>
    <summary>Accuracy check (optional)</summary>
    <div className="pbc-ai-eval__body" inert={confirmation !== null}>
      <p className="pbc-panelsub">Try the AI on past quotes before using it for new work.</p>
      {!hasActiveGuide ? <p className="pbc-panelsub">Approve an AI guide above to use the accuracy check.</p>
        : !aiAvailability.enabled ? <p className="pbc-panelsub">{aiAvailability.message}</p> : null}
      <p role="status" aria-live="polite" aria-atomic="true" className="pbc-panelsub">{busy?.message ?? notice}</p>
      {busy?.cancelable ? <button type="button" className="pbc-btn pbc-btn--ghost" onClick={cancel}>Cancel</button> : null}
      {error ? <div className="space-y-2"><p role="alert" className="pbc-alert pbc-alert--danger">{error.message}</p>
        <button type="button" className="pbc-btn pbc-btn--ghost" disabled={disabled} onClick={error.retry}>Try again</button></div> : null}
      <section className="space-y-3" aria-labelledby={`${prefix}-pick`}>
        <h3 id={`${prefix}-pick`} className="pbc-paneltitle">1. Pick sample quotes</h3>
        <button type="button" className="pbc-btn pbc-btn--ghost" disabled={disabled || editing !== null} onClick={() => void suggest()}>Suggest 20 quotes</button>
        {samples.length ? <ul className="pbc-ai-eval__samples">{samples.map(sample => <li key={sample.quoteId}>
          <span>{sample.quoteLabel}</span>
          <button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" disabled={disabled || editing !== null}
            aria-label={`Remove ${sample.quoteLabel}`} onClick={() => void remove(sample)}>Remove</button>
        </li>)}</ul> : <p className="pbc-panelsub">Suggest a few past quotes, then remove any you don’t want to compare.</p>}
      </section>
      <section className="space-y-3" aria-labelledby={`${prefix}-notes`}>
        <h3 id={`${prefix}-notes`} className="pbc-paneltitle">2. Write sample notes</h3>
        <button type="button" className="pbc-btn pbc-btn--ghost" disabled={disabled || !pendingNotes.length || editing !== null}
          onClick={event => confirm('notes', event.currentTarget)}>Write notes with AI</button>
        {samples.filter(sample => sample.memo).map(sample => <div key={sample.quoteId} className="pbc-ai-eval__notes">
          <strong>{sample.quoteLabel}</strong>
          {sample.leaks.map(leak => <p key={leak} className="pbc-ai-eval__check">Check: mentions {LEAK_LABELS[leak] ?? 'details to review'}</p>)}
          <details><summary>Sample notes</summary><p className="pbc-ai-eval__memo">{sample.memo}</p>
            {editing?.quoteId !== sample.quoteId ? <button type="button" className="pbc-btn pbc-btn--ghost" disabled={disabled || editing !== null}
              aria-label={`Edit notes for ${sample.quoteLabel}`} onClick={() => setEditing({ quoteId: sample.quoteId, memo: sample.memo })}>Edit</button> : null}
          </details>
          {editing?.quoteId === sample.quoteId ? <div className="space-y-3">
            <label className="pbc-field" htmlFor={`${prefix}-${sample.quoteId}-memo`}><span className="pbc-field__label">Notes for {sample.quoteLabel}</span>
              <textarea id={`${prefix}-${sample.quoteId}-memo`} className="pbc-textarea" rows={6} maxLength={8000} value={editing.memo}
                disabled={disabled} onChange={event => setEditing({ quoteId: sample.quoteId, memo: event.target.value })} /></label>
            <div className="flex flex-wrap gap-2"><button type="button" className="pbc-btn pbc-btn--primary"
              disabled={disabled || !editing.memo.trim() || editing.memo.length > 8000} onClick={() => void save(sample, editing.memo)}>Save</button>
              <button type="button" className="pbc-btn pbc-btn--ghost" disabled={disabled} onClick={() => setEditing(null)}>Cancel edit</button></div>
          </div> : null}
        </div>)}
      </section>
      <section className="space-y-3" aria-labelledby={`${prefix}-compare`}>
        <h3 id={`${prefix}-compare`} className="pbc-paneltitle">3. Compare</h3>
        <button type="button" className="pbc-btn pbc-btn--primary" disabled={disabled || !allHaveNotes || !pendingComparisons.length || editing !== null}
          onClick={event => confirm('comparison', event.currentTarget)}>Run comparison</button>
        {summary ? <>
          <p className="pbc-panelsub">Results for {results.length} of {samples.length} sample quotes.</p>
          <div className="pbc-tablewrap" role="region" aria-label="Accuracy check results" tabIndex={0}>
            <table className="pbc-table"><thead><tr><th scope="col">Quote</th><th scope="col">Total difference %</th>
              <th scope="col">Days difference %</th><th scope="col">Products matched %</th></tr></thead>
              <tbody>{results.map(sample => <tr key={sample.quoteId}><th scope="row">{sample.quoteLabel}</th>
                <td>{new Decimal(sample.lastMetrics!.finalTotalDiffPct).toFixed(1)}%</td>
                <td>{new Decimal(sample.lastMetrics!.workingDaysDiffPct).toFixed(1)}%</td>
                <td>{new Decimal(sample.lastMetrics!.productMatchRate).mul(100).toFixed(1)}%</td></tr>)}</tbody></table>
          </div>
          <p className="pbc-panelsub"><strong>Median total difference {new Decimal(summary.median.finalTotalDiffPct).toFixed(1)}% — {summary.meetsLaunchCriteria ? 'Meets target' : 'Below target'}</strong></p>
          <p className="pbc-panelsub">Median days difference {new Decimal(summary.median.workingDaysDiffPct).toFixed(1)}%; products matched {new Decimal(summary.median.productMatchRate).mul(100).toFixed(1)}%.</p>
        </> : null}
        <p className="pbc-panelsub">Sample quotes were part of the AI guide statistics, so results may look slightly better than real use.</p>
      </section>
    </div>
    {confirmation ? <div className="pbc-dialogbackdrop" role="presentation"><div className="pbc-dialog" role="dialog"
      aria-modal="true" aria-labelledby={`${prefix}-confirm`} aria-describedby={`${prefix}-cost`} onKeyDown={event => {
        if (event.key === 'Escape') setConfirmation(null)
        if (event.key === 'Tab') {
          event.preventDefault()
          if (document.activeElement === cancelRef.current) confirmRef.current?.focus?.()
          else cancelRef.current?.focus?.()
        }
      }}>
      <h2 id={`${prefix}-confirm`}>{confirmation === 'notes' ? 'Write sample notes?' : 'Run the comparison?'}</h2>
      <p id={`${prefix}-cost`}>{confirmation === 'notes'
        ? 'AI will write notes one quote at a time; a set of 20 costs about $1.'
        : 'AI will compare one quote at a time; a set of 20 costs about $8–10.'} You can cancel at any time.</p>
      <div className="pbc-dialog__actions"><button ref={cancelRef} type="button" className="pbc-btn pbc-btn--ghost" onClick={() => setConfirmation(null)}>Cancel</button>
        <button ref={confirmRef} type="button" className="pbc-btn pbc-btn--primary" onClick={() => void runBatch(confirmation)}>{confirmation === 'notes' ? 'Write notes' : 'Start comparison'}</button></div>
    </div></div> : null}
  </details>
}
