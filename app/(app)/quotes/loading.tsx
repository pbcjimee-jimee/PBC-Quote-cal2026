function Block({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-[var(--border-soft)] ${className}`} />
}

export default function QuotesLoading() {
  return (
    <main aria-busy="true">
      <header className="pbc-topbar">
        <Block className="h-5 w-44" />
        <div className="pbc-topbar__right">
          <Block className="h-10 w-32" />
        </div>
      </header>
      <div className="pbc-page animate-pulse">
        <span className="sr-only">Loading...</span>
        <div className="pbc-pagehead">
          <Block className="h-9 w-52" />
          <Block className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="pbc-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="pbc-stat" key={index}>
              <Block className="h-3 w-24" />
              <Block className="h-8 w-20" />
              <Block className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="pbc-grid">
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-44" />
            <Block className="mt-5 h-12 w-full" />
            <Block className="mt-3 h-12 w-full" />
            <Block className="mt-3 h-12 w-full" />
          </div>
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-32" />
            <Block className="mt-5 h-24 w-full" />
            <Block className="mt-4 h-10 w-full" />
          </div>
        </div>
      </div>
    </main>
  )
}
