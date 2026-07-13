import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'
import type { UserProfile } from '@/lib/user-profiles'

const headerState = vi.hoisted(() => ({
  pathname: '/quotes',
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useSyncExternalStore: vi.fn((
      _subscribe: unknown,
      _getSnapshot: unknown,
      getServerSnapshot?: () => unknown
    ) => getServerSnapshot?.name === 'getServerHydratedSnapshot'),
  }
})

vi.mock('next/navigation', () => ({
  usePathname: () => headerState.pathname,
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}))

describe('PWA mobile UX', () => {
  const userProfile: UserProfile = {
    id: 'user-1',
    displayName: 'Mia Kang',
    email: 'mia@example.com',
  }

  beforeEach(() => {
    headerState.pathname = '/quotes'
  })

  it('renders an explicit, active Overview entry in the mobile navigation', () => {
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))
    const mobileHeader = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))

    expect(mobileHeader).toContain('aria-label="Mobile navigation"')
    expect(mobileHeader).toContain('href="/quotes"')
    expect(mobileHeader).toContain('Overview')
    expect(mobileHeader).toMatch(/<a(?=[^>]*href="\/quotes")(?=[^>]*class="[^"]*is-active)[^>]*>/)
  })

  it('marks New Quote active without also marking Overview active', () => {
    headerState.pathname = '/quotes/new'
    const markup = renderToStaticMarkup(createElement(AppHeader, { userProfile }))
    const mobileHeader = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))

    expect(mobileHeader).toMatch(/<a(?=[^>]*href="\/quotes\/new")(?=[^>]*class="[^"]*is-active)[^>]*>/)
    expect(mobileHeader).not.toMatch(/<a(?=[^>]*href="\/quotes")(?=[^>]*class="[^"]*is-active)[^>]*>/)
  })

  it('defines the binding mobile input, safe-area, touch target, and lg breakpoint rules', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')

    expect(css).toContain('@media (max-width: 1023.98px)')
    for (const selector of [
      '.pbc-input',
      '.pbc-textarea',
      '.pbc-tableinput',
      '.pbc-search__input',
      '.pbc-statuscontrol',
      '.pbc-rate__money input',
      '.pbc-ptable__money input',
      '.pbc-monthselect select',
    ]) {
      expect(css).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[^}]*font-size:\\s*16px`))
    }

    expect(css).toMatch(/\.pbc-auth\s*{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/)
    expect(css).toContain('env(safe-area-inset-left)')
    expect(css).toContain('env(safe-area-inset-right)')
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toMatch(/\.pbc-mobile-header\s*{[^}]*padding-top:\s*env\(safe-area-inset-top\)/)
    expect(css).toMatch(/\.pbc-iconbtn[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/)
    expect(css).toMatch(/\.pbc-btn--sm[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/)
  })

  it('keeps component-specific 1080px layouts while moving shell transitions to lg', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const legacyResponsive = css.slice(
      css.indexOf('@media (max-width: 1080px)'),
      css.indexOf('@media (max-width: 1023.98px)')
    )
    const lgStart = css.indexOf('@media (max-width: 1023.98px)')
    const lgResponsive = css.slice(lgStart, css.indexOf('@media (max-width: 720px)', lgStart))

    expect(legacyResponsive).toContain('.pbc-grid')
    expect(legacyResponsive).not.toContain('.pbc-appshell')
    expect(legacyResponsive).not.toContain('.pbc-mobile-totalbar')
    expect(lgResponsive).toContain('.pbc-appshell')
    expect(lgResponsive).toContain('.pbc-side')
    expect(lgResponsive).toContain('.pbc-mobile-totalbar')
  })

  it('documents the mobile rules in the design-system source of truth', () => {
    const designSystem = readFileSync('docs/UI-DESIGN-SYSTEM.md', 'utf8')

    expect(designSystem).toContain('16px')
    expect(designSystem).toContain('safe-area')
    expect(designSystem).toContain('44px')
    expect(designSystem).toContain('1023.98px')
  })
})
