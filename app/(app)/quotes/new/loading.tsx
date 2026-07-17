function Block({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-[var(--border-soft)] ${className}`} />
}

export default function QuoteFormLoading() {
  return (
    <main aria-busy="true">
      <header className="pbc-topbar">
        <Block className="h-5 w-44" />
        <div className="pbc-topbar__right">
          <Block className="h-10 w-28" />
          <Block className="h-10 w-28" />
        </div>
      </header>
      <div className="pbc-page animate-pulse">
        <span className="sr-only">Loading...</span>
        <div className="pbc-pagehead">
          <Block className="h-9 w-64" />
          <Block className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="pbc-grid">
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-40" />
            <Block className="mt-5 h-11 w-full" />
            <Block className="mt-3 h-11 w-full" />
            <Block className="mt-3 h-11 w-2/3" />
          </div>
          <div className="pbc-card pbc-card--pad">
            <Block className="h-5 w-36" />
            <Block className="mt-5 h-11 w-full" />
            <Block className="mt-3 h-11 w-full" />
            <Block className="mt-3 h-11 w-2/3" />
          </div>
        </div>
        <div className="pbc-card pbc-card--pad mt-4">
          <Block className="h-5 w-44" />
          <Block className="mt-5 h-12 w-full" />
          <Block className="mt-3 h-12 w-full" />
          <Block className="mt-3 h-12 w-full" />
        </div>
        <div className="pbc-card pbc-card--pad mt-4">
          <Block className="h-5 w-32" />
          <Block className="mt-5 h-24 w-full" />
        </div>
      </div>
    </main>
  )
}
