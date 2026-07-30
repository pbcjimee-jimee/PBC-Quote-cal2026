import { redirect } from 'next/navigation'
import { JobRefreshButton } from '@/components/jobs/job-refresh-button'
import { JobsList } from '@/components/jobs/jobs-list'
import { Icons } from '@/components/ui/icons'
import { listMyJobs } from '@/lib/actions/jobs'
import { listUsers } from '@/lib/actions/users'
import { requireRole } from '@/lib/security/require-app-user'

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ supervisor?: string }>
}) {
  const appUser = await requireRole('any')
  if (!appUser.ok) redirect('/login')

  const query = await searchParams
  const supervisorProfileId = appUser.profile.role === 'admin' && query.supervisor
    ? query.supervisor
    : null
  const [jobs, users] = await Promise.all([
    listMyJobs({ supervisorProfileId }),
    appUser.profile.role === 'admin' ? listUsers({}) : Promise.resolve(null),
  ])
  const supervisors = users?.ok
    ? users.data.filter((user) => user.role === 'supervisor' && user.isActive)
    : []

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>{appUser.profile.role === 'admin' ? 'Admin' : 'Supervisor'}</span>{Icons.arrowDown({ size: 14 })}<b>Jobs</b></div>
        <div className="pbc-topbar__right"><JobRefreshButton supervisorProfileId={supervisorProfileId} /></div>
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead"><h1>Jobs</h1><p>Jobber revenue, expenses, and profit by assigned job.</p></div>
        {appUser.profile.role === 'admin' ? (
          <form className="pbc-card pbc-card--pad mb-4 flex flex-wrap items-end gap-3" method="get">
            <label className="pbc-field min-w-64"><span className="pbc-field__label">Supervisor filter</span><select className="pbc-input" name="supervisor" defaultValue={supervisorProfileId ?? ''}><option value="">All jobs</option>{supervisors.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.email}{user.jobberUserId ? '' : ' (not linked)'}</option>)}</select></label>
            <button type="submit" className="pbc-btn pbc-btn--ghost">Apply filter</button>
          </form>
        ) : null}
        {!jobs.ok ? <p className="pbc-alert pbc-alert--danger">{jobs.error}</p> : !jobs.data.assignmentLinked ? (
          <p className="pbc-alert pbc-alert--warning">{appUser.profile.role === 'admin'
            ? 'The selected supervisor is not linked to a Jobber user.'
            : 'Your app profile is not linked to a Jobber user. Ask an admin to complete the link in Settings → Users.'}</p>
        ) : <JobsList jobs={jobs.data.jobs} />}
      </div>
    </main>
  )
}
