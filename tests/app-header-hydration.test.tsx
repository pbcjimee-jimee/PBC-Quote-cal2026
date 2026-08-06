import {
  act,
  createElement,
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import type { UserProfile } from '@/lib/user-profiles'
import { cloneTestElement, installTestDom } from '@/tests/helpers/test-dom'

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
    const { cleanup, document: testDocument } = installTestDom()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let seedRoot: Root | null = null
    let root: Root | null = null

    try {
      const element = createElement(AppHeader, { userProfile })
      const serverMarkup = renderToStaticMarkup(element)
      const { createRoot, hydrateRoot } = await import('react-dom/client')
      const seedContainer = testDocument.createElement('div')
      seedRoot = createRoot(seedContainer as unknown as Element)

      await act(async () => {
        seedRoot!.render(element)
      })

      const container = cloneTestElement(seedContainer)
      const preHydrationSettingsLinks = Array.from(container.querySelectorAll('a')).filter((link) => (
        link.getAttribute('href') === '/settings'
      ))
      for (const link of preHydrationSettingsLinks) {
        link.setAttribute(
          'class',
          link.getAttribute('class')?.startsWith('pbc-nav__item')
            ? 'pbc-nav__item  '
            : 'pbc-mobile-nav__item '
        )
        link.removeAttribute('aria-current')
      }

      expect(serverMarkup).not.toContain('is-active')
      expect(serverMarkup).not.toContain('aria-current="page"')
      expect(preHydrationSettingsLinks).toHaveLength(2)
      expect(preHydrationSettingsLinks.every((link) => (
        !link.getAttribute('class')?.includes('is-active')
        && link.getAttribute('aria-current') === null
      ))).toBe(true)
      expect(container.textContent).toBe(seedContainer.textContent)

      await act(async () => seedRoot?.unmount())
      seedRoot = null

      const recoverableErrors: unknown[] = []
      await act(async () => {
        root = hydrateRoot(container as unknown as Element, element, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        })
      })

      const currentSettingsLink = Array.from(container.querySelectorAll('a')).find((link) => (
        link.getAttribute('href') === '/settings'
        && link.getAttribute('aria-current') === 'page'
      ))

      expect(currentSettingsLink).toBeDefined()
      expect(currentSettingsLink?.getAttribute('class')).toContain('is-active')
      expect(recoverableErrors).toEqual([])
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      try {
        if (seedRoot) await act(async () => seedRoot?.unmount())
        if (root) await act(async () => root?.unmount())
      } finally {
        consoleError.mockRestore()
        cleanup()
      }
    }
  })
})
