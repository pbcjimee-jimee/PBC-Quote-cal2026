'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { Icons } from '@/components/ui/icons'
import { JobberLineSummary } from './jobber-line-summary'
import type { JobberQuoteLineItemDraft } from './types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'
import { listProductServices, searchProductServices } from '@/lib/actions/product-services'

export interface JobberProductServiceEditorProps {
  value: JobberQuoteLineItemDraft[]
  productServices?: ProductServiceRecord[]
  templates?: QuoteLineTemplateRecord[]
  editingLineId?: string | null
  onEditingLineChange?: (id: string | null) => void
  onChange: (update: JobberQuoteLinesChange) => void
}

export type JobberQuoteLinesUpdater = (lines: JobberQuoteLineItemDraft[]) => JobberQuoteLineItemDraft[]
export type JobberQuoteLinesChange = JobberQuoteLineItemDraft[] | JobberQuoteLinesUpdater
export type JobberLineField = 'name' | 'description' | 'quantity' | 'unitPrice' | 'taxable' | 'clientVisible'

export function getJobberLineErrorKey(lineId: string, field: JobberLineField): string {
  return `public:${lineId}:${field}`
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
const PRODUCT_SERVICE_RESULT_LIMIT = 300
const PRODUCT_SERVICE_FALLBACK_DEBOUNCE_MS = 75
const PRODUCT_SERVICE_SEARCH_DEBOUNCE_MS = 180

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
}

function mergeProductServices(
  primary: ProductServiceRecord[],
  secondary: ProductServiceRecord[]
): ProductServiceRecord[] {
  const seenIds = new Set<string>()
  const merged: ProductServiceRecord[] = []

  for (const productService of [...primary, ...secondary]) {
    if (seenIds.has(productService.id)) continue
    seenIds.add(productService.id)
    merged.push(productService)
    if (merged.length === PRODUCT_SERVICE_RESULT_LIMIT) break
  }

  return merged
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
  if (nextLines.every((line, index) => line.id === lines[index]?.id)) return lines
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
  productServices,
  templates = [],
  editingLineId,
  onEditingLineChange,
  onChange,
}: JobberProductServiceEditorProps) {
  const [localEditingLineId, setLocalEditingLineId] = useState<string | null>(null)
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: DropPlacement } | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [activeLookupLineId, setActiveLookupLineId] = useState<string | null>(null)
  const [loadedProductServices, setLoadedProductServices] = useState<ProductServiceRecord[]>([])
  const [remoteProductServices, setRemoteProductServices] = useState<{
    query: string
    data: ProductServiceRecord[]
  }>({ query: '', data: [] })
  const [reorderAnnouncement, setReorderAnnouncement] = useState('')
  const scrollListRef = useRef<HTMLDivElement | null>(null)
  const addPricedLineButtonRef = useRef<HTMLButtonElement | null>(null)
  const dragScrollFrameRef = useRef<number | null>(null)
  const dragScrollStepRef = useRef(0)
  const pendingAnnouncementLineIdRef = useRef<string | null>(null)
  const pendingRemovalFocusRef = useRef<string | null | undefined>(undefined)
  const previousLinesRef = useRef(value)
  const reportedMissingEditingLineIdRef = useRef<string | null>(null)
  const productServiceSearchRequestRef = useRef<{
    query: string
    request: ReturnType<typeof searchProductServices>
  } | null>(null)
  const isEditingControlled = editingLineId !== undefined
  const requestedEditingLineId = isEditingControlled ? editingLineId : localEditingLineId
  const activeEditingLineId = requestedEditingLineId && value.some((line) => line.id === requestedEditingLineId)
    ? requestedEditingLineId
    : null

  function changeEditingLine(id: string | null) {
    if (!isEditingControlled) setLocalEditingLineId(id)
    onEditingLineChange?.(id)
  }

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

  useEffect(() => {
    const previousLines = previousLinesRef.current
    previousLinesRef.current = value

    if (requestedEditingLineId && !activeEditingLineId) {
      if (pendingRemovalFocusRef.current === undefined) {
        const previousIndex = previousLines.findIndex((line) => line.id === requestedEditingLineId)
        pendingRemovalFocusRef.current = previousIndex >= 0
          ? value[previousIndex]?.id ?? value[previousIndex - 1]?.id ?? null
          : null
      }
      if (reportedMissingEditingLineIdRef.current !== requestedEditingLineId) {
        reportedMissingEditingLineIdRef.current = requestedEditingLineId
        onEditingLineChange?.(null)
      }
    } else {
      reportedMissingEditingLineIdRef.current = null
    }

    const targetId = pendingRemovalFocusRef.current
    if (targetId === undefined) return
    pendingRemovalFocusRef.current = undefined

    if (targetId) {
      const isMobile = window.matchMedia?.('(max-width: 720px)').matches ?? false
      const attributeName = isMobile ? 'data-jobber-summary-id' : 'data-error-key'
      const attributeValue = isMobile ? targetId : getJobberLineErrorKey(targetId, 'name')
      const focusTarget = Array.from(scrollListRef.current?.querySelectorAll<HTMLElement>(`[${attributeName}]`) ?? [])
        .find((element) => element.getAttribute(attributeName) === attributeValue)
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true })
        return
      }
    }

    if (typeof addPricedLineButtonRef.current?.focus === 'function') {
      addPricedLineButtonRef.current.focus({ preventScroll: true })
    }
  }, [activeEditingLineId, onEditingLineChange, requestedEditingLineId, value])

  useEffect(() => {
    const movedLineId = pendingAnnouncementLineIdRef.current
    if (!movedLineId) return

    const position = value.findIndex((line) => line.id === movedLineId)
    const line = value[position]
    if (position >= 0 && line) {
      setReorderAnnouncement(`${line.name || 'Service line'} moved to position ${position + 1} of ${value.length}.`)
    }
    pendingAnnouncementLineIdRef.current = null
  }, [value])

  const activeLookupQuery = value.find((line) => line.id === activeLookupLineId)?.name.trim() ?? ''
  const hasLoadedProductServiceMatches = useMemo(() => (
    activeLookupQuery.length > 0
    && getProductServiceMatches(activeLookupQuery, loadedProductServices).length > 0
  ), [activeLookupQuery, loadedProductServices])
  const availableProductServices = useMemo(() => {
    if (productServices !== undefined) return productServices
    if (remoteProductServices.query !== activeLookupQuery) return loadedProductServices
    return mergeProductServices(remoteProductServices.data, loadedProductServices)
  }, [activeLookupQuery, loadedProductServices, productServices, remoteProductServices])

  useEffect(() => {
    if (productServices !== undefined) return

    let cancelled = false
    void listProductServices({ limit: PRODUCT_SERVICE_RESULT_LIMIT })
      .then((result) => {
        if (!cancelled && result.ok) setLoadedProductServices(result.data)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [productServices])

  useEffect(() => {
    if (productServices !== undefined || activeLookupQuery.length === 0) return

    let cancelled = false
    let timeoutId: number | null = null
    const queryKey = activeLookupQuery.toLowerCase()
    const runSearch = async () => {
      try {
        let request = productServiceSearchRequestRef.current?.query === queryKey
          ? productServiceSearchRequestRef.current.request
          : null
        if (!request) {
          request = searchProductServices({
            query: activeLookupQuery,
            limit: PRODUCT_SERVICE_RESULT_LIMIT,
            match: 'name',
          })
          productServiceSearchRequestRef.current = { query: queryKey, request }
        }

        const result = await request
        if (!cancelled) {
          setRemoteProductServices({
            query: result.ok ? activeLookupQuery : '',
            data: result.ok ? result.data : [],
          })
        }
        if (!result.ok && productServiceSearchRequestRef.current?.request === request) {
          productServiceSearchRequestRef.current = null
        }
      } catch {
        if (!cancelled) setRemoteProductServices({ query: '', data: [] })
        if (productServiceSearchRequestRef.current?.query === queryKey) {
          productServiceSearchRequestRef.current = null
        }
      }
    }

    if (productServiceSearchRequestRef.current?.query === queryKey) {
      void runSearch()
    } else {
      timeoutId = window.setTimeout(() => {
        void runSearch()
      }, hasLoadedProductServiceMatches
        ? PRODUCT_SERVICE_SEARCH_DEBOUNCE_MS
        : PRODUCT_SERVICE_FALLBACK_DEBOUNCE_MS)
    }

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [activeLookupQuery, hasLoadedProductServiceMatches, productServices])

  function updateLine(updatedLine: JobberQuoteLineItemDraft) {
    onChange(value.map((line) => line.id === updatedLine.id ? updatedLine : line))
  }

  function removeLine(id: string) {
    if (activeLookupLineId === id) {
      setActiveLookupLineId(null)
    }
    if (activeEditingLineId === id) {
      const currentIndex = value.findIndex((line) => line.id === id)
      const nextLines = value.filter((line) => line.id !== id)
      pendingRemovalFocusRef.current = nextLines[currentIndex]?.id ?? nextLines[currentIndex - 1]?.id ?? null
      changeEditingLine(null)
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
    if (draggedLineId === lineId) {
      setDropTarget(null)
      return
    }

    const placement = getDropPlacement(event)
    setDropTarget({ id: lineId, placement })
  }

  function handleDrop(lineId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stopProductServiceDragScroll()
    const droppedLineId = draggedLineId ?? event.dataTransfer.getData('text/plain')
    if (!droppedLineId) return

    const placement = getDropPlacement(event)
    onChange((currentLines) => {
      const nextLines = reorderJobberQuoteLines(currentLines, droppedLineId, lineId, placement)
      pendingAnnouncementLineIdRef.current = nextLines === currentLines ? null : droppedLineId
      return nextLines
    })
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
    if (event.target === event.currentTarget) {
      setDropTarget(null)
    }
  }

  function handleListDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stopProductServiceDragScroll()
    setDraggedLineId(null)
    setDropTarget(null)
  }

  function moveLine(lineId: string, direction: 'up' | 'down') {
    const currentIndex = value.findIndex((line) => line.id === lineId)
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (currentIndex < 0 || !value[targetIndex]) return

    onChange((currentLines) => {
      const latestIndex = currentLines.findIndex((line) => line.id === lineId)
      const latestTargetIndex = direction === 'up' ? latestIndex - 1 : latestIndex + 1
      const target = currentLines[latestTargetIndex]
      if (latestIndex < 0 || !target) {
        pendingAnnouncementLineIdRef.current = null
        return currentLines
      }

      const nextLines = reorderJobberQuoteLines(
        currentLines,
        lineId,
        target.id,
        direction === 'up' ? 'before' : 'after'
      )
      pendingAnnouncementLineIdRef.current = nextLines === currentLines ? null : lineId
      return nextLines
    })
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    onChange(applyQuoteLineTemplateToDrafts(value, template))
    setSelectedTemplateId('')
  }

  function addPricedLineItem() {
    const line = createPricedLineItem()
    onChange([...value, line])
    changeEditingLine(line.id)
  }

  function addTextLine() {
    const line = createTextLine()
    onChange([...value, line])
    changeEditingLine(line.id)
  }

  return (
    <section className="space-y-4">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {reorderAnnouncement}
      </p>
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Public Product / Service Lines</h2>
          <p className="pbc-panelsub">These are the public Jobber-facing lines that will be updated from this quote.</p>
        </div>
        <div className="pbc-panelhead__actions pbc-publiclines__toolbar">
          {templates.length > 0 ? (
            <label className="pbc-publiclines__template">
              <span className="sr-only">Template</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => applyTemplate(event.target.value)}
                className="pbc-input pbc-publiclines__select font-semibold"
              >
                <option value="">Choose template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            ref={addPricedLineButtonRef}
            type="button"
            onClick={addPricedLineItem}
            className="pbc-btn pbc-btn--ghost pbc-publiclines__button"
          >
            Add Line Item
          </button>
          <button
            type="button"
            onClick={addTextLine}
            className="pbc-btn pbc-btn--ghost pbc-publiclines__button"
          >
            Add Text
          </button>
        </div>
      </div>

      {value.length === 0 ? (
        <p className="pbc-empty">
          No public product or service lines yet.
        </p>
      ) : null}

      <div
        ref={scrollListRef}
        onDragOver={handleListDragOver}
        onDrop={handleListDrop}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            stopProductServiceDragScroll()
          }
        }}
        className="product-service-scroll-list pbc-product-service-scroll space-y-3 overflow-y-auto pr-2"
      >
        {value.map((line, index) => {
          const isDropTarget = dropTarget?.id === line.id
          if (line.kind === 'line_item') {
            return (
              <PricedLineRow
                key={line.id}
                line={line}
                isEditing={activeEditingLineId === line.id}
                onEditingChange={(isEditing) => changeEditingLine(isEditing ? line.id : null)}
                isDragging={draggedLineId === line.id}
                dropPlacement={isDropTarget ? dropTarget.placement : null}
                onDragStart={(event) => handleDragStart(line.id, event)}
                onDragOver={(event) => handleDragOver(line.id, event)}
                onDrop={(event) => handleDrop(line.id, event)}
                onDragEnd={handleDragEnd}
                canMoveUp={index > 0}
                canMoveDown={index < value.length - 1}
                onMoveUp={() => moveLine(line.id, 'up')}
                onMoveDown={() => moveLine(line.id, 'down')}
                isLookupActive={activeLookupLineId === line.id}
                onLookupFocus={() => setActiveLookupLineId(line.id)}
                onLookupBlur={() => setActiveLookupLineId(null)}
                productServices={availableProductServices}
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
              isEditing={activeEditingLineId === line.id}
              onEditingChange={(isEditing) => changeEditingLine(isEditing ? line.id : null)}
              isDragging={draggedLineId === line.id}
              dropPlacement={isDropTarget ? dropTarget.placement : null}
              onDragStart={(event) => handleDragStart(line.id, event)}
              onDragOver={(event) => handleDragOver(line.id, event)}
              onDrop={(event) => handleDrop(line.id, event)}
              onDragEnd={handleDragEnd}
              canMoveUp={index > 0}
              canMoveDown={index < value.length - 1}
              onMoveUp={() => moveLine(line.id, 'up')}
              onMoveDown={() => moveLine(line.id, 'down')}
              isLookupActive={activeLookupLineId === line.id}
              onLookupFocus={() => setActiveLookupLineId(line.id)}
              onLookupBlur={() => setActiveLookupLineId(null)}
              productServices={availableProductServices}
              onApplyProductService={(productService) => applyProductService(line, productService)}
              onChange={updateLine}
              onRemove={() => removeLine(line.id)}
            />
          )
        })}
      </div>

    </section>
  )
}

interface PricedLineRowProps {
  line: JobberQuoteLineItemDraft
  isEditing: boolean
  onEditingChange: (isEditing: boolean) => void
  isDragging: boolean
  dropPlacement: DropPlacement | null
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  isLookupActive: boolean
  onLookupFocus: () => void
  onLookupBlur: () => void
  productServices: ProductServiceRecord[]
  onApplyProductService: (productService: ProductServiceRecord) => void
  onChange: (line: JobberQuoteLineItemDraft) => void
  onRemove: () => void
}

function getDropTargetClass(dropPlacement: DropPlacement | null) {
  if (dropPlacement) return 'ring-1 ring-[var(--primary)] ring-offset-2'
  return ''
}

function DropInsertionMarker({ placement }: { placement: DropPlacement }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-x-3 z-10 h-1 rounded-full bg-[var(--primary)]',
        placement === 'before' ? '-top-0.5' : '-bottom-0.5',
      ].join(' ')}
    />
  )
}

interface LineReorderControlsProps {
  label: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function handleLineReorderKeyDown(event: KeyboardEvent<HTMLButtonElement>, props: LineReorderControlsProps) {
  if (event.key === 'ArrowUp' && props.canMoveUp) {
    event.preventDefault()
    props.onMoveUp()
  }
  if (event.key === 'ArrowDown' && props.canMoveDown) {
    event.preventDefault()
    props.onMoveDown()
  }
}

function LineReorderControls({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: LineReorderControlsProps) {
  return (
    <div className="pbc-service-line__reorder mt-2 flex items-center justify-end gap-2">
      <span className="text-[11px] font-semibold text-[var(--muted)]">Move item</span>
      <div className="flex items-center gap-1" role="group" aria-label={`Move ${label}`}>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={`Move ${label} up`}
          title="Move up"
          className="pbc-iconbtn pbc-iconbtn--compact disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={`Move ${label} down`}
          title="Move down"
          className="pbc-iconbtn pbc-iconbtn--compact disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </div>
  )
}

function PricedLineRow({
  line,
  isEditing,
  onEditingChange,
  isDragging,
  dropPlacement,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isLookupActive,
  onLookupFocus,
  onLookupBlur,
  productServices,
  onApplyProductService,
  onChange,
  onRemove,
}: PricedLineRowProps) {
  const filteredProductServices = isLookupActive
    ? getProductServiceMatches(line.name, productServices)
    : []
  const reorderControls = { label: line.name || 'line item', canMoveUp, canMoveDown, onMoveUp, onMoveDown }

  return (
    <div
      data-mobile-editing={isEditing}
      className={[
        'pbc-jobber-line pbc-inlinepanel relative transition-shadow',
        isDragging ? 'opacity-60' : '',
        getDropTargetClass(dropPlacement),
      ].join(' ')}
    >
      <JobberLineSummary
        line={line}
        isEditing={isEditing}
        editorId={`${line.id}-editor`}
        onEdit={() => onEditingChange(true)}
      />
      <div
        id={`${line.id}-editor`}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="pbc-jobber-line-editor relative"
      >
        {dropPlacement ? <DropInsertionMarker placement={dropPlacement} /> : null}
        <div className="pbc-jobber-line-done mb-3 justify-end">
          <button type="button" onClick={() => onEditingChange(false)} className="pbc-btn pbc-btn--ghost">
            Done editing
          </button>
        </div>
        <div className="flex items-start gap-2">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => handleLineReorderKeyDown(event, reorderControls)}
          aria-keyshortcuts="ArrowUp ArrowDown"
          aria-label={`Drag ${line.name || 'line item'}`}
          title="Drag to reorder. Use arrow keys to move."
          className="pbc-iconbtn mt-1 cursor-grab select-none active:cursor-grabbing"
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
              data-error-key={getJobberLineErrorKey(line.id, 'name')}
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
              data-error-key={getJobberLineErrorKey(line.id, 'description')}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ ...line, description: event.target.value })}
              className="pbc-textarea min-h-20 w-full"
              placeholder="Description"
            />
          </div>
          <div className="pbc-jobber-line-fields grid grid-cols-2 gap-3 xl:grid-cols-[5rem_minmax(0,8rem)_minmax(0,1fr)] xl:items-end">
            <label className="pbc-field min-w-0">
              <span className="pbc-field__label">Qty</span>
              <input
                value={line.quantity}
                data-error-key={getJobberLineErrorKey(line.id, 'quantity')}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, quantity: event.target.value })}
                inputMode="decimal"
                className="pbc-input min-w-0"
              />
            </label>
            <label className="pbc-field min-w-0">
              <span className="pbc-field__label">Unit price</span>
              <input
                value={line.unitPrice}
                data-error-key={getJobberLineErrorKey(line.id, 'unitPrice')}
                onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, unitPrice: event.target.value })}
                inputMode="decimal"
                className="pbc-input min-w-0 font-mono"
              />
            </label>
            <div className="col-span-2 flex min-w-0 flex-wrap gap-3 pb-2 xl:col-span-1">
              <label className="pbc-checkfield">
                <input
                  type="checkbox"
                  checked={line.taxable}
                  data-error-key={getJobberLineErrorKey(line.id, 'taxable')}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ ...line, taxable: event.target.checked })}
                  className="pbc-checkbox"
                />
                Taxable
              </label>
              <label className="pbc-checkfield">
                <input
                  type="checkbox"
                  checked={line.clientVisible}
                  data-error-key={getJobberLineErrorKey(line.id, 'clientVisible')}
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
        <LineReorderControls {...reorderControls} />
      </div>
    </div>
  )
}

interface TextLineRowProps {
  line: JobberQuoteLineItemDraft
  isEditing: boolean
  onEditingChange: (isEditing: boolean) => void
  isDragging: boolean
  dropPlacement: DropPlacement | null
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
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
  isEditing,
  onEditingChange,
  isDragging,
  dropPlacement,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isLookupActive,
  onLookupFocus,
  onLookupBlur,
  productServices,
  onApplyProductService,
  onChange,
  onRemove,
}: TextLineRowProps) {
  const filteredProductServices = isLookupActive
    ? getProductServiceMatches(line.name, productServices)
    : []
  const reorderControls = { label: line.name || 'text line', canMoveUp, canMoveDown, onMoveUp, onMoveDown }

  return (
    <div
      data-mobile-editing={isEditing}
      className={[
        'pbc-jobber-line pbc-softpanel relative transition-shadow',
        isDragging ? 'opacity-60' : '',
        getDropTargetClass(dropPlacement),
      ].join(' ')}
    >
      <JobberLineSummary
        line={line}
        isEditing={isEditing}
        editorId={`${line.id}-editor`}
        onEdit={() => onEditingChange(true)}
      />
      <div
        id={`${line.id}-editor`}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="pbc-jobber-line-editor relative"
      >
        {dropPlacement ? <DropInsertionMarker placement={dropPlacement} /> : null}
        <div className="pbc-jobber-line-done mb-3 justify-end">
          <button type="button" onClick={() => onEditingChange(false)} className="pbc-btn pbc-btn--ghost">
            Done editing
          </button>
        </div>
        <div className="flex items-start gap-2">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => handleLineReorderKeyDown(event, reorderControls)}
          aria-keyshortcuts="ArrowUp ArrowDown"
          aria-label={`Drag ${line.name || 'text line'}`}
          title="Drag to reorder. Use arrow keys to move."
          className="pbc-iconbtn mt-1 cursor-grab select-none active:cursor-grabbing"
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
              data-error-key={getJobberLineErrorKey(line.id, 'name')}
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
              data-error-key={getJobberLineErrorKey(line.id, 'description')}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange({ ...line, description: event.target.value })}
              className="pbc-textarea min-h-20 w-full"
              placeholder="Description text"
            />
          </div>
          <label className="pbc-checkfield">
            <input
              type="checkbox"
              checked={line.clientVisible}
              data-error-key={getJobberLineErrorKey(line.id, 'clientVisible')}
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
        <LineReorderControls {...reorderControls} />
      </div>
    </div>
  )
}
