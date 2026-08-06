import {
  act,
  createElement,
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'
import type { Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import type { UserProfile } from '@/lib/user-profiles'
import { installTestDom } from '@/tests/helpers/test-dom'

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/users',
  useRouter: () => ({ prefetch: vi.fn() }),
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
  useLinkStatus: () => ({ pending: false }),
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}))

describe('AppHeader client hydration', () => {
  it('marks the Settings mobile link active and current on a descendant route', async () => {
    const userProfile: UserProfile = {
      id: 'user-1',
      displayName: 'Mia Kang',
      email: 'mia@example.com',
      role: 'admin',
    }
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(AppHeader, { userProfile }))
      })

      const currentSettingsLink = Array.from(container.querySelectorAll('a')).find((link) => (
        link.getAttribute('href') === '/settings'
        && link.getAttribute('aria-current') === 'page'
      ))

      expect(currentSettingsLink).toBeDefined()
      expect(currentSettingsLink?.getAttribute('class')).toContain('is-active')
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })
})
