import Link from 'next/link'
import { JobDetail } from '@/components/jobs/job-detail'
import { Icons } from '@/components/ui/icons'
import { getJobDetail } from '@/lib/actions/jobs'

export default async function JobDetailPage({ params }: {
  params: Promise<{ jobberJobId: string }>
}) {
  const { jobberJobId } = await params
  const job = await getJobDetail({ jobberJobId: decodeJobberJobId(jobberJobId) })

  return (
    <main>
      <header className="pbc-topbar"><div className="pbc-crumb"><span>Jobs</span>{Icons.arrowDown({ size: 14 })}<b>Detail</b></div><div className="pbc-topbar__right"><Link href="/jobs" className="pbc-btn pbc-btn--ghost">{Icons.back({ size: 15 })} Back to jobs</Link></div></header>
      <div className="pbc-page">
        {!job.ok ? <p className="pbc-alert pbc-alert--danger">{job.error}</p> : <JobDetail job={job.data} />}
      </div>
    </main>
  )
}

function decodeJobberJobId(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
