function Block({ className = '' }: { className?: string }) {
  return <span className={`pbc-loadingbar ${className}`} />
}

export default function QuoteEditLoading() {
  return (
    <main role="status" aria-label="Loading quote edit workspace" aria-busy="true">
      <header className="pbc-topbar" aria-hidden="true"><Block className="w-56" /><div className="pbc-topbar__right"><Block className="h-10 w-24" /><Block className="h-10 w-32" /></div></header>
      <div className="pbc-page" aria-hidden="true">
        <div className="pbc-pagehead"><Block className="h-8 w-56" /><Block className="mt-3 w-full max-w-2xl" /></div>
        <div className="pbc-editgrid">
          <div className="pbc-workspace">
            {[0, 1, 2].map((index) => <section className="pbc-card pbc-card--pad" key={index}><Block className="h-5 w-36" /><Block className="mt-5 h-12 w-full" /><Block className="mt-3 h-12 w-full" /></section>)}
          </div>
          <aside className="pbc-card pbc-card--pad"><Block className="h-5 w-36" /><Block className="mt-5 h-32 w-full" /><Block className="mt-4 h-12 w-full" /></aside>
        </div>
      </div>
    </main>
  )
}
