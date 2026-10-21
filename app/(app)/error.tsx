'use client'

import Link from 'next/link'
import { Button, Card, buttonClassName } from '@/components/ui/card'

export default function AppError({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const reference = error.digest && /^[a-zA-Z0-9-]{1,64}$/.test(error.digest) ? error.digest : null
  return (
    <div className="pbc-page">
      <Card className="mx-auto max-w-xl">
        <div role="alert" className="space-y-3">
          <h1 className="text-xl font-semibold">This page could not be loaded</h1>
          <p className="text-[var(--muted)]">Try again. If the problem continues, contact an administrator.</p>
          {reference ? <p className="text-sm text-[var(--muted)]">Reference: {reference}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" variant="primary" onClick={reset}>Retry</Button>
          <Link href="/" className={buttonClassName()}>Go home</Link>
          <Link href="/quotes" className={buttonClassName()}>Go to Quotes</Link>
        </div>
      </Card>
    </div>
  )
}
