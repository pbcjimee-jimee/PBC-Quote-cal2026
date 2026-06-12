import { type FocusEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { AreaCreateResult, AreaScope, MaterialItem } from './types'
import type { AreaRecord } from '@/lib/areas/types'
import { DecimalInput } from './decimal-input'

interface MaterialRowProps {
  item: MaterialItem
  areas: AreaRecord[]
  areaScope?: AreaScope
  onCreateArea?: (scope: AreaScope, name: string) => Promise<AreaCreateResult>
  onChange: (item: MaterialItem) => void
  onRemove: () => void
}

function getScopeLabel(scope: AreaScope): string {
  return scope === 'interior' ? 'Interior' : 'Exterior'
}

function formatAreaLabel(area: AreaRecord): string {
  return `${getScopeLabel(area.scope)} - ${area.name}`
}

function getMatchingAreas(areas: AreaRecord[], query: string): AreaRecord[] {
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery) return areas

  return areas.filter((area) => {
    const label = formatAreaLabel(area).toLowerCase()
    return label.includes(trimmedQuery) || area.name.toLowerCase().includes(trimmedQuery)
  })
}

function getExactAreaMatch(areas: AreaRecord[], query: string): AreaRecord | undefined {
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery) return undefined

  return areas.find((area) => {
    return area.name.toLowerCase() === trimmedQuery || formatAreaLabel(area).toLowerCase() === trimmedQuery
  })
}

interface AreaPickerDropdownProps {
  query: string
  areas: AreaRecord[]
  canCreate: boolean
  isCreating: boolean
  selectedAreaId?: string
  onSelect: (area: AreaRecord) => void
  onClear: () => void
  onCreate: (name: string) => void
}

export function AreaPickerDropdown({
  query,
  areas,
  canCreate,
  isCreating,
  selectedAreaId,
  onSelect,
  onClear,
  onCreate,
}: AreaPickerDropdownProps) {
  const trimmedQuery = query.trim()
  const matchingAreas = getMatchingAreas(areas, query)
  const exactAreaMatch = getExactAreaMatch(areas, query)
  const shouldShowCreate = canCreate && trimmedQuery.length > 0 && !exactAreaMatch

  return (
    <div className="pbc-dropdown pbc-areapicker__dropdown" aria-label="Area dropdown">
      {!trimmedQuery ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="pbc-dropdownitem"
        >
          Select area
        </button>
      ) : null}
      {matchingAreas.map((area) => (
        <button
          key={area.id}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(area)}
          className={`pbc-dropdownitem${area.id === selectedAreaId ? ' pbc-dropdownitem--selected' : ''}`}
        >
          <span className="pbc-titletext block">{formatAreaLabel(area)}</span>
        </button>
      ))}
      {shouldShowCreate ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCreate(trimmedQuery)}
          className="pbc-dropdownitem font-semibold text-[var(--primary)]"
          disabled={isCreating}
        >
          {isCreating ? `Adding "${trimmedQuery}"...` : `Add "${trimmedQuery}" as custom area`}
        </button>
      ) : null}
      {matchingAreas.length === 0 && !shouldShowCreate ? (
        <div className="pbc-dropdownitem pbc-dropdownitem--muted">
          {canCreate ? 'Type an area name to add it.' : 'Add areas in Settings.'}
        </div>
      ) : null}
    </div>
  )
}

export function MaterialRow({ item, areas, areaScope, onCreateArea, onChange, onRemove }: MaterialRowProps) {
  const [isAddingArea, setIsAddingArea] = useState(false)
  const [areaQuery, setAreaQuery] = useState('')
  const [areaError, setAreaError] = useState<string | null>(null)
  const [isCreatingArea, setIsCreatingArea] = useState(false)
  const areaInputRef = useRef<HTMLInputElement>(null)
  const createScope = areaScope ?? item.areaScope ?? areas[0]?.scope ?? 'interior'
  const selectedArea = item.areaId ? areas.find((area) => area.id === item.areaId) : undefined
  const selectedAreaLabel = selectedArea
    ? formatAreaLabel(selectedArea)
    : item.areaName
      ? `${getScopeLabel(item.areaScope ?? createScope)} - ${item.areaName}`
      : ''
  const areaInputValue = isAddingArea ? areaQuery : selectedAreaLabel
  const areaPlaceholder = areas.length === 0 && !onCreateArea ? 'Add in Settings' : 'Select area'

  useEffect(() => {
    if (isAddingArea) areaInputRef.current?.focus()
  }, [isAddingArea])

  function selectArea(area: AreaRecord | undefined) {
    onChange({
      ...item,
      areaId: area?.id,
      areaName: area?.name,
      areaScope: area?.scope,
    })
    setAreaQuery('')
    setAreaError(null)
    setIsAddingArea(false)
  }

  async function submitNewArea(name = areaQuery) {
    const trimmedName = name.trim()
    if (!onCreateArea) return
    if (!trimmedName) {
      setAreaError('Enter an area name.')
      return
    }

    setIsCreatingArea(true)
    setAreaError(null)
    try {
      const result = await onCreateArea(createScope, trimmedName)
      if (!result.ok) {
        setAreaError(result.error)
        return
      }

      onChange({
        ...item,
        areaId: result.data.id,
        areaName: result.data.name,
        areaScope: result.data.scope,
      })
      setAreaQuery('')
      setIsAddingArea(false)
    } catch {
      setAreaError('Unable to add area.')
    } finally {
      setIsCreatingArea(false)
    }
  }

  function closeAreaPicker() {
    setIsAddingArea(false)
    setAreaQuery('')
    setAreaError(null)
  }

  function openAreaPicker() {
    setIsAddingArea(true)
    setAreaQuery('')
    setAreaError(null)
  }

  function handleAreaPickerBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof HTMLElement) || !event.currentTarget.contains(nextTarget)) {
      closeAreaPicker()
    }
  }

  function handleAreaInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAreaPicker()
      return
    }

    if (event.key !== 'Enter') return

    event.preventDefault()
    const exactAreaMatch = getExactAreaMatch(areas, areaQuery)
    if (exactAreaMatch) {
      selectArea(exactAreaMatch)
      return
    }

    const matchingAreas = getMatchingAreas(areas, areaQuery)
    if (!areaQuery.trim() && matchingAreas.length === 1) {
      selectArea(matchingAreas[0])
      return
    }

    if (areaQuery.trim() && onCreateArea) {
      void submitNewArea(areaQuery)
    }
  }

  return (
    <div className="pbc-softpanel pbc-materialrow">
      <div className="pbc-materialrow__head">
        <input
          type="text"
          value={item.name}
          onChange={(event) => onChange({ ...item, name: event.target.value })}
          aria-label="Material name"
          className="pbc-input pbc-materialrow__name min-w-0 flex-1 font-bold"
        />
        <button
          type="button"
          onClick={onRemove}
          className="pbc-iconbtn pbc-iconbtn--danger shrink-0"
          aria-label={`Remove ${item.name}`}
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
            <path d="M7.25 8.25v5.5M10 8.25v5.5M12.75 8.25v5.5M4.5 5.5h11M8.25 3.5h3.5M6 5.5l.5 10.25c.04.7.62 1.25 1.32 1.25h4.36c.7 0 1.28-.55 1.32-1.25L14 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="pbc-materialrow__fields pbc-materialrow__fields--pricing">
        <DecimalInput
          label="Qty"
          value={item.quantity}
          onValueChange={(value) => onChange({ ...item, quantity: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
        <DecimalInput
          label="RRP"
          value={item.marketPrice}
          onValueChange={(value) => onChange({ ...item, marketPrice: value, actualPrice: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0 font-semibold"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
        <div className="pbc-field pbc-materialrow__area min-w-0">
          <span className="pbc-field__label">Area</span>
          <div className="pbc-areapicker" onBlur={handleAreaPickerBlur}>
            <input
              ref={areaInputRef}
              type="text"
              value={areaInputValue}
              onFocus={openAreaPicker}
              onChange={(event) => {
                setIsAddingArea(true)
                setAreaQuery(event.target.value)
                setAreaError(null)
              }}
              onKeyDown={handleAreaInputKeyDown}
              className="pbc-input min-w-0"
              placeholder={areaPlaceholder}
              aria-label="Area"
              autoComplete="off"
            />
            {isAddingArea ? (
              <AreaPickerDropdown
                query={areaQuery}
                areas={areas}
                canCreate={Boolean(onCreateArea)}
                isCreating={isCreatingArea}
                selectedAreaId={item.areaId}
                onSelect={selectArea}
                onClear={() => selectArea(undefined)}
                onCreate={(name) => void submitNewArea(name)}
              />
            ) : null}
          </div>
          {areaError ? <span className="mt-2 block text-[11px] font-semibold text-[var(--danger)]">{areaError}</span> : null}
        </div>
        <DecimalInput
          label="Working Days"
          value={item.workingDays}
          onValueChange={(value) => onChange({ ...item, workingDays: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
        <DecimalInput
          label="Labour / Day"
          value={item.labourPerDay}
          onValueChange={(value) => onChange({ ...item, labourPerDay: value })}
          labelClassName="pbc-field min-w-0"
          inputClassName="pbc-input min-w-0"
          warningClassName="block text-[11px] font-normal text-amber-600"
        />
      </div>
    </div>
  )
}
