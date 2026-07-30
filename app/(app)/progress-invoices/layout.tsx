import { requireAdminPage } from '@/lib/security/page-role-guard'

export default async function ProgressInvoicesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
