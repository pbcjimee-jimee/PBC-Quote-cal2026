import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { JobRefreshButton } from '@/components/jobs/job-refresh-button'
import { JobsList } from '@/components/jobs/jobs-list'
import { Icons } from '@/components/ui/icons'
import { listMyJobs } from '@/lib/actions/jobs'
import { listUsers } from '@/lib/actions/users'
import { requireRole, type AppRole } from '@/lib/security/require-app-user'

type JobsSearchParams = { supervisor?: string; month?: string }

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<JobsSearchParams>
}) {
  const appUser = await requireRole('any')
  if (!appUser.ok) redirect('/login')

  const query = await searchParams
  const supervisorProfileId = appUser.profile.role === 'admin' && query.supervisor
    ? query.supervisor
    : null
  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>{appUser.profile.role === 'admin' ? 'Admin' : 'Supervisor'}</span>{Icons.arrowDown({ size: 14 })}<b>Jobs</b></div>
        <div className="pbc-topbar__right"><JobRefreshButton supervisorProfileId={supervisorProfileId} month={query.month} /></div>
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead"><h1>Jobs</h1><p>Select a scheduled job to review its expenses and profit.</p></div>
        <Suspense fallback={<JobsDataLoading />}>
          <JobsContent
            query={query}
            role={appUser.profile.role}
            supervisorProfileId={supervisorProfileId}
          />
        </Suspense>
      </div>
    </main>
  )
}

export async function JobsContent({
  query,
  role,
  supervisorProfileId,
}: {
  query: JobsSearchParams
  role: AppRole
  supervisorProfileId: string | null
}) {
  const [jobs, users] = await Promise.all([
    listMyJobs({ supervisorProfileId, month: query.month }),
    role === 'admin' ? listUsers({}) : Promise.resolve(null),
  ])
  const supervisors = users?.ok
    ? users.data.filter((user) => user.role === 'supervisor' && user.isActive)
    : []

  return (
    <>
      {role === 'admin' ? (
        <form className="pbc-card pbc-card--pad mb-4 flex flex-wrap items-end gap-3" method="get">
          {query.month ? <input type="hidden" name="month" value={query.month} /> : null}
          <label className="pbc-field min-w-64"><span className="pbc-field__label">Supervisor filter</span><select className="pbc-input" name="supervisor" defaultValue={supervisorProfileId ?? ''}><option value="">All jobs</option>{supervisors.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.email}</option>)}</select></label>
          <button type="submit" className="pbc-btn pbc-btn--ghost">Apply filter</button>
        </form>
      ) : null}
      {!jobs.ok ? <p className="pbc-alert pbc-alert--danger">{jobs.error}</p> : !jobs.data.assignmentLinked ? (
        <p className="pbc-alert pbc-alert--warning">{role === 'admin'
          ? "The selected supervisor's name could not be matched to an official Jobber supervisor."
          : 'Your app profile name could not be matched to an official Jobber supervisor. Ask an admin to use Eric, Edgar, or Steve.'}</p>
      ) : (
        <>
          {jobs.data.refreshWarning ? (
            <p className="pbc-alert pbc-alert--warning mb-4" role="status">{jobs.data.refreshWarning}</p>
          ) : null}
          <JobsList jobs={jobs.data.jobs} month={query.month} supervisorProfileId={supervisorProfileId} />
        </>
      )}
    </>
  )
}

function JobsDataLoading() {
  return (
    <div className="pbc-card pbc-card--pad animate-pulse" role="status" aria-label="Loading jobs">
      <div className="h-10 w-full max-w-sm rounded bg-[var(--surface-soft)]" />
      <div className="mt-4 h-96 rounded bg-[var(--surface-soft)]" />
    </div>
  )
}
