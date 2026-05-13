import type { MaterialItem } from './types'

interface MaterialRowProps {
  item: MaterialItem
  onChange: (item: MaterialItem) => void
  onRemove: () => void
}

export function MaterialRow({ item, onChange, onRemove }: MaterialRowProps) {
  return (
    <div className="grid gap-3 border-t border-gray-100 py-3 sm:grid-cols-[1fr_80px_112px_40px] sm:items-end">
      <div>
        <div className="text-sm font-medium text-gray-900">{item.name}</div>
        <div className="text-xs text-gray-500">
          {item.manufacturer ?? 'Custom'} {item.productLine ?? item.type ? `- ${item.productLine ?? item.type}` : ''} {item.base ? `- ${item.base}` : ''} {item.sheen ? `- ${item.sheen}` : ''} {item.unit ? `- ${item.unit}` : ''}
        </div>
      </div>
      <label className="space-y-1 text-xs font-medium text-gray-600">
        Qty
        <input value={item.quantity} onChange={(event) => onChange({ ...item, quantity: event.target.value })} inputMode="decimal" className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm" />
      </label>
      <label className="space-y-1 text-xs font-medium text-gray-600">
        RRP
        <input
          value={item.marketPrice}
          onChange={(event) => onChange({ ...item, marketPrice: event.target.value, actualPrice: event.target.value })}
          inputMode="decimal"
          className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
        />
      </label>
      <button type="button" onClick={onRemove} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100" aria-label={`Remove ${item.name}`}>
        X
      </button>
    </div>
  )
}
