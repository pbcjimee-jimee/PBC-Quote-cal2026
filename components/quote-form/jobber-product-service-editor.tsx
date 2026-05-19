'use client'

import { useState, type ChangeEvent, type DragEvent } from 'react'
import type { JobberQuoteLineItemDraft, JobberSaveMode } from './types'

interface JobberProductServiceEditorProps {
  value: JobberQuoteLineItemDraft[]
  saveMode: JobberSaveMode
  onChange: (lines: JobberQuoteLineItemDraft[]) => void
  onSaveModeChange: (mode: JobberSaveMode) => void
}

function createLineId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createPricedLineItem(): JobberQuoteLineItemDraft {
  return {
    id: createLineId('jobber-line'),
    kind: 'line_item',
    name: '',
    description: '',
    quantity: '1',
    unitPrice: '0.00',
    taxable: true,
    clientVisible: true,
  }
}

function createTextLine(): JobberQuoteLineItemDraft {
  return {
    id: createLineId('jobber-text'),
    kind: 'text',
    name: '',
    description: '',
    quantity: '1',
    unitPrice: '0',
    taxable: false,
    clientVisible: true,
  }
}

type DropPlacement = 'before' | 'after'

export function reorderJobberQuoteLines(
  lines: JobberQuoteLineItemDraft[],
  draggedId: string,
  targetId: string,
  placement: DropPlacement = 'before'
): JobberQuoteLineItemDraft[] {
  if (draggedId === targetId) return lines

  const draggedIndex = lines.findIndex((line) => line.id === draggedId)
  const targetIndex = lines.findIndex((line) => line.id === targetId)
  if (draggedIndex < 0 || targetIndex < 0) return lines

  const nextLines = [...lines]
  const [draggedLine] = nextLines.splice(draggedIndex, 1)
  const nextTargetIndex = nextLines.findIndex((line) => line.id === targetId)
  const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex
  nextLines.splice(insertIndex, 0, draggedLine)
  return nextLines
}

export function JobberProductServiceEditor({
  value,
  saveMode,
  onChange,
  onSaveModeChange,
}: JobberProductServiceEditorProps) {
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: DropPlacement } | null>(null)

  function updateLine(updatedLine: JobberQuoteLineItemDraft) {
    onChange(value.map((line) => line.id === updatedLine.id ? updatedLine : line))
  }

  function removeLine(id: string) {
    onChange(value.filter((line) => line.id !== id))
  }

  function getDropPlacement(event: DragEvent<HTMLDivElement>): DropPlacement {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  }

  function handleDragStart(lineId: string, event: DragEvent<HTMLButtonElement>) {
    setDraggedLineId(lineId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', lineId)
  }

  function handleDragOver(lineId: string, event: DragEvent<HTMLDivElement>) {
    if (!draggedLineId || draggedLineId === lineId) return
    event.preventDefault()
    setDropTarget({ id: lineId, placement: getDropPlacement(event) })
  }

  function handleDrop(lineId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const droppedLineId = draggedLineId ?? event.dataTransfer.getData('text/plain')
    if (!droppedLineId) return

    const placement = getDropPlacement(event)
    onChange(reorderJobberQuoteLines(value, droppedLineId, lineId, placement))
    setDraggedLineId(null)
    setDropTarget(null)
  }

  function handleDragEnd() {
    setDraggedLineId(null)
    setDropTarget(null)
  }

  return (
    <section className="space-y-4 border-t border-slate-100 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase text-slate-400">Product / Service</h2>
          <p className="mt-1 text-xs text-slate-500">Add the public Jobber-facing product and service lines for this quote.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label="Jobber save mode">
          <button
            type="button"
            onClick={() => onSaveModeChange('priced_line_items')}
            aria-pressed={saveMode === 'priced_line_items'}
            className={[
              'rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
              saveMode === 'priced_line_items'
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            Priced Line Items
          </button>
          <button
            type="button"
            onClick={() => onSaveModeChange('description_total')}
            aria-pressed={saveMode === 'description_total'}
            className={[
              'rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
              saveMode === 'description_total'
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            Description + Total
          </button>
        </div>
      </div>

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          No public product or service lines yet.
        </p>
      ) : null}

      <div className="space-y-3">
        {value.map((line) => {
          const isDropTarget = dropTarget?.id === line.id
          if (line.kind === 'line_item') {
            return (
              <PricedLineRow
                key={line.id}
                line={line}
                isDragging={draggedLineId === line.id}
                dropPlacement={isDropTarget ? dropTarget.placement : null}
                onDragStart={(event) => handleDragStart(line.id, event)}
                onDragOver={(event) => handleDragOver(line.id, event)}
                onDrop={(event) => handleDrop(line.id, event)}
                onDragEnd={handleDragEnd}
                onChange={updateLine}
                onRemove={() => removeLine(line.id)}
              />
            )
          }

          return (
            <TextLineRow
              key={line.id}
              line={line}
              isDragging={draggedLineId === line.id}
              dropPlacement={isDropTarget ? dropTarget.placement : null}
              onDragStart={(event) => handleDragStart(line.id, event)}
              onDragOver={(event) => handleDragOver(line.id, event)}
              onDrop={(event) => handleDrop(line.id, event)}
              onDragEnd={handleDragEnd}
              onChange={updateLine}
              onRemove={() => removeLine(line.id)}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([...value, createPricedLineItem()])}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          Add Line Item
        </button>
        <button
          type="button"
          onClick={() => onChange([...value, createTextLine()])}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          Add Text
        </button>
      </div>
    </section>
  )
}

interface PricedLineRowProps {
  line: JobberQuoteLineItemDraft
  isDragging: boolean
  dropPlacement: DropPlacement | null
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onChange: (line: JobberQuoteLineItemDraft) => void
  onRemove: () => void
}

function getDropTargetClass(dropPlacement: DropPlacement | null) {
  if (dropPlacement === 'before') return 'ring-2 ring-blue-300 ring-offset-2'
  if (dropPlacement === 'after') return 'ring-2 ring-green-300 ring-offset-2'
  return ''
}

function PricedLineRow({
  line,
  isDragging,
  dropPlacement,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onChange,
  onRemove,
}: PricedLineRowProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'rounded-lg border border-[var(--border)] bg-white p-3 transition-shadow',
        isDragging ? 'opacity-60' : '',
        getDropTargetClass(dropPlacement),
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag ${line.name || 'line item'}`}
          title="Drag to reorder"
          className="mt-1 flex h-9 w-8 cursor-grab items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-400 active:cursor-grabbing"
        >
          ::
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label className="sr-only" htmlFor={`${line.id}-name`}>Line item name</label>
            <input
              id={`${line.id}-name`}
              aria-label="Line item name"
              value={line.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, name: event.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-950"
              placeholder="Line item name"
            />
          </div>
          <div>
            <label className="sr-only" htmlFor={`${line.id}-description`}>Line item description</label>
            <textarea
              id={`${line.id}-description`}
              aria-label="Line item description"
              value={line.description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ ...line, description: event.target.value })}
              className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              placeholder="Description"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[5rem_7rem_1fr] md:items-end">
            <label className="text-xs font-semibold text-slate-500">
              Qty
              <input
                value={line.quantity}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, quantity: event.target.value })}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Unit price
              <input
                value={line.unitPrice}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, unitPrice: event.target.value })}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-950"
              />
            </label>
            <div className="flex flex-wrap gap-3 pb-2 text-xs font-semibold text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={line.taxable}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, taxable: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Taxable
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={line.clientVisible}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, clientVisible: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Client visible
              </label>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

interface TextLineRowProps {
  line: JobberQuoteLineItemDraft
  isDragging: boolean
  dropPlacement: DropPlacement | null
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onChange: (line: JobberQuoteLineItemDraft) => void
  onRemove: () => void
}

function TextLineRow({
  line,
  isDragging,
  dropPlacement,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onChange,
  onRemove,
}: TextLineRowProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 transition-shadow',
        isDragging ? 'opacity-60' : '',
        getDropTargetClass(dropPlacement),
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag ${line.name || 'text line'}`}
          title="Drag to reorder"
          className="mt-1 flex h-9 w-8 cursor-grab items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-400 active:cursor-grabbing"
        >
          ::
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label className="sr-only" htmlFor={`${line.id}-title`}>Text title</label>
            <input
              id={`${line.id}-title`}
              aria-label="Text title"
              value={line.name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, name: event.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
              placeholder="Text title"
            />
          </div>
          <div>
            <label className="sr-only" htmlFor={`${line.id}-body`}>Text body</label>
            <textarea
              id={`${line.id}-body`}
              aria-label="Text body"
              value={line.description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ ...line, description: event.target.value })}
              className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              placeholder="Description text"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={line.clientVisible}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, clientVisible: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            Client visible
          </label>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
