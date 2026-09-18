'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Card } from '@/components/ui/card'

interface QuoteLoadErrorProps {
  mode: 'new' | 'edit'
  unavailable: Array<'Pricing settings' | 'Areas' | 'Quote'>
}

export function QuoteLoadError({ mode, unavailable }: QuoteLoadErrorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <main className="pbc-page">
      <div className="pbc-pagehead">
        <h1>{mode === 'new' ? 'New Quote' : 'Edit Quote'}</h1>
      </div>
      <Card className="space-y-4">
      <div className="pbc-alert pbc-alert--danger pbc-alert--stack" role="alert">
          <h2 className="pbc-paneltitle">Unable to open the quote editor</h2>
          <p>{unavailable.join(' and ')} could not be loaded. Calculation and saving are unavailable until this data is loaded.</p>
          <p>Nothing has been changed. Saved quotes and local drafts are kept.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            disabled={isPending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {isPending ? 'Retrying...' : 'Retry'}
          </Button>
          <Link href="/quotes" prefetch={false} className="pbc-btn pbc-btn--ghost">Back to Quotes</Link>
          <span role="status" aria-live="polite">{isPending ? 'Reloading quote data...' : ''}</span>
        </div>
      </Card>
    </main>
  )
}
