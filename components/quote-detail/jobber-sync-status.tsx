'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  checkJobberQuoteSync,
  getJobberSyncState,
  type SyncState,
} from '@/lib/actions/jobber-sync'
import { retryJobberQuoteSync } from '@/lib/actions/quotes'

export interface JobberSyncStatusProps {
  quoteId: string
  legacyFailed?: boolean
}

type LookupState =
  | { status: 'loading'; quoteId: string }
  | { status: 'failure'; quoteId: string }
  | { status: 'ready'; quoteId: string; sync: SyncState | null }

type ClientActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

function statusMessage(sync: SyncState): string {
  if (!sync.isCurrentVersion) {
    return 'An earlier sync is blocking this quote. It will not be treated as this quote’s successful or retryable sync.'
  }
  if (sync.failureCode === 'line_kind_mismatch') {
    return 'Nothing was sent to Jobber. Please align the priced/text types in Jobber and this quote before retrying.'
  }
  if (sync.status === 'queued') return 'Queued for Jobber. The saved request is durable and can be started again safely.'
  if (sync.status === 'running') return 'Jobber sync is in progress. Check Jobber before attempting any further action.'
  if (sync.status === 'retryable') return 'Nothing was sent to Jobber. The saved request can be retried safely.'
  if (sync.status === 'reconciliation_required') {
    return 'The previous result is uncertain, so resending is blocked. Check Jobber using the recorded operation.'
  }
  if (sync.status === 'succeeded') return 'This quote was successfully synced through the durable Jobber operation.'
  return 'This Jobber sync was superseded and cannot be retried.'
}

function alertClass(sync: SyncState | null, failed: boolean): string {
  if (failed || !sync || !sync.isCurrentVersion || sync.status === 'reconciliation_required') {
    return 'pbc-alert pbc-alert--stack pbc-alert--warning'
  }
  if (sync.status === 'succeeded') return 'pbc-alert pbc-alert--stack pbc-alert--success'
  return 'pbc-alert pbc-alert--stack'
}

export function JobberSyncStatus(props: JobberSyncStatusProps) {
  return <JobberSyncStatusScope key={props.quoteId} {...props} />
}

function JobberSyncStatusScope({ quoteId, legacyFailed = false }: JobberSyncStatusProps) {
  const [lookup, setLookup] = useState<LookupState>({ status: 'loading', quoteId })
  const [actionFailure, setActionFailure] = useState<{ quoteId: string; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const scopeVersion = useRef(0)
  const requestVersion = useRef(0)

  const loadStatus = useCallback(async (targetQuoteId: string, scope: number) => {
    const version = requestVersion.current + 1
    requestVersion.current = version
    try {
      const result = await getJobberSyncState(targetQuoteId)
      if (requestVersion.current !== version || scopeVersion.current !== scope) return
      setLookup(result.ok
        ? { status: 'ready', quoteId: targetQuoteId, sync: result.data }
        : { status: 'failure', quoteId: targetQuoteId })
    } catch {
      if (requestVersion.current === version && scopeVersion.current === scope) {
        setLookup({ status: 'failure', quoteId: targetQuoteId })
      }
    }
  }, [])

  useEffect(() => {
    const scope = scopeVersion.current + 1
    scopeVersion.current = scope
    void loadStatus(quoteId, scope)
    return () => {
      if (scopeVersion.current === scope) scopeVersion.current += 1
      requestVersion.current += 1
    }
  }, [loadStatus, quoteId])

  function runAction(action: () => Promise<ClientActionResult>) {
    setActionFailure(null)
    const actionQuoteId = quoteId
    const actionScope = scopeVersion.current
    startTransition(async () => {
      try {
        const result = await action()
        if (scopeVersion.current !== actionScope) return
        if (!result.ok) setActionFailure({ quoteId: actionQuoteId, message: result.error })
        setLookup({ status: 'loading', quoteId: actionQuoteId })
        await loadStatus(actionQuoteId, actionScope)
      } catch {
        if (scopeVersion.current === actionScope) {
          setActionFailure({
            quoteId: actionQuoteId,
            message: 'The requested action could not be completed safely.',
          })
          setLookup({ status: 'failure', quoteId: actionQuoteId })
        }
      }
    })
  }

  const visibleLookup: LookupState = lookup.quoteId === quoteId
    ? lookup
    : { status: 'loading', quoteId }
  const actionError = actionFailure?.quoteId === quoteId ? actionFailure.message : null

  if (visibleLookup.status === 'loading') {
    return (
      <div className={alertClass(null, legacyFailed)} role="status" aria-live="polite">
        <span>{legacyFailed ? 'Checking the durable record for the previous Jobber sync failure…' : 'Loading Jobber sync status…'}</span>
      </div>
    )
  }

  if (visibleLookup.status === 'failure') {
    return (
      <div className="pbc-alert pbc-alert--stack pbc-alert--warning" role="alert">
        <span>Jobber sync status could not be checked. Retry and resend controls remain unavailable.</span>
      </div>
    )
  }

  if (!visibleLookup.sync) {
    if (!legacyFailed) return null
    return (
      <div className="pbc-alert pbc-alert--stack pbc-alert--warning" role="alert">
        <span>This quote has a previous failure but no durable sync record. Retry is blocked until the saved legacy state is inspected safely.</span>
      </div>
    )
  }

  const sync = visibleLookup.sync
  const canCheck = sync.status === 'running' || sync.status === 'reconciliation_required'

  return (
    <div className={alertClass(sync, actionError !== null)} role={actionError ? 'alert' : 'status'} aria-live="polite">
      <span>
        <b>Jobber sync</b> — {statusMessage(sync)}
        {actionError ? ` ${actionError}` : ''}
      </span>
      {sync.canRetry ? (
        <button
          type="button"
          className="pbc-btn pbc-btn--ghost pbc-btn--sm"
          disabled={isPending}
          onClick={() => runAction(() => retryJobberQuoteSync(quoteId))}
        >
          {isPending ? 'Retrying…' : 'Retry sync'}
        </button>
      ) : null}
      {canCheck ? (
        <button
          type="button"
          className="pbc-btn pbc-btn--ghost pbc-btn--sm"
          disabled={isPending}
          onClick={() => runAction(() => checkJobberQuoteSync(quoteId))}
        >
          {isPending ? 'Checking…' : 'Check Jobber'}
        </button>
      ) : null}
    </div>
  )
}
