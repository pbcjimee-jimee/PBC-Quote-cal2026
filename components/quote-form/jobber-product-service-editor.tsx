'use client'

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Icons } from '@/components/ui/icons'
import type { JobberQuoteLineItemDraft } from './types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

interface JobberProductServiceEditorProps {
  value: JobberQuoteLineItemDraft[]
  productServices?: ProductServiceRecord[]
  templates?: QuoteLineTemplateRecord[]
  onChange: (lines: JobberQuoteLineItemDraft[]) => void
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
type ScrollContainerRect = Pick<DOMRect, 'top' | 'bottom' | 'height'>

const PRODUCT_SERVICE_DRAG_SCROLL_EDGE_PX = 72
const PRODUCT_SERVICE_DRAG_SCROLL_MAX_STEP_PX = 18

export function getProductServiceDragScrollStep(
  containerRect: ScrollContainerRect,
  pointerY: number
): number {
  const edgeSize = Math.min(PRODUCT_SERVICE_DRAG_SCROLL_EDGE_PX, containerRect.height / 3)
  if (edgeSize <= 0) return 0

  const topEdge = containerRect.top + edgeSize
  if (pointerY < topEdge) {
    const distanceIntoEdge = topEdge - pointerY
    return -Math.ceil((distanceIntoEdge / edgeSize) * PRODUCT_SERVICE_DRAG_SCROLL_MAX_STEP_PX)
  }

  const bottomEdge = containerRect.bottom - edgeSize
  if (pointerY > bottomEdge) {
    const distanceIntoEdge = pointerY - bottomEdge
    return Math.ceil((distanceIntoEdge / edgeSize) * PRODUCT_SERVICE_DRAG_SCROLL_MAX_STEP_PX)
  }

  return 0
}

export function applyProductServiceToLine(
  line: JobberQuoteLineItemDraft,
  productService: ProductServiceRecord
): JobberQuoteLineItemDraft {
  if (line.kind === 'text') {
    return {
      ...line,
      name: productService.name,
      description: productService.description ?? '',
      quantity: '1',
      unitPrice: '0',
      taxable: false,
    }
  }

  return {
    ...line,
    name: productService.name,
    description: productService.description ?? '',
    quantity: productService.minimumQuantity ?? (line.quantity || '1'),
    unitPrice: productService.unitPrice,
    taxable: productService.taxable,
  }
}

export function getProductServiceMatches(
  query: string,
  productServices: ProductServiceRecord[]
): ProductServiceRecord[] {
  const nameQuery = query.trim()
  const lookupTokens = nameQuery.toLowerCase().split(/\s+/).filter(Boolean)

  if (lookupTokens.length === 0) return []

  return productServices
    .filter((productService) => {
      const haystack = productService.name.toLowerCase()
      return lookupTokens.every((token) => haystack.includes(token))
    })
    .slice(0, 6)
}

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

function templateItemToDraft(line: QuoteLineTemplateRecord['items'][number]): JobberQuoteLineItemDraft {
  return {
    id: createLineId(`template-${line.kind}`),
    kind: line.kind,
    name: line.name,
    description: line.description ?? '',
    quantity: line.quantity ?? '1',
    unitPrice: line.unitPrice ?? '0',
    taxable: line.kind === 'line_item' ? line.taxable : false,
    clientVisible: line.clientVisible,
    linkedProductOrServiceId: line.linkedProductOrServiceId ?? undefined,
  }
}

export function applyQuoteLineTemplateToDrafts(
  lines: JobberQuoteLineItemDraft[],
  template: QuoteLineTemplateRecord
): JobberQuoteLineItemDraft[] {
  return [...lines, ...template.items.map(templateItemToDraft)]
}

export function JobberProductServiceEditor({
  value,
  productServices = [],
  templates = [],
  onChange,
}: JobberProductServiceEditorProps) {
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: DropPlacement } | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [activeLookupLineId, setActiveLookupLineId] = useState<string | null>(null)
  const scrollListRef = useRef<HTMLDivElement | null>(null)
  const dragScrollFrameRef = useRef<number | null>(null)
  const dragScrollStepRef = useRef(0)

  function stopProductServiceDragScroll() {
    dragScrollStepRef.current = 0
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current)
      dragScrollFrameRef.current = null
    }
  }

  function runProductServiceDragScroll() {
    const scrollList = scrollListRef.current
    const scrollStep = dragScrollStepRef.current

    if (!scrollList || scrollStep === 0) {
      dragScrollFrameRef.current = null
      return
    }

    scrollList.scrollTop += scrollStep
    dragScrollFrameRef.current = window.requestAnimationFrame(runProductServiceDragScroll)
  }

  function updateProductServiceDragScroll(pointerY: number) {
    const scrollList = scrollListRef.current
    if (!scrollList || !draggedLineId) return

    const scrollStep = getProductServiceDragScrollStep(scrollList.getBoundingClientRect(), pointerY)
    dragScrollStepRef.current = scrollStep

    if (scrollStep === 0) {
      stopProductServiceDragScroll()
      return
    }

    if (dragScrollFrameRef.current === null) {
      dragScrollFrameRef.current = window.requestAnimationFrame(runProductServiceDragScroll)
    }
  }

  useEffect(() => stopProductServiceDragScroll, [])

  function updateLine(updatedLine: JobberQuoteLineItemDraft) {
    onChange(value.map((line) => line.id === updatedLine.id ? updatedLine : line))
  }

  function removeLine(id: string) {
    if (activeLookupLineId === id) {
      setActiveLookupLineId(null)
    }
    onChange(value.filter((line) => line.id !== id))
  }

  function applyProductService(line: JobberQuoteLineItemDraft, productService: ProductServiceRecord) {
    updateLine(applyProductServiceToLine(line, productService))
    setActiveLookupLineId(null)
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
    event.preventDefault()
    if (!draggedLineId) return
    updateProductServiceDragScroll(event.clientY)
    if (draggedLineId === lineId) return

    const placement = getDropPlacement(event)
    setDropTarget({ id: lineId, placement })
    const reordered = reorderJobberQuoteLines(value, draggedLineId, lineId, placement)
    if (reordered !== value && reordered.map((line) => line.id).join('|') !== value.map((line) => line.id).join('|')) {
      onChange(reordered)
    }
  }

  function handleDrop(lineId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stopProductServiceDragScroll()
    const droppedLineId = draggedLineId ?? event.dataTransfer.getData('text/plain')
    if (!droppedLineId) return

    const placement = getDropPlacement(event)
    onChange(reorderJobberQuoteLines(value, droppedLineId, lineId, placement))
    setDraggedLineId(null)
    setDropTarget(null)
  }

  function handleDragEnd() {
    stopProductServiceDragScroll()
    setDraggedLineId(null)
    setDropTarget(null)
  }

  function handleListDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggedLineId) return
    event.preventDefault()
    updateProductServiceDragScroll(event.clientY)
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    onChange(applyQuoteLineTemplateToDrafts(value, template))
    setSelectedTemplateId('')
  }

  return (
    <section className="space-y-4">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Product / Service</h2>
          <p className="pbc-panelsub">Add the public Jobber-facing product and service lines for this quote.</p>
        </div>
        {templates.length > 0 ? (
          <label className="pbc-field min-w-48">
            <span className="pbc-field__label">Template</span>
            <select
              value={selectedTemplateId}
              onChange={(event) => applyTemplate(event.target.value)}
              className="pbc-input font-semibold"
            >
              <option value="">Choose template...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {value.length === 0 ? (
        <p className="pbc-empty">
          No public product or service lines yet.
        </p>
      ) : null}

      <div
        ref={scrollListRef}
        onDragOver={handleListDragOver}
        onDrop={() => stopProductServiceDragScroll()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            stopProductServiceDragScroll()
          }
        }}
        className="product-service-scroll-list pbc-product-service-scroll space-y-3 overflow-y-auto pr-2"
      >
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
                isLookupActive={activeLookupLineId === line.id}
                onLookupFocus={() => setActiveLookupLineId(line.id)}
                onLookupBlur={() => setActiveLookupLineId(null)}
                productServices={productServices}
                onApplyProductService={(productService) => applyProductService(line, productService)}
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
              isLookupActive={activeLookupLineId === line.id}
              onLookupFocus={() => setActiveLookupLineId(line.id)}
              onLookupBlur={() => setActiveLookupLineId(null)}
              productServices={productServices}
              onApplyProductService={(productService) => applyProductService(line, productService)}
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
          className="pbc-btn pbc-btn--ghost"
        >
          Add Line Item
        </button>
        <button
          type="button"
          onClick={() => onChange([...value, createTextLine()])}
          className="pbc-btn pbc-btn--ghost"
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
  isLookupActive: boolean
  onLookupFocus: () => void
  onLookupBlur: () => void
  productServices: ProductServiceRecord[]
  onApplyProductService: (productService: ProductServiceRecord) => void
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
  isLookupActive,
  onLookupFocus,
  onLookupBlur,
  productServices,
  onApplyProductService,
  onChange,
  onRemove,
}: PricedLineRowProps) {
  const filteredProductServices = getProductServiceMatches(line.name, productServices)

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'pbc-inlinepanel transition-shadow',
        isDragging ? 'opacity-60' : '',
        getDropTargetClass(dropPlacement),
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag ${line.name || 'line item'}`}
          title="Drag to reorder"
          className="pbc-iconbtn mt-1 cursor-grab touch-none select-none active:cursor-grabbing"
        >
          ::
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="relative">
            <label className="sr-only" htmlFor={`${line.id}-name`}>Line item name</label>
            <input
              id={`${line.id}-name`}
              aria-label="Line item name"
              value={line.name}
              onFocus={onLookupFocus}
              onBlur={onLookupBlur}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, name: event.target.value })}
              className="pbc-input font-semibold"
              placeholder="Line item name"
            />
            {isLookupActive && filteredProductServices.length > 0 ? (
              <div className="pbc-dropdown" aria-label="Product / Service dropdown">
                {filteredProductServices.map((productService) => (
                  <button
                    key={productService.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onApplyProductService(productService)}
                    className="pbc-dropdownitem"
                  >
                    <span className="pbc-titletext block">{productService.name}</span>
                    <span className="pbc-listitem__meta block truncate">
                      {productService.category ?? 'Service'} | ${productService.unitPrice}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <label className="sr-only" htmlFor={`${line.id}-description`}>Line item description</label>
            <textarea
              id={`${line.id}-description`}
              aria-label="Line item description"
              value={line.description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ ...line, description: event.target.value })}
              className="pbc-textarea min-h-20 w-full"
              placeholder="Description"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[5rem_minmax(0,8rem)] xl:grid-cols-[5rem_minmax(0,8rem)_minmax(0,1fr)] xl:items-end">
            <label className="pbc-field min-w-0">
              <span className="pbc-field__label">Qty</span>
              <input
                value={line.quantity}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, quantity: event.target.value })}
                inputMode="decimal"
                className="pbc-input min-w-0"
              />
            </label>
            <label className="pbc-field min-w-0">
              <span className="pbc-field__label">Unit price</span>
              <input
                value={line.unitPrice}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, unitPrice: event.target.value })}
                inputMode="decimal"
                className="pbc-input min-w-0 font-mono"
              />
            </label>
            <div className="flex min-w-0 flex-wrap gap-3 pb-2 sm:col-span-2 xl:col-span-1">
              <label className="pbc-checkfield">
                <input
                  type="checkbox"
                  checked={line.taxable}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, taxable: event.target.checked })}
                  className="pbc-checkbox"
                />
                Taxable
              </label>
              <label className="pbc-checkfield">
                <input
                  type="checkbox"
                  checked={line.clientVisible}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, clientVisible: event.target.checked })}
                  className="pbc-checkbox"
                />
                Client visible
              </label>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${line.name || 'line item'}`}
          title="Delete"
          className="pbc-iconbtn pbc-iconbtn--compact pbc-iconbtn--danger mt-1 shrink-0"
        >
          {Icons.trash({ size: 13 })}
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
  isLookupActive: boolean
  onLookupFocus: () => void
  onLookupBlur: () => void
  productServices: ProductServiceRecord[]
  onApplyProductService: (productService: ProductServiceRecord) => void
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
  isLookupActive,
  onLookupFocus,
  onLookupBlur,
  productServices,
  onApplyProductService,
  onChange,
  onRemove,
}: TextLineRowProps) {
  const filteredProductServices = getProductServiceMatches(line.name, productServices)

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'pbc-softpanel transition-shadow',
        isDragging ? 'opacity-60' : '',
        getDropTargetClass(dropPlacement),
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag ${line.name || 'text line'}`}
          title="Drag to reorder"
          className="pbc-iconbtn mt-1 cursor-grab touch-none select-none active:cursor-grabbing"
        >
          ::
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="relative">
            <label className="sr-only" htmlFor={`${line.id}-title`}>Text title</label>
            <input
              id={`${line.id}-title`}
              aria-label="Text title"
              value={line.name}
              onFocus={onLookupFocus}
              onBlur={onLookupBlur}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, name: event.target.value })}
              className="pbc-input font-semibold"
              placeholder="Text title"
            />
            {isLookupActive && filteredProductServices.length > 0 ? (
              <div className="pbc-dropdown" aria-label="Product / Service dropdown">
                {filteredProductServices.map((productService) => (
                  <button
                    key={productService.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onApplyProductService(productService)}
                    className="pbc-dropdownitem"
                  >
                    <span className="pbc-titletext block">{productService.name}</span>
                    <span className="pbc-listitem__meta block truncate">
                      {productService.category ?? 'Service'}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <label className="sr-only" htmlFor={`${line.id}-body`}>Text body</label>
            <textarea
              id={`${line.id}-body`}
              aria-label="Text body"
              value={line.description}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ ...line, description: event.target.value })}
              className="pbc-textarea min-h-20 w-full"
              placeholder="Description text"
            />
          </div>
          <label className="pbc-checkfield">
            <input
              type="checkbox"
              checked={line.clientVisible}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, clientVisible: event.target.checked })}
              className="pbc-checkbox"
            />
            Client visible
          </label>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${line.name || 'text line'}`}
          title="Delete"
          className="pbc-iconbtn pbc-iconbtn--compact pbc-iconbtn--danger mt-1 shrink-0"
        >
          {Icons.trash({ size: 13 })}
        </button>
      </div>
    </div>
  )
}
