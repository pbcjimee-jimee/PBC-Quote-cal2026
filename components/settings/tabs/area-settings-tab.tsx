'use client'

import { useState } from 'react'
import { AREA_SCOPE_LABELS, AREA_SCOPES } from '@/lib/areas/constants'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'

export interface AreaEditFormState {
  scope: AreaScope
  name: string
}

type AreaListScope = AreaScope | 'all'

export interface AreaSettingsTabProps {
  areas: AreaRecord[]
  areaScope: AreaScope
  areaName: string
  editingAreaId: string | null
  areaEditForm: AreaEditFormState
  message: string | null
  disabled: boolean
  isAddOpen: boolean
  onAddOpenChange: (open: boolean) => void
  onCancelAdd: () => void
  onAreaScopeChange: (scope: AreaScope) => void
  onAreaNameChange: (name: string) => void
  onAdd: () => void
  onStartEdit: (area: AreaRecord) => void
  onEditFormChange: (form: AreaEditFormState) => void
  onSave: () => void
  onCancel: () => void
  onDelete: (id: string) => void
}

export function filterSettingsAreas(areas: AreaRecord[], scope: AreaListScope, query: string): AreaRecord[] {
  const needle = query.trim().toLowerCase()
  return areas
    .filter((area) => scope === 'all' || area.scope === scope)
    .filter((area) => !needle || area.name.toLowerCase().includes(needle))
    .sort((left, right) => left.scope.localeCompare(right.scope) || left.position - right.position || left.name.localeCompare(right.name))
}

export default function AreaSettingsTab(props: AreaSettingsTabProps) {
  const [listScope, setListScope] = useState<AreaListScope>('all')
  const [query, setQuery] = useState('')
  const filteredAreas = filterSettingsAreas(props.areas, listScope, query)
  const hasActiveFilter = listScope !== 'all' || query.trim().length > 0

  return (
    <div className="pbc-formsection pbc-formsection--center">
      <div className="pbc-panelhead mb-4">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Areas</h2>
          <p className="pbc-panelsub">Manage reusable interior, exterior, and roof area labels for quote items.</p>
        </div>
      </div>

      <div className="pbc-settings-add">
        <button type="button" className="pbc-btn pbc-btn--ghost pbc-settings-add__toggle" aria-expanded={props.isAddOpen} onClick={() => props.onAddOpenChange(!props.isAddOpen)} disabled={props.disabled}>
          {props.isAddOpen ? 'Close add area' : 'Add area'}
        </button>
        {props.isAddOpen ? (
          <div className="pbc-settings-add__body">
            <form onSubmit={(event) => { event.preventDefault(); if (!props.disabled && props.areaName.trim()) props.onAdd() }} className="pbc-formgroup grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
              <label className="pbc-field"><span className="pbc-field__label">Scope</span><select value={props.areaScope} onChange={(event) => props.onAreaScopeChange(event.target.value as AreaScope)} className="pbc-input">{AREA_SCOPES.map((scope) => <option key={scope} value={scope}>{AREA_SCOPE_LABELS[scope]}</option>)}</select></label>
              <label className="pbc-field"><span className="pbc-field__label">Area name</span><input value={props.areaName} onChange={(event) => props.onAreaNameChange(event.target.value)} className="pbc-input" placeholder="e.g. eaves, fascia" /></label>
              <button type="submit" disabled={props.disabled || !props.areaName.trim()} className="pbc-btn pbc-btn--primary self-end">Add Area</button>
            </form>
            <button type="button" onClick={props.onCancelAdd} disabled={props.disabled} className="pbc-btn pbc-btn--ghost mt-3">Cancel add area</button>
          </div>
        ) : null}
      </div>
      {props.message ? <p className="pbc-alert pbc-alert--success mt-3">{props.message}</p> : null}

      <div className="pbc-area-filters mt-5">
        <label className="pbc-field"><span className="pbc-field__label">List scope</span><select aria-label="Filter areas by scope" value={listScope} onChange={(event) => setListScope(event.target.value as AreaListScope)} className="pbc-input"><option value="all">All scopes</option>{AREA_SCOPES.map((scope) => <option key={scope} value={scope}>{AREA_SCOPE_LABELS[scope]}</option>)}</select></label>
        <label className="pbc-field"><span className="pbc-field__label">Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="pbc-input" placeholder="Search areas..." /></label>
      </div>

      <div className="pbc-panelhead mt-5 mb-3"><div className="pbc-panelhead__copy"><h3 className="pbc-paneltitle">Area list</h3><p className="pbc-panelsub">{filteredAreas.length} of {props.areas.length} areas</p></div></div>
      <div className="pbc-list pbc-area-list">
        {filteredAreas.length === 0 ? <div className="pbc-empty"><p>{hasActiveFilter ? 'No areas match this filter.' : 'No areas yet.'}</p>{hasActiveFilter ? <button type="button" className="pbc-btn pbc-btn--ghost mt-3" onClick={() => { setListScope('all'); setQuery('') }}>Clear filters</button> : null}</div> : null}
        {filteredAreas.map((area) => {
          const isEditing = props.editingAreaId === area.id
          return (
            <div key={area.id} className={`pbc-listitem pbc-areaitem${isEditing ? ' pbc-areaitem--editing' : ''}`}>
              {isEditing ? (
                <div className="pbc-areaedit">
                  <div className="pbc-areaedit__fields">
                    <label className="pbc-field"><span className="pbc-field__label">Scope</span><select value={props.areaEditForm.scope} onChange={(event) => props.onEditFormChange({ ...props.areaEditForm, scope: event.target.value as AreaScope })} className="pbc-input">{AREA_SCOPES.map((scopeOption) => <option key={scopeOption} value={scopeOption}>{AREA_SCOPE_LABELS[scopeOption]}</option>)}</select></label>
                    <label className="pbc-field"><span className="pbc-field__label">Area name</span><input value={props.areaEditForm.name} onChange={(event) => props.onEditFormChange({ ...props.areaEditForm, name: event.target.value })} className="pbc-input" placeholder="Area name" /></label>
                  </div>
                  <div className="pbc-areaedit__actions"><button type="button" onClick={props.onSave} disabled={props.disabled || !props.areaEditForm.name.trim()} className="pbc-btn pbc-btn--primary pbc-btn--sm">Save</button><button type="button" onClick={props.onCancel} disabled={props.disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Cancel</button></div>
                </div>
              ) : <div className="pbc-listitem__main"><p className="pbc-listitem__title">{area.name}</p><p className="pbc-listitem__meta">{AREA_SCOPE_LABELS[area.scope]}</p></div>}
              {!isEditing ? <div className="pbc-tableactions"><button type="button" onClick={() => props.onStartEdit(area)} disabled={props.disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm" aria-label={`Edit area ${area.name}`}>Edit</button><button type="button" onClick={() => props.onDelete(area.id)} disabled={props.disabled} className="pbc-btn pbc-btn--danger pbc-btn--sm" aria-label={`Delete area ${area.name}`}>Delete</button></div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
