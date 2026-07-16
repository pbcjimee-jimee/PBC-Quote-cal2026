import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import type { UserProfile } from '@/lib/user-profiles'

const headerState = vi.hoisted(() => ({
  collapsed: false,
  pathname: '/quotes/new',
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useSyncExternalStore: vi.fn((
      _subscribe: unknown,
      _getSnapshot: unknown,
      getServerSnapshot?: () => unknown
    ) => getServerSnapshot?.name === 'getServerHydratedSnapshot' ? false : headerState.collapsed),
  }
})

vi.mock('next/navigation', () => ({
  usePathname: () => headerState.pathname,
  useRouter: () => ({ prefetch: vi.fn() }),
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}))

describe('AppHeader sidebar UI', () => {
  const userProfile: UserProfile = {
    id: 'user-1',
    displayName: 'Mia Kang',
    email: 'mia@example.com',
  }

  it('renders the desktop sidebar toggle and expanded state markup', () => {
    headerState.collapsed = false
    headerState.pathname = '/quotes/new'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))

    expect(markup).toContain('aria-label="Toggle sidebar"')
    expect(markup).toContain('data-sidebar-state="expanded"')
    expect(markup).toContain('Overview')
    expect(markup).toContain('New Quote')
    expect(markup).toContain('Settings')
    expect(markup).toContain('Inventory')
    expect(markup).toContain('href="/progress-invoices"')
    expect(markup).toContain('Progress Invoices')
    expect(markup).toContain('data-intent-link="true"')
    expect(markup).toContain('pbc-usercard__identity')
  })

  it('renders the collapsed sidebar as an icon rail without text buttons', () => {
    headerState.collapsed = true
    headerState.pathname = '/quotes/new'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))

    expect(markup).toContain('data-sidebar-state="collapsed"')
    expect(markup).toContain('flex-col items-center gap-3')
    expect(markup).toContain('pbc-usercard pbc-usercard--collapsed')
    expect(markup).toContain('pbc-signout pbc-signout--collapsed')
    expect(markup).toContain('aria-label="Sign out"')
    expect(markup).toContain('<span class="sr-only">Sign out</span>')
    expect(markup).not.toContain('>Out</button>')
  })

  it('defers route active classes during server render to avoid hydration mismatch', () => {
    headerState.collapsed = false
    headerState.pathname = '/settings/inventory'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))

    expect(markup).toContain('Inventory')
    expect(markup).not.toContain('is-active')
  })
})
