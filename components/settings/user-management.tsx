'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
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

export function UserManagement({
  initialUsers,
  jobberEnabled = true,
  jobberNotice = 'Jobber is unavailable.',
}: {
  initialUsers: ManagedUser[]
  jobberEnabled?: boolean
  jobberNotice?: string
}) {
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
  const [confirmation, setConfirmation] = useState<{
    title: string
    description: string
    label: string
    perform: () => void
  } | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    if (!confirmation) return
    cancelRef.current?.focus()
    const trigger = triggerRef.current
    return () => trigger?.focus()
  }, [confirmation])

  function confirmChange(trigger: HTMLElement, user: ManagedUser, title: string, description: string, label: string, perform: () => void) {
    triggerRef.current = trigger
    setError(null)
    setConfirmation({ title, description: `${user.displayName || user.email} (${user.email}). ${description}`, label, perform })
  }

  function run(task: () => Promise<void>) {
    if (runningRef.current) return
    runningRef.current = true
    setMessage(null)
    setError(null)
    startTransition(async () => {
      try {
        await task()
      } catch {
        setError('Unable to complete this change. Please try again.')
      } finally {
        runningRef.current = false
      }
    })
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
      setConfirmation(null)
    })
  }

  function toggleActive(user: ManagedUser) {
    run(async () => {
      const result = await setUserActive({ id: user.id, active: !user.isActive })
      if (!result.ok) return setError(result.error)
      setUsers((current) => replaceUser(current, result.data))
      setMessage(result.data.isActive ? 'User activated.' : 'User deactivated.')
      setConfirmation(null)
    })
  }

  function saveJobberLink(user: ManagedUser) {
    if (!jobberEnabled) return
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
      setConfirmation(null)
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-5" inert={confirmation !== null}>
      {!jobberEnabled ? (
        <p className="pbc-alert pbc-alert--warning" role="status">{jobberNotice}</p>
      ) : null}
      <section className="pbc-card pbc-card--pad">
        <div className="pbc-panelhead"><div><h2 className="pbc-paneltitle">Create user</h2><p className="pbc-panelsub">Use a temporary password of at least 12 characters.</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label htmlFor="new-user-email" className="pbc-field"><span className="pbc-field__label">Email</span><input id="new-user-email" name="email" autoComplete="email" className="pbc-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label htmlFor="new-user-display-name" className="pbc-field"><span className="pbc-field__label">Display name</span><input id="new-user-display-name" name="displayName" autoComplete="off" className="pbc-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label htmlFor="new-user-password" className="pbc-field"><span className="pbc-field__label">Temporary password</span><input id="new-user-password" name="temporaryPassword" autoComplete="new-password" className="pbc-input" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /></label>
          <label htmlFor="new-user-role" className="pbc-field"><span className="pbc-field__label">Role</span><select id="new-user-role" name="role" className="pbc-input" value={role} onChange={(event) => setRole(event.target.value as AppRole)}><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></label>
        </div>
        <button type="button" className="pbc-btn pbc-btn--primary mt-3" disabled={isPending} onClick={submitNewUser}>Create user</button>
      </section>

      {message ? <p role="status" className="pbc-alert pbc-alert--success">{message}</p> : null}
      {error && !confirmation ? <p role="alert" className="pbc-alert pbc-alert--danger">{error}</p> : null}

      <section className="pbc-card pbc-card--pad">
        <div className="pbc-panelhead"><div><h2 className="pbc-paneltitle">App users</h2><p className="pbc-panelsub">{users.length} profiles</p></div></div>
        <div className="pbc-tablewrap mt-4">
          <table className="pbc-table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Jobber user ID</th><th>Temporary password</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><b>{user.displayName || user.email}</b><br /><span className="text-xs text-slate-500">{user.email}</span></td>
                  <td><label htmlFor={`user-role-${user.id}`} className="sr-only">Role for {user.email}</label><select id={`user-role-${user.id}`} name={`role-${user.id}`} aria-label={`Role for ${user.email}`} className="pbc-input" value={user.role} disabled={isPending} onChange={(event) => {
                    const nextRole = event.target.value as AppRole
                    if (nextRole === user.role) return
                    confirmChange(event.currentTarget, user, 'Change user role?', `Change role from ${user.role} to ${nextRole}. ${nextRole === 'admin' ? 'Admins can manage users and all app settings.' : 'Supervisor access is limited to Jobs and Inventory.'}`, 'Change role', () => changeRole(user, nextRole))
                  }}><option value="admin">Admin</option><option value="supervisor">Supervisor</option></select></td>
                  <td><button type="button" aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.email}`} className={`pbc-btn pbc-btn--sm ${user.isActive ? 'pbc-btn--ghost' : 'pbc-btn--primary'}`} disabled={isPending} onClick={(event) => confirmChange(event.currentTarget, user, user.isActive ? 'Deactivate user?' : 'Activate user?', user.isActive ? 'The user will lose app access and be blocked from signing in to this shared Auth project.' : 'The user will regain app access and their sign-in ban in this shared Auth project will be removed.', user.isActive ? 'Deactivate user' : 'Activate user', () => toggleActive(user))}>{user.isActive ? 'Deactivate' : 'Activate'}</button></td>
                  <td><label htmlFor={`user-jobber-${user.id}`} className="sr-only">Jobber user ID for {user.email}</label><div className="flex min-w-64 gap-2"><input id={`user-jobber-${user.id}`} name={`jobberUserId-${user.id}`} autoComplete="off" aria-label={`Jobber user ID for ${user.email}`} className="pbc-input" value={jobberIds[user.id] ?? ''} disabled={!jobberEnabled} title={!jobberEnabled ? jobberNotice : undefined} onChange={(event) => setJobberIds((current) => ({ ...current, [user.id]: event.target.value }))} /><button type="button" aria-label={`Link Jobber user for ${user.email}`} className="pbc-btn pbc-btn--ghost pbc-btn--sm" disabled={isPending || !jobberEnabled} title={!jobberEnabled ? jobberNotice : undefined} onClick={() => saveJobberLink(user)}>Link</button></div></td>
                  <td><label htmlFor={`user-password-${user.id}`} className="sr-only">Temporary password for {user.email}</label><div className="flex min-w-64 gap-2"><input id={`user-password-${user.id}`} name={`temporaryPassword-${user.id}`} autoComplete="new-password" aria-label={`Temporary password for ${user.email}`} className="pbc-input" type="password" value={passwords[user.id] ?? ''} onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))} /><button type="button" aria-label={`Reset password for ${user.email}`} className="pbc-btn pbc-btn--ghost pbc-btn--sm" disabled={isPending} onClick={(event) => confirmChange(event.currentTarget, user, 'Reset user password?', 'The existing password will be replaced in this shared Auth project. Share the new temporary password directly with the user.', 'Reset password', () => resetPassword(user))}>Reset</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
      {confirmation ? (
        <div className="pbc-dialogbackdrop" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="user-change-title" aria-describedby="user-change-description" aria-busy={isPending} className="pbc-dialog" onKeyDown={(event) => {
            if (event.key === 'Escape' && !isPending) setConfirmation(null)
            if (event.key === 'Tab') {
              event.preventDefault()
              if (document.activeElement === cancelRef.current) confirmRef.current?.focus()
              else cancelRef.current?.focus()
            }
          }}>
            <h2 id="user-change-title" className="text-base font-semibold text-[var(--foreground)]">{confirmation.title}</h2>
            <p id="user-change-description" className="mt-2 break-words text-sm text-[var(--muted)]">{confirmation.description}</p>
            {error ? <p role="alert" className="pbc-alert pbc-alert--danger mt-4">{error}</p> : null}
            <div className="pbc-dialog__actions">
              <button ref={cancelRef} type="button" className="pbc-btn pbc-btn--ghost" disabled={isPending} onClick={() => setConfirmation(null)}>Cancel</button>
              <button ref={confirmRef} type="button" className="pbc-btn pbc-btn--primary" disabled={isPending} onClick={confirmation.perform}>{isPending ? 'Saving...' : confirmation.label}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
