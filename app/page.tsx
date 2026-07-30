import { redirect } from 'next/navigation'
import { requireAppUser } from '@/lib/security/require-app-user'

export default async function Home() {
  const appUser = await requireAppUser()
  if (!appUser.ok) redirect('/login')
  redirect(appUser.profile.role === 'supervisor' ? '/jobs' : '/quotes/new')
}
