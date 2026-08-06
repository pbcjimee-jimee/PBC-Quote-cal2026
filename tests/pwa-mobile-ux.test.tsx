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
  useRouter: () => ({ prefetch: vi.fn() }),
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}))

function getMediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media (${query})`)
  if (start < 0) return ''

  const openingBrace = css.indexOf('{', start)
  let depth = 0
  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') depth -= 1
    if (depth === 0) return css.slice(openingBrace + 1, index)
  }

  return ''
}

describe('PWA mobile UX', () => {
  const userProfile: UserProfile = {
    id: 'user-1',
    displayName: 'Mia Kang',
    email: 'mia@example.com',
    role: 'admin',
  }

  beforeEach(() => {
    headerState.pathname = '/quotes'
  })

  it('switches Inventory from the desktop table to disclosure cards at 720px', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const narrow = getMediaBlock(css, 'max-width: 720px')

    expect(css).toMatch(/\.pbc-inventorymobile\s*{[^}]*display:\s*none/)
    expect(narrow).toMatch(/\.pbc-inventorydesktop\s*{[^}]*display:\s*none/)
    expect(narrow).toMatch(/\.pbc-inventorymobile\s*{[^}]*display:\s*grid/)
    expect(narrow).toContain('overflow-wrap: anywhere')
    expect(narrow).toContain('min-height: var(--mobile-tap-target)')
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
    const lgResponsive = getMediaBlock(css, 'max-width: 1023.98px')

    expect(lgResponsive).not.toBe('')
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
      expect(lgResponsive).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[^}]*font-size:\\s*var\\(--mobile-input-font-size\\)`))
    }

    expect(css).toMatch(/\.pbc-auth\s*{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/)
    expect(css).toContain('env(safe-area-inset-left)')
    expect(css).toContain('env(safe-area-inset-right)')
    expect(lgResponsive).toContain('env(safe-area-inset-bottom)')
    expect(lgResponsive).toMatch(/\.pbc-mobile-header\s*{[^}]*padding-top:\s*env\(safe-area-inset-top\)/)
    expect(lgResponsive).toMatch(/\.pbc-iconbtn[\s\S]*?min-width:\s*var\(--mobile-tap-target\);[\s\S]*?min-height:\s*var\(--mobile-tap-target\);/)
    expect(lgResponsive).toMatch(/\.pbc-btn--sm[^}]*min-width:\s*var\(--mobile-tap-target\);[^}]*min-height:\s*var\(--mobile-tap-target\);/)
  })

  it('defines app-wide mobile size tokens and applies them to shared controls', () => {
    const tokens = readFileSync('app/styles/tokens.css', 'utf8')
    const css = readFileSync('app/styles/components.css', 'utf8')
    const mobile = getMediaBlock(css, 'max-width: 1023.98px')
    const narrow = getMediaBlock(css, 'max-width: 720px')

    expect(tokens).toContain('--mobile-tap-target: 44px')
    expect(tokens).toContain('--mobile-input-font-size: 16px')
    expect(tokens).toContain('--mobile-control-font-size: 14px')
    expect(tokens).toContain('--mobile-page-inset: 16px')
    expect(tokens).toContain('--mobile-layout-gap: 16px')

    for (const selector of [
      '.pbc-btn',
      '.pbc-tab',
      '.pbc-toggle button',
      'button.pbc-dropdownitem',
      'a.pbc-dropdownitem',
      '.pbc-checkfield',
      '.pbc-stocktoggle',
      '.pbc-statuscontrol',
      '.pbc-monthselect select',
      '.pbc-back',
      '.pbc-detailmore summary',
      '.pbc-detaildesc summary',
    ]) {
      expect(mobile).toContain(selector)
    }

    for (const selector of [
      '.pbc-btn',
      '.pbc-tab',
      '.pbc-toggle button',
      'button.pbc-dropdownitem',
      'a.pbc-dropdownitem',
      '.pbc-checkfield',
      '.pbc-stocktoggle',
      '.pbc-statuscontrol',
      '.pbc-monthselect select',
      '.pbc-back',
      '.pbc-detailmore summary',
      '.pbc-detaildesc summary',
    ]) {
      expect(mobile).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*(?:,|\\{)[^}]*min-height:\\s*var\\(--mobile-tap-target\\)`))
    }

    for (const selector of [
      '.pbc-btn',
      '.pbc-tab',
      '.pbc-toggle button',
      'button.pbc-dropdownitem',
      'a.pbc-dropdownitem',
      '.pbc-checkfield',
      '.pbc-stocktoggle',
      '.pbc-back',
      '.pbc-detailmore summary',
      '.pbc-detaildesc summary',
    ]) {
      expect(mobile).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*(?:,|\\{)[^}]*font-size:\\s*var\\(--mobile-control-font-size\\)`))
    }

    expect(mobile).toContain('min-height: var(--mobile-tap-target)')
    expect(mobile).toContain('font-size: var(--mobile-input-font-size)')
    expect(mobile).toContain('font-size: var(--mobile-control-font-size)')
    expect(narrow).toContain('padding: 22px var(--mobile-page-inset) 48px')
    expect(narrow).toContain('padding: var(--mobile-page-inset)')
    expect(narrow).toMatch(/\.pbc-page\s*{[^}]*padding:\s*22px var\(--mobile-page-inset\) 48px/)
    expect(narrow).toMatch(/\.pbc-card--pad\s*{[^}]*padding:\s*var\(--mobile-page-inset\)/)
  })

  it('expands Formula choices and hides only the redundant top Save on narrow screens', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const mobile = getMediaBlock(css, 'max-width: 1023.98px')
    const narrow = getMediaBlock(css, 'max-width: 720px')

    expect(mobile).toMatch(/\.pbc-formulachoice\s*{[^}]*min-height:\s*var\(--mobile-tap-target\)/)
    expect(narrow).toMatch(/\.pbc-topbar__local-save\s*{[^}]*display:\s*none/)
  })

  it('stacks narrow mobile navigation icons above visible labels without shrinking targets', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const mobile390Responsive = getMediaBlock(css, 'max-width: 560px')

    expect(css).toMatch(/\.pbc-mobile-nav\s*{[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/)
    expect(mobile390Responsive).toMatch(/\.pbc-mobile-nav\s*{[^}]*width:\s*100%/)
    expect(mobile390Responsive).toMatch(/\.pbc-mobile-nav__item\s*{[^}]*min-width:\s*0[^}]*min-height:\s*44px[^}]*flex-direction:\s*column/)
    expect(mobile390Responsive).toMatch(/\.pbc-mobile-nav__item\s+span\s*{[^}]*max-width:\s*100%[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/)
    expect(mobile390Responsive).not.toMatch(/\.pbc-mobile-nav__item\s+span\s*{[^}]*(display:\s*none|visibility:\s*hidden)/)
  })

  it('keeps the mobile shell full-width and role navigation auto-sized', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const mobile = getMediaBlock(css, 'max-width: 1023.98px')
    const narrow = getMediaBlock(css, 'max-width: 560px')

    expect(css).toMatch(/\.pbc-mobile-nav\s*{[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/)
    expect(mobile).toMatch(/\.pbc-route-progress\s*{[^}]*inset-inline-start:\s*0/)
    expect(mobile).toMatch(/\.pbc-topbar\s*{[^}]*position:\s*static/)
    expect(mobile).toMatch(/\.pbc-topbar__right\s*{[^}]*flex-wrap:\s*wrap/)
    expect(narrow).toMatch(/\.pbc-mobile-header__brandrow\s*{[^}]*width:\s*100%/)
  })

  it('keeps component-specific 1080px layouts while moving shell transitions to lg', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const legacyResponsive = css.slice(
      css.indexOf('@media (max-width: 1080px)'),
      css.indexOf('@media (max-width: 1023.98px)')
    )
    const lgResponsive = getMediaBlock(css, 'max-width: 1023.98px')

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
