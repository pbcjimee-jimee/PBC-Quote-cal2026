'use client'

import { useRef } from 'react'
import type { ProductServiceRecord } from '@/lib/product-services/types'

export interface ProductServiceFormState {
  name: string
  description: string
  category: string
  unitPrice: string
  unitCost: string
  taxable: boolean
}

export interface ProductServicesTableProps {
  productServices: ProductServiceRecord[]
  editingProductServiceId?: string | null
  editForm?: ProductServiceFormState
  onEdit?: (productService: ProductServiceRecord) => void
  onCancel?: () => void
  onSave?: () => void
  onDelete?: (id: string) => void
  onFieldChange?: (field: keyof ProductServiceFormState, value: string | boolean) => void
  disabled?: boolean
}

export interface ProductServiceSettingsTabProps {
  productServices: ProductServiceRecord[]
  total: number
  activeItemCount: number
  query: string
  page: number
  newForm: ProductServiceFormState
  editingId: string | null
  editForm: ProductServiceFormState
  disabled: boolean
  message: string | null
  importError: string | null
  onQueryChange: (value: string) => void
  onPageChange: (page: number) => void
  onImport: (file: File | null) => void
  onExport: () => void
  onExportTemplate: () => void
  onNewFieldChange: (field: keyof ProductServiceFormState, value: string | boolean) => void
  onAdd: () => void
  onEdit: (productService: ProductServiceRecord) => void
  onCancelEdit: () => void
  onSave: () => void
  onDelete: (id: string) => void
  onEditFieldChange: (field: keyof ProductServiceFormState, value: string | boolean) => void
}

const PAGE_SIZE = 25

function trimFormValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function SettingsTablePager({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const safePage = Math.min(Math.max(page, 1), pageCount)
  const start = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const end = Math.min(safePage * PAGE_SIZE, total)

  return (
    <div className="pbc-tablepager">
      <span>Showing {start}-{end} of {total}</span>
      <div>
        <button type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Previous</button>
        <span className="mono">{safePage} / {pageCount}</span>
        <button type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= pageCount} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Next</button>
      </div>
    </div>
  )
}

export function ProductServiceAddItemForm({
  form = { name: '', description: '', category: 'Service', unitPrice: '', unitCost: '', taxable: true },
  onFieldChange = () => undefined,
  onAdd = () => undefined,
  disabled = false,
}: {
  form?: ProductServiceFormState
  onFieldChange?: (field: keyof ProductServiceFormState, value: string | boolean) => void
  onAdd?: () => void
  disabled?: boolean
}) {
  const canAdd = !disabled && trimFormValue(form.name) && trimFormValue(form.unitPrice)

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (canAdd) onAdd() }} className="pbc-formgroup">
      <h3 className="pbc-paneltitle">Add Product & Service</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1.4fr_0.8fr_0.7fr_0.7fr_auto]">
        <label className="pbc-field"><span className="pbc-field__label">Name</span><input value={form.name} onChange={(event) => onFieldChange('name', event.target.value)} className="pbc-input" placeholder="e.g. Ceiling" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Description</span><input value={form.description} onChange={(event) => onFieldChange('description', event.target.value)} className="pbc-input" placeholder="Public quote description" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Category</span><input value={form.category} onChange={(event) => onFieldChange('category', event.target.value)} className="pbc-input" placeholder="Service" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Unit Price</span><input value={form.unitPrice} onChange={(event) => onFieldChange('unitPrice', event.target.value)} inputMode="decimal" className="pbc-input" placeholder="0.00" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Unit Cost</span><input value={form.unitCost} onChange={(event) => onFieldChange('unitCost', event.target.value)} inputMode="decimal" className="pbc-input" placeholder="Optional" /></label>
        <label className="pbc-checkfield"><input type="checkbox" checked={form.taxable} onChange={(event) => onFieldChange('taxable', event.target.checked)} className="pbc-checkbox" />Taxable</label>
      </div>
      <button type="submit" disabled={!canAdd} className="pbc-btn pbc-btn--primary mt-3">Add Product & Service</button>
    </form>
  )
}

export function ProductServicesTable({
  productServices,
  editingProductServiceId = null,
  editForm = { name: '', description: '', category: '', unitPrice: '', unitCost: '', taxable: true },
  onEdit = () => undefined,
  onCancel = () => undefined,
  onSave = () => undefined,
  onDelete = () => undefined,
  onFieldChange = () => undefined,
  disabled = false,
}: ProductServicesTableProps) {
  return (
    <div className="pbc-tablewrap">
      <table className="pbc-table">
        <thead><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Description</th><th className="px-3 py-2 font-semibold">Category</th><th className="px-3 py-2 text-right font-semibold">Unit Price</th><th className="px-3 py-2 text-right font-semibold">Unit Cost</th><th className="px-3 py-2 font-semibold">Tax</th><th className="px-3 py-2 text-right font-semibold">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {productServices.map((item) => {
            const isEditing = editingProductServiceId === item.id
            return (
              <tr key={item.id} className="align-top">
                <td className="px-3 py-2">{isEditing ? <input value={editForm.name} onChange={(event) => onFieldChange('name', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext pbc-tabletext--strong">{item.name}</span>}</td>
                <td className="max-w-md px-3 py-2">{isEditing ? <textarea value={editForm.description} onChange={(event) => onFieldChange('description', event.target.value)} className="pbc-tableinput min-h-20" /> : <span className="line-clamp-3 pbc-tabletext">{item.description ?? '-'}</span>}</td>
                <td className="px-3 py-2">{isEditing ? <input value={editForm.category} onChange={(event) => onFieldChange('category', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext">{item.category ?? '-'}</span>}</td>
                <td className="px-3 py-2 text-right">{isEditing ? <input value={editForm.unitPrice} onChange={(event) => onFieldChange('unitPrice', event.target.value)} inputMode="decimal" className="pbc-tableinput text-right" /> : <span className="pbc-tabletext--money">${item.unitPrice}</span>}</td>
                <td className="px-3 py-2 text-right">{isEditing ? <input value={editForm.unitCost} onChange={(event) => onFieldChange('unitCost', event.target.value)} inputMode="decimal" className="pbc-tableinput text-right" /> : <span className="pbc-tabletext--money">{item.unitCost ? `$${item.unitCost}` : '-'}</span>}</td>
                <td className="px-3 py-2">{isEditing ? <input type="checkbox" checked={editForm.taxable} onChange={(event) => onFieldChange('taxable', event.target.checked)} className="pbc-checkbox" /> : <span className="pbc-tabletext">{item.taxable ? 'Taxable' : 'No tax'}</span>}</td>
                <td className="px-3 py-2"><div className="pbc-tableactions">{isEditing ? <><button type="button" onClick={onSave} disabled={disabled} className="pbc-btn pbc-btn--primary pbc-btn--sm">Save</button><button type="button" onClick={onCancel} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Cancel</button></> : <><button type="button" onClick={() => onEdit(item)} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Edit</button><button type="button" onClick={() => onDelete(item.id)} disabled={disabled} className="pbc-btn pbc-btn--danger pbc-btn--sm">Delete</button></>}</div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ProductServiceSettingsTab(props: ProductServiceSettingsTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="pbc-formsection pbc-formsection--center">
      <div className="pbc-panelhead mb-4">
        <div className="pbc-panelhead__copy"><h2 className="pbc-paneltitle">Product & Service</h2><p className="pbc-panelsub">{props.total} Product & Service items</p></div>
        <div className="pbc-panelhead__actions w-full sm:w-auto">
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} className="pbc-input sm:max-w-xs" placeholder="Search product or service..." />
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => { props.onImport(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} className="hidden" />
          <div className="pbc-panelhead__actions">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={props.disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Import CSV</button>
            <button type="button" onClick={props.onExport} disabled={props.disabled || props.activeItemCount === 0} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Export CSV</button>
            <button type="button" onClick={props.onExportTemplate} className="pbc-btn pbc-btn--ghost pbc-btn--sm">CSV Template</button>
          </div>
        </div>
      </div>
      <ProductServiceAddItemForm form={props.newForm} onFieldChange={props.onNewFieldChange} onAdd={props.onAdd} disabled={props.disabled} />
      <ProductServicesTable productServices={props.productServices} editingProductServiceId={props.editingId} editForm={props.editForm} onEdit={props.onEdit} onCancel={props.onCancelEdit} onSave={props.onSave} onDelete={props.onDelete} onFieldChange={props.onEditFieldChange} disabled={props.disabled} />
      <SettingsTablePager page={props.page} total={props.total} onPageChange={props.onPageChange} />
      {props.message ? <p className="pbc-alert pbc-alert--success mt-3">{props.message}</p> : null}
      {props.importError ? <p className="pbc-alert pbc-alert--danger mt-3">{props.importError}</p> : null}
    </div>
  )
}
