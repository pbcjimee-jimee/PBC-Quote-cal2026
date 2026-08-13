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
  const latestDraftRef = useRef(draft)
  const storageKeyRef = useRef(storageKey)
  const sanitizeRef = useRef(sanitize)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPendingWriteRef = useRef(false)
  const lastObservedRef = useRef({ draft, enabled, storageKey, delayMs })

  useEffect(() => {
    latestDraftRef.current = draft
    storageKeyRef.current = storageKey
    sanitizeRef.current = sanitize
  }, [draft, sanitize, storageKey])

  const cancelPendingWrite = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    hasPendingWriteRef.current = false
  }, [])

  const flushDraft = useCallback(() => {
    if (!hasPendingWriteRef.current) return

    hasPendingWriteRef.current = false
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (typeof window === 'undefined') return

    try {
      const draftToStore = {
        ...latestDraftRef.current,
        updatedAt: new Date().toISOString(),
      }
      window.localStorage.setItem(
        storageKeyRef.current,
        JSON.stringify(sanitizeRef.current(draftToStore))
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
    const draftChanged = previous.draft !== draft || previous.storageKey !== storageKey
    const becameEnabled = enabled && !previous.enabled
    const delayChangedWhilePending = previous.delayMs !== delayMs && hasPendingWriteRef.current
    lastObservedRef.current = { draft, enabled, storageKey, delayMs }

    if (!enabled) {
      cancelPendingWrite()
      return
    }
    if (!draftChanged && !becameEnabled && !delayChangedWhilePending) return

    cancelPendingWrite()
    hasPendingWriteRef.current = true
    timerRef.current = setTimeout(flushDraft, delayMs)
  }, [cancelPendingWrite, delayMs, draft, enabled, flushDraft, storageKey])

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
