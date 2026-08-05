import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import type { UserProfile } from '@/lib/user-profiles'

const headerState = vi.hoisted(() => ({
  collapsed: false,
  hydrated: false,
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
    ) => getServerSnapshot?.name === 'getServerHydratedSnapshot'
      ? headerState.hydrated
      : headerState.collapsed),
  }
})

vi.mock('next/navigation', () => ({
  usePathname: () => headerState.pathname,
  useRouter: () => ({ prefetch: vi.fn() }),
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}))

function getDesktopNavigationHrefs(markup: string): string[] {
  const navigationStart = markup.indexOf('<nav class="pbc-nav">')
  const navigationEnd = markup.indexOf('</nav>', navigationStart)

  if (navigationStart < 0 || navigationEnd < 0) return []

  return Array.from(
    markup.slice(navigationStart, navigationEnd).matchAll(/href="([^"]+)"/g),
    ([, href]) => href
  )
}

describe('AppHeader sidebar UI', () => {
  const userProfile: UserProfile = {
    id: 'user-1',
    displayName: 'Mia Kang',
    email: 'mia@example.com',
    role: 'admin',
  }

  it('renders the desktop sidebar toggle and expanded state markup', () => {
    headerState.collapsed = false
    headerState.pathname = '/quotes/new'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))

    expect(markup).toContain('aria-label="Toggle sidebar"')
    expect(markup).toContain('data-sidebar-state="expanded"')
    expect(markup).toContain('Overview')
    expect(markup).toContain('New Quote')
    expect(markup).toContain('Job Expenses')
    expect(markup).toContain('Settings')
    expect(markup).toContain('Inventory')
    expect(markup).not.toContain('href="/progress-invoices"')
    expect(markup).not.toContain('Progress Invoices')
    expect(markup).toContain('data-intent-link="true"')
    expect(markup).toContain('pbc-usercard__identity')
    expect(getDesktopNavigationHrefs(markup)).toEqual([
      '/quotes',
      '/quotes/new',
      '/jobs',
      '/settings',
      '/inventory',
    ])
  })

  it('shows only Job Expenses and Inventory to supervisors', () => {
    const markup = renderToStaticMarkup(createElement(AppHeader, {
      userProfile: { ...userProfile, role: 'supervisor' },
    }))

    expect(markup).toContain('Supervisor tools')
    expect(markup).toContain('href="/jobs"')
    expect(markup).toContain('Job Expenses')
    expect(markup).not.toContain('>Jobs<')
    expect(markup).toContain('href="/inventory"')
    expect(getDesktopNavigationHrefs(markup)).toEqual(['/jobs', '/inventory'])
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
    headerState.pathname = '/inventory'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))

    expect(markup).toContain('Inventory')
    expect(markup).not.toContain('is-active')
  })

  it('renders an accessible mobile sign-out action', () => {
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))
    const mobileHeader = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))

    expect(mobileHeader).toContain('pbc-mobile-header__brandrow')
    expect(mobileHeader).toContain('pbc-mobile-signout')
    expect(mobileHeader).toContain('aria-label="Sign out"')
    expect(mobileHeader).toContain('<form')
  })

  it('marks Settings active for descendant routes after hydration', () => {
    headerState.hydrated = true
    headerState.pathname = '/settings/users'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))
    const mobileHeader = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))

    expect(mobileHeader).toMatch(/<a(?=[^>]*href="\/settings")(?=[^>]*class="[^"]*is-active)[^>]*>/)
    headerState.hydrated = false
  })
})
