import Link from 'next/link'
import { UserManagement } from '@/components/settings/user-management'
import { Icons } from '@/components/ui/icons'
import { listUsers } from '@/lib/actions/users'
import { requireAdminPage } from '@/lib/security/page-role-guard'

export default async function UsersPage() {
  await requireAdminPage()
  const users = await listUsers({})

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>Admin</span>{Icons.arrowDown({ size: 14 })}<span>Settings</span>{Icons.arrowDown({ size: 14 })}<b>Users</b></div>
        <div className="pbc-topbar__right"><Link href="/settings" className="pbc-btn pbc-btn--ghost">{Icons.back({ size: 15 })} Back to settings</Link></div>
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Users</h1>
          <p>Manage app roles, access status, temporary passwords, and Jobber assignments.</p>
          {!users.ok ? <p className="text-[var(--danger)]">{users.error}</p> : null}
        </div>
        <UserManagement initialUsers={users.ok ? users.data : []} />
      </div>
    </main>
  )
}
