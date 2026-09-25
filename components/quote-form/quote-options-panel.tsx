import type { FormulaResult } from '@/lib/calculator'
import { useState, useSyncExternalStore } from 'react'
import { getQuoteErrorKey, type MaterialScopeView } from './quote-mobile-state'
import type { AreaRecord } from '@/lib/areas/types'
import { Button } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'
import { FormulaResults } from './formula-results'
import { MaterialsPanel, type MaterialReorderUpdater } from './materials-panel'
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'
import type { AreaCreateResult, AreaScope, FormulaNumber, MaterialItem, QuoteOptionItem } from './types'

interface QuoteOptionTotals {
  results: FormulaResult[]
  subtotal: string
  finalTotal: string
  materialTotal: string
  workingDays: string
  labourPerDay: string
  areaBreakdown: AreaSubtotalBreakdown
}

interface QuoteOptionsPanelProps {
  expandedOptionId?: string | null
  onExpandedOptionChange?: (id: string | null) => void
  expandedOptionIds?: readonly string[]
  onExpandedOptionIdsChange?: (ids: string[]) => void
  optionScopes?: Record<string, MaterialScopeView>
  onOptionScopeChange?: (id: string, scope: MaterialScopeView) => void
  editingOptionMaterial?: { optionId: string; materialId: string } | null
  onEditingOptionMaterialChange?: (value: { optionId: string; materialId: string } | null) => void
  options: QuoteOptionItem[]
  optionTotals: Record<string, QuoteOptionTotals>
  areas: AreaRecord[]
  canCopyMaterials: boolean
  isCopyingMaterials: boolean
  copyMaterialsError: string | null
  onCopyMaterials: () => void
  onAddOption: () => void
  onChangeOption: (option: QuoteOptionItem) => void
  onUpdateOption?: (id: string, update: (option: QuoteOptionItem) => QuoteOptionItem) => void
  onReorderOptionMaterials?: (optionId: string, update: MaterialReorderUpdater) => void
  onRemoveOption: (id: string) => void
  onCreateArea?: (scope: AreaScope, name: string) => Promise<AreaCreateResult>
}

const MOBILE_OPTIONS_QUERY = '(max-width: 720px)'

function subscribeToMobileOptionsViewport(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined
  const mediaQuery = window.matchMedia(MOBILE_OPTIONS_QUERY)
  mediaQuery.addEventListener?.('change', onChange)
  return () => mediaQuery.removeEventListener?.('change', onChange)
}

function getMobileOptionsViewportSnapshot() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(MOBILE_OPTIONS_QUERY).matches
}

function useMobileOptionsViewport() {
  return useSyncExternalStore(subscribeToMobileOptionsViewport, getMobileOptionsViewportSnapshot, () => true)
}

export function applyOptionMaterialReorder(
  options: QuoteOptionItem[],
  optionId: string,
  update: MaterialReorderUpdater
): QuoteOptionItem[] {
  return options.map((option) => option.id === optionId
    ? { ...option, materials: update(option.materials) }
    : option)
}

export function QuoteOptionsPanel({
  expandedOptionId,
  onExpandedOptionChange,
  expandedOptionIds,
  onExpandedOptionIdsChange,
  optionScopes,
  onOptionScopeChange,
  editingOptionMaterial,
  onEditingOptionMaterialChange,
  options,
  optionTotals,
  areas,
  canCopyMaterials,
  isCopyingMaterials,
  copyMaterialsError,
  onCopyMaterials,
  onAddOption,
  onChangeOption,
  onUpdateOption,
  onReorderOptionMaterials,
  onRemoveOption,
  onCreateArea,
}: QuoteOptionsPanelProps) {
  const isMobileViewport = useMobileOptionsViewport()
  const [localExpandedId, setLocalExpandedId] = useState<string | null>(() => options.find((option) => option.isExpanded)?.id ?? null)
  const [localExpandedIds, setLocalExpandedIds] = useState<string[]>(() => options.filter((option) => option.isExpanded).map((option) => option.id))
  const openId = expandedOptionId === undefined ? localExpandedId : expandedOptionId
  const openIds = expandedOptionIds === undefined ? localExpandedIds : expandedOptionIds
  const toggleOption = (id: string) => {
    if (isMobileViewport) {
      const next = openId === id ? null : id
      setLocalExpandedId(next)
      onExpandedOptionChange?.(next)
      return
    }
    const next = openIds.includes(id) ? openIds.filter((openOptionId) => openOptionId !== id) : [...openIds, id]
    setLocalExpandedIds(next)
    onExpandedOptionIdsChange?.(next)
  }
  const copyDescriptionIds = [
    !canCopyMaterials ? 'materials-copy-unavailable' : null,
    copyMaterialsError ? 'materials-copy-error' : null,
  ].filter((id): id is string => id !== null).join(' ') || undefined

  return (
    <section className="mt-6 space-y-4 border-t border-[var(--border-soft)] pt-6">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Options</h2>
          <p className="pbc-panelsub">Optional add-ons are priced separately from the main quote.</p>
        </div>
        <div className="pbc-panelhead__actions">
          <div className="flex flex-col items-start gap-1">
            <Button
              type="button"
              onClick={onCopyMaterials}
              disabled={!canCopyMaterials || isCopyingMaterials}
              aria-busy={isCopyingMaterials || undefined}
              aria-describedby={copyDescriptionIds}
              title={canCopyMaterials
                ? 'Create an independent Option from all current Main Materials.'
                : undefined}
              variant="ghost"
            >
              Copy Materials to Option
            </Button>
            {!canCopyMaterials ? (
              <p id="materials-copy-unavailable" className="pbc-panelsub max-w-64 text-left">
                Add at least one material first.
              </p>
            ) : null}
            {copyMaterialsError ? (
              <p id="materials-copy-error" className="pbc-alert pbc-alert--danger max-w-64" role="alert">
                {copyMaterialsError}
              </p>
            ) : null}
          </div>
          <Button type="button" onClick={onAddOption} variant="ghost">
            {Icons.plus({ size: 15 })} Add Option
          </Button>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="pbc-empty">No optional add-ons.</p>
      ) : null}

      <div className="space-y-3">
        {options.map((option, index) => {
          const totals = optionTotals[option.id]
          const isOpen = isMobileViewport ? openId === option.id : openIds.includes(option.id)
          const updateOption = (update: (current: QuoteOptionItem) => QuoteOptionItem) => {
            if (onUpdateOption) onUpdateOption(option.id, update)
            else onChangeOption(update(option))
          }
          return (
            <div key={option.id} className="pbc-softpanel pbc-optioncard" data-expanded={isOpen}>
              <div className="pbc-optioncard__head">
                <div className="min-w-0 flex-1">
                  <b className="pbc-option-summary-title">{option.title || `Option ${index + 1}`}<small>{option.materials.length} materials · priced separately</small></b>
                  <label className="sr-only" htmlFor={`${option.id}-title`}>Option title</label>
                  <input
                    id={`${option.id}-title`}
                    value={option.title}
                    data-error-key={getQuoteErrorKey({ section: 'work', optionId: option.id, field: 'title' })}
                    onChange={(event) => { const title = event.target.value; updateOption((current) => ({ ...current, title })) }}
                    className="pbc-input font-semibold"
                    placeholder={`Option ${index + 1}`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {totals ? (
                    <span className="flex items-baseline gap-1">
                      <span className="pbc-moneytext text-sm">${totals.subtotal}</span>
                      <span className="pbc-listitem__meta">Ex GST</span>
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => toggleOption(option.id)}
                    aria-expanded={isOpen}
                    variant="ghost"
                    size="sm"
                  >
                    {isOpen ? 'Collapse' : 'Expand'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => onRemoveOption(option.id)}
                    className="pbc-iconbtn pbc-iconbtn--danger"
                    aria-label={`Delete ${option.title || `Option ${index + 1}`}`}
                  >
                    {Icons.trash({ size: 14 })}
                  </button>
                </div>
              </div>

              {isOpen ? (
                <div className="pbc-optioncard__body space-y-5">
                  <MaterialsPanel
                    optionId={option.id}
                    activeScope={optionScopes?.[option.id]}
                    onActiveScopeChange={(scope) => onOptionScopeChange?.(option.id, scope)}
                    editingItemId={editingOptionMaterial === undefined ? undefined : editingOptionMaterial?.optionId === option.id ? editingOptionMaterial.materialId : null}
                    onEditingItemChange={(id) => onEditingOptionMaterialChange?.(id ? { optionId: option.id, materialId: id } : null)}
                    materials={option.materials}
                    areas={areas}
                    areaBreakdown={totals?.areaBreakdown}
                    onCreateArea={onCreateArea}
                    onAdd={(item) => updateOption((current) => ({ ...current, materials: [...current.materials, item] }))}
                    onChange={(item: MaterialItem) => updateOption((current) => ({
                      ...current,
                      materials: current.materials.map((existing) => existing.id === item.id ? item : existing),
                    }))}
                    onRemove={(id) => updateOption((current) => ({
                      ...current,
                      materials: current.materials.filter((item) => item.id !== id),
                    }))}
                    onReorder={onReorderOptionMaterials
                      ? (update) => onReorderOptionMaterials(option.id, update)
                      : undefined}
                  />
                  {totals ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="pbc-metric">
                        <span>Working Days</span>
                        <b>{totals.workingDays}</b>
                      </div>
                      <div className="pbc-metric">
                        <span>Total Labour</span>
                        <b>{totals.labourPerDay}</b>
                      </div>
                      <div className="pbc-metric">
                        <span>Material</span>
                        <b>${totals.materialTotal}</b>
                      </div>
                    </div>
                  ) : null}
                  {totals ? (
                    <FormulaResults
                      results={totals.results}
                      selectedMin={option.selectedMin}
                      selectedMax={option.selectedMax}
                      onSelectedMinChange={(value: FormulaNumber) => updateOption((current) => ({ ...current, selectedMin: value }))}
                      onSelectedMaxChange={(value: FormulaNumber) => updateOption((current) => ({ ...current, selectedMax: value }))}
                      namePrefix={option.id}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
