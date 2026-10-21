'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  QUOTE_DRAFT_SIGN_OUT_EVENT,
  readQuoteFormDraftFromStorage,
  type QuoteFormDraft,
} from './quote-draft'

interface UseQuoteDraftPersistenceInput {
  storageKey: string
  ownerId?: string
  draft: QuoteFormDraft
  enabled: boolean
  delayMs: number
  sanitize: (draft: QuoteFormDraft) => object
}

interface PendingDraftWrite {
  storageKey: string
  ownerId: string
  draft: QuoteFormDraft
  sanitize: (draft: QuoteFormDraft) => object
}

export interface QuoteDraftPersistenceControls {
  flushDraft(): void
  clearDraft(): void
  readDraft(): QuoteFormDraft | null
}

export function useQuoteDraftPersistence({
  storageKey,
  ownerId,
  draft,
  enabled,
  delayMs,
  sanitize,
}: UseQuoteDraftPersistenceInput): QuoteDraftPersistenceControls {
  const storageKeyRef = useRef(storageKey)
  const ownerIdRef = useRef(ownerId)
  const signedOutRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWriteRef = useRef<PendingDraftWrite | null>(null)
  const lastObservedRef = useRef({ draft, enabled, storageKey, delayMs })

  useEffect(() => {
    storageKeyRef.current = storageKey
    ownerIdRef.current = ownerId
  }, [ownerId, storageKey])

  const cancelPendingWrite = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingWriteRef.current = null
  }, [])

  const flushDraft = useCallback(() => {
    const pendingWrite = pendingWriteRef.current
    if (pendingWrite === null || signedOutRef.current) return

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
        JSON.stringify({ ...pendingWrite.sanitize(draftToStore), ownerId: pendingWrite.ownerId })
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
      if (!ownerIdRef.current || signedOutRef.current) return null
      return readQuoteFormDraftFromStorage(window.localStorage, storageKeyRef.current, ownerIdRef.current)
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
    if (!enabled || !ownerId || signedOutRef.current) {
      cancelPendingWrite()
      return
    }
    if (!draftChanged && !becameEnabled && !delayChangedWhilePending) return

    cancelPendingWrite()
    pendingWriteRef.current = { storageKey, ownerId, draft, sanitize }
    timerRef.current = setTimeout(flushDraft, delayMs)
  }, [cancelPendingWrite, delayMs, draft, enabled, flushDraft, ownerId, sanitize, storageKey])

  useEffect(() => {
    const handleSignOut = () => {
      signedOutRef.current = true
      cancelPendingWrite()
    }
    window.addEventListener(QUOTE_DRAFT_SIGN_OUT_EVENT, handleSignOut)
    return () => window.removeEventListener(QUOTE_DRAFT_SIGN_OUT_EVENT, handleSignOut)
  }, [cancelPendingWrite])

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
