import Decimal from 'decimal.js'
import { useMemo, useState } from 'react'
import { calculateLabourTotals, type LabourTotals } from '@/lib/quote-labour'
import { FormulaResults } from './formula-results'
import { MaterialRow } from './material-row'
import { PaintSearch } from './paint-search'
import type { AreaFormulaSelections, FormulaNumber, MaterialItem } from './types'
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'
import { Icons } from '@/components/ui/icons'

interface MaterialsPanelProps {
  materials: MaterialItem[]
  areas: AreaRecord[]
  areaBreakdown?: AreaSubtotalBreakdown
  areaFormulaSelections?: AreaFormulaSelections
  onAdd: (item: MaterialItem) => void
  onChange: (item: MaterialItem) => void
  onRemove: (id: string) => void
  onAreaFormulaSelectionChange?: (scope: AreaScope, field: 'selectedMin' | 'selectedMax', value: FormulaNumber) => void
}

function lineTotal(price: string, quantity: string): Decimal {
  return new Decimal(price || 0).mul(new Decimal(quantity || 0))
}

function getInitialAreaScope(materials: MaterialItem[], areas: AreaRecord[]): AreaScope {
  const selectedScope = materials.find((item) => item.areaScope)?.areaScope
  if (selectedScope) return selectedScope
  return areas.some((area) => area.scope === 'interior') ? 'interior' : 'exterior'
}

export function assignMaterialToActiveArea(
  item: MaterialItem,
  areaScope: AreaScope,
  areas: AreaRecord[]
): MaterialItem {
  const defaultArea = areas.find((area) => area.scope === areaScope)
  return {
    ...item,
    areaId: defaultArea?.id ?? item.areaId,
    areaName: defaultArea?.name ?? item.areaName,
    areaScope: defaultArea?.scope ?? areaScope,
  }
}

function getAreasForMaterial(item: MaterialItem, visibleAreas: AreaRecord[], allAreas: AreaRecord[]): AreaRecord[] {
  if (!item.areaId) return visibleAreas
  if (visibleAreas.some((area) => area.id === item.areaId)) return visibleAreas

  const selectedArea = allAreas.find((area) => area.id === item.areaId)
  if (selectedArea) return [selectedArea, ...visibleAreas]

  if (!item.areaName || !item.areaScope) return visibleAreas
  return [
    {
      id: item.areaId,
      name: item.areaName,
      scope: item.areaScope,
      active: true,
      position: -1,
    },
    ...visibleAreas,
  ]
}

function LabourSummaryRow({ label, totals }: { label: string; totals: LabourTotals }) {
  return (
    <div className="pbc-laboursummary grid grid-cols-[minmax(6.5rem,1fr)_repeat(3,minmax(4.75rem,auto))] items-center gap-2 py-2 text-xs">
      <span className="font-bold text-[var(--foreground)]">{label}</span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-[var(--muted-2)]">Working Days</span>
        <span className="mono font-semibold text-[var(--foreground)]">{totals.workingDays.toFixed(2)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-[var(--muted-2)]">Labour / Day</span>
        <span className="mono font-semibold text-[var(--foreground)]">{totals.labourPerDay.toFixed(2)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-[var(--muted-2)]">Labour Days</span>
        <span className="mono font-semibold text-[var(--foreground)]">{totals.labourDays.toFixed(2)}</span>
      </span>
    </div>
  )
}

function HiddenMaterialSummary({ item, onRemove }: { item: MaterialItem; onRemove: () => void }) {
  const total = lineTotal(item.marketPrice, item.quantity)
  const scopeLabel = item.areaScope === 'interior'
    ? 'Interior'
    : item.areaScope === 'exterior'
      ? 'Exterior'
      : 'No area'
  const areaLabel = item.areaName ? `${scopeLabel} - ${item.areaName}` : scopeLabel

  return (
    <li className="pbc-hiddenmat">
      <span className="min-w-0">
        <span className="pbc-titletext block truncate">{item.name}</span>
        <span className="pbc-listitem__meta">{areaLabel}</span>
      </span>
      <span className="mono shrink-0 text-right text-xs font-bold text-[var(--foreground)]">
        {item.quantity} x ${new Decimal(item.marketPrice || 0).toFixed(2)}
        <b className="block text-sm">${total.toFixed(2)}</b>
      </span>
      <button
        type="button"
        className="pbc-iconbtn pbc-iconbtn--danger pbc-iconbtn--compact shrink-0"
        aria-label={`Remove hidden material ${item.name}`}
        onClick={onRemove}
        title="Remove material"
      >
        {Icons.trash({ size: 13 })}
      </button>
    </li>
  )
}

export function MaterialsPanel({
  materials,
  areas,
  areaBreakdown,
  areaFormulaSelections,
  onAdd,
  onChange,
  onRemove,
  onAreaFormulaSelectionChange,
}: MaterialsPanelProps) {
  const [areaScope, setAreaScope] = useState<AreaScope>(() => getInitialAreaScope(materials, areas))
  const [isExpanded, setIsExpanded] = useState(true)
  const hasAreaSections = areas.length > 0 || materials.some((item) => item.areaScope === 'interior' || item.areaScope === 'exterior')
  const filteredAreas = useMemo(() => areas.filter((area) => area.scope === areaScope), [areaScope, areas])
  const visibleMaterials = useMemo(
    () => hasAreaSections ? materials.filter((item) => item.areaScope === areaScope) : materials,
    [areaScope, hasAreaSections, materials]
  )
  const hiddenMaterials = useMemo(
    () => hasAreaSections ? materials.filter((item) => item.areaScope !== areaScope) : [],
    [areaScope, hasAreaSections, materials]
  )
  const visibleMaterialTotal = visibleMaterials.reduce((total, item) => total.add(lineTotal(item.marketPrice, item.quantity)), new Decimal(0))
  const labourByArea = useMemo(() => ({
    interior: calculateLabourTotals(materials.filter((item) => item.areaScope === 'interior')),
    exterior: calculateLabourTotals(materials.filter((item) => item.areaScope === 'exterior')),
  }), [materials])
  const activeLabourTotals = labourByArea[areaScope]
  const hiddenMaterialCount = hiddenMaterials.length
  const activeScopeLabel = areaScope === 'interior' ? 'Interior' : 'Exterior'
  const activeAreaSubtotal = areaBreakdown?.[areaScope].subtotal
  const hasVisibleMaterials = visibleMaterials.length > 0

  function changeAreaScope(nextScope: AreaScope) {
    setAreaScope(nextScope)
  }

  function addMaterialToActiveArea(item: MaterialItem) {
    onAdd(hasAreaSections ? assignMaterialToActiveArea(item, areaScope, areas) : item)
  }

  return (
    <section>
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Materials</h2>
        </div>
        <div className="pbc-panelhead__actions">
          {hasAreaSections ? (
            <div className="pbc-toggle">
              {(['interior', 'exterior'] as AreaScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => changeAreaScope(scope)}
                  className={areaScope === scope ? 'is-on' : ''}
                  aria-pressed={areaScope === scope}
                >
                  {scope === 'interior' ? 'Interior' : 'Exterior'}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="pbc-btn pbc-btn--ghost pbc-btn--sm"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <>
          {hasAreaSections ? (
            <div className="pbc-ministats pbc-ministats--3 mt-4">
              <div className="pbc-ministat">
                <span>{activeScopeLabel} material</span>
                <b className="mono">${visibleMaterialTotal.toFixed(2)}</b>
              </div>
              <div className="pbc-ministat">
                <span>{activeScopeLabel} subtotal</span>
                <b className="mono">{activeAreaSubtotal ? `$${activeAreaSubtotal.toFixed(2)}` : '$0.00'}</b>
              </div>
              <div className="pbc-ministat">
                <span>{activeScopeLabel} Labour Days</span>
                <b className="mono">{activeLabourTotals.labourDays.toFixed(2)}</b>
              </div>
            </div>
          ) : null}
          <PaintSearch onAdd={addMaterialToActiveArea} />
          {areas.length > 0 && filteredAreas.length === 0 ? (
            <p className="pbc-alert pbc-alert--warning">
              No {areaScope} areas yet. Add them in Settings.
            </p>
          ) : null}
          {materials.length === 0 ? (
            <p className="pbc-empty">No materials yet. Search paint or add a custom material.</p>
          ) : visibleMaterials.length === 0 ? (
            <p className="pbc-empty">
              No {areaScope} materials in this section.
            </p>
          ) : (
            <div className="pbc-materiallist">
              {visibleMaterials.map((item) => (
                <MaterialRow key={item.id} item={item} areas={getAreasForMaterial(item, filteredAreas, areas)} onChange={onChange} onRemove={() => onRemove(item.id)} />
              ))}
            </div>
          )}
          {hiddenMaterialCount > 0 ? (
            <div className="pbc-empty pbc-materialhiddennotice">
              <p className="m-0">
                {hiddenMaterialCount} material {hiddenMaterialCount === 1 ? 'row is' : 'rows are'} hidden by the {activeScopeLabel} filter.
              </p>
              <ul className="pbc-hiddenmatlist">
                {hiddenMaterials.map((item) => (
                  <HiddenMaterialSummary key={item.id} item={item} onRemove={() => onRemove(item.id)} />
                ))}
              </ul>
            </div>
          ) : null}
          {hasVisibleMaterials && hasAreaSections && areaBreakdown && areaFormulaSelections && onAreaFormulaSelectionChange ? (
            <div className="pbc-materialformula">
              <FormulaResults
                title={`${activeScopeLabel} Formula Results`}
                results={areaBreakdown[areaScope].results}
                selectedMin={areaFormulaSelections[areaScope].selectedMin}
                selectedMax={areaFormulaSelections[areaScope].selectedMax}
                onSelectedMinChange={(value) => onAreaFormulaSelectionChange(areaScope, 'selectedMin', value)}
                onSelectedMaxChange={(value) => onAreaFormulaSelectionChange(areaScope, 'selectedMax', value)}
                namePrefix={`materials-${areaScope}`}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="pbc-ministats pbc-ministats--3 mt-4">
          <div className="pbc-ministat">
            <span>{activeScopeLabel} rows</span>
            <b className="mono">{visibleMaterials.length}</b>
          </div>
          <div className="pbc-ministat">
            <span>{activeScopeLabel} material</span>
            <b className="mono">${visibleMaterialTotal.toFixed(2)}</b>
          </div>
          <div className="pbc-ministat">
            <span>{activeScopeLabel} Labour Days</span>
            <b className="mono">{activeLabourTotals.labourDays.toFixed(2)}</b>
          </div>
        </div>
      )}

      {hasVisibleMaterials ? (
      <div className="pbc-divider mt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">{activeScopeLabel} material total</span>
          <span className="mono font-semibold text-[var(--foreground)]">${visibleMaterialTotal.toFixed(2)}</span>
        </div>
        {hasAreaSections ? (
          <div className="mt-2 flex justify-between">
            <span className="text-[var(--muted)]">{activeScopeLabel} subtotal price</span>
            <span className="mono font-semibold text-[var(--foreground)]">{activeAreaSubtotal ? `$${activeAreaSubtotal.toFixed(2)}` : '$0.00'}</span>
          </div>
        ) : null}
        <div className="mt-4 border-t border-[var(--border-soft)] pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase text-[var(--muted-2)]">Labour by area</span>
            <span className="text-xs font-semibold text-[var(--muted)]">{activeScopeLabel} only</span>
          </div>
          <div className="mt-2 divide-y divide-[var(--border-soft)]">
            <LabourSummaryRow label={`${activeScopeLabel} labour`} totals={activeLabourTotals} />
          </div>
        </div>
      </div>
      ) : null}
    </section>
  )
}
