import { AppHeader } from '@/components/layout/app-header'
import { InstallGuidance } from '@/components/pwa/install-guidance'
import { AUTHENTICATION_REQUIRED_ERROR } from '@/lib/security/auth-policy'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import { getAuthUserProfile } from '@/lib/user-profiles'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const allowedUser = await requireAllowedUser()

  if (!allowedUser.ok && allowedUser.error === AUTHENTICATION_REQUIRED_ERROR) {
    redirect('/login')
  } else if (!allowedUser.ok) {
    redirect('/api/auth/signout?reason=not_allowed')
  }

  return (
    <div className="pbc-appshell min-h-screen text-[var(--foreground)] transition-[padding-left] duration-200 lg:pl-[var(--app-sidebar-width,15.5rem)]">
      <AppHeader userProfile={getAuthUserProfile({
        id: allowedUser.user.id,
        email: allowedUser.user.email,
        user_metadata: allowedUser.user.userMetadata,
        app_metadata: allowedUser.user.appMetadata,
      })} />
      <InstallGuidance />
      {children}
    </div>
  )
}
