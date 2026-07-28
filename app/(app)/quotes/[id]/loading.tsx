function Block({ className = '' }: { className?: string }) {
  return <div className={`pbc-skeleton ${className}`} />
}

export default function QuoteDetailLoading() {
  return (
    <main aria-busy="true">
      <header className="pbc-topbar">
        <Block className="h-5 w-44" />
        <div className="pbc-topbar__right">
          <Block className="h-10 w-28" />
        </div>
      </header>
      <div className="pbc-page">
        <span className="sr-only">Loading quote...</span>
        <div className="pbc-pagehead">
          <Block className="h-4 w-24" />
          <Block className="mt-3 h-9 w-64" />
          <Block className="mt-3 h-4 w-full max-w-md" />
        </div>
        <div className="pbc-dgrid">
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-32" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Block key={index} className="mt-4 h-5 w-full" />
            ))}
          </div>
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-40" />
            <Block className="mt-4 h-24 w-full" />
            <Block className="mt-3 h-24 w-full" />
          </div>
          <div className="pbc-card pbc-card--pad pbc-dspan">
            <Block className="h-24 w-full" />
            <Block className="mt-4 h-5 w-full" />
            <Block className="mt-3 h-5 w-full" />
          </div>
        </div>
      </div>
    </main>
  )
}
