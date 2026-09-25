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
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Internal Memos</h2>
          <p className="pbc-panelsub">Saved in this app only.</p>
        </div>
        <button
          type="button"
          onClick={onAddMemo}
          className="pbc-btn pbc-btn--ghost"
        >
          + Add Memo
        </button>
      </div>

      {memos.length === 0 ? (
        <p className="pbc-empty">
          No internal memos.
        </p>
      ) : (
        <div className="space-y-3">
          {memos.map((memo, index) => (
            <div key={memo.id} className="pbc-inlinepanel">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="pbc-paneltitle">Memo {index + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemoveMemo(memo.id)}
                  className="pbc-btn pbc-btn--danger pbc-btn--sm"
                >
                  Remove
                </button>
              </div>
              <textarea
                data-error-key={`review:${memo.id}:body`}
                aria-label={`Memo ${index + 1}`}
                value={memo.body}
                onChange={(event) => onChangeMemo({ ...memo, body: event.target.value })}
                rows={3}
                maxLength={4000}
                className="pbc-textarea w-full"
                placeholder="Internal note for this quote"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
