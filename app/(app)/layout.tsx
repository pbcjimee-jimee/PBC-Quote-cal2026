import { AppHeader } from '@/components/layout/app-header'
import { isAuthenticatedUserAllowed } from '@/lib/security/auth-policy'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!isAuthenticatedUserAllowed(user)) {
    redirect('/api/auth/signout?reason=not_allowed')
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-slate-900 lg:pl-64">
      <AppHeader />
      {children}
    </div>
  )
}
