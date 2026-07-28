function Block({ className = '' }: { className?: string }) {
  return <div className={`pbc-skeleton ${className}`} />
}

export default function QuoteEditLoading() {
  return (
    <main aria-busy="true">
      <header className="pbc-topbar">
        <Block className="h-5 w-44" />
        <div className="pbc-topbar__right">
          <Block className="h-10 w-24" />
          <Block className="h-10 w-32" />
          <Block className="h-10 w-44" />
        </div>
      </header>
      <div className="pbc-page">
        <span className="sr-only">Loading quote editor...</span>
        <div className="pbc-pagehead">
          <Block className="h-9 w-48" />
          <Block className="mt-3 h-4 w-full max-w-md" />
        </div>
        <div className="pbc-editgrid">
          <div className="pbc-workspace">
            <div className="pbc-card pbc-card--pad">
              <Block className="h-5 w-36" />
              <Block className="mt-4 h-10 w-full" />
              <Block className="mt-3 h-10 w-full" />
            </div>
            <div className="pbc-card pbc-card--pad">
              <Block className="h-5 w-44" />
              {Array.from({ length: 4 }).map((_, index) => (
                <Block key={index} className="mt-3 h-16 w-full" />
              ))}
            </div>
          </div>
          <div className="pbc-calcstack">
            <div className="pbc-card pbc-card--pad">
              <Block className="h-5 w-40" />
              {Array.from({ length: 5 }).map((_, index) => (
                <Block key={index} className="mt-3 h-12 w-full" />
              ))}
            </div>
            <div className="pbc-card pbc-card--pad">
              <Block className="h-24 w-full" />
              <Block className="mt-4 h-5 w-full" />
              <Block className="mt-3 h-5 w-full" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
