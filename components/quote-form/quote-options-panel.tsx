import type { FormulaResult } from '@/lib/calculator'
import type { AreaRecord } from '@/lib/areas/types'
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
    <section className="mt-6 space-y-4 border-t border-slate-100 pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-400">Options</h2>
          <p className="mt-1 text-xs text-slate-500">Optional add-ons are priced separately from the main quote.</p>
        </div>
        <button
          type="button"
          onClick={onAddOption}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          + Add Option
        </button>
      </div>

      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">No optional add-ons.</p>
      ) : null}

      <div className="space-y-3">
        {options.map((option, index) => {
          const totals = optionTotals[option.id]
          return (
            <div key={option.id} className="rounded-lg border border-[var(--border)] bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`${option.id}-title`}>Option title</label>
                  <input
                    id={`${option.id}-title`}
                    value={option.title}
                    onChange={(event) => onChangeOption({ ...option, title: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-950"
                    placeholder={`Option ${index + 1}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {totals ? (
                    <span className="flex items-baseline gap-1">
                      <span className="font-mono text-sm font-bold text-slate-950">${totals.subtotal}</span>
                      <span className="text-xs font-medium text-slate-500">Ex GST</span>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onChangeOption({ ...option, isExpanded: !option.isExpanded })}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {option.isExpanded ? 'Collapse' : 'Expand'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveOption(option.id)}
                    className="rounded-lg border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {option.isExpanded ? (
                <div className="space-y-5 p-4">
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
                      <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
                        <div className="text-xs font-semibold text-slate-400">Working Days</div>
                        <div className="font-mono text-slate-950">{totals.workingDays}</div>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
                        <div className="text-xs font-semibold text-slate-400">Total Labour</div>
                        <div className="font-mono text-slate-950">{totals.labourPerDay}</div>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
                        <div className="text-xs font-semibold text-slate-400">Material</div>
                        <div className="font-mono text-slate-950">${totals.materialTotal}</div>
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
