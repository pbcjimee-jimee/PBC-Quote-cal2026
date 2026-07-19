export default function InvoiceProfileSettingsLoading() {
  return (
    <main className="pbc-page" aria-busy="true" aria-live="polite">
      <div className="pbc-pagehead">
        <div className="pbc-skeleton h-8 w-48" />
        <div className="pbc-skeleton mt-3 h-5 w-full max-w-xl" />
      </div>
      <div className="pbc-card pbc-card--pad">
        <div className="pbc-skeleton h-6 w-40" />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className="pbc-skeleton h-12" />)}
        </div>
      </div>
      <span className="sr-only">Loading Invoice Profile Settings</span>
    </main>
  )
}
