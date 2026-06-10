import type { MaterialItem } from './types'
import type { AreaRecord } from '@/lib/areas/types'
import { DecimalInput } from './decimal-input'

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
    <div className="pbc-softpanel pbc-materialrow">
      <div className="pbc-materialrow__head">
        <input
          type="text"
          value={item.name}
          onChange={(event) => onChange({ ...item, name: event.target.value })}
          aria-label="Material name"
          className="pbc-input pbc-materialrow__name min-w-0 flex-1 font-bold"
        />
        <button
          type="button"
          onClick={onRemove}
          className="pbc-iconbtn pbc-iconbtn--danger shrink-0"
          aria-label={`Remove ${item.name}`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
            <path d="M7.25 8.25v5.5M10 8.25v5.5M12.75 8.25v5.5M4.5 5.5h11M8.25 3.5h3.5M6 5.5l.5 10.25c.04.7.62 1.25 1.32 1.25h4.36c.7 0 1.28-.55 1.32-1.25L14 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="pbc-materialrow__fields pbc-materialrow__fields--pricing">
        <DecimalInput
          label="Qty"
          value={item.quantity}
          onValueChange={(value) => onChange({ ...item, quantity: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
        <DecimalInput
          label="RRP"
          value={item.marketPrice}
          onValueChange={(value) => onChange({ ...item, marketPrice: value, actualPrice: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0 font-semibold"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
        <label className="pbc-field pbc-materialrow__area min-w-0">
          <span className="pbc-field__label">Area</span>
          <select
            value={item.areaId ?? ''}
            onChange={(event) => changeArea(event.target.value)}
            className="pbc-input min-w-0"
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
        <DecimalInput
          label="Working Days"
          value={item.workingDays}
          onValueChange={(value) => onChange({ ...item, workingDays: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
        <DecimalInput
          label="Labour / Day"
          value={item.labourPerDay}
          onValueChange={(value) => onChange({ ...item, labourPerDay: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
      </div>
    </div>
  )
}
