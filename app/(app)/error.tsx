'use client'

import Link from 'next/link'
import { Alert } from '@/components/ui/card'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main>
      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Something went wrong</h1>
          <p>The page hit an unexpected error. Your saved quotes and settings are not affected.</p>
        </div>
        <Alert tone="danger" live={false}>
          {error.digest ? `Error reference: ${error.digest}` : error.message || 'Unexpected error.'}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="pbc-btn pbc-btn--primary">
            Try again
          </button>
          <Link href="/quotes" className="pbc-btn pbc-btn--ghost">
            Back to Overview
          </Link>
        </div>
      </div>
    </main>
  )
}
