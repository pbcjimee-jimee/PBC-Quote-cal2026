import type { QuoteMemoItem } from './types'

interface QuoteMemosPanelProps {
  memos: QuoteMemoItem[]
  onAddMemo: () => void
  onChangeMemo: (memo: QuoteMemoItem) => void
  onRemoveMemo: (id: string) => void
}

export function QuoteMemosPanel({ memos, onAddMemo, onChangeMemo, onRemoveMemo }: QuoteMemosPanelProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-400">Internal Memos</h2>
          <p className="mt-1 text-xs text-slate-500">Saved in this app only.</p>
        </div>
        <button
          type="button"
          onClick={onAddMemo}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          + Add Memo
        </button>
      </div>

      {memos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          No internal memos.
        </p>
      ) : (
        <div className="space-y-3">
          {memos.map((memo, index) => (
            <div key={memo.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase text-slate-400">Memo {index + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemoveMemo(memo.id)}
                  className="text-xs font-bold text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={memo.body}
                onChange={(event) => onChangeMemo({ ...memo, body: event.target.value })}
                rows={3}
                maxLength={4000}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
                placeholder="Internal note for this quote"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
