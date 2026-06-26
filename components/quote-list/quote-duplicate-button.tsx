import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { duplicateQuote } from '@/lib/actions/quotes'

interface QuoteDuplicateButtonProps {
  quoteId: string
  children?: ReactNode
  className?: string
}

export function QuoteDuplicateButton({ quoteId, children = 'Duplicate', className = 'pbc-btn pbc-btn--ghost pbc-btn--sm' }: QuoteDuplicateButtonProps) {
  async function duplicateQuoteAction() {
    'use server'

    const result = await duplicateQuote(quoteId)
    if (!result.ok) throw new Error(result.error)
    redirect(`/quotes/${result.data.id}/edit`)
  }

  return (
    <form action={duplicateQuoteAction} className="inline-flex">
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}
