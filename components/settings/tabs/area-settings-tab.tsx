'use client'

import { AREA_SCOPE_LABELS, AREA_SCOPES } from '@/lib/areas/constants'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'

export interface AreaEditFormState {
  scope: AreaScope
  name: string
}

export interface AreaSettingsTabProps {
  areas: AreaRecord[]
  areaScope: AreaScope
  areaName: string
  editingAreaId: string | null
  areaEditForm: AreaEditFormState
  message: string | null
  disabled: boolean
  onAreaScopeChange: (scope: AreaScope) => void
  onAreaNameChange: (name: string) => void
  onAdd: () => void
  onStartEdit: (area: AreaRecord) => void
  onEditFormChange: (form: AreaEditFormState) => void
  onSave: () => void
  onCancel: () => void
  onDelete: (id: string) => void
}

export default function AreaSettingsTab(props: AreaSettingsTabProps) {
  return (
    <div className="pbc-formsection pbc-formsection--center">
      <div className="pbc-panelhead mb-4">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Areas</h2>
          <p className="pbc-panelsub">Manage reusable interior, exterior, and roof area labels for quote items.</p>
        </div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); if (!props.disabled && props.areaName.trim()) props.onAdd() }} className="pbc-formgroup grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className="pbc-field">
          <span className="pbc-field__label">Scope</span>
          <select value={props.areaScope} onChange={(event) => props.onAreaScopeChange(event.target.value as AreaScope)} className="pbc-input">
            {AREA_SCOPES.map((scope) => <option key={scope} value={scope}>{AREA_SCOPE_LABELS[scope]}</option>)}
          </select>
        </label>
        <label className="pbc-field"><span className="pbc-field__label">Area name</span><input value={props.areaName} onChange={(event) => props.onAreaNameChange(event.target.value)} className="pbc-input" placeholder="e.g. eaves, fascia" /></label>
        <button type="submit" disabled={props.disabled || !props.areaName.trim()} className="pbc-btn pbc-btn--primary self-end">Add Area</button>
      </form>
      {props.message ? <p className="pbc-alert pbc-alert--success mt-3">{props.message}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {AREA_SCOPES.map((scope) => {
          const scopedAreas = props.areas.filter((area) => area.scope === scope).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
          return (
            <section key={scope}>
              <div className="pbc-panelhead mb-3"><div className="pbc-panelhead__copy"><h3 className="pbc-paneltitle">{AREA_SCOPE_LABELS[scope]}</h3><p className="pbc-panelsub">{scopedAreas.length} areas</p></div></div>
              <div className="pbc-list">
                {scopedAreas.length === 0 ? <p className="pbc-empty">No areas yet.</p> : null}
                {scopedAreas.map((area) => {
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
                      ) : <div className="pbc-listitem__main"><p className="pbc-listitem__title">{area.name}</p><p className="pbc-listitem__meta">{AREA_SCOPE_LABELS[scope]}</p></div>}
                      {!isEditing ? <div className="pbc-tableactions"><button type="button" onClick={() => props.onStartEdit(area)} disabled={props.disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm" aria-label={`Edit area ${area.name}`}>Edit</button><button type="button" onClick={() => props.onDelete(area.id)} disabled={props.disabled} className="pbc-btn pbc-btn--danger pbc-btn--sm" aria-label={`Delete area ${area.name}`}>Delete</button></div> : null}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
