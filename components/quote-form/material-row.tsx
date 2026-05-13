import type { MaterialItem } from './types'
import type { AreaRecord } from '@/lib/areas/types'

interface MaterialRowProps {
  item: MaterialItem
  areas: AreaRecord[]
  onChange: (item: MaterialItem) => void
  onRemove: () => void
}

export function MaterialRow({ item, areas, onChange, onRemove }: MaterialRowProps) {
  function changeArea(areaId: string) {
    const area = areas.find((candidate) => candidate.id === areaId)
    onChange({
      ...item,
      areaId: area?.id,
      areaName: area?.name,
      areaScope: area?.scope,
    })
  }

  return (
    <div className="border-t border-gray-100 py-3">
      <div className="space-y-1">
        <div className="truncate text-sm font-medium text-gray-900">{item.name}</div>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-[3.75rem_4.75rem_1.3fr_4.75rem_4.75rem_2.75rem] md:items-end">
        <label className="space-y-1 text-xs font-medium text-gray-600">
          Qty
          <input value={item.quantity} onChange={(event) => onChange({ ...item, quantity: event.target.value })} inputMode="decimal" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-600">
          RRP
          <input
            value={item.marketPrice}
            onChange={(event) => onChange({ ...item, marketPrice: event.target.value, actualPrice: event.target.value })}
            inputMode="decimal"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-600">
          Area
          <select
            value={item.areaId ?? ''}
            onChange={(event) => changeArea(event.target.value)}
            className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            title={item.areaName ?? (areas.length === 0 ? 'Add in Settings' : 'Select area')}
          >
            <option value="">{areas.length === 0 ? 'Add in Settings' : 'Select area'}</option>
            {areas.map((area) => (
              <option
                key={area.id}
                value={area.id}
                title={`${area.scope === 'interior' ? 'Interior' : 'Exterior'} - ${area.name}`}
              >
                {area.scope === 'interior' ? 'Interior' : 'Exterior'} - {area.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-600">
          Working Days
          <input value={item.workingDays} onChange={(event) => onChange({ ...item, workingDays: event.target.value })} inputMode="decimal" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-600">
          Labour / Day
          <input value={item.labourPerDay} onChange={(event) => onChange({ ...item, labourPerDay: event.target.value })} inputMode="decimal" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
        </label>
        <label className="space-y-1 text-xs font-medium text-gray-600">
          <span>Action</span>
          <button
            type="button"
            onClick={onRemove}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
            aria-label={`Remove ${item.name}`}
          >
            X
          </button>
        </label>
      </div>
    </div>
  )
}
