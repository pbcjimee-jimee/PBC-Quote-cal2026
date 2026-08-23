import Decimal from 'decimal.js'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { calculateLabourTotals, type LabourTotals } from '@/lib/quote-labour'
import { FormulaResults } from './formula-results'
import { MaterialRow } from './material-row'
import { PaintSearch } from './paint-search'
import type { AreaCreateResult, AreaFormulaSelections, FormulaNumber, MaterialItem } from './types'
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'
import { AREA_SCOPE_LABELS, AREA_SCOPES } from '@/lib/areas/constants'
import { Icons } from '@/components/ui/icons'

interface MaterialsPanelProps {
  materials: MaterialItem[]
  areas: AreaRecord[]
  areaBreakdown?: AreaSubtotalBreakdown
  areaFormulaSelections?: AreaFormulaSelections
  onAdd: (item: MaterialItem) => void
  onChange: (item: MaterialItem) => void
  onRemove: (id: string) => void
  onReorder?: (update: MaterialReorderUpdater) => void
  onCreateArea?: (scope: AreaScope, name: string) => Promise<AreaCreateResult>
  onAreaFormulaSelectionChange?: (scope: keyof AreaFormulaSelections, field: 'selectedMin' | 'selectedMax', value: FormulaNumber) => void
}

export type MaterialDropPlacement = 'before' | 'after'
export type MaterialReorderUpdater = (materials: MaterialItem[]) => MaterialItem[]

const MATERIAL_DRAG_SCROLL_EDGE_PX = 72
const MATERIAL_DRAG_SCROLL_MAX_STEP_PX = 18

export function getMaterialDragScrollStep(viewportHeight: number, pointerY: number): number {
  const edgeSize = Math.min(MATERIAL_DRAG_SCROLL_EDGE_PX, viewportHeight / 3)
  if (edgeSize <= 0) return 0

  if (pointerY < edgeSize) {
    return -Math.ceil(((edgeSize - pointerY) / edgeSize) * MATERIAL_DRAG_SCROLL_MAX_STEP_PX)
  }

  const bottomEdge = viewportHeight - edgeSize
  if (pointerY > bottomEdge) {
    return Math.ceil(((pointerY - bottomEdge) / edgeSize) * MATERIAL_DRAG_SCROLL_MAX_STEP_PX)
  }

  return 0
}

export function reorderVisibleMaterials(
  materials: MaterialItem[],
  visibleMaterialIds: string[],
  draggedId: string,
  targetId: string,
  placement: MaterialDropPlacement = 'before'
): MaterialItem[] {
  if (draggedId === targetId) return materials

  const visibleIdSet = new Set(visibleMaterialIds)
  if (!visibleIdSet.has(draggedId) || !visibleIdSet.has(targetId)) return materials

  const visibleMaterials = materials.filter((item) => visibleIdSet.has(item.id))
  const draggedIndex = visibleMaterials.findIndex((item) => item.id === draggedId)
  const targetIndex = visibleMaterials.findIndex((item) => item.id === targetId)
  if (draggedIndex < 0 || targetIndex < 0) return materials

  const reorderedVisibleMaterials = [...visibleMaterials]
  const [draggedMaterial] = reorderedVisibleMaterials.splice(draggedIndex, 1)
  const nextTargetIndex = reorderedVisibleMaterials.findIndex((item) => item.id === targetId)
  const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex
  reorderedVisibleMaterials.splice(insertIndex, 0, draggedMaterial)

  if (visibleMaterials.every((item, index) => item.id === reorderedVisibleMaterials[index]?.id)) {
    return materials
  }

  let visibleIndex = 0
  return materials.map((item) => {
    if (!visibleIdSet.has(item.id)) return item
    const reorderedItem = reorderedVisibleMaterials[visibleIndex]
    visibleIndex += 1
    return reorderedItem
  })
}

function lineTotal(price: string, quantity: string): Decimal {
  return new Decimal(price || 0).mul(new Decimal(quantity || 0))
}

function getInitialAreaScope(materials: MaterialItem[], areas: AreaRecord[]): AreaScope {
  const selectedScope = materials.find((item) => item.areaScope)?.areaScope
  if (selectedScope) return selectedScope
  return areas[0]?.scope ?? 'interior'
}

export function assignMaterialToActiveArea(
  item: MaterialItem,
  areaScope: AreaScope,
  areas: AreaRecord[]
): MaterialItem {
  const defaultArea = areas.find((area) => area.scope === areaScope)
  return {
    ...item,
    areaId: defaultArea?.id ?? item.areaId,
    areaName: defaultArea?.name ?? item.areaName,
    areaScope: defaultArea?.scope ?? areaScope,
  }
}

function getAreasForMaterial(item: MaterialItem, visibleAreas: AreaRecord[], allAreas: AreaRecord[]): AreaRecord[] {
  if (!item.areaId) return visibleAreas
  if (visibleAreas.some((area) => area.id === item.areaId)) return visibleAreas

  const selectedArea = allAreas.find((area) => area.id === item.areaId)
  if (selectedArea) return [selectedArea, ...visibleAreas]

  if (!item.areaName || !item.areaScope) return visibleAreas
  return [
    {
      id: item.areaId,
      name: item.areaName,
      scope: item.areaScope,
      active: true,
      position: -1,
    },
    ...visibleAreas,
  ]
}

function LabourSummaryRow({ label, totals }: { label: string; totals: LabourTotals }) {
  return (
    <div className="pbc-laboursummary grid grid-cols-[minmax(6.5rem,1fr)_repeat(3,minmax(4.75rem,auto))] items-center gap-2 py-2 text-xs">
      <span className="font-bold text-[var(--foreground)]">{label}</span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-[var(--muted-2)]">Working Days</span>
        <span className="mono font-semibold text-[var(--foreground)]">{totals.workingDays.toFixed(2)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-[var(--muted-2)]">Labour / Day</span>
        <span className="mono font-semibold text-[var(--foreground)]">{totals.labourPerDay.toFixed(2)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-bold uppercase text-[var(--muted-2)]">Labour Days</span>
        <span className="mono font-semibold text-[var(--foreground)]">{totals.labourDays.toFixed(2)}</span>
      </span>
    </div>
  )
}

function HiddenMaterialSummary({ item, onRemove }: { item: MaterialItem; onRemove: () => void }) {
  const total = lineTotal(item.marketPrice, item.quantity)
  const scopeLabel = item.areaScope ? AREA_SCOPE_LABELS[item.areaScope] : 'No area'
  const areaLabel = item.areaName ? `${scopeLabel} - ${item.areaName}` : scopeLabel

  return (
    <li className="pbc-hiddenmat">
      <span className="min-w-0">
        <span className="pbc-titletext block truncate">{item.name}</span>
        <span className="pbc-listitem__meta">{areaLabel}</span>
      </span>
      <span className="mono shrink-0 text-right text-xs font-bold text-[var(--foreground)]">
        {item.quantity} x ${new Decimal(item.marketPrice || 0).toFixed(2)}
        <b className="block text-sm">${total.toFixed(2)}</b>
      </span>
      <button
        type="button"
        className="pbc-iconbtn pbc-iconbtn--danger pbc-iconbtn--compact shrink-0"
        aria-label={`Remove hidden material ${item.name}`}
        onClick={onRemove}
        title="Remove material"
      >
        {Icons.trash({ size: 13 })}
      </button>
    </li>
  )
}

export function MaterialsPanel({
  materials,
  areas,
  areaBreakdown,
  areaFormulaSelections,
  onAdd,
  onChange,
  onRemove,
  onReorder,
  onCreateArea,
  onAreaFormulaSelectionChange,
}: MaterialsPanelProps) {
  const [areaScope, setAreaScope] = useState<AreaScope>(() => getInitialAreaScope(materials, areas))
  const [isExpanded, setIsExpanded] = useState(true)
  const [draggedMaterialId, setDraggedMaterialId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: MaterialDropPlacement } | null>(null)
  const [reorderAnnouncement, setReorderAnnouncement] = useState('')
  const dragScrollFrameRef = useRef<number | null>(null)
  const dragScrollStepRef = useRef(0)
  const reorderAnnouncementTimerRef = useRef<number | null>(null)
  const hasAreaSections = areas.length > 0 || materials.some((item) => item.areaScope && AREA_SCOPES.includes(item.areaScope))
  const filteredAreas = useMemo(() => areas.filter((area) => area.scope === areaScope), [areaScope, areas])
  const visibleMaterials = useMemo(
    () => hasAreaSections ? materials.filter((item) => item.areaScope === areaScope) : materials,
    [areaScope, hasAreaSections, materials]
  )
  const latestVisibleMaterialsRef = useRef(visibleMaterials)
  const hiddenMaterials = useMemo(
    () => hasAreaSections ? materials.filter((item) => item.areaScope !== areaScope) : [],
    [areaScope, hasAreaSections, materials]
  )
  const visibleMaterialTotal = visibleMaterials.reduce((total, item) => total.add(lineTotal(item.marketPrice, item.quantity)), new Decimal(0))
  const labourByArea = useMemo(() => ({
    interior: calculateLabourTotals(materials.filter((item) => item.areaScope === 'interior')),
    exterior: calculateLabourTotals(materials.filter((item) => item.areaScope === 'exterior')),
    roof: calculateLabourTotals(materials.filter((item) => item.areaScope === 'roof')),
  }), [materials])
  const activeLabourTotals = labourByArea[areaScope]
  const hiddenMaterialCount = hiddenMaterials.length
  const activeScopeLabel = AREA_SCOPE_LABELS[areaScope]
  const activeAreaSubtotal = areaBreakdown?.[areaScope].subtotal
  const hasVisibleMaterials = visibleMaterials.length > 0

  useEffect(() => {
    latestVisibleMaterialsRef.current = visibleMaterials
  }, [visibleMaterials])

  function changeAreaScope(nextScope: AreaScope) {
    setAreaScope(nextScope)
  }

  function addMaterialToActiveArea(item: MaterialItem) {
    onAdd(hasAreaSections ? assignMaterialToActiveArea(item, areaScope, areas) : item)
  }

  function stopMaterialDragScroll() {
    dragScrollStepRef.current = 0
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current)
      dragScrollFrameRef.current = null
    }
  }

  function runMaterialDragScroll() {
    const scrollStep = dragScrollStepRef.current
    if (scrollStep === 0) {
      dragScrollFrameRef.current = null
      return
    }

    window.scrollBy(0, scrollStep)
    dragScrollFrameRef.current = window.requestAnimationFrame(runMaterialDragScroll)
  }

  function updateMaterialDragScroll(pointerY: number) {
    if (!draggedMaterialId) return

    const scrollStep = getMaterialDragScrollStep(window.innerHeight, pointerY)
    dragScrollStepRef.current = scrollStep
    if (scrollStep === 0) {
      stopMaterialDragScroll()
      return
    }

    if (dragScrollFrameRef.current === null) {
      dragScrollFrameRef.current = window.requestAnimationFrame(runMaterialDragScroll)
    }
  }

  useEffect(() => () => {
    stopMaterialDragScroll()
    if (reorderAnnouncementTimerRef.current !== null) {
      window.clearTimeout(reorderAnnouncementTimerRef.current)
    }
  }, [])

  function getDropPlacement(event: DragEvent<HTMLDivElement>): MaterialDropPlacement {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  }

  function handleDragStart(materialId: string, event: DragEvent<HTMLButtonElement>) {
    setDraggedMaterialId(materialId)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', materialId)
  }

  function getCurrentVisibleMaterialIds(currentMaterials: MaterialItem[]): string[] {
    const currentHasAreaSections = areas.length > 0 || currentMaterials.some(
      (item) => item.areaScope && AREA_SCOPES.includes(item.areaScope)
    )
    return currentMaterials
      .filter((item) => !currentHasAreaSections || item.areaScope === areaScope)
      .map((item) => item.id)
  }

  function scheduleMaterialPositionAnnouncement(materialId: string) {
    if (reorderAnnouncementTimerRef.current !== null) {
      window.clearTimeout(reorderAnnouncementTimerRef.current)
    }
    reorderAnnouncementTimerRef.current = window.setTimeout(() => {
      const currentVisibleMaterials = latestVisibleMaterialsRef.current
      const position = currentVisibleMaterials.findIndex((item) => item.id === materialId)
      const item = currentVisibleMaterials[position]
      if (position >= 0 && item) {
        setReorderAnnouncement(`${item.name || 'Material'} moved to position ${position + 1} of ${currentVisibleMaterials.length}.`)
      }
      reorderAnnouncementTimerRef.current = null
    }, 0)
  }

  function reorderMaterial(materialId: string, targetId: string, placement: MaterialDropPlacement) {
    if (!onReorder || materialId === targetId) return

    const preview = reorderVisibleMaterials(
      visibleMaterials,
      visibleMaterials.map((item) => item.id),
      materialId,
      targetId,
      placement
    )

    onReorder((currentMaterials) => reorderVisibleMaterials(
      currentMaterials,
      getCurrentVisibleMaterialIds(currentMaterials),
      materialId,
      targetId,
      placement
    ))
    if (preview !== visibleMaterials) {
      scheduleMaterialPositionAnnouncement(materialId)
    }
  }

  function moveMaterial(materialId: string, direction: 'up' | 'down') {
    const currentIndex = visibleMaterials.findIndex((item) => item.id === materialId)
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    const target = visibleMaterials[targetIndex]
    if (currentIndex < 0 || !target) return

    reorderMaterial(materialId, target.id, direction === 'up' ? 'before' : 'after')
  }

  function handleDragOver(materialId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!draggedMaterialId) return
    updateMaterialDragScroll(event.clientY)
    if (draggedMaterialId === materialId || !onReorder) {
      setDropTarget(null)
      return
    }

    const placement = getDropPlacement(event)
    setDropTarget({ id: materialId, placement })
  }

  function handleDrop(materialId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stopMaterialDragScroll()
    const droppedMaterialId = draggedMaterialId ?? event.dataTransfer.getData('text/plain')
    if (droppedMaterialId) {
      reorderMaterial(droppedMaterialId, materialId, getDropPlacement(event))
    }
    setDraggedMaterialId(null)
    setDropTarget(null)
  }

  function handleDragEnd() {
    stopMaterialDragScroll()
    setDraggedMaterialId(null)
    setDropTarget(null)
  }

  function handleListDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggedMaterialId) return
    event.preventDefault()
    updateMaterialDragScroll(event.clientY)
    if (event.target === event.currentTarget) {
      setDropTarget(null)
    }
  }

  function handleListDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    stopMaterialDragScroll()
    setDraggedMaterialId(null)
    setDropTarget(null)
  }

  return (
    <section>
      {onReorder ? (
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </p>
      ) : null}
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Materials</h2>
        </div>
        <div className="pbc-panelhead__actions">
          {hasAreaSections ? (
            <div className="pbc-toggle">
              {AREA_SCOPES.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => changeAreaScope(scope)}
                  className={areaScope === scope ? 'is-on' : ''}
                  aria-pressed={areaScope === scope}
                >
                  {AREA_SCOPE_LABELS[scope]}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="pbc-btn pbc-btn--ghost pbc-btn--sm"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <>
          {hasAreaSections ? (
            <div className="pbc-ministats pbc-ministats--3 mt-4">
              <div className="pbc-ministat">
                <span>{activeScopeLabel} material</span>
                <b className="mono">${visibleMaterialTotal.toFixed(2)}</b>
              </div>
              <div className="pbc-ministat">
                <span>{activeScopeLabel} subtotal</span>
                <b className="mono">{activeAreaSubtotal ? `$${activeAreaSubtotal.toFixed(2)}` : '$0.00'}</b>
              </div>
              <div className="pbc-ministat">
                <span>{activeScopeLabel} Labour Days</span>
                <b className="mono">{activeLabourTotals.labourDays.toFixed(2)}</b>
              </div>
            </div>
          ) : null}
          <PaintSearch onAdd={addMaterialToActiveArea} />
          {areas.length > 0 && filteredAreas.length === 0 ? (
            <p className="pbc-alert pbc-alert--warning">
              No {areaScope} areas yet. {onCreateArea ? 'Add one from an area field.' : 'Add them in Settings.'}
            </p>
          ) : null}
          {materials.length === 0 ? (
            <p className="pbc-empty">No materials yet. Search paint or add a custom material.</p>
          ) : visibleMaterials.length === 0 ? (
            <p className="pbc-empty">
              No {areaScope} materials in this section.
            </p>
          ) : (
            <div
              className="pbc-materiallist"
              onDragOver={handleListDragOver}
              onDrop={handleListDrop}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  stopMaterialDragScroll()
                }
              }}
            >
              {visibleMaterials.map((item, index) => (
                <MaterialRow
                  key={item.id}
                  item={item}
                  areas={getAreasForMaterial(item, filteredAreas, areas)}
                  areaScope={areaScope}
                  onCreateArea={onCreateArea}
                  onChange={onChange}
                  onRemove={() => onRemove(item.id)}
                  isDragging={draggedMaterialId === item.id}
                  dropPlacement={dropTarget?.id === item.id ? dropTarget.placement : null}
                  onDragStart={onReorder ? (event) => handleDragStart(item.id, event) : undefined}
                  onDragOver={onReorder ? (event) => handleDragOver(item.id, event) : undefined}
                  onDrop={onReorder ? (event) => handleDrop(item.id, event) : undefined}
                  onDragEnd={handleDragEnd}
                  canMoveUp={index > 0}
                  canMoveDown={index < visibleMaterials.length - 1}
                  onMoveUp={onReorder ? () => moveMaterial(item.id, 'up') : undefined}
                  onMoveDown={onReorder ? () => moveMaterial(item.id, 'down') : undefined}
                />
              ))}
            </div>
          )}
          {hiddenMaterialCount > 0 ? (
            <div className="pbc-empty pbc-materialhiddennotice">
              <p className="m-0">
                {hiddenMaterialCount} material {hiddenMaterialCount === 1 ? 'row is' : 'rows are'} hidden by the {activeScopeLabel} filter.
              </p>
              <ul className="pbc-hiddenmatlist">
                {hiddenMaterials.map((item) => (
                  <HiddenMaterialSummary key={item.id} item={item} onRemove={() => onRemove(item.id)} />
                ))}
              </ul>
            </div>
          ) : null}
          {hasVisibleMaterials && hasAreaSections && areaBreakdown && areaFormulaSelections && onAreaFormulaSelectionChange ? (
            <div className="pbc-materialformula">
              <FormulaResults
                title={`${activeScopeLabel} Formula Results`}
                results={areaBreakdown[areaScope].results}
                selectedMin={areaFormulaSelections[areaScope].selectedMin}
                selectedMax={areaFormulaSelections[areaScope].selectedMax}
                onSelectedMinChange={(value) => onAreaFormulaSelectionChange(areaScope, 'selectedMin', value)}
                onSelectedMaxChange={(value) => onAreaFormulaSelectionChange(areaScope, 'selectedMax', value)}
                namePrefix={`materials-${areaScope}`}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="pbc-ministats pbc-ministats--3 mt-4">
          <div className="pbc-ministat">
            <span>{activeScopeLabel} rows</span>
            <b className="mono">{visibleMaterials.length}</b>
          </div>
          <div className="pbc-ministat">
            <span>{activeScopeLabel} material</span>
            <b className="mono">${visibleMaterialTotal.toFixed(2)}</b>
          </div>
          <div className="pbc-ministat">
            <span>{activeScopeLabel} Labour Days</span>
            <b className="mono">{activeLabourTotals.labourDays.toFixed(2)}</b>
          </div>
        </div>
      )}

      {hasVisibleMaterials ? (
      <div className="pbc-divider mt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">{activeScopeLabel} material total</span>
          <span className="mono font-semibold text-[var(--foreground)]">${visibleMaterialTotal.toFixed(2)}</span>
        </div>
        {hasAreaSections ? (
          <div className="mt-2 flex justify-between">
            <span className="text-[var(--muted)]">{activeScopeLabel} subtotal price</span>
            <span className="mono font-semibold text-[var(--foreground)]">{activeAreaSubtotal ? `$${activeAreaSubtotal.toFixed(2)}` : '$0.00'}</span>
          </div>
        ) : null}
        <div className="mt-4 border-t border-[var(--border-soft)] pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase text-[var(--muted-2)]">Labour by area</span>
            <span className="text-xs font-semibold text-[var(--muted)]">{activeScopeLabel} only</span>
          </div>
          <div className="mt-2 divide-y divide-[var(--border-soft)]">
            <LabourSummaryRow label={`${activeScopeLabel} labour`} totals={activeLabourTotals} />
          </div>
        </div>
      </div>
      ) : null}
    </section>
  )
}
