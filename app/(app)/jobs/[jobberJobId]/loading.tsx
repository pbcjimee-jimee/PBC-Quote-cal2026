function Block({ className = '' }: { className?: string }) {
  return <span className={`pbc-loadingbar ${className}`} />
}

export default function JobDetailLoading() {
  return (
    <main role="status" aria-label="Loading Job financial detail" aria-busy="true">
      <header className="pbc-topbar" aria-hidden="true"><Block className="w-36" /><div className="pbc-topbar__right"><Block className="h-10 w-32" /></div></header>
      <div className="pbc-page" aria-hidden="true">
        <div className="pbc-pagehead"><Block className="h-8 w-52" /><Block className="mt-3 w-full max-w-lg" /></div>
        <div className="pbc-stats">
          {[0, 1, 2, 3].map((index) => <div className="pbc-stat" key={index}><Block className="w-24" /><Block className="mt-3 h-7 w-28" /></div>)}
        </div>
        <section className="pbc-card pbc-card--pad mt-5"><Block className="h-5 w-40" /><div className="pbc-tablewrap mt-4"><div className="pbc-table"><Block className="h-10 w-full" />{[0, 1, 2].map((index) => <Block className="mt-2 h-12 w-full" key={index} />)}</div></div></section>
      </div>
    </main>
  )
}
