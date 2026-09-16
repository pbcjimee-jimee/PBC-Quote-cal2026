import Link from 'next/link'
import { searchDeletedQuotes } from '@/lib/actions/quote-lifecycle'
import { QuoteTrashList } from '@/components/quote-list/quote-trash-list'

interface QuoteTrashPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function QuoteTrashPage({ searchParams }: QuoteTrashPageProps) {
  const params = await searchParams
  const query = typeof params?.q === 'string' ? params.q : ''
  const page = typeof params?.page === 'string' ? Number(params.page) : 1
  const result = await searchDeletedQuotes({ query, page })
  const href = (nextPage: number) => `/quotes/trash?${new URLSearchParams({ q: query, page: String(nextPage) })}`

  return <main>
    <header className="pbc-topbar">
      <div className="pbc-crumb"><span>Admin</span><b>Trash</b></div>
      <Link href="/quotes" className="pbc-btn pbc-btn--ghost">Back to quotes</Link>
    </header>
    <div className="pbc-page">
      <div className="pbc-pagehead">
        <h1>Trash</h1>
        <p>Deleted quotes stay here until an admin restores them. Saved details and pricing are kept.</p>
      </div>
      <form action="/quotes/trash" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="pbc-field min-w-0 flex-1">
          <span className="pbc-field__label">Search deleted quotes</span>
          <input type="search" name="q" defaultValue={query} maxLength={200} className="pbc-input" placeholder="Customer, address or quote number" />
        </label>
        <button type="submit" className="pbc-btn pbc-btn--ghost">Search</button>
        {query ? <Link href="/quotes/trash" className="pbc-btn pbc-btn--ghost">Clear</Link> : null}
      </form>
      {!result.ok ? <p role="alert" className="pbc-alert pbc-alert--danger">{result.error}</p> : <>
        <QuoteTrashList key={`${query}:${page}`} items={result.data.items} />
        {result.data.items.length === 0 ? <div className="pbc-empty">
          {query.trim() ? 'No deleted quotes match your search.' : page > 1 ? 'No more deleted quotes on this page.' : 'Trash is empty.'}
        </div> : null}
        <nav aria-label="Trash pages" className="mt-5 flex items-center justify-between gap-3">
          <div>{page > 1 ? <Link href={href(page - 1)} className="pbc-btn pbc-btn--ghost">Previous</Link> : null}</div>
          <span className="text-sm text-[var(--muted)]">Page {page}</span>
          <div>{result.data.hasNextPage ? <Link href={href(page + 1)} className="pbc-btn pbc-btn--ghost">Next</Link> : null}</div>
        </nav>
      </>}
    </div>
  </main>
}
