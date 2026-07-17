'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getNextQuotesSearchHref } from './search-input-url'

export function SearchInput() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSearch = searchParams.toString()
  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const href = getNextQuotesSearchHref(value, currentSearch)
      // replace, not push: typing refines the current list and must not
      // stack a history entry per debounce tick.
      if (href) router.replace(href)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [router, currentSearch, value])

  return (
    <div className="pbc-search pbc-search--inline">
      <span className="pbc-search__icon">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none">
          <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="6" />
            <path d="m14.5 14.5 3 3" />
          </g>
        </svg>
      </span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="pbc-search__input"
        placeholder="Search by customer, address or quote #…"
      />
    </div>
  )
}
