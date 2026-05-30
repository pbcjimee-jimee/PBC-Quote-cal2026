import { AppHeader } from '@/components/layout/app-header'
import { isAuthenticatedUserAllowed } from '@/lib/security/auth-policy'
import { createClient } from '@/lib/supabase/server'
import { getAuthUserProfile } from '@/lib/user-profiles'
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
    <div className="min-h-screen bg-[var(--background)] text-slate-900 transition-[padding-left] duration-200 lg:pl-[var(--app-sidebar-width,16rem)]">
      <AppHeader userProfile={getAuthUserProfile(user)} />
      {children}
    </div>
  )
}
