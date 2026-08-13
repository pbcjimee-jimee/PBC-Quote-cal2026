'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  readQuoteFormDraftFromStorage,
  type QuoteFormDraft,
} from './quote-draft'

interface UseQuoteDraftPersistenceInput {
  storageKey: string
  draft: QuoteFormDraft
  enabled: boolean
  delayMs: number
  sanitize: (draft: QuoteFormDraft) => unknown
}

interface PendingDraftWrite {
  storageKey: string
  draft: QuoteFormDraft
  sanitize: (draft: QuoteFormDraft) => unknown
}

export interface QuoteDraftPersistenceControls {
  flushDraft(): void
  clearDraft(): void
  readDraft(): QuoteFormDraft | null
}

export function useQuoteDraftPersistence({
  storageKey,
  draft,
  enabled,
  delayMs,
  sanitize,
}: UseQuoteDraftPersistenceInput): QuoteDraftPersistenceControls {
  const storageKeyRef = useRef(storageKey)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWriteRef = useRef<PendingDraftWrite | null>(null)
  const lastObservedRef = useRef({ draft, enabled, storageKey, delayMs })

  useEffect(() => {
    storageKeyRef.current = storageKey
  }, [storageKey])

  const cancelPendingWrite = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingWriteRef.current = null
  }, [])

  const flushDraft = useCallback(() => {
    const pendingWrite = pendingWriteRef.current
    if (pendingWrite === null) return

    pendingWriteRef.current = null
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (typeof window === 'undefined') return

    try {
      const draftToStore = {
        ...pendingWrite.draft,
        updatedAt: new Date().toISOString(),
      }
      window.localStorage.setItem(
        pendingWrite.storageKey,
        JSON.stringify(pendingWrite.sanitize(draftToStore))
      )
    } catch {
      return
    }
  }, [])

  const clearDraft = useCallback(() => {
    cancelPendingWrite()
    if (typeof window === 'undefined') return

    try {
      window.localStorage.removeItem(storageKeyRef.current)
    } catch {
      return
    }
  }, [cancelPendingWrite])

  const readDraft = useCallback((): QuoteFormDraft | null => {
    if (typeof window === 'undefined') return null

    try {
      return readQuoteFormDraftFromStorage(window.localStorage, storageKeyRef.current)
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const previous = lastObservedRef.current
    const storageKeyChanged = previous.storageKey !== storageKey
    const draftChanged = previous.draft !== draft || storageKeyChanged
    const becameEnabled = enabled && !previous.enabled
    const delayChangedWhilePending = previous.delayMs !== delayMs && pendingWriteRef.current !== null
    lastObservedRef.current = { draft, enabled, storageKey, delayMs }

    if (storageKeyChanged) flushDraft()
    if (!enabled) {
      cancelPendingWrite()
      return
    }
    if (!draftChanged && !becameEnabled && !delayChangedWhilePending) return

    cancelPendingWrite()
    pendingWriteRef.current = { storageKey, draft, sanitize }
    timerRef.current = setTimeout(flushDraft, delayMs)
  }, [cancelPendingWrite, delayMs, draft, enabled, flushDraft, sanitize, storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePageHide = () => flushDraft()
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      flushDraft()
    }
  }, [flushDraft])

  return { flushDraft, clearDraft, readDraft }
}
