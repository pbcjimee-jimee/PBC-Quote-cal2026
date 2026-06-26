import Link from 'next/link'
import { OverviewQuoteRow } from '@/components/quote-list/quote-card'
import { MonthFilterSelect, type MonthFilterOption } from '@/components/quote-list/month-filter-select'
import { SearchInput } from '@/components/quote-list/search-input'
import { Icons } from '@/components/ui/icons'
import { searchQuotes } from '@/lib/actions/quotes'
import type { QuoteRecord } from '@/lib/dev-data'

interface QuotesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function money0(value: number): string {
  return value.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

interface QuoteMonthGroup {
  key: string
  label: string
  month: string
  quotes: QuoteRecord[]
}

interface QuoteYearGroup {
  year: string
  months: QuoteMonthGroup[]
}

interface YearFilterOption {
  year: string
  count: number
}

function getQuoteMonthKey(quote: QuoteRecord): string {
  const created = new Date(quote.createdAt)
  return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
}

function getQuoteYear(quote: QuoteRecord): string {
  const created = new Date(quote.createdAt)
  return String(created.getFullYear())
}

function getQuoteMonth(quote: QuoteRecord): string {
  const created = new Date(quote.createdAt)
  return String(created.getMonth() + 1).padStart(2, '0')
}

export function filterQuotesByYearMonth(
  quotes: QuoteRecord[],
  selectedYear: string,
  selectedMonth: string
): QuoteRecord[] {
  if (!selectedYear && !selectedMonth) return quotes
  if (!selectedMonth && selectedYear) {
    return quotes.filter((quote) => getQuoteYear(quote) === selectedYear)
  }

  return quotes.filter((quote) => getQuoteMonthKey(quote) === selectedMonth && (!selectedYear || getQuoteYear(quote) === selectedYear))
}

export function filterQuotesByMonth(quotes: QuoteRecord[], monthKey: string): QuoteRecord[] {
  return filterQuotesByYearMonth(quotes, '', monthKey)
}

export function getMonthFilterHref(monthKey: string | null, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch)

  if (monthKey) {
    params.set('month', monthKey)
  } else {
    params.delete('month')
  }

  const nextSearch = params.toString()
  return `/quotes${nextSearch ? `?${nextSearch}` : ''}`
}

function buildQuoteYearOptions(yearGroups: QuoteYearGroup[]): YearFilterOption[] {
  return yearGroups.map((group) => ({
    year: group.year,
    count: group.months.reduce((sum, month) => sum + month.quotes.length, 0),
  }))
}

export function groupQuotesByYearMonth(quotes: QuoteRecord[]): QuoteYearGroup[] {
  const groups: QuoteYearGroup[] = []
  const yearGroups = new Map<string, QuoteYearGroup>()
  const monthGroups = new Map<string, QuoteMonthGroup>()

  for (const quote of quotes) {
    const created = new Date(quote.createdAt)
    const year = String(created.getFullYear())
    const monthKey = getQuoteMonthKey(quote)
    const month = getQuoteMonth(quote)
    const monthLabel = created.toLocaleDateString('en-AU', { month: 'long' })
    let yearGroup = yearGroups.get(year)

    if (!yearGroup) {
      yearGroup = { year, months: [] }
      yearGroups.set(year, yearGroup)
      groups.push(yearGroup)
    }

    let monthGroup = monthGroups.get(monthKey)

    if (!monthGroup) {
      monthGroup = { key: monthKey, label: monthLabel, month, quotes: [] }
      monthGroups.set(monthKey, monthGroup)
      yearGroup.months.push(monthGroup)
    }

    monthGroup.quotes.push(quote)
  }

  return groups
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams
  const q = typeof params?.q === 'string' ? params.q : ''
  const currentSearchParams = new URLSearchParams()
  if (q) currentSearchParams.set('q', q)

  const selectedMonth = typeof params?.month === 'string' ? params.month : ''
  const selectedYear = typeof params?.year === 'string'
    ? params.year
    : selectedMonth.startsWith('20') && selectedMonth.length === 7
      ? selectedMonth.slice(0, 4)
      : ''

  if (selectedYear) currentSearchParams.set('year', selectedYear)
  if (selectedMonth) currentSearchParams.set('month', selectedMonth)

  const currentSearch = currentSearchParams.toString()
  const result = await searchQuotes(q)
  const quotes = result.ok ? result.data : []
  const allQuoteGroups = groupQuotesByYearMonth(quotes)
  const yearFilterOptions = buildQuoteYearOptions(allQuoteGroups)
  const monthFilterOptions: MonthFilterOption[] = allQuoteGroups.flatMap((yearGroup) =>
    yearGroup.months.map((monthGroup) => ({
      key: monthGroup.key,
      month: monthGroup.month,
      label: monthGroup.label,
      year: yearGroup.year,
      count: monthGroup.quotes.length,
    }))
  )

  const visibleQuotes = filterQuotesByYearMonth(quotes, selectedYear, selectedMonth)
  const quoteGroups = groupQuotesByYearMonth(visibleQuotes)
  const selectedYearCount = quoteGroups.length
    ? quoteGroups.reduce((sum, yearGroup) => sum + yearGroup.months.reduce((monthSum, monthGroup) => monthSum + monthGroup.quotes.length, 0), 0)
    : 0
  const totalCount = selectedYear ? selectedYearCount : quotes.length

  const pipeline = visibleQuotes.reduce((sum, quote) => sum + Number(quote.finalTotal || 0), 0)
  const avg = visibleQuotes.length ? pipeline / visibleQuotes.length : 0
  const now = new Date()
  const thisMonth = quotes.filter((quote) => {
    const created = new Date(quote.createdAt)
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
  }).length

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>Admin</span>{Icons.arrowDown({ size: 14 })}<b>Overview</b></div>
        <div className="pbc-topbar__right">
          <Link href="/quotes/new" className="pbc-btn pbc-btn--primary">{Icons.plus({ size: 15 })} New Quote</Link>
        </div>
      </header>

      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Quotes</h1>
          <p>Every quote your team has built. Search and open one to view or edit.</p>
          {!result.ok ? <p className="text-[var(--danger)]">{result.error}</p> : null}
        </div>

        <div className="pbc-stats">
          <div className="pbc-stat">
            <span className="pbc-stat__label">Total quotes</span>
            <span className="pbc-stat__value mono">{visibleQuotes.length}</span>
            <span className="pbc-stat__sub">{selectedMonth || selectedYear ? 'selected range' : 'all time'}</span>
          </div>
          <div className="pbc-stat">
            <span className="pbc-stat__label">Pipeline value</span>
            <span className="pbc-stat__value mono">${money0(pipeline)}</span>
            <span className="pbc-stat__sub">inc GST</span>
          </div>
          <div className="pbc-stat">
            <span className="pbc-stat__label">Average quote</span>
            <span className="pbc-stat__value mono">${money0(avg)}</span>
            <span className="pbc-stat__sub">inc GST</span>
          </div>
          <div className="pbc-stat">
            <span className="pbc-stat__label">This month</span>
            <span className="pbc-stat__value mono">{thisMonth}</span>
            <span className="pbc-stat__sub">{now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        <div className="pbc-listcard">
          <div className="pbc-listbar">
            <SearchInput />
            <MonthFilterSelect
              currentYear={selectedYear}
              currentMonth={selectedMonth}
              currentSearch={currentSearch}
              totalCount={totalCount}
              yearOptions={yearFilterOptions}
              options={monthFilterOptions}
            />
          </div>

          <div className="pbc-qhead">
            <span /><span>Customer</span><span>Type</span><span>Labour</span><span>Created</span><span>Total</span><span />
          </div>
          <div className="pbc-qlist">
            {visibleQuotes.length === 0 ? (
              <p className="pbc-empty m-4">No quotes match your search.</p>
            ) : (
              quoteGroups.map((yearGroup) => (
                <section key={yearGroup.year} className="pbc-qyear" aria-labelledby={`quote-year-${yearGroup.year}`}>
                  <h2 id={`quote-year-${yearGroup.year}`} className="pbc-qyear__title">{yearGroup.year}</h2>
                  {yearGroup.months.map((monthGroup) => (
                    <section key={monthGroup.key} className="pbc-qmonth" aria-labelledby={`quote-month-${monthGroup.key}`}>
                      <div className="pbc-qmonth__head">
                        <h3 id={`quote-month-${monthGroup.key}`}>{monthGroup.label}</h3>
                        <span><strong>{monthGroup.quotes.length}</strong> quotes</span>
                      </div>
                      {monthGroup.quotes.map((quote) => <OverviewQuoteRow key={quote.id} quote={quote} />)}
                    </section>
                  ))}
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
