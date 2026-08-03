import { redirect } from 'next/navigation'
import { AUTHENTICATION_REQUIRED_ERROR } from './auth-policy'
import { requireRole } from './require-app-user'

export async function requireAdminPage(): Promise<void> {
  const result = await requireRole('admin')
  if (result.ok) return

  if (result.error === AUTHENTICATION_REQUIRED_ERROR) {
    redirect('/login')
  }
  if (result.error === 'Admin access required') {
    redirect('/jobs')
  }
  redirect('/api/auth/signout?reason=not_allowed')
}
