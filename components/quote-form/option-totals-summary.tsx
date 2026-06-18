import Decimal from 'decimal.js'

interface OptionTotalsSummaryProps {
  options: Array<{
    id: string
    title: string
    subtotal: Decimal
    finalTotal?: Decimal
    interiorSubtotal?: Decimal
    exteriorSubtotal?: Decimal
    roofSubtotal?: Decimal
  }>
}

export function OptionTotalsSummary({ options }: OptionTotalsSummaryProps) {
  if (options.length === 0) return null

  return (
    <section className="mt-5 border-t border-[var(--border-soft)] pt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--muted)]">Optional Add-ons</h2>
        <span className="text-xs text-[var(--muted-2)]">Ex GST, not included in main total</span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {options.map((option, index) => (
          <div key={option.id} className="flex justify-between gap-3 rounded-[10px] border border-[var(--primary-soft)] bg-[var(--primary-soft)] px-3 py-2">
            <span className="min-w-0 text-[var(--foreground)]">
              <span className="block truncate font-semibold">{option.title.trim() || `Option ${index + 1}`}</span>
              {option.interiorSubtotal || option.exteriorSubtotal || option.roofSubtotal ? (
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  Interior ${option.interiorSubtotal?.toFixed(2) ?? '0.00'} / Exterior ${option.exteriorSubtotal?.toFixed(2) ?? '0.00'} / Roof ${option.roofSubtotal?.toFixed(2) ?? '0.00'}
                </span>
              ) : null}
            </span>
            <span className="mono font-bold text-[var(--foreground)]">${option.subtotal.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
