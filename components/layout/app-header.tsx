import Link from 'next/link'
import { signOut } from '@/lib/actions/auth'

export function AppHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/quotes" className="text-sm font-semibold text-gray-900">
          PBC Quote Calculator
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/quotes/new" className="rounded-md bg-slate-700 px-3 py-2 font-medium text-white hover:bg-slate-800">
            New Quote
          </Link>
          <Link href="/settings" className="text-gray-600 hover:text-gray-900">
            Settings
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-gray-400 hover:text-gray-700">
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  )
}
