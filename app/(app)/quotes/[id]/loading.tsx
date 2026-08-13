function Block({ className = '' }: { className?: string }) {
  return <span className={`pbc-loadingbar ${className}`} />
}

export default function QuoteDetailLoading() {
  return (
    <main role="status" aria-label="Loading quote detail" aria-busy="true">
      <header className="pbc-topbar" aria-hidden="true"><Block className="w-52" /><div className="pbc-topbar__right"><Block className="h-10 w-28" /><Block className="h-10 w-24" /></div></header>
      <div className="pbc-page" aria-hidden="true">
        <div className="pbc-pagehead pbc-pagehead--detail"><div><Block className="h-8 w-64" /><Block className="mt-3 w-48" /></div><Block className="h-8 w-24" /></div>
        <div className="pbc-dgrid">
          <section className="pbc-card pbc-card--pad"><Block className="h-5 w-32" /><Block className="mt-5 h-16 w-full" /><Block className="mt-3 h-16 w-full" /></section>
          <section className="pbc-card pbc-card--pad"><Block className="h-5 w-28" /><Block className="mt-5 h-36 w-full" /></section>
          <section className="pbc-card pbc-card--pad pbc-dspan"><Block className="h-5 w-40" /><Block className="mt-5 h-12 w-full" /><Block className="mt-3 h-12 w-full" /></section>
        </div>
      </div>
    </main>
  )
}
