import type { FormulaResult } from '@/lib/calculator'
import type { AreaRecord } from '@/lib/areas/types'
import { FormulaResults } from './formula-results'
import { MaterialsPanel } from './materials-panel'
import type { FormulaNumber, MaterialItem, QuoteOptionItem } from './types'

interface QuoteOptionTotals {
  results: FormulaResult[]
  finalTotal: string
  materialTotal: string
  workingDays: string
  labourPerDay: string
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
    <section className="space-y-4 border-t border-gray-200 pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Options</h2>
          <p className="mt-1 text-xs text-gray-500">Optional add-ons are priced separately from the main quote.</p>
        </div>
        <button
          type="button"
          onClick={onAddOption}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          + Add Option
        </button>
      </div>

      {options.length === 0 ? (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">No optional add-ons.</p>
      ) : null}

      <div className="space-y-3">
        {options.map((option, index) => {
          const totals = optionTotals[option.id]
          return (
            <div key={option.id} className="rounded-md border border-gray-200 bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`${option.id}-title`}>Option title</label>
                  <input
                    id={`${option.id}-title`}
                    value={option.title}
                    onChange={(event) => onChangeOption({ ...option, title: event.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900"
                    placeholder={`Option ${index + 1}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {totals ? (
                    <span className="font-mono text-sm font-semibold text-gray-900">${totals.finalTotal}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onChangeOption({ ...option, isExpanded: !option.isExpanded })}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {option.isExpanded ? 'Collapse' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveOption(option.id)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
                      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-gray-500">Working Days</div>
                        <div className="font-mono text-gray-900">{totals.workingDays}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-gray-500">Labour / Day</div>
                        <div className="font-mono text-gray-900">{totals.labourPerDay}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-gray-500">Material</div>
                        <div className="font-mono text-gray-900">${totals.materialTotal}</div>
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
