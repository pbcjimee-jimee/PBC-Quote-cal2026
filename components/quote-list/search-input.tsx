'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getNextQuotesSearchHref } from './search-input-url'

export function SearchInput() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSearch = searchParams.toString()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const href = getNextQuotesSearchHref(value, currentSearch)
      if (href) startTransition(() => router.push(href))
    }, 300)

    return () => window.clearTimeout(timer)
  }, [router, currentSearch, value])

  return (
    <div className="pbc-search pbc-search--inline">
      <span className="pbc-search__icon">
        {isPending ? (
          <svg aria-hidden="true" className="animate-spin" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 3a7 7 0 1 1-7 7"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="9" r="6" />
              <path d="m14.5 14.5 3 3" />
            </g>
          </svg>
        )}
      </span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-busy={isPending}
        className="pbc-search__input"
        placeholder="Search by customer name…"
      />
      <span role="status" aria-live="polite" className="sr-only">
        {isPending ? 'Searching quotes' : ''}
      </span>
    </div>
  )
}
