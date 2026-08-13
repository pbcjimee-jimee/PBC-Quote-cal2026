'use client'

import { useRef } from 'react'
import type { SettingsPaginationPresentation } from '@/components/settings/settings-form'
import type { ProductRecord } from '@/lib/products/types'

export interface MaterialFormState {
  manufacturer: string
  productLine: string
  base: string
  sheen: string
  unit: string
  rrpPrice: string
}

export interface MaterialEditFormState extends MaterialFormState {
  volumeLitres: string
}

export interface MaterialProductsTableProps {
  products: ProductRecord[]
  editingProductId?: string | null
  editForm?: MaterialEditFormState
  onEdit?: (product: ProductRecord) => void
  onCancel?: () => void
  onSave?: () => void
  onDelete?: (id: string) => void
  onFieldChange?: (field: keyof MaterialEditFormState, value: string) => void
  disabled?: boolean
}

export interface MaterialAddItemFormProps {
  form?: MaterialFormState
  onFieldChange?: (field: keyof MaterialFormState, value: string) => void
  onAdd?: () => void
  disabled?: boolean
}

export interface MaterialSettingsTabProps {
  products: ProductRecord[]
  pagination: SettingsPaginationPresentation
  activeProductCount: number
  query: string
  newMaterialForm: MaterialFormState
  editingProductId: string | null
  editForm: MaterialEditFormState
  disabled: boolean
  message: string | null
  importError: string | null
  onQueryChange: (value: string) => void
  onPageChange: (page: number) => void
  onImport: (file: File | null) => void
  onExport: () => void
  onExportTemplate: () => void
  onNewFieldChange: (field: keyof MaterialFormState, value: string) => void
  onAdd: () => void
  onEdit: (product: ProductRecord) => void
  onCancelEdit: () => void
  onSave: () => void
  onDelete: (id: string) => void
  onEditFieldChange: (field: keyof MaterialEditFormState, value: string) => void
}

function trimFormValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function SettingsTablePager({ pagination, onPageChange }: { pagination: SettingsPaginationPresentation; onPageChange: (page: number) => void }) {
  return (
    <div className="pbc-tablepager">
      <span>Showing {pagination.start}-{pagination.end} of {pagination.total}</span>
      <div>
        <button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={!pagination.canPrevious} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Previous</button>
        <span className="mono">{pagination.page} / {pagination.pageCount}</span>
        <button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={!pagination.canNext} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Next</button>
      </div>
    </div>
  )
}

export function MaterialAddItemForm({
  form = { manufacturer: '', productLine: '', base: '', sheen: '', unit: '', rrpPrice: '' },
  onFieldChange = () => undefined,
  onAdd = () => undefined,
  disabled = false,
}: MaterialAddItemFormProps) {
  const canAdd = !disabled && trimFormValue(form.productLine) && trimFormValue(form.rrpPrice)

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (canAdd) onAdd() }} className="pbc-formgroup">
      <h3 className="pbc-paneltitle">Add Item</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="pbc-field"><span className="pbc-field__label">Brand</span><input value={form.manufacturer} onChange={(event) => onFieldChange('manufacturer', event.target.value)} className="pbc-input" placeholder="e.g. Dulux" /></label>
        <label className="pbc-field sm:col-span-2"><span className="pbc-field__label">Material or service name</span><input value={form.productLine} onChange={(event) => onFieldChange('productLine', event.target.value)} className="pbc-input" placeholder="e.g. Minor drywall repair" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Base</span><input value={form.base} onChange={(event) => onFieldChange('base', event.target.value)} className="pbc-input" placeholder="Optional" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Sheen/Finish</span><input value={form.sheen} onChange={(event) => onFieldChange('sheen', event.target.value)} className="pbc-input" placeholder="Optional" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Unit</span><input value={form.unit} onChange={(event) => onFieldChange('unit', event.target.value)} className="pbc-input" placeholder="each / 4L" /></label>
        <label className="pbc-field"><span className="pbc-field__label">Price</span><input value={form.rrpPrice} onChange={(event) => onFieldChange('rrpPrice', event.target.value)} inputMode="decimal" className="pbc-input" placeholder="0.00" /></label>
      </div>
      <button type="submit" disabled={!canAdd} className="pbc-btn pbc-btn--primary mt-3">Add Item</button>
    </form>
  )
}

export function MaterialProductsTable({
  products,
  editingProductId = null,
  editForm = { manufacturer: '', productLine: '', base: '', sheen: '', volumeLitres: '', unit: '', rrpPrice: '' },
  onEdit = () => undefined,
  onCancel = () => undefined,
  onSave = () => undefined,
  onDelete = () => undefined,
  onFieldChange = () => undefined,
  disabled = false,
}: MaterialProductsTableProps) {
  return (
    <div className="pbc-tablewrap">
      <table className="pbc-table">
        <thead><tr><th className="px-3 py-2 font-semibold">Brand</th><th className="px-3 py-2 font-semibold">Kind</th><th className="px-3 py-2 font-semibold">Base</th><th className="px-3 py-2 font-semibold">Sheen/Finish</th><th className="px-3 py-2 font-semibold">Volume (L)</th><th className="px-3 py-2 text-right font-semibold">Price (RRP)</th><th className="px-3 py-2 text-right font-semibold">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => {
            const isEditing = editingProductId === product.id
            return (
              <tr key={product.id} className="align-top">
                <td className="px-3 py-2">{isEditing ? <input value={editForm.manufacturer} onChange={(event) => onFieldChange('manufacturer', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext pbc-tabletext--strong">{product.manufacturer ?? '-'}</span>}</td>
                <td className="px-3 py-2">{isEditing ? <input value={editForm.productLine} onChange={(event) => onFieldChange('productLine', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext pbc-tabletext--strong">{product.productLine ?? product.type ?? '-'}</span>}</td>
                <td className="px-3 py-2">{isEditing ? <input value={editForm.base} onChange={(event) => onFieldChange('base', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext">{product.base ?? '-'}</span>}</td>
                <td className="px-3 py-2">{isEditing ? <input value={editForm.sheen} onChange={(event) => onFieldChange('sheen', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext">{product.sheen ?? '-'}</span>}</td>
                <td className="px-3 py-2">{isEditing ? <input value={editForm.volumeLitres} onChange={(event) => onFieldChange('volumeLitres', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext">{product.volumeLitres ? `${product.volumeLitres}L` : product.unit}</span>}</td>
                <td className="px-3 py-2 text-right">{isEditing ? <input value={editForm.rrpPrice} onChange={(event) => onFieldChange('rrpPrice', event.target.value)} inputMode="decimal" className="pbc-tableinput text-right" /> : <span className="pbc-tabletext--money">${product.rrpPrice ?? product.marketPrice}</span>}</td>
                <td className="px-3 py-2">
                  <div className="pbc-tableactions">
                    {isEditing ? <><button type="button" onClick={onSave} disabled={disabled} className="pbc-btn pbc-btn--primary pbc-btn--sm">Save</button><button type="button" onClick={onCancel} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Cancel</button></> : <><button type="button" onClick={() => onEdit(product)} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Edit</button><button type="button" onClick={() => onDelete(product.id)} disabled={disabled} className="pbc-btn pbc-btn--danger pbc-btn--sm">Delete</button></>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function MaterialSettingsTab(props: MaterialSettingsTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="pbc-formsection pbc-formsection--center">
      <div className="pbc-panelhead mb-4">
        <div className="pbc-panelhead__copy"><h2 className="pbc-paneltitle">Paint Materials</h2><p className="pbc-panelsub">{props.pagination.total} materials</p></div>
        <div className="pbc-panelhead__actions w-full sm:w-auto">
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} className="pbc-input sm:max-w-xs" placeholder="Search material..." />
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => { props.onImport(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} className="hidden" />
          <div className="pbc-panelhead__actions">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={props.disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Import CSV</button>
            <button type="button" onClick={props.onExport} disabled={props.disabled || props.activeProductCount === 0} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Export CSV</button>
            <button type="button" onClick={props.onExportTemplate} className="pbc-btn pbc-btn--ghost pbc-btn--sm">CSV Template</button>
          </div>
        </div>
      </div>
      <MaterialAddItemForm form={props.newMaterialForm} onFieldChange={props.onNewFieldChange} onAdd={props.onAdd} disabled={props.disabled} />
      <MaterialProductsTable products={props.products} editingProductId={props.editingProductId} editForm={props.editForm} onEdit={props.onEdit} onCancel={props.onCancelEdit} onSave={props.onSave} onDelete={props.onDelete} onFieldChange={props.onEditFieldChange} disabled={props.disabled} />
      <SettingsTablePager pagination={props.pagination} onPageChange={props.onPageChange} />
      {props.message ? <p className="pbc-alert pbc-alert--success mt-3">{props.message}</p> : null}
      {props.importError ? <p className="pbc-alert pbc-alert--danger mt-3">{props.importError}</p> : null}
    </div>
  )
}
