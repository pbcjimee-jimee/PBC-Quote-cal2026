function Block({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-[var(--border-soft)] ${className}`} />
}

export default function SettingsLoading() {
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
          <Block className="h-9 w-56" />
          <Block className="mt-3 h-4 w-full max-w-2xl" />
        </div>
        <div className="pbc-card pbc-card--pad">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Block className="h-10 w-32" key={index} />
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Block className="h-20 w-full" />
            <Block className="h-20 w-full" />
            <Block className="h-20 w-full" />
            <Block className="h-20 w-full" />
          </div>
          <Block className="mt-6 h-80 w-full" />
        </div>
      </div>
    </main>
  )
}
