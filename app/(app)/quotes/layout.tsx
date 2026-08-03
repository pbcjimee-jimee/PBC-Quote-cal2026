import { requireAdminPage } from '@/lib/security/page-role-guard'

export default async function QuotesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
