function Block({ className = '' }: { className?: string }) {
  return <span className={`pbc-loadingbar ${className}`} />
}

export default function NewQuoteLoading() {
  return (
    <main role="status" aria-label="Loading New Quote workspace" aria-busy="true">
      <header className="pbc-topbar" aria-hidden="true"><Block className="w-44" /><div className="pbc-topbar__right"><span className="pbc-loadingbox" /><Block className="h-10 w-32" /></div></header>
      <div className="pbc-page" aria-hidden="true">
        <div className="pbc-pagehead"><Block className="h-8 w-48" /><Block className="mt-3 w-full max-w-xl" /></div>
        <div className="pbc-editgrid">
          <div className="pbc-workspace">
            {[0, 1, 2].map((index) => <section className="pbc-card pbc-card--pad" key={index}><Block className="h-5 w-40" /><Block className="mt-5 h-12 w-full" /><Block className="mt-3 h-12 w-full" /></section>)}
          </div>
          <aside className="pbc-card pbc-card--pad"><Block className="h-5 w-32" /><Block className="mt-5 h-28 w-full" /><Block className="mt-4 h-12 w-full" /></aside>
        </div>
      </div>
    </main>
  )
}
