import { act, createElement, type ReactNode } from 'react'
import type { Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import { signOut } from '@/lib/actions/auth'
import { createEmptyQuoteFormDraft, sanitizeQuoteFormDraftForStorage } from '@/components/quote-form/quote-draft'
import { useQuoteDraftPersistence } from '@/components/quote-form/use-quote-draft-persistence'
import { installTestDom, type TestElement } from './helpers/test-dom'

vi.mock('next/navigation', () => ({ usePathname: () => '/quotes/new' }))
vi.mock('@/components/navigation/intent-link', () => ({
  IntentLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/lib/actions/auth', () => ({ signOut: vi.fn() }))

const userProfile = { id: 'user-a', displayName: 'Admin', email: 'admin@example.com', role: 'admin' as const }

class DraftStorage {
  private entries = new Map<string, string>()
  get length() { return this.entries.size }
  key(index: number) { return [...this.entries.keys()][index] ?? null }
  getItem(key: string) { return this.entries.get(key) ?? null }
  setItem(key: string, value: string) { this.entries.set(key, value) }
  removeItem(key: string) { this.entries.delete(key) }
}

function PendingDraft({ changed }: { changed: boolean }) {
  useQuoteDraftPersistence({
    storageKey: 'pbc-quote-draft:user-a:new', ownerId: 'user-a',
    draft: { ...createEmptyQuoteFormDraft(), customerName: changed ? 'Pending customer' : '' },
    enabled: changed, delayMs: 300, sanitize: sanitizeQuoteFormDraftForStorage,
  })
  return null
}

function getFormProps(form: TestElement) {
  const propsKey = Object.keys(form).find((key) => key.startsWith('__reactProps$'))
  if (!propsKey) throw new Error('Form is not mounted')
  return (form as unknown as Record<string, unknown>)[propsKey] as {
    onSubmit?: (event: { preventDefault: () => void }) => void
    action: unknown
  }
}

describe('AppHeader sign-out draft cleanup', () => {
  it.each([0, 1])('clears all PBC drafts before form %s submits and prevents pending writes from recreating them', async (formIndex) => {
    vi.useFakeTimers()
    const dom = installTestDom()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: new DraftStorage() })
    let root: Root | undefined
    try {
      const { createRoot } = await import('react-dom/client')
      const container = dom.document.createElement('div')
      root = createRoot(container as unknown as Element)
      const render = (changed: boolean) => createElement('div', null,
        createElement(AppHeader, { userProfile }), createElement(PendingDraft, { changed }))
      await act(async () => root!.render(render(false)))
      await act(async () => root!.render(render(true)))
      const storage = window.localStorage
      for (const key of ['pbc-quote-draft:new', 'pbc-quote-draft:user-a:new', 'pbc-quote-draft:user-b:saved']) {
        storage.setItem(key, 'private draft')
      }
      storage.setItem('pbc-sidebar-collapsed', 'true')
      storage.setItem('unrelated-app', 'keep')
      const forms = container.querySelectorAll('form')
      expect(forms).toHaveLength(2)
      const props = getFormProps(forms[formIndex])
      const preventDefault = vi.fn()
      expect(props.action).toBe(signOut)
      expect(props.onSubmit).toBeTypeOf('function')
      await act(async () => props.onSubmit!({ preventDefault }))
      expect(preventDefault).not.toHaveBeenCalled()
      expect(storage.length).toBe(2)
      expect(storage.getItem('pbc-sidebar-collapsed')).toBe('true')
      expect(storage.getItem('unrelated-app')).toBe('keep')

      await act(async () => root!.render(render(true)))
      await act(async () => vi.advanceTimersByTime(500))
      window.dispatchEvent(new Event('pagehide'))
      await act(async () => root!.unmount())
      root = undefined
      expect(storage.length).toBe(2)
    } finally {
      if (root) await act(async () => root!.unmount())
      dom.cleanup()
      vi.useRealTimers()
    }
  })

  it('keeps sign-out submission available when localStorage is blocked', async () => {
    const dom = installTestDom()
    let root: Root | undefined
    const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    try {
      const { createRoot } = await import('react-dom/client')
      const container = dom.document.createElement('div')
      root = createRoot(container as unknown as Element)
      await act(async () => root!.render(createElement(AppHeader, { userProfile })))
      Object.defineProperty(window, 'localStorage', {
        configurable: true, get: () => { throw new Error('Storage blocked') },
      })
      const preventDefault = vi.fn()
      expect(() => getFormProps(container.querySelectorAll('form')[0]).onSubmit!({ preventDefault })).not.toThrow()
      expect(preventDefault).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'localStorage', storageDescriptor)
      if (root) await act(async () => root!.unmount())
      dom.cleanup()
    }
  })
})
