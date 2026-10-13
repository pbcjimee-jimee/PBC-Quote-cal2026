import type { MaterialItem } from './types'
import type { TimberRole } from '@/lib/paint-comparison-types'

export function TimberMaterialControl({ item, onChange }: { item: MaterialItem; onChange: (role: TimberRole | 'restore') => void }) {
  const marked = item.timberRole === 'shared' || item.timberRole === 'finish'
  return <div className="pbc-timber-control">
    <label className="pbc-checkfield"><input className="pbc-checkbox" type="checkbox" checked={marked} onChange={event => onChange(event.target.checked ? 'restore' : 'none')} aria-label={`Timber only · ${item.name}`} />Timber only</label>
    {marked ? <label className="pbc-field"><span className="sr-only">Timber role · {item.name}</span><select className="pbc-input" value={item.timberRole} onChange={event => onChange(event.target.value === 'finish' ? 'finish' : 'shared')} aria-label={`Timber role · ${item.name}`}><option value="shared">Shared work / material</option><option value="finish">Enamel finish</option></select></label> : null}
    {marked ? <span className="pbc-field__hint">Included in Main and both paint scenarios</span> : null}
  </div>
}
