import { useId, useState } from 'react'
import type { PaintComparison, PaintComparisonAlternative } from '@/lib/paint-comparison-types'
import type { PricingSettings } from '@/lib/calculator'
import type { AreaFormulaSelections, FormulaNumber, JobberQuoteLineItemDraft, MaterialItem } from './types'
import { calculatePaintComparison, getMaterialLogicalKey } from '@/lib/quote-paint-comparison'
import { MaterialNameSearch } from './material-name-search'
import { DecimalInput } from './decimal-input'
import { getQuoteErrorKey } from './quote-mobile-state'
export interface PaintComparisonPanelProps {
  materials: MaterialItem[]; comparison: PaintComparison; settings: PricingSettings; selectedMin: FormulaNumber; selectedMax: FormulaNumber; areaFormulaSelections?: AreaFormulaSelections; lines: JobberQuoteLineItemDraft[];
  onChange: (comparison: PaintComparison) => void; onApply: (amount: string) => void; onRemoveOptional: () => void; onRemoveComparison?: () => void; onEditMain: (item: MaterialItem) => void; onViewFormulas: () => void; onExcludeMaterial: (item: MaterialItem) => void; onReturnToInterior: (item: MaterialItem) => void;
}

const FIELDS = [{ key: 'quantity', label: 'Quantity' }, { key: 'workingDays', label: 'Working days' }, { key: 'labourPerDay', label: 'Labour / day (people)' }] as const

function AquaFinishEditor({ item, alternative, onChange, onEditMain }: { item: MaterialItem; alternative: PaintComparisonAlternative; onChange: (alternative: PaintComparisonAlternative) => void; onEditMain: () => void }) {
  const [query, setQuery] = useState(alternative.product?.name ?? '')
  const [expanded, setExpanded] = useState(true)
  const contentId = useId()
  const sourceChanged = alternative.acknowledgedSourceProductId !== (item.productId ?? null)
  return <article className="pbc-softpanel pbc-paint-finish" aria-label={`Enamel finish · ${item.name} · ${item.areaName ?? 'Interior'}`} tabIndex={-1} data-error-key={getQuoteErrorKey({ section: 'work', entityId: item.id, field: 'comparison' })}>
    <div className="pbc-paint-finish__header">
      <div className="min-w-0">
        <h4 className="pbc-paneltitle">Enamel finish · {item.areaName ?? 'Interior'}</h4>
        <p className="pbc-field__hint">{item.name} → {alternative.product?.name ?? 'Aqua product not selected'}</p>
      </div>
      <button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" aria-expanded={expanded} aria-controls={contentId} onClick={event => { event.currentTarget.focus(); setExpanded(current => !current) }}>{expanded ? 'Collapse' : 'Expand'}</button>
    </div>
    <div id={contentId} className="pbc-paint-finish__body" hidden={!expanded}>
      <div role="table" aria-label={`Paint comparison · ${item.name}`} className="pbc-paint-compare-table">
        <div role="row" className="pbc-paint-compare-head">
          <div role="columnheader" className="pbc-paint-compare-label">Item</div>
          <div role="columnheader"><b>Super Enamel</b><span>Base / Main</span></div>
          <div role="columnheader"><b>Aquanamel</b><span>Alternative</span></div>
        </div>
        <div role="row" className="pbc-paint-compare-row">
          <div role="rowheader" className="pbc-paint-compare-label">Product</div>
          <div role="cell" className="pbc-paint-compare-cell">
            <div className="pbc-paint-readonly"><b>{item.name}</b><span className="pbc-field__hint">RRP ${item.marketPrice} · Main</span></div>
          </div>
          <div role="cell" className="pbc-paint-compare-cell" aria-label="Aquanamel product selection">
            <MaterialNameSearch value={query} onChange={setQuery} onSelect={product => {
              const price = product.rrpPrice ?? product.marketPrice ?? product.price ?? product.actualPrice
              setQuery(product.name)
              onChange({ ...alternative, acknowledgedSourceProductId: item.productId ?? null, product: { productId: product.id, name: product.name, marketPrice: price, actualPrice: price } })
            }} errorKey={getQuoteErrorKey({ section: 'work', entityId: item.id, field: 'comparison' })} />
            {alternative.product ? <p className="pbc-field__hint">RRP ${alternative.product.marketPrice}</p> : <p className="pbc-field__hint">Aqua product required</p>}
          </div>
        </div>
        {FIELDS.map(field => <div role="row" className="pbc-paint-compare-row" key={field.key}>
          <div role="rowheader" className="pbc-paint-compare-label">{field.label}</div>
          <div role="cell" className="pbc-paint-compare-cell"><span className="pbc-paint-readonly mono">{item[field.key]}</span></div>
          <div role="cell" className="pbc-paint-compare-cell">
            <div className="pbc-paint-field">
              <DecimalInput label="" aria-label={`Aqua ${field.label} · ${item.name}`} value={alternative[field.key].mode === 'inherit' ? item[field.key] : alternative[field.key].value} readOnly={alternative[field.key].mode === 'inherit'} onValueChange={value => onChange({ ...alternative, [field.key]: { mode: 'override', value } })} labelClassName="pbc-field" inputClassName="pbc-input" />
              <label className="pbc-field"><span className="sr-only">{field.label} input mode · {item.name}</span><select aria-label={`${field.label} input mode · ${item.name}`} className="pbc-input" value={alternative[field.key].mode} onChange={event => onChange({ ...alternative, [field.key]: { ...alternative[field.key], mode: event.target.value === 'override' ? 'override' : 'inherit' } })}><option value="inherit">Linked</option><option value="override">Separate</option></select></label>
            </div>
          </div>
        </div>)}
      </div>
      <div className="pbc-paint-finish__actions">
        <button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={onEditMain}>Edit in Main</button>
        <button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={() => onChange({ ...alternative, quantity: { ...alternative.quantity, mode: 'inherit' }, workingDays: { ...alternative.workingDays, mode: 'inherit' }, labourPerDay: { ...alternative.labourPerDay, mode: 'inherit' } })}>Restore Main linked fields</button>
      </div>
      <p className="pbc-field__hint">Linked uses Main values; Separate allows editing. Main values are read-only here. Both paints share the Main order and Area.</p>
    </div>
    {sourceChanged ? <div className="pbc-alert pbc-alert--warning" role="status">Main product changed. Confirm the Aqua product before applying or saving an applied Optional.<button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={() => onChange({ ...alternative, acknowledgedSourceProductId: item.productId ?? null })}>Keep selected Aqua product</button></div> : null}
  </article>
}

export function PaintComparisonPanel(props: PaintComparisonPanelProps) {
  const { materials, comparison, lines, onChange, onApply, onRemoveOptional, onRemoveComparison, onEditMain, onViewFormulas, onExcludeMaterial, onReturnToInterior } = props
  const calculation = calculatePaintComparison(props)
  const [detailsOpen, setDetailsOpen] = useState(calculation.status !== 'ready')
  const marked = materials.filter(item => item.timberRole === 'shared' || item.timberRole === 'finish')
  const linked = lines.find(line => line.paintComparisonKey === comparison.key)
  const difference = calculation.differenceSubtotal
  const differenceLabel = difference ? difference.isNegative() ? `−$${difference.abs().toFixed(2)}` : difference.isZero() ? '$0.00' : `+$${difference.toFixed(2)}` : 'Not calculated'
  const stateLabel = calculation.status === 'ready' ? linked ? 'Calculated · Optional applied' : 'Calculated · Optional not applied' : calculation.status === 'needs_review' ? 'Main product changed · Review required' : calculation.status === 'invalid' ? 'Fix comparison inputs' : 'Comparison incomplete'
  const canApply = calculation.status === 'ready' && difference !== null && (!difference.isZero() || Boolean(linked))
  return <section id="timber-paint-comparison" className="pbc-card pbc-card--pad pbc-paint-comparison" tabIndex={-1} data-error-key={getQuoteErrorKey({ section: 'work', field: 'comparison' })} aria-label="Timber paint comparison">
    <div className="pbc-panelhead"><div className="pbc-panelhead__copy"><h2 className="pbc-paneltitle">Timber paint comparison</h2><p className="pbc-field__hint">{marked.length} Timber items · {marked.filter(item => item.timberRole === 'finish').length} finishes · Automatically linked from Main Interior</p></div></div>
    <div className="pbc-paint-totals">
      <div className="pbc-ministat"><span>Super Enamel · Base / Main</span><b className="mono">${calculation.superSubtotal.toFixed(2)}</b><span>Full quote · Ex GST</span><small>Same base calculation as Main</small></div>
      <div className="pbc-ministat"><span>Aquanamel · Alternative</span><b className="mono">{calculation.aquaSubtotal ? `$${calculation.aquaSubtotal.toFixed(2)}` : 'Not calculated'}</b><span>Full quote · Ex GST</span><small>Changes Timber finishes and separate inputs only</small></div>
      <div className="pbc-ministat pbc-paint-difference"><span>{difference === null ? 'Price difference' : difference.isNegative() ? 'Discount' : difference.isZero() ? 'No price difference' : 'Additional cost'}</span><b className="mono">{differenceLabel}</b><span>Aqua − Super · Ex GST</span></div>
    </div>
    <p role="status" aria-live="polite" className="pbc-field__hint">{stateLabel}</p>
    {linked && calculation.status !== 'ready' ? <p className="pbc-alert pbc-alert--danger">Applied Optional is stale. Complete the comparison or remove the Optional before Save / Sync.</p> : null}
    {!marked.length ? <p className="pbc-empty">Check Timber only on a Main Interior material to resume this comparison. Saved Aqua inputs are retained.</p> : null}
    {calculation.issues.some(issue => issue.code === 'missing_finish') ? <p className="pbc-alert pbc-alert--warning">Choose Enamel finish for at least one Timber material.</p> : null}
    {calculation.issues.filter(issue => issue.code === 'invalid_number').map((issue, index) => <p className="pbc-alert pbc-alert--danger" key={`${issue.targetLogicalKey}-${issue.field}-${index}`}>{materials.find(item => getMaterialLogicalKey(item) === issue.targetLogicalKey)?.name}: {issue.variant === 'aqua' ? 'Aqua' : 'Main'} {issue.field} needs a nonnegative value with at most two decimal places.</p>)}
    {marked.filter(item => item.areaScope !== 'interior').map(item => <div key={item.id} className="pbc-alert pbc-alert--danger">{item.name} must be in Interior.<button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={() => onReturnToInterior(item)}>Return to Interior</button><button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={() => onExcludeMaterial(item)}>Exclude from Timber comparison</button></div>)}
    <div className="pbc-paint-actions"><button type="button" className="pbc-btn pbc-btn--primary" aria-label="Apply Aquanamel Optional" disabled={!canApply} onClick={() => difference && onApply(difference.toFixed(2))}>{linked ? 'Optional applied · Refresh' : difference === null ? 'Complete comparison to apply' : `Apply ${differenceLabel} to Optional item`}</button>{linked ? <button type="button" className="pbc-btn pbc-btn--danger" onClick={onRemoveOptional}>Remove Optional item</button> : null}<button type="button" className="pbc-btn pbc-btn--ghost" onClick={onViewFormulas}>View formulas</button></div>
    <p className="pbc-field__hint">Same Interior Low / High formulas. Base public price stays manual; this Optional changes only the difference.</p>
    <details className="pbc-paint-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>Timber details · {marked.length} items</summary>
      <h3>Shared in both paints</h3>{marked.filter(item => item.timberRole === 'shared').map(item => <div className="pbc-srow" key={item.id}><span>{item.name} · Main linked</span><button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={() => onEditMain(item)}>Edit in Main</button></div>)}
      {marked.filter(item => item.timberRole === 'finish' && item.areaScope === 'interior').map(item => {
        const alternative = comparison.alternatives.find(entry => entry.targetLogicalKey === getMaterialLogicalKey(item))
        return alternative ? <AquaFinishEditor key={getMaterialLogicalKey(item)} item={item} alternative={alternative} onEditMain={() => onEditMain(item)} onChange={updated => onChange({ ...comparison, alternatives: comparison.alternatives.map(entry => entry.targetLogicalKey === updated.targetLogicalKey ? updated : entry) })} /> : null
      })}
      <div className="pbc-summary__rows"><div className="pbc-srow"><span>Timber subtotal · Super · Ex GST</span><b className="mono">${calculation.timberSuperSubtotal.toFixed(2)}</b></div><div className="pbc-srow"><span>Timber subtotal · Aqua · Ex GST</span><b className="mono">{calculation.timberAquaSubtotal ? `$${calculation.timberAquaSubtotal.toFixed(2)}` : 'Not calculated'}</b></div></div><p className="pbc-field__hint">Timber is already included in each full quote. Full totals determine the Optional difference.</p>
    </details>
    {calculation.excludedUnassignedCount ? <p className="pbc-alert pbc-alert--warning">{calculation.excludedUnassignedCount} unassigned materials excluded from both scenarios.</p> : null}
    {onRemoveComparison ? <button type="button" className="pbc-btn pbc-btn--ghost pbc-btn--sm" onClick={onRemoveComparison}>Remove comparison and its Optional</button> : null}
  </section>
}
