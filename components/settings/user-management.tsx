'use client'

import { useState, useTransition } from 'react'
import {
  createUser,
  linkJobberUser,
  resetUserPassword,
  setUserActive,
  updateUserRole,
  type ManagedUser,
} from '@/lib/actions/users'
import type { AppRole } from '@/lib/security/require-app-user'

function replaceUser(users: ManagedUser[], updated: ManagedUser): ManagedUser[] {
  return users.map((user) => user.id === updated.id ? updated : user)
}

export function UserManagement({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [role, setRole] = useState<AppRole>('supervisor')
  const [jobberIds, setJobberIds] = useState<Record<string, string>>(() => Object.fromEntries(
    initialUsers.map((user) => [user.id, user.jobberUserId ?? ''])
  ))
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(task: () => Promise<void>) {
    setMessage(null)
    setError(null)
    startTransition(task)
  }

  function submitNewUser() {
    run(async () => {
      const result = await createUser({ email, displayName, temporaryPassword, role })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setUsers((current) => [...current, result.data].sort((a, b) => a.email.localeCompare(b.email)))
      setJobberIds((current) => ({ ...current, [result.data.id]: '' }))
      setEmail('')
      setDisplayName('')
      setTemporaryPassword('')
      setMessage('User created. Share the temporary password directly with the user.')
    })
  }

  function changeRole(user: ManagedUser, nextRole: AppRole) {
    run(async () => {
      const result = await updateUserRole({ id: user.id, role: nextRole })
      if (!result.ok) return setError(result.error)
      setUsers((current) => replaceUser(current, result.data))
      setMessage('Role updated.')
    })
  }

  function toggleActive(user: ManagedUser) {
    run(async () => {
      const result = await setUserActive({ id: user.id, active: !user.isActive })
      if (!result.ok) return setError(result.error)
      setUsers((current) => replaceUser(current, result.data))
      setMessage(result.data.isActive ? 'User activated.' : 'User deactivated.')
    })
  }

  function saveJobberLink(user: ManagedUser) {
    run(async () => {
      const result = await linkJobberUser({ id: user.id, jobberUserId: jobberIds[user.id]?.trim() || null })
      if (!result.ok) return setError(result.error)
      setUsers((current) => replaceUser(current, result.data))
      setMessage('Jobber user link updated.')
    })
  }

  function resetPassword(user: ManagedUser) {
    run(async () => {
      const password = passwords[user.id] ?? ''
      const result = await resetUserPassword({ id: user.id, temporaryPassword: password })
      if (!result.ok) return setError(result.error)
      setPasswords((current) => ({ ...current, [user.id]: '' }))
      setMessage('Temporary password replaced. Share it directly with the user.')
    })
  }

  return (
    <div className="space-y-5">
      <section className="pbc-card pbc-card--pad">
        <div className="pbc-panelhead"><div><h2 className="pbc-paneltitle">Create user</h2><p className="pbc-panelsub">Use a temporary password of at least 12 characters.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="pbc-field"><span className="pbc-field__label">Email</span><input className="pbc-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="pbc-field"><span className="pbc-field__label">Display name</span><input className="pbc-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="pbc-field"><span className="pbc-field__label">Temporary password</span><input className="pbc-input" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /></label>
          <label className="pbc-field"><span className="pbc-field__label">Role</span><select className="pbc-input" value={role} onChange={(event) => setRole(event.target.value as AppRole)}><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></label>
        </div>
        <button type="button" className="pbc-btn pbc-btn--primary mt-3" disabled={isPending} onClick={submitNewUser}>Create user</button>
      </section>

      {message ? <p className="pbc-alert pbc-alert--success">{message}</p> : null}
      {error ? <p className="pbc-alert pbc-alert--danger">{error}</p> : null}

      <section className="pbc-card pbc-card--pad">
        <div className="pbc-panelhead"><div><h2 className="pbc-paneltitle">App users</h2><p className="pbc-panelsub">{users.length} profiles</p></div></div>
        <div className="pbc-tablewrap mt-4">
          <table className="pbc-table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Jobber user ID</th><th>Temporary password</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><b>{user.displayName || user.email}</b><br /><span className="text-xs text-slate-500">{user.email}</span></td>
                  <td><select aria-label={`Role for ${user.email}`} className="pbc-input" value={user.role} disabled={isPending} onChange={(event) => changeRole(user, event.target.value as AppRole)}><option value="admin">Admin</option><option value="supervisor">Supervisor</option></select></td>
                  <td><button type="button" className={`pbc-btn pbc-btn--sm ${user.isActive ? 'pbc-btn--ghost' : 'pbc-btn--primary'}`} disabled={isPending} onClick={() => toggleActive(user)}>{user.isActive ? 'Deactivate' : 'Activate'}</button></td>
                  <td><div className="flex min-w-64 gap-2"><input aria-label={`Jobber user ID for ${user.email}`} className="pbc-input" value={jobberIds[user.id] ?? ''} onChange={(event) => setJobberIds((current) => ({ ...current, [user.id]: event.target.value }))} /><button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" disabled={isPending} onClick={() => saveJobberLink(user)}>Link</button></div></td>
                  <td><div className="flex min-w-64 gap-2"><input aria-label={`Temporary password for ${user.email}`} className="pbc-input" type="password" value={passwords[user.id] ?? ''} onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))} /><button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" disabled={isPending} onClick={() => resetPassword(user)}>Reset</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
