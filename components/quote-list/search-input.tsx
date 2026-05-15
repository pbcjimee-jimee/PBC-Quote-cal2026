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
      if (href) router.push(href)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [router, currentSearch, value])

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      placeholder="Search by customer or address..."
    />
  )
}
