import Decimal from 'decimal.js'
import { useMemo, useState } from 'react'
import { calculateLabourTotals, type LabourTotals } from '@/lib/quote-labour'
import { FormulaResults } from './formula-results'
import { MaterialRow } from './material-row'
import { PaintSearch } from './paint-search'
import type { AreaFormulaSelections, FormulaNumber, MaterialItem } from './types'
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'

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
    <div className="grid grid-cols-[minmax(6.5rem,1fr)_repeat(3,minmax(4.75rem,auto))] items-center gap-2 py-2 text-xs">
      <span className="font-bold text-slate-700">{label}</span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-slate-400">Working Days</span>
        <span className="font-mono font-semibold text-slate-950">{totals.workingDays.toFixed(2)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-slate-400">Labour / Day</span>
        <span className="font-mono font-semibold text-slate-950">{totals.labourPerDay.toFixed(2)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-slate-400">Labour Days</span>
        <span className="font-mono font-semibold text-slate-950">{totals.labourDays.toFixed(2)}</span>
      </span>
    </div>
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
  const visibleMaterialTotal = visibleMaterials.reduce((total, item) => total.add(lineTotal(item.marketPrice, item.quantity)), new Decimal(0))
  const labourByArea = useMemo(() => ({
    interior: calculateLabourTotals(materials.filter((item) => item.areaScope === 'interior')),
    exterior: calculateLabourTotals(materials.filter((item) => item.areaScope === 'exterior')),
  }), [materials])
  const activeLabourTotals = labourByArea[areaScope]
  const hiddenMaterialCount = materials.length - visibleMaterials.length
  const activeScopeLabel = areaScope === 'interior' ? 'Interior' : 'Exterior'
  const activeAreaSubtotal = areaBreakdown?.[areaScope].subtotal

  function changeAreaScope(nextScope: AreaScope) {
    setAreaScope(nextScope)
  }

  function addMaterialToActiveArea(item: MaterialItem) {
    onAdd(hasAreaSections ? assignMaterialToActiveArea(item, areaScope, areas) : item)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase text-slate-400">Materials</h2>
        <div className="flex flex-wrap items-center gap-2">
          {hasAreaSections ? (
            <div className="rounded-lg bg-slate-100 p-1">
              {(['interior', 'exterior'] as AreaScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => changeAreaScope(scope)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${areaScope === scope ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <>
          {hasAreaSections ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                <div className="text-xs font-semibold text-slate-400">{activeScopeLabel} material</div>
                <div className="font-mono font-semibold text-slate-950">${visibleMaterialTotal.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                <div className="text-xs font-semibold text-slate-400">{activeScopeLabel} subtotal</div>
                <div className="font-mono font-semibold text-slate-950">{activeAreaSubtotal ? `$${activeAreaSubtotal.toFixed(2)}` : '$0.00'}</div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                <div className="text-xs font-semibold text-slate-400">{activeScopeLabel} Labour Days</div>
                <div className="font-mono font-semibold text-slate-950">{activeLabourTotals.labourDays.toFixed(2)}</div>
              </div>
            </div>
          ) : null}
          <PaintSearch onAdd={addMaterialToActiveArea} />
          {areas.length > 0 && filteredAreas.length === 0 ? (
            <p className="rounded-lg border border-amber-100 bg-[var(--warning-soft)] px-3 py-2 text-sm text-amber-800">
              No {areaScope} areas yet. Add them in Settings.
            </p>
          ) : null}
          {materials.length === 0 ? (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">No materials yet. Search paint or add a custom material.</p>
          ) : visibleMaterials.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No {areaScope} materials in this section.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleMaterials.map((item) => (
                <MaterialRow key={item.id} item={item} areas={getAreasForMaterial(item, filteredAreas, areas)} onChange={onChange} onRemove={() => onRemove(item.id)} />
              ))}
            </div>
          )}
          {hiddenMaterialCount > 0 ? (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
              {hiddenMaterialCount} material {hiddenMaterialCount === 1 ? 'row is' : 'rows are'} hidden by the {activeScopeLabel} filter.
            </p>
          ) : null}
          {hasAreaSections && areaBreakdown && areaFormulaSelections && onAreaFormulaSelectionChange ? (
            <FormulaResults
              title={`${activeScopeLabel} Formula Results`}
              results={areaBreakdown[areaScope].results}
              selectedMin={areaFormulaSelections[areaScope].selectedMin}
              selectedMax={areaFormulaSelections[areaScope].selectedMax}
              onSelectedMinChange={(value) => onAreaFormulaSelectionChange(areaScope, 'selectedMin', value)}
              onSelectedMaxChange={(value) => onAreaFormulaSelectionChange(areaScope, 'selectedMax', value)}
              namePrefix={`materials-${areaScope}`}
            />
          ) : null}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
            <div className="text-xs font-semibold text-slate-400">{activeScopeLabel} rows</div>
            <div className="font-mono font-semibold text-slate-950">{visibleMaterials.length}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
            <div className="text-xs font-semibold text-slate-400">{activeScopeLabel} material</div>
            <div className="font-mono font-semibold text-slate-950">${visibleMaterialTotal.toFixed(2)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
            <div className="text-xs font-semibold text-slate-400">{activeScopeLabel} Labour Days</div>
            <div className="font-mono font-semibold text-slate-950">{activeLabourTotals.labourDays.toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">{activeScopeLabel} material total</span>
          <span className="font-mono font-semibold text-slate-950">${visibleMaterialTotal.toFixed(2)}</span>
        </div>
        {hasAreaSections ? (
          <div className="mt-2 flex justify-between">
            <span className="text-slate-500">{activeScopeLabel} subtotal price</span>
            <span className="font-mono font-semibold text-slate-950">{activeAreaSubtotal ? `$${activeAreaSubtotal.toFixed(2)}` : '$0.00'}</span>
          </div>
        ) : null}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase text-slate-400">Labour by area</span>
            <span className="text-xs font-semibold text-slate-500">{activeScopeLabel} only</span>
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            <LabourSummaryRow label={`${activeScopeLabel} labour`} totals={activeLabourTotals} />
          </div>
        </div>
      </div>
    </section>
  )
}
