import Link from 'next/link'
import { JobFinancials, formatAud } from './job-financials'
import type { JobListItem } from '@/lib/actions/jobs'

export function JobsList({ jobs }: { jobs: readonly JobListItem[] }) {
  if (jobs.length === 0) return <p className="pbc-empty">No assigned jobs found.</p>

  return (
    <div className="pbc-tablewrap">
      <table className="pbc-table">
        <thead><tr><th>Job</th><th>Status</th><th className="text-right">Revenue</th><th>Expense / profit</th><th>Last refresh</th><th /></tr></thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td><b>#{job.jobNumber}</b><br /><span className="text-sm text-[var(--muted)]">{job.title || 'Untitled job'}</span></td>
              <td><span className="pbc-statchip">{job.jobStatus.replaceAll('_', ' ')}</span></td>
              <td className="text-right pbc-moneytext">{formatAud(job.total)}</td>
              <td><JobFinancials summary={job.financialSummary} compact /></td>
              <td className="text-sm text-[var(--muted)]">{new Date(job.refreshedAt).toLocaleString('en-AU')}</td>
              <td className="text-right"><Link className="pbc-btn pbc-btn--ghost pbc-btn--sm" href={`/jobs/${encodeURIComponent(job.id)}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
