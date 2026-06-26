'use client'

import { useRouter } from 'next/navigation'

export interface MonthFilterOption {
  key: string
  month: string
  label: string
  year: string
  count: number
}

interface YearFilterOption {
  year: string
  count: number
}

interface MonthFilterSelectProps {
  currentYear: string
  currentMonth: string
  currentSearch: string
  totalCount: number
  yearOptions: YearFilterOption[]
  options: MonthFilterOption[]
}

function getMonthFilterHref(monthKey: string | null, year: string | null, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch)

  if (monthKey) {
    params.set('month', monthKey)
  } else {
    params.delete('month')
  }

  if (year) {
    params.set('year', year)
  } else {
    params.delete('year')
  }

  const nextSearch = params.toString()
  return `/quotes${nextSearch ? `?${nextSearch}` : ''}`
}

export function MonthFilterSelect({
  currentYear,
  currentMonth,
  currentSearch,
  totalCount,
  yearOptions,
  options,
}: MonthFilterSelectProps) {
  const router = useRouter()
  const monthOptions = currentYear ? options.filter((option) => option.year === currentYear) : []
  const availableMonthsCount = monthOptions.reduce((sum, option) => sum + option.count, 0)

  return (
    <div className="pbc-filtergroup">
      <label className="pbc-monthselect">
        <span>Year</span>
        <select
          aria-label="Filter quotes by year"
          value={currentYear}
          onChange={(event) => {
            const nextYear = event.target.value
            router.push(getMonthFilterHref('', nextYear, currentSearch))
          }}
        >
          <option value="">All years ({totalCount})</option>
          {yearOptions.map((option) => (
            <option key={option.year} value={option.year}>
              {option.year} ({option.count})
            </option>
          ))}
        </select>
      </label>
      <label className="pbc-monthselect">
        <span>Month</span>
        <select
          aria-label="Filter quotes by month"
          value={monthOptions.length === 0 ? '' : currentMonth}
          disabled={monthOptions.length === 0}
          onChange={(event) => router.push(getMonthFilterHref(event.target.value, currentYear, currentSearch))}
        >
          <option value="">{currentYear ? `All months (${availableMonthsCount})` : `All months (${totalCount})`}</option>
          {monthOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
