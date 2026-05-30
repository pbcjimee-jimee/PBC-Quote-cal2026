import Decimal from 'decimal.js'

interface OptionTotalsSummaryProps {
  options: Array<{
    id: string
    title: string
    subtotal: Decimal
    finalTotal?: Decimal
    interiorSubtotal?: Decimal
    exteriorSubtotal?: Decimal
  }>
}

export function OptionTotalsSummary({ options }: OptionTotalsSummaryProps) {
  if (options.length === 0) return null

  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Optional Add-ons</h2>
        <span className="text-xs text-gray-500">Ex GST, not included in main total</span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {options.map((option, index) => (
          <div key={option.id} className="flex justify-between gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
            <span className="min-w-0 text-gray-700">
              <span className="block truncate">{option.title.trim() || `Option ${index + 1}`}</span>
              {option.interiorSubtotal || option.exteriorSubtotal ? (
                <span className="mt-1 block text-xs text-gray-500">
                  Interior ${option.interiorSubtotal?.toFixed(2) ?? '0.00'} / Exterior ${option.exteriorSubtotal?.toFixed(2) ?? '0.00'}
                </span>
              ) : null}
            </span>
            <span className="font-mono font-semibold text-gray-900">${option.subtotal.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
