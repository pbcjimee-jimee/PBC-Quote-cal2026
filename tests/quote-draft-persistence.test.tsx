import { act, createElement, StrictMode, useEffect } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyQuoteFormDraft,
  sanitizeQuoteFormDraftForStorage,
  type QuoteFormDraft,
} from '@/components/quote-form/quote-draft'
import {
  useQuoteDraftPersistence,
} from '@/components/quote-form/use-quote-draft-persistence'
import { installTestDom } from '@/tests/helpers/test-dom'

class DraftStorage {
  readonly entries = new Map<string, string>()
  readonly setCalls: Array<[string, string]> = []
  readonly removeCalls: string[] = []

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setCalls.push([key, value])
    this.entries.set(key, value)
  }

  removeItem(key: string): void {
    this.removeCalls.push(key)
    this.entries.delete(key)
  }
}

function createDraft(customerName: string): QuoteFormDraft {
  return {
    ...createEmptyQuoteFormDraft(),
    customerName,
  }
}

function compactSanitize(value: QuoteFormDraft): unknown {
  return {
    customerName: value.customerName,
    updatedAt: value.updatedAt,
  }
}

function PersistenceHarness({
  draft,
  enabled,
  storageKey = 'pbc-quote-draft:new',
  sanitize = compactSanitize,
  clearRequested = false,
  readRequested = false,
  onRead,
}: {
  draft: QuoteFormDraft
  enabled: boolean
  storageKey?: string
  sanitize?: (draft: QuoteFormDraft) => unknown
  clearRequested?: boolean
  readRequested?: boolean
  onRead?: (draft: QuoteFormDraft | null) => void
}) {
  const { clearDraft, readDraft } = useQuoteDraftPersistence({
    storageKey,
    draft,
    enabled,
    delayMs: 300,
    sanitize,
  })
  useEffect(() => {
    if (clearRequested) clearDraft()
  }, [clearDraft, clearRequested])
  useEffect(() => {
    if (readRequested) onRead?.(readDraft())
  }, [onRead, readDraft, readRequested])
  return null
}

function installStorage(storage: DraftStorage): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  return () => {
    if (descriptor) {
      Object.defineProperty(window, 'localStorage', descriptor)
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useQuoteDraftPersistence', () => {
  it('writes only the latest draft after a 300ms trailing pause', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'))
    const { cleanup } = installTestDom()
    const storage = new DraftStorage()
    const restoreStorage = installStorage(storage)
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      root = createRoot(document.createElement('div'))

      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft(''), enabled: false }))
      })
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft('First'), enabled: true }))
      })
      await act(async () => vi.advanceTimersByTime(100))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft('Second'), enabled: true }))
      })
      await act(async () => vi.advanceTimersByTime(100))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft('Final'), enabled: true }))
      })

      await act(async () => vi.advanceTimersByTime(299))
      expect(storage.setCalls).toEqual([])

      await act(async () => vi.advanceTimersByTime(1))
      expect(storage.setCalls).toEqual([[
        'pbc-quote-draft:new',
        '{"customerName":"Final","updatedAt":"2026-08-13T00:00:00.500Z"}',
      ]])
    } finally {
      if (root) await act(async () => root?.unmount())
      restoreStorage()
      cleanup()
    }
  })

  it('flushes one pending write immediately on pagehide', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T01:00:00.000Z'))
    const { cleanup } = installTestDom()
    const storage = new DraftStorage()
    const restoreStorage = installStorage(storage)
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      root = createRoot(document.createElement('div'))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft(''), enabled: false }))
      })
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft('Page hide'), enabled: true }))
      })

      window.dispatchEvent(new Event('pagehide'))
      expect(storage.setCalls).toEqual([[
        'pbc-quote-draft:new',
        '{"customerName":"Page hide","updatedAt":"2026-08-13T01:00:00.000Z"}',
      ]])

      await act(async () => vi.advanceTimersByTime(300))
      expect(storage.setCalls).toHaveLength(1)
    } finally {
      if (root) await act(async () => root?.unmount())
      restoreStorage()
      cleanup()
    }
  })

  it('cancels a pending write before clearing storage', async () => {
    vi.useFakeTimers()
    const { cleanup } = installTestDom()
    const storage = new DraftStorage()
    storage.entries.set('pbc-quote-draft:new', 'older draft')
    const restoreStorage = installStorage(storage)
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      root = createRoot(document.createElement('div'))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft(''), enabled: false }))
      })
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft('Do not restore'), enabled: true }))
      })
      const pendingDraft = createDraft('Do not restore')
      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: pendingDraft,
          enabled: true,
          clearRequested: true,
        }))
      })

      expect(storage.setCalls).toEqual([])
      expect(storage.removeCalls).toEqual(['pbc-quote-draft:new'])
      expect(storage.entries.has('pbc-quote-draft:new')).toBe(false)

      await act(async () => vi.advanceTimersByTime(300))
      expect(storage.setCalls).toEqual([])
    } finally {
      if (root) await act(async () => root?.unmount())
      restoreStorage()
      cleanup()
    }
  })

  it('flushes one pending write on unmount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T02:00:00.000Z'))
    const { cleanup } = installTestDom()
    const storage = new DraftStorage()
    const restoreStorage = installStorage(storage)
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      root = createRoot(document.createElement('div'))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft(''), enabled: false }))
      })
      await act(async () => {
        root!.render(createElement(PersistenceHarness, { draft: createDraft('Unmounted'), enabled: true }))
      })
      await act(async () => root?.unmount())
      root = null

      expect(storage.setCalls).toEqual([[
        'pbc-quote-draft:new',
        '{"customerName":"Unmounted","updatedAt":"2026-08-13T02:00:00.000Z"}',
      ]])
      await act(async () => vi.advanceTimersByTime(300))
      expect(storage.setCalls).toHaveLength(1)
    } finally {
      if (root) await act(async () => root?.unmount())
      restoreStorage()
      cleanup()
    }
  })

  it('does not write an unchanged initial draft during StrictMode cleanup', async () => {
    vi.useFakeTimers()
    const { cleanup } = installTestDom()
    const storage = new DraftStorage()
    const restoreStorage = installStorage(storage)
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      root = createRoot(document.createElement('div'))
      await act(async () => {
        root!.render(createElement(
          StrictMode,
          null,
          createElement(PersistenceHarness, { draft: createDraft('Initial'), enabled: true })
        ))
      })
      await act(async () => root?.unmount())
      root = null

      expect(storage.setCalls).toEqual([])
    } finally {
      if (root) await act(async () => root?.unmount())
      restoreStorage()
      cleanup()
    }
  })

  it('flushes the old key snapshot before debouncing the new key and keeps controls on the current key', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T03:00:00.000Z'))
    const { cleanup } = installTestDom()
    const storage = new DraftStorage()
    const restoreStorage = installStorage(storage)
    const keyA = 'pbc-quote-draft:quote-a'
    const keyB = 'pbc-quote-draft:quote-b'
    const draftA = createDraft('Customer A latest')
    const draftB = createDraft('Customer B')
    const readState: { value: QuoteFormDraft | null } = { value: null }
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      root = createRoot(document.createElement('div'))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: createDraft(''),
          enabled: false,
          storageKey: keyA,
          sanitize: sanitizeQuoteFormDraftForStorage,
        }))
      })
      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: draftA,
          enabled: true,
          storageKey: keyA,
          sanitize: sanitizeQuoteFormDraftForStorage,
        }))
      })
      await act(async () => vi.advanceTimersByTime(100))
      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: draftB,
          enabled: true,
          storageKey: keyB,
          sanitize: sanitizeQuoteFormDraftForStorage,
        }))
      })

      expect(storage.setCalls).toHaveLength(1)
      expect(storage.setCalls[0]?.[0]).toBe(keyA)
      expect(JSON.parse(storage.setCalls[0]?.[1] ?? '{}')).toMatchObject({
        customerName: 'Customer A latest',
        updatedAt: '2026-08-13T03:00:00.100Z',
      })
      expect(storage.entries.has(keyB)).toBe(false)

      await act(async () => vi.advanceTimersByTime(299))
      expect(storage.setCalls).toHaveLength(1)
      await act(async () => vi.advanceTimersByTime(1))
      expect(storage.setCalls).toHaveLength(2)
      expect(storage.setCalls[1]?.[0]).toBe(keyB)
      expect(JSON.parse(storage.setCalls[1]?.[1] ?? '{}')).toMatchObject({
        customerName: 'Customer B',
        updatedAt: '2026-08-13T03:00:00.400Z',
      })

      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: draftB,
          enabled: true,
          storageKey: keyB,
          sanitize: sanitizeQuoteFormDraftForStorage,
          readRequested: true,
          onRead: (value) => {
            readState.value = value
          },
        }))
      })
      expect(readState.value?.customerName).toBe('Customer B')

      const pendingDraftB = createDraft('Customer B pending clear')
      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: pendingDraftB,
          enabled: true,
          storageKey: keyB,
          sanitize: sanitizeQuoteFormDraftForStorage,
        }))
      })
      await act(async () => {
        root!.render(createElement(PersistenceHarness, {
          draft: pendingDraftB,
          enabled: true,
          storageKey: keyB,
          sanitize: sanitizeQuoteFormDraftForStorage,
          clearRequested: true,
        }))
      })
      expect(storage.removeCalls).toEqual([keyB])
      expect(storage.entries.get(keyA)).toBe(storage.setCalls[0]?.[1])
      expect(storage.entries.has(keyB)).toBe(false)

      await act(async () => vi.advanceTimersByTime(300))
      await act(async () => root?.unmount())
      root = null
      expect(storage.setCalls).toHaveLength(2)
      expect(storage.entries.has(keyB)).toBe(false)
    } finally {
      if (root) await act(async () => root?.unmount())
      restoreStorage()
      cleanup()
    }
  })
})
