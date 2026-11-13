'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  checkJobberQuoteSync,
  getJobberSyncState,
  type SyncState,
} from '@/lib/actions/jobber-sync'
import { retryJobberQuoteSync } from '@/lib/actions/quotes'
import { JobberSyncRecovery } from './jobber-sync-recovery'

export interface JobberSyncStatusProps {
  quoteId: string
  legacyFailed?: boolean
  jobberEnabled?: boolean
  jobberNotice?: string
  saveNotice?: string
}

type LookupState =
  | { status: 'loading'; quoteId: string }
  | { status: 'failure'; quoteId: string }
  | { status: 'ready'; quoteId: string; sync: SyncState | null }

type ClientActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

function statusMessage(sync: SyncState): string {
  if (sync.failureCode === 'quote_changed') {
    return 'This quote was edited after the previous sync started. The earlier sync is blocking this quote because it cannot be applied to the newer saved rows. Review sync recovery to keep your edits and repair the row links before syncing again.'
  }
  if (!sync.isCurrentVersion) {
    return 'An earlier sync is blocking this quote. It will not be treated as this quote’s successful or retryable sync.'
  }
  if (sync.detailMessage) return sync.detailMessage
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

export function JobberSyncStatus({
  jobberEnabled = true,
  jobberNotice = 'Jobber is unavailable.',
  ...props
}: JobberSyncStatusProps) {
  if (!jobberEnabled) {
    return (
      <div className="pbc-alert pbc-alert--stack pbc-alert--warning" role="status">
        <span>{jobberNotice}</span>
      </div>
    )
  }

  return <JobberSyncStatusScope key={props.quoteId} {...props} />
}

function JobberSyncStatusScope({ quoteId, legacyFailed = false, saveNotice }: JobberSyncStatusProps) {
  const { refresh } = useRouter()
  const [lookup, setLookup] = useState<LookupState>({ status: 'loading', quoteId })
  const [actionFailure, setActionFailure] = useState<{ quoteId: string; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const scopeVersion = useRef(0)
  const requestVersion = useRef(0)
  const lastSyncStatus = useRef<SyncState['status'] | undefined>(undefined)
  const pollCount = useRef(0)
  const [pollExhausted, setPollExhausted] = useState(false)

  const loadStatus = useCallback(async (targetQuoteId: string, scope: number, polling = false) => {
    const version = requestVersion.current + 1
    requestVersion.current = version
    try {
      const result = await getJobberSyncState(targetQuoteId)
      if (requestVersion.current !== version || scopeVersion.current !== scope) return
      if (result.ok) {
        const wasActive = lastSyncStatus.current === 'queued' || lastSyncStatus.current === 'running'
        lastSyncStatus.current = result.data?.status
        setLookup({ status: 'ready', quoteId: targetQuoteId, sync: result.data })
        if (wasActive && result.data?.status === 'succeeded') refresh()
      } else if (!polling) {
        setLookup({ status: 'failure', quoteId: targetQuoteId })
      }
    } catch {
      if (!polling && requestVersion.current === version && scopeVersion.current === scope) {
        setLookup({ status: 'failure', quoteId: targetQuoteId })
      }
    }
  }, [refresh])

  useEffect(() => {
    const scope = scopeVersion.current + 1
    scopeVersion.current = scope
    void loadStatus(quoteId, scope)
    return () => {
      if (scopeVersion.current === scope) scopeVersion.current += 1
      requestVersion.current += 1
    }
  }, [loadStatus, quoteId])

  const syncStatus = lookup.status === 'ready' ? lookup.sync?.status : undefined
  const isSyncActive = syncStatus === 'queued' || syncStatus === 'running'

  useEffect(() => {
    if (!isSyncActive || isPending || reviewOpen || pollExhausted) return
    const scope = scopeVersion.current
    let inFlight = false
    const timer = setInterval(async () => {
      if (document.visibilityState === 'hidden' || inFlight || pollCount.current >= 40) return
      inFlight = true
      pollCount.current += 1
      await loadStatus(quoteId, scope, true)
      inFlight = false
      if (scopeVersion.current === scope && pollCount.current >= 40) {
        clearInterval(timer)
        setPollExhausted(true)
      }
    }, 3000)
    return () => {
      clearInterval(timer)
    }
  }, [isSyncActive, isPending, reviewOpen, pollExhausted, loadStatus, quoteId])

  function runAction(action: () => Promise<ClientActionResult>) {
    setActionFailure(null)
    requestVersion.current += 1
    pollCount.current = 0
    setPollExhausted(false)
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

  function renderStatus() {
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
          {isSyncActive && pollExhausted ? ' Still waiting for Jobber. Use Retry sync or Check Jobber.' : ''}
          {actionError ? ` ${actionError}` : ''}
        </span>
        {sync.canRetry ? (
          <button
            type="button"
            className="pbc-btn pbc-btn--ghost pbc-btn--sm"
            disabled={isPending || reviewOpen}
            onClick={() => runAction(() => retryJobberQuoteSync(quoteId))}
          >
            {isPending ? 'Retrying…' : 'Retry sync'}
          </button>
        ) : null}
        {canCheck ? (
          <button
            type="button"
            className="pbc-btn pbc-btn--ghost pbc-btn--sm"
            disabled={isPending || reviewOpen}
            onClick={() => runAction(() => checkJobberQuoteSync(quoteId))}
          >
            {isPending ? 'Checking…' : 'Check Jobber'}
          </button>
        ) : null}
      </div>
    )
  }

  return <>
    {saveNotice ? <div className="pbc-alert pbc-alert--warning" role="alert">{saveNotice}</div> : null}
    {!recovered ? renderStatus() : null}
    <JobberSyncRecovery
      quoteId={quoteId}
      available={visibleLookup.status === 'ready' && visibleLookup.sync?.status === 'reconciliation_required'}
      disabled={isPending}
      onReviewChange={setReviewOpen}
      onRecovered={() => setRecovered(true)}
      onSynced={() => {
        setRecovered(false)
        setLookup({ status: 'loading', quoteId })
        void loadStatus(quoteId, scopeVersion.current)
      }}
    />
  </>
}
