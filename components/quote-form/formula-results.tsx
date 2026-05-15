import type { FormulaResult } from '@/lib/calculator'
import type { FormulaNumber } from './types'

interface FormulaResultsProps {
  results: FormulaResult[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  onSelectedMinChange: (value: FormulaNumber) => void
  onSelectedMaxChange: (value: FormulaNumber) => void
  namePrefix?: string
}

export function FormulaResults({
  results,
  selectedMin,
  selectedMax,
  onSelectedMinChange,
  onSelectedMaxChange,
  namePrefix = 'main',
}: FormulaResultsProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Formula Results</h2>
      <div className="space-y-2">
        {results.map((result) => {
          const formulaNum = result.formulaNum
          const isBoth = selectedMin === formulaNum && selectedMax === formulaNum
          const tone = isBoth
            ? 'border-amber-300 bg-amber-50'
            : selectedMin === formulaNum
              ? 'border-blue-300 bg-blue-50'
              : selectedMax === formulaNum
                ? 'border-purple-300 bg-purple-50'
                : 'border-gray-200 bg-white'

          return (
            <div key={formulaNum} className={`rounded-md border p-3 ${tone}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">F{formulaNum}</div>
                  <div className="text-xs text-gray-500">{result.name}</div>
                </div>
                <div className="font-mono text-sm font-semibold tabular-nums text-gray-900">
                  ${result.total.toFixed(2)}
                </div>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-gray-600">
                <label className="inline-flex items-center gap-1">
                  <input type="radio" name={`${namePrefix}-selectedMin`} checked={selectedMin === formulaNum} onChange={() => onSelectedMinChange(formulaNum)} />
                  min
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="radio" name={`${namePrefix}-selectedMax`} checked={selectedMax === formulaNum} onChange={() => onSelectedMaxChange(formulaNum)} />
                  max
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
