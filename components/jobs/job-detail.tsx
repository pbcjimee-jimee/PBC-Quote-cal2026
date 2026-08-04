import Link from 'next/link'
import type { JobDetailData } from '@/lib/actions/jobs'
import { JobFinancials, formatAud } from './job-financials'
import { JobRefreshButton } from './job-refresh-button'

function formatExpenseDate(value: string): string {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return dateParts ? `${dateParts[1]}/${dateParts[2]}/${dateParts[3]}` : value
}

export function JobDetail({ job }: { job: JobDetailData }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1>Job #{job.jobNumber}</h1><p>{job.title || 'Untitled job'} · {job.jobStatus.replaceAll('_', ' ')}</p></div>
        <div className="flex flex-wrap gap-2"><JobRefreshButton jobberJobId={job.id} /><Link href={job.jobberWebUri} target="_blank" rel="noreferrer" className="pbc-btn pbc-btn--ghost">Open in Jobber</Link></div>
      </div>
      <JobFinancials summary={job.financialSummary} labourEstimate={job.labourEstimate} />
      <section className="pbc-card pbc-card--pad">
        <div className="pbc-panelhead"><div><h2 className="pbc-paneltitle">Expenses</h2><p className="pbc-panelsub">{job.expenses.length} entries</p></div></div>
        {job.expenses.length === 0 ? <p className="pbc-empty mt-4">No expenses recorded.</p> : (
          <div className="pbc-tablewrap mt-4"><table className="pbc-table"><thead><tr><th>Title</th><th>Description</th><th>Date</th><th>Entered by</th><th className="text-right">Amount</th></tr></thead><tbody>
            {job.expenses.map((expense) => <tr key={expense.id}><td><b>{expense.title}</b></td><td>{expense.description || '-'}</td><td>{formatExpenseDate(expense.date)}</td><td>{expense.enteredByName || expense.paidByName || expense.reimbursableToName || '-'}</td><td className="text-right pbc-moneytext">{formatAud(expense.total)}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  )
}
