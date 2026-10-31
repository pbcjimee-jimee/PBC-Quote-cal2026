'use client'

import Decimal from 'decimal.js'
import { startTransition, useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { getAiBudgetStatus, updateAiMonthlyBudget } from '@/lib/actions/ai-budget'
import type { AiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'

export default function AiBudgetSection() {
  const id = useId()
  const [status, setStatus] = useState<AiMonthlyBudgetStatus | null>(null)
  const [limit, setLimit] = useState('')
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState('Loading AI budget...')
  const [error, setError] = useState<'load' | 'save' | null>(null)
  const running = useRef(false)
  const disposed = useRef(false)

  const run = useCallback(async (operation: 'load' | 'save', value?: string) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    setNotice(operation === 'load' ? 'Loading AI budget...' : 'Saving budget...')
    try {
      const result = operation === 'load' ? await getAiBudgetStatus() : await updateAiMonthlyBudget({ monthlyBudgetUsd: Number(value) })
      if (disposed.current) return
      if (!result.ok) { setError(operation); setNotice(result.error); return }
      setStatus(result.data)
      setLimit(result.data.budgetUsd)
      setNotice(operation === 'save' ? 'Budget saved.' : '')
    } catch {
      if (!disposed.current) {
        setError(operation)
        setNotice(operation === 'load' ? 'Unable to load the AI budget. Please try again.' : 'Unable to save the AI budget. Please try again.')
      }
    } finally {
      running.current = false
      if (!disposed.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    disposed.current = false
    startTransition(() => { void run('load') })
    return () => { disposed.current = true }
  }, [run])

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => { void run('save', limit) })
  }

  const spent = new Decimal(status?.spentUsd ?? 0)
  const budget = new Decimal(status?.budgetUsd ?? 1)
  const percent = Decimal.min(100, spent.div(budget).mul(100)).toNumber()
  const warning = percent >= 80

  return <section className={`pbc-card pbc-card--pad pbc-ai-budget${status?.reached ? ' pbc-ai-budget--reached' : warning ? ' pbc-ai-budget--warning' : ''}`} aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h3 id={`${id}-title`} className="pbc-paneltitle">Monthly AI budget</h3>
    {status ? <>
      <p>This month: ${status.spentUsd} of ${status.budgetUsd} used</p>
      <div className="pbc-ai-budget__progress" role="progressbar" aria-label="Monthly AI budget used" aria-valuemin={0} aria-valuemax={budget.toNumber()} aria-valuenow={Decimal.min(spent, budget).toNumber()} aria-valuetext={`$${status.spentUsd} of $${status.budgetUsd} used`}><span style={{ width: `${percent}%` }} /></div>
      {status.reached ? <p role="alert" className="pbc-alert pbc-alert--danger">Budget reached. AI drafts are paused until next month or until you raise the budget.</p> : null}
      <form className="pbc-ai-budget__form" onSubmit={save}>
        <div className="pbc-field"><label className="pbc-field__label" htmlFor={`${id}-limit`}>Monthly limit (USD)</label>
          <input id={`${id}-limit`} className="pbc-input" type="number" min={1} max={1000} step={1} required value={limit} onChange={event => setLimit(event.target.value)} disabled={busy} /></div>
        <button type="submit" className="pbc-btn pbc-btn--primary" disabled={busy}>Save</button>
      </form>
    </> : null}
    <div aria-live="polite" aria-atomic="true"><p className={error ? 'pbc-alert pbc-alert--danger' : 'pbc-panelsub'}>{notice}</p></div>
    {error ? <button type="button" className="pbc-btn pbc-btn--ghost" disabled={busy} onClick={() => startTransition(() => { void run(error, limit) })}>Try again</button> : null}
    <p className="pbc-panelsub">Also keep the spend limit in Anthropic Console at or above this amount.</p>
  </section>
}
