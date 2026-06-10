import type { FormulaResult } from '@/lib/calculator'
import type { AreaRecord } from '@/lib/areas/types'
import { Button } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'
import { FormulaResults } from './formula-results'
import { MaterialsPanel } from './materials-panel'
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'
import type { FormulaNumber, MaterialItem, QuoteOptionItem } from './types'

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
  options: QuoteOptionItem[]
  optionTotals: Record<string, QuoteOptionTotals>
  areas: AreaRecord[]
  onAddOption: () => void
  onChangeOption: (option: QuoteOptionItem) => void
  onRemoveOption: (id: string) => void
}

export function QuoteOptionsPanel({
  options,
  optionTotals,
  areas,
  onAddOption,
  onChangeOption,
  onRemoveOption,
}: QuoteOptionsPanelProps) {
  return (
    <section className="mt-6 space-y-4 border-t border-[var(--border-soft)] pt-6">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Options</h2>
          <p className="pbc-panelsub">Optional add-ons are priced separately from the main quote.</p>
        </div>
        <Button
          type="button"
          onClick={onAddOption}
          variant="ghost"
        >
          {Icons.plus({ size: 15 })} Add Option
        </Button>
      </div>

      {options.length === 0 ? (
        <p className="pbc-empty">No optional add-ons.</p>
      ) : null}

      <div className="space-y-3">
        {options.map((option, index) => {
          const totals = optionTotals[option.id]
          return (
            <div key={option.id} className="pbc-softpanel pbc-optioncard">
              <div className="pbc-optioncard__head">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`${option.id}-title`}>Option title</label>
                  <input
                    id={`${option.id}-title`}
                    value={option.title}
                    onChange={(event) => onChangeOption({ ...option, title: event.target.value })}
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
                    onClick={() => onChangeOption({ ...option, isExpanded: !option.isExpanded })}
                    variant="ghost"
                    size="sm"
                  >
                    {option.isExpanded ? 'Collapse' : 'Expand'}
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

              {option.isExpanded ? (
                <div className="pbc-optioncard__body space-y-5">
                  <MaterialsPanel
                    materials={option.materials}
                    areas={areas}
                    areaBreakdown={totals?.areaBreakdown}
                    onAdd={(item) => onChangeOption({ ...option, materials: [...option.materials, item] })}
                    onChange={(item: MaterialItem) => onChangeOption({
                      ...option,
                      materials: option.materials.map((existing) => existing.id === item.id ? item : existing),
                    })}
                    onRemove={(id) => onChangeOption({
                      ...option,
                      materials: option.materials.filter((item) => item.id !== id),
                    })}
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
                      onSelectedMinChange={(value: FormulaNumber) => onChangeOption({ ...option, selectedMin: value })}
                      onSelectedMaxChange={(value: FormulaNumber) => onChangeOption({ ...option, selectedMax: value })}
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
