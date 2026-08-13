function Block({ className = '' }: { className?: string }) {
  return <span className={`pbc-loadingbar ${className}`} />
}

export default function JobDetailLoading() {
  return (
    <main role="status" aria-label="Loading Job financial detail" aria-busy="true">
      <header className="pbc-topbar" aria-hidden="true"><Block className="w-36" /><div className="pbc-topbar__right"><Block className="h-10 w-32" /></div></header>
      <div className="pbc-page" aria-hidden="true">
        <div className="pbc-pagehead"><Block className="h-8 w-52" /><Block className="mt-3 w-full max-w-lg" /></div>
        <section className="pbc-card pbc-card--pad">
          <Block className="h-5 w-32" />
          <div className="mt-4 space-y-2">
            {['revenue', 'labour', 'estimated-profit', 'expenses', 'profit'].map((tone) => (
              <div className={`pbc-jobfinancial__row pbc-jobfinancial__row--${tone}`} key={tone}><Block className="w-28" /><Block className="w-24" /></div>
            ))}
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]"><Block className="pbc-jobfinancial__bar h-full w-2/3 rounded-full" /></div>
        </section>
        <section className="pbc-card pbc-card--pad mt-5"><Block className="h-5 w-24" /><div className="pbc-tablewrap mt-4"><div className="pbc-table"><Block className="h-10 w-full" />{[0, 1, 2].map((index) => <Block className="mt-2 h-12 w-full" key={index} />)}</div></div></section>
      </div>
    </main>
  )
}
