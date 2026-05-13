import Decimal from 'decimal.js'
import { MaterialRow } from './material-row'
import { PaintSearch } from './paint-search'
import type { MaterialItem } from './types'

interface MaterialsPanelProps {
  materials: MaterialItem[]
  onAdd: (item: MaterialItem) => void
  onChange: (item: MaterialItem) => void
  onRemove: (id: string) => void
}

function lineTotal(price: string, quantity: string): Decimal {
  return new Decimal(price || 0).mul(new Decimal(quantity || 0))
}

export function MaterialsPanel({ materials, onAdd, onChange, onRemove }: MaterialsPanelProps) {
  const materialTotal = materials.reduce((total, item) => total.add(lineTotal(item.marketPrice, item.quantity)), new Decimal(0))

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Materials</h2>
      </div>
      <PaintSearch onAdd={onAdd} />
      {materials.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">No materials added - formula uses $0 material cost.</p>
      ) : (
        <div>
          {materials.map((item) => (
            <MaterialRow key={item.id} item={item} onChange={onChange} onRemove={() => onRemove(item.id)} />
          ))}
        </div>
      )}
      <div className="border-t border-gray-200 pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Material total</span>
          <span className="font-mono text-gray-900">${materialTotal.toFixed(2)}</span>
        </div>
      </div>
    </section>
  )
}
