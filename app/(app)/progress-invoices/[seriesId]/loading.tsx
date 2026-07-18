export default function ProgressInvoiceSeriesLoading() {
  return (
    <div className="pbc-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading Progress Invoice series</span>
      <div className="pbc-progress-series-detail" aria-hidden="true">
        <div className="pbc-skeleton" style={{ height: 92 }} />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="pbc-card pbc-card--pad"><div className="pbc-skeleton" style={{ height: 128 }} /></div>
        ))}
      </div>
    </div>
  )
}
