import { decimalFromInput } from '@/lib/quote-labour'
import { AREA_SCOPE_LABELS } from '@/lib/areas/constants'
import type { MaterialItem } from './types'

export function MaterialSummary({ item, onEdit }: { item: MaterialItem; onEdit: () => void }) {
  const amount = decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))
  return (
    <div className="pbc-material-summary">
      <div className="pbc-material-summary__copy">
        <b>{item.name || 'Unnamed material'}</b>
        <span>{item.areaScope ? AREA_SCOPE_LABELS[item.areaScope] : 'No area'}{item.areaName ? ` · ${item.areaName}` : ''}</span>
        <span className="mono">{item.quantity || '0'} × ${decimalFromInput(item.marketPrice).toFixed(2)} · <strong>${amount.toFixed(2)}</strong></span>
        <span>{item.workingDays || '0'} working days · {item.labourPerDay || '0'} labour / day</span>
        {item.memo ? <span className="pbc-material-summary__memo">Memo: {item.memo}</span> : null}
      </div>
      <button
        type="button"
        className="pbc-btn pbc-btn--ghost pbc-btn--sm"
        aria-label={`Edit ${item.name || 'material'}`}
        data-material-summary-id={item.id}
        onClick={onEdit}
      >
        Edit
      </button>
    </div>
  )
}
