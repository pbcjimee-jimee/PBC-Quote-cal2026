import { act, createElement, forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react'
import type { Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { installTestDom } from '@/tests/helpers/test-dom'
import { IntentLink } from '@/components/navigation/intent-link'

const navigationState = vi.hoisted(() => ({
  pending: false,
  prefetch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: navigationState.prefetch }),
}))

vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & {
    children?: ReactNode
    prefetch?: boolean
  }>(function MockLink({ children, prefetch, ...props }, ref) {
    return createElement('a', {
      ...props,
      ref,
      'data-next-prefetch': String(prefetch),
    }, children)
  }),
  useLinkStatus: () => ({ pending: navigationState.pending }),
}))

describe('IntentLink', () => {
  it('disables viewport prefetch and prefetches a route only once after repeated user intent', async () => {
    navigationState.prefetch.mockReset()
    navigationState.pending = false
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(IntentLink, { href: '/settings' }, 'Settings'))
      })

      const link = container.querySelectorAll('a')[0]
      expect(link.getAttribute('data-next-prefetch')).toBe('false')
      expect(link.getAttribute('data-intent-link')).toBe('true')

      await act(async () => {
        link.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
        link.dispatchEvent(new Event('focusin', { bubbles: true }))
        link.dispatchEvent(new Event('touchstart', { bubbles: true }))
      })

      expect(navigationState.prefetch).toHaveBeenCalledTimes(1)
      expect(navigationState.prefetch).toHaveBeenCalledWith('/settings')
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })

  it('shows a fixed route progress status while navigation is pending', async () => {
    navigationState.pending = true
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(IntentLink, { href: '/quotes/new' }, 'New Quote'))
      })

      expect(container.textContent).toContain('Loading page')
      expect(Array.from(container.querySelectorAll('span')).some((element) => (
        element.getAttribute('data-route-progress') === 'true'
      ))).toBe(true)
    } finally {
      navigationState.pending = false
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })
})
