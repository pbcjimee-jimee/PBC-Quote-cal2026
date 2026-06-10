import type { FormulaResult } from '@/lib/calculator'
import type { FormulaNumber } from './types'

interface FormulaResultsProps {
  results: FormulaResult[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  onSelectedMinChange: (value: FormulaNumber) => void
  onSelectedMaxChange: (value: FormulaNumber) => void
  namePrefix?: string
  title?: string
}

export function FormulaResults({
  results,
  selectedMin,
  selectedMax,
  onSelectedMinChange,
  onSelectedMaxChange,
  namePrefix = 'main',
  title = 'Formula Results',
}: FormulaResultsProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="pbc-paneltitle">{title}</h2>
        <span className="pbc-chip">Select range</span>
      </div>
      <div className="pbc-list">
        {results.map((result) => {
          const formulaNum = result.formulaNum
          const isBoth = selectedMin === formulaNum && selectedMax === formulaNum
          const isMin = selectedMin === formulaNum
          const isMax = selectedMax === formulaNum
          const tone = isBoth
            ? 'bg-[var(--warning-soft)]'
            : selectedMin === formulaNum
              ? 'bg-[var(--lo-soft)]'
              : selectedMax === formulaNum
                ? 'bg-[var(--hi-soft)]'
                : ''

          return (
            <div key={formulaNum} className={`pbc-listitem block ${tone}`}>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="pbc-titletext">F{formulaNum}</span>
                    {isMin ? <span className="pbc-chip">Low selected</span> : null}
                    {isMax ? <span className="pbc-chip">High selected</span> : null}
                  </div>
                  <div className="pbc-listitem__meta truncate">{result.name}</div>
                </div>
                <div className="pbc-moneytext text-lg">
                  ${result.total.toFixed(2)}
                </div>
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <label className={`pbc-chip cursor-pointer border ${isMin ? '' : 'pbc-chip--muted'}`}>
                  <input className="sr-only" type="radio" name={`${namePrefix}-selectedMin`} checked={selectedMin === formulaNum} onChange={() => onSelectedMinChange(formulaNum)} />
                  Low
                </label>
                <label className={`pbc-chip cursor-pointer border ${isMax ? '' : 'pbc-chip--muted'}`}>
                  <input className="sr-only" type="radio" name={`${namePrefix}-selectedMax`} checked={selectedMax === formulaNum} onChange={() => onSelectedMaxChange(formulaNum)} />
                  High
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
