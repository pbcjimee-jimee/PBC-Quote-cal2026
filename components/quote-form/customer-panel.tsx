interface CustomerPanelProps {
  customerName: string
  customerAddress: string
  jobberQuoteId: string
  workType: string
  areaSqft: string
  onCustomerNameChange: (value: string) => void
  onCustomerAddressChange: (value: string) => void
  onJobberQuoteIdChange: (value: string) => void
  onFetchJobberQuote: () => void
  onWorkTypeChange: (value: string) => void
  onAreaSqftChange: (value: string) => void
  isFetchingJobberQuote: boolean
  jobberFetchError: string | null
}

export function CustomerPanel(props: CustomerPanelProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Customer Info</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Customer
          <input value={props.customerName} onChange={(event) => props.onCustomerNameChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Jobber Quote ID
          <div className="flex gap-2">
            <input value={props.jobberQuoteId} onChange={(event) => props.onJobberQuoteIdChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <button type="button" onClick={props.onFetchJobberQuote} disabled={props.isFetchingJobberQuote} className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {props.isFetchingJobberQuote ? 'Loading' : 'Fetch'}
            </button>
          </div>
          {props.jobberFetchError ? <span className="block text-xs font-normal text-red-600">{props.jobberFetchError}</span> : null}
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium text-gray-700">
        Address
        <input value={props.customerAddress} onChange={(event) => props.onCustomerAddressChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Work Type
          <input value={props.workType} onChange={(event) => props.onWorkTypeChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Interior, exterior..." />
        </label>
        <label className="space-y-1 text-sm font-medium text-gray-700">
          Area Sqft
          <input value={props.areaSqft} onChange={(event) => props.onAreaSqftChange(event.target.value)} inputMode="numeric" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>
    </section>
  )
}
