import Link from 'next/link'
import { QuoteCard } from '@/components/quote-list/quote-card'
import { SearchInput } from '@/components/quote-list/search-input'
import { searchQuotes } from '@/lib/actions/quotes'

interface QuotesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams
  const q = typeof params?.q === 'string' ? params.q : ''
  const result = await searchQuotes(q)
  const quotes = result.ok ? result.data : []

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
          {!result.ok ? <p className="mt-1 text-sm text-red-600">{result.error}</p> : null}
        </div>
        <Link href="/quotes/new" className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          New Quote
        </Link>
      </div>
      <div className="mb-5">
        <SearchInput />
      </div>
      <div className="space-y-3">
        {quotes.map((quote) => (
          <QuoteCard key={quote.id} quote={quote} />
        ))}
        {quotes.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-gray-500">No quotes yet.</p>
            <Link href="/quotes/new" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
              Create the first quote
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  )
}
