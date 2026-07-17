function Block({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-[var(--border-soft)] ${className}`} />
}

export default function QuoteDetailLoading() {
  return (
    <main aria-busy="true">
      <header className="pbc-topbar">
        <Block className="h-5 w-56" />
        <div className="pbc-topbar__right">
          <Block className="h-8 w-24" />
        </div>
      </header>
      <div className="pbc-page animate-pulse">
        <span className="sr-only">Loading...</span>
        <div className="pbc-pagehead pbc-pagehead--detail">
          <div className="min-w-0">
            <Block className="h-4 w-32" />
            <Block className="mt-3 h-9 w-72" />
            <Block className="mt-3 h-4 w-56" />
          </div>
          <div className="pbc-detailtags">
            <Block className="h-10 w-20" />
            <Block className="h-10 w-28" />
            <Block className="h-9 w-20" />
          </div>
        </div>
        <div className="pbc-dgrid">
          <div className="pbc-dlead pbc-dspan">
            <div className="pbc-card pbc-card--pad">
              <Block className="h-5 w-32" />
              <Block className="mt-5 h-4 w-full" />
              <Block className="mt-3 h-4 w-full" />
              <Block className="mt-3 h-4 w-3/4" />
              <Block className="mt-6 h-10 w-full" />
            </div>
          </div>
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-40" />
            <Block className="mt-5 h-12 w-full" />
            <Block className="mt-3 h-12 w-full" />
          </div>
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-36" />
            <Block className="mt-5 h-12 w-full" />
            <Block className="mt-3 h-12 w-full" />
          </div>
        </div>
      </div>
    </main>
  )
}
