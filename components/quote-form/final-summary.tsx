import Decimal from 'decimal.js'

interface FinalSummaryProps {
  labourTotal: Decimal
  materialTotal: Decimal
  subtotal: Decimal
  finalTotal: Decimal
}

export function FinalSummary({ labourTotal, materialTotal, subtotal, finalTotal }: FinalSummaryProps) {
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Labour total</span>
          <span className="font-mono text-gray-900">${labourTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Material total</span>
          <span className="font-mono text-gray-900">${materialTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-mono font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-gray-200 pt-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">Final</span>
        <span className="font-mono text-2xl font-bold tabular-nums text-gray-900">${finalTotal.toFixed(2)}</span>
      </div>
    </section>
  )
}
