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
        <h2 className="text-sm font-bold uppercase text-slate-400">{title}</h2>
        <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--primary)]">Select range</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        {results.map((result) => {
          const formulaNum = result.formulaNum
          const isBoth = selectedMin === formulaNum && selectedMax === formulaNum
          const isMin = selectedMin === formulaNum
          const isMax = selectedMax === formulaNum
          const tone = isBoth
            ? 'bg-amber-50'
            : selectedMin === formulaNum
              ? 'bg-emerald-50'
              : selectedMax === formulaNum
                ? 'bg-rose-50'
                : 'bg-white'

          return (
            <div key={formulaNum} className={`border-b border-slate-100 p-3 last:border-b-0 ${tone}`}>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-950">F{formulaNum}</span>
                    {isMin ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Low selected</span> : null}
                    {isMax ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">High selected</span> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{result.name}</div>
                </div>
                <div className="font-mono text-lg font-bold tabular-nums text-slate-950">
                  ${result.total.toFixed(2)}
                </div>
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <label className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 font-bold ${isMin ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'}`}>
                  <input className="sr-only" type="radio" name={`${namePrefix}-selectedMin`} checked={selectedMin === formulaNum} onChange={() => onSelectedMinChange(formulaNum)} />
                  Low
                </label>
                <label className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 font-bold ${isMax ? 'border-rose-200 bg-rose-100 text-rose-700' : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-700'}`}>
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
