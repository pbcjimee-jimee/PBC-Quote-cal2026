'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { refreshJobDetail, refreshJobs } from '@/lib/actions/jobs'

type RefreshButtonProps =
  | { jobberJobId: string; supervisorProfileId?: never }
  | { jobberJobId?: never; supervisorProfileId?: string | null }

export function JobRefreshButton(props: RefreshButtonProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function refresh() {
    setError(null)
    startTransition(async () => {
      const result = props.jobberJobId
        ? await refreshJobDetail({ jobberJobId: props.jobberJobId })
        : await refreshJobs({ supervisorProfileId: props.supervisorProfileId ?? null })
      if (!result.ok) {
        setError(result.error)
        return
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
    </div>
  )
}
