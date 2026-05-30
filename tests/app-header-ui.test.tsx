import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import type { UserProfile } from '@/lib/user-profiles'

vi.mock('next/navigation', () => ({
  usePathname: () => '/quotes/new',
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
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))

    expect(markup).toContain('aria-label="Toggle sidebar"')
    expect(markup).toContain('data-sidebar-state="expanded"')
    expect(markup).toContain('Overview')
    expect(markup).toContain('New Quote')
    expect(markup).toContain('Settings')
  })
})
