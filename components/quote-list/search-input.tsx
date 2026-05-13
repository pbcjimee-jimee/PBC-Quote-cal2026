'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function SearchInput() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim()) {
        params.set('q', value.trim())
      } else {
        params.delete('q')
      }
      router.push(`/quotes${params.toString() ? `?${params.toString()}` : ''}`)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [router, searchParams, value])

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      placeholder="Search by customer or address..."
    />
  )
}
