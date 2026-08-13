function Block({ className = '' }: { className?: string }) {
  return <span className={`pbc-loadingbar ${className}`} />
}

export default function InventoryLoading() {
  return (
    <main role="status" aria-label="Loading Inventory rows/filters" aria-busy="true">
      <header className="pbc-topbar" aria-hidden="true"><Block className="w-40" /><div className="pbc-topbar__right"><Block className="h-10 w-36" /></div></header>
      <div className="pbc-page" aria-hidden="true">
        <div className="pbc-pagehead"><Block className="h-8 w-36" /><Block className="mt-3 w-full max-w-xl" /></div>
        <section className="pbc-card pbc-card--pad">
          <div className="flex flex-wrap gap-3"><Block className="h-11 w-full max-w-sm" /><Block className="h-11 w-40" /><Block className="h-11 w-32" /></div>
          <div className="pbc-tablewrap mt-5"><div className="pbc-table"><Block className="h-11 w-full" />{[0, 1, 2, 3, 4].map((index) => <Block className="mt-2 h-14 w-full" key={index} />)}</div></div>
        </section>
      </div>
    </main>
  )
}
