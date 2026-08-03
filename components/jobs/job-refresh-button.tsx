'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { refreshJobDetail, refreshJobs } from '@/lib/actions/jobs'

type RefreshButtonProps =
  | { jobberJobId: string; supervisorProfileId?: never; month?: never }
  | { jobberJobId?: never; supervisorProfileId?: string | null; month?: string }

export function JobRefreshButton(props: RefreshButtonProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function refresh() {
    setError(null)
    setWarning(null)
    startTransition(async () => {
      const result = props.jobberJobId
        ? await refreshJobDetail({ jobberJobId: props.jobberJobId })
        : await refreshJobs({ supervisorProfileId: props.supervisorProfileId ?? null, month: props.month })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if ('refreshWarning' in result.data && typeof result.data.refreshWarning === 'string') {
        setWarning(result.data.refreshWarning)
      }
      router.refresh()
    })
  }

  return (
    <div>
      <button type="button" className="pbc-btn pbc-btn--primary" disabled={isPending} onClick={refresh}>
        {isPending ? 'Refreshing…' : 'Refresh'}
      </button>
      {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
      {warning ? <p className="pbc-alert pbc-alert--warning mt-2 text-xs" role="status">{warning}</p> : null}
    </div>
  )
}
