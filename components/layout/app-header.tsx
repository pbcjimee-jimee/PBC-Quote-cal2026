'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
import { IntentLink } from '@/components/navigation/intent-link'
import { signOut } from '@/lib/actions/auth'
import { Icons } from '@/components/ui/icons'
import type { UserProfile } from '@/lib/user-profiles'

type NavItem = {
  href: string
  label: string
  mobileLabel?: string
  icon: 'overview' | 'quote' | 'progressInvoice' | 'settings' | 'inventory'
}

const navItems: NavItem[] = [
  { href: '/quotes', label: 'Overview', icon: 'overview' },
  { href: '/quotes/new', label: 'New Quote', mobileLabel: 'New', icon: 'quote' },
  {
    href: '/progress-invoices',
    label: 'Progress Invoices',
    mobileLabel: 'Progress',
    icon: 'progressInvoice',
  },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/settings/inventory', label: 'Inventory', icon: 'inventory' },
]

const SIDEBAR_STORAGE_KEY = 'pbc-sidebar-collapsed'
const SIDEBAR_PREFERENCE_EVENT = 'pbc-sidebar-preference-change'

function subscribeSidebarPreference(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined

  window.addEventListener('storage', callback)
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, callback)
  }
}

function getSidebarPreferenceSnapshot() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
}

function getServerSidebarPreferenceSnapshot() {
  return false
}

function subscribeHydrationStatus() {
  return () => undefined
}

function getHydratedSnapshot() {
  return true
}

function getServerHydratedSnapshot() {
  return false
}

function NavIcon({ icon }: { icon: NavItem['icon'] }) {
  if (icon === 'quote') return Icons.quote({ size: 18 })
  if (icon === 'progressInvoice') return Icons.progressInvoice({ size: 18 })
  if (icon === 'settings') return Icons.settings({ size: 18 })
  if (icon === 'inventory') return Icons.layers({ size: 18 })
  return Icons.overview({ size: 18 })
}

function isNavItemActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false
  if (href === '/quotes/new' && pathname === '/') return true
  if (href === '/quotes') {
    return pathname === '/quotes' || (pathname.startsWith('/quotes/') && !pathname.startsWith('/quotes/new'))
  }
  if (href === '/settings') return pathname === '/settings'
  return pathname.startsWith(href)
}

export function AppHeader({ userProfile }: { userProfile: UserProfile }) {
  const pathname = usePathname()
  const showEmail = Boolean(userProfile.email && userProfile.email !== userProfile.displayName)
  const isSidebarCollapsed = useSyncExternalStore(
    subscribeSidebarPreference,
    getSidebarPreferenceSnapshot,
    getServerSidebarPreferenceSnapshot
  )
  const hasHydrated = useSyncExternalStore(
    subscribeHydrationStatus,
    getHydratedSnapshot,
    getServerHydratedSnapshot
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--app-sidebar-width', isSidebarCollapsed ? '4.5rem' : '15.5rem')
  }, [isSidebarCollapsed])

  function toggleSidebar() {
    const nextValue = isSidebarCollapsed ? 'false' : 'true'
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, nextValue)
    window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT))
  }

  return (
    <>
      <aside
        data-sidebar-state={isSidebarCollapsed ? 'collapsed' : 'expanded'}
        className={[
          'pbc-side fixed inset-y-0 left-0 z-40 hidden transition-[width,padding] duration-200 lg:flex',
          isSidebarCollapsed ? 'w-[4.5rem] !px-3' : 'w-[15.5rem]',
        ].join(' ')}
      >
        <div className={isSidebarCollapsed ? 'flex flex-col items-center gap-3' : 'flex items-center justify-between gap-2'}>
          <IntentLink href="/quotes" prefetchOnViewport className={`pbc-brand min-w-0 ${isSidebarCollapsed ? '!px-0' : ''}`}>
            <span className="pbc-brand__mark">P</span>
            <span className={isSidebarCollapsed ? 'sr-only' : 'pbc-brand__text min-w-0'}>
              <b>PBC Quote</b>
              <i>Calculator</i>
            </span>
          </IntentLink>
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={toggleSidebar}
            className="pbc-iconbtn shrink-0"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? '>' : '<'}
          </button>
        </div>

        <nav className="pbc-nav">
          <p className={isSidebarCollapsed ? 'sr-only' : 'pbc-nav__head'}>Admin tools</p>
          {navItems.map((item) => {
            const isActive = isNavItemActive(item.href, hasHydrated ? pathname : null)

            return (
              <IntentLink
                key={item.href}
                href={item.href}
                prefetchOnViewport
                title={item.label}
                className={`pbc-nav__item ${isActive ? 'is-active' : ''} ${isSidebarCollapsed ? 'justify-center' : ''}`}
              >
                <NavIcon icon={item.icon} />
                <span className={isSidebarCollapsed ? 'sr-only' : ''}>{item.label}</span>
              </IntentLink>
            )
          })}
        </nav>

        <div className="pbc-side__foot">
          <div className={`pbc-usercard ${isSidebarCollapsed ? 'pbc-usercard--collapsed justify-center' : ''}`}>
            <span className="pbc-usercard__av">{Icons.user({ size: 16 })}</span>
            <span className={isSidebarCollapsed ? 'sr-only' : 'pbc-usercard__identity'}>
              <b>{userProfile.displayName}</b>
              {showEmail ? <i>{userProfile.email}</i> : null}
            </span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className={`pbc-signout ${isSidebarCollapsed ? 'pbc-signout--collapsed' : ''}`}
            >
              {isSidebarCollapsed ? (
                <>
                  {Icons.signOut({ size: 18 })}
                  <span className="sr-only">Sign out</span>
                </>
              ) : (
                'Sign out'
              )}
            </button>
          </form>
        </div>
      </aside>

      <header className="pbc-mobile-header sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(246,249,255,0.82)] backdrop-blur lg:hidden">
        <div className="pbc-mobile-header__inner">
          <IntentLink href="/quotes" prefetchOnViewport className="pbc-mobile-header__brand">
            <span className="pbc-brand__mark !h-9 !w-9 !text-sm">P</span>
            <span className="text-sm font-extrabold text-[var(--foreground)]">PBC Quote</span>
          </IntentLink>

          <nav aria-label="Mobile navigation" className="pbc-mobile-nav">
            {navItems.map((item) => {
              const isActive = isNavItemActive(item.href, hasHydrated ? pathname : null)

              return (
                <IntentLink
                  key={item.href}
                  href={item.href}
                  prefetchOnViewport
                  aria-current={isActive ? 'page' : undefined}
                  className={`pbc-mobile-nav__item ${isActive ? 'is-active' : ''}`}
                >
                  <NavIcon icon={item.icon} />
                  <span>{item.mobileLabel ?? item.label}</span>
                </IntentLink>
              )
            })}
          </nav>
        </div>
      </header>
    </>
  )
}
