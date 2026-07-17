'use client'

import { useRef, useState, useTransition } from 'react'
import { createArea, deleteArea, listAreas, updateArea } from '@/lib/actions/areas'
import { createProduct, deleteProduct, importProductsCSV, listProducts, updateProduct } from '@/lib/actions/products'
import {
  createProductService,
  deleteProductService,
  importProductServicesCSV,
  listProductServices,
  updateProductService,
} from '@/lib/actions/product-services'
import {
  createQuoteLineTemplate,
  deleteQuoteLineTemplate,
  listQuoteLineTemplates,
  updateQuoteLineTemplate,
} from '@/lib/actions/quote-line-templates'
import { updatePricingSettings } from '@/lib/actions/settings'
import type { ActionResult } from '@/lib/actions/types'
import { Icons } from '@/components/ui/icons'
import { JobberProductServiceEditor } from '@/components/quote-form/lazy-panels'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'
import { AREA_SCOPE_LABELS, AREA_SCOPES } from '@/lib/areas/constants'
import type { PricingSettings } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

type MaterialFormState = {
  manufacturer: string
  productLine: string
  base: string
  sheen: string
  unit: string
  rrpPrice: string
}

type MaterialEditFormState = MaterialFormState & {
  volumeLitres: string
}

type ProductServiceFormState = {
  name: string
  description: string
  category: string
  unitPrice: string
  unitCost: string
  taxable: boolean
}

type AreaEditFormState = {
  scope: AreaScope
  name: string
}

type MaterialUpdateInput = {
  id: string
  manufacturer: string | null
  productLine: string | null
  base: string | null
  sheen: string | null
  volumeLitres?: number
  unit?: string
  rrpPrice?: number
}

interface SettingsFormProps {
  initialAreas?: AreaRecord[]
  initialProducts?: ProductRecord[]
  initialProductServices?: ProductServiceRecord[]
  initialQuoteLineTemplates?: QuoteLineTemplateRecord[]
  initialSettings: PricingSettings
}

type SettingsTab = 'labour' | 'material' | 'productService' | 'template' | 'area'
type SettingsResource = 'areas' | 'products' | 'productServices' | 'quoteLineTemplates'

const SETTINGS_TAB_RESOURCES: Record<SettingsTab, SettingsResource[]> = {
  labour: [],
  material: ['products'],
  productService: ['productServices'],
  template: ['quoteLineTemplates', 'productServices'],
  area: ['areas'],
}

function formatSettingsLoadError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load this settings tab.'
}

interface MaterialProductsTableProps {
  products: ProductRecord[]
  editingProductId?: string | null
  editForm?: MaterialEditFormState
  onEdit?: (product: ProductRecord) => void
  onCancel?: () => void
  onSave?: () => void
  onDelete?: (id: string) => void
  onFieldChange?: (field: keyof Required<MaterialProductsTableProps>['editForm'], value: string) => void
  disabled?: boolean
}

interface MaterialAddItemFormProps {
  form?: MaterialFormState
  onFieldChange?: (field: keyof Required<MaterialAddItemFormProps>['form'], value: string) => void
  onAdd?: () => void
  disabled?: boolean
}

function toFormString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function trimFormValue(value: unknown): string {
  return toFormString(value).trim()
}

function optionalNumber(value: unknown): number | undefined {
  const trimmed = trimFormValue(value)
  return trimmed ? Number(trimmed) : undefined
}

export function formatAreaMutationError(action: 'add' | 'update' | 'delete', error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return `Failed to ${action} area: ${message}`
}

export function buildMaterialUpdateInput(
  id: string,
  form: Partial<Record<keyof MaterialEditFormState, unknown>>
): MaterialUpdateInput {
  return {
    id,
    manufacturer: trimFormValue(form.manufacturer) || null,
    productLine: trimFormValue(form.productLine) || null,
    base: trimFormValue(form.base) || null,
    sheen: trimFormValue(form.sheen) || null,
    volumeLitres: optionalNumber(form.volumeLitres),
    unit: trimFormValue(form.unit) || undefined,
    rrpPrice: optionalNumber(form.rrpPrice),
  }
}

function toPercent(value: number | { toString(): string }): string {
  return String(Number(value.toString()) * 100)
}

function fromPercent(value: string): number {
  const trimmed = (value || '').trim()
  if (!trimmed) return 0

  const hasPercent = trimmed.includes('%')
  const numeric = Number(trimmed.replace('%', ''))
  if (Number.isNaN(numeric)) return Number.NaN

  if (hasPercent) return numeric / 100
  if (numeric > 1) return numeric / 100
  return numeric
}

type PricingSettingsFormState = {
  f1LabourRate: string
  f2LabourRate: string
  f3LabourRate: string
  f4LabourRate: string
  f5LabourRate: string
  roofLabourRate: string
  f2Margin: string
  f3Margin: string
  f4Margin: string
  f5Margin: string
}

function validateMarginSettings(values: Pick<ReturnType<typeof buildPricingSettingsPayload>, 'f2Margin' | 'f3Margin' | 'f4Margin' | 'f5Margin'>): string | null {
  const margins = [values.f2Margin, values.f3Margin, values.f4Margin, values.f5Margin]
  if (margins.some((margin) => Number.isNaN(margin))) return 'Margins must be valid numbers.'
  if (margins.some((margin) => margin < 0)) return 'Margins must be 0% or higher.'
  if (margins.some((margin) => margin >= 1)) return 'Margins must be less than 100%.'
  return null
}

function buildPricingSettingsPayload(settings: PricingSettingsFormState) {
  return {
    f1LabourRate: toRate(settings.f1LabourRate),
    f2LabourRate: toRate(settings.f2LabourRate),
    f3LabourRate: toRate(settings.f3LabourRate),
    f4LabourRate: toRate(settings.f4LabourRate),
    f5LabourRate: toRate(settings.f5LabourRate),
    roofLabourRate: toRate(settings.roofLabourRate),
    f2Margin: fromPercent(settings.f2Margin),
    f3Margin: fromPercent(settings.f3Margin),
    f4Margin: fromPercent(settings.f4Margin),
    f5Margin: fromPercent(settings.f5Margin),
  }
}

type PricingSettingsPayload = ReturnType<typeof buildPricingSettingsPayload>
type PricingSettingsUpdate = (payload: PricingSettingsPayload) => Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
>

export async function savePricingSettingsForm(
  settings: PricingSettingsFormState,
  updateSettings: PricingSettingsUpdate = updatePricingSettings
): Promise<string> {
  const payload = buildPricingSettingsPayload(settings)
  const marginError = validateMarginSettings(payload)
  if (marginError) return marginError

  const result = await updateSettings(payload)
  return result.ok ? 'Settings saved for future quotes.' : result.error
}

function toRate(value: string): number {
  return Number((value || '').trim().replace(/,/g, ''))
}

function toCsvSafe(value: unknown): string {
  const text = toFormString(value)
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const MATERIAL_CSV_HEADER = ['Brand', 'Kind', 'Base', 'Sheen/Finish', 'Volume (L)', 'Price (RRP)']

const MATERIAL_CSV_TEMPLATE_ROWS = [
  ['Dulux', 'Acratex', 'Monument', 'Low Sheen', '15', '199.99'],
  ['Bunnings', 'Wall Paint', 'White', 'Matte', '4', '89.90'],
]

const PRODUCT_SERVICE_CSV_HEADER = [
  'Name',
  'Description',
  'Category',
  'Unit Price',
  'Unit Cost',
  'Bookable',
  'Duration Minutes',
  'Quantity Enabled',
  'Minimum Quantity',
  'Maximum Quantity',
  'Taxable',
  'Active',
]

const PRODUCT_SERVICE_CSV_TEMPLATE_ROWS = [
  ['Ceiling', 'All interior ceilings', 'Service', '14.50', '0.00', 'false', '', 'true', '1', '', 'true', 'true'],
  ['Touch up', 'Patch and repaint visible marks', 'Service', '120.00', '80.00', 'false', '60', 'false', '', '', 'true', 'true'],
]

const SETTINGS_TABLE_PAGE_SIZE = 25

function getPageCount(total: number): number {
  return Math.max(Math.ceil(total / SETTINGS_TABLE_PAGE_SIZE), 1)
}

function getSafePage(page: number, total: number): number {
  return Math.min(Math.max(page, 1), getPageCount(total))
}

function SettingsTablePager({
  page,
  total,
  onPageChange,
}: {
  page: number
  total: number
  onPageChange: (page: number) => void
}) {
  const safePage = getSafePage(page, total)
  const pageCount = getPageCount(total)
  const start = total === 0 ? 0 : (safePage - 1) * SETTINGS_TABLE_PAGE_SIZE + 1
  const end = Math.min(safePage * SETTINGS_TABLE_PAGE_SIZE, total)

  return (
    <div className="pbc-tablepager">
      <span>Showing {start}-{end} of {total}</span>
      <div>
        <button type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          Previous
        </button>
        <span className="mono">{safePage} / {pageCount}</span>
        <button type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= pageCount} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          Next
        </button>
      </div>
    </div>
  )
}

function buildMaterialCsv(products: ProductRecord[]): string {
  const lines = products.map((product) => {
    const price = product.rrpPrice ?? product.marketPrice
    const row = [
      product.manufacturer ?? '',
      product.productLine ?? product.type ?? '',
      product.base ?? '',
      product.sheen ?? '',
      product.volumeLitres ?? '',
      price,
    ]

    return row.map((value) => toCsvSafe(value)).join(',')
  })

  return [MATERIAL_CSV_HEADER.join(','), ...lines].join('\n')
}

function buildMaterialCsvTemplate(): string {
  const lines = MATERIAL_CSV_TEMPLATE_ROWS.map((row) => row.map(toCsvSafe).join(','))
  return [MATERIAL_CSV_HEADER.join(','), ...lines].join('\n')
}

function buildProductServiceCsv(productServices: ProductServiceRecord[]): string {
  const lines = productServices.map((item) => [
    item.name,
    item.description ?? '',
    item.category ?? '',
    item.unitPrice,
    item.unitCost ?? '',
    String(item.bookable),
    item.durationMinutes ?? '',
    String(item.quantityEnabled),
    item.minimumQuantity ?? '',
    item.maximumQuantity ?? '',
    String(item.taxable),
    String(item.active),
  ].map(toCsvSafe).join(','))

  return [PRODUCT_SERVICE_CSV_HEADER.join(','), ...lines].join('\n')
}

function buildProductServiceCsvTemplate(): string {
  const lines = PRODUCT_SERVICE_CSV_TEMPLATE_ROWS.map((row) => row.map(toCsvSafe).join(','))
  return [PRODUCT_SERVICE_CSV_HEADER.join(','), ...lines].join('\n')
}

function downloadTextFile(filename: string, text: string): void {
  if (typeof window === 'undefined') return

  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function MaterialCsvTemplate(): string {
  return buildMaterialCsvTemplate()
}

export function ProductServiceCsvTemplate(): string {
  return buildProductServiceCsvTemplate()
}

export function MaterialAddItemForm({
  form = {
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    unit: '',
    rrpPrice: '',
  },
  onFieldChange = () => undefined,
  onAdd = () => undefined,
  disabled = false,
}: MaterialAddItemFormProps) {
  const canAdd = !disabled && trimFormValue(form.productLine) && trimFormValue(form.rrpPrice)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canAdd) onAdd()
      }}
      className="pbc-formgroup"
    >
      <h3 className="pbc-paneltitle">Add Item</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="pbc-field">
          <span className="pbc-field__label">Brand</span>
          <input
            value={form.manufacturer}
            onChange={(event) => onFieldChange('manufacturer', event.target.value)}
            className="pbc-input"
            placeholder="e.g. Dulux"
          />
        </label>
        <label className="pbc-field sm:col-span-2">
          <span className="pbc-field__label">Material or service name</span>
          <input
            value={form.productLine}
            onChange={(event) => onFieldChange('productLine', event.target.value)}
            className="pbc-input"
            placeholder="e.g. Minor drywall repair"
          />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Base</span>
          <input
            value={form.base}
            onChange={(event) => onFieldChange('base', event.target.value)}
            className="pbc-input"
            placeholder="Optional"
          />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Sheen/Finish</span>
          <input
            value={form.sheen}
            onChange={(event) => onFieldChange('sheen', event.target.value)}
            className="pbc-input"
            placeholder="Optional"
          />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Unit</span>
          <input
            value={form.unit}
            onChange={(event) => onFieldChange('unit', event.target.value)}
            className="pbc-input"
            placeholder="each / 4L"
          />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Price</span>
          <input
            value={form.rrpPrice}
            onChange={(event) => onFieldChange('rrpPrice', event.target.value)}
            inputMode="decimal"
            className="pbc-input"
            placeholder="0.00"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!canAdd}
        className="pbc-btn pbc-btn--primary mt-3"
      >
        Add Item
      </button>
    </form>
  )
}

export function MaterialProductsTable({
  products,
  editingProductId = null,
  editForm = {
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    volumeLitres: '',
    unit: '',
    rrpPrice: '',
  },
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
        <thead>
          <tr>
            <th className="px-3 py-2 font-semibold">Brand</th>
            <th className="px-3 py-2 font-semibold">Kind</th>
            <th className="px-3 py-2 font-semibold">Base</th>
            <th className="px-3 py-2 font-semibold">Sheen/Finish</th>
            <th className="px-3 py-2 font-semibold">Volume (L)</th>
            <th className="px-3 py-2 text-right font-semibold">Price (RRP)</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => {
            const isEditing = editingProductId === product.id
            return (
              <tr key={product.id} className="align-top">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.manufacturer}
                      onChange={(event) => onFieldChange('manufacturer', event.target.value)}
                      className="pbc-tableinput"
                    />
                  ) : (
                    <span className="pbc-tabletext pbc-tabletext--strong">{product.manufacturer ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.productLine}
                      onChange={(event) => onFieldChange('productLine', event.target.value)}
                      className="pbc-tableinput"
                    />
                  ) : (
                    <span className="pbc-tabletext pbc-tabletext--strong">{product.productLine ?? product.type ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input value={editForm.base} onChange={(event) => onFieldChange('base', event.target.value)} className="pbc-tableinput" />
                  ) : (
                    <span className="pbc-tabletext">{product.base ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input value={editForm.sheen} onChange={(event) => onFieldChange('sheen', event.target.value)} className="pbc-tableinput" />
                  ) : (
                    <span className="pbc-tabletext">{product.sheen ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.volumeLitres}
                      onChange={(event) => onFieldChange('volumeLitres', event.target.value)}
                      className="pbc-tableinput"
                    />
                  ) : (
                    <span className="pbc-tabletext">{product.volumeLitres ? `${product.volumeLitres}L` : product.unit}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      value={editForm.rrpPrice}
                      onChange={(event) => onFieldChange('rrpPrice', event.target.value)}
                      inputMode="decimal"
                      className="pbc-tableinput text-right"
                    />
                  ) : (
                    <span className="pbc-tabletext--money">${product.rrpPrice ?? product.marketPrice}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="pbc-tableactions">
                      <button
                        type="button"
                        onClick={() => onSave()}
                        disabled={disabled}
                        className="pbc-btn pbc-btn--primary pbc-btn--sm"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={onCancel}
                        disabled={disabled}
                        className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="pbc-tableactions">
                      <button
                        type="button"
                        onClick={() => onEdit(product)}
                        disabled={disabled}
                        className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(product.id)}
                        disabled={disabled}
                        className="pbc-btn pbc-btn--danger pbc-btn--sm"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface ProductServicesTableProps {
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

export function ProductServiceAddItemForm({
  form = {
    name: '',
    description: '',
    category: 'Service',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  },
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
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canAdd) onAdd()
      }}
      className="pbc-formgroup"
    >
      <h3 className="pbc-paneltitle">Add Product & Service</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1.4fr_0.8fr_0.7fr_0.7fr_auto]">
        <label className="pbc-field">
          <span className="pbc-field__label">Name</span>
          <input value={form.name} onChange={(event) => onFieldChange('name', event.target.value)} className="pbc-input" placeholder="e.g. Ceiling" />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Description</span>
          <input value={form.description} onChange={(event) => onFieldChange('description', event.target.value)} className="pbc-input" placeholder="Public quote description" />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Category</span>
          <input value={form.category} onChange={(event) => onFieldChange('category', event.target.value)} className="pbc-input" placeholder="Service" />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Unit Price</span>
          <input value={form.unitPrice} onChange={(event) => onFieldChange('unitPrice', event.target.value)} inputMode="decimal" className="pbc-input" placeholder="0.00" />
        </label>
        <label className="pbc-field">
          <span className="pbc-field__label">Unit Cost</span>
          <input value={form.unitCost} onChange={(event) => onFieldChange('unitCost', event.target.value)} inputMode="decimal" className="pbc-input" placeholder="Optional" />
        </label>
        <label className="pbc-checkfield">
          <input type="checkbox" checked={form.taxable} onChange={(event) => onFieldChange('taxable', event.target.checked)} className="pbc-checkbox" />
          Taxable
        </label>
      </div>
      <button type="submit" disabled={!canAdd} className="pbc-btn pbc-btn--primary mt-3">
        Add Product & Service
      </button>
    </form>
  )
}

export function ProductServicesTable({
  productServices,
  editingProductServiceId = null,
  editForm = {
    name: '',
    description: '',
    category: '',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  },
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
        <thead>
          <tr>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
            <th className="px-3 py-2 text-right font-semibold">Unit Cost</th>
            <th className="px-3 py-2 font-semibold">Tax</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {productServices.map((item) => {
            const isEditing = editingProductServiceId === item.id
            return (
              <tr key={item.id} className="align-top">
                <td className="px-3 py-2">
                  {isEditing ? <input value={editForm.name} onChange={(event) => onFieldChange('name', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext pbc-tabletext--strong">{item.name}</span>}
                </td>
                <td className="max-w-md px-3 py-2">
                  {isEditing ? <textarea value={editForm.description} onChange={(event) => onFieldChange('description', event.target.value)} className="pbc-tableinput min-h-20" /> : <span className="line-clamp-3 pbc-tabletext">{item.description ?? '-'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? <input value={editForm.category} onChange={(event) => onFieldChange('category', event.target.value)} className="pbc-tableinput" /> : <span className="pbc-tabletext">{item.category ?? '-'}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? <input value={editForm.unitPrice} onChange={(event) => onFieldChange('unitPrice', event.target.value)} inputMode="decimal" className="pbc-tableinput text-right" /> : <span className="pbc-tabletext--money">${item.unitPrice}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? <input value={editForm.unitCost} onChange={(event) => onFieldChange('unitCost', event.target.value)} inputMode="decimal" className="pbc-tableinput text-right" /> : <span className="pbc-tabletext--money">{item.unitCost ? `$${item.unitCost}` : '-'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input type="checkbox" checked={editForm.taxable} onChange={(event) => onFieldChange('taxable', event.target.checked)} className="pbc-checkbox" />
                  ) : (
                    <span className="pbc-tabletext">{item.taxable ? 'Taxable' : 'No tax'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="pbc-tableactions">
                      <button type="button" onClick={onSave} disabled={disabled} className="pbc-btn pbc-btn--primary pbc-btn--sm">Save</button>
                      <button type="button" onClick={onCancel} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Cancel</button>
                    </div>
                  ) : (
                    <div className="pbc-tableactions">
                      <button type="button" onClick={() => onEdit(item)} disabled={disabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">Edit</button>
                      <button type="button" onClick={() => onDelete(item.id)} disabled={disabled} className="pbc-btn pbc-btn--danger pbc-btn--sm">Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function templateItemToDraft(item: QuoteLineTemplateRecord['items'][number]): JobberQuoteLineItemDraft {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description ?? '',
    quantity: item.quantity ?? '1',
    unitPrice: item.unitPrice ?? '0',
    taxable: item.kind === 'line_item' ? item.taxable : false,
    clientVisible: item.clientVisible,
    linkedProductOrServiceId: item.linkedProductOrServiceId ?? undefined,
  }
}

function templateLinesToInput(lines: JobberQuoteLineItemDraft[]) {
  return lines.map((line, index) => ({
    kind: line.kind,
    name: trimFormValue(line.name) || (line.kind === 'text' ? `Text ${index + 1}` : `Line item ${index + 1}`),
    description: trimFormValue(line.description) || null,
    quantity: line.kind === 'line_item' ? optionalNumber(line.quantity) : undefined,
    unitPrice: line.kind === 'line_item' ? optionalNumber(line.unitPrice) : undefined,
    taxable: line.kind === 'line_item' ? line.taxable : false,
    clientVisible: line.clientVisible,
    linkedProductOrServiceId: line.linkedProductOrServiceId ?? null,
    position: index,
  }))
}

export function QuoteLineTemplateEditor({
  templates,
  productServices,
  disabled = false,
  onTemplatesChange = () => undefined,
}: {
  templates: QuoteLineTemplateRecord[]
  productServices: ProductServiceRecord[]
  disabled?: boolean
  onTemplatesChange?: (templates: QuoteLineTemplateRecord[]) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateLines, setTemplateLines] = useState<JobberQuoteLineItemDraft[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const isDisabled = disabled || isPending

  function resetForm() {
    setEditingTemplateId(null)
    setTemplateName('')
    setTemplateLines([])
  }

  function editTemplate(template: QuoteLineTemplateRecord) {
    setMessage(null)
    setEditingTemplateId(template.id)
    setTemplateName(template.name)
    setTemplateLines(template.items.map(templateItemToDraft))
  }

  function saveTemplate() {
    const name = trimFormValue(templateName)
    if (!name) {
      setMessage('Template name is required.')
      return
    }

    setMessage(null)
    startTransition(async () => {
      const payload = {
        name,
        items: templateLinesToInput(templateLines),
      }
      const result = editingTemplateId
        ? await updateQuoteLineTemplate({ id: editingTemplateId, ...payload })
        : await createQuoteLineTemplate(payload)

      if (result.ok) {
        onTemplatesChange(editingTemplateId
          ? templates.map((template) => template.id === result.data.id ? result.data : template)
          : [result.data, ...templates]
        )
        resetForm()
        setMessage('Template saved.')
      } else {
        setMessage(result.error)
      }
    })
  }

  function removeTemplate(id: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await deleteQuoteLineTemplate({ id })
      if (result.ok) {
        onTemplatesChange(templates.filter((template) => template.id !== id))
        if (editingTemplateId === id) resetForm()
        setMessage('Template deleted.')
      } else {
        setMessage(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Template</h2>
          <p className="pbc-panelsub">Save reusable Product / Service line item and text item sets for new quotes.</p>
        </div>
      </div>

      <div className="pbc-formgroup">
        <label className="pbc-field">
          <span className="pbc-field__label">Template name</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="pbc-input"
            placeholder="e.g. Standard interior quote"
          />
        </label>
        <JobberProductServiceEditor
          value={templateLines}
          productServices={productServices}
          onChange={setTemplateLines}
        />
        <div className="pbc-panelhead__actions mt-4">
          <button type="button" onClick={saveTemplate} disabled={isDisabled || !trimFormValue(templateName)} className="pbc-btn pbc-btn--primary">
            {isPending ? 'Saving...' : 'Save Template'}
          </button>
          {editingTemplateId ? (
            <button type="button" onClick={resetForm} disabled={isDisabled} className="pbc-btn pbc-btn--ghost">
              Cancel
            </button>
          ) : null}
          {message ? <p className="pbc-panelsub">{message}</p> : null}
        </div>
      </div>

      <div className="pbc-list">
        {templates.length === 0 ? <p className="pbc-empty">No templates saved yet.</p> : null}
        {templates.map((template) => (
          <div key={template.id} className="pbc-listitem">
            <div className="pbc-listitem__main">
              <p className="pbc-listitem__title">{template.name}</p>
              <p className="pbc-listitem__meta">{template.items.length} line items</p>
              {template.items.length > 0 ? (
                <p className="pbc-listitem__sub">{template.items.map((item) => item.name).join(', ')}</p>
              ) : null}
            </div>
            <div className="pbc-panelhead__actions">
              <button type="button" onClick={() => editTemplate(template)} disabled={isDisabled} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                Edit
              </button>
              <button type="button" onClick={() => removeTemplate(template.id)} disabled={isDisabled} className="pbc-btn pbc-btn--danger pbc-btn--sm">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SettingsForm({
  initialAreas,
  initialProducts,
  initialProductServices,
  initialQuoteLineTemplates,
  initialSettings,
}: SettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<SettingsTab>('labour')
  const initiallyLoadedResources = useRef(new Set<SettingsResource>([
    ...(initialAreas !== undefined ? ['areas' as const] : []),
    ...(initialProducts !== undefined ? ['products' as const] : []),
    ...(initialProductServices !== undefined ? ['productServices' as const] : []),
    ...(initialQuoteLineTemplates !== undefined ? ['quoteLineTemplates' as const] : []),
  ]))
  const loadingResourcesRef = useRef(new Set<SettingsResource>())
  const [loadingResources, setLoadingResources] = useState<ReadonlySet<SettingsResource>>(new Set())
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<SettingsResource, string>>>({})
  const [materialQuery, setMaterialQuery] = useState('')
  const [materialPage, setMaterialPage] = useState(1)
  const [materialProducts, setMaterialProducts] = useState(initialProducts ?? [])
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [materialMessage, setMaterialMessage] = useState<string | null>(null)
  const [productServiceQuery, setProductServiceQuery] = useState('')
  const [productServicePage, setProductServicePage] = useState(1)
  const [productServices, setProductServices] = useState(initialProductServices ?? [])
  const [quoteLineTemplates, setQuoteLineTemplates] = useState(initialQuoteLineTemplates ?? [])
  const [editingProductServiceId, setEditingProductServiceId] = useState<string | null>(null)
  const [productServiceMessage, setProductServiceMessage] = useState<string | null>(null)
  const [productServiceImportError, setProductServiceImportError] = useState<string | null>(null)
  const productServiceFileInputRef = useRef<HTMLInputElement>(null)
  const [newProductServiceForm, setNewProductServiceForm] = useState<ProductServiceFormState>({
    name: '',
    description: '',
    category: 'Service',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  })
  const [productServiceEditForm, setProductServiceEditForm] = useState<ProductServiceFormState>({
    name: '',
    description: '',
    category: '',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  })
  const [newMaterialForm, setNewMaterialForm] = useState({
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    unit: '',
    rrpPrice: '',
  })
  const [editForm, setEditForm] = useState({
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    volumeLitres: '',
    unit: '',
    rrpPrice: '',
  })
  const [message, setMessage] = useState<string | null>(null)
  const [materialImportError, setMaterialImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [areaMessage, setAreaMessage] = useState<string | null>(null)
  const [areas, setAreas] = useState(initialAreas ?? [])
  const [areaScope, setAreaScope] = useState<AreaScope>('interior')
  const [areaName, setAreaName] = useState('')
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null)
  const [areaEditForm, setAreaEditForm] = useState<AreaEditFormState>({
    scope: 'interior',
    name: '',
  })
  const [settings, setSettings] = useState({
    f1LabourRate: String(initialSettings.f1LabourRate),
    f2LabourRate: String(initialSettings.f2LabourRate),
    f3LabourRate: String(initialSettings.f3LabourRate),
    f4LabourRate: String(initialSettings.f4LabourRate),
    f5LabourRate: String(initialSettings.f5LabourRate),
    roofLabourRate: String(initialSettings.roofLabourRate),
    f2Margin: toPercent(initialSettings.f2Margin),
    f3Margin: toPercent(initialSettings.f3Margin),
    f4Margin: toPercent(initialSettings.f4Margin),
    f5Margin: toPercent(initialSettings.f5Margin),
  })

  async function loadSettingsResource<T>(
    resource: SettingsResource,
    load: () => Promise<ActionResult<T>>,
    apply: (data: T) => void
  ) {
    if (initiallyLoadedResources.current.has(resource) || loadingResourcesRef.current.has(resource)) return

    loadingResourcesRef.current.add(resource)
    setLoadingResources(new Set(loadingResourcesRef.current))
    setResourceErrors((current) => {
      const next = { ...current }
      delete next[resource]
      return next
    })

    try {
      const result = await load()
      if (!result.ok) {
        setResourceErrors((current) => ({ ...current, [resource]: result.error }))
        return
      }

      apply(result.data)
      initiallyLoadedResources.current.add(resource)
    } catch (error) {
      setResourceErrors((current) => ({ ...current, [resource]: formatSettingsLoadError(error) }))
    } finally {
      loadingResourcesRef.current.delete(resource)
      setLoadingResources(new Set(loadingResourcesRef.current))
    }
  }

  async function ensureTabData(tab: SettingsTab) {
    if (tab === 'material') {
      await loadSettingsResource('products', () => listProducts({ limit: 200 }), setMaterialProducts)
      return
    }
    if (tab === 'productService') {
      await loadSettingsResource('productServices', () => listProductServices({ limit: 300 }), setProductServices)
      return
    }
    if (tab === 'template') {
      await Promise.all([
        loadSettingsResource('quoteLineTemplates', listQuoteLineTemplates, setQuoteLineTemplates),
        loadSettingsResource('productServices', () => listProductServices({ limit: 300 }), setProductServices),
      ])
      return
    }
    if (tab === 'area') {
      await loadSettingsResource('areas', listAreas, setAreas)
    }
  }

  function setField(field: keyof typeof settings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      setMessage(await savePricingSettingsForm(settings))
    })
  }

  function startEdit(product: ProductRecord) {
    setMaterialMessage(null)
    setEditingProductId(product.id)
    setEditForm({
      manufacturer: toFormString(product.manufacturer),
      productLine: toFormString(product.productLine ?? product.type),
      base: toFormString(product.base),
      sheen: toFormString(product.sheen),
      volumeLitres: toFormString(product.volumeLitres),
      unit: toFormString(product.unit),
      rrpPrice: toFormString(product.rrpPrice ?? product.marketPrice),
    })
  }

  function cancelEdit() {
    setEditingProductId(null)
    setEditForm({
      manufacturer: '',
      productLine: '',
      base: '',
      sheen: '',
      volumeLitres: '',
      unit: '',
      rrpPrice: '',
    })
  }

  function resetNewMaterialForm() {
    setNewMaterialForm({
      manufacturer: '',
      productLine: '',
      base: '',
      sheen: '',
      unit: '',
      rrpPrice: '',
    })
  }

  function setNewMaterialField(field: keyof typeof newMaterialForm, value: string) {
    setNewMaterialForm((current) => ({ ...current, [field]: value }))
  }

  function setEditField(field: keyof typeof editForm, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  function addMaterialProduct() {
    setMaterialMessage(null)
    setMaterialImportError(null)
    startTransition(async () => {
      const result = await createProduct({
        manufacturer: trimFormValue(newMaterialForm.manufacturer) || null,
        productLine: trimFormValue(newMaterialForm.productLine),
        base: trimFormValue(newMaterialForm.base) || null,
        sheen: trimFormValue(newMaterialForm.sheen) || null,
        unit: trimFormValue(newMaterialForm.unit) || undefined,
        rrpPrice: optionalNumber(newMaterialForm.rrpPrice),
      })

      if (result.ok) {
        if (!result.data) {
          setMaterialMessage('Failed to add material.')
          return
        }

        setMaterialProducts((current) => [result.data, ...current])
        setMaterialQuery('')
        setMaterialPage(1)
        resetNewMaterialForm()
        setMaterialMessage('Material item added.')
      } else {
        setMaterialMessage(result.error)
      }
    })
  }

  function saveMaterial() {
    if (!editingProductId) return
    setMaterialMessage(null)
    startTransition(async () => {
      const result = await updateProduct(buildMaterialUpdateInput(editingProductId, editForm))

      if (result.ok) {
        if (!result.data) {
          setMaterialMessage('Failed to update material.')
          return
        }

        setMaterialProducts((current) =>
          current.map((item) => (item.id === result.data.id ? result.data : item))
        )
        cancelEdit()
        setMaterialMessage('Material updated.')
      } else {
        setMaterialMessage(result.error)
      }
    })
  }

  function deleteMaterial(productId: string) {
    setMaterialMessage(null)
    startTransition(async () => {
      const result = await deleteProduct({ id: productId })
      if (result.ok) {
        setMaterialProducts((current) => current.filter((product) => product.id !== productId))
        if (editingProductId === productId) cancelEdit()
        setMaterialMessage('Material deleted.')
      } else {
        setMaterialMessage(result.error)
      }
    })
  }

  function resetNewProductServiceForm() {
    setNewProductServiceForm({
      name: '',
      description: '',
      category: 'Service',
      unitPrice: '',
      unitCost: '',
      taxable: true,
    })
  }

  function setNewProductServiceField(field: keyof ProductServiceFormState, value: string | boolean) {
    setNewProductServiceForm((current) => ({ ...current, [field]: value }))
  }

  function setProductServiceEditField(field: keyof ProductServiceFormState, value: string | boolean) {
    setProductServiceEditForm((current) => ({ ...current, [field]: value }))
  }

  function startProductServiceEdit(productService: ProductServiceRecord) {
    setProductServiceMessage(null)
    setEditingProductServiceId(productService.id)
    setProductServiceEditForm({
      name: productService.name,
      description: productService.description ?? '',
      category: productService.category ?? '',
      unitPrice: productService.unitPrice,
      unitCost: productService.unitCost ?? '',
      taxable: productService.taxable,
    })
  }

  function cancelProductServiceEdit() {
    setEditingProductServiceId(null)
    setProductServiceEditForm({
      name: '',
      description: '',
      category: '',
      unitPrice: '',
      unitCost: '',
      taxable: true,
    })
  }

  function addProductService() {
    setProductServiceMessage(null)
    setProductServiceImportError(null)
    startTransition(async () => {
      const result = await createProductService({
        name: trimFormValue(newProductServiceForm.name),
        description: trimFormValue(newProductServiceForm.description) || null,
        category: trimFormValue(newProductServiceForm.category) || null,
        unitPrice: optionalNumber(newProductServiceForm.unitPrice),
        unitCost: optionalNumber(newProductServiceForm.unitCost) ?? null,
        taxable: newProductServiceForm.taxable,
      })

      if (result.ok) {
        setProductServices((current) => [result.data, ...current])
        setProductServiceQuery('')
        setProductServicePage(1)
        resetNewProductServiceForm()
        setProductServiceMessage('Product & Service item added.')
      } else {
        setProductServiceMessage(result.error)
      }
    })
  }

  function saveProductService() {
    if (!editingProductServiceId) return
    setProductServiceMessage(null)
    startTransition(async () => {
      const result = await updateProductService({
        id: editingProductServiceId,
        name: trimFormValue(productServiceEditForm.name),
        description: trimFormValue(productServiceEditForm.description) || null,
        category: trimFormValue(productServiceEditForm.category) || null,
        unitPrice: optionalNumber(productServiceEditForm.unitPrice),
        unitCost: optionalNumber(productServiceEditForm.unitCost) ?? null,
        taxable: productServiceEditForm.taxable,
      })

      if (result.ok) {
        setProductServices((current) => current.map((item) => item.id === result.data.id ? result.data : item))
        cancelProductServiceEdit()
        setProductServiceMessage('Product & Service item updated.')
      } else {
        setProductServiceMessage(result.error)
      }
    })
  }

  function removeProductService(id: string) {
    setProductServiceMessage(null)
    startTransition(async () => {
      const result = await deleteProductService({ id })
      if (result.ok) {
        setProductServices((current) => current.filter((item) => item.id !== id))
        if (editingProductServiceId === id) cancelProductServiceEdit()
        setProductServiceMessage('Product & Service item deleted.')
      } else {
        setProductServiceMessage(result.error)
      }
    })
  }

  function exportMaterials() {
    const csvData = materialProducts.filter((product) => product.active !== false)
    if (csvData.length === 0) {
      setMaterialMessage('No materials to export.')
      return
    }

    const csvText = buildMaterialCsv(csvData)
    downloadTextFile(`materials-${new Date().toISOString().slice(0, 10)}.csv`, csvText)
  }

  function exportProductServices() {
    const csvData = productServices.filter((item) => item.active !== false)
    if (csvData.length === 0) {
      setProductServiceMessage('No Product & Service items to export.')
      return
    }

    downloadTextFile(`product-services-${new Date().toISOString().slice(0, 10)}.csv`, buildProductServiceCsv(csvData))
  }

  function exportMaterialTemplate() {
    downloadTextFile('material-import-template.csv', buildMaterialCsvTemplate())
    setMaterialMessage('Template downloaded.')
  }

  function exportProductServiceTemplate() {
    downloadTextFile('product-service-import-template.csv', buildProductServiceCsvTemplate())
    setProductServiceMessage('Template downloaded.')
  }

  async function importMaterials(file: File | null) {
    if (!file) return
    setMaterialMessage(null)
    setMaterialImportError(null)

    const csvText = await file.text()
    startTransition(async () => {
      const result = await importProductsCSV({ csvText })

      if (result.ok) {
        setMaterialProducts((current) => [...current, ...result.data.products.filter((item) => !current.some((product) => product.id === item.id))])
        setMaterialMessage(`Imported ${result.data.imported} materials.`)
        setMaterialImportError(null)
      } else {
        setMaterialImportError(result.error)
        setMaterialMessage(null)
      }

      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  async function importProductServices(file: File | null) {
    if (!file) return
    setProductServiceMessage(null)
    setProductServiceImportError(null)

    const csvText = await file.text()
    startTransition(async () => {
      const result = await importProductServicesCSV({ csvText })

      if (result.ok) {
        setProductServices((current) => [
          ...result.data.productServices,
          ...current.filter((item) => !result.data.productServices.some((imported) => imported.id === item.id)),
        ])
        setProductServiceMessage(`Imported ${result.data.imported} Product & Service items.`)
        setProductServiceImportError(null)
      } else {
        setProductServiceImportError(result.error)
        setProductServiceMessage(null)
      }

      if (productServiceFileInputRef.current) productServiceFileInputRef.current.value = ''
    })
  }

  function addArea() {
    setAreaMessage(null)
    startTransition(async () => {
      try {
        const result = await createArea({ scope: areaScope, name: areaName })
        if (result.ok) {
          if (!result.data) {
            setAreaMessage('Failed to add area.')
            return
          }

          setAreas((current) => {
            if (current.some((area) => area.id === result.data.id)) return current
            return [...current, result.data]
          })
          setAreaName('')
          setAreaMessage('Area added.')
        } else {
          setAreaMessage(result.error)
        }
      } catch (error) {
        setAreaMessage(formatAreaMutationError('add', error))
      }
    })
  }

  function startAreaEdit(area: AreaRecord) {
    setAreaMessage(null)
    setEditingAreaId(area.id)
    setAreaEditForm({
      scope: area.scope,
      name: area.name,
    })
  }

  function cancelAreaEdit() {
    setEditingAreaId(null)
    setAreaEditForm({
      scope: 'interior',
      name: '',
    })
  }

  function saveArea() {
    if (!editingAreaId) return
    setAreaMessage(null)
    startTransition(async () => {
      try {
        const result = await updateArea({
          id: editingAreaId,
          scope: areaEditForm.scope,
          name: trimFormValue(areaEditForm.name),
        })

        if (result.ok) {
          setAreas((current) => current.map((area) => area.id === result.data.id ? result.data : area))
          cancelAreaEdit()
          setAreaMessage('Area updated.')
        } else {
          setAreaMessage(result.error)
        }
      } catch (error) {
        setAreaMessage(formatAreaMutationError('update', error))
      }
    })
  }

  function removeArea(id: string) {
    setAreaMessage(null)
    startTransition(async () => {
      try {
        const result = await deleteArea({ id })

        if (result.ok) {
          setAreas((current) => current.filter((area) => area.id !== id))
          if (editingAreaId === id) cancelAreaEdit()
          setAreaMessage('Area deleted.')
        } else {
          setAreaMessage(result.error)
        }
      } catch (error) {
        setAreaMessage(formatAreaMutationError('delete', error))
      }
    })
  }

  const filteredProducts = materialProducts.filter((product) => {
    const needle = materialQuery.trim().toLowerCase()
    if (!needle) return true
    return [
      product.manufacturer,
      product.type,
      product.name,
      product.base,
      product.sheen,
      product.unit,
      product.productCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  const filteredProductServices = productServices.filter((item) => {
    const needle = productServiceQuery.trim().toLowerCase()
    if (!needle) return true
    return [
      item.name,
      item.description,
      item.category,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  const safeMaterialPage = getSafePage(materialPage, filteredProducts.length)
  const materialPageStart = (safeMaterialPage - 1) * SETTINGS_TABLE_PAGE_SIZE
  const pagedProducts = filteredProducts.slice(materialPageStart, materialPageStart + SETTINGS_TABLE_PAGE_SIZE)
  const safeProductServicePage = getSafePage(productServicePage, filteredProductServices.length)
  const productServicePageStart = (safeProductServicePage - 1) * SETTINGS_TABLE_PAGE_SIZE
  const pagedProductServices = filteredProductServices.slice(productServicePageStart, productServicePageStart + SETTINGS_TABLE_PAGE_SIZE)

  const tabs: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
    { key: 'labour', label: 'Labour Rates', icon: Icons.dollar({ size: 16 }) },
    { key: 'material', label: 'Material', icon: Icons.palette({ size: 16 }) },
    { key: 'productService', label: 'Product & Service', icon: Icons.template({ size: 16 }) },
    { key: 'template', label: 'Template', icon: Icons.layers({ size: 16 }) },
    { key: 'area', label: 'Area', icon: Icons.pin({ size: 16 }) },
  ]
  const activeResources = SETTINGS_TAB_RESOURCES[activeTab]
  const activeLoadError = activeResources.map((resource) => resourceErrors[resource]).find(Boolean)
  const isActiveTabLoading = activeResources.some((resource) => (
    loadingResources.has(resource) || (
      !initiallyLoadedResources.current.has(resource) && !resourceErrors[resource]
    )
  ))

  return (
    <div className="pbc-settings">
      <div className="pbc-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              void ensureTabData(tab.key)
            }}
            className={`pbc-tab ${activeTab === tab.key ? 'is-on' : ''}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pbc-card">
      {activeLoadError ? (
        <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow" role="alert">
          <p className="pbc-alert pbc-alert--danger">{activeLoadError}</p>
          <button type="button" className="pbc-btn pbc-btn--ghost" onClick={() => void ensureTabData(activeTab)}>
            Retry
          </button>
        </div>
      ) : isActiveTabLoading ? (
        <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow" role="status" aria-live="polite">
          <div className="pbc-skeleton h-5 w-40" />
          <div className="pbc-skeleton mt-4 h-12 w-full" />
          <div className="pbc-skeleton mt-3 h-12 w-full" />
          <span className="sr-only">Loading settings data</span>
        </div>
      ) : activeTab === 'labour' ? (
        <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow">
          <section className="pbc-formgroup">
            <h2 className="pbc-paneltitle">Labour Rates</h2>
            <div className="pbc-rates">
            {[
              ['f1LabourRate', 'F1', 'Labor Rate', '$/day'],
              ['f2LabourRate', 'F2', 'Labor Rate', '$/day'],
              ['f3LabourRate', 'F3', 'Labor Rate', '$/day'],
              ['f4LabourRate', 'F4', 'Labor Rate', '$/day'],
              ['f5LabourRate', 'F5', 'Labor Rate', '$/day'],
              ['roofLabourRate', 'Roof', 'Labor Rate', '$/day'],
            ].map(([field, code, label, sub]) => (
              <label key={field} className="pbc-rate">
                <span className="pbc-rate__code">{code}</span>
                <span className="pbc-rate__name">{label}<br /><i className="pbc-rate__sub">{sub}</i></span>
                <span className="pbc-rate__money">
                  <i>$</i>
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                  />
                </span>
              </label>
            ))}
            </div>
          </section>

          <section className="pbc-formgroup">
            <h2 className="pbc-paneltitle">Margins</h2>
            <div className="pbc-rates">
            {[
              ['f2Margin', 'F2', 'Margin', 'Example: 30 or 0.30. Must be less than 100%.'],
              ['f3Margin', 'F3', 'Margin', 'Example: 30 or 0.30. Must be less than 100%.'],
              ['f4Margin', 'F4', 'Margin', 'Example: 25 or 0.25. Must be less than 100%.'],
              ['f5Margin', 'F5', 'Margin', 'Example: 30 or 0.30. Must be less than 100%.'],
            ].map(([field, code, label, sub]) => (
              <label key={field} className="pbc-rate">
                <span className="pbc-rate__code">{code}</span>
                <span className="pbc-rate__name">{label}<br /><i className="pbc-rate__sub">{sub}</i></span>
                <span className="pbc-rate__money pbc-rate__money--pct">
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                  />
                  <i>%</i>
                </span>
              </label>
            ))}
            </div>
          </section>

          <div className="pbc-savecard__actions mt-6">
            <button type="button" onClick={save} disabled={isPending} className="pbc-btn pbc-btn--primary">
              {isPending ? 'Saving...' : 'Save Settings'}
            </button>
            {message ? <p className="pbc-panelsub">{message}</p> : null}
          </div>
          <p className="pbc-alert pbc-alert--warning mt-4">{Icons.lock({ size: 15 })}<span><b>Snapshot protected.</b> Changes affect future quotes only. Existing quotes preserve their saved settings.</span></p>
        </div>
      ) : activeTab === 'material' ? (
        <div className="pbc-formsection pbc-formsection--center">
          <div className="pbc-panelhead mb-4">
            <div className="pbc-panelhead__copy">
              <h2 className="pbc-paneltitle">Paint Materials</h2>
              <p className="pbc-panelsub">{filteredProducts.length} materials</p>
            </div>
            <div className="pbc-panelhead__actions w-full sm:w-auto">
              <input
                value={materialQuery}
                onChange={(event) => {
                  setMaterialQuery(event.target.value)
                  setMaterialPage(1)
                }}
                className="pbc-input sm:max-w-xs"
                placeholder="Search material..."
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  void importMaterials(event.target.files?.[0] ?? null)
                }}
                className="hidden"
              />
              <div className="pbc-panelhead__actions">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                >
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={exportMaterials}
                  disabled={isPending || materialProducts.filter((product) => product.active !== false).length === 0}
                  className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={exportMaterialTemplate}
                  className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                >
                  CSV Template
                </button>
              </div>
            </div>
          </div>
          <MaterialAddItemForm
            form={newMaterialForm}
            onFieldChange={setNewMaterialField}
            onAdd={addMaterialProduct}
            disabled={isPending}
          />
          <MaterialProductsTable
            products={pagedProducts}
            editingProductId={editingProductId}
            editForm={editForm}
            onEdit={startEdit}
            onCancel={cancelEdit}
            onSave={saveMaterial}
            onDelete={deleteMaterial}
            onFieldChange={setEditField}
            disabled={isPending}
          />
          <SettingsTablePager page={safeMaterialPage} total={filteredProducts.length} onPageChange={setMaterialPage} />
          {materialMessage ? <p className="pbc-alert pbc-alert--success mt-3">{materialMessage}</p> : null}
          {materialImportError ? <p className="pbc-alert pbc-alert--danger mt-3">{materialImportError}</p> : null}
        </div>
      ) : activeTab === 'productService' ? (
        <div className="pbc-formsection pbc-formsection--center">
          <div className="pbc-panelhead mb-4">
            <div className="pbc-panelhead__copy">
              <h2 className="pbc-paneltitle">Product & Service</h2>
              <p className="pbc-panelsub">{filteredProductServices.length} Product & Service items</p>
            </div>
            <div className="pbc-panelhead__actions w-full sm:w-auto">
              <input
                value={productServiceQuery}
                onChange={(event) => {
                  setProductServiceQuery(event.target.value)
                  setProductServicePage(1)
                }}
                className="pbc-input sm:max-w-xs"
                placeholder="Search product or service..."
              />
              <input
                ref={productServiceFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  void importProductServices(event.target.files?.[0] ?? null)
                }}
                className="hidden"
              />
              <div className="pbc-panelhead__actions">
                <button type="button" onClick={() => productServiceFileInputRef.current?.click()} disabled={isPending} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                  Import CSV
                </button>
                <button type="button" onClick={exportProductServices} disabled={isPending || productServices.filter((item) => item.active !== false).length === 0} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                  Export CSV
                </button>
                <button type="button" onClick={exportProductServiceTemplate} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                  CSV Template
                </button>
              </div>
            </div>
          </div>
          <ProductServiceAddItemForm
            form={newProductServiceForm}
            onFieldChange={setNewProductServiceField}
            onAdd={addProductService}
            disabled={isPending}
          />
          <ProductServicesTable
            productServices={pagedProductServices}
            editingProductServiceId={editingProductServiceId}
            editForm={productServiceEditForm}
            onEdit={startProductServiceEdit}
            onCancel={cancelProductServiceEdit}
            onSave={saveProductService}
            onDelete={removeProductService}
            onFieldChange={setProductServiceEditField}
            disabled={isPending}
          />
          <SettingsTablePager page={safeProductServicePage} total={filteredProductServices.length} onPageChange={setProductServicePage} />
          {productServiceMessage ? <p className="pbc-alert pbc-alert--success mt-3">{productServiceMessage}</p> : null}
          {productServiceImportError ? <p className="pbc-alert pbc-alert--danger mt-3">{productServiceImportError}</p> : null}
        </div>
      ) : activeTab === 'template' ? (
        <div className="pbc-formsection pbc-formsection--center">
          <QuoteLineTemplateEditor
            templates={quoteLineTemplates}
            productServices={productServices}
            disabled={isPending}
            onTemplatesChange={setQuoteLineTemplates}
          />
        </div>
      ) : (
        <div className="pbc-formsection pbc-formsection--center">
          <div className="pbc-panelhead mb-4">
            <div className="pbc-panelhead__copy">
              <h2 className="pbc-paneltitle">Areas</h2>
              <p className="pbc-panelsub">Manage reusable interior, exterior, and roof area labels for quote items.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!isPending && areaName.trim()) addArea()
            }}
            className="pbc-formgroup grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
          >
            <label className="pbc-field">
              <span className="pbc-field__label">Scope</span>
              <select value={areaScope} onChange={(event) => setAreaScope(event.target.value as AreaScope)} className="pbc-input">
                {AREA_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>{AREA_SCOPE_LABELS[scope]}</option>
                ))}
              </select>
            </label>
            <label className="pbc-field">
              <span className="pbc-field__label">Area name</span>
              <input value={areaName} onChange={(event) => setAreaName(event.target.value)} className="pbc-input" placeholder="e.g. eaves, fascia" />
            </label>
            <button type="submit" disabled={isPending || !areaName.trim()} className="pbc-btn pbc-btn--primary self-end">
              Add Area
            </button>
          </form>
          {areaMessage ? <p className="pbc-alert pbc-alert--success mt-3">{areaMessage}</p> : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {AREA_SCOPES.map((scope) => (
              <section key={scope}>
                <div className="pbc-panelhead mb-3">
                  <div className="pbc-panelhead__copy">
                    <h3 className="pbc-paneltitle">{AREA_SCOPE_LABELS[scope]}</h3>
                    <p className="pbc-panelsub">{areas.filter((area) => area.scope === scope).length} areas</p>
                  </div>
                </div>
                <div className="pbc-list">
                  {areas.filter((area) => area.scope === scope).length === 0 ? (
                    <p className="pbc-empty">No areas yet.</p>
                  ) : null}
                  {areas
                    .filter((area) => area.scope === scope)
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
                    .map((area) => {
                      const isEditing = editingAreaId === area.id

                      return (
                        <div key={area.id} className={`pbc-listitem pbc-areaitem${isEditing ? ' pbc-areaitem--editing' : ''}`}>
                          {isEditing ? (
                            <div className="pbc-areaedit">
                              <div className="pbc-areaedit__fields">
                                <label className="pbc-field">
                                  <span className="pbc-field__label">Scope</span>
                                  <select
                                    value={areaEditForm.scope}
                                    onChange={(event) => setAreaEditForm((current) => ({ ...current, scope: event.target.value as AreaScope }))}
                                    className="pbc-input"
                                  >
                                    {AREA_SCOPES.map((scopeOption) => (
                                      <option key={scopeOption} value={scopeOption}>{AREA_SCOPE_LABELS[scopeOption]}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="pbc-field">
                                  <span className="pbc-field__label">Area name</span>
                                  <input
                                    value={areaEditForm.name}
                                    onChange={(event) => setAreaEditForm((current) => ({ ...current, name: event.target.value }))}
                                    className="pbc-input"
                                    placeholder="Area name"
                                  />
                                </label>
                              </div>
                              <div className="pbc-areaedit__actions">
                                <button
                                  type="button"
                                  onClick={saveArea}
                                  disabled={isPending || !areaEditForm.name.trim()}
                                  className="pbc-btn pbc-btn--primary pbc-btn--sm"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelAreaEdit}
                                  disabled={isPending}
                                  className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="pbc-listitem__main">
                              <p className="pbc-listitem__title">{area.name}</p>
                              <p className="pbc-listitem__meta">{AREA_SCOPE_LABELS[scope]}</p>
                            </div>
                          )}
                          {!isEditing ? (
                            <div className="pbc-tableactions">
                              <button
                                type="button"
                                onClick={() => startAreaEdit(area)}
                                disabled={isPending}
                                className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                                aria-label={`Edit area ${area.name}`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => removeArea(area.id)}
                                disabled={isPending}
                                className="pbc-btn pbc-btn--danger pbc-btn--sm"
                                aria-label={`Delete area ${area.name}`}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
